const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxHdioPqCwf35gOZQZWTB1bSf7sQ1lVFsXDxW0iFVbg-fdjcrvbmT1xT0sL9gyE7EAdUg/exec";

let recordData = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("date").valueAsDate = new Date();
  fetchRecords();
});

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

function renderTable() {
  const tbody = document.getElementById("records");
  tbody.innerHTML = "";

  if (!recordData || recordData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No records found.</td></tr>';
    return;
  }

  recordData.forEach(row => {
    const tr = document.createElement("tr");
    const total = Number(row.qty || 0) * Number(row.unitPrice || 0);

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

function editRecord(id) {
  const target = recordData.find(item => item.id === id);
  if (!target) return;

  document.getElementById("recordId").value = target.id;
  document.getElementById("date").value = target.date || "";
  document.getElementById("customer").value = target.customer || "";
  document.getElementById("prNo").value = target.prNo || "";
  document.getElementById("poNo").value = target.poNo || "";
  document.getElementById("invoiceNo").value = target.invoiceNo || "";
  document.getElementById("category").value = target.category || "";
  document.getElementById("description").value = target.description || "";
  document.getElementById("qty").value = target.qty || 1;
  document.getElementById("unitPrice").value = target.unitPrice || 0;
  document.getElementById("paidStatus").value = target.paidStatus || "Pending";
  document.getElementById("status").value = target.status || "Open";
  document.getElementById("owner").value = target.owner || "";

  document.getElementById("submitBtn").innerText = "Update Record";
  document.getElementById("cancelBtn").style.display = "inline-block";
}

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

  document.getElementById("submitBtn").innerText = "Save Record";
  document.getElementById("cancelBtn").style.display = "none";
}

async function saveRecord() {
  const submitBtn = document.getElementById("submitBtn");
  const recordId = document.getElementById("recordId").value;
  
  const payload = {
    action: recordId ? "update" : "create",
    id: recordId,
    date: document.getElementById("date").value,
    customer: document.getElementById("customer").value,
    prNo: document.getElementById("prNo").value,
    poNo: document.getElementById("poNo").value,
    invoiceNo: document.getElementById("invoiceNo").value,
    category: document.getElementById("category").value,
    description: document.getElementById("description").value,
    qty: Number(document.getElementById("qty").value),
    unitPrice: Number(document.getElementById("unitPrice").value),
    paidStatus: document.getElementById("paidStatus").value,
    status: document.getElementById("status").value,
    owner: document.getElementById("owner").value
  };

  if (!payload.customer) {
    alert("Please select a customer.");
    return;
  }

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
    console.error("Error saving data:", error);
    alert("儲存失敗！");
  } finally {
    submitBtn.disabled = false;
  }
}

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