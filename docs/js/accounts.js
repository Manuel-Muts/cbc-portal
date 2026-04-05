// docs/js/accounts.js
(function () {
  const API_BASE = config.api.baseURL;
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login";
    return;
  }

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

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // ---------------------------
  // HELPERS
  // ---------------------------
  function showToast(message, type = "info") {
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => {
      t.classList.add('hiding');
      t.addEventListener('transitionend', () => t.remove());
    }, 3000);
  }

  // Cache State
  let statsCache = null;
  let statsLastFetch = 0;
  let feeStructuresCache = null;
  let feesLastFetch = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // DOM Elements
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  
  // Post Fee Modal Elements
  const openPostFeeBtn = document.getElementById('openPostFeeBtn');
  const postFeeModal = document.getElementById('postFeeModal');
  const saveFeeBtn = document.getElementById('saveFeeBtn');
  const cancelPostFeeBtn = document.getElementById('cancelPostFeeBtn');

  // Edit Fee Modal Elements
  const editFeeModal = document.getElementById('editFeeModal');
  const updateFeeBtn = document.getElementById('updateFeeBtn');
  const cancelEditFeeBtn = document.getElementById('cancelEditFeeBtn');

  // Outstanding Fees Elements
  const outstandingClassFilter = document.getElementById('outstandingClassFilter');
  const outstandingYearFilter = document.getElementById('outstandingYearFilter');
  const outstandingTermFilter = document.getElementById('outstandingTermFilter');
  const outstandingSortFilter = document.getElementById('outstandingSortFilter');
  const outstandingSearchInput = document.getElementById('outstandingSearchInput');
  const outstandingTableBody = document.getElementById('outstandingFeesTableBody');
  
  // Outstanding Fees Pagination
  const outstandingPrevBtn = document.getElementById('outstandingPrevBtn');
  const outstandingNextBtn = document.getElementById('outstandingNextBtn');
  const outstandingPageInfo = document.getElementById('outstandingPageInfo');
  let outstandingPage = 1;
  const outstandingLimit = 20;
  let outstandingTotalPages = 1; // Corrected: This was duplicated

  const downloadOutstandingPDF = document.getElementById('downloadOutstandingPDF');
  const downloadAllFeeStructuresBtn = document.getElementById('downloadFeeStructuresPDF');
  const exportBtn = document.getElementById('exportBtn');

  // Student Fee Details Modal Elements
  const studentFeeDetailsModal = document.getElementById('studentFeeDetailsModal');
  const closeStudentFeeDetailsBtn = document.getElementById('closeStudentFeeDetailsBtn');
  const studentFeeModalBody = document.getElementById('studentFeeModalBody');
  const dlStructureBtn = document.getElementById('dlStructureBtn');
  const dlStatementBtn = document.getElementById('dlStatementBtn');
  const feeStructuresNextBtn = document.getElementById('feeStructuresNextBtn');
  const feeStructuresPageInfo = document.getElementById('feeStructuresPageInfo');
  let currentStudentDetails = null; // Store current student for PDF naming
  let feeStructuresPage = 1;
  const FEE_STRUCTURES_LIMIT = 10;
  let feeStructuresTotalPages = 1;
  let feeStructuresCachePage = 1;

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
        loadOutstandingFees()
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
  // STATS & CHART
  // ---------------------------
  async function loadStats(forceRefresh = false) {
      // Fetch a sample of accounts to calculate totals
      try {
        const grade = outstandingClassFilter.value;
        const year = outstandingYearFilter.value;
        const term = outstandingTermFilter ? outstandingTermFilter.value : "";
        
        // Cache key should include filters to avoid stale data when switching
        const cacheKey = `stats_${grade}_${year}_${term}`;
        
        if (!forceRefresh && statsCache && statsCache.key === cacheKey && (Date.now() - statsLastFetch < CACHE_TTL)) {
            calculateTotals(statsCache.data, term, statsCache.total);
            return;
        }

        const query = new URLSearchParams({ academicYear: year, limit: 1000, page: 1 });
        if (grade) query.append("class", grade);

        const res = await fetch(`${API_BASE}/accounts?${query.toString()}`, { headers });
        if(res.ok) {
            const data = await res.json();
            const accounts = data.students || data.accounts || [];
            const total = data.total || accounts.length;
            statsCache = { key: cacheKey, data: accounts, total: total };
            statsLastFetch = Date.now();
            calculateTotals(accounts, term, total);
        }
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
  async function loadFeeStructures(forceRefresh = false) {
    try {
      if (!forceRefresh && feeStructuresCache && feeStructuresCachePage === feeStructuresPage && (Date.now() - feesLastFetch < CACHE_TTL)) {
        renderFeeStructures(feeStructuresCache);
        updateFeeStructuresPaginationControls();
        return;
      }

      const res = await fetch(`${API_BASE}/accounts/fee-structures?page=${feeStructuresPage}&limit=${FEE_STRUCTURES_LIMIT}`, { headers });
      const tbody = document.getElementById('feeStructuresTableBody');
      if (!tbody) return;

      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #dc3545;">Failed to load fee structures</td></tr>';
        return;
      }

      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : payload.data || [];
      const pagination = payload.pagination || {};

      feeStructuresCache = list;
      feeStructuresCachePage = feeStructuresPage;
      feesLastFetch = Date.now();
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
          <td>
            <button class="btn secondary-btn edit-fee-btn" data-id="${f._id}" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">Edit</button>
            <button class="btn danger-btn delete-fee-btn" data-id="${f._id}" style="padding: 4px 8px; font-size: 12px;">Delete</button>
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
                  await fetch(`${API_BASE}/accounts/fee-structure/${btn.dataset.id}`, { method: 'DELETE', headers });
                  loadFeeStructures(true); // Force refresh after delete
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
  async function loadOutstandingFees(page = 1) {
    if (!outstandingTableBody) return;
    outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>';

    const grade = outstandingClassFilter.value;
    const year = outstandingYearFilter.value;
    const term = outstandingTermFilter ? outstandingTermFilter.value : "";
    const sort = outstandingSortFilter ? outstandingSortFilter.value : "balance_desc";
    const search = outstandingSearchInput.value.trim();

    const query = new URLSearchParams({ academicYear: year, limit: outstandingLimit, page: page });
    if (grade) query.append("class", grade);
    if (term) query.append("term", term);
    if (sort) query.append("sort", sort);
    if (search) query.append("name", search);

    try {
        const res = await fetch(`${API_BASE}/reports/outstanding-fees?${query.toString()}`, { headers });
        if (!res.ok) throw new Error('Failed to fetch outstanding fees');
        const data = await res.json();
        
        renderOutstandingTable(data.students || []);
        
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

  function renderOutstandingTable(accounts) {
    if (!outstandingTableBody) return;
    if (accounts.length === 0) {
        outstandingTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No students with outstanding balances found.</td></tr>';
        return;
    }

    // Store data in DOM for easy retrieval or pass relevant data in data attributes
    outstandingTableBody.innerHTML = accounts.map(s => {
        let balance = (s.balance !== undefined && s.balance !== null) ? s.balance : ((s.expected || 0) - (s.paid || 0));
        
        // If a specific term is selected, display that term's balance
        const termFilter = outstandingTermFilter ? outstandingTermFilter.value : "";
        if (termFilter && s.termBalances) {
            const key = termFilter.toLowerCase().replace(/\s+/g, ''); // "Term 1" -> "term1"
            if (s.termBalances[key]) {
                balance = s.termBalances[key].balance;
            }
        }

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
            statusBadge = `<span class="status-badge status-paid" style="background:#d1fae5; color:#065f46; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">Paid</span>`;
        } else if (paidAmount > 0 && balance > 0) {
            statusBadge = `<span class="status-badge status-partial" style="background:#fef3c7; color:#92400e; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">Partial</span>`;
        } else {
            statusBadge = `<span class="status-badge status-unpaid" style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">Unpaid</span>`;
        }

        return `
            <tr>
                <td>${s.admission || s.admissionNo || '-'}</td>
                <td>${safeName}</td>
                <td>${s.className || s.grade || '-'}</td>
                <td style="text-align: right; font-weight: bold; color: #dc3545;">${balance.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center;"><button class="btn secondary-btn view-fee-btn" data-id="${studentId}" data-admission="${admission}" data-name="${safeName}" data-grade="${s.className || s.grade || ''}" style="padding: 4px 10px; font-size: 12px;">View</button></td>
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
        fetch(`${API_BASE}/users/ledger/${admission}`, { headers }),
        fetch(`${API_BASE}/accounts/fee-structures?limit=1000`, { headers })
      ]);

      const payData = payRes.ok ? await payRes.json() : { payments: [] };
      const feesResData = feesRes.ok ? await feesRes.json() : [];
      const feesData = Array.isArray(feesResData) ? feesResData : (feesResData.data || []);
      
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
      alert("PDF generation components not ready.");
      return;
    }
    
    // 1. Fetch school info to get the name
    let schoolName = "SCHOOL NAME";
    try {
        const res = await fetch(`${API_BASE}/my-school`, { headers });
        if (res.ok) {
            const school = await res.json();
            schoolName = (school.name || "SCHOOL NAME").toUpperCase();
        }
    } catch (e) {
        console.error("Could not fetch school name for PDF", e);
    }

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
        const res = await fetch(`${API_BASE}/accounts/fee-structure/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ grade, academicYear: year, term1Fee: t1, term2Fee: t2, term3Fee: t3 })
        });

        if (res.ok) {
          alert("Fee structure updated successfully!");
          editFeeModal.classList.remove('visible');
          setTimeout(() => editFeeModal.style.display = "none", 200);
          loadFeeStructures(true); // Force refresh after update
        } else {
          const err = await res.json();
          alert("Error: " + (err.message || "Failed to update"));
        }
      } catch (e) {
        console.error(e);
        alert("Network error");
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
              const res = await fetch(`${API_BASE}/accounts/fee-structure`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(payload)
              });
              
              if(res.ok) {
                  alert("Fee structure saved!");
                  postFeeModal.classList.remove('visible');
                  setTimeout(() => postFeeModal.style.display = "none", 200);
                  loadFeeStructures(true); // Force refresh after save
              } else {
                  const err = await res.json();
                  alert("Error: " + (err.message || "Failed to save"));
              }
          } catch(e) {
              alert("Network error");
          } finally {
              saveFeeBtn.disabled = false;
              saveFeeBtn.textContent = "Save Fee Structure";
          }
      });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadDashboardData(true));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '/login';
    });
  }

  // ---------------------------
  // INIT
  // Outstanding fees listeners
  if (outstandingYearFilter) {
    const currentYear = new Date().getFullYear();
    outstandingYearFilter.innerHTML = "";
    for (let y = 2026; y <= 2130; y++) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        outstandingYearFilter.appendChild(opt);
    }
  }

  outstandingClassFilter?.addEventListener('change', () => { loadOutstandingFees(1); loadStats(true); });
  outstandingYearFilter?.addEventListener('change', () => { loadOutstandingFees(1); loadStats(true); });
  outstandingTermFilter?.addEventListener('change', () => { loadOutstandingFees(1); loadStats(true); });
  outstandingSortFilter?.addEventListener('change', () => loadOutstandingFees(1));

  if (outstandingPrevBtn) outstandingPrevBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage - 1));
  if (outstandingNextBtn) outstandingNextBtn.addEventListener('click', () => loadOutstandingFees(outstandingPage + 1));
  
  let outstandingDebounce;
  outstandingSearchInput?.addEventListener('input', () => {
      clearTimeout(outstandingDebounce);
      outstandingDebounce = setTimeout(() => loadOutstandingFees(1), 500);
  });

  // Export PDF (accountsTable)
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!isPdfAutoTableReady()) {
        showToast("PDF AutoTable plugin not loaded. Ensure jspdf-autotable.min.js is included in accounts.html.", "error");
        return;
      }
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
    });
    doc.save("outstanding_fees_report.pdf");
  });

  // Initial Load
  loadDashboardData();

  // Download All Fee Structures PDF (this handler was already correct)
  if (downloadAllFeeStructuresBtn) {
    downloadAllFeeStructuresBtn.addEventListener('click', async () => {
      try {
        showToast("Generating Fee Structures PDF...", "info");
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
