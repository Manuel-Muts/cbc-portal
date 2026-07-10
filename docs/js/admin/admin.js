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

  // Inject CSS for compactness of subject allocations table
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    #subjectAllocTable th, #subjectAllocTable td, #classAllocTable th, #classAllocTable td, #promotionPreviewTable th, #promotionPreviewTable td {
      padding: 6px 8px !important; /* Reduced padding */
      font-size: 0.85rem !important; /* Slightly smaller font */
    }
    #subjectAllocTable th, #classAllocTable th, #promotionPreviewTable th {
      font-size: 0.75rem !important; /* Even smaller for headers */
    }
    #subjectAllocTable .btn, #subjectAllocTable .btn-edit-profile, #subjectAllocTable .danger, #classAllocTable .btn, #classAllocTable .danger, #promotionPreviewTable .btn, #promotionPreviewTable select {
      padding: 2px 6px !important; /* Smaller buttons */
      font-size: 0.7rem !important;
    }
    #subjectAllocTable .dean-toggle {
      transform: scale(0.8); /* Smaller toggle */
    }
    /* 🆕 Fix for bulkDeleteModal CSS conflict */
    #bulkDeleteModal .modal-content {
      max-height: 85vh !important; /* Ensure modal content doesn't exceed viewport height */
      overflow-y: auto !important; /* Enable scrolling for tall content */
      display: flex !important; /* Use flexbox for internal layout */
      flex-direction: column !important; /* Stack children vertically */
    }
    #bulkDeleteModal .modal-content .confirm-buttons {
      margin-top: auto !important; /* Push buttons to the bottom */
      padding-top: 15px !important; /* Add some padding above buttons */
      border-top: 1px solid #eee !important; /* Separator line */
      background: white !important; /* Ensure buttons background is white */
      z-index: 1 !important; /* Ensure buttons are above scrolling content */
      position: sticky !important; /* Keep buttons visible at the bottom */
    }
  `;
  document.head.appendChild(compactStyle);

  let schoolInfo = null;

  const clearSchoolInfoCache = () => {
    // Removed admin school-info cache handling — always use fresh data
    // Intentionally left as a no-op to avoid accidental stale cache usage
  };

  const applySidebarBrandName = (name) => {
    const displayName = String(name || "").trim();
    if (!displayName) return;

    if (sidebarBrandLogo) {
      sidebarBrandLogo.innerHTML = "";
      const schoolNameEl = document.createElement("div");
      schoolNameEl.className = "school-name";
      schoolNameEl.textContent = displayName;
      schoolNameEl.style.cssText = "font-size: 1.25rem; font-weight: 800; color: #fff; text-align: center; line-height: 1.2; text-transform: uppercase;";
      sidebarBrandLogo.appendChild(schoolNameEl);
      return;
    }

    const brandContainer = document.querySelector('.sidebar-brand');
    if (brandContainer) {
      brandContainer.innerHTML = "";
      const fallbackBrand = document.createElement("div");
      fallbackBrand.className = "school-name";
      fallbackBrand.textContent = displayName;
      fallbackBrand.style.cssText = "font-size: 1.25rem; font-weight: 800; color: #fff; text-align: center; line-height: 1.2; text-transform: uppercase;";
      brandContainer.appendChild(fallbackBrand);
    }
  };

  const showAdminInitOverlay = () => {
    if (document.getElementById('adminInitOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'adminInitOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(255, 255, 255, 0.95);
      z-index: 20000; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(6px); transition: opacity 0.3s ease;
    `;
    overlay.innerHTML = `
      <div style="text-align: center; padding: 40px 30px; background: #fff; border-radius: 20px; box-shadow: 0 24px 55px rgba(15, 23, 42, 0.12); border: 1px solid rgba(148, 163, 184, 0.2); max-width: 420px; width: 90%;">
        <div class="spinner" style="width: 50px; height: 50px; border-width: 5px; border-top-color: #2b6cb0; border-right-color: #2b6cb0; display: inline-block; margin-bottom: 18px;"></div>
        <h2 style="margin: 0 0 10px; color: #1e293b; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em;">Admin Dashboard</h2>
        <p style="margin: 0; color: #64748b; font-size: 0.95rem; line-height: 1.75;">Loading school data and preparing the portal. Please wait...</p>
      </div>
    `;
    document.body.appendChild(overlay);
  };

  const removeAdminInitOverlay = () => {
    const overlay = document.getElementById('adminInitOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    }
  };

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

  const classAllocPrevBtn = document.getElementById("classAllocPrevBtn");
  const classAllocNextBtn = document.getElementById("classAllocNextBtn");
  const classAllocPageInfo = document.getElementById("classAllocPageInfo");

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
  const archiveMarksBtn = document.getElementById("archiveMarksBtn");
  const confirmPromotionBtn = document.getElementById("confirmPromotionBtn");
  const promotionPreviewBody = document.querySelector("#promotionPreviewTable tbody");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
  const promotionSearchInput = document.getElementById("promotionSearchInput"); // 🆕 New search input for promotion
  const promotionGradeSelect = document.getElementById("promotionGradeSelect"); // 🆕 New grade filter for promotion
  const studentSearchBody = document.getElementById("studentSearchBody");

  // 🆕 Bulk Delete Students DOM elements
  const openBulkDeleteModalBtn = document.getElementById("openBulkDeleteModalBtn");
  const bulkDeleteModal = document.getElementById("bulkDeleteModal");
  const confirmBulkDeleteBtn = document.getElementById("confirmBulkDeleteBtn");
  const cancelBulkDeleteBtn = document.getElementById("cancelBulkDeleteBtn");
  const bulkDeleteGradeSelect = document.getElementById("bulkDeleteGradeSelect");
  const bulkDeleteStreamSelect = document.getElementById("bulkDeleteStreamSelect");
  const bulkDeleteYearSelect = document.getElementById("bulkDeleteYearSelect");


  let promoData = []; // 🆕 Cache for the current fetched batch
  const promoOverrides = new Map(); // 🆕 Persist manual changes (Promote -> Repeat)
  let lastPromoContext = ""; // 🆕 Track year/grade context to know when to clear cache

  let promoPage = 1;
  // 🚀 Balanced Optimization: Increased to 100 to reduce manual clicks while remaining safe for the server.
  const promoLimit = 100;
  let promoTotalPages = 1;
  let promoLoading = false;

  // New DOM elements for promotion progress bar
  let promotionProgressBarContainer;
  let promotionProgressBar;
  let promotionProgressText;
  let promotionProgressPercent;
  let subjectAllocPage = 1;
  const SUBJECT_ALLOC_LIMIT = 10;
  let subjectAllocTotalPages = 1;
  let classAllocPage = 1;
  const CLASS_ALLOC_LIMIT = 10;
  let classAllocTotalPages = 1;
  let teacherListPage = 1;
  let teacherSearchTerm = ''; // 🆕 Global search term for teacher dropdowns
  let teacherListTotalPages = 1;
  let showUnassignedOnly = false; // 🆕 Track sub-tab filter
  let isRefreshing = false;
  let streamsCache = new Map(); // 🆕 Cache for grade streams
  let currentSchoolInfo = null; // 🆕 Store school info for grade options
// ---------------------------
  // Term Lock Management DOM elements
  const termLockYearSelect = document.getElementById("termLockYearSelect");
  const termLockTermSelect = document.getElementById("termLockTermSelect");
  const termLockStatusDisplay = document.getElementById("termLockStatusDisplay");
  const termLockToggleButton = document.getElementById("termLockToggleButton");
  const submittedMarksEditStatusDisplay = document.getElementById("submittedMarksEditStatusDisplay");
  const submittedMarksEditToggleButton = document.getElementById("submittedMarksEditToggleButton");
  const saveTermLockBtn = document.getElementById("saveTermLockBtn");
    let termLockPollIntervalId = null;
// FETCH SCHOOL INFO
// ---------------------------
// Derive BACKEND_URL from config (removes /api suffix)
const BACKEND_URL = config.api.baseURL.replace('/api', '');

function getDisplaySchoolName(info) {
  const name = info?.name || info?.schoolName || info?.school?.name || info?.school?.schoolName || "";
  return name ? String(name).trim() : "";
}

async function loadSchoolInfo() {
  const fields = "name,allowSignatureUpload,schoolType,headteacherSignatureUrl,status,smsCredits";

  const getFallbackProfileName = async () => {
    try {
      const token = authService.getToken();
      if (!token) return null;

      const profile = await authService.getUserProfile(["admin"]);
      if (!profile) return null;

      const currentSchoolId = localStorage.getItem("schoolId") || profile.schoolId || profile.school?.id || "";
      const profileSchoolName = profile.schoolName || profile.school?.name || profile.school?.schoolName || "";

      if (profileSchoolName && (!currentSchoolId || String(currentSchoolId) === String(profile.schoolId || profile.school?.id || ""))) {
        return profileSchoolName;
      }

      return null;
    } catch (e) {
      return null;
    }
  };

  try {
    const token = authService.getToken();
    if (!token) return;

    const res = await fetch(`${API_BASE}/my-school?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch school info (Status: ${res.status})`);
    }

    const data = await res.json();
    const parsedData = {
      name: String(data?.name || "").trim(),
      allowSignatureUpload: data?.allowSignatureUpload,
      schoolType: data?.schoolType || data?.type || data?.school_type || data?.schooltype || data?.['school-type'] || null,
      headteacherSignatureUrl: data?.headteacherSignatureUrl || null,
      status: data?.status,
      smsCredits: data?.smsCredits
    };

    if (!parsedData.name) {
      const fallbackName = await getFallbackProfileName();
      if (fallbackName) parsedData.name = fallbackName;
    }

    schoolInfo = parsedData;
    currentSchoolInfo = parsedData;
    window.schoolInfo = parsedData;

    try {
      const resolvedKey = resolveSchoolTypeKey(parsedData);
      window.schoolTypeKey = resolvedKey;
      window.schoolConfig = resolvedKey ? SCHOOL_TYPES[resolvedKey] : null;
    } catch (e) {
      console.warn('Failed to resolve schoolTypeKey', e);
      window.schoolTypeKey = null;
      window.schoolConfig = null;
    }

    renderSchoolInfo();
  } catch (err) {
    console.error("School info error:", err);
    const fallbackName = await getFallbackProfileName();
    schoolInfo = { ...(schoolInfo || {}), name: fallbackName || "School Name" };
    currentSchoolInfo = schoolInfo;
    window.schoolInfo = schoolInfo;
    window.schoolTypeKey = null;
    window.schoolConfig = null;
    renderSchoolInfo();
  }
}

function renderSchoolInfo() {
  if (!schoolInfo) return;

  // Debug: show resolved schoolType and config to help diagnose dropdown population
  try { console.debug("renderSchoolInfo: schoolInfo.schoolType=", schoolInfo.schoolType, "getSchoolConfig=", getSchoolConfig()); } catch (e) {}

  const displayName = getDisplaySchoolName(schoolInfo) || "School Name";
  if (displayName && displayName !== "School Name") {
    applySidebarBrandName(displayName);
  }

  // Replace "Admin Portal" branding with School Name at the top of the sidebar
  if (sidebarBrandLogo) {
    sidebarBrandLogo.innerHTML = "";
    const schoolNameEl = document.createElement("div");
    schoolNameEl.className = "school-name";
    schoolNameEl.textContent = displayName;
    schoolNameEl.style.cssText = "font-size: 1.25rem; font-weight: 800; color: #fff; text-align: center; line-height: 1.2; text-transform: uppercase;";
    sidebarBrandLogo.appendChild(schoolNameEl);
  } else {
    const brandContainer = document.querySelector('.sidebar-brand');
    if (brandContainer) {
      brandContainer.innerHTML = "";
      const fallbackBrand = document.createElement("div");
      fallbackBrand.className = "school-name";
      fallbackBrand.textContent = displayName;
      fallbackBrand.style.cssText = "font-size: 1.25rem; font-weight: 800; color: #fff; text-align: center; line-height: 1.2; text-transform: uppercase;";
      brandContainer.appendChild(fallbackBrand);
    }
  }

  // Ensure address is not shown in sidebar (Name and Logo alone)
  if (schoolInfoDisplay) {
    schoolInfoDisplay.innerHTML = '';
  }

  renderAdminSignature();
  applySchoolTypeToGradeSelectors();
  applyElectivesSidebarVisibility();

  // 🆕 Initialize promotion search input
  if (promotionSearchInput) {
    promotionSearchInput.placeholder = "Search by name or admission...";
  }

  // 🆕 Update SMS Balance display in announcement section
  const smsBalanceBadge = document.getElementById("smsBalanceBadge");
  const currentSmsCredits = document.getElementById("currentSmsCredits");
  if (smsBalanceBadge && currentSmsCredits) {
    currentSmsCredits.textContent = schoolInfo.smsCredits || 0;
    smsBalanceBadge.style.display = "block";
    
    // 🆕 Add Buy Button if not already there
    if (!document.getElementById("buySmsBtn")) {
      const buyBtn = document.createElement("button");
      buyBtn.id = "buySmsBtn";
      buyBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Buy Credits';
      buyBtn.style.cssText = "margin-left: 10px; background: #2b6cb0; color: white; border: none; padding: 4px 10px; border-radius: 15px; cursor: pointer; font-size: 0.7rem; font-weight: 700;";
      buyBtn.onclick = handleSmsTopup;
      smsBalanceBadge.appendChild(buyBtn);
    }
  }
}

/**
 * 🆕 Handle SMS Top-up via IntaSend
 */
async function handleSmsTopup() {
  const modal = document.createElement("div");
  modal.className = "confirm-overlay";
  modal.style.zIndex = "11001"; 

  modal.innerHTML = `
    <div class="confirm-box" style="max-width: 400px; text-align: left;">
      <h4 style="margin-bottom: 10px; text-align: center;"><i class="fas fa-sms" style="color: #2b6cb0;"></i> Buy SMS Credits</h4>
      <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 20px; text-align: center;">Top up your school's SMS balance via IntaSend (M-Pesa).</p>
      
      <div style="margin-bottom: 15px;">
        <label style="display: block; font-size: 0.7rem; font-weight: 800; color: #475569; margin-bottom: 5px; text-transform: uppercase;">Amount (KES)</label>
        <input type="number" id="topupAmount" value="500" min="10" step="10" style="width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; font-weight: 600;">
      </div>

      <div style="margin-bottom: 10px; padding: 12px; background: #f0f9ff; border-radius: 10px; border: 1px dashed #bae6fd; text-align: center;">
        <p style="margin: 0; font-size: 0.7rem; color: #0369a1; font-weight: 800; text-transform: uppercase; letter-spacing: 0.025em;">SMS Credits to be Added</p>
        <h2 id="creditPreview" style="margin: 4px 0 0; color: #0284c7; font-weight: 900; font-size: 1.75rem;">500</h2>
      </div>

      <p style="font-size: 0.65rem; color: #94a3b8; text-align: center; margin-bottom: 20px;"><i class="fas fa-info-circle"></i> A small transaction fee will be added to the total at checkout.</p>

      <div class="confirm-buttons">
        <button id="cancelTopupBtn" class="btn secondary-btn" style="flex: 1; padding: 10px; font-weight: 700;">Cancel</button>
        <button id="confirmTopupBtn" class="btn primary-btn" style="flex: 1; padding: 10px; font-weight: 700; background: #2b6cb0; color: white; border: none;">Pay Now</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("visible"));

  const cancelBtn = modal.querySelector("#cancelTopupBtn");
  const confirmBtn = modal.querySelector("#confirmTopupBtn");
  const amountInput = modal.querySelector("#topupAmount");
  const creditPreview = modal.querySelector("#creditPreview");

  cancelBtn.onclick = () => {
    modal.classList.remove("visible");
    setTimeout(() => modal.remove(), 300);
  };

  // 🆕 Live Credit Calculation Listener
  amountInput.addEventListener("input", () => {
    const amount = Number(amountInput.value) || 0;
    const credits = Math.floor(amount / 1.0); // Matches your backend 1:1 economy
    creditPreview.textContent = credits.toLocaleString();
  });

  confirmBtn.onclick = async () => {
    const amount = Number(amountInput.value);

    if (!amount || amount < 10) {
      showToast("Minimum top-up is KES 10", "error");
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
      const res = await secureFetch(`${API_BASE}/sms-topup`, {
        method: 'POST',
        body: JSON.stringify({ amount })
      });

      if (res && res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      showToast("Failed to initiate top-up", "error");
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = "Pay Now";
    }
  };
}

async function fetchSmsHistorySummary(forceReload = false) {
  const statsGrid = document.getElementById("smsStatsGrid");
  const logWrap = document.getElementById("smsFailureLogWrap");
  if (!statsGrid || !logWrap) return;

  const CACHE_KEY = "admin_sms_summary_cache";
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  if (!forceReload) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          renderSmsSummary(data, statsGrid, logWrap);
          return;
        }
      } catch (e) { console.warn("SMS Summary cache read error:", e); }
    }
  }

  try {
    const data = await secureFetch(`${API_BASE}/announcements/sms-summary`);
    if (!data) return;

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    renderSmsSummary(data, statsGrid, logWrap);
  } catch (e) {
    console.error("Failed to fetch SMS history:", e);
  }
}

function renderSmsSummary(data, statsGrid, logWrap) {
    // Render Stats
    statsGrid.innerHTML = `
      <div style="background: #f0fdf4; border: 1px solid #bcf0da; padding: 12px; border-radius: 10px; text-align: center; flex: 1;">
        <div style="font-size: 1.2rem; font-weight: 800; color: #166534;">${data.summary.sent}</div>
        <div style="font-size: 0.65rem; color: #15803d; font-weight: 700; text-transform: uppercase;">Successful</div>
      </div>
      <div style="background: #fff1f2; border: 1px solid #fecaca; padding: 12px; border-radius: 10px; text-align: center; flex: 1;">
        <div style="font-size: 1.2rem; font-weight: 800; color: #991b1b;">${data.summary.failed}</div>
        <div style="font-size: 0.65rem; color: #991b1b; font-weight: 700; text-transform: uppercase;">Failed</div>
         ${data.summary.failed > 0 ? `<button id="retryFailedSmsBtn" class="btn primary-btn" style="margin-top:8px; width:100%; font-size:0.65rem; padding:4px; background:#991b1b; font-weight:700;">Retry All</button>` : ''}
      </div>
    `;
// 🆕 Attach Retry Handler
    const retryBtn = document.getElementById("retryFailedSmsBtn");
    if (retryBtn) {
        retryBtn.addEventListener("click", async () => {
            const confirmed = await showConfirm({
                title: "Retry Failed SMS",
                message: `Attempt to resend ${data.summary.failed} failed messages? This will consume SMS credits.`
            });
            if (!confirmed) return;

            retryBtn.disabled = true;
            retryBtn.innerHTML = '<span class="spinner"></span> Retrying...';

            try {
                const res = await secureFetch(`${API_BASE}/announcements/retry-failed`, { method: 'POST' });
                showToast(res?.message || "SMS retry successfully initiated", "success");
                fetchSmsHistorySummary(true);
                loadSchoolInfo(true);
            } catch (err) {
                showToast(err.message || "Failed to retry SMS broadcast", "error");
                retryBtn.disabled = false;
                retryBtn.innerHTML = 'Retry All';
            }
        });
    }
    // Render Failures List
    if (data.recentFailures && data.recentFailures.length > 0) {
      let html = `
        <div style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; padding: 12px; margin-top: 10px;">
          <p style="font-size: 0.75rem; font-weight: 700; color: #ef4444; margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i> RECENT DELIVERY FAILURES:</p>
          <table style="width: 100%; font-size: 0.75rem; border-collapse: collapse;">
            <tbody>
      `;
      
      data.recentFailures.forEach(log => {
        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 6px 0;"><strong>${log.studentName}</strong></td>
            <td style="text-align: right; color: #94a3b8;">${new Date(log.createdAt).toLocaleDateString()}</td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      logWrap.innerHTML = html;
    } else {
      logWrap.innerHTML = `
        <div style="text-align: center; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 10px; color: #94a3b8; font-size: 0.8rem; margin-top: 10px;">
          <i class="fas fa-check-circle" style="color: #10b981; margin-bottom: 5px; display: block;"></i>
          No delivery failures.
        </div>
      `;
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
            clearSchoolInfoCache();
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
    `;
    document.head.appendChild(style);
  })();
   const GRADE_ORDER = ["PG","PP1", "PP2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
;

  const SCHOOL_TYPES = {
    full: {
      label: "Full School (Grades PP1-12)",
      rangeOptions: ["PG-PP2", "1-3", "4-6", "7-9", "10-12"],
      gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
    },
    primary_junior: {
      label: "Primary + Junior (Grades PP1-9)",
      rangeOptions: ["PG-PP2", "1-3", "4-6", "7-9"],
      gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
    },
    senior: {
      label: "Senior School (Grades 10-12)",
      rangeOptions: ["10-12"],
      gradeOptions: ["10","11","12"]
    }
  };

  // Centralized helpers for determining school type and config
  const resolveSchoolTypeKey = (info = schoolInfo) => {
    if (!info) return null;
    const raw = info.schoolType || info.type || info.schoolType || (info.school && (info.school.type || info.school.schoolType));
    if (!raw) return null;
    const rawType = String(raw).toLowerCase().replace(/[^a-z]/g, '_');
    if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
    if (rawType.includes('senior')) return 'senior';
    return 'full';
  };

  const getSchoolConfig = (info = schoolInfo) => {
    const key = resolveSchoolTypeKey(info);
    return key && SCHOOL_TYPES[key] ? { key, config: SCHOOL_TYPES[key] } : null;
  };

  const normalizeGrade = (g) => {
    if (!g) return "";
    const str = String(g).trim();
    let checkStr = str.toUpperCase();
    if (checkStr.startsWith("PP") || checkStr === "PG" || checkStr.includes("PLAYGROUP")) return checkStr.includes("PLAYGROUP") ? "PG" : checkStr;
    const match = str.match(/\d+/);
    return match ? `Grade ${match[0]}` : g;
  };

  const getSchoolTypeKey = () => resolveSchoolTypeKey();

  const supportsElectivesManagement = () => {
    const s = getSchoolConfig();
    if (!s) return false;
    return s.key === 'senior' || s.key === 'full';
  };

  const applyElectivesSidebarVisibility = () => {
    const navItem = document.querySelector('.menu li[data-section="electivesSection"]');
    const electivesSection = document.getElementById("electivesSection");
    const showElectives = supportsElectivesManagement();

    if (navItem) {
      navItem.style.display = showElectives ? "" : "none";
    }

    if (!showElectives && electivesSection) {
      electivesSection.style.display = "none";
      electivesSection.classList.add("hidden");

      if (navItem?.classList.contains("active")) {
        document.querySelector('.menu li[data-section="subjectAllocSection"]')?.click();
      }
    }
  };

  // Ensure electives nav is hidden until we know the school type (prevents a flash of incorrect nav)
  applyElectivesSidebarVisibility();

  // Small allocation/loading indicators for grade dropdowns and allocation tables
  function showAllocationLoadingIndicators() {
    try {
      if (gradeRangeSelect) {
        gradeRangeSelect.innerHTML = '<option value="">Loading ranges...</option>';
        gradeRangeSelect.disabled = true;
      }
      if (classGradeSelect) {
        classGradeSelect.innerHTML = '<option value="">Loading grades...</option>';
        classGradeSelect.disabled = true;
      }
      if (promotionGradeSelect) {
        promotionGradeSelect.innerHTML = '<option value="all">Loading...</option>';
        promotionGradeSelect.disabled = true;
      }

      if (subjectAllocTable) {
        const tbody = subjectAllocTable.querySelector('tbody');
        if (tbody && !document.getElementById('subjectAllocLoadingRow')) {
          const tr = document.createElement('tr');
          tr.id = 'subjectAllocLoadingRow';
          tr.innerHTML = `<td colspan="99" style="text-align:center"><span class="spinner"></span> Loading subjects...</td>`;
          tbody.prepend(tr);
        }
      }

      if (classAllocTable) {
        const tbody = classAllocTable.querySelector('tbody');
        if (tbody && !document.getElementById('classAllocLoadingRow')) {
          const tr = document.createElement('tr');
          tr.id = 'classAllocLoadingRow';
          tr.innerHTML = `<td colspan="99" style="text-align:center"><span class="spinner"></span> Loading classes...</td>`;
          tbody.prepend(tr);
        }
      }
    } catch (e) { console.warn('Allocation loading indicator error', e); }
  }

  function hideAllocationLoadingIndicators() {
    try {
      if (gradeRangeSelect) {
        gradeRangeSelect.disabled = false;
      }
      if (classGradeSelect) {
        classGradeSelect.disabled = false;
      }
      if (promotionGradeSelect) {
        promotionGradeSelect.disabled = false;
      }
      const sRow = document.getElementById('subjectAllocLoadingRow');
      if (sRow) sRow.remove();
      const cRow = document.getElementById('classAllocLoadingRow');
      if (cRow) cRow.remove();
    } catch (e) { console.warn('Allocation hide indicator error', e); }
  }

  const populateGradeRangeOptions = () => {
    if (!gradeRangeSelect) return;
    const s = getSchoolConfig();
    if (!s) {
      gradeRangeSelect.innerHTML = '<option value="">-- Select Range --</option>';
      return;
    }
    const options = s.config.rangeOptions;

    gradeRangeSelect.innerHTML = '<option value="">-- Select Range --</option>';
    options.forEach(range => {
      const opt = document.createElement('option');
      opt.value = range;
      if (range.includes('PP') || range.includes('PG')) {
        opt.textContent = range;
      } else {
        const [start, end] = range.split('-').map(Number);
        opt.textContent = start === end ? `Grade ${start}` : `Grade ${start}-${end}`;
      }
      gradeRangeSelect.appendChild(opt);
    });
  };

  const populateGradeSelectionForRange = (selectedRange = gradeRangeSelect?.value || "") => {
    if (gradesSelect) {
      gradesSelect.innerHTML = "";
      gradesSelect.multiple = true;

      if (!selectedRange) {
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "-- Select Grade --";
        gradesSelect.appendChild(emptyOpt);
        return;
      }

      if (selectedRange === "PG-PP2" || selectedRange === "PP1-PP2") {
        (selectedRange === "PG-PP2" ? ["PG", "PP1", "PP2"] : ["PP1", "PP2"]).forEach(g => {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = g;
          gradesSelect.appendChild(opt);
        });
      } else if (selectedRange) {
        const [start, end] = selectedRange.split("-").map(Number);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          for (let i = start; i <= end; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = `Grade ${i}`;
            gradesSelect.appendChild(opt);
          }
        }
      }
    }

    if (subjectsSelect) {
      subjectsSelect.innerHTML = "";
      subjectsSelect.multiple = true;

      if (selectedRange === "10-12" && window.SUBJECT_DATA && window.SUBJECT_DATA.seniorCompulsorySubjects) {
        const compulsoryOptgroup = document.createElement("optgroup");
        compulsoryOptgroup.label = "Compulsory Subjects";
        window.SUBJECT_DATA.seniorCompulsorySubjects.forEach(subject => {
          const opt = document.createElement("option");
          opt.value = subject;
          opt.textContent = `${subject}`;
          compulsoryOptgroup.appendChild(opt);
        });
        subjectsSelect.appendChild(compulsoryOptgroup);
      }

      if (selectedRange === "10-12") {
        Object.entries(seniorSchoolPathways || {}).forEach(([pathway, courses]) => {
          const optgroup = document.createElement("optgroup");
          optgroup.label = pathway;
          courses.forEach(course => {
            const opt = document.createElement("option");
            opt.value = course;
            opt.textContent = `${course}`;
            optgroup.appendChild(opt);
          });
          subjectsSelect.appendChild(optgroup);
        });
      } else if (selectedRange && gradeSubjects[selectedRange]) {
        gradeSubjects[selectedRange].forEach(sub => {
          const opt = document.createElement("option");
          opt.value = sub;
          opt.textContent = sub;
          subjectsSelect.appendChild(opt);
        });
      }
    }
  };

  const populateClassGradeOptions = () => {
    if (!classGradeSelect) return;
    const s = getSchoolConfig();
    if (!s) {
      classGradeSelect.innerHTML = '<option value="">-- Select Grade --</option>';
      return;
    }
    const options = s.config.gradeOptions;

    classGradeSelect.innerHTML = '<option value="">-- Select Grade --</option>';
    options.forEach(grade => {
      const opt = document.createElement('option');
      opt.value = grade;
      opt.textContent = (String(grade).toUpperCase().startsWith("PP") || String(grade).toUpperCase() === "PG") ? grade : `Grade ${grade}`;
      classGradeSelect.appendChild(opt);
    });
  };

  const populatePromotionGradeOptions = () => {
    if (!promotionGradeSelect) return;
    const s = getSchoolConfig();
    if (!s) {
      promotionGradeSelect.innerHTML = '<option value="all">-- All Grades --</option>';
      return;
    }
    const options = s.config.gradeOptions;

    promotionGradeSelect.innerHTML = '<option value="all">-- All Grades --</option>';
    options.forEach(grade => {
      const opt = document.createElement('option');
      const val = (String(grade).toUpperCase().startsWith("PP") || String(grade).toUpperCase() === "PG") ? grade : `Grade ${grade}`;
      opt.value = val;
      opt.textContent = val;
      promotionGradeSelect.appendChild(opt);
    });
  };

  const populatePromotionYearOptions = () => {
    if (!fromAcademicYearInput || !toAcademicYearInput) return;
    const currentYear = new Date().getFullYear();
    
    [fromAcademicYearInput, toAcademicYearInput].forEach((select, idx) => {
      select.innerHTML = '';
      // Range: from 2 years back to 10 years forward
      for (let y = currentYear - 2; y <= currentYear + 100; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        // idx 0 = 'from', idx 1 = 'to'
        if (idx === 0 && y === currentYear) opt.selected = true;
        if (idx === 1 && y === currentYear + 1) opt.selected = true;
        select.appendChild(opt);
      }
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
    populatePromotionGradeOptions();
    populateBulkDeleteGradeOptions();
    populatePromotionYearOptions();
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
// ... (no changes to renderPromotionPreview)
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

   
    const status = s.status || "N/A";
    const disabled = status !== "active";

    // 🆕 Check if there is a manual override for this student
    const savedAction = promoOverrides.get(s.studentId) || "promote";

    const actionSelect = disabled
      ? `<select disabled>
          
           <option>${status.toUpperCase()}</option>
         </select>`
      : `<select class="promotion-action">
           <option value="promote" ${savedAction === 'promote' ? 'selected' : ''}>Promote</option>
           <option value="repeat" ${savedAction === 'repeat' ? 'selected' : ''}>Repeat</option>
           <option value="transfer" ${savedAction === 'transfer' ? 'selected' : ''}>Transfer</option>
         </select>`;

    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.admission}</td>
      <td>${s.currentGrade}</td>
      <td style="color: ${s.nextGrade ? 'inherit' : '#e53e3e'}; font-weight: ${s.nextGrade ? 'normal' : 'bold'};">
        ${s.nextGrade || "Completed"}</td>
      <td>${actionSelect}</td>
    `;

    promotionPreviewBody.appendChild(tr);
  });

  // Enable confirm if at least one active student exists
  if (confirmPromotionBtn) confirmPromotionBtn.disabled = !data.some(s => s.status === "active");
}

// Function to create and append the promotion progress bar UI
function setupPromotionProgressBar() {
  const promotionSection = document.getElementById("promotionSection");
  if (!promotionSection || document.getElementById("promotionProgressBarContainer")) return; // Only create once

  const progressBarHtml = `
    <div id="promotionProgressBarContainer" style="display: none; margin-top: 15px; background: #e0e7ff; border-radius: 8px; overflow: hidden; border: 1px solid #c7d2fe;">
      <div style="display: flex; justify-content: space-between; padding: 8px 12px; font-size: 0.8rem; color: #3b82f6; font-weight: 600;">
        <span id="promotionProgressText">Processing batch...</span>
        <span id="promotionProgressPercent">0%</span>
      </div>
      <div style="height: 8px; background: #c7d2fe;">
        <div id="promotionProgressBar" style="width: 0%; height: 100%; background: #3b82f6; transition: width 0.3s ease-in-out;"></div>
      </div>
    </div>
  `;
  
  // Find the confirmPromotionBtn and insert the progress bar after it
  const confirmBtn = document.getElementById("confirmPromotionBtn");
  if (confirmBtn && confirmBtn.parentNode) {
    confirmBtn.parentNode.insertAdjacentHTML('afterend', progressBarHtml);
  }

  promotionProgressBarContainer = document.getElementById("promotionProgressBarContainer");
  promotionProgressBar = document.getElementById("promotionProgressBar");
  promotionProgressText = document.getElementById("promotionProgressText");
  promotionProgressPercent = document.getElementById("promotionProgressPercent");
}

   // 🆕 Debounce for promotion search input
  let promotionSearchDebounce;
  promotionSearchInput?.addEventListener("input", () => {
    clearTimeout(promotionSearchDebounce);
    promotionSearchDebounce = setTimeout(() => {
      loadPromotionPreview(1); // Reset to page 1 on search
    }, 300);
  });

  // 🆕 Reload preview when grade filter changes
  promotionGradeSelect?.addEventListener("change", () => {
    loadPromotionPreview(1);
  });

  // 🆕 Reload preview when years change
  fromAcademicYearInput?.addEventListener("change", () => {
    loadPromotionPreview(1);
  });

  toAcademicYearInput?.addEventListener("change", () => loadPromotionPreview(1));

  async function loadPromotionPreview(page = 1) {
  const year = fromAcademicYearInput.value.trim();
  const search = promotionSearchInput?.value.trim().toLowerCase() || ''; // 🆕 Normalize for local search
  const grade = promotionGradeSelect?.value || 'all'; // 🆕 Get selected grade

  // 🆕 Reset cache/overrides if the Grade or Year context changes
  const currentContext = `${year}_${grade}`;
  if (lastPromoContext !== currentContext) {
    promoData = [];
    promoOverrides.clear();
    lastPromoContext = currentContext;
  }

  // 🆕 1. Local Filtering: filter already fetched learners for speed
  if (promoData.length > 0 && search) {
    // 🆕 Smart search: exact match for numeric admission, substring for names
    const isNumericSearch = /^\d+$/.test(search); // Check if search is all digits
    
    const filtered = promoData.filter(s => {
      if (isNumericSearch) {
        // For numeric searches, match admission exactly (not substring)
        return (s.admission || "").toString() === search;
      } else {
        // For text searches, match name by substring
        return (s.name || "").toLowerCase().includes(search);
      }
    });
    
    renderPromotionPreview(filtered);
    const controls = document.getElementById("promoPaginationControls");
    if (controls) controls.style.display = "none"; // Hide pagination while filtering
    return;
  }

  // 🆕 2. Restore from Cache: show the full batch when search is cleared
  if (promoData.length > 0 && !search && page === promoPage) {
    renderPromotionPreview(promoData);
    const controls = document.getElementById("promoPaginationControls");
    if (controls) controls.style.display = "flex";
    return;
  }

  if (!year) {
    showToast("Enter academic year", "error");
    return;
  }

  // Only fetch from server if cache is empty or pagination changed
  promoLoading = true;
  if (promotionPreviewBody) {
    promotionPreviewBody.innerHTML = '<tr><td colspan="5" style="text-align:center"><span class="spinner"></span> Loading...</td></tr>';
  }

  // 🆕 UI UX Improvement: Add "Set All to Promote" helper to the header to reduce manual clicking.
  const actionHeader = document.querySelector("#promotionPreviewTable thead th:last-child");
  if (actionHeader && !document.getElementById("promoteAllVisibleBtn")) {
    const btn = document.createElement("button");
    btn.id = "promoteAllVisibleBtn";
    btn.innerHTML = "Set All to Promote";
    btn.className = "btn secondary-btn";
    btn.style.cssText = "display: block; margin-top: 5px; font-size: 0.6rem; padding: 2px 4px; background: #ebf8ff; color: #2b6cb0;";
    btn.onclick = () => {
      document.querySelectorAll(".promotion-action:not(:disabled)").forEach(sel => sel.value = "promote");
    };
    actionHeader.appendChild(btn);
  }

  try {
    const res = await secureFetch(
      `${API_BASE}/promotions/preview?academicYear=${year}&page=${page}&limit=${promoLimit}&search=${encodeURIComponent(search)}&grade=${encodeURIComponent(grade)}` // 🆕 Pass search and grade
    );

    if (res) {
      promoPage = res.currentPage || 1;
      // Robustly handle total pages from root or pagination object
      promoTotalPages = res.totalPages || res.pagination?.totalPages || res.pages || 1;

      // Exhaustive check for the data array key to ensure learners appear in the table
      const previewData = res.preview || res.results || res.students || res.users || res.learners || res.data || res.docs || (Array.isArray(res) ? res : []);
      
      promoData = previewData; // 🆕 Cache this batch
      renderPromotionPreview(previewData);
      renderPromotionPagination();
    }
  } finally {
    promoLoading = false;
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

    if (prevBtn) prevBtn.onclick = async () => {
    if (!promoLoading && promoPage > 1) {
      window.spinner?.show(prevBtn, "Prev");
      await loadPromotionPreview(promoPage - 1);
      window.spinner?.hide(prevBtn);
    }
  };
  if (nextBtn) nextBtn.onclick = async () => {
    if (!promoLoading && promoPage < promoTotalPages) {
      window.spinner?.show(nextBtn, "Next");
      await loadPromotionPreview(promoPage + 1);
      window.spinner?.hide(nextBtn);
    }
  };
}

confirmPromotionBtn.addEventListener("click", async () => {
  const fromYear = Number(fromAcademicYearInput.value);
  const toYear = Number(toAcademicYearInput.value);

  // 🆕 Use Cached Data + Overrides to build decisions
  // This ensures filtered-out learners are still promoted correctly
  const decisions = [];
  promoData.forEach(s => {
    if (s.status !== 'active') return;
    decisions.push({
      studentId: s.studentId,
      action: promoOverrides.get(s.studentId) || "promote"
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

  window.spinner?.show(confirmPromotionBtn, "Processing...");

  // Show promotion progress bar
  if (promotionProgressBarContainer) {
    promotionProgressBarContainer.style.display = "block";
    promotionProgressBar.style.width = "10%";
    promotionProgressBar.style.backgroundColor = "#3b82f6"; // Reset color
    promotionProgressText.textContent = "Processing batch...";
    promotionProgressPercent.textContent = "10%";
  }

  try {
    const res = await secureFetch(`${API_BASE}/promotions/promote`, {
      method: "POST",
      body: JSON.stringify({
        fromAcademicYear: fromYear,
        toAcademicYear: toYear,
        decisions
      })
    });

    if (res) { // Success path
      // 🆕 Success! Clear promotion state
      promoData = [];
      promoOverrides.clear();

      if (promotionProgressBarContainer) {
        promotionProgressBar.style.width = "100%";
        promotionProgressText.textContent = "Batch complete!";
        promotionProgressPercent.textContent = "100%";
        promotionProgressBar.style.backgroundColor = "#10b981"; // Green for success
        setTimeout(() => { promotionProgressBarContainer.style.display = "none"; }, 2000); // Hide after delay
      }
      showToast("Promotion completed", "success");
      promotionPreviewBody.innerHTML = "";
      confirmPromotionBtn.disabled = true;
    } else { // secureFetch returned null, meaning an error was already handled and displayed (e.g., modal)
      if (promotionProgressBarContainer) {
        promotionProgressBar.style.width = "100%";
        promotionProgressText.textContent = "Batch failed!";
        promotionProgressPercent.textContent = "100%";
        promotionProgressBar.style.backgroundColor = "#ef4444"; // Red for error
        setTimeout(() => { promotionProgressBarContainer.style.display = "none"; }, 3000); // Hide after delay
      }
      // No need to showToast here, secureFetch already did it.
    }
  } catch (err) { // This catch block would only be hit if secureFetch itself threw an unhandled error
    console.error("Promotion initiation error:", err);
    if (promotionProgressBarContainer) {
      promotionProgressBar.style.width = "100%";
      promotionProgressText.textContent = "Batch failed!";
      promotionProgressPercent.textContent = "100%";
      promotionProgressBar.style.backgroundColor = "#ef4444"; // Red for error
      setTimeout(() => { promotionProgressBarContainer.style.display = "none"; }, 3000); // Hide after delay
    }
    showToast(err.message || "Promotion failed unexpectedly", "error");
  } finally {
    window.spinner?.hide(confirmPromotionBtn);
  }
});

/**
   * 🆕 Displays a readable summary of promotion failures in a modal.
   */
  function showPromotionErrorSummary(errors, mainMessage) {
    const modal = document.createElement("div");
    modal.className = "confirm-overlay visible";
    modal.style.zIndex = "10005";

    let rows = "";
    errors.forEach(err => {
      rows += `
        <tr style="border-bottom: 1px solid #fecaca;">
          <td style="padding: 10px; font-weight: 700; color: #b91c1c; white-space: nowrap;">${err.name} (${err.admission})</td>
          <td style="padding: 10px; color: #475569; font-size: 0.85rem;">${err.message}</td>
        </tr>
      `;
    });

    modal.innerHTML = `
      <div class="confirm-box" style="max-width: 550px; text-align: left; background: #fff; border-top: 4px solid #ef4444; border-radius: 12px;">
        <h3 style="color: #991b1b; margin-top: 0; display: flex; align-items: center; gap: 10px;">
          <i class="fas fa-exclamation-circle"></i> Batch Promotion Blocked
        </h3>
        <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 15px; line-height: 1.5;">
          ${mainMessage || "Errors were encountered with specific learners. To ensure data consistency, no changes were saved."}
        </p>
        
        <div style="max-height: 250px; overflow-y: auto; border: 1px solid #fecaca; border-radius: 8px; margin-bottom: 20px; background: #fff5f5;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead style="background: #fee2e2; position: sticky; top: 0;">
              <tr>
                <th style="text-align: left; padding: 10px; font-size: 0.7rem; text-transform: uppercase; color: #991b1b;">Learner</th>
                <th style="text-align: left; padding: 10px; font-size: 0.7rem; text-transform: uppercase; color: #991b1b;">Reason for Failure</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div style="text-align: right;">
          <button id="closePromoErrorBtn" class="btn secondary-btn" style="padding: 10px 24px; font-weight: 700; border-radius: 8px;">Got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector("#closePromoErrorBtn").onclick = () => {
      modal.classList.remove("visible");
      setTimeout(() => modal.remove(), 300);
    };
  }

  // ---------------------------
  // API HELPER
  // ---------------------------
  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    options.headers = { ...options.headers, "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type") || "";

      // Redirect to login if the session is invalid or the user lacks permission
      if (res.status === 401 || res.status === 403) return authService.redirectToLogin();

      if (!res.ok) {
        const text = contentType.includes("application/json") ? await res.json() : await res.text();
        const errMsg = typeof text === "string" ? text : JSON.stringify(text);
        throw new Error(errMsg || `Request failed: ${res.status}`);
      }

      if (contentType.includes("application/json")) return res.json();
      return res.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("Fetch aborted by user.");
        return null;
      }
      console.error("Fetch error:", err);
      
      // 🆕 Try to handle structured batch errors specifically
      try {
        const errorData = JSON.parse(err.message);
        if (errorData.errors && Array.isArray(errorData.errors)) {
          showPromotionErrorSummary(errorData.errors, errorData.message);
          return null; // Suppress toast since we show a modal
        }
        showToast(errorData.message || err.message || "Network error", "error");
      } catch (e) {
        showToast(err.message || "Network error", "error");
      }

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
    teacherSelect.innerHTML = '<option value="">-- Select Teacher --</option>';
    classTeacherSelect.innerHTML = '<option value="">-- Select Teacher --</option>';
    const teachers = users.filter(u => u.role === "teacher");
    if (!teachers || teachers.length === 0) {
      teacherSelect.innerHTML = '<option value="">No teachers found</option>';
      classTeacherSelect.innerHTML = '<option value="">No teachers found</option>';
      return;
    }
    teachers.forEach(u => {
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

    // Deduplicate data by ID to prevent double-listing in case of API or state anomalies
    const uniqueData = [];
    const seenIds = new Set();
    data.forEach(item => {
      if (item && item._id && !seenIds.has(item._id)) {
        uniqueData.push(item);
        seenIds.add(item._id);
      }
    });

    // Sort uniqueData by teacher name (optional, but good for consistency)
    uniqueData.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
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
        // 🆕 Sort allocations for this teacher by Grade Order (PG -> Grade 12)
        const sortedAllocations = [...allocations].sort((a, b) => {
          const indexA = GRADE_ORDER.indexOf(normalizeGrade(String(a.grade)));
          const indexB = GRADE_ORDER.indexOf(normalizeGrade(String(b.grade)));
          return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
        });

        sortedAllocations.forEach((alloc, index) => {
          const normalized = normalizeGrade(alloc.grade);
          const isPP = normalized.toUpperCase().startsWith("PP") || normalized.toUpperCase() === "PG";
          const gradeLabel = isPP ? (alloc.stream ? `${alloc.grade}${alloc.stream}` : alloc.grade) : (alloc.stream ? `Grade ${alloc.grade}${alloc.stream}` : `Grade ${alloc.grade}`);
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
      let classLabel = item.classLabel || (item.assignedStream ? `Grade ${item.assignedClass}${item.assignedStream}` : `Grade ${item.assignedClass}`);
      // Fix: If it's a PP grade, ensure "Grade" is not prepended
      if (classLabel.toUpperCase().startsWith("GRADE PP") || classLabel.toUpperCase().startsWith("GRADE PG")) {
        classLabel = classLabel.replace(/^GRADE\s+/i, "");
      }
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
  async function loadTeacherOptions(page = 1, forceReload = false) {
    // Handle legacy calls like loadTeacherOptions(true)
    if (typeof page === 'boolean') {
      forceReload = page;
      page = 1;
    }

    const CACHE_KEY = "admin_teachers_cache";
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
    const queryKey = `p${page}`;

    if (!forceReload) {
      let store = {};
      try { store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch(e) {}
      const cached = store[queryKey];

      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        teacherListPage = cached.data.page || page;
        teacherListTotalPages = cached.data.pages || 1;
        populateTeacherSelects(cached.data.users);
        updateTeacherDropdownPaginationUI();
        return;
      }
    } else {
      localStorage.removeItem(CACHE_KEY);
    }

    try { // 🆕 Include search term in the API call
      const res = await secureFetch(`${API_BASE}/users?role=teacher&page=${page}&limit=10&search=${encodeURIComponent(teacherSearchTerm)}`);
      if (!res || !res.users) {
        // Ensure selects show 'No teachers' if API returned empty or invalid
        populateTeacherSelects([]);
        return;
      }

      teacherListPage = res.page || page;
      teacherListTotalPages = res.pages || 1;

      // Update Cache (page-specific storage)
      try {
        const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); // 🆕 Cache key now includes search term
        store[queryKey] = { timestamp: Date.now(), data: res };
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      } catch (e) {}

      populateTeacherSelects(res.users);
      updateTeacherDropdownPaginationUI();
    } catch (err) {
      console.error("Load teachers error:", err);
    }
  }

  // Debounce utility function
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  // 🆕 Debounced search handler for teacher dropdowns
  const handleTeacherSearch = debounce((searchTerm) => {
    teacherSearchTerm = searchTerm;
    // When search term changes, reset to page 1 and force reload
    loadTeacherOptions(1, true); 
  }, 300); // 300ms debounce delay

  function initTeacherDropdownPagination() {
    [teacherSelect, classTeacherSelect].forEach(select => {
      // 🆕 Add search input for each dropdown
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Search teachers...";
      searchInput.className = "form-control";
      searchInput.style.cssText = "margin-bottom: 5px; padding: 6px; font-size: 0.8rem; border: 1px solid #ccc; border-radius: 4px;";
      searchInput.addEventListener("input", (e) => handleTeacherSearch(e.target.value.trim()));
      select.parentNode.insertBefore(searchInput, select);

      if (!select || select.nextElementSibling?.classList.contains("tt-dropdown-pagination")) return;
      
      const wrapper = document.createElement("div");
      wrapper.className = "tt-dropdown-pagination";
      wrapper.style.cssText = "display: flex; gap: 8px; align-items: center; margin-top: 5px;";

      const prev = document.createElement("button");
      prev.type = "button"; prev.className = "btn secondary-btn";
      prev.innerHTML = "&laquo; Prev"; prev.style.cssText = "padding: 2px 6px; font-size: 0.65rem;";
      
      const next = document.createElement("button");
      next.type = "button"; next.className = "btn secondary-btn";
      next.innerHTML = "Next &raquo;"; next.style.cssText = "padding: 2px 6px; font-size: 0.65rem;";

      const info = document.createElement("span");
      info.className = "page-info";
      info.style.cssText = "font-size: 0.65rem; color: #64748b; font-weight: 600;";

      select.parentNode.insertBefore(wrapper, select.nextSibling);
      wrapper.appendChild(prev); wrapper.appendChild(next); wrapper.appendChild(info);

      prev.onclick = async () => { 
        if (teacherListPage > 1) {
          window.spinner?.show(prev, "Prev");
          await loadTeacherOptions(teacherListPage - 1);
          window.spinner?.hide(prev);
        } 
      };
      next.onclick = async () => { 
        if (teacherListPage < teacherListTotalPages) {
          window.spinner?.show(next, "Next");
          await loadTeacherOptions(teacherListPage + 1);
          window.spinner?.hide(next);
        } 
      };
    });
  }

  function updateTeacherDropdownPaginationUI() {
    document.querySelectorAll(".tt-dropdown-pagination").forEach(wrapper => {
      const prev = wrapper.querySelector("button:first-child");
      const next = wrapper.querySelector("button:nth-child(2)");
      const info = wrapper.querySelector(".page-info");

      if (prev) prev.disabled = teacherListPage <= 1;
      if (next) next.disabled = teacherListPage >= teacherListTotalPages;
      if (info) info.textContent = `Page ${teacherListPage} of ${teacherListTotalPages}`;
    });
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

  async function loadClassAllocations(page = classAllocPage, limit = CLASS_ALLOC_LIMIT, force = false) {
    if (!classAllocTableBody) return;
    if (classAllocTableBody.dataset.loading === "true") return;
    classAllocTableBody.dataset.loading = "true";

     const CACHE_KEY = `class_allocations_p${page}`;
    if (!force) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          classAllocPage = data.pagination?.page || page;
          classAllocTotalPages = data.pagination?.totalPages || 1;
          renderClassAllocations(data.data || data);
          classAllocTableBody.dataset.loading = "false";
          updateClassAllocPaginationControls();
          return;
        }
      }
    }

    classAllocTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center">${createSpinner().outerHTML} Loading class allocations...</td></tr>`;
    try {
        const res = await secureFetch(`${API_BASE}/users/allocations?page=${page}&limit=${limit}`);
      if (!res) { classAllocTableBody.innerHTML = ""; return; }

      const allocationsData = Array.isArray(res) ? res : res.data || [];
      const pagination = res.pagination || {};

      classAllocPage = pagination.page || page;
      classAllocTotalPages = pagination.totalPages || 1;

      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: res }));
      renderClassAllocations(allocationsData);
    } finally {
      classAllocTableBody.dataset.loading = "false";
      updateClassAllocPaginationControls();
    }
  }

  function updateClassAllocPaginationControls() {
    if (classAllocPageInfo) {
      classAllocPageInfo.textContent = `Page ${classAllocPage} of ${classAllocTotalPages}`;
    }
    if (classAllocPrevBtn) {
      classAllocPrevBtn.disabled = classAllocPage <= 1 || classAllocTableBody.dataset.loading === "true";
    }
    if (classAllocNextBtn) {
      classAllocNextBtn.disabled = classAllocPage >= classAllocTotalPages || classAllocTableBody.dataset.loading === "true";
    }
  }

  if (classAllocPrevBtn) {
    classAllocPrevBtn.addEventListener("click", async () => {
      if (classAllocPage > 1) {
        window.spinner?.show(classAllocPrevBtn, "Previous");
        await loadClassAllocations(classAllocPage - 1);
        window.spinner?.hide(classAllocPrevBtn);
      }
    });
  }

  if (classAllocNextBtn) {
    classAllocNextBtn.addEventListener("click", async () => {
      if (classAllocPage < classAllocTotalPages) {
        window.spinner?.show(classAllocNextBtn, "Next");
        await loadClassAllocations(classAllocPage + 1);
        window.spinner?.hide(classAllocNextBtn);
      }
    });
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

function formatDateForDisplay(value) {
  if (!value) return "";

  const text = String(value).trim();
  if (!text) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
  }

  return text;
}

function getAgeFromDateOfBirth(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  let birthDate = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    birthDate = new Date(year, month - 1, day);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split('-').map(Number);
    birthDate = new Date(year, month - 1, day);
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    birthDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
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
      ${isStudent ? `
      <div style="margin:15px 0;">
        <label>Gender (Optional):</label>
        <select id="editProfileGender" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;">
          <option value="">-- Select --</option>
          <option value="Male" ${userToEdit.gender === 'Male' ? 'selected' : ''}>Male</option>
          <option value="Female" ${userToEdit.gender === 'Female' ? 'selected' : ''}>Female</option>
          <option value="Other" ${userToEdit.gender === 'Other' ? 'selected' : ''}>Other</option>
          <option value="Prefer not to say" ${userToEdit.gender === 'Prefer not to say' ? 'selected' : ''}>Prefer not to say</option>
        </select>
      </div>
      <div style="margin:15px 0;">
        <label style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <span>Date of Birth (Optional):</span>
          ${userToEdit.dateOfBirth ? `<span style="background:#e8f0fe;color:#1d4ed8;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:600;">Age ${getAgeFromDateOfBirth(userToEdit.dateOfBirth)}</span>` : ''}
        </label>
        <input type="text" id="editProfileDob" value="${formatDateForDisplay(userToEdit.dateOfBirth)}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;margin-top:6px;" placeholder="dd/mm/yyyy" />
      </div>
      ` : ''}
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
    window.spinner?.show(saveProfileBtn, "Saving...");

    const payload = {
      name: document.getElementById("editProfileName").value.trim(),
      contact: document.getElementById("editProfileContact").value.trim() || null
    };

    if (isStudent) {
      payload.admission = document.getElementById("editProfileIdentifier").value.trim();
      const gender = document.getElementById("editProfileGender")?.value?.trim() || "";
      const dob = document.getElementById("editProfileDob")?.value?.trim() || "";
      if (gender) payload.gender = gender;
      if (dob) payload.dateOfBirth = dob;
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
      window.spinner?.hide(saveProfileBtn);
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
      "announcementSection": "School Announcements",
      "classAllocSection": "Class Allocations",
      "searchSection": "Learner Search",
      "promotionSection": "Learner Promotion",
      "signatureUploadSection": "Digital Signature", // New section title
      "termLockManagementSection": "Term Lock Management", // 🆕 New section title
      "electivesSection": "Electives Management" // NEW
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
          // 🆕 Autofocus teacher search input for Subject Allocation
          const searchInput = teacherSelect?.previousElementSibling;
          if (searchInput && searchInput.tagName === 'INPUT') {
            setTimeout(() => searchInput.focus(), 100);
          }
        } else if (targetId === "signatureUploadSection") {
          renderAdminSignature(); // Render/re-render signature UI when its tab is active
        } else if (targetId === "termLockManagementSection") {
          populateTermLockYearOptions();
          loadTermLockStatus(); // Load status for default year/term
        } else if (targetId === "classAllocSection") {
          // 🆕 Autofocus teacher search input for Class Allocation
          const searchInput = classTeacherSelect?.previousElementSibling;
          if (searchInput && searchInput.tagName === 'INPUT') {
            setTimeout(() => searchInput.focus(), 100);
          }
       // } else if (targetId === "promotionSection") {
          //loadPromotionPreview(1); // 🆕 Automatically load preview when tab is selected
        } else if (targetId === "announcementSection") {
          fetchSmsHistorySummary(); // 🆕 Refresh SMS stats for Admin

          } else if (targetId === "electivesSection") {
         window.ElectivesAdmin?.init();
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
      // Default: edits disabled unless explicitly enabled by admin
      const allowTeacherSubmittedMarkEdits = res.allowTeacherSubmittedMarkEdits === true;
      termLockStatusDisplay.textContent = isLocked ? "LOCKED" : "UNLOCKED";
      termLockStatusDisplay.style.color = isLocked ? "red" : "green";
      termLockToggleButton.checked = isLocked;
      termLockToggleButton.disabled = false;

      if (submittedMarksEditStatusDisplay && submittedMarksEditToggleButton) {
        submittedMarksEditStatusDisplay.textContent = allowTeacherSubmittedMarkEdits ? "Enabled" : "Disabled";
        submittedMarksEditStatusDisplay.style.color = allowTeacherSubmittedMarkEdits ? "green" : "red";
        submittedMarksEditToggleButton.checked = allowTeacherSubmittedMarkEdits;
        submittedMarksEditToggleButton.disabled = false;
      }
      // Clear any existing poll
      if (termLockPollIntervalId) clearInterval(termLockPollIntervalId);
      // Start a short polling loop to pick up teacher-submitted changes quickly
      termLockPollIntervalId = setInterval(async () => {
        try {
          const p = await secureFetch(`${API_BASE}/settings/term-lock?year=${year}&term=${term}`);
          if (!p) return;
          const pIsLocked = p.isLocked;
          const pAllowEdits = p.allowTeacherSubmittedMarkEdits === true;
          // Update admin UI if changed
          termLockStatusDisplay.textContent = pIsLocked ? "LOCKED" : "UNLOCKED";
          termLockStatusDisplay.style.color = pIsLocked ? "red" : "green";
          termLockToggleButton.checked = pIsLocked;
          if (submittedMarksEditStatusDisplay && submittedMarksEditToggleButton) {
            submittedMarksEditStatusDisplay.textContent = pAllowEdits ? "Enabled" : "Disabled";
            submittedMarksEditStatusDisplay.style.color = pAllowEdits ? "green" : "red";
            submittedMarksEditToggleButton.checked = pAllowEdits;
          }
        } catch (e) { console.warn('Term lock poll error', e); }
      }, 5000);
    }
  } catch (err) {
    console.error("Error loading term lock status:", err);
    termLockStatusDisplay.textContent = "Error loading status";
    termLockStatusDisplay.style.color = "orange";
    termLockToggleButton.disabled = true;
    if (submittedMarksEditStatusDisplay && submittedMarksEditToggleButton) {
      submittedMarksEditStatusDisplay.textContent = "Error";
      submittedMarksEditStatusDisplay.style.color = "orange";
      submittedMarksEditToggleButton.disabled = true;
    }
  }
}

async function saveTermLockStatus() {
  if (!termLockYearSelect || !termLockTermSelect || !termLockToggleButton || !saveTermLockBtn) return;

  const year = termLockYearSelect.value;
  const term = termLockTermSelect.value;
  const isLocked = termLockToggleButton.checked;
  const allowTeacherSubmittedMarkEdits = submittedMarksEditToggleButton ? submittedMarksEditToggleButton.checked : true;

  if (!year || !term) {
    showToast("Please select a year and term.", "error");
    return;
  }

  window.spinner?.show(saveTermLockBtn, "Saving...");

  try {
    const res = await secureFetch(`${API_BASE}/settings/term-lock`, {
      method: "PUT",
      body: JSON.stringify({ year: Number(year), term: Number(term), isLocked, allowTeacherSubmittedMarkEdits })
    });

    if (res) {
      showToast(res.message, "success");
      loadTermLockStatus(); // Refresh status display
    }
  } catch (err) {
    console.error("Error saving term lock status:", err);
    showToast("Failed to save term lock status: " + err.message, "error");
  } finally {
    window.spinner?.hide(saveTermLockBtn);
  }
}

// Event Listeners for Term Lock Management
termLockYearSelect?.addEventListener("change", loadTermLockStatus);
termLockTermSelect?.addEventListener("change", loadTermLockStatus);
saveTermLockBtn?.addEventListener("click", saveTermLockStatus);

// Clean up polling when navigating away
window.addEventListener('beforeunload', () => {
  if (termLockPollIntervalId) clearInterval(termLockPollIntervalId);
});

  // IMPORTANT: Ensure your admin.html file has the following list item within the <ul class="menu">
  // for the "Digital Signature" navigation to appear:
  /*
  <li data-section="signatureUploadSection">
    <a href="#">Digital Signature</a>
  </li>
  */


(async function initialLoad() {
  if (isRefreshing) return;
  showAdminInitOverlay();
  try { 
    const user = await authService.getUserProfile(["admin"]);
    if (!user) return;
    authService.initLogout();

    const profileSchoolName = user.schoolName || user.school?.name || user.school?.schoolName || "";
    if (profileSchoolName) {
      applySidebarBrandName(profileSchoolName);
    }
    if (user.schoolId) {
      localStorage.setItem("schoolId", user.schoolId);
    }

    // Ensure school info is loaded first so grade-related dropdowns can populate
    showAllocationLoadingIndicators();
    try {
      await loadSchoolInfo();
    } finally {
      hideAllocationLoadingIndicators();
    }
    await Promise.all([
      loadTeacherOptions(),
      loadSubjectAllocations(),
      loadClassAllocations(),
      setupPromotionProgressBar()
    ]);
    initTeacherDropdownPagination();
    setupNavigation();
  } catch (err) { 
    console.error("Initial load error:", err); 
  } finally {
    removeAdminInitOverlay();
  }
})();


// ---------------------------
// FORM SUBMISSIONS
// ---------------------------

  const isStreamSelectionRequired = (streamSelect) => {
    if (!streamSelect) return false;
    const responseOptions = Array.from(streamSelect.options || []).filter(opt => String(opt.value || "").trim() !== "");
    return responseOptions.length > 0;
  };

//subject allocation form handler
  if (subjectAllocForm) {
    subjectAllocForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const teacherId = teacherSelect?.value || "";
      const grades = gradesSelect ? Array.from(gradesSelect.selectedOptions).map(opt => opt.value) : [];
      const grade = grades.length > 0 ? grades[0] : "";
      const subjects = subjectsSelect ? Array.from(subjectsSelect.selectedOptions).map(opt => opt.value) : [];
      const stream = (streamInput && streamInput.value !== "") ? streamInput.value : null;

      if (!teacherId) return showToast("Please select a teacher.", "error");
      if (!grade) return showToast("Please select a Grade.", "error");
      if (isStreamSelectionRequired(streamInput) && !stream) return showToast("Please select a Stream for this grade before assigning subjects.", "error");
      if (subjects.length === 0) return showToast("Please select at least one subject.", "error");

      const ok = await showConfirm({
        title: "Confirm Subject Allocation",
        message: "Are you sure you want to assign these subjects to the selected teacher?"
      });
      if (!ok) return;

      const submitBtn = subjectAllocForm.querySelector("button[type='submit']");
      window.spinner?.show(submitBtn, "Saving...");

      const gradeRange = gradeRangeSelect?.value || "";
      
      const res = await secureFetch(`${API_BASE}/users/subjects/assign`, {
        method: 'POST',
        body: JSON.stringify({ teacherId, gradeRange, grade, stream, subjects })
      });

      if (res) { await loadSubjectAllocations(1, SUBJECT_ALLOC_LIMIT, true); showToast("Subject allocation saved successfully!", "success"); }

      window.spinner?.hide(submitBtn);
    });
  }

  
//class allocation form handler
  if (classAllocForm) {
  classAllocForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const teacherId = classTeacherSelect?.value || "";
    const assignedClass = classGradeSelect?.value || "";
    const assignedStream = (classStreamInput && classStreamInput.value !== "") ? classStreamInput.value : null;

    if (!teacherId) return showToast("Please select a teacher.", "error");
    if (!assignedClass) return showToast("Please select a Grade.", "error");
    if (isStreamSelectionRequired(classStreamInput) && !assignedStream) return showToast("Please select a Stream for this grade before assigning a class.", "error");

    const ok = await showConfirm({
      title: "Assign Class Teacher",
      message: `Are you sure you want to assign this teacher to Class: ${assignedClass}${assignedStream ? ' ' + assignedStream : ''}?`
    });
    if (!ok) return;

    const submitBtn = classAllocForm.querySelector("button[type='submit']");
    window.spinner?.show(submitBtn, "Saving...");

    const res = await secureFetch(`${API_BASE}/users/classes/assign-teacher`, {
      method: 'POST',
      body: JSON.stringify({ teacherId, assignedClass, assignedStream })
    });

    if (res) {
      await loadClassAllocations(1, CLASS_ALLOC_LIMIT, true);
      showToast("Class allocation saved successfully!", "success");
    }

    window.spinner?.hide(submitBtn);
  });
}

  // ---------------------------
  // REMOVE BUTTON HANDLERS
  // ---------------------------

  subjectAllocTableBody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;

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
    const stream = (btn.dataset.stream && btn.dataset.stream.trim() !== '') ? btn.dataset.stream.trim() : null;
    const gradeLabel = stream ? `Grade ${grade}${stream}` : `Grade ${grade}`;

        btn.disabled = true;
        window.spinner?.show(btn, "Loading...");

    try {
       // 1. Fetch current subjects for this specific allocation (optimized: fetch only this teacher)
      const res = await secureFetch(`${API_BASE}/users/subjects/allocations?teacherId=${teacherId}`);
      // The response.data will now contain only one teacher object (or an empty array if not found)
      const teacher = res.data && res.data.length > 0 ? res.data[0] : null;
      
      const alloc = teacher?.allocations.find(a => a.grade === grade && (a.stream || null) === stream);

      if (!alloc || !alloc.subjects || alloc.subjects.length === 0) {
        showToast("No subjects found for this allocation", "error");
        return;
      }

      // 2. Create and show selection modal
      const modal = document.createElement("div");
      modal.className = "confirm-overlay visible";
      modal.style.zIndex = "10005";
      modal.innerHTML = `
        <div class="confirm-box" style="max-width: 420px; text-align: left; border-radius: 16px; padding: 25px;">
          <h3 style="margin-top:0; color: #1e293b; font-size: 1.25rem; display: flex; align-items: center; gap: 10px;"><i class="fas fa-book-open" style="color: #2563eb;"></i> Manage Subjects</h3>
          <p style="font-size: 0.875rem; color: #64748b; margin-bottom: 20px; line-height: 1.5;">
            Select subjects to remove from <strong>${teacher.name}</strong> for <strong>${gradeLabel}</strong>.
          </p>
          <div style="max-height: 280px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 25px; background: #ffffff; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            ${alloc.subjects.map(sub => `
              <div class="subject-row" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;">
                <label for="chk_${sub}" style="font-size: 0.95rem; cursor: pointer; flex: 1; font-weight: 500; color: #334155;">${sub}</label>
                <input type="checkbox" class="sub-remove-check" value="${sub}" id="chk_${sub}" style="width: 18px; height: 18px; cursor: pointer; accent-color: #ef4444;">
              </div>
            `).join('')}
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="cancelSubRemove" class="btn secondary-btn" style="flex: 1;">Cancel</button>
            <button id="confirmSubRemove" class="btn danger-btn" style="flex: 1;">Remove Selected</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Add hover effects via JS to comply with CSP
      modal.querySelectorAll('.subject-row').forEach(row => {
        row.addEventListener('mouseenter', () => { row.style.background = '#f8fafc'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      });

      modal.querySelector("#cancelSubRemove").onclick = () => modal.remove();
      modal.querySelector("#confirmSubRemove").onclick = async () => {
        const selected = Array.from(modal.querySelectorAll(".sub-remove-check:checked")).map(c => c.value);
        if (selected.length === 0) {
          showToast("Please select at least one subject", "info");
          return;
        }

        const confirmBtn = modal.querySelector("#confirmSubRemove");
        window.spinner?.show(confirmBtn, "Removing...");

        try {
          const result = await secureFetch(`${API_BASE}/users/subjects/remove`, {
            method: "POST",
            body: JSON.stringify({ teacherId, grade, stream, subjects: selected })
          });

          if (result) {
            modal.remove();
            await loadSubjectAllocations(1, SUBJECT_ALLOC_LIMIT, true);
            showToast(`Successfully updated subjects for ${gradeLabel}`, "success");
          }
        } catch (err) {
          showToast(err.message, "error");
          window.spinner?.hide(confirmBtn);
        }
      };

    } catch (err) {
      console.error("[ERROR] Remove allocation error:", err);
      showToast("Error removing allocation: " + (err.message || "Unknown error"), "error");
       } finally {
      window.spinner?.hide(btn);
      btn.disabled = false;
    }
  }
});
//remove class allocation handler
  classAllocTableBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (btn && btn.dataset.action === "remove-class") {
      if (btn.disabled) return;
      const teacherId = btn.dataset.id;
      const ok = await showConfirm({ message: "Remove this class allocation?" });
      if (!ok) return;
      
      btn.disabled = true;
      window.spinner?.show(btn, "Removing...");
      try {
        const result = await secureFetch(`${API_BASE}/users/classes/remove`, { 
          method: "POST",
          body: JSON.stringify({ teacherId })
        });
        
        if (result) {
          await loadClassAllocations(1, CLASS_ALLOC_LIMIT, true);
          showToast("Class allocation removed", "success");
        }
      } catch (err) {
        console.error("Remove class allocation error:", err);
        showToast("Error removing class allocation", "error");
    } finally {
      window.spinner?.hide(btn);
      btn.disabled = false;
      }
    }
  });
// ---------------------------
// EDIT ENROLLMENT BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;
  if (!btn.classList.contains("btn-edit")) return;

  window.spinner?.show(btn, "Loading...");

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
    window.spinner?.hide(btn);
  }
});

// ---------------------------
// VIEW HISTORY BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;
  if (!btn.classList.contains("btn-history")) return;

  window.spinner?.show(btn, "Loading...");

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
    window.spinner?.hide(btn);
  }
});

// 🆕 Event delegation to capture manual action changes
promotionPreviewBody?.addEventListener("change", (e) => {
  if (e.target.classList.contains("promotion-action")) {
    const studentId = e.target.closest("tr").dataset.studentId;
    promoOverrides.set(studentId, e.target.value);
  }
});

  // ---------------------------
  // BULK DELETE STUDENTS LOGIC (🆕)
  // ---------------------------
  function populateBulkDeleteGradeOptions() {
    if (!bulkDeleteGradeSelect) return;
    const s = getSchoolConfig();
    if (!s) {
      bulkDeleteGradeSelect.innerHTML = '<option value="">-- Select Grade --</option>';
      return;
    }
    const grades = s.config.gradeOptions;
    bulkDeleteGradeSelect.innerHTML = '<option value="">-- Select Grade --</option>';
    grades.forEach(g => {
      const opt = document.createElement('option');
       const isPP = String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG";
      opt.value = isPP ? g : `Grade ${g}`;
      opt.textContent = isPP ? g : `Grade ${g}`;
      bulkDeleteGradeSelect.appendChild(opt);
    });
  }

  async function populateBulkDeleteStreamOptions(grade) {
    if (!bulkDeleteStreamSelect) return;
    bulkDeleteStreamSelect.innerHTML = '<option value="">All Streams</option>';
    if (!grade) return;

    let streams = streamsCache.get(grade);
    if (!streams) {
      try {
        streams = await secureFetch(`${API_BASE}/enrollments/unique-streams?grade=${encodeURIComponent(grade)}`);
        if (streams && Array.isArray(streams)) {
          streamsCache.set(grade, streams);
        }
      } catch (e) {
        console.error("Failed to load streams for bulk delete:", e);
      }
    }

    if (streams && Array.isArray(streams)) {
      streams.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Stream ${s}`;
        bulkDeleteStreamSelect.appendChild(opt);
      });
    }
  }

  function populateBulkDeleteYearOptions() {
    if (!bulkDeleteYearSelect) return;
    const currentYear = new Date().getFullYear();
    bulkDeleteYearSelect.innerHTML = '';
    for (let y = currentYear - 1; y <= currentYear + 100; y++) { // Range of 10 years
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      bulkDeleteYearSelect.appendChild(opt);
    }
  }

  openBulkDeleteModalBtn?.addEventListener("click", () => {
    populateBulkDeleteGradeOptions();
    populateBulkDeleteYearOptions();
    bulkDeleteStreamSelect.innerHTML = '<option value="">All Streams</option>'; // Reset streams
    
    // 🆕 Reset verification input
    const verifyInput = document.getElementById("bulkDeleteVerifyInput");
    if (verifyInput) {
      verifyInput.value = "";
      verifyInput.style.borderColor = "#fecaca";
    }

    bulkDeleteModal.classList.remove("hidden");
  });

  cancelBulkDeleteBtn?.addEventListener("click", () => {
    bulkDeleteModal.classList.add("hidden");
  });

  bulkDeleteGradeSelect?.addEventListener("change", (e) => {
    populateBulkDeleteStreamOptions(e.target.value);
  });

  confirmBulkDeleteBtn?.addEventListener("click", async () => {
    const grade = bulkDeleteGradeSelect.value;
    const stream = bulkDeleteStreamSelect.value || null;
    const academicYear = bulkDeleteYearSelect.value;
    const verifyInput = document.getElementById("bulkDeleteVerifyInput");
    const verifyText = verifyInput?.value?.trim();

    if (!grade || !academicYear) {
      showToast("Please select a Grade and Academic Year.", "error");
      return;
    }

    // 🆕 Check text verification before showing the confirmation modal
    if (verifyText !== "DELETE") {
      showToast("Verification failed: You must type 'DELETE' to proceed.", "error");
      if (verifyInput) {
        verifyInput.style.borderColor = "#ef4444";
        verifyInput.focus();
      }
      return;
    }

    // 🆕 Hide selection modal so the confirm overlay is clearly visible
    bulkDeleteModal.classList.add("hidden");

    const confirmed = await showConfirm({
      title: "PERMANENTLY DELETE LEARNERS?",
      message: `Are you absolutely sure you want to delete ALL learners in <strong>${grade}${stream ? ' Stream ' + stream : ''}</strong> for the <strong>${academicYear}</strong> academic year? This action is irreversible and will delete all their marks, payments, and enrollment history.`,
      confirmText: "YES, DELETE ALL",
      cancelText: "Cancel",
      confirmBtnClass: "danger-btn"
    });

    if (!confirmed) {
      bulkDeleteModal.classList.remove("hidden"); // Re-show the modal if the user cancels
      return;
    }

    window.spinner?.show(confirmBulkDeleteBtn, "Deleting...");

    try {
      const res = await secureFetch(`${API_BASE}/users/bulk-delete-students`, {
        method: "DELETE",
        body: JSON.stringify({ grade, stream, academicYear: Number(academicYear) })
      });
      if (res) { // Success path
        showToast(res.message, "success");
        bulkDeleteModal.classList.add("hidden");
        // Refresh relevant data on this page after deletion
        if (fromAcademicYearInput && fromAcademicYearInput.value.trim()) {
          loadPromotionPreview(1); // Refresh promotion preview only if a year is set
        }
        // 🆕 Clear search results to prevent displaying stale/deleted records
        if (studentSearchBody) studentSearchBody.innerHTML = "";
      } else { // secureFetch returned null, meaning an error was already handled and displayed (e.g., modal)
       
        // secureFetch already handled the error and showed a toast/modal.
        // We just ensure the modal is re-shown if the user cancelled the confirm dialog or an error occurred,
        // but only if the modal element actually exists.
        if (bulkDeleteModal) {
          bulkDeleteModal.classList.remove("hidden");
        }
      }
    } catch (err) {
      showToast(err.message || "Failed to delete students unexpectedly.", "error");
      if (bulkDeleteModal) { // Re-show modal on unexpected error, if it exists
        bulkDeleteModal.classList.remove("hidden");
      }
    } finally {
      window.spinner?.hide(confirmBulkDeleteBtn);
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

  window.spinner?.show(btn, "Loading...");

  try {
    const tr = btn.closest("tr");
    const studentId = tr?.dataset.studentId;
    const studentName = btn.dataset.studentName;
    const studentAdmission = btn.dataset.studentAdmission;
    const studentContact = btn.dataset.studentContact;
    const studentGender = btn.dataset.studentGender;
    const studentDob = btn.dataset.studentDob;

    if (!studentId) {
      showToast("Student ID missing", "error");
      return;
    }

    openEditProfileModal({ id: studentId, name: studentName, admission: studentAdmission, contact: studentContact, gender: studentGender, dateOfBirth: studentDob });
  } catch (err) {
    console.error("Edit profile error:", err);
    showToast(err.message || "Failed to open profile editor", "error");
  } finally {
    window.spinner?.hide(btn);
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
      streamsCache.clear(); // 🆕 Clear streams cache on refresh
      refreshBtn.textContent = "Refreshing... ⏳";
      refreshBtn.classList.add("refreshing");

      const errors = [];
      try {
        const results = await Promise.allSettled([
          loadTeacherOptions(true), // Force reload teachers
          loadSubjectAllocations(), 
          loadClassAllocations(1, CLASS_ALLOC_LIMIT, true),
          loadSchoolInfo(true), // Force reload school info
          fetchSmsHistorySummary(true) // 🆕 Force reload SMS stats
        ]);
        results.forEach((r, idx) => {
          if (r.status === "rejected") errors.push({ step: ["loadTeacherOptions", "loadSubjectAllocations", "loadClassAllocations", "loadSchoolInfo", "fetchSmsHistorySummary"][idx], error: r.reason });
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

  if (subjectAllocPrevBtn) {
    subjectAllocPrevBtn.addEventListener("click", async () => {
      if (subjectAllocPage > 1) {
        window.spinner?.show(subjectAllocPrevBtn, "Previous");
        await loadSubjectAllocations(subjectAllocPage - 1);
        window.spinner?.hide(subjectAllocPrevBtn);
      }
    });
  }

  if (subjectAllocNextBtn) {
    subjectAllocNextBtn.addEventListener("click", async () => {
      if (subjectAllocPage < subjectAllocTotalPages) {
        window.spinner?.show(subjectAllocNextBtn, "Next");
        await loadSubjectAllocations(subjectAllocPage + 1);
        window.spinner?.hide(subjectAllocNextBtn);
      }
    });
  }

  // ---------------------------
  // DYNAMIC GRADE & SUBJECT MULTI-SELECT
  // ---------------------------
  function toggleStreamSelectionUI(streamSelect, streamDisplay, hasStreams) {
    if (!streamSelect || !streamDisplay) return;

    const showDropdown = Array.isArray(hasStreams) && hasStreams.length > 0;
    streamSelect.style.display = showDropdown ? "" : "none";
    streamDisplay.style.display = showDropdown ? "none" : "flex";
    streamDisplay.textContent = showDropdown ? "" : "No stream";
  }

  // 🆕 Helper to populate stream dropdowns for allocation sections
  async function updateStreamDropdown(grade, elementId) {
    const streamSelect = document.getElementById(elementId);
    const streamDisplay = document.getElementById(`${elementId}Display`);
    if (!streamSelect) return;

    streamSelect.innerHTML = '<option value="">-- Select Stream --</option>';
    streamSelect.value = "";

    if (!grade) {
      toggleStreamSelectionUI(streamSelect, streamDisplay, []);
      return;
    }

    let streams = streamsCache.get(grade);
    if (!streams) {
      try {
        streams = await secureFetch(`${API_BASE}/enrollments/unique-streams?grade=${encodeURIComponent(grade)}`);
        if (streams && Array.isArray(streams)) {
          streamsCache.set(grade, streams);
        }
      } catch (e) {
        console.warn(`Failed to load streams for ${elementId}:`, e);
      }
    }

    const cleanedStreams = Array.isArray(streams)
      ? streams.filter((s) => {
          const normalized = String(s ?? "").trim();
          return normalized !== "" && normalized.toLowerCase() !== "null" && normalized.toLowerCase() !== "undefined";
        }).map((s) => String(s).trim())
      : [];

    cleanedStreams.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = `Stream ${s}`;
      streamSelect.appendChild(opt);
    });

    toggleStreamSelectionUI(streamSelect, streamDisplay, cleanedStreams);
  }

  // 🆕 Attach listeners to handle grade selection changes for streams
  gradesSelect?.addEventListener("change", () => {
    updateStreamDropdown(gradesSelect.value, "streamInput");
  });

  classGradeSelect?.addEventListener("change", () => {
    updateStreamDropdown(classGradeSelect.value, "classStreamInput");
  });

  if (gradesSelect?.value) {
    updateStreamDropdown(gradesSelect.value, "streamInput");
  }

  if (classGradeSelect?.value) {
    updateStreamDropdown(classGradeSelect.value, "classStreamInput");
  }

  if (gradeRangeSelect) {
    gradeRangeSelect.addEventListener("change", () => {
      populateGradeSelectionForRange(gradeRangeSelect.value);
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

  window.spinner?.show(studentSearchBtn, "Searching...");

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
          <button class="btn-edit-profile" data-student-id="${s.studentId}" data-student-name="${s.name}" data-student-admission="${s.admission}" data-student-grade="${s.grade}" data-student-contact="${s.contact || ''}" data-student-gender="${s.gender || ''}" data-student-dob="${s.dateOfBirth || ''}">👤 Edit Profile</button>
        </td>
      `;

      studentSearchBody.appendChild(tr);
    });
  } finally {
    studentSearchBtn.disabled = false;
    window.spinner?.hide(studentSearchBtn);
  }
});

// ---------------------------
// ANNOUNCEMENT FORM HANDLER (SMS Integration)
// ---------------------------
const announcementForm = document.getElementById("announcementForm");
if (announcementForm) {
  const annMessage = document.getElementById("announcementMessage");
  const charCounter = document.getElementById("charCounter");
  const smsWarning = document.getElementById("smsWarning");
  const sendAsSmsCheckbox = document.getElementById("sendAsSms");
  const submitBtn = document.getElementById("createAnnouncementBtn");
  const titleInput = document.getElementById("announcementTitle");
  const expiresInput = document.getElementById("announcementExpiresAt");
  const targetRoleSelect = document.getElementById("announcementTargetRole");
  const targetPageSelect = document.getElementById("announcementTargetPage");
  const targetGradeSelect = document.getElementById("announcementTargetGrade");
  const targetStreamSelect = document.getElementById("announcementTargetStream");
  const announcementGradeGroup = document.getElementById("announcementGradeGroup");
  const announcementStreamGroup = document.getElementById("announcementStreamGroup");

  // New DOM elements for progress bar
  let smsAbortController = null;
  const smsProgressBarContainer = document.getElementById("smsProgressBarContainer");
  const smsProgressBar = document.getElementById("smsProgressBar");

  // 🆕 Update placeholders as requested
  if (titleInput) titleInput.placeholder = "For announcements only";
  if (annMessage) annMessage.placeholder = "Type your message";

  // 🆕 Helper to populate the grade dropdown for SMS targeting
  const populateTargetGrades = () => {
    if (!targetGradeSelect) return;
    const s = getSchoolConfig();
    if (!s) {
      targetGradeSelect.innerHTML = '<option value="all">All Grades</option>';
      return;
    }
    targetGradeSelect.innerHTML = '<option value="all">All Grades</option>';
    const grades = s.config.gradeOptions;
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = `Grade ${g}`;
      opt.textContent = `Grade ${g}`;
      targetGradeSelect.appendChild(opt);
    });
  };

  const updateGradeFilterVisibility = () => {
    if (!targetGradeSelect) return;
    const isSms = sendAsSmsCheckbox.checked;
    const isParent = targetRoleSelect?.value === 'student';

    if (announcementGradeGroup) {
      announcementGradeGroup.style.display = isParent ? "block" : "none";
    }
    if (isParent && targetGradeSelect.options.length <= 1) populateTargetGrades();
    
    // Refresh stream visibility based on current selections
    updateStreamFilterVisibility();
  };

  const updateStreamFilterVisibility = () => {
    if (!announcementStreamGroup) return;
    const isParent = targetRoleSelect?.value === 'student';
    const selectedGrade = targetGradeSelect?.value;
    
    const showStream = isParent && selectedGrade && selectedGrade !== 'all';
    announcementStreamGroup.style.display = showStream ? "block" : "none";
    
    if (showStream) populateTargetStreams(selectedGrade);
  };

  const populateTargetStreams = async (grade) => {
    if (!targetStreamSelect) return;
    targetStreamSelect.innerHTML = '<option value="all">All Streams</option>';
    try {
      const res = await secureFetch(`${API_BASE}/enrollments/unique-streams?grade=${encodeURIComponent(grade)}`);
      if (res && Array.isArray(res)) {
        res.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = `Stream ${s}`;
          targetStreamSelect.appendChild(opt);
        });
      }
    } catch (e) { console.error("Failed to load streams for announcement targeting:", e); }
  };

  if (annMessage) {
    annMessage.addEventListener("input", () => {
      const len = annMessage.value.length;
      if (charCounter) {
        charCounter.textContent = `${len} / 160 characters (${Math.ceil(len / 160) || 0} SMS Credit${len > 160 ? 's' : ''})`;
        charCounter.style.color = len > 160 ? "#ef4444" : "#667eea";
      }
      
      if (len > 160 && sendAsSmsCheckbox?.checked) {
        if (smsWarning) smsWarning.style.display = "block";
        if (submitBtn) submitBtn.disabled = true;
      } else {
        if (smsWarning) smsWarning.style.display = "none";
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (sendAsSmsCheckbox) {
    sendAsSmsCheckbox.addEventListener("change", () => {
      const len = annMessage ? annMessage.value.length : 0;
      if (len > 160 && sendAsSmsCheckbox.checked) {
        if (smsWarning) smsWarning.style.display = "block";
        if (submitBtn) submitBtn.disabled = true;
      } else {
        if (smsWarning) smsWarning.style.display = "none";
        if (submitBtn) submitBtn.disabled = false;
      }
      
      if (submitBtn) {
        submitBtn.textContent = sendAsSmsCheckbox.checked ? "Send SMS" : "Post Announcement";
      }

      // 🆕 Toggle visibility of fields not relevant to SMS
      if (titleInput) {
        const titleGroup = titleInput.closest(".form-group") || titleInput.parentElement;
        titleGroup.style.display = sendAsSmsCheckbox.checked ? "none" : "block";
        titleInput.required = !sendAsSmsCheckbox.checked;
      }
      if (expiresInput) {
        const expiresGroup = expiresInput.closest(".form-group") || expiresInput.parentElement;
        expiresGroup.style.display = sendAsSmsCheckbox.checked ? "none" : "block";
      }
      if (targetPageSelect) {
        const pageGroup = targetPageSelect.closest(".form-group") || targetPageSelect.parentElement;
        pageGroup.style.display = sendAsSmsCheckbox.checked ? "none" : "block";
      }

      updateGradeFilterVisibility();
    });
  }

  if (targetRoleSelect) {
    targetRoleSelect.addEventListener("change", updateGradeFilterVisibility);
  }

  if (targetGradeSelect) {
    targetGradeSelect.addEventListener("change", updateStreamFilterVisibility);
  }

  announcementForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("announcementTitle").value.trim();
    const message = annMessage.value.trim();
    const targetRole = targetRoleSelect?.value || document.getElementById("announcementTargetRole")?.value;
    const targetGrade = targetGradeSelect?.value || 'all';
    const targetStream = targetStreamSelect?.value || 'all';
    const targetPage = targetPageSelect?.value || 'all';
    const expiresAt = document.getElementById("announcementExpiresAt").value;
    const sendAsSms = sendAsSmsCheckbox.checked;

    if (sendAsSms && message.length > 160) {
      showToast("SMS blocked: Message exceeds 160 characters.", "error");
      return;
    }

    // Map technical roles to professional audience labels for SMS
    const roleLabels = {
      all: "parents and teachers",
      teacher: "teachers",
      student: "parents"
    };
    let audienceLabel = roleLabels[targetRole] || "recipients";
    if (sendAsSms && targetRole === 'student' && targetGrade !== 'all') {
      audienceLabel = `${targetGrade} parents`;
    }
    if (sendAsSms && targetRole === 'student' && targetStream !== 'all') {
      audienceLabel = `${targetGrade} Stream ${targetStream} parents`;
    }

    const ok = await showConfirm({
      title: sendAsSms ? "Confirm SMS Broadcast" : "Confirm Announcement",
      message: sendAsSms
        ? `Broadcast this message via SMS to ${audienceLabel}? This will use SMS credits.`
        : "Post this announcement to the dashboard?"
    });

    if (!ok) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Processing...';

    // Create new abort controller for this session
    smsAbortController = new AbortController();

    // --- Progress Bar Logic for SMS ---
    let progressInterval;
    if (sendAsSms && smsProgressBarContainer && smsProgressBar) {
      smsProgressBarContainer.style.display = "block";
      smsProgressBar.style.width = "5%";
      smsProgressBar.textContent = "5%";
      let currentProgress = 5;
      const increment = 5; // Increment by 5%
      const maxProgress = 95; // Stop at 95% before actual completion
      const intervalTime = 500; // Update every 500ms

      progressInterval = setInterval(() => {
        if (currentProgress < maxProgress) {
          currentProgress = Math.min(currentProgress + increment, maxProgress);
          smsProgressBar.style.width = `${currentProgress}%`;
          smsProgressBar.textContent = `${currentProgress}%`;
        }
      }, intervalTime);
    }

    const res = await secureFetch(`${API_BASE}/announcements`, {
      method: "POST",
      body: JSON.stringify({ title, message, targetRole, expiresAt, sendAsSms, targetGrade, targetStream, targetPage }),
      signal: smsAbortController.signal
    });

    if (res) {
      showToast(res.message || (sendAsSms ? "SMS Broadcast initiated!" : "Announcement posted successfully!"), "success");
      announcementForm.reset();
      if (charCounter) charCounter.textContent = "0 / 160 characters (0 SMS Credits)";
      // 🆕 Refresh school info to update SMS balance badge if SMS was sent
      if (sendAsSms) loadSchoolInfo(true);
    } else if (sendAsSms) {
      showToast("Broadcast operation stopped.", "info");
    }
    submitBtn.disabled = false;
    submitBtn.innerHTML = sendAsSms ? "Send SMS" : "Post Announcement";

    // --- Finalize Progress Bar ---
    if (sendAsSms && smsProgressBarContainer && smsProgressBar) {
      clearInterval(progressInterval);
      smsProgressBar.style.width = "100%";
      smsProgressBar.textContent = "100%";
      setTimeout(() => {
        smsProgressBarContainer.style.display = "none";
        smsProgressBar.style.width = "0%"; // Reset for next time
        smsProgressBar.textContent = "";
      }, 1000); // Hide after 1 second
    }
  });

  document.getElementById("cancelSmsBtn")?.addEventListener("click", async () => {
    if (smsAbortController) {
      const ok = await showConfirm({
        title: "Cancel SMS Broadcast",
        message: "Are you sure you want to stop sending the remaining SMS messages? This action cannot be reversed."
      });
      if (ok) {
        smsAbortController.abort();
      }
    }
  });
}

})();
