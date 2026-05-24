//admin.js
(function () {
  // ---------------------------
  // CONFIG + DOM SHORTCUTS
  // ---------------------------
  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL;

  // DOM shortcuts
  const schoolInfoDisplay = document.getElementById("schoolInfoDisplay");
  const headerSchoolLogo = document.getElementById("headerSchoolLogo");
  const sidebar = document.querySelector('.sidebar');
  const pageTitle = document.getElementById('pageTitle');
  const sidebarBrandLogo = document.querySelector('.sidebar-brand .logo'); // New shortcut

  let schoolInfo = null;

  // ---------------------------
  // SIDEBAR TOGGLE FUNCTIONALITY (Removed - not needed in new design)
  // ---------------------------




  // DOM elements
  const teacherSelect = document.getElementById("teacherSelect");
  const classTeacherSelect = document.getElementById("classTeacherSelect");
  const gradeRangeSelect = document.getElementById("gradeRange");
  const gradesSelect = document.getElementById("gradesSelect");
  const subjectsSelect = document.getElementById("subjectsSelect");
  const streamInput = document.getElementById("streamInput"); // 🆕 Stream for subjects
  const classStreamInput = document.getElementById("classStreamInput"); // 🆕 Stream for class teacher
  const subjectAllocTableBody = document.querySelector("#subjectAllocTable tbody");
  const classAllocTableBody = document.querySelector("#classAllocTable tbody");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const subjectSearchInput = document.getElementById("subjectSearchInput");
  const classSearchInput = document.getElementById("classSearchInput");
  const exportSubjectsBtn = document.getElementById("exportSubjectsBtn");
  const exportClassBtn = document.getElementById("exportClassBtn");
  const subjectAllocPrevBtn = document.getElementById("subjectAllocPrevBtn");
  const subjectAllocNextBtn = document.getElementById("subjectAllocNextBtn");
  const subjectAllocPageInfo = document.getElementById("subjectAllocPageInfo");

  // Pagination + caching for user list

  // Cached teacher list (used in allocation forms)
  let teachersCache = null;
  const subjectAllocForm = document.getElementById("subjectAllocForm");
  const classAllocForm = document.getElementById("classAllocForm");
  const classGradeSelect = document.getElementById("classGradeSelect");
  const subjectAllocTable = document.getElementById("subjectAllocTable");
  const classAllocTable = document.getElementById("classAllocTable");
  const fromAcademicYearInput = document.getElementById("fromAcademicYear");
  const toAcademicYearInput = document.getElementById("toAcademicYear");
  const previewPromotionBtn = document.getElementById("previewPromotionBtn");
  const archiveMarksBtn = document.getElementById("archiveMarksBtn");
  const confirmPromotionBtn = document.getElementById("confirmPromotionBtn");
  const promotionPreviewBody = document.querySelector("#promotionPreviewTable tbody");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
   const studentSearchBody = document.getElementById("studentSearchBody");


  let promoPage = 1;
  const promoLimit = 20;
  let promoTotalPages = 1;
  let promoLoading = false;

  let subjectAllocPage = 1;
  const SUBJECT_ALLOC_LIMIT = 5;
  let subjectAllocTotalPages = 1;
  let showUnassignedOnly = false; // 🆕 Track sub-tab filter
  let isRefreshing = false;
// ---------------------------
  // Term Lock Management DOM elements
  const termLockYearSelect = document.getElementById("termLockYearSelect");
  const termLockTermSelect = document.getElementById("termLockTermSelect");
  const termLockStatusDisplay = document.getElementById("termLockStatusDisplay");
  const termLockToggleButton = document.getElementById("termLockToggleButton");
  const saveTermLockBtn = document.getElementById("saveTermLockBtn");
// FETCH SCHOOL INFO
// ---------------------------
// Derive BACKEND_URL from config (removes /api suffix)
const BACKEND_URL = config.api.baseURL.replace('/api', '');

async function loadSchoolInfo(forceReload = false) {
  const CACHE_KEY = "admin_school_info_cache";
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (reduced from 30 to catch updates faster)

  if (!forceReload) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          console.log("✅ Using cached school info");
          schoolInfo = data;
          window.schoolInfo = schoolInfo;
          renderSchoolInfo();
          return;
        }
      } catch (e) { console.warn("Cache read error:", e); }
    }
  }
  
  // Clear expired cache
  if (!forceReload) {
    localStorage.removeItem(CACHE_KEY);
  }

  try {
    const token = authService.getToken();
    const res = await fetch(`${API_BASE}/my-school`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Failed to fetch school info");

    schoolInfo = await res.json();
    window.schoolInfo = schoolInfo;
    
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: schoolInfo
    }));

    renderSchoolInfo();

  } catch (err) {
    console.error("School info error:", err);
    showToast("Failed to load school info", "error");
  }
}

function renderSchoolInfo() {
  if (!schoolInfo) return;

  // Detect logo format and create appropriate URL
  let logoURL = "";
  if (schoolInfo.logo) {
    // Check if logo is a file path (legacy) or base64 (new)
    if (schoolInfo.logo.startsWith('/') || schoolInfo.logo.includes('uploads/')) {
      // Legacy file path - use with backend URL
      logoURL = `${BACKEND_URL}${schoolInfo.logo}?t=${Date.now()}`;
    } else if (schoolInfo.logo.startsWith('http')) {
      // Absolute URL
      logoURL = schoolInfo.logo;
    } else {
      // New base64 format - convert to data URL
      logoURL = `data:${schoolInfo.logoMimeType || 'image/png'};base64,${schoolInfo.logo}`;
    }
  }

  // Replace "Admin Portal" branding with School Name and Logo at the top of the sidebar
  if (sidebarBrandLogo) {
    sidebarBrandLogo.innerHTML = `
      ${logoURL ? `<img src="${logoURL}" alt="Logo" crossorigin="anonymous" style="max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; border-radius: 4px;">` : ""}
      <div class="school-name" style="font-size: 1.25rem; font-weight: 800; color: #fff; text-align: center; line-height: 1.2; text-transform: uppercase;">${schoolInfo.name || "School Name"}</div>
    `;
  }

  // Ensure address is not shown in sidebar (Name and Logo alone)
  if (schoolInfoDisplay) {
    schoolInfoDisplay.innerHTML = '';
  }

  // Render logo in header
  if (headerSchoolLogo && logoURL) {
    headerSchoolLogo.style.display = 'none'; // Hide the logo in the header as requested
  }

  renderAdminSignature();
  applySchoolTypeToGradeSelectors();

  // For PDF export (ensure window.schoolLogoElem is defined in admin.html if needed)
  const pdfSchoolLogo = document.getElementById("pdfSchoolLogo"); // Assuming an element for PDF logo
  if (pdfSchoolLogo && logoURL) {
    pdfSchoolLogo.src = logoURL;
  }
}

function renderAdminSignature() {
  // Try to find a professional placement in the User Management area
  // Now targeting the dedicated signatureUploadSection
  let signatureUploadSection = document.getElementById("signatureUploadSection");
  if (!signatureUploadSection) {
    // If the section doesn't exist in admin.html, create it dynamically
    const mainContent = document.getElementById("contentArea") || document.querySelector(".main-content") || document.querySelector(".main");
    if (mainContent) {
      signatureUploadSection = document.createElement("div");
      signatureUploadSection.id = "signatureUploadSection";
      signatureUploadSection.className = "tab-section"; 
      if (!signatureUploadSection.style.display) {
        signatureUploadSection.style.display = "none";
      }
      mainContent.appendChild(signatureUploadSection);
    } else {
      console.warn("Main content area not found. Cannot render admin signature UI.");
      return;
    }
  }

  if (!schoolInfo) {
    signatureUploadSection.innerHTML = '<div class="card"><p style="text-align:center; padding:20px; color:#64748b;">Loading school configuration...</p></div>';
    return;
  }

  if (schoolInfo.allowSignatureUpload === false) {
    signatureUploadSection.innerHTML = '<div class="card"><p style="text-align:center; padding:20px; color:#dc3545;">Digital signature upload is disabled for this school.</p></div>';
    return;
  }

  // Clear previous content if any
  signatureUploadSection.innerHTML = `
    <div class="card">
      <div class="admin-section-header-row">
        <h3>Digital Signature Management</h3>
      </div>
      <p style="margin-bottom: 20px; color: #6b7280;">Upload or update the official digital signature for reports and documents. This signature will represent the Headteacher/Principal.</p>
      <div class="headteacher-sig-box" style="margin: 0 auto; max-width: 300px; padding: 20px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h4 style="font-size: 1rem; margin-top: 0; margin-bottom: 15px; color: #1f2937;">Current Official Signature</h4>
          <p class="sig-label">Headteacher/Principal's Signature</p>
          <div id="adminSigPreview" class="sig-preview-area">
            ${schoolInfo.headteacherSignatureUrl ? 
              `<img src="${schoolInfo.headteacherSignatureUrl}" style="max-height: 60px; max-width: 150px; filter: contrast(1.05); object-fit: contain;">` : 
              `<span style="font-size: 0.75rem; color: #a0aec0; font-style: italic;">No signature uploaded</span>`
            }
          </div>
          <button class="btn secondary-btn" id="uploadAdminSigBtn" style="font-size: 0.65rem; padding: 2px 19px; margin-top: 8px; border-radius: 6px; font-weight: 600;">Update Digital Signature</button>
          <input type="file" id="adminSigInput" style="display:none;" accept="image/*">
      </div>
    </div>
  `;
  attachAdminSignatureLogic();
}

function attachAdminSignatureLogic() {
    const btn = document.getElementById("uploadAdminSigBtn");
    const input = document.getElementById("adminSigInput");
    if (!btn || !input) return;

    btn.onclick = () => input.click();

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast("Uploading official signature...", "info");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const token = authService.getToken();
            const res = await fetch(`${API_BASE}/materials/upload-raw`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            console.log("Admin uploading signature. Cloudinary URL received:", data.url);
            await fetch(`${API_BASE}/update-school-signature`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ signatureUrl: data.url })
            });

            showToast("✅ Official signature updated", "success");
            // Clear cache so the new signature is displayed immediately
            localStorage.removeItem("admin_school_info_cache");
            loadSchoolInfo(true);
        } catch (err) {
            showToast(err.message, "error");
        }
    };
}


  // ---------------------------
  // SMALL UI HELPERS
  // ---------------------------

  function showFeedback(element, message, type = "info") {
    if (!element) return;
    element.textContent = message;
    element.className = `feedback ${type}`;
    element.style.display = "block";
    if (type === "info" || type === "success") {
      setTimeout(() => element.style.display = "none", 3000);
    }
  }

  function createSpinner(size = 18) {
    const s = document.createElement("span");
    s.className = "spinner";
    s.style.display = "inline-block";
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.border = "2px solid rgba(0,0,0,0.08)";
    s.style.borderTop = "2px solid rgba(0,0,0,0.6)";
    s.style.borderRadius = "50%";
    s.style.animation = "spin 0.8s linear infinite";
    return s;
  }

  (function addSpinKeyframes() {
    const id = "adminjs-spin-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      
      /* Dashboard Layout */
      .dashboard-wrapper { display: flex; min-height: 100vh; width: 100%; }
      .sidebar { width: 260px; background: #2b6cb0 !important; color: white !important; padding: 20px 0; flex-shrink: 0; position: sticky; top: 0; height: 100vh; z-index: 1100; box-shadow: 4px 0 10px rgba(0,0,0,0.1); }
      .main-content { flex-grow: 1; background: #f8fafc; min-width: 0; }
      
      .sidebar-brand .logo { font-size: 1.4rem; font-weight: 800; margin-bottom: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0 20px 15px 20px; letter-spacing: 1px; color: white; }
      
      /* Sidebar Menu Styling */
      .menu { padding: 0 20px; margin: 0; list-style: none; display: flex !important; flex-direction: column !important; gap: 4px; }
      .menu li { transition: all 0.2s ease; margin: 6px 0; border-radius: 8px; overflow: hidden; }
      .menu li:not([data-section]) { padding: 0; }
      .menu li[data-section] { padding: 12px 15px; cursor: pointer; color: rgba(255,255,255,0.8); font-weight: 500; display: flex; align-items: center; }
      .menu li:hover { background: rgba(255, 255, 255, 0.1) !important; color: white !important; }
      .menu li.active { background: #1a4d8c !important; color: white !important; font-weight: 700; box-shadow: inset 4px 0 0 #fff; }
      
      /* Menu Icons */
      .menu li[data-section]::before { margin-right: 12px; font-size: 1.1rem; width: 20px; text-align: center; }
      .menu li[data-section="userManagement"]::before { content: "👥"; }
      .menu li[data-section="subjectAllocations"]::before { content: "📖"; }
      .menu li[data-section="classAllocations"]::before { content: "👨‍🏫"; }
      .menu li[data-section="studentPromotion"]::before { content: "🎓"; }
      .menu li[data-section="studentSearch"]::before { content: "🔍"; }
      .menu li[data-section="signatureUploadSection"]::before { content: "✍️"; } /* New icon for signature */
      .menu li[data-section="termLockManagementSection"]::before { content: "🔒"; } /* New icon for term lock management */
      
      .menu li a { display: block; padding: 12px 15px; color: rgba(255,255,255,0.8); text-decoration: none; font-weight: 500; transition: all 0.2s; }
      .menu li a:hover { color: white; background: rgba(255, 255, 255, 0.1); }
      
      .menu-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 15px 0 !important; }
      
      /* Professional Blue Header */
      .header { position: sticky !important; top: 0; z-index: 1000; background: #2b6cb0 !important; padding: 15px 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
      .header .school-name, .header .school-address, .header h1, .header h2, .header p, .header span { color: #ffffff !important; }
      
      .feedback.error { color: #721c24; background: #f8d7da; padding:8px; border-radius:6px; border-left: 4px solid #dc3545; }
      .feedback.info { color: #0f5132; background: #d1e7dd; padding:8px; border-radius:6px; }
      .toast { transition: opacity .35s ease; }
      tr.clickable-row { cursor: pointer; }
      .danger { background: #dc3545; color: #fff; border: none; padding: 4px 8px; border-radius:4px; cursor:pointer; }
      /* Compact Table Styles */
      table td { padding: 6px 10px !important; vertical-align: middle !important; }
      table th { padding: 10px 10px !important; }
      
      /* Modern Toast Styles */
      #toastContainer { position: fixed; right: 20px; bottom: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; }
      .toast { 
        padding: 12px 18px; border-radius: 8px; color: white !important; font-weight: 600; font-size: 0.9rem;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); min-width: 250px;
        transform: translateX(0); transition: all 0.35s ease;
      }
      .toast-success { background: #38a169 !important; border-left: 5px solid #22543d; }
      .toast-error { background: #e53e3e !important; border-left: 5px solid #742a2a; }
      .toast-info { background: #3182ce !important; border-left: 5px solid #2a4365; }
      .toast.hiding { opacity: 0; transform: translateX(50px); }

      /* Centered Modal Styles */
      .confirm-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
        display: flex; justify-content: center; align-items: center;
        z-index: 11000; opacity: 0; visibility: hidden; transition: all 0.3s ease;
      }
      .confirm-overlay.visible { opacity: 1; visibility: visible; }
      .confirm-box {
        background: white; padding: 30px; border-radius: 16px; width: 90%; max-width: 400px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); transform: scale(0.9);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); text-align: center;
      }
      .confirm-overlay.visible .confirm-box { transform: scale(1); }
      .confirm-box h4 { margin: 0 0 10px; font-size: 1.3rem; font-weight: 800; color: #1a202c; }
      .confirm-box p { margin: 0 0 25px; color: #4a5568; line-height: 1.6; font-size: 1rem; }
      .confirm-buttons { display: flex; justify-content: center; gap: 15px; }
      
      .admin-section-header-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: 25px; width: 100%; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; }
      .admin-section-header-row h1, .admin-section-header-row h2, .admin-section-header-row h3 { margin: 0 !important; font-size: 1.4rem; color: #1e293b; }
      #adminSignatureSection { margin-left: auto; }
      .admin-section-header-row button { margin-left: 12px; }

      /* Suspended Status Styling */
      .suspended-status { color: #dc3545 !important; font-weight: 700; }
      .toggleStatusBtn { 
        background: #64748b; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;
        font-size: 0.75rem; font-weight: 600;
      }
      .toggleStatusBtn:hover { background: #475569; }

      .headteacher-sig-box { display: flex; flex-direction: column; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 10px; margin: 0; width: fit-content; min-width: 180px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      .sig-label { font-size: 0.6rem; font-weight: 800; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #f1f5f9; width: 100%; text-align: center; padding-bottom: 2px; }
      .sig-preview-area { min-height: 50px; display: flex; align-items: center; justify-content: center; width: 100%; background: #fafafa; border-radius: 6px; }
    `;
    document.head.appendChild(style);
  })();

  const GRADE_ORDER = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

  const SCHOOL_TYPES = {
    full: {
      label: "Full School (Grades 1-12)",
      rangeOptions: ["1-3", "4-6", "7-9", "10-12"],
      gradeOptions: ["1","2","3","4","5","6","7","8","9","10","11","12"]
    },
    primary_junior: {
      label: "Primary + Junior (Grades 1-9)",
      rangeOptions: ["1-3", "4-6", "7-9"],
      gradeOptions: ["1","2","3","4","5","6","7","8","9"]
    },
    senior: {
      label: "Senior School (Grades 10-12)",
      rangeOptions: ["10-12"],
      gradeOptions: ["10","11","12"]
    }
  };

  const normalizeGrade = (g) => {
    if (!g) return "";
    const match = String(g).match(/\d+/);
    return match ? `Grade ${match[0]}` : g;
  };

  const getSchoolTypeKey = () => {
    return (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
  };

  const populateGradeRangeOptions = () => {
    if (!gradeRangeSelect) return;
    const schoolType = getSchoolTypeKey();
    const options = SCHOOL_TYPES[schoolType].rangeOptions;

    gradeRangeSelect.innerHTML = '<option value="">-- Select Range --</option>';
    options.forEach(range => {
      const opt = document.createElement('option');
      opt.value = range;
      const [start, end] = range.split('-').map(Number);
      opt.textContent = start === end ? `Grade ${start}` : `Grade ${start}-${end}`;
      gradeRangeSelect.appendChild(opt);
    });
  };

  const populateClassGradeOptions = () => {
    if (!classGradeSelect) return;
    const schoolType = getSchoolTypeKey();
    const options = SCHOOL_TYPES[schoolType].gradeOptions;

    classGradeSelect.innerHTML = '';
    options.forEach(grade => {
      const opt = document.createElement('option');
      opt.value = grade;
      opt.textContent = `Grade ${grade}`;
      classGradeSelect.appendChild(opt);
    });
  };

  const resetGradeSelection = () => {
    if (gradesSelect) gradesSelect.innerHTML = '';
    if (gradeRangeSelect) gradeRangeSelect.value = '';
  };

  const applySchoolTypeToGradeSelectors = () => {
    populateGradeRangeOptions();
    populateClassGradeOptions();
    resetGradeSelection();
  };

  const getNextGrade = (currentGrade) => {
  const normalized = normalizeGrade(currentGrade);
  const index = GRADE_ORDER.indexOf(normalized);

  if (index === -1 || index === GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[index + 1];
};

// ---------------------------
// PROMOTION PREVIEW RENDERER (UPDATED)
// ---------------------------
function renderPromotionPreview(data = []) {
  if (!promotionPreviewBody) return;
  
  promotionPreviewBody.innerHTML = "";

  if (!data || !data.length) {
    promotionPreviewBody.innerHTML =
      `<tr><td colspan="5" style="text-align:center">No students found</td></tr>`;
    if (confirmPromotionBtn) confirmPromotionBtn.disabled = true;
    return;
  }

  data.forEach(s => {
    const tr = document.createElement("tr");
    tr.dataset.studentId = s.studentId;

    const disabled = s.status !== "active";

    const actionSelect = disabled
      ? `<select disabled>
           <option>${s.status.toUpperCase()}</option>
         </select>`
      : `<select class="promotion-action">
           <option value="promote" selected>Promote</option>
           <option value="repeat">Repeat</option>
           <option value="transfer">Transfer</option>
         </select>`;

    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.admission}</td>
      <td>${s.currentGrade}</td>
      <td>${s.nextGrade || "Completed"}</td>
      <td>${actionSelect}</td>
    `;

    promotionPreviewBody.appendChild(tr);
  });

  // Enable confirm if at least one active student exists
  if (confirmPromotionBtn) confirmPromotionBtn.disabled = !data.some(s => s.status === "active");
}


previewPromotionBtn.addEventListener("click", () => {
    if (promoLoading) return;
    loadPromotionPreview(1);
  });

  async function loadPromotionPreview(page = 1) {
  const year = fromAcademicYearInput.value.trim();
  if (!year) {
    showToast("Enter academic year", "error");
    return;
  }

  // Show loading in button and table
  promoLoading = true;
  const originalHTML = previewPromotionBtn.innerHTML;
  previewPromotionBtn.disabled = true;
  previewPromotionBtn.innerHTML = '<span class="spinner"></span>Loading...';
  
  if (promotionPreviewBody) {
    promotionPreviewBody.innerHTML = '<tr><td colspan="5" style="text-align:center"><span class="spinner"></span> Loading...</td></tr>';
  }

  try {
    const res = await secureFetch(
      `${API_BASE}/promotions/preview?academicYear=${year}&page=${page}&limit=${promoLimit}`
    );

    if (res) {
      promoPage = res.currentPage || 1;
      // Robustly handle total pages from root or pagination object
      promoTotalPages = res.totalPages || res.pagination?.totalPages || res.pages || 1;

      // Exhaustive check for the data array key to ensure learners appear in the table
      const previewData = res.preview || res.results || res.students || res.users || res.learners || res.data || res.docs || (Array.isArray(res) ? res : []);
      
      renderPromotionPreview(previewData);
      renderPromotionPagination();
    }
  } finally {
    promoLoading = false;
    previewPromotionBtn.disabled = false;
    previewPromotionBtn.innerHTML = originalHTML;
  }
}

function renderPromotionPagination() {
  const table = document.getElementById("promotionPreviewTable");
  let controls = document.getElementById("promoPaginationControls");
  
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "promoPaginationControls";
    controls.style = "display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; align-items: center;";
    table.parentNode.insertBefore(controls, table.nextSibling);
  }

  controls.innerHTML = promoTotalPages > 0 ? `
    <button id="promoPrevBtn" class="pagination-btn" ${promoPage <= 1 ? "disabled" : ""}>Prev</button>
    <span style="font-weight: 600; font-size: 14px;">Page ${promoPage} of ${promoTotalPages}</span>
    <button id="promoNextBtn" class="pagination-btn" ${promoPage >= promoTotalPages ? "disabled" : ""}>Next</button>
  ` : '';

  const prevBtn = document.getElementById("promoPrevBtn");
  const nextBtn = document.getElementById("promoNextBtn");

  if (prevBtn) prevBtn.onclick = () => {
    if (!promoLoading && promoPage > 1) loadPromotionPreview(promoPage - 1);
  };
  if (nextBtn) nextBtn.onclick = () => {
    if (!promoLoading && promoPage < promoTotalPages) loadPromotionPreview(promoPage + 1);
  };
}

confirmPromotionBtn.addEventListener("click", async () => {
  const fromYear = Number(fromAcademicYearInput.value);
  const toYear = Number(toAcademicYearInput.value);

  const decisions = [];

  document.querySelectorAll("#promotionPreviewTable tbody tr").forEach(tr => {
    const select = tr.querySelector(".promotion-action");
    if (!select || select.disabled) return;

    decisions.push({
      studentId: tr.dataset.studentId,
      action: select.value
    });
  });

  if (!decisions.length) {
    showToast("No eligible students", "info");
    return;
  }

  const ok = await showConfirm({
    title: "Confirm Promotion",
    message: `Apply promotion for ${toYear}?`
  });

  if (!ok) return;

  const originalHTML = confirmPromotionBtn.innerHTML;
  confirmPromotionBtn.disabled = true;
  confirmPromotionBtn.innerHTML = '<span class="spinner"></span>Processing...';

  try {
    const res = await secureFetch(`${API_BASE}/promotions/promote`, {
      method: "POST",
      body: JSON.stringify({
        fromAcademicYear: fromYear,
        toAcademicYear: toYear,
        decisions
      })
    });

    if (res) {
      showToast("Promotion completed", "success");
      promotionPreviewBody.innerHTML = "";
      confirmPromotionBtn.disabled = true;
    }
  } finally {
    confirmPromotionBtn.disabled = false;
    confirmPromotionBtn.innerHTML = originalHTML;
  }
});


  // ---------------------------
  // API HELPER
  // ---------------------------
  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    options.headers = { ...options.headers, "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        const text = contentType.includes("application/json") ? await res.json() : await res.text();
        const errMsg = typeof text === "string" ? text : JSON.stringify(text);
        throw new Error(errMsg || `Request failed: ${res.status}`);
      }

      if (contentType.includes("application/json")) return res.json();
      return res.text();
    } catch (err) {
      console.error("Fetch error:", err);
      showToast(err.message || "Network error", "error");
      return null;
    }
  }

  // ---------------------------
  // GRADE SUBJECTS
  // ---------------------------
  const gradeSubjects = SUBJECT_DATA.gradeSubjects;

  // SENIOR SCHOOL PATHWAYS & COURSES (Grade 10-12)
  const seniorSchoolPathways = SUBJECT_DATA.seniorSchoolPathways;

  // ---------------------------
  // RENDER HELPERS
  // ---------------------------
  function clearElement(el) { if (el) el.innerHTML = ""; }

  function populateTeacherSelects(users = []) {
    if (!teacherSelect || !classTeacherSelect) return;
    teacherSelect.innerHTML = "";
    classTeacherSelect.innerHTML = "";
    users.filter(u => u.role === "teacher").forEach(u => {
      const opt1 = document.createElement("option");
      const opt2 = document.createElement("option");
      opt1.value = opt2.value = u._id;
      opt1.textContent = opt2.textContent = u.name;
      teacherSelect.appendChild(opt1);
      classTeacherSelect.appendChild(opt2);
    });
  }

  function renderSubjectAllocations(data = []) {
    if (!subjectAllocTableBody) return;
    const frag = document.createDocumentFragment();

    data.forEach(item => {
      const allocations = Array.isArray(item.allocations) ? item.allocations : [];

      if (allocations.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="white-space: nowrap;"><strong>${item.name}</strong> <button class="btn secondary-btn btn-edit-profile" data-id="${item._id}" data-name="${item.name}" data-email="${item.email || ''}" data-contact="${item.contact || ''}" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 8px;">👤 Edit</button></td>
          <td></td>
          <td></td>
          <td>
            <input type="checkbox" class="dean-toggle" data-id="${item._id}" ${item.isDean ? 'checked' : ''}>
          </td>
          <td>
            <span style="color: #94a3b8; font-style: italic; font-size: 0.8rem;">No allocations</span>
          </td>
        `;
        frag.appendChild(tr);
      } else {
        allocations.forEach((alloc, index) => {
          const gradeLabel = alloc.stream ? `Grade ${alloc.grade}${alloc.stream}` : `Grade ${alloc.grade}`;
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td style="white-space: nowrap;">
              ${index === 0 ? `<strong>${item.name}</strong> <button class="btn secondary-btn btn-edit-profile" data-id="${item._id}" data-name="${item.name}" data-email="${item.email || ''}" data-contact="${item.contact || ''}" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 8px;">👤 Edit</button>` : ""}
            </td>
            <td>${gradeLabel}</td>
            <td>${Array.isArray(alloc.subjects) && alloc.subjects.length > 0 ? alloc.subjects.join(", ") : "No subjects allocated"}</td>
            <td>
              ${index === 0 ? `<input type="checkbox" class="dean-toggle" data-id="${item._id}" ${item.isDean ? 'checked' : ''}>` : ""}
            </td>
            <td style="white-space: nowrap;">
              <button class="danger" data-id="${item._id}" data-grade="${alloc.grade}" data-stream="${alloc.stream || ''}" data-action="remove-subjects" title="Remove Allocation">Remove</button>
            </td>
          `;
          frag.appendChild(tr);
        });
      }
    });

    clearElement(subjectAllocTableBody);
    subjectAllocTableBody.appendChild(frag);
  }

  function renderClassAllocations(data = []) {
    if (!classAllocTableBody) return;
    const frag = document.createDocumentFragment();

    data.forEach(item => {
      const classLabel = item.classLabel || (item.assignedStream ? `Grade ${item.assignedClass}${item.assignedStream}` : `Grade ${item.assignedClass}`);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.teacherName}${item.isClassTeacher ? " (Class Teacher)" : ""}</td>
        <td>${classLabel}</td>
        <td><button class="danger" data-id="${item.teacherId}" data-action="remove-class">Remove</button></td>
      `;
      frag.appendChild(tr);
    });

    clearElement(classAllocTableBody);
    classAllocTableBody.appendChild(frag);
  }

  // ---------------------------
  // LOADERS
  // ---------------------------
  async function loadTeacherOptions(forceReload = false) {
    const CACHE_KEY = "admin_teachers_cache";
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    if (teachersCache && !forceReload) {
      populateTeacherSelects(teachersCache);
      return;
    }

    if (!forceReload) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            console.log("✅ Using cached teacher list");
            teachersCache = data;
            populateTeacherSelects(data);
            return;
          }
        } catch (e) { console.warn("Cache read error:", e); }
      }
    }

    const token = authService.getToken();
    const res = await secureFetch(`${API_BASE}/users?role=teacher&limit=500`);
    if (!res || !res.users) return;

    teachersCache = res.users;
    
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: teachersCache
    }));

    populateTeacherSelects(teachersCache);
  }

  async function loadSubjectAllocations(page = subjectAllocPage, limit = SUBJECT_ALLOC_LIMIT, force = false) {
    if (!subjectAllocTableBody) return;
    
    if (subjectAllocTableBody.dataset.loading === "true") return;
    subjectAllocTableBody.dataset.loading = "true";

    const CACHE_KEY = `subject_allocations_p${page}_un${showUnassignedOnly}`;
    if (!force) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          subjectAllocPage = data.pagination?.page || page;
          subjectAllocTotalPages = data.pagination?.totalPages || 1;
          renderSubjectAllocations(data.data || data);
          subjectAllocTableBody.dataset.loading = "false";
          updateSubjectAllocPaginationControls();
          return;
        }
      }
    }

    subjectAllocTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center">${createSpinner().outerHTML} Loading allocations...</td></tr>`;
    
    try {
      let url = `${API_BASE}/users/subjects/allocations?page=${page}&limit=${limit}`;
      if (showUnassignedOnly) {
        url += `&unassigned=true`;
      }
      const response = await secureFetch(url);
      if (!response) { subjectAllocTableBody.innerHTML = ""; return; }

      const allocationData = Array.isArray(response) ? response : response.data || [];
      const pagination = response.pagination || {};

      subjectAllocPage = pagination.page || page;
      subjectAllocTotalPages = pagination.totalPages || 1;

      if (showUnassignedOnly && allocationData.length === 0) {
        subjectAllocTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color: #64748b;">🎉 All teachers have been assigned subjects.</td></tr>`;
        const badge = document.getElementById("unassignedCountBadge");
        if (badge) {
          badge.textContent = "0";
          badge.style.display = "none";
        }
        return;
      }

      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: response }));
      renderSubjectAllocations(allocationData);

      // 🆕 Sync badge state after loading new data
      const badge = document.getElementById("unassignedCountBadge");
      if (badge) {
        if (showUnassignedOnly) {
          const count = pagination.total || 0;
          badge.textContent = count;
          badge.style.display = count > 0 ? "inline-block" : "none";
          badge.style.background = count > 0 ? "#fee2e2" : "#e2e8f0";
          badge.style.color = count > 0 ? "#b91c1c" : "#475569";
        } else {
          // Update count in background if we are currently looking at assigned teachers
          updateUnassignedBadge();
        }
      }
    } finally {
      subjectAllocTableBody.dataset.loading = "false";
      updateSubjectAllocPaginationControls();

      // 🆕 Update timestamp for administrative awareness
      const updateEl = document.getElementById("subjectAllocLastUpdated");
      if (updateEl) {
        updateEl.textContent = `Last updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
  }

  async function loadClassAllocations() {
    if (!classAllocTableBody) return;
    if (classAllocTableBody.dataset.loading === "true") return;
    classAllocTableBody.dataset.loading = "true";

    classAllocTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center">${createSpinner().outerHTML} Loading class allocations...</td></tr>`;
    try {
      const data = await secureFetch(`${API_BASE}/users/allocations`);
      if (!data) { classAllocTableBody.innerHTML = ""; return; }
      renderClassAllocations(data);
    } finally {
      classAllocTableBody.dataset.loading = "false";
    }
  }
//------------------------
  //EDIT ENROLLMENT MODAL
//------------------------
  async function openEditModal(enrollment) {
  const modal = document.createElement("div");
  modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:10000;overflow:auto;";
  
  const enrollmentId = enrollment._id || enrollment.id;
  
  modal.innerHTML = `
    <div style="background:#fff;padding:20px;border-radius:8px;min-width:350px;margin:auto;">
      <h3>Edit Enrollment</h3>
      <div style="margin:15px 0;">
        <label>Academic Year:</label>
        <input type="number" id="editAcademicYear" value="${enrollment.academicYear || ''}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
      </div>
      <div style="margin:15px 0;">
        <label>Grade:</label>
        <input type="text" id="editGrade" value="${enrollment.grade || ''}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
      </div>
      <div style="margin:15px 0;">
        <label>Stream (Optional):</label>
        <input type="text" id="editStream" value="${enrollment.stream || ''}" placeholder="e.g., A, B, C" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
      </div>
      <div style="margin:15px 0;">
        <label>Status:</label>
        <select id="editStatus" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
          <option value="active" ${enrollment.status==='active'?'selected':''}>Active</option>
          <option value="completed" ${enrollment.status==='completed'?'selected':''}>Completed</option>
          <option value="transferred" ${enrollment.status==='transferred'?'selected':''}>Transferred</option>
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button id="saveEditBtn" style="flex:1;padding:10px;background:#2ecc71;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save</button>
        <button id="cancelEditBtn" style="flex:1;padding:10px;background:#95a5a6;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const cancelEditBtn = modal.querySelector("#cancelEditBtn");
  const saveEditBtn = modal.querySelector("#saveEditBtn");

  if (cancelEditBtn) cancelEditBtn.onclick = () => modal.remove();

  if (saveEditBtn) saveEditBtn.onclick = async () => {
    const updated = {
      academicYear: document.getElementById("editAcademicYear").value,
      grade: document.getElementById("editGrade").value,
      stream: document.getElementById("editStream").value || null,
      status: document.getElementById("editStatus").value
    };

    const res = await secureFetch(`${API_BASE}/enrollments/${enrollmentId}`, {
      method: "PUT",
      body: JSON.stringify(updated)
    });

    if (res) {
      showToast("Enrollment updated successfully", "success");
      modal.remove();
      if (studentSearchBtn) studentSearchBtn.click(); // refresh search results
    }
  };
}

// ---------------------------
// EDIT STUDENT PROFILE MODAL
// ---------------------------
function openEditProfileModal(userToEdit) {
  const modal = document.createElement("div");
  modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:10000;overflow:auto;";
  
  const isStudent = !!userToEdit.admission;
  
  modal.innerHTML = `
    <div style="background:#fff;padding:20px;border-radius:8px;min-width:350px;margin:auto;max-width:420px;">
      <h3>Edit Profile (${isStudent ? 'Learner' : 'Staff'})</h3>
      <div style="margin:15px 0;">
        <label>Full Name:</label>
        <input type="text" id="editProfileName" value="${userToEdit.name || ''}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;" />
      </div>
      <div style="margin:15px 0;">
        <label>${isStudent ? 'Admission Number' : 'Email Address'}:</label>
        <input type="text" id="editProfileIdentifier" value="${isStudent ? (userToEdit.admission || '') : (userToEdit.email || '')}" 
               style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px; ${!isStudent ? 'background:#f1f5f9;' : ''}" ${!isStudent ? 'readonly' : ''} />
      </div>
      <div style="margin:15px 0;">
        <label>Contact:</label>
        <input type="text" id="editProfileContact" value="${userToEdit.contact || ''}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;" />
      </div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button id="saveProfileBtn" style="flex:1;padding:10px;background:#2ecc71;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save</button>
        <button id="cancelProfileBtn" style="flex:1;padding:10px;background:#95a5a6;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelProfileBtn = modal.querySelector("#cancelProfileBtn");
  const saveProfileBtn = modal.querySelector("#saveProfileBtn");

  if (cancelProfileBtn) cancelProfileBtn.onclick = () => modal.remove();

  if (saveProfileBtn) saveProfileBtn.onclick = async () => {
    const originalHTML = saveProfileBtn.innerHTML;
    saveProfileBtn.disabled = true;
    saveProfileBtn.innerHTML = `${createSpinner(14).outerHTML} Saving...`;

    const payload = {
      name: document.getElementById("editProfileName").value.trim(),
      contact: document.getElementById("editProfileContact").value.trim() || null
    };

    if (isStudent) {
      payload.admission = document.getElementById("editProfileIdentifier").value.trim();
    } else {
      payload.email = document.getElementById("editProfileIdentifier").value.trim();
    }

    try {
      const res = await secureFetch(`${API_BASE}/users/${userToEdit.id || userToEdit._id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      if (res) {
        showToast("Profile updated successfully", "success");
        modal.remove();
        // Refresh whatever table the user is likely looking at
        if (document.getElementById("studentSearchSection")?.style.display === "block" || document.getElementById("searchSection")?.style.display === "block") {
          if (studentSearchBtn) studentSearchBtn.click();
        } else {
          loadSubjectAllocations();
        }
      }
    } catch (err) {
      console.error("Profile update error:", err);
      showToast(err.message || "Failed to update profile", "error");
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.innerHTML = originalHTML;
    }
  };
}

// ---------------------------
// STUDENT HISTORICAL DATA LOAD
// ---------------------------
async function openHistoryModal(studentId) {
  const res = await secureFetch(`${API_BASE}/enrollments/history?studentId=${studentId}`);
  if (!res || !res.history || !res.history.length) {
    showToast("No enrollment history found", "info");
    return;
  }

  const modal = document.createElement("div");
  modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:10000;overflow:auto;";
  
  let rows = "";
  res.history.forEach(h => {
    rows += `
      <tr style="border-bottom:1px solid #e0e0e0;">
        <td style="padding:10px;text-align:center;">${h.academicYear || "-"}</td>
        <td style="padding:10px;text-align:center;">${h.grade || "-"}</td>
        <td style="padding:10px;text-align:center;">${h.term || "-"}</td>
        <td style="padding:10px;text-align:center;">${h.status}</td>
        <td style="padding:10px;text-align:center;">${h.promotedFrom ?? "-"}</td>
        <td style="padding:10px;text-align:center;">${new Date(h.createdAt).toLocaleDateString()}</td>
      </tr>
    `;
  });

  modal.innerHTML = `
    <div style="background:#fff;padding:20px;border-radius:8px;max-width:700px;margin:auto;max-height:80%;overflow:auto;">
      <h3 style="margin-top:0;">Enrollment History</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead style="background:#f5f5f5;border-bottom:2px solid #333;">
          <tr>
            <th style="padding:10px;text-align:center;">Year</th>
            <th style="padding:10px;text-align:center;">Grade</th>
            <th style="padding:10px;text-align:center;">Term</th>
            <th style="padding:10px;text-align:center;">Status</th>
            <th style="padding:10px;text-align:center;">Promoted From</th>
            <th style="padding:10px;text-align:center;">Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:right;">
        <button id="closeHistoryBtn" style="padding:10px 20px;background:#0078d4;color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("closeHistoryBtn").onclick = () => modal.remove();
}

  // ---------------------------
  // UPDATE UNASSIGNED BADGE (🆕)
  // ---------------------------
  async function updateUnassignedBadge() {
    const badge = document.getElementById("unassignedCountBadge");
    if (!badge) return;

    try {
      // Lightweight fetch to get current total count of unassigned teachers
      const res = await secureFetch(`${API_BASE}/users/subjects/allocations?page=1&limit=1&unassigned=true`);
      if (res && res.pagination) {
        const count = res.pagination.total || 0;
        badge.textContent = count;
        badge.style.display = count > 0 ? "inline-block" : "none";
        badge.style.background = count > 0 ? "#fee2e2" : "#e2e8f0";
        badge.style.color = count > 0 ? "#b91c1c" : "#475569";
      }
    } catch (e) {
      console.warn("Could not update unassigned badge:", e);
    }
  }

  // ---------------------------
  // SUBJECT ALLOC SUB-TABS (🆕)
  // ---------------------------
  function setupSubjectAllocSubTabs() {
    const section = document.getElementById("subjectAllocSection");
    if (!section || document.getElementById("subjectAllocSubTabs")) return;

    const subTabs = document.createElement("div");
    subTabs.id = "subjectAllocSubTabs";
    subTabs.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #f1f5f9; padding-bottom: 5px;";
    
    subTabs.innerHTML = `
      <div style="display:flex; gap:20px;">
        <div class="sub-tab active" data-filter="all" style="cursor:pointer; font-weight:700; color:#2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 8px; transition: all 0.2s;">Assigned Teachers</div>
        <div class="sub-tab" data-filter="unassigned" style="cursor:pointer; color:#64748b; padding-bottom: 8px; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
          Unassigned Only
          <span id="unassignedCountBadge" style="background: #e2e8f0; color: #475569; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; font-weight: 700; display: none;">0</span>
        </div>
      </div>
      <div id="subjectAllocLastUpdated" style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 8px;">Last updated: Loading...</div>
    `;

    // Find placement spot: After the header row
    const header = section.querySelector(".admin-section-header-row");
    if (header) {
      header.after(subTabs);
    } else {
      section.prepend(subTabs);
    }

    subTabs.querySelectorAll(".sub-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        subTabs.querySelectorAll(".sub-tab").forEach(t => {
          t.classList.remove("active");
          t.style.color = "#64748b";
          t.style.fontWeight = "normal";
          t.style.borderBottom = "none";
        });
        tab.classList.add("active");
        tab.style.color = "#2b6cb0";
        tab.style.fontWeight = "700";
        tab.style.borderBottom = "2px solid #2b6cb0";

        showUnassignedOnly = tab.dataset.filter === "unassigned";

        // 🆕 Toggle visibility of related controls
        const form = document.getElementById("subjectAllocForm");
        const searchInput = document.getElementById("subjectSearchInput");
        const paginationControls = document.getElementById("subjectAllocPaginationControls");

        if (form) form.style.display = showUnassignedOnly ? "none" : "block";
        if (searchInput) searchInput.style.display = showUnassignedOnly ? "none" : "block";
        if (paginationControls) paginationControls.style.display = showUnassignedOnly ? "none" : "flex"; // Assuming flex for pagination
        subjectAllocPage = 1;
        loadSubjectAllocations(1, SUBJECT_ALLOC_LIMIT, true);
      });
    });

    // Initial badge update
    updateUnassignedBadge();
  }

  // ---------------------------
  // NAVIGATION / TAB SWITCHING
  // ---------------------------
  function setupNavigation() {
    const tabs = document.querySelectorAll(".menu li");
    const sections = document.querySelectorAll(".tab-section");

    if (tabs.length === 0) return;

    // Map section IDs to display names
    const sectionTitles = {
      "subjectAllocSection": "Subject Allocations",
      "classAllocSection": "Class Allocations",
      "searchSection": "Learner Search",
      "promotionSection": "Learner Promotion",
      "signatureUploadSection": "Digital Signature", // New section title
      "termLockManagementSection": "Term Lock Management" // 🆕 New section title
    }; 

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetId = tab.getAttribute("data-section");
        
        // Allow standard behavior for menu items without data-section (links)
        if (!targetId) return;

        // Update active tab styling
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        // Update page title
        if (pageTitle) {
          pageTitle.textContent = sectionTitles[targetId] || targetId;
        }

        // Toggle visibility of sections
        sections.forEach((sec) => {
          const isTarget = sec.id === targetId;
          sec.style.display = isTarget ? "block" : "none";
          if (isTarget) sec.classList.remove("hidden");
          else sec.classList.add("hidden");
        });

        // 🆕 Robust check for both potential naming conventions
        if (targetId === "subjectAllocSection" || targetId === "subjectAllocations") {
          setupSubjectAllocSubTabs();
        } else if (targetId === "signatureUploadSection") {
          renderAdminSignature(); // Render/re-render signature UI when its tab is active
        } else if (targetId === "termLockManagementSection") {
          populateTermLockYearOptions();
          loadTermLockStatus(); // Load status for default year/term
        }
      });
    });

    // Initialize: Activate the first section-based tab on load
    const active = document.querySelector(".menu li.active[data-section]") || document.querySelector(".menu li[data-section]");
    if (active) active.click();
  }

// ---------------------------
// TERM LOCK MANAGEMENT LOGIC (🆕)
// ---------------------------
function populateTermLockYearOptions() {
  if (!termLockYearSelect) return;
  const currentYear = new Date().getFullYear();
  termLockYearSelect.innerHTML = '';
  for (let y = currentYear - 2; y <= currentYear + 100; y++) { // Show a range of years
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    termLockYearSelect.appendChild(opt);
  }
  // Ensure term select is also populated
  populateTermLockTermOptions();
}

function populateTermLockTermOptions() {
  if (!termLockTermSelect) return;
  termLockTermSelect.innerHTML = `
    <option value="1">Term 1</option>
    <option value="2">Term 2</option>
    <option value="3">Term 3</option>
  `;
  // Set default term based on current month
  const month = new Date().getMonth() + 1;
  let defaultTerm = "1";
  if (month >= 5 && month <= 8) defaultTerm = "2";
  else if (month >= 9) defaultTerm = "3";
  termLockTermSelect.value = defaultTerm;
}

async function loadTermLockStatus() {
  if (!termLockYearSelect || !termLockTermSelect || !termLockStatusDisplay || !termLockToggleButton) return;

  const year = termLockYearSelect.value;
  const term = termLockTermSelect.value;

  if (!year || !term) {
    termLockStatusDisplay.textContent = "Select year and term";
    termLockToggleButton.disabled = true;
    return;
  }

  termLockStatusDisplay.textContent = "Loading...";
  termLockToggleButton.disabled = true;

  try {
    const res = await secureFetch(`${API_BASE}/settings/term-lock?year=${year}&term=${term}`);
    if (res) {
      const isLocked = res.isLocked;
      termLockStatusDisplay.textContent = isLocked ? "LOCKED" : "UNLOCKED";
      termLockStatusDisplay.style.color = isLocked ? "red" : "green";
      termLockToggleButton.checked = isLocked;
      termLockToggleButton.disabled = false;
    }
  } catch (err) {
    console.error("Error loading term lock status:", err);
    termLockStatusDisplay.textContent = "Error loading status";
    termLockStatusDisplay.style.color = "orange";
    termLockToggleButton.disabled = true;
  }
}

async function saveTermLockStatus() {
  if (!termLockYearSelect || !termLockTermSelect || !termLockToggleButton || !saveTermLockBtn) return;

  const year = termLockYearSelect.value;
  const term = termLockTermSelect.value;
  const isLocked = termLockToggleButton.checked;

  if (!year || !term) {
    showToast("Please select a year and term.", "error");
    return;
  }

  saveTermLockBtn.disabled = true;
  saveTermLockBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    const res = await secureFetch(`${API_BASE}/settings/term-lock`, {
      method: "PUT",
      body: JSON.stringify({ year: Number(year), term: Number(term), isLocked })
    });

    if (res) {
      showToast(res.message, "success");
      loadTermLockStatus(); // Refresh status display
    }
  } catch (err) {
    console.error("Error saving term lock status:", err);
    showToast("Failed to save term lock status: " + err.message, "error");
  } finally {
    saveTermLockBtn.disabled = false;
    saveTermLockBtn.innerHTML = "Save Lock Status";
  }
}

// Event Listeners for Term Lock Management
termLockYearSelect?.addEventListener("change", loadTermLockStatus);
termLockTermSelect?.addEventListener("change", loadTermLockStatus);
saveTermLockBtn?.addEventListener("click", saveTermLockStatus);

  // IMPORTANT: Ensure your admin.html file has the following list item within the <ul class="menu">
  // for the "Digital Signature" navigation to appear:
  /*
  <li data-section="signatureUploadSection">
    <a href="#">Digital Signature</a>
  </li>
  */


(async function initialLoad() {
  if (isRefreshing) return;
  try { 
    const user = await authService.getUserProfile(["admin"]);
    if (!user) return;
    authService.initLogout();

    await Promise.all([
      loadTeacherOptions(),
      loadSubjectAllocations(),
      loadClassAllocations(),
      loadSchoolInfo()
    ]); 
    setupNavigation();
  } catch (err) { 
    console.error("Initial load error:", err); 
  }
})();


// ---------------------------
// FORM SUBMISSIONS
// ---------------------------
//subject allocation form handler
  if (subjectAllocForm) {
    subjectAllocForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = subjectAllocForm.querySelector("button[type='submit']");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.appendChild(createSpinner(12)); }

     const teacherId = teacherSelect?.value || "";
const gradeRange = gradeRangeSelect?.value || "";
const grades = gradesSelect ? Array.from(gradesSelect.selectedOptions).map(opt => opt.value) : [];
const grade = grades.length > 0 ? grades[0] : ""; // ✅ fix here
const stream = streamInput?.value?.trim() || null; // 🆕 Get stream from input
const subjects = subjectsSelect ? Array.from(subjectsSelect.selectedOptions).map(opt => opt.value) : [];

      const res = await secureFetch(`${API_BASE}/users/subjects/assign`, {
        method: 'POST',
        body: JSON.stringify({ teacherId, gradeRange, grade, stream, subjects })
      });

      if (res) { await loadSubjectAllocations(1, SUBJECT_ALLOC_LIMIT, true); showToast("Subject allocation saved successfully!", "success"); }

      if (submitBtn) { submitBtn.disabled = false; Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove()); }
    });
  }
//class allocation form handler
  if (classAllocForm) {
  classAllocForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = classAllocForm.querySelector("button[type='submit']");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.appendChild(createSpinner(12)); }

    const teacherId = classTeacherSelect?.value || "";
    const assignedClass = classGradeSelect?.value || "";
    const assignedStream = classStreamInput?.value?.trim() || null; // 🆕 Get stream from input

    const res = await secureFetch(`${API_BASE}/users/classes/assign-teacher`, {
      method: 'POST',
      body: JSON.stringify({ teacherId, assignedClass, assignedStream })
    });

    if (res) {
      await loadClassAllocations(); // should GET /users/classes/allocations and pass to renderClassAllocations
      showToast("Class allocation saved successfully!", "success");
    }

    if (submitBtn) { submitBtn.disabled = false; Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove()); }
  });
}

  // ---------------------------
  // REMOVE BUTTON HANDLERS
  // ---------------------------

  subjectAllocTableBody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (btn && btn.classList.contains("btn-edit-profile")) {
    const userToEdit = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      email: btn.dataset.email,
      contact: btn.dataset.contact
    };
    openEditProfileModal(userToEdit);
    return;
  }

  if (btn && btn.dataset.action === "remove-subjects") {
    const teacherId = btn.dataset.id;
    const grade = btn.dataset.grade; // 👈 capture grade from dataset
    let stream = btn.dataset.stream; // 🆕 capture stream from dataset
    
    // Convert empty string or whitespace to null for proper backend matching
    stream = (stream && stream.trim() && stream.trim() !== '') ? stream.trim() : null;
    
    console.log(`[DEBUG] Remove Subject - teacherId: ${teacherId}, grade: ${grade}, stream: ${stream}`);
    
    const gradeLabel = stream ? `Grade ${grade}${stream}` : `Grade ${grade}`;
    const ok = await showConfirm({ message: `Remove allocation for ${gradeLabel}?` });
    if (!ok) return;

    try {
      console.log(`[DEBUG] Sending remove request with:`, { teacherId, grade, stream });
      
      const result = await secureFetch(`${API_BASE}/users/subjects/remove`, {
        method: "POST",
        body: JSON.stringify({ teacherId, grade, stream })
      });
      
      console.log(`[DEBUG] Remove result:`, result);
      
      if (result) {
        // Wait a moment for backend to process
        await new Promise(r => setTimeout(r, 800));
        
        // Reload all allocations to refresh the table
        await loadSubjectAllocations(1, SUBJECT_ALLOC_LIMIT, true);
        showToast(`Subject allocation for ${gradeLabel} removed successfully`, "success");
      } else {
        showToast("Failed to remove allocation - please check browser console", "error");
      }
    } catch (err) {
      console.error("[ERROR] Remove allocation error:", err);
      showToast("Error removing allocation: " + (err.message || "Unknown error"), "error");
    }
  }
});
//remove class allocation handler
  classAllocTableBody?.addEventListener("click", async (e) => {
    if (e.target.dataset.action === "remove-class") {
      const teacherId = e.target.dataset.id;
      const ok = await showConfirm({ message: "Remove this class allocation?" });
      if (!ok) return;
      
      try {
        const result = await secureFetch(`${API_BASE}/users/classes/remove`, { 
          method: "POST",
          body: JSON.stringify({ teacherId })
        });
        
        if (result) {
          await loadClassAllocations();
          showToast("Class allocation removed", "success");
        }
      } catch (err) {
        console.error("Remove class allocation error:", err);
        showToast("Error removing class allocation", "error");
      }
    }
  });
// ---------------------------
// EDIT ENROLLMENT BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;
  if (!btn.classList.contains("btn-edit")) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${createSpinner(14).outerHTML} Loading...`;

  try {
    const tr = btn.closest("tr");
    const enrollmentId = tr.dataset.enrollmentId;

    if (!enrollmentId) {
      showToast("No enrollment found for this student", "error");
      return;
    }

    const res = await secureFetch(`${API_BASE}/enrollments/${enrollmentId}`);
    if (!res) return;

    openEditModal(res); // render edit form with fetched data
  } catch (err) {
    console.error("Edit fetch error:", err);
    showToast(err.message || "Failed to fetch student data", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});

// ---------------------------
// VIEW HISTORY BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;
  if (!btn.classList.contains("btn-history")) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${createSpinner(14).outerHTML} Loading...`;

  try {
    const tr = btn.closest("tr");
    const studentId = tr?.dataset.studentId;

    if (!studentId) {
      showToast("Student ID missing", "error");
      return;
    }

    await openHistoryModal(studentId);
  } catch (err) {
    console.error("History fetch error:", err);
    showToast(err.message || "Failed to load history", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});

  // ---------------------------
  // DEAN TOGGLE HANDLER
  // ---------------------------
  subjectAllocTableBody?.addEventListener("change", async (e) => {
    if (e.target.classList.contains("dean-toggle")) {
      const teacherId = e.target.dataset.id;
      const isDean = e.target.checked;
      
      try {
        const result = await secureFetch(`${API_BASE}/users/toggle-dean`, {
          method: "POST",
          body: JSON.stringify({ teacherId, isDean })
        });
        
        if (!result) {
          e.target.checked = !isDean; // Revert UI if update failed
          return;
        }
        
        showToast(result.message, "success");
        // Force a reload of allocations to ensure cache is cleared and state is persisted
        loadSubjectAllocations();
      } catch (err) {
        console.error("Toggle dean error:", err);
        e.target.checked = !isDean; // Revert UI on failure
        showToast("Error toggling Dean status", "error");
      }
    }
  });

// ---------------------------
// EDIT PROFILE BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;
  if (!btn.classList.contains("btn-edit-profile")) return;

  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${createSpinner(14).outerHTML} Loading...`;

  try {
    const tr = btn.closest("tr");
    const studentId = tr?.dataset.studentId;
    const studentName = btn.dataset.studentName;
    const studentAdmission = btn.dataset.studentAdmission;
    const studentContact = btn.dataset.studentContact;

    if (!studentId) {
      showToast("Student ID missing", "error");
      return;
    }

    openEditProfileModal({ id: studentId, name: studentName, admission: studentAdmission, contact: studentContact });
  } catch (err) {
    console.error("Edit profile error:", err);
    showToast(err.message || "Failed to open profile editor", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});


  // ---------------------------
  // SMART REFRESH BUTTON
  // ---------------------------
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      refreshBtn.disabled = true;
      const originalText = refreshBtn.textContent;
      refreshBtn.textContent = "Refreshing... ⏳";
      refreshBtn.classList.add("refreshing");

      const errors = [];
      try {
        const results = await Promise.allSettled([
          loadTeacherOptions(true), // Force reload teachers
          loadSubjectAllocations(), 
          loadClassAllocations(),
          loadSchoolInfo(true) // Force reload school info
        ]);
        results.forEach((r, idx) => {
          if (r.status === "rejected") errors.push({ step: ["loadTeacherOptions", "loadSubjectAllocations", "loadClassAllocations", "loadSchoolInfo"][idx], error: r.reason });
        });

        refreshBtn.textContent = "✅ Refreshed!";
        setTimeout(() => { refreshBtn.textContent = originalText; }, 800);
        if (errors.length === 0) showToast("Refreshed successfully", "success");
      } catch (err) {
        console.error("Unexpected refresh error:", err);
        showToast("Unexpected error during refresh.", "error");
      } finally {
        if (errors.length > 0) { console.error("Refresh errors:", errors); showToast("Some parts failed to refresh. Check console for details.", "error"); }
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("refreshing");
        isRefreshing = false;
      }
    });
  }

  // ---------------------------
  // FILTERS
  // ---------------------------
  if (subjectSearchInput) subjectSearchInput.addEventListener("input", function () { const q = this.value.toLowerCase(); document.querySelectorAll("#subjectAllocTable tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"); });
  if (classSearchInput) classSearchInput.addEventListener("input", function () { const q = this.value.toLowerCase(); document.querySelectorAll("#classAllocTable tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"); });

  function updateSubjectAllocPaginationControls() {
    if (subjectAllocPageInfo) {
      subjectAllocPageInfo.textContent = `Page ${subjectAllocPage} of ${subjectAllocTotalPages}`;
    }
    if (subjectAllocPrevBtn) {
      subjectAllocPrevBtn.disabled = subjectAllocPage <= 1 || subjectAllocTableBody.dataset.loading === "true";
    }
    if (subjectAllocNextBtn) {
      subjectAllocNextBtn.disabled = subjectAllocPage >= subjectAllocTotalPages || subjectAllocTableBody.dataset.loading === "true";
    }
  }

  if (subjectAllocPrevBtn) {
    subjectAllocPrevBtn.addEventListener("click", () => {
      if (subjectAllocPage > 1) loadSubjectAllocations(subjectAllocPage - 1);
    });
  }

  if (subjectAllocNextBtn) {
    subjectAllocNextBtn.addEventListener("click", () => {
      if (subjectAllocPage < subjectAllocTotalPages) loadSubjectAllocations(subjectAllocPage + 1);
    });
  }

  // ---------------------------
  // DYNAMIC GRADE & SUBJECT MULTI-SELECT
  // ---------------------------
  if (gradeRangeSelect) {
    gradeRangeSelect.addEventListener("change", () => {
      const selectedRange = gradeRangeSelect.value;
      if (gradesSelect) { 
        gradesSelect.innerHTML = ""; 
        gradesSelect.multiple = true; 
        if (selectedRange) { 
          const [start, end] = selectedRange.split("-").map(Number); 
          for (let i=start;i<=end;i++){ 
            const opt=document.createElement("option"); 
            opt.value=i; 
            opt.textContent=`Grade ${i}`; 
            gradesSelect.appendChild(opt); 
          }
        }
      }
      
      if (subjectsSelect) { 
        subjectsSelect.innerHTML=""; 
        subjectsSelect.multiple=true;
        
        // For senior school (10-12), show pathways with courses grouped
        if (selectedRange === "10-12") {
          Object.entries(seniorSchoolPathways).forEach(([pathway, courses]) => {
            const optgroup = document.createElement("optgroup");
            optgroup.label = pathway;
            courses.forEach(course => {
              const opt = document.createElement("option");
              opt.value = course;
              opt.textContent = course;
              optgroup.appendChild(opt);
            });
            subjectsSelect.appendChild(optgroup);
          });
        } else if(selectedRange && gradeSubjects[selectedRange]) {
          gradeSubjects[selectedRange].forEach(sub=>{ 
            const opt=document.createElement("option"); 
            opt.value=sub; 
            opt.textContent=sub; 
            subjectsSelect.appendChild(opt); 
          }); 
        }
      }
    });
  }

// ---------------------------
// EXPORT TO PDF - SIMPLIFIED APPROACH
// ---------------------------

function exportTableToPDF(tableId, title) {
  try {
    console.log(`[PDF Export] Starting export for table: ${tableId}`);
    
    // The UMD build exposes jsPDF at window.jsPDF
    const jsPDFClass = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
    
    if (!jsPDFClass) {
      console.error("[PDF Export] jsPDF not available. Window state:", { hasJsPDF: !!window.jsPDF, hasJspdf: !!window.jspdf });
      showToast("PDF library not loaded. Please refresh the page.", "error");
      return;
    }

    console.log(`[PDF Export] jsPDF available`);

    // Get table element
    const table = document.getElementById(tableId);
    if (!table) {
      console.error(`[PDF Export] Table ${tableId} not found`);
      showToast("Table not found", "error");
      return;
    }

    console.log(`[PDF Export] Found table: ${tableId}`);

    // Create PDF document
    const doc = new jsPDFClass({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    console.log(`[PDF Export] PDF document created`);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const marginY = 15;
    let yPosition = marginY;

    // Add school header
    const school = window.schoolInfo || {};
    const centerX = pageWidth / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(school.name || "CBC School", centerX, yPosition, { align: "center" });
    yPosition += 5;

    if (school.address) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(school.address, centerX, yPosition, { align: "center" });
      yPosition += 5;
    }

    // Add title
    if (title && title.trim()) {
      yPosition += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, centerX, yPosition, { align: "center" });
      yPosition += 5;
    }

    // Collect table data
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) {
      console.error("[PDF Export] Table header not found");
      showToast("Table header not found", "error");
      return;
    }

    const allHeaders = [];
    const headerCells = headerRow.querySelectorAll("th");
    
    headerCells.forEach((th, idx) => {
      const text = th.textContent.trim();
      if (text.toLowerCase() !== "action") {
        allHeaders.push({ text, idx });
      }
    });

    console.log(`[PDF Export] Headers collected: ${allHeaders.length}`);

    if (allHeaders.length === 0) {
      showToast("No headers found to export", "error");
      return;
    }

    const headers = allHeaders.map(h => h.text);
    const headerIndices = allHeaders.map(h => h.idx);

    // Collect visible rows
    const tableRows = [];
    const tbodyRows = table.querySelectorAll("tbody tr");
    
    tbodyRows.forEach(tr => {
      // Skip hidden rows
      if (tr.style.display === "none") return;

      const cells = tr.querySelectorAll("td");
      const rowData = [];

      headerIndices.forEach(idx => {
        if (cells[idx]) {
          rowData.push(cells[idx].textContent.trim());
        }
      });

      if (rowData.length > 0) {
        tableRows.push(rowData);
      }
    });

    console.log(`[PDF Export] Rows collected: ${tableRows.length}`);

    if (tableRows.length === 0) {
      showToast("No data rows to export", "error");
      return;
    }

    // Check if autoTable is available on the doc instance
    const hasAutoTable = typeof doc.autoTable === "function";
    console.log(`[PDF Export] autoTable available: ${hasAutoTable}`);

    if (hasAutoTable) {
      console.log(`[PDF Export] Using autoTable plugin`);
      
      doc.autoTable({
        head: [headers],
        body: tableRows,
        startY: yPosition,
        margin: { left: marginX, right: marginX },
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 3
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center"
        },
        alternateRowStyles: {
          fillColor: [240, 240, 240]
        },
        didDrawPage: (data) => {
          // Footer
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(
            `Printed on: ${new Date().toLocaleString()}`,
            marginX,
            pageHeight - 8
          );
          
          // Page numbers - use data.pageNumber directly
          if (data.pageCount && data.pageCount > 1) {
            doc.text(
              `Page ${data.pageNumber} of ${data.pageCount}`,
              pageWidth - marginX - 20,
              pageHeight - 8,
              { align: "right" }
            );
          }
        }
      });
    } else {
      console.warn(`[PDF Export] autoTable not available, using fallback table`);
      
      // Fallback: Create simple table without autoTable
      const colWidth = (pageWidth - 2 * marginX) / headers.length;
      let yPos = yPosition;
      
      // Draw headers
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setFillColor(41, 128, 185);
      doc.setTextColor(255, 255, 255);
      
      headers.forEach((header, idx) => {
        doc.rect(marginX + idx * colWidth, yPos, colWidth, 8, "F");
        doc.text(header, marginX + idx * colWidth + 1, yPos + 5);
      });
      
      yPos += 8;
      
      // Draw rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      
      tableRows.forEach((row, rowIdx) => {
        if (yPos > pageHeight - 15) {
          doc.addPage();
          yPos = marginY;
        }
        
        row.forEach((cell, colIdx) => {
          if (rowIdx % 2 === 1) {
            doc.setFillColor(240, 240, 240);
            doc.rect(marginX + colIdx * colWidth, yPos, colWidth, 6, "F");
          }
          doc.text(cell, marginX + colIdx * colWidth + 1, yPos + 4);
        });
        
        yPos += 6;
      });
    }

    // Save the PDF
    const filename = `${(title || "export").replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
    
    console.log(`[PDF Export] PDF saved: ${filename}`);
    showToast(`PDF exported successfully: ${filename}`, "success");
    
  } catch (err) {
    console.error(`[PDF Export] Error:`, err);
    showToast("Error generating PDF: " + (err.message || "Unknown error"), "error");
  }
}

// ---------------------------
// BUTTON HANDLERS - PDF EXPORTS
// ---------------------------
if (exportSubjectsBtn) {
  exportSubjectsBtn.addEventListener("click", () => {
    try {
      console.log(`[Export] Subjects button clicked`);
      exportTableToPDF("subjectAllocTable", "Subject Allocations");
    } catch (err) {
      console.error("PDF export error:", err);
      showToast("Failed to export PDF: " + err.message, "error");
    }
  });
}

if (exportClassBtn) {
  exportClassBtn.addEventListener("click", () => {
    try {
      console.log(`[Export] Class button clicked`);
      exportTableToPDF("classAllocTable", "Class Teacher Allocations");
    } catch (err) {
      console.error("PDF export error:", err);
      showToast("Failed to export PDF: " + err.message, "error");
    }
  });
}

  // ---------------------------
// PROMOTION TABLE FILTER
// ---------------------------

studentSearchBtn.addEventListener("click", async () => {
  const q = studentSearchInput.value.trim();
  if (!q) {
    showToast("Enter name or admission", "info");
    return;
  }

  const originalHTML = studentSearchBtn.innerHTML;
  studentSearchBtn.disabled = true;
  studentSearchBtn.innerHTML = '<span class="spinner"></span>Searching...';

  try {
    const res = await secureFetch(
      `${API_BASE}/enrollments/admin-search?q=${encodeURIComponent(q)}`
    );

    studentSearchBody.innerHTML = "";

    if (!res || !res.results.length) {
      studentSearchBody.innerHTML =
        `<tr><td colspan="7" style="text-align:center">No student found</td></tr>`;
      return;
    }

    res.results.forEach(s => {
      const tr = document.createElement("tr");

      tr.dataset.studentId = s.studentId; 
      tr.dataset.enrollmentId = s.enrollmentId; 

      // Format grade with stream
      const gradeLabel = s.grade && s.stream ? `${s.grade}${s.stream}` : (s.grade || "-");

      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.admission}</td>
        <td>${s.contact || "-"}</td>
        <td>${s.academicYear || "-"}</td>
        <td>${gradeLabel}</td>
        <td>${s.status}</td>
        <td>
          <button class="btn-history" data-student-id="${s.studentId}" data-student-name="${s.name}">📋 History</button>
          <button class="btn-edit" data-enrollment-id="${s.enrollmentId}" data-student-id="${s.studentId}">✏️ Edit Enrollment</button>
          <button class="btn-edit-profile" data-student-id="${s.studentId}" data-student-name="${s.name}" data-student-admission="${s.admission}" data-student-grade="${s.grade}" data-student-contact="${s.contact || ''}">👤 Edit Profile</button>
        </td>
      `;

      studentSearchBody.appendChild(tr);
    });
  } finally {
    studentSearchBtn.disabled = false;
    studentSearchBtn.innerHTML = originalHTML;
  }
});

})();
