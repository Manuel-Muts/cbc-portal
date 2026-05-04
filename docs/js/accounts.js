// docs/js/accounts.js
(function () {
  const API_BASE = config.api.baseURL;

  // ---------------------------
  // STYLES FOR COMPACTNESS
  // ---------------------------
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    #feeStructuresTable th, #feeStructuresTable td, 
    #outstandingFeesTable th, #outstandingFeesTable td { padding: 5px 8px !important; font-size: 0.82rem !important; vertical-align: middle; border-bottom: 1px solid #edf2f7; }
    #feeStructuresTable th, #outstandingFeesTable th { background-color: #f8fafc; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.025em; }
    .status-badge { padding: 2px 6px !important; font-size: 0.7rem !important; font-weight: 600 !important; border-radius: 4px !important; display: inline-block; }
    .stat-card { padding: 12px !important; }
    .stat-card p { font-size: 1.3rem !important; }
    .card { padding: 15px !important; }
    .btn { padding: 3px 8px !important; font-size: 0.75rem !important; }
  `;
  document.head.appendChild(compactStyle);

  // ---------------------------
  // Ensure jsPDF and autoTable are loaded for PDF exports
  // This is a client-side check. The HTML file must include the scripts.
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js"></script>
  // ---------------------------
  function isPdfAutoTableReady() {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      return false;
    }
    if (typeof window.jspdf.jsPDF.API !== 'undefined' && typeof window.jspdf.jsPDF.API.autoTable !== 'undefined') {
      return true;
    }
    return typeof window.jspdf.autoTable === 'function';
  }

  // ---------------------------
  // Cache State
  let userProfile = null;
  let statsCache = null;
  let statsLastFetch = 0;
  let feeStructuresCache = null; // Cache for fee structures list
  let globalNoteCache = {}; // Cache for global fee notes
  let feesLastFetch = 0; 
  const schoolInfoCache = new Map(); // Changed to Map for caching different field requests
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Ledger Modal State
  let currentLedgerAdmission = null;
  let currentLedgerName = null;
  let currentLedgerPage = 1;

  // Pagination for Fee Structures
  let feeStructuresPage = 1;
let feeStructuresCachePage = 1;
let feeStructuresTotalPages = 1;
const FEE_STRUCTURES_LIMIT = 10;


  // DOM Elements
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Fee Balance Section DOM Elements
  const outstandingTableBody = document.getElementById("outstandingFeesTableBody");
  const outstandingGradeFilter = document.getElementById("outstandingGradeFilter"); // Corrected name
  const outstandingYearFilter = document.getElementById("outstandingYearFilter");
  // const outstandingTermFilter = document.getElementById("outstandingTermFilter"); // Not present in HTML for Fee Balance
  const outstandingSortFilter = document.getElementById("outstandingSortFilter");
  const outstandingSearchInput = document.getElementById("outstandingSearchInput");
  const outstandingPageInfo = document.getElementById("outstandingPageInfo");
  const outstandingPrevBtn = document.getElementById("outstandingPrevBtn");
  const outstandingNextBtn = document.getElementById("outstandingNextBtn");
  const downloadOutstandingPDF = document.getElementById("downloadOutstandingPDF");
  
  // Payment Overview Section DOM Elements
  const overviewYearFilter = document.getElementById("overviewYearFilter");
  const overviewTermFilter = document.getElementById("overviewTermFilter");
  const overviewClassFilter = document.getElementById("overviewClassFilter");

  // Fee Structures DOM Elements
  const feeStructuresPageInfo = document.getElementById("feeStructuresPageInfo");
  const feeStructuresPrevBtn = document.getElementById("feeStructuresPrevBtn");
  const feeStructuresNextBtn = document.getElementById("feeStructuresNextBtn");
  const editFeeModal = document.getElementById("editFeeModal");
  const cancelEditFeeBtn = document.getElementById("cancelEditFeeBtn");
  const updateFeeBtn = document.getElementById("updateFeeBtn");
  const openPostFeeBtn = document.getElementById("openPostFeeBtn");
  const postFeeModal = document.getElementById("postFeeModal");
  const cancelPostFeeBtn = document.getElementById("cancelPostFeeBtn");
  const postedFeesYearFilter = document.getElementById("postedFeesYearFilter");
  const postedFeesClassFilter = document.getElementById("postedFeesClassFilter");
  const saveFeeBtn = document.getElementById("saveFeeBtn");
  const downloadAllFeeStructuresBtn = document.getElementById("downloadAllFeeStructuresBtn");

  // Manual B/F Elements
  const addBFBtn = document.getElementById("addBFBtn");
  const bfModal = document.getElementById("bfModal");
  const cancelBFBtn = document.getElementById("cancelBFBtn");
  const saveBFBtn = document.getElementById("saveBFBtn");
  const bfYearInput = document.getElementById("bfYear");

  // Student Fee Details Modal Elements
  const studentFeeDetailsModal = document.getElementById("studentFeeDetailsModal");
  const studentFeeModalBody = document.getElementById("studentFeeModalBody");
  const closeStudentFeeDetailsBtn = document.getElementById("closeStudentFeeDetailsBtn");
  const dlStructureBtn = document.getElementById("dlStructureBtn");
  const dlStatementBtn = document.getElementById("dlStatementBtn");
  const ledgerStudentName = document.getElementById("ledgerStudentName");

  // Global Fee Note Elements
  const globalNoteContent = document.getElementById("globalNoteContent");
  const globalFeeNoteInput = document.getElementById("globalFeeNoteInput");
  const noteYearDisplay = document.getElementById("noteYearDisplay");
  const applyGlobalNoteFiltersBtn = document.getElementById("applyGlobalNoteFilters");
  const editGlobalNoteBtn = document.getElementById("editGlobalNoteBtn");
  const cancelGlobalNoteBtn = document.getElementById("cancelGlobalNoteBtn");
  const saveGlobalNoteBtn = document.getElementById("saveGlobalNoteBtn");
  const globalNoteEditMode = document.getElementById("globalNoteEditMode");

  // Pagination for Outstanding Fees
  let outstandingPage = 1;
  let outstandingTotalPages = 1;
  let outstandingCache = new Map(); // Cache for outstanding fees
  const outstandingLimit = 10; // Define outstandingLimit

  // Current student details for PDF generation
  let currentStudentDetails = null;

  // ---------------------------
  // HELPERS
  // ---------------------------
    function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const activePane = document.getElementById(target);
      if (activePane) activePane.classList.add("active");
    });
  });
}

  function setupSidebarNavigation() {
    const menuItems = document.querySelectorAll(".sidebar .menu li[data-section]");
    const mainSections = document.querySelectorAll(".main-section");

    menuItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetSectionId = item.dataset.section;
        if (!targetSectionId) return;

        // Update active class in sidebar
        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        // Toggle visibility of main sections and load data
        mainSections.forEach(section => {
          section.style.display = section.id === targetSectionId ? "block" : "none";
        });

        if (targetSectionId === "feesPaymentOverviewSection") {
           loadStats();
        } else if (targetSectionId === "postedFeesSection") {
           loadFeeStructures();
        } else if (targetSectionId === "feeBalanceSection") {
           loadOutstandingFees(1);
        } else if (targetSectionId === "feesPaymentOverviewSection") {
           loadStats();
        } else if (targetSectionId === "instructionsSection") {
           loadGlobalFeeNote();
        }
      });
    });
  }

  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    let finalUrl = url;
    if (options.query) {
      const queryString = new URLSearchParams(options.query).toString();
      finalUrl = `${url}?${queryString}`;
    }

    const res = await fetch(finalUrl, { ...options, headers });
    if (res.status === 401 || res.status === 403) return authService.redirectToLogin();
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || "Request failed");
    }
    return res.json();
  }
 
  async function getSchoolInfo(options = {}) {
    const fieldsQuery = options.fields || 'all'; // Default to 'all' if no specific fields requested
    const cacheKey = `my-school-${fieldsQuery}`;

    if (schoolInfoCache.has(cacheKey)) {
      const cached = schoolInfoCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    try {
      const queryParams = options.fields ? { fields: options.fields } : {};
      const schoolData = await secureFetch(`${API_BASE}/my-school`, { query: queryParams });
      schoolInfoCache.set(cacheKey, { timestamp: Date.now(), data: schoolData });
      return schoolData;
    } catch (e) {
      console.error("School info fetch failed", e);
      return { name: "SCHOOL NAME" };
    }
  }

  // ---------------------------
  // LOAD DASHBOARD DATA
  // ---------------------------
  async function loadDashboardData(forceRefresh = false) {
    if(refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Refreshing...";
    }

    try {
      // This function is now primarily for the overall refresh button,
      // individual section loads are handled by setupSidebarNavigation.
      // For a full refresh, we can call all of them.
      await Promise.all([loadStats(forceRefresh), loadFeeStructures(forceRefresh), loadOutstandingFees(1, forceRefresh), loadGlobalFeeNote(forceRefresh)]);
    } catch (err) {
      console.error("Dashboard load error", err);
    } finally {
        if(refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = "🔄 Refresh Data";
        }
    }
  }

  // ---------------------------
  // STATS & CHART
  // ---------------------------
  async function loadStats(forceRefresh = false) {
      // Fetch a sample of accounts to calculate totals
      try {
        const grade = overviewClassFilter ? overviewClassFilter.value : "";
        const year = overviewYearFilter ? overviewYearFilter.value : "";
        const term = overviewTermFilter ? overviewTermFilter.value : "";
        
        // Cache key should include filters to avoid stale data when switching
        const cacheKey = `stats_${grade}_${year}_${term}`;
        
        if (!forceRefresh && statsCache && statsCache.key === cacheKey && (Date.now() - statsLastFetch < CACHE_TTL)) {
            calculateTotals(statsCache.data, term, statsCache.total); // Recalculate totals with current term filter
            return;
        }

        const query = new URLSearchParams({ academicYear: year, limit: 1000, page: 1 });
        if (grade) query.append("class", grade);

        const data = await secureFetch(`${API_BASE}/accounts?${query.toString()}`);
        const accounts = data.accounts || []; // Ensure it's 'accounts' from the API response
        const total = data.total || accounts.length;
        statsCache = { key: cacheKey, data: accounts, total: total };
        statsLastFetch = Date.now();
        calculateTotals(accounts, term, total);
      } catch (e) {
          console.error("Failed to load stats", e);
      }
  }

  function calculateTotals(data, termFilter = "", totalCount = 0) {
    let expected = 0;
    let paid = 0;
    const termKey = termFilter ? termFilter.toLowerCase().replace(/\s+/g, '') : null; // e.g. "term1"

    data.forEach(r => {
      if (termKey && r.termBalances && r.termBalances[termKey]) {
        expected += (r.termBalances[termKey].fee || 0);
        paid += (r.termBalances[termKey].paid || 0);
      } else {
        expected += (r.expected || 0);
        paid += (r.paid || 0);
      }
    });

    // Update DOM
    if(document.getElementById("totalLearners")) document.getElementById("totalLearners").textContent = totalCount.toLocaleString();
    if(document.getElementById("totalExpected")) document.getElementById("totalExpected").textContent = `KES ${expected.toLocaleString()}`;
    if(document.getElementById("totalPaid")) document.getElementById("totalPaid").textContent = `KES ${paid.toLocaleString()}`;
    if(document.getElementById("totalBalance")) document.getElementById("totalBalance").textContent = `KES ${(expected - paid).toLocaleString()}`;

    drawChart(expected, paid);
  }

  function drawChart(expected, paid) {
    const canvas = document.getElementById("feesChart");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const balance = expected - paid;
    const max = Math.max(expected, paid, balance) || 1;
    const barWidth = 60;
    // Adjust base line
    const base = canvas.height - 20; 

    function bar(x, val, label, color) {
        // Calculate height relative to max value
        const h = (val / max) * (canvas.height - 40);
        
        ctx.fillStyle = color;
        ctx.fillRect(x, base - h, barWidth, h);
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        
        // Label below bar
        ctx.fillText(label, x + barWidth/2, base + 15);
        
        // Value inside or above bar
        ctx.fillStyle = "#000";
        ctx.fillText(val.toLocaleString(), x + barWidth/2, base - h - 5);
    }

    // Draw bars with spacing
    bar(50, expected, "Expected", "#0078D4");
    bar(150, paid, "Paid", "#28a745");
    bar(250, balance, "Balance", "#dc3545");
  }

  // ---------------------------
  // FEE STRUCTURES LOGIC
  // ---------------------------
  async function loadFeeStructures(forceRefresh = false, page = feeStructuresPage) {
    try {
      // Get filter values from the Posted Fees section
      const year = postedFeesYearFilter ? postedFeesYearFilter.value : "";
      const grade = postedFeesClassFilter ? postedFeesClassFilter.value : "";

      // Construct a cache key that includes the filters
      const cacheKey = `feeStructures_${year}_${grade}_p${page}`;

      if (!forceRefresh && feeStructuresCache && feeStructuresCachePage === feeStructuresPage && (Date.now() - feesLastFetch < CACHE_TTL) && feeStructuresCache.key === cacheKey) {
        renderFeeStructures(feeStructuresCache);
        updateFeeStructuresPaginationControls();
        return;
      }
      const query = new URLSearchParams({ page: page, limit: FEE_STRUCTURES_LIMIT });
      if (year) query.append("academicYear", year);
      if (grade) query.append("grade", grade);

      const payload = await secureFetch(`${API_BASE}/accounts/fee-structures?${query.toString()}`);
      const list = Array.isArray(payload) ? payload : payload.data || [];
      const pagination = payload.pagination || {};

      const tbody = document.getElementById('feeStructuresTableBody');
      if (!tbody) return;

      feeStructuresCache = list;
      feeStructuresCache.key = cacheKey; // Store the key with the cache
      feesLastFetch = Date.now(); // Update timestamp for cache
      feeStructuresTotalPages = pagination.totalPages || 1;
      feeStructuresPage = pagination.page || feeStructuresPage;

      renderFeeStructures(list);
      updateFeeStructuresPaginationControls();

    } catch (err) {
      console.error('Load fee structures error', err);
    }
  }

  function renderFeeStructures(list) {
      const tbody = document.getElementById('feeStructuresTableBody');
      if (!tbody) return;
      
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
          <td style="white-space: nowrap;">
            <button class="btn secondary-btn edit-fee-btn" data-id="${f._id}">Edit</button>
            <button class="btn danger-btn delete-fee-btn" data-id="${f._id}">Delete</button>
          </td>
        </tr>
      `).join('');

      // Attach edit listeners
      tbody.querySelectorAll('.edit-fee-btn').forEach(btn => {
          btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              const fee = list.find(item => item._id === id);
              if (fee) openEditFeeModal(fee);
          });
      });

      // Attach delete listeners
      tbody.querySelectorAll('.delete-fee-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
              if(confirm("Delete this fee structure?")) {
                  await secureFetch(`${API_BASE}/accounts/fee-structure/${btn.dataset.id}`, { method: 'DELETE' });
                  loadFeeStructures(true);
              }
          });
      });
  }

  function updateFeeStructuresPaginationControls() {
    if (feeStructuresPageInfo) {
      feeStructuresPageInfo.textContent = `Page ${feeStructuresPage} of ${feeStructuresTotalPages}`;
    }
    if (feeStructuresPrevBtn) {
      feeStructuresPrevBtn.disabled = feeStructuresPage <= 1;
    }
    if (feeStructuresNextBtn) {
      feeStructuresNextBtn.disabled = feeStructuresPage >= feeStructuresTotalPages;
    }
  }

  if (feeStructuresPrevBtn) {
    feeStructuresPrevBtn.addEventListener('click', () => {
      if (feeStructuresPage > 1) {
        feeStructuresPage -= 1;
        loadFeeStructures(true);
      }
    });
  }
  if (feeStructuresNextBtn) {
    feeStructuresNextBtn.addEventListener('click', () => {
      if (feeStructuresPage < feeStructuresTotalPages) {
        feeStructuresPage += 1;
        loadFeeStructures(true);
      }
    });
  }

  // ---------------------------
  // OUTSTANDING FEES LOGIC
  // ---------------------------
  async function loadOutstandingFees(page = 1, forceRefresh = false) {
    if (!outstandingTableBody) {
      console.error("Error: outstandingFeesTableBody element not found in the DOM. Please ensure it exists in accounts.html.");
      return;
    }
    outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';

    const grade = outstandingGradeFilter ? outstandingGradeFilter.value : "";
    const year = outstandingYearFilter?.value || new Date().getFullYear();
    const term = ""; // No term filter in HTML for outstanding fees section
    const sort = outstandingSortFilter ? outstandingSortFilter.value : "balance_desc";
    const search = outstandingSearchInput.value.trim();

    const cacheKey = `outstanding_${grade}_${year}_${term}_${sort}_${search}_p${page}`;
    if (!forceRefresh && outstandingCache.has(cacheKey)) {
      const cached = outstandingCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        renderOutstandingTable(cached.data.students || [], outstandingTableBody);
        outstandingPage = cached.data.currentPage || 1;
        outstandingTotalPages = cached.data.totalPages || 1;
        updateOutstandingPagination();
        return;
      }
    }
    const query = new URLSearchParams({ academicYear: year, limit: outstandingLimit, page: page });
    if (grade) query.append("class", grade);
    // if (term) query.append("term", term); // Removed as there's no term filter in HTML
    if (sort) query.append("sort", sort);
    if (search) query.append("name", search);

    try {
        const data = await secureFetch(`${API_BASE}/reports/outstanding-fees?${query.toString()}`);
        outstandingCache.set(cacheKey, { timestamp: Date.now(), data });
        renderOutstandingTable(data.students || [], outstandingTableBody);
        
        // Update pagination state
        outstandingPage = data.currentPage || 1;
        outstandingTotalPages = data.totalPages || 1;
        updateOutstandingPagination();

    } catch (err) {
        console.error(err);
        outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Error loading data.</td></tr>';
    }
  }

  function updateOutstandingPagination() {
    if (outstandingPageInfo) outstandingPageInfo.textContent = `Page ${outstandingPage} of ${outstandingTotalPages}`;
    if (outstandingPrevBtn) outstandingPrevBtn.disabled = outstandingPage <= 1;
    if (outstandingNextBtn) outstandingNextBtn.disabled = outstandingPage >= outstandingTotalPages;
  }

 function renderOutstandingTable(accounts, outstandingTableBody) {
    if (accounts.length === 0) {
        outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No students with outstanding balances found.</td></tr>';
        return;
    }

    // Store data in DOM for easy retrieval or pass relevant data in data attributes
    outstandingTableBody.innerHTML = accounts.map(s => {
        let balance = (s.balance !== undefined && s.balance !== null) ? s.balance : ((s.expected || 0) - (s.paid || 0));
        
        if (balance <= 0) return ''; // Only show those with a balance
        const safeName = (s.studentName || s.name || 'Unknown').replace(/'/g, "&apos;");
        
        // Safely extract student ID (handle populated object or string)
        // If s is an Account, we want s.studentId. If s is Student, we want s._id.
        let studentId = s.studentId;
        if (studentId && typeof studentId === 'object') studentId = studentId._id;
        if (!studentId) studentId = s._id; // Fallback
        const admission = s.admission || s.admissionNo || '';

        // Determine Status Badge
        let statusBadge = '';
        const paidAmount = s.paid || 0;
        const totalFee = s.expected || 0;

        if (balance <= 0) {
            statusBadge = `<span class="status-badge status-paid" style="background:#d1fae5; color:#065f46;">Paid</span>`;
        } else if (paidAmount > 0 && balance > 0) {
            statusBadge = `<span class="status-badge status-partial" style="background:#fef3c7; color:#92400e;">Partial</span>`;
        } else {
            statusBadge = `<span class="status-badge status-unpaid" style="background:#fee2e2; color:#991b1b;">Unpaid</span>`;
        }

        return `
            <tr>
                <td>${s.admission || s.admissionNo || '-'}</td>
                <td>${safeName}</td>
                <td>${s.className || s.grade || '-'}</td>
                <td style="text-align: right; font-weight: bold; color: #dc3545;">${balance.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center;"><button class="btn secondary-btn view-fee-btn" data-id="${studentId}" data-admission="${admission}" data-name="${safeName}" data-grade="${s.className || s.grade || ''}">View</button></td>
            </tr>
        `;
    }).join('');

    if (outstandingTableBody.innerHTML === '') {
        outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No students with outstanding balances found.</td></tr>';
    }
  }

  // ---------------------------
  // VIEW STUDENT FEE DETAILS LOGIC
  // ---------------------------
  if (outstandingTableBody) {
    outstandingTableBody.addEventListener('click', async (e) => {
      if (e.target.classList.contains('view-fee-btn')) {
        const btn = e.target;
        const studentId = btn.dataset.id;
        const admission = btn.dataset.admission;
        const studentName = btn.dataset.name;
        const grade = btn.dataset.grade;
        
        await openStudentFeeDetails(studentId, admission, studentName, grade);
      }
    });
  }

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    try {
      authService.logout(); // or signOut depending on your setup
    } catch (e) {
      console.error("Logout error:", e);
    }
  });
}

  async function openStudentFeeDetails(studentId, admission, studentName, grade) {
    studentFeeModalBody.innerHTML = '<div style="text-align:center; padding:20px;">Loading details...</div>';
    studentFeeDetailsModal.style.display = 'flex';
    requestAnimationFrame(() => studentFeeDetailsModal.classList.add('visible'));
    
    const year = outstandingYearFilter.value || new Date().getFullYear();
    currentStudentDetails = { name: studentName, year };

    if (!admission) {
        studentFeeModalBody.innerHTML = '<div style="color:red; text-align:center;">Error: Missing Admission Number</div>';
        return;
    }

    try {
      // Fetch payments AND fee structures
      const [payRes, feesRes] = await Promise.all([
        secureFetch(`${API_BASE}/users/ledger/${admission}`),
        secureFetch(`${API_BASE}/accounts/fee-structures?limit=1000`)
      ]);

      const payData = payRes || { payments: [] };
      const feesData = Array.isArray(feesRes) ? feesRes : (feesRes.data || []);
      
      // Filter payments for the selected year only
      const allPayments = payData.payments || [];
      const payments = allPayments.filter(p => Number(p.academicYear) === Number(year));

      // Find Fee Structure
      const feeStructure = feesData.find(f => 
        f.academicYear === Number(year) && 
        (grade === f.grade || (grade.startsWith(f.grade) && !/\d/.test(grade.substring(f.grade.length))))
      );

      const fees = feeStructure || { term1Fee: 0, term2Fee: 0, term3Fee: 0, totalFee: 0 };
      
      // Calculate Term Totals
      const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
      payments.forEach(p => {
        if (termPaid[p.term] !== undefined) termPaid[p.term] += p.amount;
      });

      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalBalance = fees.totalFee - totalPaid;
      
      // Create HTML content
      let content = `
        <div id="fee-details-content">
          <div class="report-header" style="text-align:center; margin-bottom:20px; border-bottom: 2px solid #eee; padding-bottom: 10px;">
             <h2 style="margin:0;">FEE STATEMENT</h2>
             <p style="margin:5px 0;"><strong>Learner:</strong> ${studentName}</p>
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
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${(fees.term1Fee || 0).toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${termPaid["Term 1"].toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${(fees.term1Fee - termPaid["Term 1"]).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #ddd;">Term 2</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${(fees.term2Fee || 0).toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${termPaid["Term 2"].toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${(fees.term2Fee - termPaid["Term 2"]).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding:8px; border:1px solid #ddd;">Term 3</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${(fees.term3Fee || 0).toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${termPaid["Term 3"].toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; font-weight:bold;">${(fees.term3Fee - termPaid["Term 3"]).toLocaleString()}</td>
                </tr>
                <tr style="background:#f8f9fa; font-weight:bold;">
                  <td style="padding:8px; border:1px solid #ddd;">TOTAL</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${(fees.totalFee || 0).toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd;">${totalPaid.toLocaleString()}</td>
                  <td style="padding:8px; text-align:right; border:1px solid #ddd; color:${totalBalance > 0 ? '#dc3545' : '#28a745'};">${totalBalance.toLocaleString()}</td>
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
        payments.forEach(p => {
          content += `
            <tr>
              <td style="padding:8px; border-bottom:1px solid #eee;">${new Date(p.createdAt).toLocaleDateString()}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${p.reference}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${p.method}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${p.term}</td>
              <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">${p.amount.toLocaleString()}</td>
            </tr>
          `;
        });
      }

      content += `
              </tbody>
            </table>
          </div>
        </div>`;

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
      alert("PDF generation components not ready.");
      return;
    }
    
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

    // Add global payment instructions only for Fee Structure PDF
    if (elementId === 'fee-structure-for-pdf') { // Only for fee structure, not statement
        const year = outstandingYearFilter.value || new Date().getFullYear();
        let globalNote = "";
        try {
            const noteRes = await secureFetch(`${API_BASE}/payments/global-note?academicYear=${year}`);
            globalNote = noteRes?.note || "";
        } catch (err) {
            console.error("Error fetching global note for PDF:", err);
        }

        if (globalNote) {
            const officialInstructions = document.createElement('div');
            officialInstructions.innerHTML = `
                <div style="margin-top: 25px; padding: 15px; border: 1px solid #000; border-radius: 5px; background-color: #f0f0f0;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 5px;">OFFICIAL PAYMENT INSTRUCTIONS</h4>
                    <p style="margin: 0; font-size: 11px; line-height: 1.6; white-space: pre-wrap;">${globalNote}</p>
                </div>
            `;
            printContainer.appendChild(officialInstructions);
        }
    }

    document.body.appendChild(printContainer);

    try {
      const canvas = await html2canvas(printContainer, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);

      // Add footer with current date
      const dateStr = `Generated: ${new Date().toLocaleString()}`;
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(dateStr, 10, pdf.internal.pageSize.getHeight() - 10);
      pdf.text(`Page 1 of 1`, pdf.internal.pageSize.getWidth() - 10, pdf.internal.pageSize.getHeight() - 10, { align: 'right' });

      const fname = `${currentStudentDetails?.name || 'Student'}_${titleSuffix}.pdf`;
      pdf.save(fname);
    } catch(e) { 
        console.error(e); 
        alert("PDF generation failed"); 
    } finally {
        // 4. Clean up the temporary container
        document.body.removeChild(printContainer);
    }
  }

  if (dlStructureBtn) dlStructureBtn.addEventListener('click', () => generateModalPDF('fee-structure-for-pdf', 'Fee_Structure', 'FEE STRUCTURE AND BALANCE'));
  if (dlStatementBtn) dlStatementBtn.addEventListener('click', () => generateModalPDF('payment-statement-for-pdf', 'Fee_Statement', 'FEE STATEMENT'));

  // ---------------------------
  // EDIT FEE MODAL LOGIC
  // ---------------------------
  function openEditFeeModal(fee) {
    if (!editFeeModal) return;
    document.getElementById('editFeeId').value = fee._id;
    document.getElementById('editFeeGrade').value = fee.grade;
    document.getElementById('editFeeYear').value = fee.academicYear;
    document.getElementById('editFeeTerm1').value = fee.term1Fee;
    document.getElementById('editFeeTerm2').value = fee.term2Fee;
    document.getElementById('editFeeTerm3').value = fee.term3Fee;
    
    editFeeModal.style.display = "flex";
    requestAnimationFrame(() => editFeeModal.classList.add('visible'));
  }

  if (cancelEditFeeBtn) {
    cancelEditFeeBtn.addEventListener('click', () => {
      editFeeModal.classList.remove('visible');
      setTimeout(() => editFeeModal.style.display = "none", 200);
    });
  }

  if (updateFeeBtn) {
    updateFeeBtn.addEventListener('click', async () => {
      const id = document.getElementById('editFeeId').value;
      const grade = document.getElementById('editFeeGrade').value.trim();
      const year = Number(document.getElementById('editFeeYear').value);
      const t1 = Number(document.getElementById('editFeeTerm1').value);
      const t2 = Number(document.getElementById('editFeeTerm2').value);
      const t3 = Number(document.getElementById('editFeeTerm3').value);

      if (!grade || !year) return alert("Grade and Year are required");

      updateFeeBtn.disabled = true;
      updateFeeBtn.textContent = "Updating...";

      try {
        await secureFetch(`${API_BASE}/accounts/fee-structure/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 })
        });

        alert("Fee structure updated successfully!");
        editFeeModal.classList.remove('visible');
        setTimeout(() => editFeeModal.style.display = "none", 200);
        loadFeeStructures(true);
      } catch (e) {
        alert("Error: " + e.message);
      } finally {
        updateFeeBtn.disabled = false;
        updateFeeBtn.textContent = "Update Fee Structure";
      }
    });
  }

  // ---------------------------
  // POST FEE MODAL
  // ---------------------------
  if (openPostFeeBtn) {
    openPostFeeBtn.addEventListener('click', () => {
      if(postFeeModal) {
          postFeeModal.style.display = "flex";
          postFeeModal.classList.add('visible');
          // Default year
          const fy = document.getElementById('feeYear');
          if (fy && !fy.value) fy.value = new Date().getFullYear();
      }
    });
  }

  if (cancelPostFeeBtn) {
      cancelPostFeeBtn.addEventListener('click', () => {
          postFeeModal.classList.remove('visible');
          setTimeout(() => postFeeModal.style.display = "none", 200);
      });
  }

  if (saveFeeBtn) {
      saveFeeBtn.addEventListener('click', async () => {
          const grade = document.getElementById('feeGrade').value.trim();
          const year = Number(document.getElementById('feeYear').value);
          const t1 = Number(document.getElementById('feeTerm1').value);
          const t2 = Number(document.getElementById('feeTerm2').value);
          const t3 = Number(document.getElementById('feeTerm3').value);

          if(!grade || !year) return alert("Grade and Year are required");

          const payload = { grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 };
          
          saveFeeBtn.disabled = true;
          saveFeeBtn.textContent = "Saving...";

          try {
              await secureFetch(`${API_BASE}/accounts/fee-structure`, {
                  method: 'POST',
                  body: JSON.stringify(payload)
              });
              
              alert("Fee structure saved!");
              postFeeModal.classList.remove('visible');
              setTimeout(() => postFeeModal.style.display = "none", 200);
              loadFeeStructures(true);
          } catch(e) {
              alert("Error: " + e.message);
          } finally {
              saveFeeBtn.disabled = false;
              saveFeeBtn.textContent = "Save Fee Structure";
          }
      });
  }

  // ---------------------------
  // GLOBAL FEE NOTE LOGIC
  // ---------------------------
  async function loadGlobalFeeNote(forceRefresh = false) {
    const year = globalNoteYearFilter?.value; // Get the selected year
    if (!year) return;

    if (noteYearDisplay) noteYearDisplay.textContent = year;

    const cacheKey = `globalNote_${year}`;
    if (!forceRefresh && globalNoteCache[cacheKey] && (Date.now() - globalNoteCache[cacheKey].timestamp < CACHE_TTL)) {
      const cachedData = globalNoteCache[cacheKey].data;
      if (globalNoteContent && globalFeeNoteInput) {
        globalNoteContent.textContent = cachedData.note || 'No general instructions set for this year. Click "Edit" to add Paybill or Bank details.';
        globalNoteContent.style.fontStyle = cachedData.note ? "normal" : "italic";
        globalFeeNoteInput.value = cachedData.note || "";
      }
      return;
    }

    try {
      const data = await secureFetch(`${API_BASE}/payments/global-note?academicYear=${year}`);
      if (data && globalNoteContent && globalFeeNoteInput) { // Check if elements exist
        // Only update if the instructions section is currently visible or being loaded
        const instructionsSection = document.getElementById("instructionsSection");
        if (!instructionsSection || instructionsSection.style.display === "none") {
          // If not visible, just update the input value for when it becomes visible
          globalFeeNoteInput.value = data.note || "";
          return;
        }

        const note = data.note || "";
        globalNoteContent.textContent = note || 'No general instructions set for this year. Click "Edit" to add Paybill or Bank details.';
        globalNoteContent.style.fontStyle = note ? "normal" : "italic";
        globalFeeNoteInput.value = note;
        globalNoteCache[cacheKey] = { timestamp: Date.now(), data: data }; // Cache the fetched data
      }
    } catch (err) {
      console.error("Error loading global fee note:", err);
    }
  }

  async function saveGlobalFeeNote() {
    const year = globalNoteYearFilter?.value;
    const note = globalFeeNoteInput.value.trim();

    saveGlobalNoteBtn.disabled = true;
    saveGlobalNoteBtn.textContent = "Saving...";

    try {
      await secureFetch(`${API_BASE}/payments/global-note`, {
        method: 'POST',
        body: JSON.stringify({ academicYear: year, note })
      });

      showToast("Global instructions updated", "success");
      toggleGlobalNoteEdit(false);
      loadGlobalFeeNote(true); // Force refresh after saving
      delete globalNoteCache[`globalNote_${year}`]; // Invalidate cache for this year
    } catch (err) {
      alert("Error saving note: " + err.message);
    } finally {
      saveGlobalNoteBtn.disabled = false;
      saveGlobalNoteBtn.textContent = "Save for All Grades";
    }
  }

  function toggleGlobalNoteEdit(show) {
    if (globalNoteEditMode) globalNoteEditMode.style.display = show ? "block" : "none";
    if (globalNoteContent) globalNoteContent.style.display = show ? "none" : "block";
    if (editGlobalNoteBtn) editGlobalNoteBtn.style.display = show ? "none" : "inline-block";
  }

  if (editGlobalNoteBtn) editGlobalNoteBtn.addEventListener("click", () => toggleGlobalNoteEdit(true));
  if (cancelGlobalNoteBtn) cancelGlobalNoteBtn.addEventListener("click", () => toggleGlobalNoteEdit(false));
  if (saveGlobalNoteBtn) saveGlobalNoteBtn.addEventListener("click", saveGlobalFeeNote);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadDashboardData(true));
  }

  // ---------------------------
  // INIT
  // ---------------------------
  function populateYearFilters() {
    const currentYear = new Date().getFullYear(); // Keep current year for default selection
    const startYear = 2026;
    const endYear = 3026;

    // Re-fetch elements to ensure we have them even if top-level vars were null
    const yearSelectors = [
      document.getElementById("outstandingYearFilter"),
      document.getElementById("overviewYearFilter"),
      document.getElementById("postedFeesYearFilter"),
      document.getElementById("globalNoteYearFilter")
    ].filter(Boolean); // Filter out nulls

    yearSelectors.forEach(selector => {
      selector.innerHTML = ""; 
      for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        if (y === currentYear || (y === startYear && currentYear < startYear)) { // Select current year if within range, else select startYear
          option.selected = true;
        }
        selector.appendChild(option);
      }
    });
  }

  // Event Listeners for Filters
  // Fee Balance Section Filters
  outstandingGradeFilter?.addEventListener('change', () => {
    loadOutstandingFees(1, true);
  });
  outstandingYearFilter?.addEventListener('change', () => {
    loadOutstandingFees(1, true);
  });
  outstandingSortFilter?.addEventListener('change', () => loadOutstandingFees(1));

  // Payment Overview Section Filters
  overviewClassFilter?.addEventListener('change', () => {
    loadStats(true);
  });
  overviewYearFilter?.addEventListener('change', () => {
    loadStats(true);
  });
  overviewTermFilter?.addEventListener('change', () => {
    loadStats(true);
  });

  // Posted Fees Section Filters
  postedFeesYearFilter?.addEventListener('change', () => {
    loadFeeStructures(true);
  });
  postedFeesClassFilter?.addEventListener('change', () => {
    loadFeeStructures(true);
  });

  // Global Note Section Filters
  globalNoteYearFilter?.addEventListener('change', () => {
    loadGlobalFeeNote(true);
  });
  applyGlobalNoteFiltersBtn?.addEventListener('click', () => loadGlobalFeeNote(true));

  // Combined listeners that affect multiple sections (if any)
  // The original code had outstandingYearFilter change affecting loadStats, loadGlobalFeeNote, loadFeeStructures.
  // This is now broken down into specific filter buttons/changes for each section.
  // For now, I'm assuming section-specific filters only affect their own section.
  outstandingYearFilter?.addEventListener('change', () => {
    loadOutstandingFees(1, true); 
    // If loadStats, loadGlobalFeeNote, loadFeeStructures should also react to this,
    // their respective change listeners or apply buttons should be used.
    // For now, keeping it focused on outstanding fees.
  });

  if (outstandingPrevBtn) outstandingPrevBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage - 1));
  if (outstandingNextBtn) outstandingNextBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage + 1));
  
  let outstandingDebounce;
  outstandingSearchInput?.addEventListener('input', () => {
      clearTimeout(outstandingDebounce);
      outstandingDebounce = setTimeout(() => loadOutstandingFees(1), 500);
  });

  // Download Outstanding Fees PDF
  // This listener was duplicated in the provided context, keeping only one.
  downloadOutstandingPDF?.addEventListener('click', () => {
    if (!isPdfAutoTableReady()) {
      showToast("PDF AutoTable plugin not loaded. Ensure jspdf-autotable.min.js is included in accounts.html.", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Outstanding Fees Report", 14, 15);
    
    const rows = [];
    document.querySelectorAll("#outstandingFeesTable tbody tr").forEach(tr => {
      const cells = Array.from(tr.querySelectorAll("td")).map(td => td.textContent);
      if (cells.length > 1) rows.push(cells);
    });

    doc.autoTable({
      head: [["Admission", "Name", "Grade", "Balance"]],
      body: rows,
      startY: 20
    ,
      didDrawPage: (data) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        const dateStr = `Generated: ${new Date().toLocaleString()}`;
        doc.text(dateStr, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
        
        if (data.pageCount && data.pageCount > 1) {
          doc.text(`Page ${data.pageNumber} of ${data.pageCount}`, doc.internal.pageSize.getWidth() - data.settings.margin.right, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        }
      }
    });

    // Add Global Note at the bottom of the table
    const note = globalNoteContent?.textContent.trim();
    if (note && !note.includes("No general instructions set")) {
        let finalY = doc.lastAutoTable.cursor.y || 20;
        
        // Add a background rectangle for the instructions section
        const rectX = 10;
        const rectY = finalY + 10;
        const rectWidth = doc.internal.pageSize.getWidth() - (2 * rectX);
        const initialTextHeight = 20; // Estimate for title and some padding
        const splitNote = doc.splitTextToSize(note, rectWidth - 10); // Adjust width for padding
        const noteTextHeight = splitNote.length * doc.getLineHeight() / doc.internal.scaleFactor;
        const rectHeight = initialTextHeight + noteTextHeight + 10; // Total height for the box

        doc.setFillColor(240, 240, 240); // Light grey background
        doc.rect(rectX, rectY, rectWidth, rectHeight, 'F');
        doc.setDrawColor(0, 0, 0); // Black border
        doc.setLineWidth(0.5);
        doc.rect(rectX, rectY, rectWidth, rectHeight, 'S');

        // Add title
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0); // Black text
        doc.text("OFFICIAL PAYMENT INSTRUCTIONS", rectX + (rectWidth / 2), rectY + 8, { align: 'center' });
        
        // Add a separator line below the title
        doc.setDrawColor(200, 200, 200); // Light grey line
        doc.setLineWidth(0.2);
        doc.line(rectX + 5, rectY + 12, rectX + rectWidth - 5, rectY + 12);

        // Add the note content
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(50, 50, 50); // Dark grey text
        doc.text(splitNote, rectX + 5, rectY + 18);
    }

    doc.save("outstanding_fees_report.pdf");
  });

  // Initial Load
  // setupTabs(); // Setup inner tabs
  // setupSidebarNavigation(); // Setup main sidebar navigation
  // loadDashboardData(); // This needs to be refactored

  // New init function to handle initial loading of the default active section
  (async function init() {
    userProfile = await authService.getUserProfile(["accounts", "admin"]);
    if (!userProfile) return;
    authService.initLogout();

    // Populate all academic year filters across sections (2026 - 3026)
    populateYearFilters();

    setupSidebarNavigation(); // Setup main sidebar navigation

    // Trigger initial load for the default active section
    let initialActiveSidebarItem = document.querySelector(".sidebar .menu li.active[data-section]");
    // If "Overview" was active, default to "Payment Overview"
    if (!initialActiveSidebarItem || initialActiveSidebarItem.dataset.section === "dashboardSection") {
      initialActiveSidebarItem = document.querySelector(".sidebar .menu li[data-section='feesPaymentOverviewSection']");
      if (initialActiveSidebarItem) initialActiveSidebarItem.classList.add('active'); // Set "Payment Overview" as active
    }
    if (initialActiveSidebarItem) {
      initialActiveSidebarItem.dispatchEvent(new Event('click'));
    }
  })();

  // Download All Fee Structures PDF (this handler was already correct)
  if (downloadAllFeeStructuresBtn) {
    downloadAllFeeStructuresBtn.addEventListener('click', async () => {
      try {
        showToast("Generating Fee Structures PDF...", "info");
        const token = authService.getToken();
        const res = await fetch(`${API_BASE}/reports/fee-structures`, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to generate PDF: ${res.status} - ${errorText}`);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fee_structures_report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast("Fee Structures PDF downloaded successfully!", "success");
      } catch (err) {
        console.error("Error generating Fee Structures PDF:", err);
        showToast(err.message || "Failed to generate Fee Structures PDF.", "error");
      }
    });
  }

})();
