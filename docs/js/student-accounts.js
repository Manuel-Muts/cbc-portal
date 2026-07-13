// docs/js/student-accounts.js
(function () {
  const API_BASE = config.api.baseURL;

  // ---------------------------
  // STYLES FOR COMPACTNESS
  // ---------------------------
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    #accountsTable th, #accountsTable td { padding: 5px 10px !important; font-size: 0.82rem !important; vertical-align: middle; border-bottom: 1px solid #edf2f7; }
    #accountsTable th { background-color: #f8fafc; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.025em; }
    .money-col { font-weight: 700 !important; color: #0f172a !important; }
    .bf-badge { font-size: 0.65rem !important; padding: 1px 4px !important; border-radius: 3px !important; margin-left: 4px; }
    .btn { padding: 3px 8px !important; font-size: 0.75rem !important; }
    .spinner { width: 24px; height: 24px; border: 3px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(compactStyle);

  // DOM Elements
  const tableBody = document.querySelector("#accountsTable tbody");
  const classFilter = document.getElementById("classFilter");
  const yearFilter = document.getElementById("academicYearFilter");
  const termFilter = document.getElementById("termFilter");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshAccountsBtn");
  const exportBtn = document.getElementById("downloadReportPdfBtn");
  
  // Pagination
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const pageInfo = document.getElementById("pageInfo");
  let currentPage = 1;
  const limit = 10;
  let totalPages = 1;

  // Cache State
  let userProfile = null; 
  let schoolInfoCache = null;
  const accountsCache = new Map(); 
  const ledgerCache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Ledger Modal State
  let currentLedgerAdmission = null;
  let currentLedgerName = null;
  let currentLedgerPage = 1;

  // ---------------------------
  // HELPERS
  // ---------------------------
  // Payment Modal
  const paymentModal = document.getElementById("paymentModal");
  const savePaymentBtn = document.getElementById("savePaymentBtn");
  const cancelPaymentBtn = document.getElementById("cancelPaymentBtn");
  const payFullBalanceBtn = document.getElementById("payFullBalanceBtn"); // 🆕
  let currentStudentAdmission = null; // Store admission instead of ID for existing API compatibility
  let currentStudentBalance = 0; // 🆕 Store balance

  // Ledger Modal
  const ledgerModal = document.getElementById("ledgerModal");
  const closeLedgerBtn = document.getElementById("closeLedgerBtn");
  const ledgerTableContainer = document.getElementById("ledgerTableContainer");
  const ledgerStudentName = document.getElementById("ledgerStudentName");

  // Student Fee Details Modal Elements
  const studentFeeDetailsModal = document.getElementById("studentFeeDetailsModal");
  const studentFeeModalBody = document.getElementById("studentFeeModalBody");
  const closeStudentFeeDetailsBtn = document.getElementById("closeStudentFeeDetailsBtn");
  const dlStructureBtn = document.getElementById("dlStructureBtn");
  const dlStatementBtn = document.getElementById("dlStatementBtn");

  // Manual B/F Elements (Adding missing references)
  const addBFBtn = document.getElementById("addBFBtn");
  const bfModal = document.getElementById("bfModal");
  const cancelBFBtn = document.getElementById("cancelBFBtn");
  const saveBFBtn = document.getElementById("saveBFBtn");
  const bfYearInput = document.getElementById("bfYear");

  // Initialize Year Filter
  if (yearFilter) {
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = "";
    for (let y = 2024; y <= 2126; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      yearFilter.appendChild(opt);
    }
  }

  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 || res.status === 403) return authService.redirectToLogin();
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || "Request failed");
    }
    return res.json();
  }

  async function getSchoolInfo() {
    const cacheKey = 'my-school-all';
    if (schoolInfoCache && schoolInfoCache.has(cacheKey)) {
      const cached = schoolInfoCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }
    try {
      // 🚀 Optimization: Fetch only name and schoolType to avoid loading heavy logo/address data.
      const schoolData = await secureFetch(`${API_BASE}/my-school?fields=name,schoolType`);
      if (!(schoolInfoCache instanceof Map)) schoolInfoCache = new Map();
      schoolInfoCache.set(cacheKey, { timestamp: Date.now(), data: schoolData });
      return schoolData;
    } catch (e) {
      console.error("School info fetch failed", e);
      return { name: "SCHOOL NAME", schoolType: "full" };
    }
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      padding: 12px 24px; border-radius: 8px; color: white; font-size: 14px;
      font-weight: 600; z-index: 999999; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      transition: all 0.3s ease; pointer-events: none;
    `;
    if (type === "success") toast.style.backgroundColor = "#10b981";
    else if (type === "error") toast.style.backgroundColor = "#ef4444";
    else toast.style.backgroundColor = "#3b82f6";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  const SCHOOL_TYPES = {
    full: {
      label: "Full School (Grades PG-12)",
      gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
    },
    primary_junior: {
      label: "Primary + Junior (Grades PP1-9)",
      gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
    },
    senior: {
      label: "Senior School (Grades 10-12)",
      gradeOptions: ["10","11","12"]
    }
  };

  function getSchoolTypeKey() {
    // schoolInfoCache is a Map, so retrieve the 'my-school-all' entry
    const schoolInfo = schoolInfoCache.get('my-school-all')?.data; // Retrieve cached school info
    if (!schoolInfo || !schoolInfo.schoolType) return 'full';
    const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
    if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
    if (rawType.includes('senior')) return 'senior';
    return 'full';
  }

  // New function to populate grade filters (Adapted from accounts.js)
  function populateGradeFilters() {
    const schoolType = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[schoolType].gradeOptions;
    if (classFilter) { // Ensure classFilter element exists
      classFilter.innerHTML = '<option value="">All Grades</option>'; // Add an "All" option
      grades.forEach(g => {
        const option = document.createElement("option");
const displayValue = (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`;
        option.value = displayValue;
        option.textContent = displayValue;
        classFilter.appendChild(option);
      });
    }
  }

  // ---------------------------
  // LOAD DATA
  // ---------------------------
  async function loadAccounts(page = 1, forceRefresh = false) {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center"><span class="spinner"></span> Loading...</td></tr>`;

    const grade = classFilter.value;
    const year = yearFilter.value;
    const search = searchInput.value.trim();

    // Matching endpoints from original accounts.js logic
    const query = new URLSearchParams({ page, limit, academicYear: year });
    if (grade) query.append("class", grade); // API expects 'class' param
    if (search) query.append("search", search);

    const queryString = query.toString();
    let data;

    // Check cache if not forced
    if (!forceRefresh && accountsCache.has(queryString)) {
        const cached = accountsCache.get(queryString);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            data = cached.data;
        }
    }

    if (!data) {
        data = await secureFetch(`${API_BASE}/accounts?${queryString}`);
        if (data) accountsCache.set(queryString, { timestamp: Date.now(), data });
    }
    
    if (data && (data.students || data.accounts)) {
      const records = data.students || data.accounts;
      renderTable(records);
      currentPage = data.currentPage || 1;
      totalPages = data.totalPages || 1;
      updatePagination();
    } else {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center">No records found</td></tr>`;
    }
  }

  function renderTable(students) {
    tableBody.innerHTML = "";
    if (students.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center">No students found</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    students.forEach(s => {
      const tr = document.createElement("tr");
      // Mapping fields based on accounts.js structure
      const name = s.studentName || s.name || "Unknown";
      const adm = s.admission || s.admissionNo || "-";
      const cls = s.className || s.grade || "-";
      
      const term1Fee = Number(s.termBalances?.term1?.fee ?? s.termBalances?.term1?.amount ?? 0);
      const term2Fee = Number(s.termBalances?.term2?.fee ?? s.termBalances?.term2?.amount ?? 0);
      const term3Fee = Number(s.termBalances?.term3?.fee ?? s.termBalances?.term3?.amount ?? 0);
      const rowExpected = Number((s.expected ?? s.totalFee ?? (term1Fee + term2Fee + term3Fee)) || 0);
      const rowPaid = Number(s.totalPaid ?? s.paid ?? 0);
      const rowBalance = s.balance !== undefined ? Number(s.balance) : Number(rowExpected - rowPaid);

      let expected = rowExpected;
      let paid = rowPaid;
      let balance = rowBalance;

      // Determine B/F Badge Type
      let bfBadge = '';
      if (s.hasBroughtForward) {
        const amt = s.broughtForwardAmount || 0;
        const isArrears = amt < 0;
        const label = isArrears ? "Arrears" : "Surplus";
        const cssClass = isArrears ? "bf-debt" : "bf-credit";
        bfBadge = `<span class="bf-badge ${cssClass}" title="${label} B/F: ${formatMoney(amt)}">B/F</span>`;
      }

      // Filter by term if selected
      if (termFilter && termFilter.value) {
        const t = termFilter.value; // e.g. "Term 1"
        // normalize key: "Term 1" -> "term1"
        const key = t.toLowerCase().replace(" ", "");
        if (s.termBalances && s.termBalances[key]) {
          expected = s.termBalances[key].fee;
          paid = s.termBalances[key].paid;
          balance = s.termBalances[key].balance;
        }
      }

      if (balance <= 0) {
        tr.style.backgroundColor = "#d1fae5";
      }

      tr.innerHTML = `
        <td>${adm}</td>
        <td>${name}</td>
        <td>${cls}</td>
        <td class="money-col">${formatMoney(expected)}</td>
        <td class="money-col">${formatMoney(paid)}</td>
        <td class="money-col" style="font-weight:bold; color:${balance > 0 ? '#dc3545' : '#15803d'}">
          ${formatMoney(balance)}
          ${bfBadge}
        </td>
        <td style="white-space: nowrap;">
          <button class="btn primary-btn pay-btn" data-admission="${adm}" data-name="${name.replace(/'/g, "\\'")}" data-balance="${balance}">Pay</button>
          <button class="btn secondary-btn ledger-btn" data-admission="${adm}" data-name="${name.replace(/'/g, "\\'")}">Ledger</button>
          ${balance <= 0 ? `<button class="btn secondary-btn view-fee-btn" data-admission="${adm}" data-name="${name.replace(/'/g, "\\'")}" data-grade="${cls}" data-expected="${rowExpected}" data-paid="${rowPaid}" data-balance="${rowBalance}" data-term1fee="${term1Fee}" data-term2fee="${term2Fee}" data-term3fee="${term3Fee}" data-totalfee="${rowExpected}">View</button>` : ''}
        </td>
      `;
      frag.appendChild(tr);
    });
    tableBody.appendChild(frag);
  }

  function formatMoney(amount) {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);
  }

  function updatePagination() {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  // ---------------------------
  // PAYMENT LOGIC
  // ---------------------------
  function openPayment(admission, name, balance = 0) {
    currentStudentAdmission = admission;
    currentStudentBalance = Number(balance);
    document.getElementById("modalStudentName").textContent = `Student: ${name}`;
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentReference").value = "";
    
    // Set default term if available
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const termSelect = document.getElementById("paymentTerm");
    if(termSelect) {
        if(month <= 4) termSelect.value = "Term 1";
        else if(month <= 8) termSelect.value = "Term 2";
        else termSelect.value = "Term 3";
    }

    paymentModal.style.display = "flex";
    requestAnimationFrame(() => paymentModal.classList.add("visible"));
  }

  // 🆕 Handle "Pay Full Arrears" click
  if (payFullBalanceBtn) {
    payFullBalanceBtn.addEventListener("click", () => {
      if (currentStudentBalance > 0) {
        document.getElementById("paymentAmount").value = currentStudentBalance;
        document.getElementById("paymentTerm").value = "Auto"; // Auto-select Auto-Allocate
      }
    });
  }

  savePaymentBtn.addEventListener("click", async () => {
    const amount = document.getElementById("paymentAmount").value;
    const method = document.getElementById("paymentMethod").value;
    const reference = document.getElementById("paymentReference").value;
    const term = document.getElementById("paymentTerm").value;
    const academicYear = yearFilter?.value || new Date().getFullYear(); 

    if (!amount || !reference) {
      showToast("Amount and Reference are required", "error");
      return;
    }

    savePaymentBtn.disabled = true;
    savePaymentBtn.textContent = "Processing...";

    try {
      // Matching endpoints from original accounts.js logic (/users/record)
      const res = await secureFetch(`${API_BASE}/users/record`, {
        method: "POST",
        body: JSON.stringify({
          admission: currentStudentAdmission,
          amount: Number(amount),
          method: method.toLowerCase(),
          reference,
          term,
          academicYear: Number(academicYear) // Add academicYear here
        })
      });

      if (res) {
        console.log('[Payment] Payment successful! Broadcasting signal...', res);
        showToast("Payment recorded successfully", "success");
        paymentModal.classList.remove("visible");
        setTimeout(() => paymentModal.style.display = "none", 200);
        
        // Clear all caches to force fresh data
        accountsCache.clear();
        ledgerCache.clear();
        console.log('[Payment] Caches cleared');
        
        // Broadcast payment signal to all pages (including accounts.js)
        const timestamp = Date.now().toString();
        sessionStorage.setItem('paymentRecorded', timestamp);
        localStorage.setItem('paymentRecorded', timestamp); // Also use localStorage for reliability
        console.log('[Payment] sessionStorage.paymentRecorded set to', timestamp);
        
        // Trigger custom event that works reliably on same tab
        window.dispatchEvent(new CustomEvent('paymentRecorded', {
          detail: { timestamp: timestamp, studentId: currentStudentAdmission }
        }));
        console.log('[Payment] Custom paymentRecorded event dispatched');
        
        if (currentStudentAdmission) ledgerCache.delete(currentStudentAdmission);
        
        // Wait longer to allow backend to clear and rebuild cache
        setTimeout(() => {
          console.log('[Payment] Reloading student accounts table after payment...');
          loadAccounts(currentPage, true);
        }, 1500);
      }
    } catch (err) {
      console.error("Record Payment Error:", err);
      showToast(err.message || "Failed to record payment", "error");
    } finally {
      savePaymentBtn.textContent = "Save Payment";
      savePaymentBtn.disabled = false;
    }
  });

  cancelPaymentBtn.addEventListener("click", () => {
    paymentModal.classList.remove("visible");
    setTimeout(() => paymentModal.style.display = "none", 200);
  });

  // ---------------------------
  // LEDGER LOGIC
  // ---------------------------
  async function openLedger(admission, studentName, page = 1, forceRefresh = false) {
    if (!admission) return;
    currentLedgerAdmission = admission;
    currentLedgerName = studentName;
    currentLedgerPage = page;
    
    ledgerStudentName.textContent = `Ledger for: ${studentName}`;
    ledgerTableContainer.innerHTML = `
      <div style="text-align:center; padding:40px;">
        <div class="spinner"></div>
        <p style="margin-top:10px; color:#64748b;">Loading payment history...</p>
      </div>`;
    ledgerModal.style.display = "flex";
    requestAnimationFrame(() => ledgerModal.classList.add("visible"));

    const cacheKey = `${admission}_p${page}`;
    let data;
    
    if (!forceRefresh && ledgerCache.has(cacheKey)) {
      const cached = ledgerCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        data = cached.data;
      }
    }

    if (!data) {
      data = await secureFetch(`${API_BASE}/users/ledger/${admission}?page=${page}&limit=10`);
      if (data) ledgerCache.set(cacheKey, { timestamp: Date.now(), data });
    }

    if (data && data.payments) {
        renderLedgerTable(data.payments, data.currentPage, data.totalPages);
    } else {
        ledgerTableContainer.innerHTML = '<p style="text-align:center; padding:20px;">No payment history found.</p>';
    }
  }

  function renderLedgerTable(payments, page = 1, pages = 1) {
    if (payments.length === 0) {
        ledgerTableContainer.innerHTML = '<p>No payment history found.</p>';
        return;
    }

    let tableHTML = `<table style="width:100%; border-collapse:collapse;">
        <thead>
            <tr style="border-bottom:1px solid #ddd;">
                <th style="text-align:left; padding:8px;">Date</th>
                <th style="text-align:left; padding:8px;">Term</th>
                <th style="text-align:left; padding:8px;">Method</th>
                <th style="text-align:left; padding:8px;">Reference</th>
                <th style="text-align:right; padding:8px;">Amount (KES)</th>
                <th style="text-align:center; padding:8px;">Action</th>
            </tr>
        </thead>
        <tbody>`;
    
    payments.forEach(p => {
        tableHTML += `
            <tr>
                <td style="padding:8px;">${new Date(p.createdAt).toLocaleDateString()}</td>
                <td style="padding:8px;">${p.term}</td>
                <td style="padding:8px;">${p.method}</td>
                <td style="padding:8px;">${p.reference}</td>
                <td style="text-align:right; padding:8px;">${formatMoney(p.amount)}</td>
                <td style="text-align:center; padding:8px;">${(p.amount > 0 && p.method !== 'reversal') ? `<button class="btn danger-btn reverse-btn" data-id="${p._id}" style="padding:2px 8px; font-size:11px;">Reverse</button>` : '-'}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';

    // Pagination Controls
    if (pages > 1) {
        tableHTML += `
            <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-top:15px; padding:10px;">
                <button id="ledgerPrevBtn" class="btn secondary-btn" ${page <= 1 ? 'disabled' : ''} style="padding:5px 10px;">Previous</button>
                <span style="font-size:14px;">Page ${page} of ${pages}</span>
                <button id="ledgerNextBtn" class="btn secondary-btn" ${page >= pages ? 'disabled' : ''} style="padding:5px 10px;">Next</button>
            </div>
        `;
    }

    ledgerTableContainer.innerHTML = tableHTML;

    // Bind events
    if (pages > 1) {
        document.getElementById("ledgerPrevBtn")?.addEventListener("click", () => openLedger(currentLedgerAdmission, currentLedgerName, page - 1));
        document.getElementById("ledgerNextBtn")?.addEventListener("click", () => openLedger(currentLedgerAdmission, currentLedgerName, page + 1));
    }
  }

  closeLedgerBtn.addEventListener('click', () => {
    ledgerModal.classList.remove('visible');
    setTimeout(() => ledgerModal.style.display = "none", 200);
  });

  // ---------------------------
  // VIEW STUDENT FEE DETAILS LOGIC
  // ---------------------------
  async function openStudentFeeDetails(admission, studentName, grade, summaryData = {}) {
    studentFeeModalBody.innerHTML = '<div style="text-align:center; padding:20px;">Loading details...</div>';
    studentFeeDetailsModal.style.display = 'flex';
    requestAnimationFrame(() => studentFeeDetailsModal.classList.add('visible'));
    
    const year = yearFilter.value || new Date().getFullYear();
    currentStudentDetails = { name: studentName, year };

    try {
      const formatCurrency = (value) => {
        const numericValue = Number(value || 0);
        return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0';
      };

      const matchesGrade = (candidate, target) => {
        const normalize = (value) => String(value || '').trim().replace(/^Grade\s+/i, '');
        const left = normalize(candidate);
        const right = normalize(target);
        return left === right || `Grade ${left}` === right || left === `Grade ${right}`;
      };

      let statement = null;
      let ledgerPayload = null;
      let feeStructuresPayload = null;

      try {
        statement = await secureFetch(`${API_BASE}/accounts/student-fee-statement/${admission}?academicYear=${year}${grade ? `&grade=${encodeURIComponent(grade)}` : ''}`);
      } catch (err) {
        console.warn('Fee statement endpoint failed in student view, falling back to ledger data.', err);
      }

      if (!statement) {
        try {
          ledgerPayload = await secureFetch(`${API_BASE}/users/ledger/${admission}`);
        } catch (err) {
          console.warn('Ledger fallback failed in student view.', err);
        }

        try {
          feeStructuresPayload = await secureFetch(`${API_BASE}/accounts/fee-structures?limit=1000`);
        } catch (err) {
          console.warn('Fee structure fallback failed in student view.', err);
        }
      }

      const feeList = Array.isArray(feeStructuresPayload)
        ? feeStructuresPayload
        : Array.isArray(feeStructuresPayload?.data)
          ? feeStructuresPayload.data
          : [];

      const matchedFeeStructure = (() => {
        const feeSource = statement?.feeStructure && Object.keys(statement.feeStructure).length
          ? statement.feeStructure
          : null;

        const fallbackFeeStructure = feeList.find((item) => Number(item.academicYear) === Number(year) && matchesGrade(item.grade, grade)) || null;

        const hasRowFees = summaryData.term1Fee !== undefined || summaryData.term2Fee !== undefined || summaryData.term3Fee !== undefined || summaryData.totalFee !== undefined;
        const rowFeeStructure = hasRowFees
          ? {
              term1Fee: Number(summaryData.term1Fee || 0),
              term2Fee: Number(summaryData.term2Fee || 0),
              term3Fee: Number(summaryData.term3Fee || 0),
              totalFee: Number(summaryData.totalFee || summaryData.expected || 0)
            }
          : null;

        return {
          term1Fee: rowFeeStructure?.term1Fee ?? feeSource?.term1Fee ?? fallbackFeeStructure?.term1Fee ?? 0,
          term2Fee: rowFeeStructure?.term2Fee ?? feeSource?.term2Fee ?? fallbackFeeStructure?.term2Fee ?? 0,
          term3Fee: rowFeeStructure?.term3Fee ?? feeSource?.term3Fee ?? fallbackFeeStructure?.term3Fee ?? 0,
          totalFee: rowFeeStructure?.totalFee ?? feeSource?.totalFee ?? fallbackFeeStructure?.totalFee ?? Number(summaryData.totalFee || summaryData.expected || 0)
        };
      })();

      const fees = matchedFeeStructure || { term1Fee: 0, term2Fee: 0, term3Fee: 0, totalFee: 0 };
      const payments = Array.isArray(statement?.payments)
        ? statement.payments
        : Array.isArray(ledgerPayload?.payments)
          ? ledgerPayload.payments.filter((payment) => Number(payment.academicYear) === Number(year))
          : [];
      const totals = statement?.totals || {};
      const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
      payments.forEach((payment) => {
        const amount = Number(payment.amount || payment.totalAmount || 0);
        if (termPaid[payment.term] !== undefined) {
          termPaid[payment.term] += amount;
        }
      });

      const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || payment.totalAmount || 0), 0);
      const totalPaid = Number(summaryData.paid ?? totals.totalPaid ?? paymentTotal ?? 0);
      const totalFee = Number(summaryData.expected ?? totals.totalFee ?? fees.totalFee ?? fees.total ?? 0);
      const totalBalance = Number(summaryData.balance ?? totals.totalBalance ?? totals.balance ?? (totalFee - totalPaid));
      const unpaidAmount = Math.max(totalFee - totalPaid, 0);
      
      let content = `
        <div id="fee-details-content">
          <div class="report-header" style="text-align:center; margin-bottom:20px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
             <h2 style="margin:0;">FEE STATEMENT</h2>
             <p style="margin:5px 0;"><strong>Learner:</strong> ${studentName} <strong>| Adm: ${admission}</strong></p>
             <p style="margin:0;"><strong>Grade:</strong> ${grade} | <strong>Year:</strong> ${year}</p>
          </div>


          <div id="fee-structure-for-pdf" style="margin-bottom: 25px;">
            <h4 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px;">Fee Structure & Status</h4>
            <table style="width:100%; border-collapse:collapse; font-size: 13px; margin-bottom: 15px;">
              <thead>
                <tr style="background:#e9ecef;">
                  <th style="padding:8px; text-align:left; border:1px solid #ddd;">Term</th>
                  <th style="padding:8px; text-align:right; border:1px solid #ddd;">Fee</th>
                  <th style="padding:8px; text-align:right; border:1px solid #ddd;">Paid</th>
                  <th style="padding:8px; text-align:right; border:1px solid #ddd;">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:8px; border:1px solid #ddd;">Term 1</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(fees.term1Fee || 0)}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(termPaid["Term 1"])}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${formatCurrency((fees.term1Fee || 0) - termPaid["Term 1"])}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #ddd;">Term 2</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(fees.term2Fee || 0)}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(termPaid["Term 2"])}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${formatCurrency((fees.term2Fee || 0) - termPaid["Term 2"])}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #ddd;">Term 3</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(fees.term3Fee || 0)}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(termPaid["Term 3"])}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${formatCurrency((fees.term3Fee || 0) - termPaid["Term 3"])}</td>
                </tr>
                <tr style="background:#f8f9fa; font-weight:bold;">
                  <td style="padding:8px; border:1px solid #ddd;">TOTAL</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(fees.totalFee || 0)}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${formatCurrency(totalPaid)}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; color:${totalBalance > 0 ? '#dc3545' : '#28a745'};">${formatCurrency(totalBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div id="payment-statement-for-pdf" style="margin-bottom: 25px;">
            <h4 style="border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px;">Payment History</h4>
            <table style="width:100%; border-collapse:collapse; font-size: 13px;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:8px; text-align:left; border-bottom:1px solid #ddd;">Date</th>
                  <th style="padding:8px; text-align:left; border-bottom:1px solid #ddd;">Reference</th>
                  <th style="padding:8px; text-align:left; border-bottom:1px solid #ddd;">Method</th>
                  <th style="padding:8px; text-align:left; border-bottom:1px solid #ddd;">Term</th>
                  <th style="padding:8px; text-align:right; border-bottom:1px solid #ddd;">Amount</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (payments.length === 0) {
        content += `<tr><td colspan="5" style="text-align:center; padding:10px;">No payments recorded for this year.</td></tr>`;
      } else {
        payments.forEach((payment) => {
          const paymentDate = payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : '—';
          const paymentAmount = Number(payment.amount || payment.totalAmount || 0);
          content += `
            <tr>
              <td style="padding:8px; border-bottom:1px solid #eee;">${paymentDate}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${payment.reference || '—'}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${payment.method || '—'}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${payment.term || '—'}</td>
              <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${formatCurrency(paymentAmount)}</td>
            </tr>
          `;
        });
      }

      content += `
              </tbody>
            </table>
          </div>
        </div>
      `;

      studentFeeModalBody.innerHTML = content;

    } catch (err) {
      console.error("Error loading student details", err);
      studentFeeModalBody.innerHTML = '<div style="color:red; text-align:center;">Error loading details.</div>';
    }
  }

  if (closeStudentFeeDetailsBtn) {
    closeStudentFeeDetailsBtn.addEventListener('click', () => {
      studentFeeDetailsModal.classList.remove('visible');
      setTimeout(() => studentFeeDetailsModal.style.display = 'none', 200);
    });
  }

  // Generate PDF from Modal Content
  async function generateModalPDF(elementId, titleSuffix, customTitle) {
    const contentElement = document.getElementById(elementId);
    const headerElement = document.querySelector('#studentFeeModalBody .report-header');

    if (!contentElement || !headerElement || !window.html2canvas || !window.jspdf) {
      showToast("PDF generation components not ready.", "error");
      return;
    } // Replaced with showToast
    
    // 1. Fetch school info to get the name
    const school = await getSchoolInfo({ fields: 'name' });
    const schoolName = (school.name || "SCHOOL NAME").toUpperCase();

    // 2. Create a temporary, off-screen container for printing
    const printContainer = document.createElement('div');
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.width = '800px';
    printContainer.style.padding = '20px';
    printContainer.style.background = 'white';
    printContainer.style.fontFamily = 'Arial, sans-serif';

    // 3. Construct the printable content
    printContainer.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h1 style="margin:0; font-size:22px;">${schoolName}</h1>
        </div>
    `;
    
    const clonedHeader = headerElement.cloneNode(true);
    if (customTitle) {
        const h2 = clonedHeader.querySelector('h2');
        if (h2) h2.textContent = customTitle;
    }
    printContainer.appendChild(clonedHeader);
    printContainer.appendChild(contentElement.cloneNode(true));
    document.body.appendChild(printContainer);

    try {
      const canvas = await html2canvas(printContainer, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);

      // Add footer with current date and right-side metadata
      const dateStr = `Generated: ${new Date().toLocaleString()}`;
      const servedBy = userProfile?.name || userProfile?.fullName || userProfile?.username || userProfile?.email || 'Unknown';
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(dateStr, 10, pdf.internal.pageSize.getHeight() - 10);
      pdf.text(`Page 1 of 1  |  Served by: ${servedBy}`, pdf.internal.pageSize.getWidth() - 10, pdf.internal.pageSize.getHeight() - 10, { align: 'right' });

      const fname = `${currentStudentDetails?.name || 'Student'}_${titleSuffix}.pdf`;
      pdf.save(fname);
    } catch(e) { 
        console.error(e); 
        showToast("PDF generation failed", "error"); 
    } finally {
        // 4. Clean up the temporary container
        document.body.removeChild(printContainer);
    }
  }

  // Generate Receipt PDF
  async function generateReceiptPDF(payment) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) return showToast("PDF library not loaded.", "error");
    const doc = new jsPDF();

    // 🚀 Optimization: Only the school name is needed for the receipt header.
    const school = await getSchoolInfo({ fields: 'name' });
    const schoolName = (school.name || "SCHOOL NAME").toUpperCase();

    doc.setFontSize(16);
    doc.text(schoolName, 105, 20, { align: "center" });
    doc.setFontSize(14);
    doc.text("PAYMENT RECEIPT", 105, 30, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Date: ${new Date(payment.createdAt).toLocaleString()}`, 20, 50);
    doc.text(`Reference: ${payment.reference}`, 20, 60);
    doc.text(`Admission: ${payment.admission}`, 20, 70);
    doc.text(`Term: ${payment.term} ${payment.academicYear}`, 20, 80);
    doc.text(`Method: ${payment.method.toUpperCase().replace('_', ' ')}`, 20, 90);
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Amount: ${formatMoney(Math.abs(payment.amount))}`, 20, 110);

    // Add footer with current date
    const dateStr = `Generated: ${new Date().toLocaleString()}`;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(dateStr, 10, doc.internal.pageSize.getHeight() - 10);
    doc.save(`Receipt_${payment.reference}.pdf`);
  }

  const runDownloadWithSpinner = async (button, elementId, titleSuffix, customTitle) => {
    if (!button) {
      await generateModalPDF(elementId, titleSuffix, customTitle);
      return;
    }

    window.spinner?.show(button, 'Generating...');
    try {
      await generateModalPDF(elementId, titleSuffix, customTitle);
    } finally {
      window.spinner?.hide(button);
    }
  };

  if (dlStructureBtn) dlStructureBtn.addEventListener('click', () => runDownloadWithSpinner(dlStructureBtn, 'fee-structure-for-pdf', 'Fee_Structure', 'FEE STRUCTURE AND BALANCE'));
  if (dlStatementBtn) dlStatementBtn.addEventListener('click', () => runDownloadWithSpinner(dlStatementBtn, 'payment-statement-for-pdf', 'Fee_Statement', 'FEE STATEMENT'));

  if (ledgerTableContainer) {
    ledgerTableContainer.addEventListener("click", async (e) => {
      if (e.target.classList.contains("reverse-btn")) {
        const btn = e.target;
        const paymentId = btn.dataset.id;
        const reason = prompt("Please enter a reason for this reversal:");

        if (reason) {
          btn.disabled = true;
          btn.textContent = "...";
          const res = await secureFetch(`${API_BASE}/users/reverse`, {
            method: "POST",
            body: JSON.stringify({ paymentId, reason })
          });
          
          if (res) {
            showToast("Payment reversed", "success");
            ledgerCache.clear(); // Clear ledger cache
            if (currentLedgerAdmission && currentLedgerName) openLedger(currentLedgerAdmission, currentLedgerName, currentLedgerPage, true);
            accountsCache.clear(); // Invalidate cache
            loadAccounts(currentPage, true);
          } else {
            btn.disabled = false;
            btn.textContent = "Reverse";
          }
        }
      }
    });
  }

  // ---------------------------
  // MANUAL B/F BALANCE LOGIC
  // ---------------------------
  if (addBFBtn) {
    addBFBtn.addEventListener("click", () => {
      document.getElementById("bfAdmission").value = "";
      document.getElementById("bfAmount").value = "";
      document.getElementById("bfType").value = "surplus";
      if (bfYearInput) bfYearInput.value = new Date().getFullYear();
      
      bfModal.style.display = "flex";
      requestAnimationFrame(() => bfModal.classList.add("visible"));
    });
  }

  if (cancelBFBtn) {
    cancelBFBtn.addEventListener("click", () => {
      bfModal.classList.remove("visible");
      setTimeout(() => bfModal.style.display = "none", 200);
    });
  }

  if (saveBFBtn) {
    saveBFBtn.addEventListener("click", async () => {
      const admission = document.getElementById("bfAdmission").value.trim();
      const amountVal = document.getElementById("bfAmount").value;
      const type = document.getElementById("bfType").value;
      const year = document.getElementById("bfYear").value;

      if (!admission || !amountVal || !year) {
        showToast("Please fill all fields", "error");
        return;
      }

      const amount = Number(amountVal);
      if (isNaN(amount) || amount <= 0) {
        showToast("Amount must be greater than 0", "error");
        return;
      }

      // Determine actual amount (Arrears = Negative Payment)
      const finalAmount = type === "arrears" ? -amount : amount;
      const reference = `MANUAL-BF-${admission}-${Date.now()}`;

      saveBFBtn.disabled = true;
      saveBFBtn.textContent = "Saving...";

      const res = await secureFetch(`${API_BASE}/users/record`, {
        method: "POST",
        body: JSON.stringify({
          admission,
          amount: finalAmount,
          method: "fund_transfer",
          reference,
          term: "Term 1", // Standard opening balance term
          academicYear: Number(year)
        })
      });

      if (res) {
        showToast("Brought forward balance saved", "success");
        
        // Show Success State in Modal with Download Button
        const modalBox = bfModal.querySelector('.confirm-box');
        const originalContent = modalBox.innerHTML;
        
        modalBox.innerHTML = `
          <div style="text-align:center; padding:20px;">
            <div style="font-size:40px; margin-bottom:10px;">✅</div>
            <h4>Balance Recorded Successfully</h4>
            <p>Reference: <strong>${reference}</strong></p>
            <p>Amount: <strong>${formatMoney(finalAmount)}</strong></p>
            <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
              <button id="closeBFSuccessBtn" class="btn secondary-btn">Close</button>
              <button id="downloadBFReceiptBtn" class="btn primary-btn">📄 Download Receipt</button>
            </div>
          </div>
        `;

        document.getElementById('closeBFSuccessBtn').addEventListener('click', () => {
          bfModal.classList.remove("visible");
          setTimeout(() => {
            bfModal.style.display = "none";
            modalBox.innerHTML = originalContent; // Restore form
            // Re-attach listeners would be needed if we reused the exact same elements, 
            // but since we reload the page or rely on static IDs, simpler to just let it reset on next open
            // actually safe way is to reload table and let user reopen modal if needed
          }, 200);
        });

        document.getElementById('downloadBFReceiptBtn').addEventListener('click', () => generateReceiptPDF({ reference, amount: finalAmount, admission, academicYear: year, term: "Term 1", method: "fund_transfer", createdAt: new Date() }));
        
        accountsCache.clear(); // Invalidate cache
        ledgerCache.clear();
        loadAccounts(currentPage, true);
      }

      saveBFBtn.disabled = false;
      saveBFBtn.textContent = "Save Balance";
    });
  }

  // ---------------------------
  // LISTENERS
  // ---------------------------
  if (classFilter) classFilter.addEventListener("change", () => loadAccounts(1));
  if (yearFilter) yearFilter.addEventListener("change", () => loadAccounts(1));
  if (termFilter) termFilter.addEventListener("change", () => loadAccounts(1));
  
  if (searchInput) {
    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadAccounts(1), 500);
    });
  }

  tableBody.addEventListener('click', (e) => {
    const payBtn = e.target.closest('.pay-btn');
    const ledgerBtn = e.target.closest('.ledger-btn');
    const viewBtn = e.target.closest('.view-fee-btn');

    if (payBtn) {
        const admission = payBtn.dataset.admission;
        const name = payBtn.dataset.name;
        const balance = payBtn.dataset.balance;
        openPayment(admission, name, balance);
    }

    if (ledgerBtn) {
        const admission = ledgerBtn.dataset.admission;
        const name = ledgerBtn.dataset.name;
        openLedger(admission, name);
    }

    if (viewBtn) {
        const admission = viewBtn.dataset.admission;
        const name = viewBtn.dataset.name;
        const grade = viewBtn.dataset.grade;
        openStudentFeeDetails(admission, name, grade, {
          expected: viewBtn.dataset.expected,
          paid: viewBtn.dataset.paid,
          balance: viewBtn.dataset.balance,
          term1Fee: viewBtn.dataset.term1fee,
          term2Fee: viewBtn.dataset.term2fee,
          term3Fee: viewBtn.dataset.term3fee,
          totalFee: viewBtn.dataset.totalfee
        });
    }
  });

  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAccounts(currentPage, true));
  if (prevBtn) prevBtn.addEventListener("click", () => loadAccounts(currentPage - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => loadAccounts(currentPage + 1));

  // Export PDF
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.text("Student Accounts Report", 14, 15);
      
      const rows = [];
      document.querySelectorAll("#accountsTable tbody tr").forEach(tr => {
        const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent);
        if (cells.length > 1) rows.push(cells.slice(0, 6)); // Exclude action col
      });

      doc.autoTable({
        head: [["Admission", "Name", "Grade", "Total Fee", "Paid", "Balance"]],
        body: rows,
        startY: 20
      });
      doc.save("accounts_report.pdf");
    });
  }

  // Init
  (async function init() {
    userProfile = await authService.getUserProfile(["accounts", "admin"]);
    if (!userProfile) return;
    // Initialize schoolInfoCache as a Map if it's not already
    if (!(schoolInfoCache instanceof Map)) schoolInfoCache = new Map();
    authService.initLogout();
    await getSchoolInfo(); // Fetch school info to populate schoolInfoCache
    populateGradeFilters(); // Call after school info is loaded
    loadAccounts();
  })();
})();
