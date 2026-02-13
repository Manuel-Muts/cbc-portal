// accounts.js - Student Accounts Management
const API_BASE = "http://localhost:5000/api";
const token = localStorage.getItem("token");

if (!token) {
  alert("Please login first");
  window.location.href = "../login.html";
}

const headers = {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json"
};

const tableBody = document.getElementById("accountsTableBody");
const refreshBtn = document.getElementById("refreshBtn");

let selectedStudentAdmission = null;
let accountsData = [];

/* ===============================
   LOAD ACCOUNTS (MAIN FUNCTION)
================================ */
async function loadAccounts() {
  try {
    console.log("Fetching accounts data...");
    const res = await fetch(`${API_BASE}/accounts`, { headers });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }

    const data = await res.json();
    accountsData = data;
    console.log(`Loaded ${data.length} accounts`);

    renderFiltered();

    // also load posted fee structures
    console.log("Loading fee structures...");
    await loadFeeStructures();
    console.log("Fee structures loaded");

    // load outstanding fees
    console.log("Loading outstanding fees...");
    await loadOutstandingFees();
    console.log("Outstanding fees loaded");

  } catch (err) {
    console.error("Accounts load error:", err.message);
    alert("Accounts API not reachable");
  }
}

async function loadFeeStructures() {
  try {
    const res = await fetch(`${API_BASE}/accounts/fee-structures`, { headers });
    if (!res.ok) {
      const tbody = document.getElementById('feeStructuresTableBody');
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc3545;">Failed to load fee structures</td></tr>';
      return;
    }
    const list = await res.json();
    const tbody = document.getElementById('feeStructuresTableBody');

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No fee structures posted yet.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(f => `
      <tr>
        <td><strong>${f.grade}</strong></td>
        <td>${f.academicYear}</td>
        <td>KES ${f.term1Fee.toLocaleString()}</td>
        <td>KES ${f.term2Fee.toLocaleString()}</td>
        <td>KES ${f.term3Fee.toLocaleString()}</td>
        <td><strong>KES ${f.totalFee.toLocaleString()}</strong></td>
        <td>
          <button onclick="editFee('${f._id}', '${escapeHtml(f.grade)}', ${f.academicYear}, ${f.term1Fee}, ${f.term2Fee}, ${f.term3Fee})" style="margin-right: 5px;">Edit</button>
          <button onclick="deleteFee('${f._id}')" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Load fee structures error', err);
    const tbody = document.getElementById('feeStructuresTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc3545;">Failed to load fee structures</td></tr>';
  }
}

// small utility to escape single quotes
function escapeHtml(s){ return String(s).replace(/'/g, "\\'"); }

// edit handler: populate modal and set dataset id
window.editFee = function(id, grade, academicYear, term1Fee, term2Fee, term3Fee){
  document.getElementById('feeGrade').value = grade;
  document.getElementById('feeYear').value = academicYear;
  document.getElementById('feeTerm1').value = term1Fee;
  document.getElementById('feeTerm2').value = term2Fee;
  document.getElementById('feeTerm3').value = term3Fee;
  const modal = document.getElementById('postFeeModal');
  modal.classList.remove('hidden');
  const saveBtn = document.getElementById('saveFeeBtn');
  saveBtn.dataset.editId = id;
}

window.deleteFee = async function(id){
  if (!confirm('Delete this fee structure?')) return;
  try{
    const res = await fetch(`${API_BASE}/accounts/fee-structure/${id}`, { method: 'DELETE', headers });
    const j = await res.json();
    if (!res.ok) throw new Error(j.message || 'Delete failed');
    alert('Deleted');
    loadFeeStructures();
    loadAccounts();
  }catch(err){
    console.error(err);
    alert(err.message || 'Delete failed');
  }
}

/* ===============================
   REFRESH BUTTON
================================ */
refreshBtn.addEventListener("click", async () => {
  console.log("Refresh button clicked");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  refreshBtn.style.opacity = "0.7";

  try {
    // Reset filters before refreshing
    document.getElementById('searchInput').value = '';
    document.getElementById('classFilter').value = '';
    document.getElementById('outstandingClassFilter').value = '';
    document.getElementById('outstandingTermFilter').value = '';
    document.getElementById('outstandingSearchInput').value = '';

    console.log("Starting loadAccounts...");
    await loadAccounts();
    console.log("loadAccounts completed");
  } catch (err) {
    console.error("Refresh failed:", err);
    alert("Failed to refresh data. Please try again.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh Data";
    refreshBtn.style.opacity = "1";
    console.log("Refresh completed");
  }
});

function renderTable(data) {
  tableBody.innerHTML = "";

  data.forEach(row => {
    const termBalances = row.termBalances || {
      term1: { fee: 0, paid: 0, balance: 0 },
      term2: { fee: 0, paid: 0, balance: 0 },
      term3: { fee: 0, paid: 0, balance: 0 }
    };

    const totalBalance = row.balance;
    let totalBalanceClass = totalBalance > 0 ? "balance-negative" : (totalBalance === 0 ? "balance-zero" : "balance-positive");

    const tr = document.createElement("tr");

    // Helper function to get balance class
    const getBalanceClass = (balance) => {
      return balance > 0 ? "balance-negative" : (balance === 0 ? "balance-zero" : "balance-positive");
    };

    const payButton = `<button class="action-btn pay-btn" onclick="openPaymentModal('${row.admission}', '${row.studentName}')">Pay</button>`;
    const ledgerButton = `<button class="action-btn" onclick="openLedger('${row.admission}')">Ledger</button>`;

    tr.innerHTML = `
      <td><strong>${row.studentName}</strong><br><small style="color: #666;">${row.admission}</small></td>
      <td>${row.className}</td>

      <td>KES ${termBalances.term1.fee.toLocaleString()}</td>
      <td>KES ${termBalances.term1.paid.toLocaleString()}</td>
      <td class="${getBalanceClass(termBalances.term1.balance)}">KES ${termBalances.term1.balance.toLocaleString()}</td>

      <td>KES ${termBalances.term2.fee.toLocaleString()}</td>
      <td>KES ${termBalances.term2.paid.toLocaleString()}</td>
      <td class="${getBalanceClass(termBalances.term2.balance)}">KES ${termBalances.term2.balance.toLocaleString()}</td>

      <td>KES ${termBalances.term3.fee.toLocaleString()}</td>
      <td>KES ${termBalances.term3.paid.toLocaleString()}</td>
      <td class="${getBalanceClass(termBalances.term3.balance)}">KES ${termBalances.term3.balance.toLocaleString()}</td>

      <td><strong>KES ${row.expected.toLocaleString()}</strong></td>
      <td><strong>KES ${row.paid.toLocaleString()}</strong></td>
      <td class="${totalBalanceClass}"><strong>KES ${totalBalance.toLocaleString()}</strong></td>

      <td>${payButton} ${ledgerButton}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ===============================
   RENDER FILTERED
================================ */
function renderFiltered() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const cls = document.getElementById('classFilter').value;

  let filtered = accountsData.slice();
  if (cls) filtered = filtered.filter(r => r.className === cls);
  if (q) filtered = filtered.filter(r => r.studentName.toLowerCase().includes(q));

  renderTable(filtered);
  calculateTotals(filtered);
  renderClassSummary(filtered);
}

/* ===============================
   TOTALS + CHART
================================ */
function calculateTotals(data) {
  let expected = 0;
  let paid = 0;

  data.forEach(r => {
    expected += r.expected;
    paid += r.paid;
  });

  document.getElementById("totalExpected").textContent = `KES ${expected.toLocaleString()}`;
  document.getElementById("totalPaid").textContent = `KES ${paid.toLocaleString()}`;
  document.getElementById("totalBalance").textContent = `KES ${(expected - paid).toLocaleString()}`;

  drawChart(expected, paid);
}

/* ===============================
   CLASS SUMMARY
================================ */
function renderClassSummary(data) {
  const grid = document.getElementById("classSummaryGrid");
  grid.innerHTML = "";

  const grouped = {};

  data.forEach(r => {
    if (!grouped[r.className]) {
      grouped[r.className] = { expected: 0, paid: 0 };
    }
    grouped[r.className].expected += r.expected;
    grouped[r.className].paid += r.paid;
  });

  Object.entries(grouped).forEach(([cls, v]) => {
    const balance = v.expected - v.paid;
    grid.innerHTML += `
      <div class="stat-card">
        <h4>${cls}</h4>
        <p>KES ${balance.toLocaleString()}</p>
      </div>
    `;
  });
}

/* ===============================
   PAYMENT MODAL
================================ */
function openPaymentModal(admission, studentName) {
  selectedStudentAdmission = admission;
  // also store on the save button dataset to avoid relying only on outer-scope var
  const saveBtn = document.getElementById('savePaymentBtn');
  if (saveBtn) saveBtn.dataset.admission = admission;
  document.getElementById("modalStudentName").textContent = studentName;
  document.getElementById("paymentAmount").value = '';
  document.getElementById("paymentReference").value = '';
  // default the payment term to page term filter if present
  const pageTerm = document.getElementById('termFilter')?.value || '';
  const paymentTermEl = document.getElementById('paymentTerm');
  if (paymentTermEl) paymentTermEl.value = pageTerm;
  document.getElementById("paymentModal").classList.remove("hidden");
}

function closePaymentModal() {
  document.getElementById("paymentModal").classList.add("hidden");
}

/* ===============================
   LEDGER
================================ */
async function openLedger(admission) {
  try {
    const res = await fetch(`${API_BASE}/users/ledger/${admission}`, { headers });
    if (!res.ok) throw new Error("Failed to load ledger");
    const data = await res.json();

    const body = document.getElementById("ledgerTableBody");
    body.innerHTML = "";

    (data.payments || []).forEach(p => {
      const status = (p.method === 'reversal' || (p.amount || 0) < 0) ? 'REVERSED' : 'POSTED';
      const actionCell = status === 'POSTED' ? `<button onclick="reversePayment('${p._id}')">Reverse</button>` : '-';
      body.innerHTML += `
        <tr>
          <td>${new Date(p.createdAt).toLocaleDateString()}</td>
          <td>KES ${Math.abs(p.amount).toLocaleString()}</td>
          <td>${p.method}</td>
          <td>${p.reference || "-"}</td>
          <td>${status}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    });

    document.getElementById("ledgerModal").classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("Failed to load ledger");
  }
}

function closeLedgerModal() {
  document.getElementById("ledgerModal").classList.add("hidden");
}

/* ===============================
   REVERSE PAYMENT
================================ */
async function reversePayment(paymentId) {
  if (!confirm("Reverse this payment?")) return;
  // Require a reason (backend validation requires it)
  const reason = prompt('Enter reason for reversal (required):');
  if (reason === null) return; // user cancelled
  if (!reason.trim()) return alert('Reversal reason is required');

  try {
    const res = await fetch(`${API_BASE}/users/reverse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ paymentId, reason: reason.trim() })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Reverse failed');
    }

    alert("Payment reversed");
    loadAccounts();
    closeLedgerModal();
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to reverse payment");
  }
}

/* ===============================
   DOWNLOAD REPORTS (PDF & EXCEL)
================================ */
function downloadReport(type) {
  const cls = document.getElementById("classFilter").value || "";
  const term = document.getElementById("termFilter").value || "";

  const url =
    `${API_BASE}/reports/fees?format=${type}&class=${encodeURIComponent(cls)}&term=${encodeURIComponent(term)}`;

  // fetch with auth header so token is sent
  fetch(url, { headers })
    .then(async (res) => {
      if (!res.ok) throw new Error('Report download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fees_report.${type}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(err => {
      console.error(err);
      alert('Failed to download report');
    });
}

/* ===============================
   DOWNLOAD FEE STRUCTURES PDF
================================ */
document.getElementById('downloadFeeStructuresPDF').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/reports/fee-structures`, { headers });
    if (!res.ok) throw new Error('PDF download failed');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee_structures_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Failed to download fee structures PDF');
  }
});

/* ===============================
   CHART
================================ */
function drawChart(expected, paid) {
  const canvas = document.getElementById("feesChart");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const balance = expected - paid;
  const max = Math.max(expected, paid, balance);

  const barWidth = 80;
  const base = canvas.height - 30;

  function bar(x, val, label) {
    const h = (val / max) * 80;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, base - h, barWidth, h);
    ctx.fillStyle = "#000";
    ctx.fillText(label, x, base + 15);
  }

  bar(40, expected, "Expected");
  bar(160, paid, "Paid");
  bar(280, balance, "Balance");
}

/* ===============================
   LOGOUT
================================ */
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "index.html";
});

// Save payment handler
document.getElementById("savePaymentBtn").addEventListener("click", async () => {
  const amount = Number(document.getElementById("paymentAmount").value || 0);
  const method = document.getElementById("paymentMethod").value;
  const term = document.getElementById("paymentTerm")?.value || document.getElementById("termFilter").value || "";
  const reference = document.getElementById('paymentReference').value.trim();

  // admission may be stored on the button dataset or in the outer variable
  const saveBtn = document.getElementById('savePaymentBtn');
  const admission = (saveBtn && saveBtn.dataset && saveBtn.dataset.admission) || selectedStudentAdmission;

  if (!admission) return alert('No student selected');
  if (!amount || amount <= 0) return alert('Enter a valid amount');
  if (!reference) return alert('Enter a reference (e.g., receipt number)');
  if (!term) return alert('Select term');

  try {
    const res = await fetch(`${API_BASE}/users/record`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ admission, amount, method: method.toLowerCase(), reference, term })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to record payment');
    }

    alert('Payment recorded');
    closePaymentModal();
    loadAccounts();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to record payment');
  }
});

// Open Post Fee modal
const openPostFeeBtn = document.getElementById('openPostFeeBtn');
if (openPostFeeBtn) {
  openPostFeeBtn.addEventListener('click', () => {
    document.getElementById('postFeeModal').classList.remove('hidden');
    // default year to current
    const fy = document.getElementById('feeYear');
    if (fy && !fy.value) fy.value = new Date().getFullYear();
  });
}

// Save fee structure
document.getElementById('saveFeeBtn').addEventListener('click', async () => {
  const grade = document.getElementById('feeGrade').value.trim();
  const year = Number(document.getElementById('feeYear').value);
  const term1Fee = Number(document.getElementById('feeTerm1').value);
  const term2Fee = Number(document.getElementById('feeTerm2').value);
  const term3Fee = Number(document.getElementById('feeTerm3').value);

  if (!grade) return alert('Enter grade');
  if (!year || isNaN(year)) return alert('Enter valid academic year');
  if (isNaN(term1Fee) || term1Fee < 0) return alert('Enter valid Term 1 fee');
  if (isNaN(term2Fee) || term2Fee < 0) return alert('Enter valid Term 2 fee');
  if (isNaN(term3Fee) || term3Fee < 0) return alert('Enter valid Term 3 fee');
  if (term1Fee + term2Fee + term3Fee <= 0) return alert('Total fee must be greater than 0');

  try {
    const saveBtn = document.getElementById('saveFeeBtn');
    const editId = saveBtn.dataset.editId;
    let res;
    if (editId) {
      res = await fetch(`${API_BASE}/accounts/fee-structure/${editId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ grade, academicYear: year, term1Fee, term2Fee, term3Fee })
      });
    } else {
      res = await fetch(`${API_BASE}/accounts/fee-structure`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ grade, academicYear: year, term1Fee, term2Fee, term3Fee })
      });
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to save fee structure');

    alert(editId ? 'Fee structure updated' : 'Fee structure saved');
    document.getElementById('postFeeModal').classList.add('hidden');
    // clear inputs and dataset
    document.getElementById('feeGrade').value = '';
    document.getElementById('feeTerm1').value = '';
    document.getElementById('feeTerm2').value = '';
    document.getElementById('feeTerm3').value = '';
    delete saveBtn.dataset.editId;
    // refresh panels and accounts
    loadFeeStructures();
    loadAccounts();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Failed to save fee structure');
  }
});

// Search + filters (client-side)
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderFiltered();
});

document.getElementById('classFilter').addEventListener('change', () => renderFiltered());

/* ===============================
   OUTSTANDING FEES
================================ */
let outstandingFeesData = [];

async function loadOutstandingFees() {
  try {
    const classFilter = document.getElementById('outstandingClassFilter').value;
    const termFilter = document.getElementById('outstandingTermFilter').value;
    const nameFilter = document.getElementById('outstandingSearchInput').value;

    const params = new URLSearchParams();
    if (classFilter) params.append('class', classFilter);
    if (termFilter) params.append('term', termFilter);
    if (nameFilter) params.append('name', nameFilter);

    const res = await fetch(`${API_BASE}/reports/outstanding-fees?${params}`, { headers });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }

    outstandingFeesData = await res.json();
    renderOutstandingFees();

  } catch (err) {
    console.error("Outstanding fees load error:", err.message);
    const tbody = document.getElementById('outstandingFeesTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #dc3545;">Failed to load outstanding fees</td></tr>';
  }
}

function renderOutstandingFees() {
  const tbody = document.getElementById('outstandingFeesTableBody');

  if (!outstandingFeesData.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align: center; color: #666;">No students with outstanding fees found.</td></tr>';
    return;
  }

  // Update class filter with unique classes from data
  populateClassFilter();

  tbody.innerHTML = outstandingFeesData.map(student => {
    const t1 = student.termBalances.term1 || { fee: 0, paid: 0, balance: 0 };
    const t2 = student.termBalances.term2 || { fee: 0, paid: 0, balance: 0 };
    const t3 = student.termBalances.term3 || { fee: 0, paid: 0, balance: 0 };

    return `
      <tr>
        <td>${student.admission}</td>
        <td>${student.studentName}</td>
        <td>${student.className}</td>
        <td>KES ${t1.fee.toLocaleString()}</td>
        <td>KES ${t1.paid.toLocaleString()}</td>
        <td style="color: ${t1.balance > 0 ? '#dc3545' : '#28a745'};">KES ${t1.balance.toLocaleString()}</td>
        <td>KES ${t2.fee.toLocaleString()}</td>
        <td>KES ${t2.paid.toLocaleString()}</td>
        <td style="color: ${t2.balance > 0 ? '#dc3545' : '#28a745'};">KES ${t2.balance.toLocaleString()}</td>
        <td>KES ${t3.fee.toLocaleString()}</td>
        <td>KES ${t3.paid.toLocaleString()}</td>
        <td style="color: ${t3.balance > 0 ? '#dc3545' : '#28a745'};">KES ${t3.balance.toLocaleString()}</td>
        <td><strong>KES ${student.expected.toLocaleString()}</strong></td>
        <td><strong>KES ${student.paid.toLocaleString()}</strong></td>
        <td style="color: #dc3545; font-weight: bold;">KES ${student.balance.toLocaleString()}</td>
      </tr>
    `;
  }).join('');
}

// Populate class filter with unique classes (including streams)
function populateClassFilter() {
  const classFilter = document.getElementById('outstandingClassFilter');
  const uniqueClasses = [...new Set(outstandingFeesData.map(s => s.className))].sort();
  const currentValue = classFilter.value;
  
  // Keep "All Classes" option and add unique classes
  classFilter.innerHTML = '<option value="">All Classes</option>';
  uniqueClasses.forEach(cls => {
    if (cls !== 'Not Enrolled') {
      const option = document.createElement('option');
      option.value = cls;
      option.textContent = cls;
      classFilter.appendChild(option);
    }
  });
  
  // Restore previous selection if still available
  classFilter.value = currentValue;
}

// Event listeners for outstanding fees filters
document.getElementById('outstandingClassFilter').addEventListener('change', () => loadOutstandingFees());
document.getElementById('outstandingTermFilter').addEventListener('change', () => loadOutstandingFees());
document.getElementById('outstandingSearchInput').addEventListener('input', () => loadOutstandingFees());

// Download outstanding fees PDF
document.getElementById('downloadOutstandingPDF').addEventListener('click', async () => {
  try {
    // Use the already-fetched `outstandingFeesData` (frontend filtered dataset)
    // This avoids brittle DOM parsing and ensures all rows are included.
    const displayedData = Array.isArray(outstandingFeesData) ? outstandingFeesData.slice() : [];

    if (displayedData.length === 0) {
      alert('No data to download. Please load outstanding fees first.');
      return;
    }

    console.log(`Downloading PDF with ${displayedData.length} students (from outstandingFeesData)`);

    // Send the displayed (filtered) data to backend for PDF generation
    const response = await fetch(`${API_BASE}/reports/outstanding-fees-pdf-from-data`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/pdf'
      },
      body: JSON.stringify(displayedData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download PDF: ${errorText}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outstanding_fees_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('PDF downloaded successfully');

  } catch (err) {
    console.error('Download PDF error:', err);
    alert('Failed to download PDF: ' + err.message);
  }
});

/* ===============================
   INIT
================================ */
loadAccounts();

