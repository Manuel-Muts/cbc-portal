document.addEventListener("DOMContentLoaded", () => {
  
  // ---------------------------
  // CONFIG + GLOBALS
  // ---------------------------
  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  
  const API_BASE = config.api.baseURL;

  let allMarksEntered = new Map(); // Stores marks for all students in the current context across pages
  let submittedMarks = []; // in-memory marks list
  let editingMarkId = null;
  let teacher = null;
  let currentTermLocked = false; // Global variable to store term lock status
  let teacherSubmittedMarkEditsAllowed = true; // Controls whether teachers may edit submitted marks
  const termLockMessageEl = document.getElementById("termLockMessage"); // Element to display lock message
  let isSingleEditMode = false;
  let schoolInfo = null; // Global school info cache

  // ---------------------------
  // CACHES
  // ---------------------------
  // Teacher page does not cache school name to avoid stale school type/name bugs on login.
  // Always fetch fresh school info for the current session.

  // Pagination for individual student tables inside Submitted Marks
  const STUDENTS_PER_TABLE_PAGE = 10;
  const subTablePageMap = new Map();
  const subSearchMap = new Map(); // Track search terms for each group
  let activeSearchInfo = { key: null, cursor: 0 }; // Persist focus during re-renders
  const openAccordions = new Set();
  // ---------------------------
  // AUTH FETCH HELPER (Prevent Bearer null & handle 401)
  // ---------------------------
  async function fetchWithAuth(url, options = {}) {
    const token = window.authService?.getToken();
    if (!token) return authService.redirectToLogin();

    const headers = {
      "Authorization": `Bearer ${token}`,
      ...options.headers
    };

    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      if (res.status === 401) return authService.redirectToLogin();
      
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 403) {
        throw new Error(errorData.message || "Access denied. You do not have permission to perform this action.");
      }
      throw new Error(errorData.message || `Request failed (Status: ${res.status})`);
    }
    return res;
  }

  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const subjectAllocationSelect = document.getElementById("subjectAllocationSelect");
  const marksTableContainer = document.getElementById("marksTableContainer");
  const marksTermSelect = document.getElementById("marksTermSelect");
  const marksAssessmentSelect = document.getElementById("marksAssessmentSelect");
  const marksYearInput = document.getElementById("marksYearInput");
  const loadStudentsBtn = document.getElementById("loadStudentsBtn");
  const marksEntryTable = document.getElementById("marksEntryTable");
  const marksEntryTableBody = document.getElementById("marksEntryTableBody");
  const submitAllMarksBtn = document.getElementById("submitAllMarksBtn");
  const marksColumnHeader = document.getElementById("marksColumnHeader");
  const teacherSubnavButtons = document.querySelectorAll(".subnav-btn");
  
  // Draft & Copy functionality
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const loadDraftBtn = document.getElementById("loadDraftBtn");
  const draftStatus = document.getElementById("draftStatus");
  const draftTime = document.getElementById("draftTime");
  
  const assessmentSelect = document.getElementById("assessmentSelect");
  const logoutBtn = document.getElementById("logoutBtn");
  const teacherProfileTrigger = document.getElementById("teacherProfileTrigger");
  const teacherProfileDropdown = document.getElementById("teacherProfileDropdown");
  const teacherLogoutBtn = document.getElementById("teacherLogoutBtn");
  const teacherProfileName = document.getElementById("teacherProfileName");
  const teacherProfileRole = document.getElementById("teacherProfileRole");
  const teacherProfileNameDetail = document.getElementById("teacherProfileNameDetail");
  const teacherProfileEmailDetail = document.getElementById("teacherProfileEmailDetail");
  const teacherProfileAvatar = document.getElementById("teacherProfileAvatar");
  const teacherProfileAvatarLarge = document.getElementById("teacherProfileAvatarLarge");
  const headerRefreshBtn = document.getElementById("headerRefreshBtn");
  const digitalSignatureContent = document.getElementById("digitalSignatureContent");
  const submittedMarksContainer = document.getElementById("submittedMarksContainer");
  const submittedMarksStatusMessage = document.getElementById("submittedMarksStatusMessage");
  const myClassTabBtn = document.getElementById("myClassTabBtn");

  // Global variables for submitted marks pagination
  let submittedMarksCurrentPage = 1;
  const SUBMITTED_MARKS_LIMIT = 10; // 10 groups (accordions) per page
  let submittedMarksTotalPages = 1;
  // To store the keys of all groups for pagination, populated after fetching all marks
  let submittedMarksGroupedKeys = [];

  function setupTeacherProfileMenu() {
    if (!teacherProfileTrigger || !teacherProfileDropdown) return;

    const profileMenu = teacherProfileTrigger.closest(".profile-menu");

    teacherProfileTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = teacherProfileDropdown.classList.contains("show");
      teacherProfileDropdown.classList.toggle("show", !isOpen);
      teacherProfileTrigger.setAttribute("aria-expanded", String(!isOpen));
    });

    teacherProfileDropdown.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (!profileMenu || !profileMenu.contains(event.target)) {
        teacherProfileDropdown.classList.remove("show");
        teacherProfileTrigger.setAttribute("aria-expanded", "false");
      }
    });
  }
 
  // ---------------------------
  // TAB LOGIC
  // ---------------------------
  function setupTabs() {
    const subnavBtns = document.querySelectorAll(".subnav-btn");
    const tabPanes = document.querySelectorAll("main > .tab-pane");

    const activateTab = (btn) => {
      const target = btn.dataset.tab;
      if (!target) return;
      subnavBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const activePane = document.getElementById(target);
      if (activePane) activePane.classList.add("active");

      if (target === "myClass") {
        const trigger = window.generateClassTeacherReport;
        if (typeof trigger === "function") {
          setTimeout(() => trigger(), 120);
        }
      }
    };

    subnavBtns.forEach(btn => {
      btn.addEventListener("click", () => activateTab(btn));
    });
  }

  // ---------------------------
  // NEW: CHECK TERM LOCK STATUS
  // ---------------------------
  async function checkTermLockStatus() {
    const term = marksTermSelect.value;
    const year = marksYearInput.value;

    if (!term || !year) {
      currentTermLocked = false;
      teacherSubmittedMarkEditsAllowed = true;
      updateUIForTermLock();
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/settings/term-lock?year=${year}&term=${term}`);

      if (!res.ok) throw new Error("Failed to fetch term lock status");
      const data = await res.json();
      currentTermLocked = data.isLocked;
      teacherSubmittedMarkEditsAllowed = data.allowTeacherSubmittedMarkEdits === true;
      updateUIForTermLock();
    } catch (err) {
      console.error("Error checking term lock status:", err);
      currentTermLocked = false; // Default to unlocked on error
      teacherSubmittedMarkEditsAllowed = true;
      updateUIForTermLock();
      updateSubmittedMarksEditStatus();
      showToast("Error checking term lock status. Please refresh.", "error");
    }
  }

  // ---------------------------
  // NEW: UPDATE SUBMITTED MARKS EDIT STATUS MESSAGE
  // ---------------------------
  function updateSubmittedMarksEditStatus() {
    if (!submittedMarksStatusMessage) return;

    const canEdit = teacherSubmittedMarkEditsAllowed && !currentTermLocked;
    submittedMarksStatusMessage.textContent = canEdit ? "Edits enabled" : "Edits disabled";
    submittedMarksStatusMessage.style.display = "flex";
    submittedMarksStatusMessage.style.alignItems = "center";
    submittedMarksStatusMessage.style.justifyContent = "center";
    submittedMarksStatusMessage.style.fontWeight = "700";
    submittedMarksStatusMessage.style.color = canEdit ? "#115e59" : "#9b1c1c";
    submittedMarksStatusMessage.style.background = canEdit ? "#ecfdf5" : "#fee2e2";
    submittedMarksStatusMessage.style.border = canEdit ? "1px solid #34d399" : "1px solid #f87171";
    submittedMarksStatusMessage.style.borderRadius = "10px";
    submittedMarksStatusMessage.style.padding = "12px 14px";
  }

  // ---------------------------
  // NEW: UPDATE UI BASED ON TERM LOCK STATUS
  // ---------------------------
  function updateUIForTermLock() {
    const inputs = marksEntryTableBody?.querySelectorAll("input") || [];
    const buttons = [submitAllMarksBtn, saveDraftBtn, loadStudentsBtn]; // Also disable save draft and load students

    inputs.forEach(input => {
      // Only disable if not a readonly input (like final score)
      if (!input.readOnly) input.disabled = currentTermLocked;
    });

    buttons.forEach(btn => {
      if (btn) btn.disabled = currentTermLocked;
    });

    if (termLockMessageEl) {
      if (currentTermLocked) {
        termLockMessageEl.innerHTML = ` 
          <div style="font-size: 1.3rem; background: #feebc8; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0;">🔒</div> 
          <div style="flex-grow: 1;"> 
            <div style="font-size: 0.9rem; font-weight: 700; color: #7b341e;">Viewing Finalized Term</div> 
            <div style="font-size: 0.72rem; line-height: 1.4; color: #975a16; margin-top: 1px;"> 
              This period is officially finalized. Marks are in <strong>read-only mode</strong> to ensure record integrity. New entries or changes cannot be saved. 
            </div> 
          </div>
        `;
        termLockMessageEl.style.display = "flex";
        marksTableContainer?.classList.add("locked-state-overlay");
      } else {
        termLockMessageEl.style.display = "none";
        marksTableContainer?.classList.remove("locked-state-overlay");
      }
    }
    updateSubmittedMarksEditStatus();
  }

  // ---------------------------
  // SET DEFAULT YEAR TO CURRENT YEAR (AUTO & READ-ONLY)
  // ---------------------------
  const currentYear = new Date().getFullYear();
  if (marksYearInput) {
    marksYearInput.value = currentYear;
    // Ensure it always stays current year
    marksYearInput.addEventListener("change", () => {
      marksYearInput.value = currentYear;
    });
  }

  // ---------------------------
  // 🆕 SET DEFAULT VALUES FOR TERM AND ASSESSMENT
  // ---------------------------
  if (marksTermSelect) {
    const month = new Date().getMonth() + 1; // 1-12
    let currentTerm = "1";
    if (month >= 5 && month <= 8) currentTerm = "2";
    else if (month >= 9) currentTerm = "3";
    marksTermSelect.value = currentTerm;
    marksTermSelect.disabled = true; // Make term read-only (current term only)
  }

  // 🆕 Reset table when context changes to prevent data pollution across terms/assessments
  [marksAssessmentSelect, marksYearInput].forEach(el => {
    el?.addEventListener("change", () => {
      if (marksEntryTableBody && marksEntryTableBody.innerHTML !== "") {
        resetMarksTable();
      }
      // 🆕 Re-check lock status when year changes
      if (el === marksYearInput) {
        checkTermLockStatus();
      }
    });
  });

  // ---------------------------
  // NEW: STORE TEACHER ALLOCATIONS & STUDENTS
  // ---------------------------
  let teacherAllocations = [];
  let selectedAllocationData = null;
  let selectedSubject = null; // 🆕 Store selected subject
  let loadedStudents = [];
  let currentStudentPage = 1;
  let studentsPaginationLoadingButton = null;
  let isLoadingStudents = false;
  const STUDENTS_PER_PAGE = 15;

  setupTeacherProfileMenu();

  // ---------------------------
  // AUTHENTICATION
  // ---------------------------
  async function loadTeacherProfile() {
    teacher = await authService.getUserProfile(["teacher", "classteacher"]);
    if (!teacher) return;

    window.currentTeacher = teacher;
    updateTeacherNameUI();

    if (!teacher.schoolId) {
        console.error("Teacher profile missing schoolId:", teacher);
        return authService.redirectToLogin();
      }
  }

    function updateTeacherNameUI() {
    const isDean = Array.isArray(teacher.roles)
      ? teacher.roles.includes("dean")
      : (teacher.role === "dean" || teacher.role === "DeAn" || teacher.isDean);

    if (headerRefreshBtn) {
      headerRefreshBtn.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        btn.style.transform = "rotate(360deg)";
        
        setTimeout(() => {
          // Clear all caches
          localStorage.removeItem("teacher_allocations_cache");
          localStorage.removeItem("user_profile_cache");
          // Removed legacy teacher school cache cleanup; no frontend school-info cache used
          localStorage.removeItem("teacher_marks_cache");
          localStorage.removeItem("teacher_materials_cache");
          // 🆕 Clear new two-tier school cache
          clearSchoolInfoCache();
          window.location.reload();
        }, 500);
      });
    }

    const displayName = (teacher.name || teacher.fullName || teacher.username || "Teacher").toString().trim();
    const roleLabel = Array.isArray(teacher.roles) ? teacher.roles[0] : (teacher.role || "Teacher");
    const labelText = String(roleLabel || "Teacher").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const initial = displayName.charAt(0).toUpperCase() || "T";

    if (teacherProfileName) teacherProfileName.textContent = displayName || "Teacher";
    if (teacherProfileRole) teacherProfileRole.textContent = labelText;
    if (teacherProfileNameDetail) teacherProfileNameDetail.textContent = displayName || "Teacher";
    if (teacherProfileEmailDetail) teacherProfileEmailDetail.textContent = teacher.email || "teacher@example.com";
    if (teacherProfileAvatar) teacherProfileAvatar.textContent = initial;
    if (teacherProfileAvatarLarge) teacherProfileAvatarLarge.textContent = initial;

    const deanDashboardBtn = document.getElementById("deanDashboardBtn");
    if (deanDashboardBtn) {
      deanDashboardBtn.style.display = isDean ? "inline-flex" : "none";
    }

    const isClassTeacher = Boolean(
      teacher?.isClassTeacher ||
      teacher?.role === "classteacher" ||
      teacher?.role === "Class Teacher" ||
      (Array.isArray(teacher?.roles) && teacher.roles.includes("classteacher"))
    );
    const isTeacher = Boolean(
      teacher?.role === "teacher" ||
      (Array.isArray(teacher?.roles) && teacher.roles.includes("teacher")) ||
      teacher?.isDean === true
    );

    if (myClassTabBtn) {
      myClassTabBtn.style.display = (isClassTeacher || isTeacher) ? "inline-flex" : "none";
    }

    const digitalSignatureTab = document.querySelector(".subnav-btn[data-tab='digitalSignature']");
    if (digitalSignatureTab) {
      digitalSignatureTab.style.display = isClassTeacher ? "inline-flex" : "none";
    }

    if (digitalSignatureContent && teacher && isClassTeacher) {
      renderSignatureUI(teacher);
    }

    if (teacherLogoutBtn) {
      teacherLogoutBtn.addEventListener("click", async () => {
        const confirmed = await window.cbcUtils.showConfirmToast("Are you sure you want to log out of the Teacher's Panel?");
        if (confirmed) {
          authService.logout();
        }
      });
    }
  }

  function renderSignatureUI(user) {
    const container = digitalSignatureContent || document.getElementById("allocationsContainer");
    const isTeacher = Boolean(
      user?.role === "teacher" ||
      (Array.isArray(user?.roles) && user.roles.includes("teacher")) ||
      user?.isDean === true
    );
    if (!container || !user || (!user.isClassTeacher && !isTeacher)) return;

    // Check if signature UI already exists
    if (document.getElementById("signatureUploadContainer")) return;

    const sigHtml = `
      <div id="signatureUploadContainer" class="signature-card">
        <p class="helper-text">DIGITAL SIGNATURE</p>
        <div id="signaturePreview" class="sig-preview-box">
          ${user.signatureUrl ? 
            `<img src="${user.signatureUrl}" style="max-height: 225px;">` : 
            `<span style="font-size: 0.59rem; color: #a0aec0; font-style: italic;">No signature set</span>`
          }
        </div>
        
        <input type="file" id="signatureUploadInput" accept="image/*" style="display:none">
        <button type="button" id="triggerSignatureUpload" class="btn secondary-btn" style="padding: 3px 10px; font-size: 0.55rem;">
          ${user.signatureUrl ? 'Change Signature' : 'Upload Signature'}
        </button>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', sigHtml);


    // Add listener for the button to trigger input click (Fixes CSP script-src-attr violation)
    document.getElementById('triggerSignatureUpload')?.addEventListener('click', () => {
        document.getElementById('signatureUploadInput')?.click();
    });

    document.getElementById('signatureUploadInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const token = authService.getToken();
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            return showToast("Signature image must be under 2MB", "error");
        }

        showToast("Uploading signature...", "info");
        
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetchWithAuth(`${API_BASE}/materials/upload-raw`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Upload failed");

            // Save the Cloudinary URL to the user profile
            await fetchWithAuth(`${API_BASE}/users/profile/signature`, {
                method: 'PUT',
                body: JSON.stringify({ signatureUrl: data.url, signaturePublicId: data.public_id })
            });

            // Clear cache so the new signature is fetched on reload
            localStorage.removeItem("user_profile_cache");
            showToast("✅ Signature updated successfully!", "success");
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            showToast(err.message, "error");
        }
    });
  }

  // ---------------------------
  // 🆕 Cache helper functions (matches admin.js)
  const readCache = (key, duration) => {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    try {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < duration) return data;
    } catch (e) {
      console.warn(`Cache read error for ${key}:`, e);
    }
    localStorage.removeItem(key);
    return null;
  };

  const clearSchoolInfoCache = () => {
    // Removed legacy teacher school cache cleanup; no frontend school-info cache used
  };

  // 🆕 Get fallback school name from teacher profile
  const getFallbackSchoolName = () => {
    if (!teacher) return null;
    const fallbackName = teacher.schoolName || teacher.school?.name || teacher.school?.schoolName || null;
    return String(fallbackName || "").trim() || null;
  };

  // 🆕 FETCH SCHOOL INFO without any frontend school name cache
  const resolveSchoolNameFromResponse = (data) => {
    if (!data || typeof data !== 'object') return null;
    return String(
      data.name ||
      data.schoolName ||
      data.school?.name ||
      data.school?.schoolName ||
      ""
    ).trim() || null;
  };

  async function loadSchoolName() {
    const token = authService.getToken();
    if (!token) return;

    const fallbackName = getFallbackSchoolName();
    if (fallbackName) {
      updateSchoolNameUI({ name: fallbackName });
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/my-school?fields=name`);
      if (!res || typeof res.json !== "function") {
        console.warn("School info fetch skipped because auth redirect occurred or response is invalid");
        return;
      }

      const data = await res.json().catch(() => null);
      const schoolName = resolveSchoolNameFromResponse(data);

      if (!schoolName) {
        console.warn("School info fetch warning: no school name in API response", data);
        if (fallbackName) {
          schoolInfo = { ...schoolInfo, name: fallbackName };
          window.currentSchool = schoolInfo;
          updateSchoolNameUI(schoolInfo);
          updateTeacherNameUI();
          return;
        }

        schoolInfo = { ...schoolInfo, name: null };
        window.currentSchool = schoolInfo;
        updateSchoolNameUI(schoolInfo);
        updateTeacherNameUI();
        return;
      }

      const freshSchoolInfo = { name: schoolName };
      schoolInfo = freshSchoolInfo;
      window.currentSchool = schoolInfo;
      updateSchoolNameUI(schoolInfo);
      updateTeacherNameUI();
    } catch (err) {
      console.error("School info fetch error:", err);

      if (fallbackName) {
        schoolInfo = { ...schoolInfo, name: fallbackName };
        window.currentSchool = schoolInfo;
        updateSchoolNameUI(schoolInfo);
        updateTeacherNameUI();
      }
    }
  }

  // 🆕 Improved school name UI update with robust error handling
  function updateSchoolNameUI(school) {
    const schoolNameEl = document.getElementById("schoolName");
    if (!schoolNameEl) return;

    const displayName = String(school?.name || "").trim();
    if (displayName) {
      schoolNameEl.textContent = displayName.toUpperCase();
      schoolNameEl.style.color = "#ffffff";
      schoolNameEl.style.fontWeight = "600";
    } else {
      const fallbackName = getFallbackSchoolName();
      schoolNameEl.textContent = (fallbackName || "SCHOOL").toUpperCase();
      schoolNameEl.style.color = "#bfdbfe";
      schoolNameEl.style.fontWeight = "600";
    }
  }

  // ---------------------------
  // LOAD TEACHER ALLOCATIONS (🆕)
  // ---------------------------
  async function loadTeacherAllocations(forceRefresh = false) {
    const CACHE_KEY = "teacher_allocations_cache";
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            processAllocationsData(data);
            return;
          }
        } catch (e) { console.warn("Cache read error:", e); }
      }
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/users/subjects/my-allocations`);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ API Error:", errorData);
        throw new Error(`Failed to fetch allocations (Status: ${res.status})`);
      }
      
      const data = await res.json();
      
      // Cache the result
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: data
      }));

      processAllocationsData(data);
    } catch (err) {
      console.error("❌ Load allocations error:", err);
      const container = document.getElementById("allocationsContainer");
      if (container) {
        let errorEl = document.getElementById("allocationsErrorDisplay");
        if (!errorEl) {
            errorEl = document.createElement("div");
            errorEl.id = "allocationsErrorDisplay";
            container.prepend(errorEl);
        }
        errorEl.innerHTML = `<p style="color: red;">❌ Failed to load allocations: ${err.message}</p>`;
      }
    }
  }

  function processAllocationsData(data) {
    if (data.subjectAllocations) {
      // 🆕 Normalize subjects: Map subdivisions to parent subjects for mark entry
      // Exclude senior PE from mark entry because it is taught but not graded.
      teacherAllocations = data.subjectAllocations.map(alloc => {
        const subjects = alloc.subjects || [];
        const gradeNumber = getGradeNumberFromValue(alloc.grade);
        const normalizedSubjects = [...new Set(subjects.map(s => 
          window.SUBJECT_DATA?.getMarkEntrySubject ? window.SUBJECT_DATA.getMarkEntrySubject(s) : s
        ))].filter(subjectName => {
          if (!subjectName) return false;
          return !window.SUBJECT_DATA?.isSeniorNonGradedMarkSubject?.(subjectName, alloc.grade);
        });
        
        return { ...alloc, subjects: normalizedSubjects };
      });

      populateSubjectAllocations(teacherAllocations);
    } else {
      console.warn("⚠️ No subjectAllocations in response");
    }
  }

  // ---------------------------
  // ASSESSMENT SELECT POPULATE
  // ---------------------------
  (function populateAssessments() {
    const selectElements = [assessmentSelect, marksAssessmentSelect].filter(el => el);
    const mapping = window.ASSESSMENT_MAPPING || {};

    selectElements.forEach(select => {
      select.innerHTML = '<option value="">-- Select Assessment --</option>';
      Object.entries(mapping).forEach(([value, label]) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
      });
    });
  })();

  // ---------------------------
  // NEW: POPULATE SUBJECT/CLASS ALLOCATIONS DROPDOWN
  // ---------------------------
  async function populateSubjectAllocations(allocations) {
    if (!subjectAllocationSelect) return;
    subjectAllocationSelect.innerHTML = '<option value="">-- Select Subject & Class --</option>';
    
    // 🆕 Create a separate option for EACH subject in each class
    allocations.forEach((alloc, classIndex) => {
  const subjects = alloc.subjects || [];

  // ✅ If ONLY ONE subject → add once (no unnecessary looping confusion)
  if (subjects.length === 1) {
    const subject = subjects[0];

    const opt = document.createElement("option");
    opt.value = `${classIndex}_0`;
    opt.textContent = `${alloc.classLabel}: ${subject}`;

    opt.dataset.classIndex = classIndex;
    opt.dataset.subjectIndex = 0;
    opt.dataset.classLabel = alloc.classLabel;
    opt.dataset.subject = subject;
    opt.dataset.grade = alloc.grade; // 🆕 Add grade to dataset
    opt.dataset.stream = alloc.stream || ''; // 🆕 Add stream to dataset

    subjectAllocationSelect.appendChild(opt);
  }

  // ✅ If MULTIPLE subjects → normal loop
  else {
    subjects.forEach((subject, subjectIndex) => {
      const opt = document.createElement("option");
      opt.value = `${classIndex}_${subjectIndex}`;
      opt.textContent = `${alloc.classLabel}: ${subject}`;

      opt.dataset.classIndex = classIndex;
      opt.dataset.subjectIndex = subjectIndex;
      opt.dataset.classLabel = alloc.classLabel;
      opt.dataset.subject = subject;
      opt.dataset.grade = alloc.grade; // 🆕 Add grade to dataset
      opt.dataset.stream = alloc.stream || ''; // 🆕 Add stream to dataset

      subjectAllocationSelect.appendChild(opt);
    });
  }
});

    // 🆕 Auto-select the first allocation if available
    if (allocations.length > 0 && allocations[0].subjects.length > 0) {
      subjectAllocationSelect.value = "0_0"; // First class, first subject
      selectedAllocationData = allocations[0];
      selectedSubject = allocations[0].subjects[0];
      if (marksTableContainer) marksTableContainer.style.display = "block";
      checkForExistingDraft?.();
    }
  }

  // ---------------------------
  // NEW: SUBJECT SELECTION CHANGED
  // ---------------------------
  if (subjectAllocationSelect) {
    subjectAllocationSelect.addEventListener("change", () => {
      const optionKey = subjectAllocationSelect.value;
      if (optionKey === "") {
        if (marksTableContainer) marksTableContainer.style.display = "none";
        selectedAllocationData = null;
        selectedSubject = null;
        resetMarksTable();
        if (loadDraftBtn) loadDraftBtn.style.display = "none";
        return;
      }
      if (subjectAllocationSelect.options.length === 2) {
       subjectAllocationSelect.selectedIndex = 1;
      subjectAllocationSelect.disabled = true;
      }
      // 🆕 Parse the option key to get class and subject indices
      const [classIndex, subjectIndex] = optionKey.split("_").map(Number);
      const selectedOption = subjectAllocationSelect.options[subjectAllocationSelect.selectedIndex];
      
      selectedAllocationData = teacherAllocations[classIndex];
      selectedSubject = selectedOption.dataset.subject; // 🆕 Get selected subject
      
      allMarksEntered = new Map(); // Clear marks when subject/class changes
      
      resetMarksTable();
      if (marksTableContainer) marksTableContainer.style.display = "block";
      checkForExistingDraft();
    });
  }

  function normalizeSubjectName(subjectName) {
    return String(subjectName || "").trim().toLowerCase();
  }


  function getGradeNumberFromValue(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function isSeniorElectiveSubject(subjectName, classLabel) {
    const subject = String(subjectName || "").trim();
    if (!subject) return false;

    const gradeNumber = getGradeNumberFromValue(classLabel);
    if (!gradeNumber || gradeNumber < 10 || gradeNumber > 12) return false;

    const subjectData = window.SUBJECT_DATA || {};
    const normalizedSubject = normalizeSubjectName(subject);
    const normalizedMarkEntrySubject = normalizeSubjectName(subjectData.getMarkEntrySubject?.(subject) || subject);

    const isCompulsory = (subjectData.seniorCompulsorySubjects || []).some((item) => normalizeSubjectName(item) === normalizedSubject || normalizeSubjectName(item) === normalizedMarkEntrySubject);
    if (isCompulsory) return false;

    const subjectPathways = subjectData.getSeniorPathwaysForSubject?.(subject) || [];
    return subjectPathways.length > 0 && !subjectPathways.includes("Core");
  }

  function getSeniorElectiveQueryParams(subjectName, classLabel) {
    if (!isSeniorElectiveSubject(subjectName, classLabel)) return null;

    const subjectData = window.SUBJECT_DATA || {};
    const pathways = subjectData.getSeniorPathwaysForSubject?.(subjectName) || [];
    const uniquePathways = [...new Set(pathways.map(p => String(p || "").trim()).filter(Boolean))];
    const canonicalSubject = subjectData.normalizeSeniorSubjectName?.(subjectName) || String(subjectName || "").trim();

    return {
      pathways: uniquePathways,
      electiveSubject: canonicalSubject,
    };
  }

  function buildClassStudentsQuery(page, limit, electiveParams) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (electiveParams?.pathways?.length === 1) {
      const normalizedPathway = window.cbcUtils?.normalizePathway?.(electiveParams.pathways[0]) || String(electiveParams.pathways[0] || "").trim();
      params.set("pathway", normalizedPathway);
    } else if (electiveParams?.pathways?.length > 1) {
      const normalizedPathways = electiveParams.pathways
        .map(p => window.cbcUtils?.normalizePathway?.(p) || String(p || "").trim())
        .filter(Boolean);
      params.set("pathways", normalizedPathways.join(","));
    }
    if (electiveParams?.electiveSubject) {
      params.set("electiveSubject", electiveParams.electiveSubject);
    }

    return params.toString();
  }

  function filterStudentsBySeniorPathway(students, subjectName) {
    if (!Array.isArray(students) || !students.length) return students;

    const subjectPathways = window.SUBJECT_DATA?.getSeniorPathwaysForSubject?.(subjectName) || [];
    if (!subjectPathways.length || subjectPathways.length > 1) return students;

    const expectedPathway = window.cbcUtils?.normalizePathway?.(subjectPathways[0]) || String(subjectPathways[0] || "").trim();
    return students.filter((student) => {
      const studentPathway = window.cbcUtils?.normalizePathway?.(student?.pathway) || String(student?.pathway || "").trim();
      return !studentPathway || studentPathway === expectedPathway;
    });
  }

  // ---------------------------
  // NEW: LOAD STUDENTS FOR SELECTED SUBJECT
  // ---------------------------
  async function loadStudentsForSubject(classLabel, page = 1, forceRefresh = false) {
    try {

      const electiveParams = getSeniorElectiveQueryParams(selectedSubject, classLabel);
      const electiveScope = electiveParams
        ? `${normalizeSubjectName(electiveParams.electiveSubject)}_${electiveParams.pathways?.map(p => window.cbcUtils?.normalizePathway?.(p) || String(p || "").trim()).join("_")}`
        : "all";
      // 🆕 FIX: Cache key WITHOUT page number to store full student list once
      const CACHE_KEY = `students_cache_${classLabel}_${electiveScope}`;
      const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for student list

      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { timestamp, data } = JSON.parse(cached);
            if (data && (Date.now() - timestamp < CACHE_DURATION)) {
              // 🆕 FIX: data.students now contains the FULL list of students, not paginated
              const cachedStudents = Array.isArray(data?.students) ? data.students : Array.isArray(data) ? data : [];
              let filteredStudents = cachedStudents;
              if (selectedSubject && isSeniorElectiveSubject(selectedSubject, classLabel)) {
                filteredStudents = filterStudentsBySeniorPathway(cachedStudents, selectedSubject);
              }

              // 🆕 FIX: Now paginate from the full list correctly
              const total = filteredStudents.length;
              const totalPages = Math.max(1, Math.ceil(total / STUDENTS_PER_PAGE));
              const safePage = Math.min(page, totalPages);
              const startIndex = (safePage - 1) * STUDENTS_PER_PAGE;
              const pagedStudents = filteredStudents.slice(startIndex, startIndex + STUDENTS_PER_PAGE);

              loadedStudents = pagedStudents;
              currentStudentPage = safePage;
              return {
                students: pagedStudents,
                total,
                totalPages,
                currentPage: safePage,
              };
            }
            // If cache is stale or invalid, remove it
            else {
              localStorage.removeItem(CACHE_KEY);
            }
          } catch (e) {
            console.warn("Student cache parse error:", e);
          }
        }
      }

      
      const isElectiveLoad = Boolean(electiveParams);
      // 🆕 FIX: Always fetch all students at once (limit=1000) instead of paginating per API call
      const limit = 1000; // Fetch all students for this class
      const fetchPage = 1; // Always fetch from page 1 since we want all data
      const queryString = buildClassStudentsQuery(fetchPage, limit, electiveParams);
      const res = await fetchWithAuth(`${API_BASE}/enrollments/class/${encodeURIComponent(classLabel)}?${queryString}`);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ API Error:", errorData);
        throw new Error("Failed to load students");
      }
      
      const data = await res.json();
      const rawStudents = Array.isArray(data?.students) ? data.students : Array.isArray(data) ? data : [];

      let filteredStudents = rawStudents;

      if (isElectiveLoad) {
        filteredStudents = filterStudentsBySeniorPathway(rawStudents, selectedSubject);
      }

      // 🆕 FIX: Calculate pagination from the full filtered list
      const total = filteredStudents.length;
      const totalPages = Math.max(1, Math.ceil(total / STUDENTS_PER_PAGE));
      const currentPage = Math.min(page, totalPages);
      const startIndex = (currentPage - 1) * STUDENTS_PER_PAGE;
      const pagedStudents = filteredStudents.slice(startIndex, startIndex + STUDENTS_PER_PAGE);
      
      // 🆕 FIX: Cache the FULL list of filtered students, not just one page
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: {
          ...data,
          students: filteredStudents, // Store full list for proper pagination
          total,
          totalPages,
        }
      }));

      loadedStudents = pagedStudents;
      currentStudentPage = currentPage;
      
      return {
        students: pagedStudents,
        total,
        totalPages,
        currentPage,
      }; // Return full data object with pagination metadata
    } catch (err) {
  console.error("❌ Load students error:", err);
  throw err; // Let caller handle toast
}
  }

  // ---------------------------
  // PAGINATION CONTROLS (for display only)
  // ---------------------------
  function updateStudentsPaginationControls(currentBatch) {
    let paginationEl = document.getElementById("studentsPagination");
    if (!paginationEl) {
      paginationEl = document.createElement("div");
      paginationEl.id = "studentsPagination";
      paginationEl.className = "students-pagination";
      marksEntryTable.parentElement.appendChild(paginationEl);
    }
    const totalPages = window.lastStudentsFetchTotalPages || 1;
    const totalCount = window.lastStudentsFetchTotalCount || 0;
    const currentBatchSize = currentBatch ? currentBatch.length : 0;
    
    if (isSingleEditMode) {
      if (paginationEl) paginationEl.innerHTML = "";
      return;
    }

    // Calculate the range of students being displayed
    const start = totalCount > 0 ? (currentStudentPage - 1) * STUDENTS_PER_PAGE + 1 : 0;
    const end = Math.min(start + currentBatchSize - 1, totalCount); // Corrected: Calculate end of current batch, capped by totalCount

    // Render buttons without spinner initially
    paginationEl.innerHTML = `
      <div class="pagination-info">
        Showing ${start}-${end} of ${totalCount}
      </div>
      <div class="pagination-actions">
        <button type="button" id="prevStudentsBtn" class="btn secondary-btn">Prev</button>
        <button type="button" id="nextStudentsBtn" class="btn secondary-btn">Next</button>
      </div>
    `;

    const prevStudentsBtn = document.getElementById("prevStudentsBtn");
    const nextStudentsBtn = document.getElementById("nextStudentsBtn");

    // Apply spinner and disable state using window.spinner utility
    if (studentsPaginationLoadingButton === 'prev') {
      window.spinner?.show(prevStudentsBtn, 'Prev');
      if (nextStudentsBtn) nextStudentsBtn.disabled = true; // Disable other button too
    } else if (studentsPaginationLoadingButton === 'next') {
      window.spinner?.show(nextStudentsBtn, 'Next');
      if (prevStudentsBtn) prevStudentsBtn.disabled = true; // Disable other button too
    } else {
      // If not loading, ensure both are hidden and enabled based on page state
      if (prevStudentsBtn) { window.spinner?.hide(prevStudentsBtn); prevStudentsBtn.disabled = currentStudentPage === 1; }
      if (nextStudentsBtn) { window.spinner?.hide(nextStudentsBtn); nextStudentsBtn.disabled = currentStudentPage >= totalPages; }
    }

    prevStudentsBtn?.addEventListener("click", () => {
      if (currentStudentPage > 1) {
        studentsPaginationLoadingButton = 'prev';
        updateStudentsPaginationControls(currentBatch);
        loadStudentsWithPage(currentStudentPage - 1);
      }
    });

    document.getElementById("nextStudentsBtn")?.addEventListener("click", () => {
      studentsPaginationLoadingButton = 'next';
      // Re-render controls to show spinner on the clicked button
      updateStudentsPaginationControls(currentBatch);
      loadStudentsWithPage(currentStudentPage + 1);
    });
  }

  // Helper to get unique key for allMarksEntered Map
  const getMarkEntryKey = (studentId) => 
    `${studentId}_${selectedSubject}_${marksTermSelect.value}_${marksAssessmentSelect.value}_${marksYearInput.value}`;

  // ---------------------------
  // NEW: DISPLAY STUDENTS IN MARKS TABLE
  // ---------------------------
  function displayStudentsInMarksTable(students) {
    const isSeniorSchool = students.length > 0 ? window.cbcUtils.isSeniorGrade(students[0].grade) : false;

   // 🆕 Update table title to show selected subject
    const marksControlsSection = document.querySelector('.marks-controls');
    if (marksControlsSection && selectedSubject) {
     
      let titleElement = document.querySelector('.selected-subject-title');
      if (!titleElement) {
        titleElement = document.createElement('div');
        titleElement.className = 'selected-subject-title';
        marksControlsSection.insertAdjacentElement('afterend', titleElement);
      }
      titleElement.innerHTML = `<p style="font-size: 1.1rem; color: #2b6cb0; font-weight: 600; margin: 10px 0;">📍 Subject: <strong>${selectedSubject}</strong></p>`;
    }

    // Update table header for marks column
    marksColumnHeader.innerHTML = "Marks (%)";

    // Add student rows
    students.forEach(student => { // student here is from the current page
      const markEntryKey = getMarkEntryKey(student._id);

      // 🆕 Initialize student in global map if not already present
      if (!allMarksEntered.has(markEntryKey)) {
        const subjectPathway = window.SUBJECT_DATA?.getSeniorPathway?.(selectedSubject);
        const resolvedPathway = subjectPathway === "Core"
          ? "Core"
          : (student.pathway || subjectPathway || null);
        const markData = {
          studentId: student._id,
          admissionNo: student.admissionNo || student.admission,
          studentName: student.name,
          grade: student.grade,
          stream: student.stream || '',
          pathway: resolvedPathway,
          term: Number(marksTermSelect.value),
          year: Number(marksYearInput.value),
          assessment: Number(marksAssessmentSelect.value),
          _id: null
        };
        if (isSeniorSchool) {
          markData.course = selectedSubject;
          markData.score = "";
        } else {
          markData.subject = selectedSubject;
          markData.score = "";
        }
        allMarksEntered.set(markEntryKey, markData);
      }

      const row = marksEntryTableBody.insertRow();
      row.dataset.studentId = student._id;
      row.dataset.admission = student.admissionNo || student.admission;
      row.dataset.name = student.name;
      row.dataset.grade = student.grade;
      row.dataset.stream = student.stream || ''; // Ensure stream is captured
      row.dataset.subject = selectedSubject; // 🆕 Store selected subject with each row
      row.dataset.pathway = student.pathway || ''; // Preserve stored pathway for senior school students
      const existingMark = allMarksEntered.get(markEntryKey);
      
      const existingScoreValue = existingMark?.score ?? existingMark?.finalScore ?? existingMark?.continuousAssessment ?? existingMark?.projectWork ?? existingMark?.endTermExam ?? '';

      // ADM and Name columns
      row.innerHTML = `
  <td data-label="Admission">${sanitize(student.admissionNo || student.admission)}</td>
  <td data-label="Name">${sanitize(student.name)}</td>
  <td data-label="Marks" class="marks-entry-cell">
    <input type="text" class="marks-entry-input marks-input" inputmode="text" placeholder="Score (or X for Absent)" value="${existingScoreValue}" ${currentTermLocked ? 'disabled' : ''} />
  </td>
`;
    });

    // Check if draft exists for loaded selection
    checkForExistingDraft();
    
    updateStudentsPaginationControls(students);
  }

  // ---------------------------
  // TABLE EVENT DELEGATION - Handle interactions
  // ---------------------------
  marksEntryTableBody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
   const studentId = row.dataset.studentId;

    const inputElement = e.target;
    let inputValue = inputElement.value;

    // Apply validation allowing numbers 0-100 OR 'X'
    if (inputElement.classList.contains("marks-input")) {
        
    // 1. Filter characters: allow only digits and 'X'/'x'
        inputValue = inputValue.replace(/[^0-9Xx]/g, '');

        // 2. Handle 'X'/'x': if present, it should be the only character and uppercase
        if (inputValue.toUpperCase().includes('X')) {
            inputValue = 'X';
        } else if (inputValue !== '') {
            // 3. Handle numeric input: ensure it's within 0-100
            let num = parseInt(inputValue, 10);
            if (isNaN(num)) {
                inputValue = ''; // Clear if not a valid number
            } else if (num < 0) {
                inputValue = '0';
            } else if (num > 100) {
                  inputValue = ''; // Clear if exceeding 100
                  showToast("Marks cannot exceed 100. Input cleared.", "warning");
            }
        }

        // Update the input element's value
        inputElement.value = inputValue.toUpperCase(); // Ensure 'x' becomes 'X'

        // Now, use the cleaned and validated inputValue for further processing
        inputValue = inputElement.value; // Re-assign to ensure subsequent logic uses the corrected value
        }
    

    const admission = row.dataset.admission;
    const name = row.dataset.name;
    const grade = row.dataset.grade;
    const stream = row.dataset.stream;

    const term = marksTermSelect.value;
    const assessment = marksAssessmentSelect.value;
    const year = marksYearInput.value;

    const isSeniorSchool = window.cbcUtils.isSeniorGrade(grade);
    const markEntryKey = getMarkEntryKey(studentId);

    let markData = allMarksEntered.get(markEntryKey) || {
      studentId,
      admissionNo: admission,
      studentName: name,
      grade,
      stream,
      term: Number(term),
      year: Number(year),
      assessment: Number(assessment),
      _id: null // Will be populated if editing an existing mark
    };

    if (isSeniorSchool) {
      markData.course = selectedSubject;
      markData.pathway = markData.pathway || row.dataset.pathway || null; // Preserve existing pathway if available
      markData.score = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      markData.finalScore = markData.score;
    } else {
      markData.subject = selectedSubject;
      if (inputElement.classList.contains("marks-input")) {
          markData.score = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      }
    }


    // When any marks input changes, mark row as modified
    if (e.target.classList.contains("marks-input")) {
      row.style.backgroundColor = "#fffacd"; // Light yellow to show modified
    }
  });

  // 🆕 Keyboard Navigation: Move focus with Enter key
  marksEntryTableBody.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form submission or new line in input

      const currentInput = e.target;
      const row = currentInput.closest("tr");
      if (!row) return;

      const isSeniorSchool = cbcUtils.isSeniorGrade(row.dataset.grade);
      let inputsInRow = Array.from(row.querySelectorAll(".marks-input"));

      const currentIndex = inputsInRow.indexOf(currentInput);

      if (currentIndex !== -1) {
        // If there's a next input in the current row, focus it
        if (currentIndex < inputsInRow.length - 1) {
          inputsInRow[currentIndex + 1].focus();
        } else {
          // It's the last input in the current row, move to the first input of the next row
          const nextRow = row.nextElementSibling;
          if (nextRow) {
            const nextInputsInRow = Array.from(nextRow.querySelectorAll(".marks-input"));
            if (nextInputsInRow.length > 0) {
              nextInputsInRow[0].focus();
            }
          }
        }
      }
    }
  });

  // ---------------------------
  // TABLE RESET/CLEAR FUNCTION
  // ---------------------------
  function resetMarksTable() {
    marksEntryTableBody.innerHTML = "";
    marksColumnHeader.innerHTML = "Marks (%)";
    allMarksEntered = new Map(); // Clear the global store
    loadedStudents = [];
    currentStudentPage = 1;
    isSingleEditMode = false;
    const paginationEl = document.getElementById("studentsPagination");
    if (paginationEl) {
      paginationEl.innerHTML = "";
    }
    // Remove subject title if present
    document.querySelector('.selected-subject-title')?.remove();
  }

  // ---------------------------
  // TABLE VALIDATION FUNCTION
  // ---------------------------
  function validateMarksTable() {
    const errors = [];
    
    // 🆕 Step 1: Ensure all students in the class roster have been loaded and accounted for
    const totalExpectedCount = window.lastStudentsFetchTotalCount || 0;
    if (!isSingleEditMode && totalExpectedCount > 0 && allMarksEntered.size < totalExpectedCount) {
      errors.push(`Class incomplete: You have only captured data for ${allMarksEntered.size} of ${totalExpectedCount} learners. Please scroll through all pages before submitting.`);
    }

    // Validate all marks in the global store, not just the current page
    for (const [key, markData] of allMarksEntered.entries()) {
      if (!markData.term) errors.push(`Student ${markData.studentName}: Term not selected`);
      if (!markData.assessment) errors.push(`Student ${markData.studentName}: Assessment not selected`);

      const isSeniorSchool = window.cbcUtils.isSeniorGrade(markData.grade);

      const isEmpty = (val) => val === undefined || val === null || String(val).trim() === "" || String(val).toLowerCase() === "null";

      if (isSeniorSchool) {
        if (isEmpty(markData.score)) {
          errors.push(`Learner ${markData.studentName}: Score is missing.`);
        }
      } else {
        if (isEmpty(markData.score)) {
          errors.push(`Learner ${markData.studentName}: Score is missing.`);
        }
      }
    }

    if (errors.length > 0) return errors; // Return early with specific errors

    return errors;
  }

  // ---------------------------
  // DRAFT FUNCTIONALITY
  // ---------------------------
  // Draft key now includes subject
  function getDraftKey() {
    if (!selectedAllocationData || !selectedSubject || !marksTermSelect.value || !marksAssessmentSelect.value || !marksYearInput.value) return null;
    return `marks-draft-${selectedAllocationData.classLabel}-${selectedSubject}-${marksTermSelect.value}-${marksAssessmentSelect.value}-${marksYearInput.value}`;
  }


  function saveDraft(isAutoSave = false) {
    if (!selectedAllocationData || !selectedSubject || allMarksEntered.size === 0) {
      if (!isAutoSave) showToast("No data to save. Please load Learners and enter marks first.", "error");
      return;
    }

    const draftKey = getDraftKey();
    if (!draftKey) {
      if (!isAutoSave) showToast("Please select subject, term, assessment, and year.", "error");
      return;
    }

    const draftObj = {
      marksData: Array.from(allMarksEntered.entries()), // Convert Map to array for serialization
      classLabel: selectedAllocationData.classLabel,
      subject: selectedSubject,
      term: marksTermSelect.value,
      assessment: marksAssessmentSelect.value,
      year: marksYearInput.value,
      timestamp: new Date().toLocaleString()
    };

    localStorage.setItem(draftKey, JSON.stringify(draftObj));
    
    // Show status
    if (draftStatus && draftTime) {
      draftTime.textContent = draftObj.timestamp;
      draftStatus.style.display = "block";
      setTimeout(() => {
        draftStatus.style.display = "none";
      }, 4000);
    }

    if (!isAutoSave) showToast("✓ Draft saved successfully", "success");
    
    // Show load draft button if draft exists
    if (loadDraftBtn) {
      loadDraftBtn.style.display = "inline-block";
    }
  }

  // 🆕 Background Auto-save every 30 seconds
  setInterval(() => {
    saveDraft(true);
  }, 30000);

  async function loadDraft() {
    const draftKey = getDraftKey();
    if (!draftKey) {
      showToast("Please select subject and assessment", "error");
      return;
    }

    const savedDraft = localStorage.getItem(draftKey);
    if (!savedDraft) {
      showToast("No draft found for this selection", "error");
      return;
    }

    const draftObj = JSON.parse(savedDraft);
    allMarksEntered = new Map(draftObj.marksData); // Deserialize back to Map

    // Re-render the current page to show loaded draft marks
    await loadStudentsWithPage(currentStudentPage);
    
    showToast(`✓ Draft loaded from ${draftObj.timestamp}`, "success");
    // Highlight all rows that have marks from the draft
    marksEntryTableBody.querySelectorAll("tr").forEach(row => {
      const studentId = row.dataset.studentId;
      const markEntryKey = getMarkEntryKey(studentId);
      if (allMarksEntered.has(markEntryKey)) {
        row.style.backgroundColor = "#fffacd"; // Light yellow to show restored
      }
    });
  }

  function clearDraft() {
    const draftKey = getDraftKey();
    if (draftKey) {
      localStorage.removeItem(draftKey);
    }
    if (loadDraftBtn) {
      loadDraftBtn.style.display = "none";
    }
    allMarksEntered = new Map(); // Also clear the in-memory store
  }

  function checkForExistingDraft() { // Check if draft exists for current context
    if (!selectedAllocationData || !selectedSubject || !marksTermSelect.value || !marksAssessmentSelect.value || !marksYearInput.value) return;
    const draftKey = getDraftKey();
    if (draftKey && localStorage.getItem(draftKey)) {
      if (loadDraftBtn) loadDraftBtn.style.display = "inline-block";
    }
  }

  // ---------------------------
  // DRAFT & COPY BUTTONS EVENT LISTENERS
  // ---------------------------
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener("click", () => saveDraft());
  }

  if (loadDraftBtn) {
    loadDraftBtn.addEventListener("click", loadDraft);
  }

  // ---------------------------
  // NEW: LOAD STUDENTS BUTTON CLICKED
  // ---------------------------
  if (loadStudentsBtn) {
    loadStudentsBtn.addEventListener("click", async () => {
      if (isLoadingStudents) {
        return;
      }

      if (!selectedAllocationData) {
        showToast("Please select a subject/class first", "error");
        return;
      }

      if (!selectedSubject) {
        showToast("Please select a specific subject", "error");
        return;
      }

      if (!marksTermSelect.value || !marksAssessmentSelect.value || !marksYearInput.value) {
        showToast("Please select Subject and Assessment", "error");
        return;
      }

      if (currentTermLocked) { // Early exit if term is locked
        showToast("Cannot load students for a locked term.", "error");
        return;
      }

      isLoadingStudents = true;
      loadStudentsBtn.disabled = true;


      isSingleEditMode = false;

      window.spinner?.show(loadStudentsBtn, 'Loading...');

      await loadStudentsWithPage(1); // Load first page on manual click
      
      window.spinner?.hide(loadStudentsBtn);
      loadStudentsBtn.disabled = false;
      isLoadingStudents = false;
    });
  }

  async function loadStudentsWithPage(page) {
    let students = [];
    try {
      const response = await loadStudentsForSubject(selectedAllocationData.classLabel, page);
      students = response.students || response;
      const totalPages = response.totalPages || 1;
      window.lastStudentsFetchTotalPages = totalPages; // Store globally for pagination controls
      window.lastStudentsFetchTotalCount = response.total || students.length;

      displayStudentsInMarksTable(students);
      updateUIForTermLock(); // Ensure UI is updated after students are loaded

      if (students.length > 0) {
        showToast(`✅ Loaded ${students.length} Learner(s) from ${selectedAllocationData.classLabel}`, "success");
      } else {
        showToast(`⚠️ No Learners found in ${selectedAllocationData.classLabel}`, "warning");
      }
    } catch (err) {
      showToast("❌ Failed to load Learners: " + err.message, "error");
    } finally {
      studentsPaginationLoadingButton = null;
      updateStudentsPaginationControls(students); // Re-render to hide spinner
    }
  }

  // ---------------------------
  // NEW: SUBMIT ALL MARKS
  // ---------------------------
  if (submitAllMarksBtn) {
    submitAllMarksBtn.addEventListener("click", async () => {
      // Guard: prevent multiple clicks while logic is running or confirmation is pending
      if (submitAllMarksBtn.disabled) return;

      if (allMarksEntered.size === 0) {
        showToast("No marks entered to submit.", "error");
        return;
      }
      if (currentTermLocked) { // Early exit if term is locked
        showToast("No marks entered to submit.", "error");
        return;
      }

      const validationErrors = validateMarksTable();
      if (validationErrors.length > 0) {
        showToast(`Validation Errors: ${validationErrors.join(", ")}`, "error");
        return;
      }

      const marksToSubmit = [];
      let newMarksCount = 0;
      let updatedMarksCount = 0;
      let hasCriticalErrors = false;

      for (const [key, markData] of allMarksEntered.entries()) {
        const isSeniorSchool = window.cbcUtils.isSeniorGrade(markData.grade);
        const markGradeStr = (markData.grade || "").toString();
        const gradeNum = parseInt(markGradeStr.match(/\d+/)?.[0] || markGradeStr, 10);

        let markPayload = {
          admissionNo: markData.admissionNo,
          studentName: markData.studentName,
          grade: markData.grade, // Use original string grade
          stream: markData.stream || null,
          term: markData.term,
          year: markData.year,
          assessment: markData.assessment,
          _id: markData._id // Include _id if it's an existing mark for update
        };

        if (isSeniorSchool) {
          // 🆕 Use Centered Logic from SUBJECT_DATA
          // Pathway is now determined by the frontend based on the selected allocation.
          // The backend will also validate this.
          // For now, we assume markPayload.pathway is correctly set by the teacher's selection.
          
          // 🆕 Frontend validation for Senior School elective selection logic
          // This requires grouping all marks for a student in a given assessment first.
          // This logic will be applied after the initial per-mark validation.
        }
        
      }

      // 🆕 Group senior elective marks for validation only when a complete elective set is present
      const seniorElectiveGroups = new Map();

      for (const markData of allMarksEntered.values()) {
          const isSeniorSchool = window.cbcUtils.isSeniorGrade(markData.grade);
          if (!isSeniorSchool || !markData.course) continue;

          const normalizedCourse = window.SUBJECT_DATA.normalizeSeniorSubjectName?.(markData.course) || markData.course;
          const coursePathway = window.SUBJECT_DATA.getSeniorPathway?.(normalizedCourse);
          if (!coursePathway || coursePathway === "Core") continue; // Only validate elective courses

          const key = `${markData.studentId}_${markData.assessment}`;
          if (!seniorElectiveGroups.has(key)) {
              seniorElectiveGroups.set(key, {
                  pathway: markData.pathway,
                  courses: new Set(),
                  sampleMark: markData
              });
          }
          const group = seniorElectiveGroups.get(key);
          group.courses.add(normalizedCourse);
      }

      for (const group of seniorElectiveGroups.values()) {
          if (group.courses.size < 3) {
              // Incomplete elective submission; do not validate until all electives are present
              continue;
          }
          if (!group.pathway || group.pathway === "null" || group.pathway === "N/A") {
              validationErrors.push(`Learner ${group.sampleMark.studentName} (${group.sampleMark.admissionNo}): Pathway not specified for Senior School subjects.`);
              continue;
          }

          const electiveValidationErrors = window.SUBJECT_DATA.validateSeniorElectiveSelection(group.pathway, Array.from(group.courses));
          if (electiveValidationErrors.length > 0) {
              electiveValidationErrors.forEach(err => {
                  validationErrors.push(`Learner ${group.sampleMark.studentName} (${group.sampleMark.admissionNo}): ${err}`);
              });
          }
      }

      if (validationErrors.length > 0) {
          showToast(`Validation Errors: ${validationErrors.join(", ")}`, "error");
          return;
      }

      // ... (rest of the existing marksToSubmit loop)
      for (const [key, markData] of allMarksEntered.entries()) {
        const isSeniorSchool = window.cbcUtils.isSeniorGrade(markData.grade);
        const markGradeStr = (markData.grade || "").toString();
        const gradeNum = parseInt(markGradeStr.match(/\d+/)?.[0] || markGradeStr, 10);

        let markPayload = {
          admissionNo: markData.admissionNo,
          studentName: markData.studentName,
          grade: markData.grade, // Use original string grade
          stream: markData.stream || null,
          term: markData.term,
          year: markData.year,
          assessment: markData.assessment,
          _id: markData._id // Include _id if it's an existing mark for update
        };

        if (isSeniorSchool) {
          const course = markData.course;
          // 🆕 Use Centered Logic from SUBJECT_DATA
          let pathway = window.SUBJECT_DATA.getSeniorPathway(course);

          if (!pathway) {
            showToast(`Error: Could not find Pathway for the course "${course}" for student ${markData.studentName}. Please check senior school configurations.`, "error");
            hasCriticalErrors = true;
            break; // Stop processing all marks
          }
          
          markPayload.pathway = pathway;
          markPayload.course = course;
          markPayload.score = (String(markData.score).toUpperCase() === "X") ? null : (markData.score !== null && markData.score !== "" ? Number(markData.score) : null);
          markPayload.finalScore = markPayload.score;

        }
        else {
          markPayload.subject = markData.subject;
          markPayload.score = (String(markData.score).toUpperCase() === "X") ? null : (markData.score !== null && markData.score !== "" ? Number(markData.score) : null);
        }

        if (markPayload._id) {
          updatedMarksCount++;
        } else {
          newMarksCount++;
        }
        marksToSubmit.push(markPayload);
      }

      if (hasCriticalErrors) return;

      let absentCount = 0;
      allMarksEntered.forEach(m => {
        const isSenior = window.cbcUtils.isSeniorGrade(m.grade);
        if (m.score === "X") {
          absentCount++;
        }
      });

      let confirmationMessage = `
        <div style="text-align: left; padding: 5px;">
          <h4 style="margin: 0 0 10px 0; color: #2c5282; font-size: 1.1rem;">📝 Data Accuracy Check</h4>
          <p style="margin-bottom: 10px; font-size: 0.9rem;">You are preparing to finalize marks for <strong>${selectedAllocationData.classLabel}</strong> (${selectedSubject}).</p>
          <ul style="margin: 0 0 15px 0; padding-left: 20px; font-size: 0.85rem; line-height: 1.6;">
            <li><strong>Total Records:</strong> ${marksToSubmit.length}</li>
            <li><strong>New / Updated:</strong> ${newMarksCount} new, ${updatedMarksCount} changes</li>
            <li><strong>Learners Absent:</strong> ${absentCount > 0 ? `<span style="color:#e53e3e; font-weight:700;">${absentCount}</span>` : 'None (Full attendance)'}</li>
          </ul>
          <p style="margin: 0; font-size: 0.8rem; color: #718096; border-top: 1px solid #edf2f7; padding-top: 8px; margin-top: 8px;">
            <strong>Note:</strong> These results will be reviewed by the <strong>Dean of Studies</strong> for ranking and performance analysis.
          </p>
        </div>
      `;

      // Disable immediately before showing the modal to prevent double-clicks spawning multiple toasts
      submitAllMarksBtn.disabled = true;
      const originalBtnHTML = submitAllMarksBtn.innerHTML;

      if (!await window.cbcUtils.showConfirmToast(confirmationMessage)) {
        submitAllMarksBtn.disabled = false;
        return;
      }

    window.spinner?.show(submitAllMarksBtn, 'Submitting...');

    try {
      let successCount = 0;
      let failureCount = 0;
      // Send all marks in a single bulk request
      const res = await fetchWithAuth(`${API_BASE}/marks/bulk-add-update`, {
        method: "POST",
        body: JSON.stringify(marksToSubmit)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessages = Array.isArray(errorData.errors)
          ? errorData.errors.map(err => err.message || JSON.stringify(err)).join("; ")
          : null;
        const serverMessage = errorData.message || "Bulk submission failed";
        throw new Error(`${serverMessage}${errorMessages ? `: ${errorMessages}` : ""}`);
      }

      const result = await res.json(); // Expecting { successCount, failureCount } from backend

      if (result.failureCount > 0) {
        let errorMessage = `Processed: ${result.successCount} saved, ${result.failureCount} failed.`; // Initial summary
        if (result.errors && result.errors.length > 0) {
          const duplicateStudents = [];
          const otherErrors = [];

          result.errors.forEach(err => {
            if (err.message === "Duplicate, marks already exist.") {
              duplicateStudents.push(err.mark.studentName || err.mark.admissionNo);
            } else {
              otherErrors.push(`- ${err.mark.studentName || err.mark.admissionNo}: ${err.message}`);
            }
          });

          if (duplicateStudents.length > 0) {
            errorMessage += `\nDuplicate marks for: ${duplicateStudents.join(", ")}.`;
          }
          if (otherErrors.length > 0) {
            errorMessage += `\nOther failures:\n${otherErrors.join("\n")}`;
          }
        }
        showToast(errorMessage, "error");
      } else {
        showToast(`✅ Processed: ${result.successCount} mark(s) saved/updated.`, "success");
      }

      if (result.successCount > 0) { // Check result.successCount from backend
        // 🆕 Clear roster cache for this class to ensure fresh data for next load
        const classLabel = selectedAllocationData?.classLabel;
        if (classLabel) {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`students_cache_${classLabel}`)) {
              localStorage.removeItem(key);
            }
          }
        }

        localStorage.removeItem("teacher_marks_cache");
        await loadSubmittedMarks(true); // Force refresh after submission
        
        clearDraft(); 
        marksEntryTableBody.innerHTML = "";
        subjectAllocationSelect.value = "";
        subjectAllocationSelect.dispatchEvent(new Event('change')); 

        // Auto-switch to Submitted Marks tab
        const submittedTabBtn = document.querySelector('[data-tab="submittedMarks"]');
        if (submittedTabBtn) submittedTabBtn.click();
      }
    } catch (err) {
      console.error("Submit marks error:", err);
      showToast(err.message || "Error submitting marks", "error");
    } finally {
      window.spinner?.hide(submitAllMarksBtn);
    }
    });
  }

  
  // ---------------------------
  // SENIOR SCHOOL PATHWAYS & COURSES
  // ---------------------------
  const seniorSchoolPathways = SUBJECT_DATA.seniorSchoolPathways;



  async function loadSubmittedMarks(forceRefresh = false) {
    const CACHE_KEY = "teacher_marks_cache";
    const currentYear = marksYearInput?.value || new Date().getFullYear();
    const currentTerm = marksTermSelect?.value || "1";
    const currentAcademicContext = { year: currentYear, term: currentTerm };

    // 🆕 Reset to first page when forcing a refresh (e.g., after submission)
    if (forceRefresh) submittedMarksCurrentPage = 1;

    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
    const cacheKeyWithContext = `${CACHE_KEY}_${currentAcademicContext.year}_${currentAcademicContext.term}`;

    try {
      // 🚀 Fetch with a high limit (1000) to ensure multiple class groups are captured for the accordions
      const requestUrl = `${API_BASE}/marks/teacher?limit=1000&year=${currentAcademicContext.year}&term=${currentAcademicContext.term}`;
      const res = await fetchWithAuth(requestUrl);
      
      if (res.status === 403) {
        alert("You are not authorized to view marks.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch marks");
      
      const data = await res.json();
      submittedMarks = Array.isArray(data) ? data : (data.marks || []);
      subTablePageMap.clear();
      subSearchMap.clear();

      localStorage.setItem(cacheKeyWithContext, JSON.stringify({
        timestamp: Date.now(),
        data: submittedMarks
      }));

      window.currentMarks = submittedMarks;
      displayPaginatedMarksGroups(submittedMarksCurrentPage);
    } catch (err) {
      console.error("Load marks error:", err);

      try {
        const cached = localStorage.getItem(cacheKeyWithContext);
        if (cached) {
          const { data } = JSON.parse(cached);
          submittedMarks = Array.isArray(data) ? data : (data?.marks || []);
          window.currentMarks = submittedMarks;
          displayPaginatedMarksGroups(submittedMarksCurrentPage);
          return;
        }
      } catch (cacheErr) {
        console.warn("Cache fallback error:", cacheErr);
      }

      if (submittedMarksContainer) {
        submittedMarksContainer.innerHTML = `
          <div style="text-align:center; padding:20px; color:#e53e3e; background:#fff5f5; border-radius:12px; border:1px solid #feb2b2;">
            <strong>⚠️ Connection Error</strong><br>
            Could not fetch your submitted marks. Please check your internet or try refreshing.
          </div>`;
      }
    }
  }

  // ---------------------------
  // DISPLAY FUNCTIONS
  // ---------------------------
  // Helper to sanitize text for display
  function sanitize(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
  
  // Renamed from displayMarks to displayPaginatedMarksGroups
  function displayPaginatedMarksGroups(page) {

    
    if (!submittedMarks || !Array.isArray(submittedMarks)) {
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks data available.</p>';
      return;
    }

    const grouped = {};
    submittedMarks.forEach(m => {
      // Ensure all key components are strings and handle potential null/undefined gracefully
      const grade = (m.grade !== undefined && m.grade !== null) ? String(m.grade) : 'unknown-grade';
      const term = (m.term !== undefined && m.term !== null) ? String(m.term) : 'unknown-term';
      const year = (m.year !== undefined && m.year !== null) ? String(m.year) : 'unknown-year';
      const assessment = (m.assessment !== undefined && m.assessment !== null) ? String(m.assessment) : 'unknown-assessment';

      const isSenior = window.cbcUtils.isSeniorGrade(grade);
      const subjectKey = isSenior 
        ? (m.course ? String(m.course) : 'no-course') 
        : (m.subject ? String(m.subject) : 'no-subject');
      
      // Normalize grade (e.g., "5" vs "Grade 5") to ensure consistent grouping
      const gradeNorm = window.cbcUtils.normalizeGrade(grade);
      const streamVal = m.stream || '';
      // Form key by Subject, Assessment, Grade, Stream, Term, Year
      const key = `${subjectKey}_${m.assessment}_${gradeNorm}_${streamVal}_${m.term}_${m.year}`;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    
    
    // 🆕 Sort by assessment hierarchy: EndTerm (top) > MidTerm (middle) > Opener (bottom)
    // Assessment IDs: Opener=1 (first submitted), MidTerm=2, EndTerm=3 (last submitted)
    // We sort descending by assessment ID so EndTerm (3) appears first
    submittedMarksGroupedKeys = Object.keys(grouped).sort((keyA, keyB) => {
      // Extract assessment ID from key (format: subjectKey_assessmentID_grade_stream_term_year)
      const partsA = keyA.split('_');
      const partsB = keyB.split('_');
      
      // Assessment is the 2nd element (index 1) in the key
      const assessmentA = parseInt(partsA[1]) || 0;
      const assessmentB = parseInt(partsB[1]) || 0;
      
      // Sort descending by assessment ID so higher IDs (EndTerm=3) appear first
      if (assessmentA !== assessmentB) {
        return assessmentB - assessmentA;
      }
      
      // If same assessment, fall back to alphabetical by full key
      return keyA.localeCompare(keyB);
    }); 
    const totalGroups = submittedMarksGroupedKeys.length;
    submittedMarksTotalPages = Math.ceil(totalGroups / SUBMITTED_MARKS_LIMIT);
    submittedMarksCurrentPage = page;

    if (page > submittedMarksTotalPages && totalGroups > 0) {
      displayPaginatedMarksGroups(1);
      return;
    }

    const startIndex = (page - 1) * SUBMITTED_MARKS_LIMIT;
    const endIndex = startIndex + SUBMITTED_MARKS_LIMIT;
    const keysForCurrentPage = submittedMarksGroupedKeys.slice(startIndex, endIndex);
    
    submittedMarksContainer.innerHTML = '';
    if (!keysForCurrentPage.length) {
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks submitted yet.</p>';
      renderSubmittedMarksPaginationControls();
      return;
    }
    keysForCurrentPage.forEach(key => {
      try {
        const fullGroupMarksRaw = grouped[key];
        const headerInfo = fullGroupMarksRaw[0];
        const details = document.createElement('details');
        details.open = openAccordions.has(key); // Persist open state
        details.className = 'marks-accordion';

        const mapping = window.ASSESSMENT_MAPPING || {};
        const assessmentLabel = mapping[headerInfo.assessment] || `Assessment ${headerInfo.assessment}`;
        const gradeMatch = (headerInfo.grade || "").toString().match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const groupIsSenior = window.cbcUtils.isSeniorGrade(headerInfo.grade);
        const subjectDisplay = groupIsSenior ? `${headerInfo.pathway || 'N/A'} - ${headerInfo.course || 'N/A'}` : (headerInfo.subject || '').replace(/-/g, ' ');
        
        // 🆕 Include Stream in the display title (e.g. Grade 7 B)
        const streamLabel = headerInfo.stream ? ` ${headerInfo.stream}` : '';
        const gradeWithStream = `${window.cbcUtils.normalizeGrade(headerInfo.grade)}${streamLabel}`;
    const canEditSubmittedGroup = teacherSubmittedMarkEditsAllowed && !currentTermLocked;
    const adminLockText = canEditSubmittedGroup ? '' : ' • Admin disabled submitted mark edits';
    const summaryText = `Grade: ${sanitize(gradeWithStream)} • ${sanitize(subjectDisplay)} • Term: ${sanitize(headerInfo.term)} • Year: ${sanitize(headerInfo.year)} • ${assessmentLabel} — ${fullGroupMarksRaw.length} record${fullGroupMarksRaw.length > 1 ? 's' : ''}${adminLockText}`;
        const summary = document.createElement('summary');
        summary.className = 'marks-accordion-summary';
        summary.innerHTML = `<strong>${summaryText}</strong>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'marks-accordion-content';

        details.ontoggle = () => {
          if (details.open) {
            openAccordions.add(key);
            if (!contentWrapper.dataset.rendered) {
              renderMarksAccordionContent(key, contentWrapper, fullGroupMarksRaw, groupIsSenior, summaryText);
              contentWrapper.dataset.rendered = "true";
            }
            contentWrapper.style.display = 'block';
          } else {
            openAccordions.delete(key);
            contentWrapper.style.display = 'none';
          }
        };

        details.appendChild(summary);
        details.appendChild(contentWrapper);

        // If it's already marked as open (e.g. from previous state or search), render immediately
        if (details.open) {
          renderMarksAccordionContent(key, contentWrapper, fullGroupMarksRaw, groupIsSenior, summaryText);
          contentWrapper.dataset.rendered = "true";
          contentWrapper.style.display = 'block';
        }

        submittedMarksContainer.appendChild(details);
      } catch (err) {
        console.error("Error rendering marks group:", err, key);
      }
    });
    renderSubmittedMarksPaginationControls();
  }

  // 🆕 Lazy Load Helper for Accordion Content
  function renderMarksAccordionContent(key, contentWrapper, fullGroupMarksRaw, groupIsSenior, summaryText) {
    const searchTerm = subSearchMap.get(key) || "";
    const fullGroupMarks = searchTerm 
      ? fullGroupMarksRaw.filter(m => 
          (m.studentName || "").toLowerCase().includes(searchTerm) || 
          (m.admissionNo || m.admission || "").toString().toLowerCase().includes(searchTerm)
        )
      : fullGroupMarksRaw;

    const totalStudents = fullGroupMarks.length;
    const totalSubPages = Math.ceil(totalStudents / STUDENTS_PER_TABLE_PAGE);
    const currentSubPage = subTablePageMap.get(key) || 1;
    const startIndex = (currentSubPage - 1) * STUDENTS_PER_TABLE_PAGE;
    const pagedGroupMarks = fullGroupMarks.slice(startIndex, startIndex + STUDENTS_PER_TABLE_PAGE);

    contentWrapper.innerHTML = '';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search name or adm...';
    searchInput.value = searchTerm;
    searchInput.style.cssText = "padding: 3px 12px; font-size: 0.75rem; border: 1px solid #cbd5e0; border-radius: 8px; margin-left: 15px; width: 210px; outline: none; background: #fff;";
    searchInput.addEventListener('click', e => e.stopPropagation());
    searchInput.addEventListener('input', e => {
      const val = e.target.value.toLowerCase();
      activeSearchInfo = { key, cursor: e.target.selectionStart };
      subSearchMap.set(key, val);
      subTablePageMap.set(key, 1);
      displayPaginatedMarksGroups(submittedMarksCurrentPage);
    });

    const canEditSubmittedGroup = teacherSubmittedMarkEditsAllowed && !currentTermLocked;
    const editHint = canEditSubmittedGroup ? 'Use the pencil icon to edit records. Submitted-mark editing is controlled by the admin dashboard for this term.' : 'Editing submitted marks is disabled for this term.';

    const hintMessage = document.createElement('div');
    hintMessage.textContent = editHint;
    hintMessage.style.cssText = 'margin-top: 8px; padding: 8px 10px; background: #eef2ff; color: #3730a3; border-radius: 8px; font-size: 0.82rem; max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; word-break: break-word;';

    const deleteGroupBtn = document.createElement('button');
    deleteGroupBtn.className = 'btn danger-btn';
    deleteGroupBtn.innerHTML = '🗑️ Delete Table';
    deleteGroupBtn.style.cssText = "padding: 6px 12px; font-size: 0.8rem; border-radius: 8px; font-weight: 700; height: 34px; vertical-align: middle;";
    deleteGroupBtn.dataset.action = "delete-group";
    deleteGroupBtn.dataset.key = key;
    deleteGroupBtn.disabled = !canEditSubmittedGroup;

    if (activeSearchInfo.key === key) {
      setTimeout(() => {
        searchInput.focus();
        searchInput.setSelectionRange(activeSearchInfo.cursor, activeSearchInfo.cursor);
      }, 0);
    }

    // Controls row: search on left, delete on right
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px;';

    const leftControls = document.createElement('div');
    leftControls.style.cssText = 'display:flex; align-items:center; gap:8px; flex:1;';
    searchInput.style.flex = '1';
    leftControls.appendChild(searchInput);

    const rightControls = document.createElement('div');
    rightControls.style.cssText = 'display:flex; align-items:center; gap:8px; flex-shrink:0;';
    rightControls.appendChild(deleteGroupBtn);

    controlsRow.appendChild(leftControls);
    controlsRow.appendChild(rightControls);

    contentWrapper.appendChild(controlsRow);
    if (canEditSubmittedGroup) {
      contentWrapper.appendChild(hintMessage);
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'marks-table-container';

    let thead = `<thead><tr><th>Admission</th><th>Name</th><th>Score (%)</th>`;
    thead += `<th>Actions</th></tr></thead>`;

    const editDisabled = !canEditSubmittedGroup;
    const deleteDisabled = !canEditSubmittedGroup;
    let tbody = `<tbody>${pagedGroupMarks.map(m => {
      const displayScore = groupIsSenior ? (m.score ?? m.finalScore ?? '-') : (m.score ?? '-');
      const scoreCell = `<td data-label="Score">${sanitize(displayScore)}</td>`;
      return `<tr data-id="${m._id || ''}"><td data-label="Admission">${sanitize(m.admissionNo ?? m.admission ?? '')}</td><td data-label="Name">${sanitize(m.studentName)}</td>${scoreCell}<td data-label="Actions"><button class="btn-edit" data-action="edit" ${editDisabled ? 'disabled' : ''}>✏️</button><button class="btn-delete" data-action="delete" ${deleteDisabled ? 'disabled' : ''}>🗑️</button></td></tr>`;
    }).join('')}</tbody>`;

    // Create combined table with header and body
    const combinedTable = document.createElement('table');
    combinedTable.classList.add('marks-table', 'marks-table-combined');
    combinedTable.innerHTML = `<caption class="sr-only">${summaryText}</caption>${thead}${tbody}`;

    // Create scrollable wrapper for the entire table
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'marks-table-scroll-wrapper';
    scrollWrapper.appendChild(combinedTable);

    tableContainer.appendChild(scrollWrapper);
    contentWrapper.appendChild(tableContainer);

    if (totalSubPages > 1) {
      const subPagination = document.createElement('div');
      subPagination.className = 'sub-pagination-controls';
      subPagination.style.cssText = "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 10px; padding: 5px 10px; border-top: 1px solid #edf2f7;";
      subPagination.innerHTML = `<span style="font-size: 0.75rem; color: #718096;">Showing ${startIndex + 1}-${Math.min(startIndex + STUDENTS_PER_TABLE_PAGE, totalStudents)} of ${totalStudents}</span><div style="display:flex; gap:5px;"><button class="btn sub-prev-btn" ${currentSubPage === 1 ? 'disabled' : ''} style="padding: 2px 8px; font-size: 0.7rem;">Prev</button><button class="btn sub-next-btn" ${currentSubPage === totalSubPages ? 'disabled' : ''} style="padding: 2px 8px; font-size: 0.7rem;">Next</button></div>`;
      subPagination.querySelector('.sub-prev-btn').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        subTablePageMap.set(key, currentSubPage - 1); displayPaginatedMarksGroups(submittedMarksCurrentPage);
      };
      subPagination.querySelector('.sub-next-btn').onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        subTablePageMap.set(key, currentSubPage + 1); displayPaginatedMarksGroups(submittedMarksCurrentPage);
      };
      contentWrapper.appendChild(subPagination);
    }
  }
  // New function for submitted marks pagination controls
  function renderSubmittedMarksPaginationControls() {
    let paginationEl = document.getElementById("submittedMarksPagination");
    if (!paginationEl) {
        paginationEl = document.createElement("div");
        paginationEl.id = "submittedMarksPagination";
        paginationEl.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px; padding: 10px;";
        submittedMarksContainer.after(paginationEl); // Insert after the container
    }

    paginationEl.innerHTML = `
        <button type="button" id="prevSubmittedMarksBtn" class="btn secondary-btn" ${submittedMarksCurrentPage === 1 ? "disabled" : ""} style="padding: 5px 10px; font-size: 0.9em;">Previous</button>
        <span style="font-weight: bold; color: #555;">Page ${submittedMarksCurrentPage} of ${submittedMarksTotalPages}</span>
        <button type="button" id="nextSubmittedMarksBtn" class="btn secondary-btn" ${submittedMarksCurrentPage >= submittedMarksTotalPages ? "disabled" : ""} style="padding: 5px 10px; font-size: 0.9em;">Next</button>
    `;

    document.getElementById("prevSubmittedMarksBtn")?.addEventListener("click", () => {
        if (submittedMarksCurrentPage > 1) {
            displayPaginatedMarksGroups(submittedMarksCurrentPage - 1);
        }
    });

    document.getElementById("nextSubmittedMarksBtn")?.addEventListener("click", () => {
        if (submittedMarksCurrentPage < submittedMarksTotalPages) {
            displayPaginatedMarksGroups(submittedMarksCurrentPage + 1);
        }
    });
  }

  // ---------------------------
  // EDIT / DELETE HANDLERS
  // ---------------------------
  submittedMarksContainer.addEventListener("click", async e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = row?.dataset.id;
    
    if (!teacherSubmittedMarkEditsAllowed || currentTermLocked) {
      return showToast("Editing submitted marks is currently disabled for this term.", "error");
    }

    // 🆕 HANDLE BULK DELETE FOR ENTIRE GROUP
    if (btn.dataset.action === "delete-group") {
      const key = btn.dataset.key;
      // Identify all marks belonging to this specific table group
      const marksToDelete = submittedMarks.filter(m => {
        const gradeNorm = window.cbcUtils.normalizeGrade(m.grade);
        const isSenior = window.cbcUtils.isSeniorGrade(m.grade);
        const subjectKey = isSenior ? (m.course || 'no-course') : (m.subject || 'no-subject');
        const streamVal = m.stream || '';
        return `${subjectKey}_${m.assessment}_${gradeNorm}_${streamVal}_${m.term}_${m.year}` === key;
      });

      if (!marksToDelete.length) return;

      const confirmMsg = `Are you sure you want to permanently delete ALL ${marksToDelete.length} records in this table? This action cannot be undone.`;
      if (!await showConfirm(confirmMsg)) return;

      // Check Term Lock for the group before processing (using the first mark as reference)
      const sample = marksToDelete[0];
      try {
        const lockRes = await fetchWithAuth(`${API_BASE}/settings/term-lock?year=${sample.year}&term=${sample.term}`);
        const lockData = await lockRes.json();
        if (lockData.isLocked && teacher.role !== 'super_admin') {
          return showToast("Cannot delete: This academic term is officially locked.", "error");
        }
      } catch (e) { console.warn("Lock check failed, proceeding with deletion attempt..."); }

      btn.disabled = true;
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Deleting...';

      try {
        // Optimized: Single Bulk Delete Request
        const markIds = marksToDelete.map(m => m._id);
        const res = await fetchWithAuth(`${API_BASE}/marks/bulk-delete`, { 
          method: "POST", 
          body: JSON.stringify({ markIds }) 
        });

        const result = await res.json();
        localStorage.removeItem("teacher_marks_cache");
        showToast(result.message || `Successfully deleted ${markIds.length} records.`, "success");
        await loadSubmittedMarks(true); // Force refresh UI
      } catch (err) {
        console.error("Bulk delete error:", err);
        showToast("Failed to complete bulk deletion.", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
      return;
    }

    if (btn.dataset.action === "edit") {
      // NEW EDIT LOGIC FOR TABLE-BASED ENTRY
      const mark = submittedMarks.find(m => m._id === id);
      if (!mark) return showToast("Error: Mark data not found.", "error");

      const markGroupKey = (() => {
        const isSenior = window.cbcUtils.isSeniorGrade(mark.grade);
        const subjectKey = isSenior ? (mark.course || 'no-course') : (mark.subject || 'no-subject');
        const gradeNorm = window.cbcUtils.normalizeGrade(mark.grade);
        const streamVal = mark.stream || '';
        return `${subjectKey}_${mark.assessment}_${gradeNorm}_${streamVal}_${mark.term}_${mark.year}`;
      })();

      // Robust Grade extraction (from mark object)
      const markGradeStr = (mark.grade || "").toString();
      const markGradeNum = window.cbcUtils.getGradeNum(markGradeStr);

      // Helper to normalize strings for comparison (lowercase, space-padded, hyphen-free)
      const normalize = s => (s || '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
      const markSub = normalize(mark.subject);
      const markCourse = normalize(mark.course);

      showToast("Loading learner for editing...", "info");

      const isSeniorSchool = markGradeNum >= 10 && markGradeNum <= 12;

      // 1. Find the correct allocation in the dropdown by normalizing subject/course names and grade
      const allocationOption = Array.from(subjectAllocationSelect.options).find(opt => {
        const optGradeNorm = window.cbcUtils.normalizeGrade(opt.dataset.grade); // 🆕 Use dataset.grade for comparison
        const optStream = opt.dataset.stream || ''; // 🆕 Use dataset.stream for comparison
        const optSub = normalize(opt.dataset.subject);
        
        // 🆕 Fix: Use normalized grade comparison instead of parsing digits (which fails for PG/PP)
        const markGradeNorm = window.cbcUtils.normalizeGrade(mark.grade);
        const markStream = mark.stream || ''; // 🆕 Mark object should have stream

        if (optGradeNorm !== markGradeNorm) return false;
        if (optStream !== markStream) return false; // 🆕 Compare streams too

        if (isSeniorSchool) {
          return optSub === markCourse || optSub === markSub;
        } else {
          return optSub === markSub;
        }
      });

      if (!allocationOption) {
        return showToast("Cannot edit: You are not allocated to this subject/class.", "error");
      }

      // 2. Set the filters at the top of the page
      subjectAllocationSelect.value = allocationOption.value; // This will trigger change event
      marksTermSelect.value = mark.term; // Set after change event if needed
      marksAssessmentSelect.value = mark.assessment; // Set after change event if needed
      marksYearInput.value = mark.year; // Set after change event if needed

      // 3. Trigger a 'change' on the allocation select to update internal state
      subjectAllocationSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // 🆕 Set single edit mode AFTER change event which triggers resetMarksTable
      isSingleEditMode = true;

      // 4. Create a mock student object from the mark data
      const studentToEdit = {
        _id: mark.studentId || mark._id, // Critical: Ensure ID is preserved for key matching in allMarksEntered
        admissionNo: mark.admissionNo,
        admission: mark.admissionNo, // for compatibility
        name: mark.studentName,
        grade: mark.grade,
        stream: mark.stream // Ensure stream is passed
      };

      // 5. Display just this one student in the table
      // Clear allMarksEntered and add only this mark for editing
      allMarksEntered = new Map();
      const markEntryKey = getMarkEntryKey(mark.studentId || mark._id); // Use studentId or mark._id as key
      allMarksEntered.set(markEntryKey, mark);

      displayStudentsInMarksTable([studentToEdit]);

      // 6. Find the student's row and populate the mark after a short delay for the DOM to update
      setTimeout(() => {
        const studentRow = marksEntryTableBody.querySelector("tr"); // It will be the only row

        if (!studentRow) return showToast("Could not find the student in the loaded class list.", "error");

        // 7. Populate the mark input in that specific row
        const marksInput = studentRow.querySelector(".marks-input");
        if (marksInput) {
          const inputValue = mark.score ?? mark.finalScore ?? mark.continuousAssessment ?? mark.projectWork ?? mark.endTermExam ?? '';
          marksInput.value = inputValue;
          marksInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 8. Scroll to the table and highlight the row
        marksTableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        studentRow.style.backgroundColor = "#d4edda"; // Light green to highlight
        setTimeout(() => {
          studentRow.style.backgroundColor = "#fffacd"; // Back to 'modified' color
        }, 5000);

        showToast("Learner loaded for editing. Please update the mark and submit.", "success");      

        // Automatically switch to the "Enter Marks" tab
        const enterMarksTabBtn = document.querySelector('[data-tab="enterMarks"]');
        if (enterMarksTabBtn) enterMarksTabBtn.click();

      }, 100); // Short delay for DOM render
    }
    if (btn.dataset.action === "delete") {
      const mark = submittedMarks.find(m => m._id === id);
      if (!mark) return showToast("Error: Mark data not found.", "error");
      const markGroupKey = (() => {
        const isSenior = window.cbcUtils.isSeniorGrade(mark.grade);
        const subjectKey = isSenior ? (mark.course || 'no-course') : (mark.subject || 'no-subject');
        const gradeNorm = window.cbcUtils.normalizeGrade(mark.grade);
        const streamVal = mark.stream || '';
        return `${subjectKey}_${mark.assessment}_${gradeNorm}_${streamVal}_${mark.term}_${mark.year}`;
      })();

      if (!await showConfirm("Are you sure you want to permanently delete this mark? This action cannot be undone.")) return;
      try {
        const res = await fetchWithAuth(`${API_BASE}/marks/${id}`, { method: "DELETE" });
        if (res.status === 403) return showToast("Unauthorized", "error");
        if (!res.ok) throw new Error("Delete failed");
        showToast("Deleted successfully", "success");
        await loadSubmittedMarks(true); // Force refresh after delete
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Failed to delete mark", "error");
      }
    }
  });

  // ---------------------------
  // PDF DOWNLOAD
  // ---------------------------
  async function downloadTableAsPDF(table, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const headers = Array.from(table.querySelectorAll("thead th"))
      .map(th => th.innerText)
      .filter(h => h.toLowerCase() !== "actions");
    const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td"))
        .map(td => td.innerText)
        .filter((_, idx) => headers[idx] !== "Actions")
    );
    doc.text(title, 14, 15);
    doc.autoTable({
      startY: 20,
      head: [headers],
      body: rows,
      styles: { fontSize: 10 }, // Keep existing styles
      headStyles: { fillColor: [22, 160, 133] }, // Keep existing styles
      showHead: 'everyPage',
      didDrawPage: (data) => {
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100);
        const dateStr = `Generated: ${new Date().toLocaleString()}`;
        doc.text(dateStr, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
        
        // Add page number if needed
        if (data.pageCount && data.pageCount > 1) {
          doc.text(`Page ${data.pageNumber} of ${data.pageCount}`, doc.internal.pageSize.getWidth() - data.settings.margin.right, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
        }
      }
    });
    doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
  }

  submittedMarksContainer.addEventListener("click", e => {
    const btn = e.target.closest(".pdf-btn");
    if (!btn) return;

    const details = btn.closest("details");
    const table = details.querySelector("table");

    // Use the mapping to generate a professional title for the PDF
    const mapping = window.ASSESSMENT_MAPPING || {};
    const key = btn.dataset.key; // "Subject_Assessment_Grade_Term_Year"
    const parts = key.split('_');
    
    const subjectIdentifier = parts[0].replace(/-/g, ' ');
    const assessment = parts[1];
    const grade = parts[2];
    const term = parts[3];
    const year = parts[4];
    const assessmentLabel = mapping[assessment] || `Assessment ${assessment}`;

    const cleanTitle = `${grade} - ${subjectIdentifier} ${assessmentLabel} Report (Term ${term}, ${year})`;
    downloadTableAsPDF(table, cleanTitle);
  });

  // ---------------------------
  // INITIAL LOAD
  // ---------------------------
  (async function init() {
    await loadTeacherProfile();

    if (logoutBtn) {
      logoutBtn.style.display = "none";
    }

    // Initialize Tabs
    setupTabs();
    
    // 🆕 Move termLockMessageEl to the desired position
    const marksControls = document.querySelector('.marks-controls');
    const step1Heading = marksControls?.querySelector('h3'); // Assuming "Step 1" is an h3

    if (marksControls && step1Heading && termLockMessageEl) {
        // Create a wrapper for the heading and the lock message
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'lock-message-wrapper'; // Add a class for specific styling
        headerWrapper.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; margin-bottom: 15px;';

        // Move the h3 into the wrapper
        headerWrapper.appendChild(step1Heading);

        // Move the termLockMessageEl into the wrapper
        headerWrapper.appendChild(termLockMessageEl);

        // Prepend the wrapper to marksControls
        marksControls.prepend(headerWrapper);
    } else if (marksControls && termLockMessageEl) {
        // Fallback if h3 is not found, just prepend the message
        marksControls.prepend(termLockMessageEl);
    }

    await loadSchoolName();

    // Step 2.5: Render signature UI now that school info is available
    renderSignatureUI(teacher);
    
    await loadTeacherAllocations();
    
    await loadSubmittedMarks();
    
    // 🆕 Initial check for term lock status
    await checkTermLockStatus();
  })();
});