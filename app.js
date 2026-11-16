// ⚠️ 請將下方引號內替換為你現在運作正常的 Apps Script /exec 網址
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwGt8haW2-v1Au7sjkROJaS7pgOzShcCVx2nN3oQFsWxIZ7WkKnx5lTEBw4D085N5UcjA/exec";

let recordData = [];
let activeCardFilter = null;

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("date");
  if (dateInput && !dateInput.value) {
    dateInput.valueAsDate = new Date();
  }
  fetchRecords();
});

// 彈出視窗控制：開啟新增視窗
function openAddModal() {
  resetForm();
  document.getElementById("modalTitle").innerText = "➕ Add New Record (新增紀錄)";
  document.getElementById("submitBtn").innerText = "Save Record (儲存)";
  document.getElementById("recordModal").classList.add("show");
}

// 彈出視窗控制：關閉視窗
function closeModal() {
  document.getElementById("recordModal").classList.remove("show");
  resetForm();
}

// 點擊黑色半透明背景時自動關閉視窗
function closeModalOnBackdrop(event) {
  if (event.target.id === "recordModal") {
    closeModal();
  }
}

// 格式化美金顯示
function formatUSD(amount) {
  return "$" + Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// 計算 4 期付款累積總額
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
    if (!response.ok) throw new Error("Network response was not ok");
    recordData = await response.json();
    
    setupFiltersAndDropdowns();
    renderTable();
    updateDashboard();
    renderAnnualSummary();
  } catch (error) {
    console.error("Error fetching data:", error);
    const tbody = document.getElementById("records");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="20" style="text-align:center; color:red;">連線失敗，請檢查 API 網址與 Apps Script 權限！</td></tr>';
    }
  }
}

// 核心商業邏輯：計算已付、Pending AR（排除 Project Status === 'Open' 或 'Cancelled'）與亮燈標籤
function getRecordFinancials(row) {
  const qty = Number(row.qty || 0);
  const unitPrice = Number(row.unitPrice || 0);
  const totalAmount = qty * unitPrice;

  const i1 = Number(row.inst1 !== undefined ? row.inst1 : (row.partialPaidAmount || 0));
  const i2 = Number(row.inst2 || 0);
  const i3 = Number(row.inst3 || 0);
  const i4 = Number(row.inst4 || 0);
  const sumPaid = i1 + i2 + i3 + i4;

  const projectStatus = String(row.status || 'Open').trim();
  const category = String(row.category || '').trim();

  let displayPaidStatus = String(row.paidStatus || 'Pending').trim();
  if (totalAmount > 0 && sumPaid >= totalAmount) {
    displayPaidStatus = "Paid";
  } else if (sumPaid > 0 && sumPaid < totalAmount && displayPaidStatus !== "Paid") {
    displayPaidStatus = "Partial";
  }

  let paidRevenue = 0;
  if (displayPaidStatus === "Paid") {
    paidRevenue = totalAmount;
  } else if (displayPaidStatus === "Partial") {
    paidRevenue = sumPaid;
  }

  // Project Status 為 Open 或 Cancelled 時，不計入 Pending AR
  const isExcludedFromAR = (projectStatus === "Open" || projectStatus === "Cancelled");
  let pendingAR = 0;
  if (!isExcludedFromAR && displayPaidStatus !== "Paid") {
    pendingAR = Math.max(0, totalAmount - paidRevenue);
  }

  const isActiveProject = (category === "Project" || category === "Upgrade") &&
                          (displayPaidStatus === "Paid" || displayPaidStatus === "Partial");

  let arHtml = "";
  if (displayPaidStatus === "Paid" || (totalAmount > 0 && sumPaid >= totalAmount)) {
    arHtml = `<span class="badge badge-paid">✅ Cleared</span>`;
  } else if (projectStatus === "Open") {
    arHtml = `<span class="badge badge-neutral">⚪ Open (Not in AR)</span>`;
  } else if (projectStatus === "Cancelled") {
    arHtml = `<span class="badge badge-neutral">🚫 Cancelled</span>`;
  } else if (displayPaidStatus === "Partial" || sumPaid > 0) {
    arHtml = `<span class="badge" style="background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a;">⚠️ AR: ${formatUSD(pendingAR)}</span>`;
  } else {
    arHtml = `<span class="badge" style="background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca;">🔴 Unpaid: ${formatUSD(pendingAR)}</span>`;
  }

  return {
    totalAmount,
    i1, i2, i3, i4,
    sumPaid,
    paidRevenue,
    pendingAR,
    displayPaidStatus,
    projectStatus,
    isActiveProject,
    arHtml
  };
}

// 點擊 Dashboard 卡片切換篩選
function toggleDashboardFilter(filterType) {
  if (activeCardFilter === filterType) {
    activeCardFilter = null;
  } else {
    activeCardFilter = filterType;
  }

  document.getElementById("card-revenue")?.classList.toggle("active-filter", activeCardFilter === "revenue");
  document.getElementById("card-pending")?.classList.toggle("active-filter", activeCardFilter === "pending");
  document.getElementById("card-projects")?.classList.toggle("active-filter", activeCardFilter === "projects");

  renderTable();
}

// 清除所有篩選條件
function clearAllFilters() {
  activeCardFilter = null;
  document.getElementById("card-revenue")?.classList.remove("active-filter");
  document.getElementById("card-pending")?.classList.remove("active-filter");
  document.getElementById("card-projects")?.classList.remove("active-filter");

  const yearSel = document.getElementById("searchYear");
  const custSel = document.getElementById("searchCustomer");
  const kwInput = document.getElementById("searchKeyword");
  if (yearSel) yearSel.value = "ALL";
  if (custSel) custSel.value = "ALL";
  if (kwInput) kwInput.value = "";

  renderTable();
}

// 渲染明細表格
function renderTable() {
  const tbody = document.getElementById("records");
  if (!tbody) return;
  tbody.innerHTML = "";

  const selectedYear = document.getElementById("searchYear")?.value || "ALL";
  const selectedCustomer = document.getElementById("searchCustomer")?.value || "ALL";
  const keyword = (document.getElementById("searchKeyword")?.value || "").trim().toLowerCase();

  const filteredData = recordData.filter(row => {
    const fin = getRecordFinancials(row);

    if (activeCardFilter === "revenue" && fin.paidRevenue <= 0) return false;
    if (activeCardFilter === "pending" && fin.pendingAR <= 0) return false;
    if (activeCardFilter === "projects" && !fin.isActiveProject) return false;

    if (selectedYear !== "ALL") {
      const rowYear = String(getYearFromRecord(row.date));
      if (rowYear !== selectedYear) return false;
    }

    if (selectedCustomer !== "ALL") {
      if (String(row.customer || "").trim() !== selectedCustomer) return false;
    }

    if (keyword) {
      const searchableText = [
        row.date, row.statusText, row.customer, row.site,
        row.prNo, row.poNo, row.invoiceNo, row.category,
        row.description, row.status, row.owner
      ].join(" ").toLowerCase();
      if (!searchableText.includes(keyword)) return false;
    }

    return true;
  });

  const countBadge = document.getElementById("recordCountBadge");
  if (countBadge) countBadge.innerText = `顯示 ${filteredData.length} / ${recordData.length} 筆紀錄`;

  if (filteredData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="20" style="text-align:center; padding: 24px; color: #64748b;">找不到符合條件的紀錄</td></tr>';
    return;
  }

  filteredData.forEach(row => {
    const tr = document.createElement("tr");
    const fin = getRecordFinancials(row);

    tr.innerHTML = `
      <td>${row.date || ''}</td>
      <td>${row.statusText || ''}</td>
      <td><strong>${row.customer || ''}</strong></td>
      <td>${row.site || ''}</td>
      <td>${row.prNo || ''}</td>
      <td>${row.poNo || ''}</td>
      <td>${row.invoiceNo || ''}</td>
      <td>${row.category || ''}</td>
      <td>${row.description || ''}</td>
      <td><strong>${formatUSD(fin.totalAmount)}</strong></td>
      <td>${formatUSD(fin.i1)}</td>
      <td>${formatUSD(fin.i2)}</td>
      <td>${formatUSD(fin.i3)}</td>
      <td>${formatUSD(fin.i4)}</td>
      <td><strong>${formatUSD(fin.sumPaid)}</strong></td>
      <td><span class="badge ${getPaidBadgeClass(fin.displayPaidStatus)}">${fin.displayPaidStatus}</span></td>
      <td>${fin.arHtml}</td>
      <td>${fin.projectStatus}</td>
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

// 初始化年份與客戶篩選下拉選單
function setupFiltersAndDropdowns() {
  const years = new Set([new Date().getFullYear()]);
  const customers = new Set();

  recordData.forEach(row => {
    if (row.date) years.add(getYearFromRecord(row.date));
    if (row.customer) customers.add(String(row.customer).trim());
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  const sortedCustomers = Array.from(customers).sort();

  const yearFilter = document.getElementById("yearFilter");
  if (yearFilter) {
    const prevVal = yearFilter.value;
    yearFilter.innerHTML = "";
    sortedYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y + " 年";
      yearFilter.appendChild(opt);
    });
    if (prevVal && sortedYears.includes(Number(prevVal))) yearFilter.value = prevVal;
  }

  const searchYear = document.getElementById("searchYear");
  if (searchYear) {
    const prevSearchYear = searchYear.value;
    searchYear.innerHTML = '<option value="ALL">所有年份 (All Years)</option>';
    sortedYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y + " 年";
      searchYear.appendChild(opt);
    });
    if (prevSearchYear) searchYear.value = prevSearchYear;
  }

  const searchCustomer = document.getElementById("searchCustomer");
  if (searchCustomer) {
    const prevCust = searchCustomer.value;
    searchCustomer.innerHTML = '<option value="ALL">所有客戶 (All Customers)</option>';
    sortedCustomers.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      searchCustomer.appendChild(opt);
    });
    if (prevCust) searchCustomer.value = prevCust;
  }
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

    const fin = getRecordFinancials(row);
    customerStats[customer].total += fin.totalAmount;
    customerStats[customer].paid += fin.paidRevenue;
    customerStats[customer].pending += fin.pendingAR;
  });

  const customers = Object.keys(customerStats).sort();
  if (customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b;">${selectedYear} 年無紀錄</td></tr>`;
    return;
  }

  customers.forEach(cust => {
    const stat = customerStats[cust];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${cust}</strong></td>
      <td style="color: #059669; font-weight: bold;">${formatUSD(stat.paid)}</td>
      <td style="color: #d97706; font-weight: bold;">${formatUSD(stat.pending)}</td>
      <td><strong>${formatUSD(stat.total)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// 點擊 Edit 帶入舊資料並開啟彈出視窗
function editRecord(id) {
  const target = recordData.find(item => String(item.id).trim() === String(id).trim());
  if (!target) return;

  const fin = getRecordFinancials(target);

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
  
  document.getElementById("inst1").value = fin.i1;
  document.getElementById("inst2").value = fin.i2;
  document.getElementById("inst3").value = fin.i3;
  document.getElementById("inst4").value = fin.i4;

  document.getElementById("paidStatus").value = fin.displayPaidStatus;
  document.getElementById("status").value = target.status || "Open";
  document.getElementById("owner").value = target.owner || "";

  document.getElementById("modalTitle").innerText = "✏️ Edit Record (編輯紀錄)";
  document.getElementById("submitBtn").innerText = "Update Record (更新)";
  document.getElementById("recordModal").classList.add("show");
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
}

// 新增或更新資料（儲存後自動關閉視窗）
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
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("API post error");

    closeModal();
    await fetchRecords();
  } catch (error) {
    console.error("Error saving record:", error);
    alert("儲存失敗，請檢查網路或 API 連線！");
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
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", id: id })
    });
    await fetchRecords();
  } catch (error) {
    console.error("Error deleting record:", error);
    alert("刪除失敗！");
  }
}

// 匯出 Excel (USD)
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
    const fin = getRecordFinancials(item);

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
      "Unit Price (USD)": item.unitPrice || 0,
      "Total Amount (USD)": fin.totalAmount,
      "1st Inst (USD)": fin.i1,
      "2nd Inst (USD)": fin.i2,
      "3rd Inst (USD)": fin.i3,
      "4th Inst (USD)": fin.i4,
      "Total Paid (USD)": fin.sumPaid,
      "Paid Status": fin.displayPaidStatus,
      "Pending AR (USD - Excl. Open)": fin.pendingAR,
      "Project Status": fin.projectStatus,
      "Owner (負責人)": item.owner || ""
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportList);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue & AR (USD)");

  const fileName = `PTW_Revenue_Tracker_USD_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// 更新頂部 Dashboard KPI
function updateDashboard() {
  let totalRevenue = 0;
  let pendingAR = 0;
  let activeProjects = 0;

  recordData.forEach(row => {
    const fin = getRecordFinancials(row);
    totalRevenue += fin.paidRevenue;
    pendingAR += fin.pendingAR;
    if (fin.isActiveProject) activeProjects++;
  });

  document.getElementById("revenue").innerText = formatUSD(totalRevenue);
  document.getElementById("pending").innerText = formatUSD(pendingAR);
  document.getElementById("projects").innerText = activeProjects;
}

function getPaidBadgeClass(status) {
  if (status === "Paid") return "badge-paid";
  if (status === "Partial") return "badge-partial";
  return "badge-pending";
}