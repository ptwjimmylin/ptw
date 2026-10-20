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
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// 渲染表格內容
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
    alert("儲存失敗，請檢查 API 網址與連線！");
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