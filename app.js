const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxjsufTylsyqsMOzupGl3pxq-XEzn810KKDAiKTEiadlg-DmimSn_nT4ZxJaU8YZaEtlw/exec";

let recordData = [];

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
  fetchRecords();
});

// 當 Partial Paid Amount 填入數字時自動切換 Paid Status 為 Partial
function autoUpdatePaidStatus() {
  const partialAmountInput = document.getElementById("partialPaidAmount");
  const paidStatusSelect = document.getElementById("paidStatus");
  if (!partialAmountInput || !paidStatusSelect) return;

  const val = Number(partialAmountInput.value || 0);
  if (val > 0) {
    paidStatusSelect.value = "Partial";
  } else if (paidStatusSelect.value === "Partial") {
    paidStatusSelect.value = "Pending";
  }
}

// 撈取 Google Sheets 所有紀錄
async function fetchRecords() {
  try {
    const response = await fetch(GAS_API_URL);
    recordData = await response.json();
    renderTable();
    updateDashboard();
    setupYearFilter();
    renderAnnualSummary();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// 計算 AR 狀態與警示亮燈標籤
function getARAlertInfo(row, totalAmount) {
  const paidStatus = String(row.paidStatus || 'Pending').trim();
  const partialPaid = Number(row.partialPaidAmount || 0);

  if (paidStatus === "Paid") {
    return { ar: 0, html: `<span class="badge badge-paid">✅ Cleared</span>` };
  } else if (paidStatus === "Partial") {
    const ar = Math.max(0, totalAmount - partialPaid);
    return { ar: ar, html: `<span class="badge" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;">⚠️ AR: $${ar.toLocaleString()}</span>` };
  } else {
    return { ar: totalAmount, html: `<span class="badge" style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;">🔴 Unpaid: $${totalAmount.toLocaleString()}</span>` };
  }
}

// 渲染明細表格
function renderTable() {
  const tbody = document.getElementById("records");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!recordData || recordData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;">No records found.</td></tr>';
    return;
  }

  recordData.forEach(row => {
    const tr = document.createElement("tr");
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.unitPrice || 0);
    const total = qty * unitPrice;
    const partialPaid = Number(row.partialPaidAmount || 0);
    const arInfo = getARAlertInfo(row, total);

    tr.innerHTML = `
      <td>${row.date || ''}</td>
      <td>${row.statusText || ''}</td>
      <td>${row.customer || ''}</td>
      <td>${row.site || ''}</td>
      <td>${row.prNo || ''}</td>
      <td>${row.poNo || ''}</td>
      <td>${row.invoiceNo || ''}</td>
      <td>${row.category || ''}</td>
      <td>${row.description || ''}</td>
      <td>$${total.toLocaleString()}</td>
      <td>$${partialPaid.toLocaleString()}</td>
      <td><span class="badge ${getPaidBadgeClass(row.paidStatus)}">${row.paidStatus || 'Pending'}</span></td>
      <td>${arInfo.html}</td>
      <td>${row.status || 'Open'}</td>
      <td>${row.owner || ''}</td>
      <td>
        <div class="action-btns">
          <button class="edit-btn" onclick="editRecord('${row.id}')">Edit</button>
          <button class="del-btn" onclick="deleteRecord('${row.id}')">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 解析年份
function getYearFromRecord(dateVal) {
  if (!dateVal) return new Date().getFullYear();
  const str = String(dateVal).trim();
  const match = str.match(/^(\d{4})/);
  if (match) return Number(match[1]);
  const y = new Date(str).getFullYear();
  return isNaN(y) ? new Date().getFullYear() : y;
}

// 動態建立年份選單
function setupYearFilter() {
  const yearSelect = document.getElementById("yearFilter");
  if (!yearSelect) return;

  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  recordData.forEach(row => {
    if (row.date) {
      const y = getYearFromRecord(row.date);
      if (y) years.add(y);
    }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  yearSelect.innerHTML = "";
  sortedYears.forEach(year => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year + " 年";
    yearSelect.appendChild(option);
  });

  yearSelect.value = sortedYears[0];
}

// 渲染年度客戶收入統計
function renderAnnualSummary() {
  const tbody = document.getElementById("annualSummary");
  const yearSelect = document.getElementById("yearFilter");
  if (!tbody || !yearSelect) return;

  const selectedYear = Number(yearSelect.value) || new Date().getFullYear();
  tbody.innerHTML = "";

  const customerStats = {};

  recordData.forEach(row => {
    const rowYear = getYearFromRecord(row.date);
    if (rowYear !== selectedYear) return;

    const customer = row.customer || "Unassigned";
    if (!customerStats[customer]) {
      customerStats[customer] = { paid: 0, pending: 0, total: 0 };
    }

    const totalAmount = Number(row.qty || 0) * Number(row.unitPrice || 0);
    const partialPaid = Number(row.partialPaidAmount || 0);
    const paidStatus = String(row.paidStatus || 'Pending').trim();

    customerStats[customer].total += totalAmount;

    if (paidStatus === "Paid") {
      customerStats[customer].paid += totalAmount;
    } else if (paidStatus === "Partial") {
      customerStats[customer].paid += partialPaid;
      customerStats[customer].pending += Math.max(0, totalAmount - partialPaid);
    } else {
      customerStats[customer].pending += totalAmount;
    }
  });

  const customers = Object.keys(customerStats);
  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">${selectedYear} 年無紀錄</td></tr>`;
    return;
  }

  customers.forEach(cust => {
    const stat = customerStats[cust];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${cust}</strong></td>
      <td style="color: #27ae60; font-weight: bold;">$${stat.paid.toLocaleString()}</td>
      <td style="color: #e67e22; font-weight: bold;">$${stat.pending.toLocaleString()}</td>
      <td><strong>$${stat.total.toLocaleString()}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// 點擊 Edit 帶入舊資料（正確綁定所有 ID 與選單）
function editRecord(id) {
  const target = recordData.find(item => String(item.id).trim() === String(id).trim());
  if (!target) return;

  document.getElementById("recordId").value = target.id || "";
  document.getElementById("date").value = target.date || "";
  document.getElementById("statusText").value = target.statusText || "";
  document.getElementById("customer").value = target.customer || "";
  document.getElementById("site").value = target.site || "";
  document.getElementById("prNo").value = target.prNo || "";
  document.getElementById("poNo").value = target.poNo || "";
  document.getElementById("invoiceNo").value = target.invoiceNo || "";
  document.getElementById("category").value = target.category || "";
  document.getElementById("description").value = target.description || "";
  document.getElementById("qty").value = target.qty !== undefined ? target.qty : 1;
  document.getElementById("unitPrice").value = target.unitPrice !== undefined ? target.unitPrice : 0;
  document.getElementById("partialPaidAmount").value = target.partialPaidAmount !== undefined ? target.partialPaidAmount : 0;
  
  document.getElementById("paidStatus").value = target.paidStatus || "Pending";
  document.getElementById("status").value = target.status || "Open";
  document.getElementById("owner").value = target.owner || "";

  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  if (submitBtn) submitBtn.innerText = "Update Record";
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 清空/重置表單
function resetForm() {
  document.getElementById("recordId").value = "";
  document.getElementById("date").valueAsDate = new Date();
  document.getElementById("statusText").value = "";
  document.getElementById("customer").value = "";
  document.getElementById("site").value = "";
  document.getElementById("prNo").value = "";
  document.getElementById("poNo").value = "";
  document.getElementById("invoiceNo").value = "";
  document.getElementById("category").value = "";
  document.getElementById("description").value = "";
  document.getElementById("qty").value = "1";
  document.getElementById("unitPrice").value = "0";
  document.getElementById("partialPaidAmount").value = "0";
  document.getElementById("paidStatus").value = "Pending";
  document.getElementById("status").value = "Open";
  document.getElementById("owner").value = "";

  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  if (submitBtn) submitBtn.innerText = "Save Record";
  if (cancelBtn) cancelBtn.style.display = "none";
}

// 新增或更新資料
async function saveRecord() {
  const submitBtn = document.getElementById("submitBtn");
  const recordId = document.getElementById("recordId").value;
  
  const customerVal = document.getElementById("customer").value;
  if (!customerVal) {
    alert("Please select a Customer!");
    return;
  }

  const partialAmount = Number(document.getElementById("partialPaidAmount").value || 0);
  let paidStatusVal = document.getElementById("paidStatus").value;
  if (partialAmount > 0 && paidStatusVal !== "Paid") {
    paidStatusVal = "Partial";
  }

  const payload = {
    action: recordId ? "update" : "create",
    id: recordId,
    date: document.getElementById("date").value,
    statusText: document.getElementById("statusText").value,
    customer: customerVal,
    site: document.getElementById("site").value,
    prNo: document.getElementById("prNo").value,
    poNo: document.getElementById("poNo").value,
    invoiceNo: document.getElementById("invoiceNo").value,
    category: document.getElementById("category").value,
    description: document.getElementById("description").value,
    qty: Number(document.getElementById("qty").value || 1),
    unitPrice: Number(document.getElementById("unitPrice").value || 0),
    partialPaidAmount: partialAmount,
    paidStatus: paidStatusVal,
    status: document.getElementById("status").value,
    owner: document.getElementById("owner").value
  };

  submitBtn.disabled = true;
  submitBtn.innerText = recordId ? "Updating..." : "Saving...";

  try {
    await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    resetForm();
    await fetchRecords();
  } catch (error) {
    console.error("Error saving record:", error);
    alert("儲存失敗，請重試！");
  } finally {
    submitBtn.disabled = false;
  }
}

// 刪除紀錄
async function deleteRecord(id) {
  if (!confirm("Are you sure you want to delete this record?")) return;

  try {
    await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "delete", id: id })
    });
    await fetchRecords();
  } catch (error) {
    console.error("Error deleting record:", error);
    alert("刪除失敗！");
  }
}

// 匯出 Excel
function exportToExcel() {
  if (!recordData || recordData.length === 0) {
    alert("目前沒有可匯出的紀錄！");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Excel 元件載入中，請重新整理頁面後再試！");
    return;
  }

  const exportList = recordData.map(item => {
    const total = (Number(item.qty || 0) * Number(item.unitPrice || 0));
    const partial = Number(item.partialPaidAmount || 0);
    const paidStatus = String(item.paidStatus || 'Pending').trim();
    let arAmount = total;
    if (paidStatus === 'Paid') arAmount = 0;
    else if (paidStatus === 'Partial') arAmount = Math.max(0, total - partial);

    return {
      "Date (日期)": item.date || "",
      "Status (進度狀態)": item.statusText || "",
      "Customer (客戶)": item.customer || "",
      "Site/Fab (廠別)": item.site || "",
      "PR No (請購單號)": item.prNo || "",
      "PO No (採購單號)": item.poNo || "",
      "Invoice No (發票號碼)": item.invoiceNo || "",
      "Category (類別)": item.category || "",
      "Description (項目說明)": item.description || "",
      "Qty (數量)": item.qty || 1,
      "Unit Price (單價)": item.unitPrice || 0,
      "Total Amount (總金額)": total,
      "Partial Paid Amount (已部分付款)": partial,
      "Paid Status (付款狀態)": paidStatus,
      "Pending AR (未收應收金額)": arAmount,
      "Project Status (專案狀態)": item.status || "Open",
      "Owner (負責人)": item.owner || ""
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportList);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue & AR");

  const fileName = `PTW_Revenue_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// 更新頂部 Dashboard KPI
function updateDashboard() {
  let totalRevenue = 0;
  let pendingAR = 0;
  let activeProjects = 0;

  recordData.forEach(row => {
    const total = Number(row.qty || 0) * Number(row.unitPrice || 0);
    const partialPaid = Number(row.partialPaidAmount || 0);
    const paidStatus = String(row.paidStatus || 'Pending').trim();
    const category = String(row.category || '').trim();

    if (paidStatus === "Paid") {
      totalRevenue += total;
    } else if (paidStatus === "Partial") {
      totalRevenue += partialPaid;
      pendingAR += Math.max(0, total - partialPaid);
    } else {
      pendingAR += total;
    }

    const isProjectOrUpgrade = (category === "Project" || category === "Upgrade");
    const isPaidOrPartial = (paidStatus === "Paid" || paidStatus === "Partial");

    if (isProjectOrUpgrade && isPaidOrPartial) {
      activeProjects++;
    }
  });

  document.getElementById("revenue").innerText = `$${totalRevenue.toLocaleString()}`;
  document.getElementById("pending").innerText = `$${pendingAR.toLocaleString()}`;
  document.getElementById("projects").innerText = activeProjects;
}

function getPaidBadgeClass(status) {
  if (status === "Paid") return "badge-paid";
  if (status === "Partial") return "badge-partial";
  return "badge-pending";
}