const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwz1miLmzidcudzOJDXqhquZs69EoJfBLX5M_IZFU4uLrHp9ATCv4l_SRYOl4p_H6LI1g/exec";

let recordData = [];

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
  fetchRecords();
});

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

// 渲染明細表格
function renderTable() {
  const tbody = document.getElementById("records");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!recordData || recordData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No records found.</td></tr>';
    return;
  }

  recordData.forEach(row => {
    const tr = document.createElement("tr");
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.unitPrice || 0);
    const total = qty * unitPrice;

    tr.innerHTML = `
      <td>${row.date || ''}</td>
      <td>${row.customer || ''}</td>
      <td>${row.prNo || ''}</td>
      <td>${row.poNo || ''}</td>
      <td>${row.invoiceNo || ''}</td>
      <td>${row.category || ''}</td>
      <td>${row.description || ''}</td>
      <td>$${total.toLocaleString()}</td>
      <td><span class="badge ${getPaidBadgeClass(row.paidStatus)}">${row.paidStatus || 'Pending'}</span></td>
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

// 通用年份解析函式（解決各瀏覽器日期解析相容問題）
function parseYearFromDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  // 先嘗試正規表示式匹配 yyyy-mm-dd
  const match = str.match(/^(\d{4})/);
  if (match) {
    return Number(match[1]);
  }
  const d = new Date(str);
  const y = d.getFullYear();
  return isNaN(y) ? null : y;
}

// 動態建立年份下拉選單
function setupYearFilter() {
  const yearSelect = document.getElementById("yearFilter");
  if (!yearSelect) return;

  const currentSelected = yearSelect.value;
  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  recordData.forEach(row => {
    const year = parseYearFromDate(row.date);
    if (year) years.add(year);
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  yearSelect.innerHTML = "";
  sortedYears.forEach(year => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year + " 年";
    yearSelect.appendChild(option);
  });

  if (currentSelected && sortedYears.includes(Number(currentSelected))) {
    yearSelect.value = currentSelected;
  } else if (sortedYears.length > 0) {
    yearSelect.value = sortedYears[0];
  }
}

// 渲染「每年各客戶收入統計表」
function renderAnnualSummary() {
  const tbody = document.getElementById("annualSummary");
  const yearSelect = document.getElementById("yearFilter");
  if (!tbody || !yearSelect) return;

  const selectedYear = Number(yearSelect.value);
  tbody.innerHTML = "";

  const customerStats = {};

  recordData.forEach(row => {
    const rowYear = parseYearFromDate(row.date);
    if (rowYear !== selectedYear) return;

    const customer = row.customer || "Unassigned";
    if (!customerStats[customer]) {
      customerStats[customer] = { paid: 0, pending: 0, total: 0 };
    }

    const totalAmount = Number(row.qty || 0) * Number(row.unitPrice || 0);
    customerStats[customer].total += totalAmount;

    if (row.paidStatus === "Paid") {
      customerStats[customer].paid += totalAmount;
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

// 匯出 Excel 功能
function exportToExcel() {
  if (!recordData || recordData.length === 0) {
    alert("目前沒有可匯出的紀錄！");
    return;
  }

  if (typeof XLSX === "undefined") {
    alert("Excel 匯出元件載入中，請稍後再試或重新整理頁面！");
    return;
  }

  const exportList = recordData.map(item => ({
    "Date (日期)": item.date || "",
    "Customer (客戶)": item.customer || "",
    "PR No (請購單號)": item.prNo || "",
    "PO No (採購單號)": item.poNo || "",
    "Invoice No (發票號碼)": item.invoiceNo || "",
    "Category (類別)": item.category || "",
    "Description (項目說明)": item.description || "",
    "Qty (數量)": item.qty || 1,
    "Unit Price (單價)": item.unitPrice || 0,
    "Total Amount (總金額)": (Number(item.qty || 0) * Number(item.unitPrice || 0)),
    "Paid Status (付款狀態)": item.paidStatus || "Pending",
    "Project Status (專案狀態)": item.status || "Open",
    "Owner (負責人)": item.owner || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportList);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue & AR");

  const fileName = `PTW_Revenue_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// 點擊 Edit 帶入舊資料
function editRecord(id) {
  const target = recordData.find(item => String(item.id) === String(id));
  if (!target) return;

  document.getElementById("recordId").value = target.id || "";
  document.getElementById("date").value = target.date || "";
  document.getElementById("customer").value = target.customer || "";
  document.getElementById("prNo").value = target.prNo || "";
  document.getElementById("poNo").value = target.poNo || "";
  document.getElementById("invoiceNo").value = target.invoiceNo || "";
  document.getElementById("category").value = target.category || "";
  document.getElementById("description").value = target.description || "";
  document.getElementById("qty").value = target.qty !== undefined ? target.qty : 1;
  document.getElementById("unitPrice").value = target.unitPrice !== undefined ? target.unitPrice : 0;
  document.getElementById("paidStatus").value = target.paidStatus || "Pending";
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
  document.getElementById("customer").value = "";
  document.getElementById("prNo").value = "";
  document.getElementById("poNo").value = "";
  document.getElementById("invoiceNo").value = "";
  document.getElementById("category").value = "";
  document.getElementById("description").value = "";
  document.getElementById("qty").value = "1";
  document.getElementById("unitPrice").value = "0";
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

  const payload = {
    action: recordId ? "update" : "create",
    id: recordId,
    date: document.getElementById("date").value,
    customer: customerVal,
    prNo: document.getElementById("prNo").value,
    poNo: document.getElementById("poNo").value,
    invoiceNo: document.getElementById("invoiceNo").value,
    category: document.getElementById("category").value,
    description: document.getElementById("description").value,
    qty: Number(document.getElementById("qty").value || 1),
    unitPrice: Number(document.getElementById("unitPrice").value || 0),
    paidStatus: document.getElementById("paidStatus").value,
    status: document.getElementById("status").value,
    owner: document.getElementById("owner").value
  };

  submitBtn.disabled = true;
  submitBtn.innerText = "Saving...";

  try {
    await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    resetForm();
    await fetchRecords();
  } catch (error) {
    console.error("Error saving record:", error);
    alert("儲存失敗！");
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

// 更新頂部 Dashboard KPI
function updateDashboard() {
  let totalRevenue = 0;
  let pendingAR = 0;
  let activeProjects = 0;

  recordData.forEach(row => {
    const total = Number(row.qty || 0) * Number(row.unitPrice || 0);
    if (row.paidStatus === "Paid") totalRevenue += total;
    else if (row.paidStatus === "Pending") pendingAR += total;

    if (row.status === "Open" || row.status === "In Progress") activeProjects++;
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