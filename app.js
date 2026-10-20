const GAS_API_URL = "https://script.google.com/macros/library/d/1EEL2WWgXqc0YKSzwjkBJotq0u3cZVC0xIxBGIyQe626S1CB90SiBqKQj/10";

let recordData = [];

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
  fetchRecords();
});

// 計算目前 4 期付款累積總額
function getSumInstallmentsFromForm() {
  const i1 = Number(document.getElementById("inst1")?.value || 0);
  const i2 = Number(document.getElementById("inst2")?.value || 0);
  const i3 = Number(document.getElementById("inst3")?.value || 0);
  const i4 = Number(document.getElementById("inst4")?.value || 0);
  return i1 + i2 + i3 + i4;
}

// 自動連動：根據各期累加金額與 Total Amount 自動切換 Paid Status
function autoUpdatePaidStatus() {
  const qty = Number(document.getElementById("qty")?.value || 1);
  const unitPrice = Number(document.getElementById("unitPrice")?.value || 0);
  const totalAmount = qty * unitPrice;
  
  const paidStatusSelect = document.getElementById("paidStatus");
  if (!paidStatusSelect) return;

  const sumPaid = getSumInstallmentsFromForm();

  if (totalAmount > 0 && sumPaid >= totalAmount) {
    paidStatusSelect.value = "Paid";
  } else if (sumPaid > 0 && sumPaid < totalAmount) {
    paidStatusSelect.value = "Partial";
  } else if (sumPaid === 0 && paidStatusSelect.value === "Partial") {
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

// 計算累加已付與 AR 亮燈狀態
function getRecordPaidAndAR(row, totalAmount) {
  // 相容舊資料 partialPaidAmount 或 4 期金額
  const i1 = Number(row.inst1 || row.partialPaidAmount || 0);
  const i2 = Number(row.inst2 || 0);
  const i3 = Number(row.inst3 || 0);
  const i4 = Number(row.inst4 || 0);
  const sumPaid = i1 + i2 + i3 + i4;

  let displayPaidStatus = row.paidStatus || 'Pending';
  if (totalAmount > 0 && sumPaid >= totalAmount) {
    displayPaidStatus = "Paid";
  } else if (sumPaid > 0 && sumPaid < totalAmount && displayPaidStatus !== "Paid") {
    displayPaidStatus = "Partial";
  }

  let arHtml = "";
  if (displayPaidStatus === "Paid" || (totalAmount > 0 && sumPaid >= totalAmount)) {
    arHtml = `<span class="badge badge-paid">✅ Cleared</span>`;
  } else if (displayPaidStatus === "Partial" || (sumPaid > 0 && sumPaid < totalAmount)) {
    const ar = Math.max(0, totalAmount - sumPaid);
    arHtml = `<span class="badge" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba;">⚠️ AR: $${ar.toLocaleString()}</span>`;
  } else {
    arHtml = `<span class="badge" style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;">🔴 Unpaid: $${totalAmount.toLocaleString()}</span>`;
  }

  return { i1, i2, i3, i4, sumPaid, displayPaidStatus, arHtml };
}

// 渲染明細表格
function renderTable() {
  const tbody = document.getElementById("records");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!recordData || recordData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="20" style="text-align:center;">No records found.</td></tr>';
    return;
  }

  recordData.forEach(row => {
    const tr = document.createElement("tr");
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.unitPrice || 0);
    const total = qty * unitPrice;
    
    const pInfo = getRecordPaidAndAR(row, total);

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
      <td>$${pInfo.i1.toLocaleString()}</td>
      <td>$${pInfo.i2.toLocaleString()}</td>
      <td>$${pInfo.i3.toLocaleString()}</td>
      <td>$${pInfo.i4.toLocaleString()}</td>
      <td><strong>$${pInfo.sumPaid.toLocaleString()}</strong></td>
      <td><span class="badge ${getPaidBadgeClass(pInfo.displayPaidStatus)}">${pInfo.displayPaidStatus}</span></td>
      <td>${pInfo.arHtml}</td>
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
    const pInfo = getRecordPaidAndAR(row, totalAmount);

    customerStats[customer].total += totalAmount;

    if (pInfo.displayPaidStatus === "Paid") {
      customerStats[customer].paid += totalAmount;
    } else if (pInfo.displayPaidStatus === "Partial") {
      customerStats[customer].paid += pInfo.sumPaid;
      customerStats[customer].pending += Math.max(0, totalAmount - pInfo.sumPaid);
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

// 點擊 Edit 帶入舊資料
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
  
  document.getElementById("inst1").value = target.inst1 !== undefined ? target.inst1 : (target.partialPaidAmount || 0);
  document.getElementById("inst2").value = target.inst2 !== undefined ? target.inst2 : 0;
  document.getElementById("inst3").value = target.inst3 !== undefined ? target.inst3 : 0;
  document.getElementById("inst4").value = target.inst4 !== undefined ? target.inst4 : 0;

  const total = Number(target.qty || 0) * Number(target.unitPrice || 0);
  const pInfo = getRecordPaidAndAR(target, total);

  document.getElementById("paidStatus").value = pInfo.displayPaidStatus;
  document.getElementById("status").value = target.status || "Open";
  document.getElementById("owner").value = target.owner || "";

  const submitBtn = document.getElementById("submitBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  if (submitBtn) submitBtn.innerText = "Update Record";
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 重置表單
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
  document.getElementById("inst1").value = "0";
  document.getElementById("inst2").value = "0";
  document.getElementById("inst3").value = "0";
  document.getElementById("inst4").value = "0";
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

  const qty = Number(document.getElementById("qty").value || 1);
  const unitPrice = Number(document.getElementById("unitPrice").value || 0);
  const totalAmount = qty * unitPrice;
  
  const inst1 = Number(document.getElementById("inst1").value || 0);
  const inst2 = Number(document.getElementById("inst2").value || 0);
  const inst3 = Number(document.getElementById("inst3").value || 0);
  const inst4 = Number(document.getElementById("inst4").value || 0);
  const sumPaid = inst1 + inst2 + inst3 + inst4;

  let paidStatusVal = document.getElementById("paidStatus").value;

  if (totalAmount > 0 && sumPaid >= totalAmount) {
    paidStatusVal = "Paid";
  } else if (sumPaid > 0 && sumPaid < totalAmount) {
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
    qty: qty,
    unitPrice: unitPrice,
    inst1: inst1,
    inst2: inst2,
    inst3: inst3,
    inst4: inst4,
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
    const pInfo = getRecordPaidAndAR(item, total);

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
      "1st Inst (第 1 期)": pInfo.i1,
      "2nd Inst (第 2 期)": pInfo.i2,
      "3rd Inst (第 3 期)": pInfo.i3,
      "4th Inst (第 4 期)": pInfo.i4,
      "Total Paid (已付總額)": pInfo.sumPaid,
      "Paid Status (付款狀態)": pInfo.displayPaidStatus,
      "Pending AR (未收應收金額)": Math.max(0, total - pInfo.sumPaid),
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
    const pInfo = getRecordPaidAndAR(row, total);
    const category = String(row.category || '').trim();

    if (pInfo.displayPaidStatus === "Paid") {
      totalRevenue += total;
    } else if (pInfo.displayPaidStatus === "Partial") {
      totalRevenue += pInfo.sumPaid;
      pendingAR += Math.max(0, total - pInfo.sumPaid);
    } else {
      pendingAR += total;
    }

    const isProjectOrUpgrade = (category === "Project" || category === "Upgrade");
    const isPaidOrPartial = (pInfo.displayPaidStatus === "Paid" || pInfo.displayPaidStatus === "Partial");

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