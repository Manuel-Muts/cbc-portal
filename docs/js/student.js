// ===== CBC GRADING HELPERS (For both Junior & Senior School) =====
// API_BASE is now loaded from config.js
// To change the API endpoint, update config.js
const API_BASE = config.api.baseURL;

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------------------
  // AUTHENTICATION WITH TOKEN
  // ---------------------------
  const user = await authService.getUserProfile(["student", "learner"]);
  if (!user) return;

  const token = authService.getToken();
  window.currentUser = user;
  console.log("✅ Student authenticated:", user.name);
  authService.initLogout();

  const menuToggleBtn = document.querySelector(".menu-toggle");
  const sidebarEl = document.querySelector(".sidebar");
  const sidebarBackdrop = document.createElement("div");
  sidebarBackdrop.className = "sidebar-backdrop";
  document.body.appendChild(sidebarBackdrop);

  const closeSidebar = () => {
    sidebarEl?.classList.remove("show");
    sidebarBackdrop.classList.remove("active");
  };

  menuToggleBtn?.addEventListener("click", () => {
    const isOpen = sidebarEl?.classList.toggle("show");
    sidebarBackdrop.classList.toggle("active", Boolean(isOpen));
  });

  sidebarBackdrop.addEventListener("click", closeSidebar);

  // Auto-close sidebar when menu item or button is clicked
  document.querySelectorAll('.sidebar a, .sidebar button').forEach(el => {
    el.addEventListener('click', closeSidebar);
  });

  // Close button on sidebar
  const closeBtn = document.querySelector('.sidebar-close');
  closeBtn?.addEventListener('click', closeSidebar);

  // ---------------------------
  // TAB LOGIC
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

  // ---------------------------
  // CACHE UTILITIES
  // ---------------------------
  const CACHE_KEY = "student_dashboard_cache";
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const getCached = (key) => {
    try {
      const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      if (store[key] && (Date.now() - store[key].timestamp < CACHE_TTL)) {
        return store[key].data;
      }
    } catch (e) { }
    return null;
  };

  const setCached = (key, data) => {
    try {
      const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      store[key] = { timestamp: Date.now(), data };
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch (e) { }
  };

  // ---------------------------
  // GREETING
  // ---------------------------
  const welcomeNameEl = document.getElementById("welcomeName");
  if (welcomeNameEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    welcomeNameEl.textContent = `${greeting}, ${user.name}`;
  }

  // ---------------------------
  // FETCH STUDENT ENROLLMENT (Grade & Stream)
  // ---------------------------
  let studentEnrollment = getCached("studentEnrollment");
  try {
    if (!studentEnrollment) {
      const enrollmentRes = await fetch(`${API_BASE}/enrollments/my-enrollment`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (enrollmentRes.ok) {
        studentEnrollment = await enrollmentRes.json();
        setCached("studentEnrollment", studentEnrollment);
      }
    }

    if (studentEnrollment) {
      console.log("✅ Enrollment fetched (Cache/API):", studentEnrollment);
      
      // Update user grade if available
      if (studentEnrollment.grade && !user.grade) {
        user.grade = studentEnrollment.grade;
        localStorage.setItem("loggedInUser", JSON.stringify(user));
      }
      
      // Display grade and stream in learner info box
      const gradeDisplay = document.getElementById("learnerGradeDisplay");
      const streamDisplay = document.getElementById("learnerStreamDisplay");
      
      if (gradeDisplay) {
        gradeDisplay.textContent = studentEnrollment?.grade || user.grade || "N/A";
      }
      if (streamDisplay) {
        streamDisplay.textContent = studentEnrollment?.stream || "N/A";
      }
    }
  } catch (err) {
    console.error("Enrollment fetch error:", err);
  }

// ---------------------------
// FETCH SCHOOL INFO
// ---------------------------
// Fee info element
const feeInfoEl = document.createElement('p');
feeInfoEl.id = 'feeInfoDashboard';
feeInfoEl.className = 'fee-info-banner';
const schoolNameEl = document.getElementById("schoolName");

// Insert fee summary into dashboard header on the right side
const dashboardMain = document.querySelector(".dashboard-main");
const dashboardHeader = document.querySelector(".dashboard-header");
if (dashboardHeader) {
  dashboardHeader.insertBefore(feeInfoEl, dashboardHeader.querySelector(".toolbar"));
}

try {
  let school = getCached("schoolProfile_full");
  if (!school) {
    const schoolRes = await fetch(`${API_BASE}/users/my-school?includeLogo=false`, { // Fetch name only, exclude logo and details
      headers: { Authorization: `Bearer ${token}` },
    });

    if (schoolRes.ok) {
      school = await schoolRes.json();
      setCached("schoolProfile_full", school);
    }
  }

  if (schoolNameEl) schoolNameEl.textContent = school ? school.name.toUpperCase() : "School Name N/A";
  if (school) console.log("✅ School info fetched (Cache/API):", school);

} catch (err) {
  if (schoolNameEl) schoolNameEl.textContent = "School Name N/A";
  console.error("Error fetching school info:", err);
}

// ---------------------------
// Fetch fee structure for current student
// ---------------------------
try {
  let f = getCached("feeInfo");
  if (!f) {
    const feesRes = await fetch(`${API_BASE}/users/my-fees`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (feesRes.ok) {
      f = await feesRes.json();
      setCached("feeInfo", f);
    }
  }

  if (f) {
    feeInfoEl.textContent = `Total Annual Fees (${f.grade}, ${f.academicYear}): KES ${f.totalFee}`;
    feeInfoEl.style.display = 'block';
    console.log("✅ Fee info fetched:", f);
  }
} catch (err) {
  console.error('Error fetching fees:', err);
  feeInfoEl.textContent = '';
}

// View fee button handler (opens modal with more details)
const viewFeeBtn = document.getElementById('viewFeeBtn');

// Function to load fee data
const loadFeeData = async (selectedYear) => {
  const body = document.getElementById('feeModalBody');
  body.textContent = 'Loading...';

  try {
    const [feesRes, balanceRes, paymentsRes] = await Promise.all([
      fetch(`${API_BASE}/users/my-fees?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`${API_BASE}/users/my-balance?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`${API_BASE}/users/my-payments?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    if (!feesRes.ok) {
      if (feesRes.status === 404) { body.textContent = 'Fee structure not available'; return; }
      body.textContent = 'Failed to load fee structure';
      return;
    }

    const feesData = await feesRes.json();
    let balanceData, paymentsData;

    if (!balanceRes.ok) {
      console.warn('Failed to load balance information, using defaults');
      balanceData = {
        termBalances: {
          term1: { paid: 0, balance: feesData.term1Fee || 0 },
          term2: { paid: 0, balance: feesData.term2Fee || 0 },
          term3: { paid: 0, balance: feesData.term3Fee || 0 }
        },
        totalPaid: 0,
        balance: feesData.totalFee || 0
      };
    } else {
      balanceData = await balanceRes.json();
    }
    if (!paymentsRes.ok) {
      console.warn('Failed to load payment history, using empty list');
      paymentsData = { payments: [] };
    } else {
      paymentsData = await paymentsRes.json();
    }

    // Calculate paid per term from payments
    let term1Paid = 0, term2Paid = 0, term3Paid = 0;
    paymentsData.payments.forEach(payment => {
      if (payment.term === 'Term 1') term1Paid += payment.amount;
      else if (payment.term === 'Term 2') term2Paid += payment.amount;
      else if (payment.term === 'Term 3') term3Paid += payment.amount;
    });
    const totalPaid = term1Paid + term2Paid + term3Paid;

    let paymentsTable = '<h4>Fee Statement:</h4><table style="width:100%; border-collapse:collapse;"><tr style="border-bottom:1px solid #ddd;"><th style="text-align:left; padding:8px;">Date</th><th style="text-align:left; padding:8px;">Term</th><th style="text-align:left; padding:8px;">Method</th><th style="text-align:left; padding:8px;">Reference</th><th style="text-align:right; padding:8px;">Amount</th></tr>';
    if (paymentsData.payments.length === 0) {
      paymentsTable += '<tr><td colspan="5" style="text-align:center; padding:8px;">No payments recorded</td></tr>';
    } else {
      paymentsData.payments.forEach(payment => {
        const date = new Date(payment.createdAt).toLocaleDateString();
        paymentsTable += `<tr><td style="padding:8px;">${date}</td><td style="padding:8px;">${payment.term}</td><td style="padding:8px;">${payment.method}</td><td style="padding:8px;">${payment.reference}</td><td style="text-align:right; padding:8px;">KES ${payment.amount}</td></tr>`;
      });
    }
    paymentsTable += '</table>';

    const schoolName = (schoolNameEl ? schoolNameEl.textContent : '') || 'SCHOOL NAME';
    
    // NEW: Global Fee Note (Hidden in UI, visible only in PDF)
    const globalFeeNote = feesData.additionalInfo || '';
    let globalFeeNoteHtml = '';
    if (globalFeeNote) {
      globalFeeNoteHtml = `
        <div class="global-fee-note-pdf" style="display: none; margin-top: 30px; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">📢 PAYMENT INSTRUCTIONS</h4>
          <p style="font-size: 0.9rem; color: #475569; margin: 0; white-space: pre-wrap; line-height: 1.5;">${globalFeeNote}</p>
        </div>
      `;
    }
    const infoHeaderHtml = `
      <div class="modal-info-header" style="margin-bottom: 25px;">
        <h2 style="text-align:center; margin: 0 0 5px 0; color: #1e293b; font-size: 1.6rem;">${schoolName}</h2>
        <h3 style="text-align:center; margin: 0 0 20px 0; color: #2563eb; font-weight: 600;">${window.currentUser.name}</h3>
        
        <div style="display: flex; justify-content: space-around; flex-wrap: wrap; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; gap: 10px;">
          <div style="text-align:center; flex: 1; min-width: 120px;">
            <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Admission No</span>
            <strong style="font-size: 1.1rem; color: #0f172a;">${window.currentUser.admission}</strong>
          </div>
          <div style="text-align:center; flex: 1; min-width: 120px; border-left: 1px solid #e2e8f0;">
            <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Grade</span>
            <strong style="font-size: 1.1rem; color: #0f172a;">${feesData.grade}</strong>
          </div>
          <div style="text-align:center; flex: 1; min-width: 120px; border-left: 1px solid #e2e8f0;">
            <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Academic Year</span>
            <strong style="font-size: 1.1rem; color: #0f172a;">${feesData.academicYear}</strong>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = `<div id="feeStructureContent">
                      ${infoHeaderHtml}
                      <h4>Term Breakdown:</h4>
                      <table style="width:100%; border-collapse:collapse;">
                        <tr style="border-bottom:1px solid #ddd;">
                          <th style="text-align:left; padding:8px;">Term</th>
                          <th style="text-align:right; padding:8px;">Fee</th>
                          <th style="text-align:right; padding:8px;">Paid</th>
                          <th style="text-align:right; padding:8px;">Balance</th>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 1</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term1Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term1Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term1Fee || 0) - term1Paid}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 2</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term2Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term2Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term2Fee || 0) - term2Paid}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 3</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term3Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term3Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term3Fee || 0) - term3Paid}</td>
                        </tr>
                      </table>

                      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; gap: 10px; margin-top: 20px;">
                        <div style="text-align:center; flex: 1; min-width: 120px;">
                          <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Total Fee</span>
                          <strong style="font-size: 1.1rem; color: #0f172a;">KES ${feesData.totalFee.toLocaleString()}</strong>
                        </div>
                        <div style="text-align:center; flex: 1; min-width: 120px; border-left: 1px solid #e2e8e0;">
                          <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Total Paid</span>
                          <strong style="font-size: 1.1rem; color: #16a34a;">KES ${totalPaid.toLocaleString()}</strong>
                        </div>
                        <div style="text-align:center; flex: 1; min-width: 120px; border-left: 1px solid #e2e8e0;">
                          <span style="display:block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; letter-spacing: 0.05em;">Outstanding Balance</span>
                          <strong style="font-size: 1.1rem; color: #dc2626;">KES ${(feesData.totalFee - totalPaid).toLocaleString()}</strong>
                        </div>
                      </div>
                      ${globalFeeNoteHtml} <!-- Moved to bottom, hidden in UI -->
                      </div>
                      <div id="feeStatementContent">
                      ${infoHeaderHtml}
                      ${paymentsTable}
                      ${globalFeeNoteHtml} <!-- Moved to bottom, hidden in UI -->
                      </div>`;
  } catch (err) {
    console.error(err);
    body.textContent = 'Error loading fee structure';
  }
};

  // Fee year filter population
  const feeYearFilter = document.getElementById("feeYearFilter");
  if (feeYearFilter) {
    const currentYear = new Date().getFullYear();
    for (let yr = 2025; yr <= 2126; yr++) {
      const option = document.createElement("option");
      option.value = yr;
      option.textContent = yr;
      if (yr === currentYear) option.selected = true;
      feeYearFilter.appendChild(option);
    }

    // Auto-filter on year change
    feeYearFilter.addEventListener('change', async () => {
      const selectedYear = feeYearFilter.value;
      await loadFeeData(selectedYear);
    });
  }

  // Marks year filter population
  const yearFilter = document.getElementById("yearFilter");
  if (yearFilter) {
    const currentYear = new Date().getFullYear();
    for (let yr = 2025; yr <= currentYear + 100; yr++) {
      const option = document.createElement("option");
      option.value = yr;
      option.textContent = yr;
      if (yr === currentYear) option.selected = true;
      yearFilter.appendChild(option);
    }
  }

  // Set default Term filter based on the current month
  const termFilter = document.getElementById("termFilter");
  if (termFilter) {
    const month = new Date().getMonth() + 1; // 1-12
    let currentTerm = "1";
    if (month >= 5 && month <= 8) currentTerm = "2";
    else if (month >= 9) currentTerm = "3";
    termFilter.value = currentTerm;
  }

if (viewFeeBtn) {
  viewFeeBtn.addEventListener('click', async () => {
    const modal = document.getElementById('feeModal');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    
    modal.classList.remove('hidden');
    await loadFeeData(selectedYear);
  });
}

// Fix Fee Modal Close Button
const feeModal = document.getElementById('feeModal');
if (feeModal) {
  const closeBtn = feeModal.querySelector('.cancel-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => feeModal.classList.add('hidden'));
  }
}

// Fee year filter button handler
const feeFilterBtn = document.getElementById('feeFilterBtn');
if (feeFilterBtn) {
  feeFilterBtn.addEventListener('click', async () => {
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    await loadFeeData(selectedYear);
  });
}

// Download Fee Structure PDF
const downloadFeeStructurePDF = document.getElementById('downloadFeeStructurePDF');
if (downloadFeeStructurePDF) {
  downloadFeeStructurePDF.addEventListener('click', async () => {
    // Provide immediate feedback to the user
    const originalHtml = downloadFeeStructurePDF.innerHTML;
    downloadFeeStructurePDF.disabled = true;
    downloadFeeStructurePDF.innerHTML = '<span class="spinner"></span> Processing...';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const element = document.getElementById('feeStructureContent');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    if (element) {
      // Temporarily show instructions for PDF capture
      const note = element.querySelector('.global-fee-note-pdf');
      if (note) note.style.display = 'block';

      // Optimized scale: 1.5 provides good clarity while being faster than 2.0
      const canvas = await html2canvas(element, { scale: 1.5, useCORS: true });

      if (note) note.style.display = 'none';

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`fee_structure_${user.name}_${selectedYear}.pdf`);

      // Add footer with current date
      const dateStr = `Generated: ${new Date().toLocaleString()}`;
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(dateStr, 10, pdf.internal.pageSize.getHeight() - 10);
      pdf.text(`Page 1 of 1`, pdf.internal.pageSize.getWidth() - 10, pdf.internal.pageSize.getHeight() - 10, { align: 'right' });

    }

    downloadFeeStructurePDF.disabled = false;
    downloadFeeStructurePDF.innerHTML = originalHtml;
  });
}

// Download Fee Statement PDF
const downloadFeeStatementPDF = document.getElementById('downloadFeeStatementPDF');
if (downloadFeeStatementPDF) {
  downloadFeeStatementPDF.addEventListener('click', async () => {
    // Provide immediate feedback to the user
    const originalHtml = downloadFeeStatementPDF.innerHTML;
    downloadFeeStatementPDF.disabled = true;
    downloadFeeStatementPDF.innerHTML = '<span class="spinner"></span> Processing...';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const element = document.getElementById('feeStatementContent');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    if (element) {
      // Temporarily show instructions for PDF capture
      const note = element.querySelector('.global-fee-note-pdf');
      if (note) note.style.display = 'block';

      const canvas = await html2canvas(element, { scale: 1.5, useCORS: true });

      if (note) note.style.display = 'none';

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`fee_statement_${user.name}_${selectedYear}.pdf`);

      // Add footer with current date
      const dateStr = `Generated: ${new Date().toLocaleString()}`;
      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(dateStr, 10, pdf.internal.pageSize.getHeight() - 10);
      pdf.text(`Page 1 of 1`, pdf.internal.pageSize.getWidth() - 10, pdf.internal.pageSize.getHeight() - 10, { align: 'right' });

    }

    downloadFeeStatementPDF.disabled = false;
    downloadFeeStatementPDF.innerHTML = originalHtml;
  });
}

  // ---------------------------
  // UTILITY FUNCTIONS
  // ---------------------------
  const getSubjectAverages = (list) => {
    const subjects = {};
    list.forEach((m) => {
      const s = m.subject || "unknown";
      subjects[s] = subjects[s] || { total: 0, count: 0 };
      subjects[s].total += Number(m.score || 0);
      subjects[s].count++;
    });
    return Object.entries(subjects)
      .map(([s, v]) => ({ subject: s.replace(/-/g, " "), avg: v.total / v.count }))
      .sort((a, b) => b.avg - a.avg);
  };
  

  const getAssessmentLabel = (value) => {
    if (value == 0) return "Midterm";
    if (value == 5) return "End Term";
    return `Assessment ${value}`;
  };

 // ---------------------------


const displayStudentTables = async () => {
  const marksContainer = document.getElementById("learnerMarks");
  const analysisContainer = document.getElementById("learnerAnalysis");
  const spinner = document.getElementById("loadingSpinner");

  const showSpinner = () => spinner && (spinner.style.display = "block");
  const hideSpinner = () => spinner && (spinner.style.display = "none");

  showSpinner();
  marksContainer.innerHTML = "";
  if (analysisContainer) analysisContainer.innerHTML = "";

  try {
    // Get filter values
    const termEl = document.getElementById("termFilter");
    const yearEl = document.getElementById("yearFilter");
    const assessEl = document.getElementById("assessmentFilter");

    let termValue = termEl ? termEl.value.trim() : "all";
    let yearValue = yearEl ? yearEl.value.trim() : "all";
    let assessValue = assessEl ? assessEl.value.trim() : "all";

    const query = new URLSearchParams();
    if (termValue !== "all" && !isNaN(termValue)) query.set("term", Number(termValue));
    if (yearValue !== "all" && !isNaN(yearValue)) query.set("year", Number(yearValue));
    if (assessValue !== "all" && !isNaN(assessValue)) query.set("assessment", Number(assessValue));

    // Build URL
    let url = `${API_BASE}/marks/student`;
    const queryString = query.toString();
    if (queryString) url += `?${queryString}`;

    // Cache key for this specific query
    const cacheKey = `marks_${queryString || 'default'}`;
    let data = getCached(cacheKey);

    if (!data) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
       throw new Error(`Error fetching marks: ${res.status}`);
      }
      data = await res.json();
      setCached(cacheKey, data);
    }

    const studentMarks = data?.studentMarks || [];
    const allClassMarks = data?.allClassMarks || [];
    console.log("✅ Marks fetched:", { studentMarks, allClassMarks });

    if (!studentMarks.length) {
      marksContainer.textContent = "No marks found for the selected filters.";
      if (analysisContainer) analysisContainer.textContent = "No analysis data available.";
      hideSpinner();
      return;
    }

    const latest = studentMarks[0];

    // Update filter defaults
    if (termValue === "all" && termEl) termEl.value = latest.term;
    if (yearValue === "all" && yearEl) yearEl.value = latest.year;
    if (assessValue === "all" && assessEl) assessEl.value = latest.assessment;

    // Show latest info
    showToast(
      `📊 Latest: Term ${latest.term}, ${latest.year} (${getAssessmentLabel(latest.assessment)})`
    );

    // ===== Show pathway for Grade 10-12 students =====
    try {
      const welcomeNameEl = document.getElementById("welcomeName");
      if (welcomeNameEl) {
        let pathwayEl = document.getElementById("learnerPathway");
        if (!pathwayEl) {
          pathwayEl = document.createElement("span");
          pathwayEl.id = "learnerPathway";
          pathwayEl.style.marginLeft = "12px";
          pathwayEl.style.fontWeight = "700";
          pathwayEl.style.textTransform = "uppercase";
          pathwayEl.style.color = "#111";
          pathwayEl.style.fontSize = "0.95rem";
          welcomeNameEl.parentNode.insertBefore(pathwayEl, welcomeNameEl.nextSibling);
        }

        const dashboardGrade = Number(user.grade || latest.grade || 0);
        if (dashboardGrade >= 10 && dashboardGrade <= 12) {
          // Pick the first submitted mark that contains a pathway
          const pathwayMark = studentMarks.find(m => m.pathway && String(m.pathway).trim());
          if (pathwayMark && pathwayMark.pathway) {
            pathwayEl.textContent = String(pathwayMark.pathway).toUpperCase();
            pathwayEl.style.display = "inline-block";
            console.log('Pathway found for grade', dashboardGrade, ':', pathwayMark.pathway);
          } else {
            pathwayEl.textContent = "PATHWAY: N/A";
            pathwayEl.style.display = "inline-block";
            console.log('No pathway found in marks for grade', dashboardGrade);
          }
        } else {
          pathwayEl.textContent = "";
          pathwayEl.style.display = "none";
        }
      }
    } catch (err) {
      console.error('Pathway display error:', err);
    }

    // Group student marks by assessment (optional)
    const grouped = {};
    studentMarks.forEach((m) => {
      const key = `${m.grade}_${m.term}_${m.year}_${m.assessment}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    Object.entries(grouped).forEach(([key, list]) => {
      const [grade, term, year, assess] = key.split("_");
      const gradeNum = parseInt(grade.match(/\d+/)?.[0] || grade);
      const isSenior = gradeNum >= 10 && gradeNum <= 12;

      // Sort subjects/courses alphabetically for a clean, consistent list
      list.sort((a, b) => {
        const subA = (isSenior ? (a.course || "") : (a.subject || "")).toLowerCase().replace(/-/g, " ");
        const subB = (isSenior ? (b.course || "") : (b.subject || "")).toLowerCase().replace(/-/g, " ");
        return subA.localeCompare(subB);
      });

      // Define Shared Header Template
      const headerHtml = `
        <div class="marks-header" style="margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px; display: flex; flex-wrap: wrap; gap: 10px 25px; font-size: 0.95rem;">
          <p style="margin: 0;"><strong>Full Name:</strong> ${user.name}</p>
          <p style="margin: 0;"><strong>Admission No:</strong> ${user.admission}</p>
          <p style="margin: 0;"><strong>Grade/Class:</strong> ${grade}</p>
          <p style="margin: 0;"><strong>Term:</strong> ${term}</p>
          <p style="margin: 0;"><strong>Year:</strong> ${year}</p>
          <p style="margin: 0;"><strong>Assessment:</strong> ${getAssessmentLabel(assess)}</p>
        </div>
      `;

      // 1. MARKS TABLE WRAPPER
      const marksWrapper = document.createElement("div");
      marksWrapper.className = "card marks-report-card";
      marksWrapper.style.marginBottom = "30px";
      marksWrapper.innerHTML = headerHtml;

      const table = document.createElement("table");
      table.className = "marks-table";
      table.style.width = "100%";
      
      let thead = "";
      if (isSenior) {
        thead = `
          <thead>
            <tr>
              <th>Course</th>
              <th>CA (30%)</th>
              <th>PW (20%)</th>
              <th>Exam (50%)</th>
              <th>Final</th>
              <th>Level</th>
            </tr>
          </thead>`;
      } else {
        thead = `
          <thead>
            <tr>
              <th>Subject</th>
              <th>Score (%)</th>
              <th>Level</th>
            </tr>
          </thead>`;
      }

      let tbody = "<tbody>";
      list.forEach(m => {
        if (isSenior) {
          const final = cbcUtils.calculateFinalScore(m.continuousAssessment, m.projectWork, m.endTermExam);
          tbody += `
            <tr>
              <td>${(m.course || "Unknown").replace(/-/g, " ")}</td>
              <td>${m.continuousAssessment ?? "-"}</td>
              <td>${m.projectWork ?? "-"}</td>
              <td>${m.endTermExam ?? "-"}</td>
              <td><strong>${final !== null ? final + "%" : "-"}</strong></td>
              <td>${final !== null ? cbcUtils.getSubdivision(final) : "-"}</td>
            </tr>`;
        } else {
          tbody += `
            <tr>
              <td>${(m.subject || "Unknown").replace(/-/g, " ")}</td>
              <td>${m.score ?? 0}%</td>
              <td>${cbcUtils.getSubdivision(m.score || 0)}</td>
            </tr>`;
        }
      });
      tbody += "</tbody>";
      table.innerHTML = thead + tbody;

      // SYNC REPORT BUTTON
      const syncBtn = document.createElement("button");
      syncBtn.className = "btn primary-btn sync-report-btn";
      syncBtn.innerHTML = "🔄 Sync & Generate Report";
      syncBtn.style.marginBottom = "15px";
      syncBtn.onclick = () => {
        localStorage.setItem("studentReportMarks", JSON.stringify(list));
        showToast("✅ Data synced. Opening report form...");
        setTimeout(() => { window.location.href = "report.html"; }, 1200);
      };
      marksWrapper.appendChild(syncBtn);

      marksWrapper.appendChild(table);

      marksContainer.appendChild(marksWrapper);

      // 2. ANALYSIS WRAPPER (Component Analysis for Senior School)
      if (analysisContainer) {
        const analysisWrapper = document.createElement("div");
        analysisWrapper.className = "card analysis-report-card";
        analysisWrapper.style.marginBottom = "30px";
        analysisWrapper.innerHTML = headerHtml;

        const summary = document.createElement("div");
        summary.className = "analysis-summary";

        if (isSenior) {
          let caSum = 0, caCount = 0;
          let pwSum = 0, pwCount = 0;
          let etSum = 0, etCount = 0;
          let fsSum = 0, fsCount = 0;
          const courseScores = [];

          list.forEach(m => {
            if (m.continuousAssessment !== null) { caSum += Number(m.continuousAssessment); caCount++; }
            if (m.projectWork !== null) { pwSum += Number(m.projectWork); pwCount++; }
            if (m.endTermExam !== null) { etSum += Number(m.endTermExam); etCount++; }
            const fs = cbcUtils.calculateFinalScore(m.continuousAssessment, m.projectWork, m.endTermExam);
            if (fs !== null) {
              fsSum += fs;
              fsCount++;
              courseScores.push({ course: (m.course || "Unknown").replace(/-/g, " "), score: fs });
            }
          });

          const caAvg = caCount > 0 ? (caSum / caCount).toFixed(1) : 0;
          const pwAvg = pwCount > 0 ? (pwSum / pwCount).toFixed(1) : 0;
          const etAvg = etCount > 0 ? (etSum / etCount).toFixed(1) : 0;
          const fsAvg = fsCount > 0 ? (fsSum / fsCount).toFixed(1) : 0;

          const createProgressBar = (score, color) => `
            <div style="width:100%; background:#eee; border-radius:10px; height:6px; margin-top:3px;">
              <div style="width:${score}%; background:${color}; height:100%; border-radius:10px;"></div>
          </div>
        `;

        const topStrengths = courseScores.filter(s => s.score >= 80).sort((a, b) => b.score - a.score);
        const areasToImprove = courseScores.filter(s => s.score < 50).sort((a, b) => a.score - b.score);

        let strengthsHtml = topStrengths.length 
          ? topStrengths.map(s => `<div style="margin-bottom: 5px;"><span style="color:green;font-weight:bold;">${s.course} (${s.score}%)</span>${createProgressBar(s.score, "green")}</div>`).join("") 
          : "No courses above 80%.";
        
        let improveHtml = areasToImprove.length 
          ? areasToImprove.map(s => `<div style="margin-bottom: 5px;"><span style="color:red;font-weight:bold;">${s.course} (${s.score}%)</span>${createProgressBar(s.score, "red")}</div>`).join("") 
          : "Great work! No courses below 50%.";

        summary.innerHTML = `
          <hr style="margin: 10px 0;">
          <h4 style="text-align:center; color:#2563eb; margin: 5px 0; font-size: 1rem;">📊 COMPONENT ANALYSIS</h4>
          <p style="font-size:0.95rem; text-align:center; margin-bottom:10px;"><strong>Overall Final Score:</strong> <span style="color:#2563eb;">${fsAvg}%</span></p>
          
          <div class="table-scroll-wrapper">
            <table style="width:100%; border-collapse:collapse; margin:5px 0; font-size: 0.85rem;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="border:1px solid #ddd; padding:6px 8px; text-align:left;">Component</th>
                  <th style="border:1px solid #ddd; padding:6px 8px; text-align:center;">Avg. Score</th>
                  <th style="border:1px solid #ddd; padding:6px 8px; text-align:center;">Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="border:1px solid #ddd; padding:6px 8px;">Continuous Assessment</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;"><strong>${caAvg}%</strong> ${createProgressBar(caAvg, "orange")}</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;">30%</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ddd; padding:6px 8px;">Project Work</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;"><strong>${pwAvg}%</strong> ${createProgressBar(pwAvg, "#34d399")}</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;">20%</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ddd; padding:6px 8px;">End-Term Exam</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;"><strong>${etAvg}%</strong> ${createProgressBar(etAvg, "#2563eb")}</td>
                  <td style="border:1px solid #ddd; padding:6px 8px; text-align:center;">50%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top: 10px;">
            <div>
              <p style="margin-bottom: 5px; font-size: 0.9rem;"><strong>✅ TOP STRENGTHS:</strong></p>
              <div style="font-size:0.85rem;">${strengthsHtml}</div>
            </div>
            <div>
              <p style="margin-bottom: 5px; font-size: 0.9rem;"><strong>⚠️ AREAS TO IMPROVE:</strong></p>
              <div style="font-size:0.85rem;">${improveHtml}</div>
            </div>
          </div>
        `;
        } else {
          // Junior School Analysis (1-9)
          const averages = getSubjectAverages(list);
          const classMean = (averages.reduce((a, b) => a + b.avg, 0) / (averages.length || 1)).toFixed(1);

          summary.innerHTML = `
            <hr style="margin: 10px 0;">
            <h4 style="text-align:center; color:#2563eb; margin: 5px 0; font-size: 1rem;">📊 SUBJECT PERFORMANCE ANALYSIS</h4>
            <p style="font-size:0.95rem; text-align:center; margin-bottom:10px;"><strong>Overall Mean Score:</strong> <span style="color:#2563eb;">${classMean}%</span></p>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top: 10px;">
              <div>
                <p style="margin-bottom: 5px; font-size: 0.9rem;"><strong>✅ TOP SUBJECTS:</strong></p>
                <div style="font-size:0.85rem; color:green; font-weight:bold;">${averages.slice(0, 2).map(a => `${a.subject} (${a.avg.toFixed(1)}%)`).join('<br>')}</div>
              </div>
              <div>
                <p style="margin-bottom: 5px; font-size: 0.9rem;"><strong>⚠️ NEEDS IMPROVEMENT:</strong></p>
                <div style="font-size:0.85rem; color:red; font-weight:bold;">${averages.slice(-2).filter(a => a.avg < 50).reverse().map(a => `${a.subject} (${a.avg.toFixed(1)}%)`).join('<br>') || 'None'}</div>
              </div>
            </div>
          `;
        }
        analysisWrapper.appendChild(summary);
        analysisContainer.appendChild(analysisWrapper);
      }
    });
  } catch (err) {
    console.error("Display tables error:", err);
    marksContainer.textContent = "Error fetching marks. Please try again later.";
  } finally {
    hideSpinner();
  }
};


  // ---------------------------
  // FILTER & REFRESH BUTTONS
  // ---------------------------
  document.getElementById("applyFiltersBtn")?.addEventListener("click", displayStudentTables);
  
  const refreshBtnEl = document.getElementById("refreshBtn");
  if (refreshBtnEl) {
    refreshBtnEl.addEventListener("click", () => {
      localStorage.removeItem(CACHE_KEY); // Clear cache on explicit refresh
      refreshBtnEl.disabled = true;
      refreshBtnEl.classList.add("spinning");
      window.location.reload();
    });
  }


  // ---------------------------
  // INITIALIZATION
  // ---------------------------
  setupTabs();
});
