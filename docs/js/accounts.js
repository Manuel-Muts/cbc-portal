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
  // Cache State - All as Maps
  // ---------------------------
  let userProfile = null;
  let statsCache = new Map();
  let statsLastFetch = 0;
  let feeStructuresCache = new Map();
  let globalNoteCache = new Map();
  let feesLastFetch = 0;
  const schoolInfoCache = new Map();
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

  // Pagination for Expenses
  let expensesPage = 1;
  let expensesTotalPages = 1;
  let expensesTotalCount = 0;
  const EXPENSES_LIMIT = 50;

  // DOM Elements
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Fee Balance Section DOM Elements
  const outstandingTableBody = document.getElementById("outstandingFeesTableBody");
  const outstandingGradeFilter = document.getElementById("outstandingGradeFilter");
  const outstandingYearFilter = document.getElementById("outstandingYearFilter");
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

  // Expense Elements
  const expenseModal = document.getElementById("expenseModal");
  const openExpenseModalBtn = document.getElementById("openExpenseModal");
  const closeExpenseModalBtn = document.getElementById("closeExpenseModal");
  const saveExpenseBtn = document.getElementById("saveExpenseBtn");
  const expenseTableBody = document.getElementById("expensesTableBody");
  const expensePageInfo = document.getElementById("expensePageInfo");
  const expensePrevBtn = document.getElementById("expensePrevBtn");
  const expenseNextBtn = document.getElementById("expenseNextBtn");

  // Student Fee Details Modal Elements
  const studentFeeDetailsModal = document.getElementById("studentFeeDetailsModal");
  const studentFeeModalBody = document.getElementById("studentFeeModalBody");
  const closeStudentFeeDetailsBtn = document.getElementById("closeStudentFeeDetailsBtn");
  const dlStructureBtn = document.getElementById("dlStructureBtn");
  const dlStatementBtn = document.getElementById("dlStatementBtn");

  // Global Fee Note Elements
  const globalNoteContent = document.getElementById("globalNoteContent");
  const globalFeeNoteInput = document.getElementById("globalFeeNoteInput");
  const noteYearDisplay = document.getElementById("noteYearDisplay");
  const applyGlobalNoteFiltersBtn = document.getElementById("applyGlobalNoteFilters");
  const editGlobalNoteBtn = document.getElementById("editGlobalNoteBtn");
  const cancelGlobalNoteBtn = document.getElementById("cancelGlobalNoteBtn");
  const saveGlobalNoteBtn = document.getElementById("saveGlobalNoteBtn");
  const globalNoteEditMode = document.getElementById("globalNoteEditMode");
  const globalNoteYearFilter = document.getElementById("globalNoteYearFilter");

  // Pagination for Outstanding Fees
  let outstandingPage = 1;
  let outstandingTotalPages = 1;
  let outstandingCache = new Map();
  const outstandingLimit = 10;

  // Current student details for PDF generation
  let currentStudentDetails = null;

  // ---------------------------
  // HELPERS
  // ---------------------------
  function setupSidebarNavigation() {
    const menuItems = document.querySelectorAll(".sidebar .menu li[data-section]");
    const mainSections = document.querySelectorAll(".main-section");
    menuItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetSectionId = item.dataset.section;
        if (!targetSectionId) return;
        
        menuItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        
        mainSections.forEach(section => {
          section.style.display = section.id === targetSectionId ? "block" : "none";
        });
        
        if (targetSectionId === "feesPaymentOverviewSection") {
          loadStats();
        } else if (targetSectionId === "postedFeesSection") {
          loadFeeStructures();
        } else if (targetSectionId === "feeBalanceSection") {
          loadOutstandingFees(1);
        } else if (targetSectionId === "expensesSection") {
          loadExpenses();
        } else if (targetSectionId === "instructionsSection") {
          loadGlobalFeeNote();
        }
      });
    });
  }

  // ---------------------------
  // SCHOOL TYPE & GRADE HELPERS
  // ---------------------------
    const SCHOOL_TYPES = {
        full: {
            label: "Full School (PP1-12)",
            gradeOptions: ["PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
        },
        primary_junior: {
            label: "Primary + Junior ( PP1-9)",
            gradeOptions: ["PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
        },
        senior: {
            label: "Senior School (Grades 10-12)",
            gradeOptions: ["10","11","12"]
        }
    };

  function getSchoolTypeKey() {
    const schoolInfoEntry = schoolInfoCache.get('school-all');
    const schoolInfo = schoolInfoEntry ? schoolInfoEntry.data : null;
    if (!schoolInfo || !schoolInfo.schoolType) return 'full';
    const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
    if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
    if (rawType.includes('senior')) return 'senior';
    return 'full';
  }

  // ---------------------------
  // SECURE FETCH
  // ---------------------------
  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    const headers = { ...options.headers, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    
    let finalUrl = url;
    if (options.query) {
      const queryString = new URLSearchParams(options.query).toString();
      const separator = url.includes("?") ? "&" : "?";
      finalUrl = `${url}${separator}${queryString}`;
    }
    
    const res = await fetch(finalUrl, { ...options, headers });
    if (res.status === 401 || res.status === 403) return authService.redirectToLogin();
    
    const contentType = res.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    
    if (!res.ok) {
      let errorMessage = "Request failed";
      if (isJson) {
        const errorData = await res.json().catch(() => ({ message: "Failed to parse JSON error" }));
        errorMessage = errorData.message || JSON.stringify(errorData);
      } else {
        errorMessage = await res.text();
        if (errorMessage.length > 200) errorMessage = errorMessage.substring(0, 200) + "... (non-JSON error response)";
      }
      throw new Error(errorMessage);
    }
    
    if (!isJson) {
      const textResponse = await res.text();
      throw new Error(`Expected JSON response, but received ${contentType || 'unknown content type'}. Status: ${res.status}.`);
    }
    
    return res.json();
  }

  async function getSchoolInfo(options = {}) {
    const fieldsQuery = options.fields || 'all';
    const cacheKey = `school-${fieldsQuery}`;
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
      return { name: "SCHOOL NAME", schoolType: "full" };
    }
  }

  // ---------------------------
  // HELPERS - NOTIFICATIONS
  // ---------------------------
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    
    if (type === "success") {
      toast.style.backgroundColor = "#28a745";
    } else if (type === "error") {
      toast.style.backgroundColor = "#dc3545";
    } else {
      toast.style.backgroundColor = "#0078D4";
    }
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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
      await Promise.all([
        loadStats(forceRefresh),
        loadFeeStructures(forceRefresh),
        loadOutstandingFees(1, forceRefresh),
        loadGlobalFeeNote(forceRefresh),
        loadExpenses(forceRefresh)
      ]);
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
  // EXPENSES LOGIC
  // ---------------------------
  async function loadExpenses(forceRefresh = false, newPage = 1) {
    const year = document.getElementById("expenseYearFilter")?.value || new Date().getFullYear();
    const term = document.getElementById("expenseTermFilter")?.value || "";
    const category = document.getElementById("expenseCategoryFilter")?.value || "";
    if (!expenseTableBody) return;
    expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    try {
      // Set current page
      expensesPage = newPage;
      
      // Build query parameters
      let queryParams = `academicYear=${year}&page=${expensesPage}&limit=${EXPENSES_LIMIT}`;
      if (term) queryParams += `&term=${encodeURIComponent(term)}`;
      if (category) queryParams += `&category=${encodeURIComponent(category)}`;
      
      const [expenseData, incomeData] = await Promise.all([
        secureFetch(`${API_BASE}/expenses?${queryParams}`),
        secureFetch(`${API_BASE}/reports/school-totals?academicYear=${year}${term ? `&term=${encodeURIComponent(term)}` : ''}`)
      ]);
      
      const expenses = expenseData.data || [];
      const pagination = expenseData.pagination || {};
      const totalIncome = incomeData.totalPaid || 0;
      
      // Update pagination state
      expensesTotalPages = pagination.totalPages || 1;
      expensesTotalCount = pagination.totalCount || 0;
      
      let totalExp = 0;
      
      expenseTableBody.innerHTML = expenses.map(e => {
        totalExp += e.amount;
        return `
          <tr>
            <td>${new Date(e.date).toLocaleDateString()}</td>
            <td><span class="status-badge" style="background:#e2e8f0;">${e.category}</span></td>
            <td>${e.description}</td>
            <td style="text-align:right; font-weight:bold;">KES ${e.amount.toLocaleString()}</td>
            <td><button class="btn danger-btn delete-expense-btn" data-id="${e._id}">Delete</button></td>
          </tr>
        `;
      }).join('');
      
      if(expenses.length === 0) expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No expenses recorded.</td></tr>';
      
      // Update pagination info
      if (expensePageInfo) {
        expensePageInfo.textContent = `Page ${expensesPage} of ${expensesTotalPages} (${expensesTotalCount} total)`;
      }
      
      // Update pagination button states
      if (expensePrevBtn) expensePrevBtn.disabled = expensesPage <= 1;
      if (expenseNextBtn) expenseNextBtn.disabled = expensesPage >= expensesTotalPages;
      
      if(document.getElementById("expenseIncome")) document.getElementById("expenseIncome").textContent = `KES ${totalIncome.toLocaleString()}`;
      if(document.getElementById("expenseTotal")) document.getElementById("expenseTotal").textContent = `KES ${totalExp.toLocaleString()}`;
      
      const balance = totalIncome - totalExp;
      const balanceEl = document.getElementById("netCash");
      if(balanceEl) {
        balanceEl.textContent = `KES ${balance.toLocaleString()}`;
        balanceEl.style.color = balance < 0 ? "#dc3545" : "#28a745";
      }
    } catch (err) {
      console.error(err);
      expenseTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading expenses.</td></tr>';
    }
  }

  // Global function for deleting expenses
  window.deleteExpense = async (expenseId) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      await secureFetch(`${API_BASE}/expenses/${expenseId}`, { method: 'DELETE' });
      showToast("Expense deleted successfully", "success");
      loadExpenses(true, 1); // Reset to page 1 after deletion
    } catch (err) {
      console.error("Delete Expense Error:", err);
      showToast("Failed to delete expense", "error");
    }
  };

  if (saveExpenseBtn) {
    saveExpenseBtn.addEventListener('click', async () => {
      const payload = {
        category: document.getElementById("expCategory")?.value,
        description: document.getElementById("expDesc")?.value,
        amount: Number(document.getElementById("expAmount")?.value),
        date: document.getElementById("expDate")?.value,
        academicYear: document.getElementById("expenseYearFilter")?.value,
        term: document.getElementById("expTerm")?.value
      };
      
      try {
        await secureFetch(`${API_BASE}/expenses`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast("Expense recorded", "success");
        if(expenseModal) {
          expenseModal.classList.remove('visible');
          setTimeout(() => expenseModal.style.display = 'none', 200);
        }
        // Reset form fields
        document.getElementById("expCategory").value = "Salaries";
        document.getElementById("expDesc").value = "";
        document.getElementById("expAmount").value = "";
        document.getElementById("expDate").value = "";
        loadExpenses(true, 1); // Reset to page 1 after adding
      } catch (err) {
        showToast("Error: " + err.message, "error");
      }
    });
  }

  if (openExpenseModalBtn) {
    openExpenseModalBtn.addEventListener('click', () => {
      if (expenseModal) {
        expenseModal.style.display = "flex";
        requestAnimationFrame(() => expenseModal.classList.add('visible'));
        const expDate = document.getElementById("expDate");
        if (expDate && !expDate.value) {
          const today = new Date();
          // Adjust for timezone offset to ensure the local date is used instead of UTC
          expDate.value = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        }
        
        // Auto-set term based on month
        const month = new Date().getMonth() + 1;
        const expTerm = document.getElementById("expTerm");
        if (expTerm) {
          if (month <= 4) expTerm.value = "Term 1";
          else if (month <= 8) expTerm.value = "Term 2";
          else expTerm.value = "Term 3";
        }
      }
    });
  }

  if (closeExpenseModalBtn) {
    closeExpenseModalBtn.addEventListener('click', () => {
      expenseModal.classList.remove('visible');
      setTimeout(() => expenseModal.style.display = 'none', 200);
    });
  }

  // ---------------------------
  // STATS & CHART
  // ---------------------------
  async function loadStats(forceRefresh = false) {
    const grade = overviewClassFilter?.value || "";
    const year = overviewYearFilter?.value || new Date().getFullYear();
    const term = overviewTermFilter?.value || "";
    
    // Show loading state on cards
    const cardIds = ["totalLearners", "totalExpected", "totalPaid", "totalBalance"];
    cardIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="font-size: 0.8rem; color: #94a3b8;">Updating...</span>';
    });

    const cacheKey = `stats_${grade}_${year}_${term}`;
    
    if (!forceRefresh && statsCache.has(cacheKey)) {
      const cached = statsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        updateOverviewCards(cached.data, {
          grade: grade || "All Grades",
          year: year,
          term: term || "Annual"
        });
        drawOverviewChart(cached.data);
        return;
      }
    }
    
    try {
      const params = { academicYear: year };
      if (grade) params.grade = grade;
      if (term) params.term = term;
      
      const data = await secureFetch(`${API_BASE}/reports/school-overview-stats`, { query: params });
      statsCache.set(cacheKey, { data, timestamp: Date.now() });
      
      updateOverviewCards(data, {
        grade: grade || "All Grades",
        year: year,
        term: term || "Annual"
      });
      drawOverviewChart(data);
    } catch (err) {
      console.error('Load stats error', err);
      cardIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "Error";
      });
    }
  }

  function updateOverviewCards(stats, context) {
    const totalLearners = stats.totalLearners || 0;
    const totalExpected = stats.totalExpectedFees || 0;
    const totalPaid = stats.totalPaid || 0;
    const totalBalance = (stats.totalOutstandingBalance !== undefined) ? stats.totalOutstandingBalance : (totalExpected - totalPaid);
    
    if (document.getElementById("totalLearners")) document.getElementById("totalLearners").textContent = totalLearners.toLocaleString();
    if (document.getElementById("totalExpected")) document.getElementById("totalExpected").textContent = `KES ${(totalExpected || 0).toLocaleString()}`;
    if (document.getElementById("totalPaid")) document.getElementById("totalPaid").textContent = `KES ${totalPaid.toLocaleString()}`;
    if (document.getElementById("totalBalance")) document.getElementById("totalBalance").textContent = `KES ${totalBalance.toLocaleString()}`;

    // Update Card Headers to reflect current filters
    const headers = document.querySelectorAll(".stat-card h4");
    headers.forEach(h => {
      if (!h.dataset.original) h.dataset.original = h.textContent;
      h.textContent = `${h.dataset.original} (${context.term})`;
    });
  }

  function drawOverviewChart(stats) {
    const canvas = document.getElementById("feesChart");
    if(!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const expected = stats.totalExpected || 0;
    const paid = stats.totalPaid || 0;
    const balance = expected - paid;
    const max = Math.max(expected, paid, balance) || 1;
    const barWidth = 60;
    const base = canvas.height - 20;
    
    function bar(x, val, label, color) {
      const h = (val / max) * (canvas.height - 40);
      ctx.fillStyle = color;
      ctx.fillRect(x, base - h, barWidth, h);
      ctx.fillStyle = "#333";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + barWidth/2, base + 15);
      ctx.fillStyle = "#000";
      ctx.fillText(val.toLocaleString(), x + barWidth/2, base - h - 5);
    }
    
    bar(50, expected, "Expected", "#0078D4");
    bar(150, paid, "Paid", "#28a745");
    bar(250, balance, "Balance", "#dc3545");
  }

  // ---------------------------
  // FEE STRUCTURES LOGIC
  // ---------------------------
  async function loadFeeStructures(forceRefresh = false, page = feeStructuresPage) {
    try {
      const year = postedFeesYearFilter?.value || new Date().getFullYear();
      const grade = postedFeesClassFilter?.value || "";
      
      const cacheKey = `feeStructures_${year}_${grade}_p${page}`;
      
      if (!forceRefresh && feeStructuresCache.has(cacheKey)) {
        const cached = feeStructuresCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          renderFeeStructures(cached.data);
          updateFeeStructuresPaginationControls();
          return;
        }
      }
      
      const query = new URLSearchParams({ page, limit: FEE_STRUCTURES_LIMIT });
      if (year) query.append("academicYear", year);
      if (grade) query.append("grade", grade);
      
      const payload = await secureFetch(`${API_BASE}/accounts/fee-structures?${query.toString()}`);
      const list = Array.isArray(payload) ? payload : payload.data || [];
      const pagination = payload.pagination || {};
      
      feeStructuresCache.set(cacheKey, { data: list, pagination, timestamp: Date.now() });
      
      feeStructuresTotalPages = pagination.totalPages || 1;
      feeStructuresPage = pagination.page || page;
      
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
        <td>KES ${(f.term1Fee || 0).toLocaleString()}</td>
        <td>KES ${(f.term2Fee || 0).toLocaleString()}</td>
        <td>KES ${(f.term3Fee || 0).toLocaleString()}</td>
        <td><strong>KES ${(f.totalFee || 0).toLocaleString()}</strong></td>
        <td style="white-space: nowrap;">
          <button class="btn secondary-btn edit-fee-btn" data-id="${f._id}">Edit</button>
          <button class="btn danger-btn delete-fee-btn" data-id="${f._id}">Delete</button>
        </td>
      </tr>
    `).join('');
    
    tbody.querySelectorAll('.edit-fee-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const fee = list.find(item => item._id === id);
        if (fee) openEditFeeModal(fee);
      });
    });
    
    tbody.querySelectorAll('.delete-fee-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(confirm("Delete this fee structure?")) {
          await secureFetch(`${API_BASE}/accounts/fee-structure/${btn.dataset.id}`, { method: 'DELETE' });
          loadFeeStructures(true);
          statsCache.clear();
          loadStats(true);
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
        loadFeeStructures(false);
      }
    });
  }
  if (feeStructuresNextBtn) {
    feeStructuresNextBtn.addEventListener('click', () => {
      if (feeStructuresPage < feeStructuresTotalPages) {
        feeStructuresPage += 1;
        loadFeeStructures(false);
      }
    });
  }

  // ---------------------------
  // OUTSTANDING FEES LOGIC
  // ---------------------------
  async function loadOutstandingFees(page = 1, forceRefresh = false) {
    if (!outstandingTableBody) {
      console.error("Error: outstandingFeesTableBody element not found in the DOM.");
      return;
    }
    outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';
    
    const grade = outstandingGradeFilter?.value || "";
    const year = outstandingYearFilter?.value || new Date().getFullYear();
    const sort = outstandingSortFilter?.value || "balance_desc";
    const search = outstandingSearchInput?.value.trim() || "";
    
    const cacheKey = `outstanding_${grade}_${year}_${sort}_${search}_p${page}`;
    
    if (!forceRefresh && outstandingCache.has(cacheKey)) {
      const cached = outstandingCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        renderOutstandingTable(cached.data.students || []);
        outstandingPage = cached.data.currentPage || 1;
        outstandingTotalPages = cached.data.totalPages || 1;
        updateOutstandingPagination();
        return;
      }
    }
    
    const query = new URLSearchParams({ academicYear: year, limit: outstandingLimit, page });
    if (grade) query.append("class", grade);
    if (sort) query.append("sort", sort);
    if (search) query.append("name", search);
    
    try {
      const data = await secureFetch(`${API_BASE}/reports/outstanding-fees?${query.toString()}`);
      outstandingCache.set(cacheKey, { data, timestamp: Date.now() });
      
      renderOutstandingTable(data.students || []);
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

  function renderOutstandingTable(accounts) {
    if (accounts.length === 0) {
      outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No students with outstanding balances found.</td></tr>';
      return;
    }
    
    outstandingTableBody.innerHTML = accounts.map(s => {
      let balance = (s.balance !== undefined && s.balance !== null) ? s.balance : ((s.expected || 0) - (s.paid || 0));
      if (balance <= 0) return '';
      
      const safeName = (s.studentName || s.name || 'Unknown').replace(/'/g, "&apos;");
      let studentId = s.studentId;
      if (studentId && typeof studentId === 'object') studentId = studentId._id;
      if (!studentId) studentId = s._id;
      
      const admission = s.admission || s.admissionNo || '';
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
          <td>${admission}</td>
          <td>${safeName}</td>
          <td>${s.className || s.grade || '-'}</td>
          <td style="text-align: right; font-weight: bold; color: #dc3545;">KES ${balance.toLocaleString()}</td>
          <td style="text-align: center;">${statusBadge}</td>
          <td style="text-align: center;"><button class="btn secondary-btn view-fee-btn" data-id="${studentId}" data-admission="${admission}" data-name="${safeName}" data-grade="${s.className || s.grade || ''}">View</button></td>
        </tr>
      `;
    }).join('');
  }

  if (outstandingTableBody) {
    outstandingTableBody.addEventListener('click', async (e) => {
      if (e.target.classList.contains('view-fee-btn')) {
        const btn = e.target;
        await openStudentFeeDetails(btn.dataset.id, btn.dataset.admission, btn.dataset.name, btn.dataset.grade);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      try {
        authService.logout();
      } catch (e) {
        console.error("Logout error:", e);
      }
    });
  }

  async function openStudentFeeDetails(studentId, admission, studentName, grade) {
    studentFeeModalBody.innerHTML = '<div style="text-align:center; padding:20px;">Loading details...</div>';
    studentFeeDetailsModal.style.display = 'flex';
    requestAnimationFrame(() => studentFeeDetailsModal.classList.add('visible'));
    
    const year = outstandingYearFilter?.value || new Date().getFullYear();
    currentStudentDetails = { name: studentName, year };
    
    if (!admission) {
      studentFeeModalBody.innerHTML = '<div style="color:red; text-align:center;">Error: Missing Admission Number</div>';
      return;
    }
    
    try {
      const [payRes, feesRes] = await Promise.all([
        secureFetch(`${API_BASE}/users/ledger/${admission}`),
        secureFetch(`${API_BASE}/accounts/fee-structures?limit=1000`)
      ]);
      
      const payData = payRes || { payments: [] };
      const feesData = Array.isArray(feesRes) ? feesRes : (feesRes.data || []);
      
      const allPayments = payData.payments || [];
      const payments = allPayments.filter(p => Number(p.academicYear) === Number(year));
      
      const feeStructure = feesData.find(f => 
        f.academicYear === Number(year) && 
        (grade === f.grade || (grade.startsWith(f.grade) && !/\d/.test(grade.substring(f.grade.length))))
      );
      
      const fees = feeStructure || { term1Fee: 0, term2Fee: 0, term3Fee: 0, totalFee: 0 };
      
      const termPaid = { "Term 1": 0, "Term 2": 0, "Term 3": 0 };
      payments.forEach(p => {
        if (termPaid[p.term] !== undefined) termPaid[p.term] += p.amount;
      });
      
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalBalance = fees.totalFee - totalPaid;
      
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

  // ---------------------------
  // GENERATE PDF FROM MODAL CONTENT
  // ---------------------------
  async function generateModalPDF(elementId, titleSuffix, customTitle) {
    const contentElement = document.getElementById(elementId);
    const headerElement = document.querySelector('#studentFeeModalBody .report-header');

    if (!contentElement || !headerElement || !window.html2canvas || !window.jspdf) {
      showToast("PDF generation components not ready.", "error");
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
    document.body.appendChild(printContainer);

    try {
      const canvas = await html2canvas(printContainer, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
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
        showToast("PDF generation failed", "error"); 
    } finally {
        // 4. Clean up the temporary container
        document.body.removeChild(printContainer);
    }
  }

  if (dlStructureBtn) dlStructureBtn.addEventListener('click', () => generateModalPDF('fee-structure-for-pdf', 'Fee_Structure', 'FEE STRUCTURE AND BALANCE'));
  if (dlStatementBtn) dlStatementBtn.addEventListener('click', () => generateModalPDF('payment-statement-for-pdf', 'Fee_Statement', 'FEE STATEMENT'));

  // ---------------------------
  // GLOBAL FEE NOTE LOGIC
  // ---------------------------
  async function loadGlobalFeeNote(forceRefresh = false) {
    const year = globalNoteYearFilter?.value;
    if (!year) return;
    
    if (noteYearDisplay) noteYearDisplay.textContent = year;
    
    const cacheKey = `globalNote_${year}`;
    
    if (!forceRefresh && globalNoteCache.has(cacheKey)) {
      const cached = globalNoteCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        if (globalNoteContent && globalFeeNoteInput) {
          const note = cached.data.note || '';
          globalNoteContent.textContent = note || 'No general instructions set for this year.';
          globalNoteContent.style.fontStyle = note ? "normal" : "italic";
          globalFeeNoteInput.value = note;
        }
        return;
      }
    }
    
    try {
      const data = await secureFetch(`${API_BASE}/payments/global-note?academicYear=${year}`);
      if (data && globalNoteContent && globalFeeNoteInput) {
        const note = data.note || '';
        globalNoteContent.textContent = note || 'No general instructions set for this year.';
        globalNoteContent.style.fontStyle = note ? "normal" : "italic";
        globalFeeNoteInput.value = note;
        globalNoteCache.set(cacheKey, { data, timestamp: Date.now() });
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
      
      toggleGlobalNoteEdit(false);
      loadGlobalFeeNote(true);
      globalNoteCache.delete(`globalNote_${year}`);
    } catch (err) {
      console.error("Error saving note:", err);
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
        statsCache.clear();
        loadStats(true);
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
      
      if(!grade || !year) {
        showToast("Grade and Year are required", "error");
        return;
      }

      // --- Client-side duplicate check ---
      let isDuplicate = false;
      for (const cachedEntry of feeStructuresCache.values()) {
        const list = cachedEntry.data; // This is an array of fee structures
        if (list && Array.isArray(list)) {
          if (list.some(f => f.grade === grade && f.academicYear === year)) {
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (isDuplicate) {
        showToast(`Fee structure for Grade ${grade} in Academic Year ${year} already exists.`, "error");
        return; // Prevent form submission
      }

      const payload = { grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 };
      
      saveFeeBtn.disabled = true;
      saveFeeBtn.textContent = "Saving...";
      
      try {
        await secureFetch(`${API_BASE}/accounts/fee-structure`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        showToast("Fee structure saved!", "success");
        postFeeModal.classList.remove('visible');
        setTimeout(() => postFeeModal.style.display = "none", 200);
        loadFeeStructures(true);
        statsCache.clear();
        loadStats(true);
      } catch(e) {
        showToast("Error: " + e.message, "error");
      } finally {
        saveFeeBtn.disabled = false;
        saveFeeBtn.textContent = "Save Fee Structure";
      }
    });
  }

  // ---------------------------
  // EVENT LISTENERS
  // ---------------------------
  function populateYearFilters() {
    const currentYear = new Date().getFullYear();
    const startYear = 2026;
    const endYear = 3026;
    
    const yearSelectors = [
      document.getElementById("outstandingYearFilter"),
      document.getElementById("overviewYearFilter"),
      document.getElementById("postedFeesYearFilter"),
      document.getElementById("globalNoteYearFilter"),
      document.getElementById("expenseYearFilter")
    ].filter(Boolean);
    
    yearSelectors.forEach(selector => {
      selector.innerHTML = "";
      for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        selector.appendChild(option);
      }
    });
  }

  function populateGradeFilters() {
    const schoolType = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[schoolType].gradeOptions;
    const gradeSelectors = [
      document.getElementById("outstandingGradeFilter"),
      document.getElementById("overviewClassFilter"),
      document.getElementById("postedFeesClassFilter"),
      document.getElementById("feeGrade"),
      document.getElementById("editFeeGrade")
    ].filter(Boolean);
    
    gradeSelectors.forEach(selector => {
      const isFilter = selector.id.toLowerCase().includes('filter');
      selector.innerHTML = isFilter ? '<option value="">All Grades</option>' : '<option value="">-- Select Grade --</option>';
      grades.forEach(g => {
        const option = document.createElement("option");
        // Correctly handle PP grades: "PP1" remains "PP1", "1" becomes "Grade 1"
        const displayValue = String(g).toUpperCase().startsWith("PP") ? g : `Grade ${g}`;
        option.value = displayValue;
        option.textContent = displayValue;
        selector.appendChild(option);
      });
    });
  }

  // Filter listeners
  outstandingGradeFilter?.addEventListener('change', () => loadOutstandingFees(1, true));
  outstandingSortFilter?.addEventListener('change', () => loadOutstandingFees(1));
  overviewClassFilter?.addEventListener('change', () => loadStats(true));
  overviewYearFilter?.addEventListener('change', () => loadStats(true));
  overviewTermFilter?.addEventListener('change', () => loadStats(true));
  postedFeesYearFilter?.addEventListener('change', () => loadFeeStructures(false));
  postedFeesClassFilter?.addEventListener('change', () => loadFeeStructures(false));
  globalNoteYearFilter?.addEventListener('change', () => loadGlobalFeeNote(true));
  outstandingYearFilter?.addEventListener('change', () => loadOutstandingFees(1, true));

  if (outstandingPrevBtn) outstandingPrevBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage - 1));
  if (outstandingNextBtn) outstandingNextBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage + 1));

  // Expense pagination handlers
  if (expensePrevBtn) expensePrevBtn.addEventListener('click', () => loadExpenses(false, expensesPage - 1));
  if (expenseNextBtn) expenseNextBtn.addEventListener('click', () => loadExpenses(false, expensesPage + 1));
  
  // Expense delete handler (CSP compliant delegation)
  if (expenseTableBody) {
    expenseTableBody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.delete-expense-btn');
      if (btn) {
        const id = btn.dataset.id;
        if (id) await window.deleteExpense(id);
      }
    });
  }

  // Reset expense pagination when filters change
  if (document.getElementById("expenseYearFilter")) {
    document.getElementById("expenseYearFilter").addEventListener('change', () => loadExpenses(false, 1));
  }
  if (document.getElementById("expenseTermFilter")) {
    document.getElementById("expenseTermFilter").addEventListener('change', () => loadExpenses(false, 1));
  }
  if (document.getElementById("expenseCategoryFilter")) {
    document.getElementById("expenseCategoryFilter").addEventListener('change', () => loadExpenses(false, 1));
  }

  let outstandingDebounce;
  outstandingSearchInput?.addEventListener('input', () => {
    clearTimeout(outstandingDebounce);
    outstandingDebounce = setTimeout(() => loadOutstandingFees(1), 500);
  });

  // ---------------------------
  // INITIALIZATION
  // ---------------------------
  (async function init() {
    userProfile = await authService.getUserProfile(["accounts", "admin"]);
    if (!userProfile) return;
    authService.initLogout();
    
    await getSchoolInfo();
    populateYearFilters();
    populateGradeFilters();
    setupSidebarNavigation();
    
    let initialActiveSidebarItem = document.querySelector(".sidebar .menu li.active[data-section]");
    if (!initialActiveSidebarItem || initialActiveSidebarItem?.dataset.section === "dashboardSection") {
      initialActiveSidebarItem = document.querySelector(".sidebar .menu li[data-section='feesPaymentOverviewSection']");
      if (initialActiveSidebarItem) initialActiveSidebarItem.classList.add('active');
    }
    if (initialActiveSidebarItem) {
      initialActiveSidebarItem.dispatchEvent(new Event('click'));
    }
  })();

})();