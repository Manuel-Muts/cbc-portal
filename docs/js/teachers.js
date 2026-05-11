document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------
  // STYLES FOR COMPACTNESS
  // ---------------------------
  const compactStyle = document.createElement("style");
  compactStyle.textContent = `
    .marks-table th, .marks-table td, #marksEntryTable th, #marksEntryTable td { 
      padding: 5px 8px !important; 
      font-size: 0.82rem !important; 
      line-height: 1.2 !important;
      vertical-align: middle !important;
      border: 1px solid #e2e8f0 !important;
    }
    .marks-table th, #marksEntryTable th {
      background-color: #f8fafc !important;
      font-weight: 600 !important;
      color: #475569 !important;
      text-transform: uppercase !important;
      font-size: 0.72rem !important;
    }
    .marks-accordion-summary {
      padding: 8px 12px !important;
    }
    .marks-entry-input {
      height: 28px !important;
      padding: 2px 6px !important;
      font-size: 0.8rem !important;
    }
    .marks-input-grid {
      gap: 4px !important;
    }

    /* Fixed Toast Container for visibility on mobile when scrolling */
    #toastContainer {
      position: fixed;
      top: 20px;
      right: 15px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      align-items: flex-end;
    }
    .toast {
      pointer-events: auto;
      position: relative !important; /* Override fixed pos from teachers.css */
      top: auto !important;
      left: auto !important;
      right: auto !important;
      transform: none !important;
      padding: 12px 18px;
      border-radius: 8px;
      color: white !important;
      font-weight: 600;
      font-size: 0.9rem;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      min-width: 200px;
      max-width: 350px;
      box-sizing: border-box;
      animation: toastFadeIn 0.3s ease-out, toastFadeOut 0.5s ease-in 3.2s forwards;
      white-space: normal;
      word-wrap: break-word;
      overflow-wrap: break-word;
      display: block;
    }
    .toast-success { background: #38a169 !important; }
    .toast-error { background: #e53e3e !important; }
    .toast-warning { background: #d69e2e !important; }
    .toast-info { background: #3182ce !important; }

    @keyframes toastFadeIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toastFadeOut {
      from { opacity: 1; }
      to { opacity: 0; transform: translateY(-10px); }
    }
  
    #schoolName {
      display: block;
      width: 100%;
      text-align: center;
      margin-bottom: 6px;
      font-size: 1.1rem !important;
      font-weight: 800 !important;
      color: #2d3748;
    }
    #teacherName {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      width: 100%;
    }
      
    @media (min-width: 768px) {
      #schoolName { width: auto; text-align: left; margin-bottom: 0; font-size: 1.25rem !important; }
      #teacherName { width: auto; justify-content: flex-end; }
    }

    @media (max-width: 767px) {
      #toastContainer {
        top: 10px;
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        width: 95%;
        max-width: 450px;
        align-items: stretch;
      }
      .toast {
        width: 100%;
        min-width: auto;
        max-width: 100%;
        text-align: center;
      }
      @keyframes toastFadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    }
  `;
  document.head.appendChild(compactStyle);

  // ---------------------------
  // CONFIG + GLOBALS
  // ---------------------------
  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  console.log("🔧 Teachers.js loading...");
  console.log("📦 Window.config available:", !!window.config);
  
  const API_BASE = config.api.baseURL;

  let allMarksEntered = new Map(); // Stores marks for all students in the current context across pages
  let submittedMarks = []; // in-memory marks list
  let editingMarkId = null;
  let teacher = null;

  // Pagination for individual student tables inside Submitted Marks
  const STUDENTS_PER_TABLE_PAGE = 10;
  const subTablePageMap = new Map();
  const subSearchMap = new Map(); // Track search terms for each group
  let activeSearchInfo = { key: null, cursor: 0 }; // Persist focus during re-renders
  const openAccordions = new Set();

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
  
  // Draft & Copy functionality
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const loadDraftBtn = document.getElementById("loadDraftBtn");
  const draftStatus = document.getElementById("draftStatus");
  const draftTime = document.getElementById("draftTime");
  
  const assessmentSelect = document.getElementById("assessmentSelect");
  const logoutBtn = document.getElementById("logoutBtn");
  const submittedMarksContainer = document.getElementById("submittedMarksContainer");

  // Global variables for submitted marks pagination
  let submittedMarksCurrentPage = 1;
  const SUBMITTED_MARKS_LIMIT = 10; // 10 groups (accordions) per page
  let submittedMarksTotalPages = 1;
  // To store the keys of all groups for pagination, populated after fetching all marks
  let submittedMarksGroupedKeys = [];
 
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
  }

  // 🆕 Reset table when context changes to prevent data pollution across terms/assessments
  [marksTermSelect, marksAssessmentSelect, marksYearInput].forEach(el => {
    el?.addEventListener("change", () => {
      if (marksEntryTableBody && marksEntryTableBody.innerHTML !== "") {
        resetMarksTable();
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
  const STUDENTS_PER_PAGE = 15;

  // ---------------------------
  // AUTHENTICATION
  // ---------------------------
  async function loadTeacherProfile() {
    teacher = await authService.getUserProfile(["teacher", "classteacher"]);
    if (!teacher) return;

    console.log("✅ Teacher authenticated:", teacher.name);
    window.currentTeacher = teacher;
    updateTeacherNameUI();
    authService.initLogout();

    if (!teacher.schoolId) {
        console.error("Teacher profile missing schoolId:", teacher);
        return authService.redirectToLogin();
      }
  }

    function updateTeacherNameUI() {
    const teacherNameEl = document.getElementById("teacherName");
    if (teacherNameEl && teacher) {
      teacherNameEl.innerHTML = `
        <span style="font-weight: 600; color: #4a5568;">${(teacher.name || "TEACHER").toUpperCase()}</span>
        ${teacher.isDean ? `
          <a href="dean-dashboard.html" class="btn secondary-btn" style="font-size:0.7rem; padding:4px 10px; text-decoration:none; border-radius:6px; font-weight:600; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            🎓 DEAN PANEL
          </a>
        ` : ''}
        <button id="headerRefreshBtn" title="Refresh Dashboard" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:inherit; transition: transform 0.5s ease; display: flex; align-items: center; padding: 0;">
          🔄
        </button>
      `;

      document.getElementById("headerRefreshBtn")?.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        btn.style.transform = "rotate(360deg)";
        
        setTimeout(() => {
          localStorage.removeItem("teacher_allocations_cache");
          localStorage.removeItem("user_profile_cache");
          localStorage.removeItem("teacher_school_cache");
          localStorage.removeItem("teacher_marks_cache");
          localStorage.removeItem("teacher_materials_cache");
          window.location.reload();
        }, 500);
      });
    }
  }

  function renderSignatureUI(user) {
    const container = document.getElementById("allocationsContainer");
    if (!container || !user || !user.isClassTeacher) return; // Only show if user is a class teacher

    // Check if signature UI already exists
    if (document.getElementById("signatureUploadContainer")) return;

    const sigHtml = `
      <div id="signatureUploadContainer" class="signature-card">
        <p class="helper-text">DIGITAL SIGNATURE</p>
        <div id="signaturePreview" class="sig-preview-box">
          ${user.signatureUrl ? 
            `<img src="${user.signatureUrl}" style="max-height: 45px;">` : 
            `<span style="font-size: 0.75rem; color: #a0aec0; font-style: italic;">No signature set</span>`
          }
        </div>
        
        <input type="file" id="signatureUploadInput" accept="image/*" style="display:none">
        <button type="button" id="triggerSignatureUpload" class="btn secondary-btn" style="padding: 5px 12px; font-size: 0.85rem;">
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
            // Upload file to Cloudinary
            const res = await fetch(`${API_BASE}/materials/upload-raw`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Upload failed");

            // Save the Cloudinary URL to the user profile
            await fetch(`${API_BASE}/users/profile/signature`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
  // FETCH SCHOOL NAME
  // ---------------------------
  async function loadSchoolName() {
    const token = authService.getToken();
    if (!token) return;
    
    const CACHE_KEY = "teacher_school_cache";
    const CACHE_DURATION = 15 * 60 * 1000;

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          window.currentSchool = data;
          updateSchoolNameUI(data);
          updateTeacherNameUI();
          return;
        }
      } catch (e) {}
    }

    try {
      const res = await fetch(`${API_BASE}/my-school`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to fetch school");
      const school = await res.json();
      
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: school
      }));

      window.currentSchool = school;
      updateSchoolNameUI(school);
      // Refresh teacher UI to include the school name in the unified header
      updateTeacherNameUI();
    } catch (err) {
      console.error("Load school error:", err);
    }
  }

  function updateSchoolNameUI(school) {
    const schoolNameEl = document.getElementById("schoolName");
    if (schoolNameEl) {
      schoolNameEl.textContent = (school.name || "").toUpperCase();
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
            console.log("✅ Using cached teacher allocations");
            processAllocationsData(data);
            return;
          }
        } catch (e) { console.warn("Cache read error:", e); }
      }
    }

    try {
      console.log("🔍 Starting to load teacher allocations...");
      console.log("📡 API Base URL:", API_BASE);
      const token = authService.getToken();
      
      const res = await fetch(`${API_BASE}/users/subjects/my-allocations`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      console.log("📨 API Response Status:", res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ API Error:", errorData);
        throw new Error(`Failed to fetch allocations (Status: ${res.status})`);
      }
      
      const data = await res.json();
      console.log("✅ Allocations data received:", data);
      
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
      teacherAllocations = data.subjectAllocations;
      console.log(`📚 Loaded ${teacherAllocations.length} allocations`);
      populateSubjectAllocations(teacherAllocations);
    } else {
      console.warn("⚠️ No subjectAllocations in response");
    }
    renderAllocations(data);
  }

  // ---------------------------
  // RENDER ALLOCATIONS (🆕)
  // ---------------------------
  function renderAllocations(data) {
    const container = document.getElementById("allocationsContainer");
    if (!container) return;

    // Use a sub-container for allocations info to avoid wiping siblings like signature UI
    let infoWrapper = document.getElementById("allocationsInfoDisplay");
    if (!infoWrapper) {
      infoWrapper = document.createElement("div");
      infoWrapper.id = "allocationsInfoDisplay";
      infoWrapper.className = "allocation-card";
      container.prepend(infoWrapper);
    }

    let html = '<div style="height: 100%;">';

    // Class Teacher Assignment
    if (data.classTeacherAssignment) {
      html += `
        <h4>🏫 Class Teacher Allocation:</h4>
        <div style="padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
          <strong>${data.classTeacherAssignment.classLabel}</strong>
        </div>
      `;
    } else {
      html += '<p><strong>🏫 Class Teacher Allocation:</strong> None</p>';
    }

    html += '</div>';
    infoWrapper.innerHTML = html;
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
      console.log(`✅ Selected: Class="${selectedAllocationData.classLabel}", Subject="${selectedSubject}"`);
      
      resetMarksTable();
      if (marksTableContainer) marksTableContainer.style.display = "block";
      checkForExistingDraft();
    });
  }

  // ---------------------------
  // NEW: LOAD STUDENTS FOR SELECTED SUBJECT
  // ---------------------------
  async function loadStudentsForSubject(classLabel, page = 1, forceRefresh = false) {
    try {
      console.log(`📚 Loading students for class: ${classLabel} (Page ${page})`);

      const CACHE_KEY = `students_cache_${classLabel}_p${page}`;
      const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for student list

      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { timestamp, data } = JSON.parse(cached);
            if (data && (Date.now() - timestamp < CACHE_DURATION)) {
              console.log("✅ Using cached student list");
              loadedStudents = data.students || data;
              currentStudentPage = data.currentPage || page;
              return data;
            }
            // If cache is stale or invalid, remove it
            else {
              localStorage.removeItem(CACHE_KEY);
              console.log("Cache for students is stale or invalid, fetching new data.");
            }
          } catch (e) {
            console.warn("Student cache parse error:", e);
          }
        }
      }

      console.log("📝 Academic Year:", new Date().getFullYear());
      
      const token = authService.getToken();
      const res = await fetch(`${API_BASE}/enrollments/class/${classLabel}?page=${page}&limit=${STUDENTS_PER_PAGE}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      console.log("📨 API Response Status:", res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("❌ API Error:", errorData);
        throw new Error("Failed to load students");
      }
      
      const data = await res.json();
      
      // Save to cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: data
      }));

      // Handle paginated response
      if (data.students) {
        loadedStudents = data.students;
        // No longer storing all students in loadedStudents, but rather in allMarksEntered
        currentStudentPage = data.currentPage || 1;
      } else if (Array.isArray(data)) {
        loadedStudents = data; // Fallback
      }
      
      console.log(`✅ Loaded ${loadedStudents.length} student(s) from ${classLabel}`);
      loadedStudents.forEach((s, idx) => {
        console.log(`   ${idx + 1}. ${s.name} (ADM: ${s.admissionNo || s.admission}) - Grade: ${s.grade}`);
      });
      
      return data; // Return full data object with pagination metadata
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
      paginationEl.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 20px; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);";
      marksEntryTable.parentElement.appendChild(paginationEl);
    }
    const totalPages = window.lastStudentsFetchTotalPages || 1;
    const totalCount = window.lastStudentsFetchTotalCount || 0;
    const currentBatchSize = currentBatch ? currentBatch.length : 0;
    
    // Calculate the range of students being displayed
    const start = totalCount > 0 ? (currentStudentPage - 1) * STUDENTS_PER_PAGE + 1 : 0;
    const end = Math.min(start + currentBatchSize - 1, totalCount); // Corrected: Calculate end of current batch, capped by totalCount

    paginationEl.innerHTML = `
      <div style="font-weight: 700; color: #2d3748; font-size: 1rem; letter-spacing: 0.025em;">
        Showing ${start}-${end} of ${totalCount}
      </div>
      <div style="display: flex; gap: 12px;">
        <button type="button" id="prevStudentsBtn" class="btn secondary-btn" ${currentStudentPage === 1 ? "disabled" : ""} style="padding: 6px 20px; font-weight: 800; border: 2px solid #cbd5e0; min-width: 80px;">Prev</button>
        <button type="button" id="nextStudentsBtn" class="btn secondary-btn" ${currentStudentPage >= totalPages ? "disabled" : ""} style="padding: 6px 20px; font-weight: 800; border: 2px solid #cbd5e0; min-width: 80px;">Next</button>
      </div>
    `;

    document.getElementById("prevStudentsBtn")?.addEventListener("click", () => {
      if (currentStudentPage > 1) {
        loadStudentsWithPage(currentStudentPage - 1);
      }
    });

    document.getElementById("nextStudentsBtn")?.addEventListener("click", () => {
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
    marksEntryTableBody.innerHTML = "";
    marksEntryTable.classList.add("marks-entry-table-mobile");
    
    if (!students || students.length === 0) {
      const row = marksEntryTableBody.insertRow();
      row.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px; color: #999;">No students found in this class</td>';
      return;
    }

    // Determine if senior school based on first student's grade
    const isSeniorSchool = students.length > 0 ? cbcUtils.isSeniorGrade(students[0].grade) : false;

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
    if (isSeniorSchool) {
      marksColumnHeader.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px;">
          <div>CA (30%)</div>
          <div>PW (20%)</div>
          <div>Exam (50%)</div>
          <div>Final</div>
        </div>
      `;
    } else {
      marksColumnHeader.innerHTML = "Marks (%)";
    }

    // Add student rows
    students.forEach(student => { // student here is from the current page
      const markEntryKey = getMarkEntryKey(student._id);

      // 🆕 Initialize student in global map if not already present
      if (!allMarksEntered.has(markEntryKey)) {
        const markData = {
          studentId: student._id,
          admissionNo: student.admissionNo || student.admission,
          studentName: student.name,
          grade: student.grade,
          stream: student.stream || '',
          term: Number(marksTermSelect.value),
          year: Number(marksYearInput.value),
          assessment: Number(marksAssessmentSelect.value),
          _id: null
        };
        if (isSeniorSchool) {
          markData.course = selectedSubject;
          markData.continuousAssessment = "";
          markData.projectWork = "";
          markData.endTermExam = "";
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
      const existingMark = allMarksEntered.get(markEntryKey);
      
      // ADM and Name columns
     row.innerHTML = `
  <td data-label="Admission">${sanitize(student.admissionNo || student.admission)}</td>
  <td data-label="Name">${sanitize(student.name)}</td>
  <td data-label="Marks" class="marks-entry-cell">
    ${isSeniorSchool ? `
      <div class="marks-input-grid">
        <input type="text" class="marks-entry-input ca-input" inputmode="decimal" placeholder="CA" value="${existingMark?.continuousAssessment ?? ''}" />
        <input type="text" class="marks-entry-input pw-input" inputmode="decimal" placeholder="PW" value="${existingMark?.projectWork ?? ''}" />
        <input type="text" class="marks-entry-input exam-input" inputmode="decimal" placeholder="Exam" value="${existingMark?.endTermExam ?? ''}" />
        <input type="text" class="marks-entry-input final-input" placeholder="Final" value="${existingMark?.finalScore ?? ''}" readonly />
      </div>
    ` : `
      <input type="text" class="marks-entry-input marks-input" inputmode="decimal" placeholder="Score (or X for Absent)" value="${existingMark?.score ?? ''}" />
    `}
  </td>
`;

      // Auto-calculate final score for senior school
      if (isSeniorSchool) {
        const caInput = row.querySelector(".ca-input");
        const pwInput = row.querySelector(".pw-input");
        const examInput = row.querySelector(".exam-input");
        const finalInput = row.querySelector(".final-input");
        
        const updateFinal = () => {
          const score = cbcUtils.calculateFinalScore(caInput.value, pwInput.value, examInput.value);
          finalInput.value = (caInput.value !== "" || pwInput.value !== "" || examInput.value !== "") ? score : "";
        };

        caInput.addEventListener("input", updateFinal);
        pwInput.addEventListener("input", updateFinal);
        examInput.addEventListener("input", updateFinal);

        // Trigger initial calculation if values were pre-filled from existingMark
        if (existingMark?.continuousAssessment || existingMark?.projectWork || existingMark?.endTermExam) {
          updateFinal();
        }
      }
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
    let inputValue = inputElement.value.trim(); // Trim input value immediately

    // Apply validation allowing numbers 0-100 OR 'X'
    if (inputElement.classList.contains("marks-input") ||
        inputElement.classList.contains("ca-input") ||
        inputElement.classList.contains("pw-input") ||
        inputElement.classList.contains("exam-input")) {
        
        const isAbsent = inputValue.toUpperCase() === 'X';
        let numericValue = Number(inputValue);

        if (!isAbsent && isNaN(numericValue) && inputValue !== "") {
            showToast("Please enter a number (0-100) or 'X' for Absent.", "warning");
            inputElement.value = "";
            inputValue = "";
        } else if (!isAbsent && numericValue > 100) {
            inputElement.value = ""; // Make it empty
            inputValue = "";
            showToast("Marks cannot exceed 100. Input cleared.", "error"); // Changed to error
        } else if (!isAbsent && numericValue < 0 && inputValue !== "") {
            inputElement.value = ""; // Make it empty
            inputValue = "";
            showToast("Marks cannot be less than 0. Input cleared.", "warning");
        }
    }

    const admission = row.dataset.admission;
    const name = row.dataset.name;
    const grade = row.dataset.grade;
    const stream = row.dataset.stream;

    const term = marksTermSelect.value;
    const assessment = marksAssessmentSelect.value;
    const year = marksYearInput.value;

    const isSeniorSchool = cbcUtils.isSeniorGrade(grade);
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
      markData.pathway = null;
      if (inputElement.classList.contains("ca-input")) {
          markData.continuousAssessment = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      } else if (inputElement.classList.contains("pw-input")) {
          markData.projectWork = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      } else if (inputElement.classList.contains("exam-input")) {
          markData.endTermExam = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      }
      // Recalculate final score if any component changes
      const ca = row.querySelector(".ca-input")?.value;
      const pw = row.querySelector(".pw-input")?.value;
      const exam = row.querySelector(".exam-input")?.value;
      const finalScore = cbcUtils.calculateFinalScore(ca, pw, exam);
      row.querySelector(".final-input").value = finalScore !== null ? finalScore : "";
      markData.finalScore = finalScore;
    } else {
      markData.subject = selectedSubject;
      if (inputElement.classList.contains("marks-input")) {
          markData.score = inputValue.toUpperCase() === "X" ? "X" : (inputValue === "" ? null : inputValue);
      }
    }


    // When any marks input changes, mark row as modified
    if (e.target.classList.contains("marks-input") || 
        e.target.classList.contains("ca-input") ||
        e.target.classList.contains("pw-input") ||
        e.target.classList.contains("exam-input")) {
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
      let inputsInRow;
      
      // Identify all relevant input fields in the current row
      if (isSeniorSchool) {
        inputsInRow = Array.from(row.querySelectorAll(".ca-input, .pw-input, .exam-input"));
      } else {
        inputsInRow = Array.from(row.querySelectorAll(".marks-input"));
      }

      const currentIndex = inputsInRow.indexOf(currentInput);

      if (currentIndex !== -1) {
        // If there's a next input in the current row, focus it
        if (currentIndex < inputsInRow.length - 1) {
          inputsInRow[currentIndex + 1].focus();
        } else {
          // It's the last input in the current row, move to the first input of the next row
          const nextRow = row.nextElementSibling;
          if (nextRow) {
            const nextInputsInRow = Array.from(nextRow.querySelectorAll(".ca-input, .pw-input, .exam-input, .marks-input"));
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
    const paginationEl = document.getElementById("studentsPagination");
    if (paginationEl) {
      paginationEl.innerHTML = "";
    }
  }

  // ---------------------------
  // TABLE VALIDATION FUNCTION
  // ---------------------------
  function validateMarksTable() {
    const errors = [];
    
    // 🆕 Step 1: Ensure all students in the class roster have been loaded and accounted for
    const totalExpectedCount = window.lastStudentsFetchTotalCount || 0;
    if (totalExpectedCount > 0 && allMarksEntered.size < totalExpectedCount) {
      errors.push(`Class incomplete: You have only captured data for ${allMarksEntered.size} of ${totalExpectedCount} learners. Please scroll through all pages before submitting.`);
    }

    // Validate all marks in the global store, not just the current page
    for (const [key, markData] of allMarksEntered.entries()) {
      if (!markData.term) errors.push(`Student ${markData.studentName}: Term not selected`);
      if (!markData.assessment) errors.push(`Student ${markData.studentName}: Assessment not selected`);

      const isSeniorSchool = cbcUtils.isSeniorGrade(markData.grade);

      const isEmpty = (val) => val === undefined || val === null || String(val).trim() === "" || String(val).toLowerCase() === "null";

      if (isSeniorSchool) {
        if (isEmpty(markData.continuousAssessment) || isEmpty(markData.projectWork) || isEmpty(markData.endTermExam)) {
          errors.push(`Learner ${markData.studentName}: Senior marks (CA, PW, Exam) must all be filled.`);
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

  // This function is no longer needed as marks are collected directly into allMarksEntered
  /*
  function collectMarksDataFromDOM() {
    const marksData = new Map();
    marksEntryTableBody.querySelectorAll("tr").forEach(row => { // Only collects from current page
      const studentId = row.dataset.studentId;
      const isSeniorSchool = cbcUtils.isSeniorGrade(row.dataset.grade);

      const markEntryKey = getMarkEntryKey(studentId);
      let mark = allMarksEntered.get(markEntryKey) || {}; // Get existing or new

      if (isSeniorSchool) {
        mark.continuousAssessment = row.querySelector(".ca-input")?.value;
        mark.projectWork = row.querySelector(".pw-input")?.value;
        mark.endTermExam = row.querySelector(".exam-input")?.value;
      } else {
        marks: marksInput?.value || "",
        ca: caInput?.value || "",
        pw: pwInput?.value || "",
        exam: examInput?.value || ""
      };
    });
    return marksData;
  }

  function populateMarksFromDraft(marksData) {
    marksEntryTableBody.querySelectorAll("tr").forEach(row => {
      const admission = row.dataset.admission;
      if (marksData[admission]) {
        const data = marksData[admission];
        const marksInput = row.querySelector(".marks-input");
        const caInput = row.querySelector(".ca-input");
        const pwInput = row.querySelector(".pw-input");
        const examInput = row.querySelector(".exam-input");

        if (marksInput && data.marks) marksInput.value = data.marks;
        if (caInput && data.ca) {
          caInput.value = data.ca;
          // Trigger auto-calculation
          caInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (pwInput && data.pw) {
          pwInput.value = data.pw;
          pwInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (examInput && data.exam) {
          examInput.value = data.exam;
          examInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        row.style.backgroundColor = "#fffacd"; // Light yellow to show restored
      }
    });
  }*/

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
      if (!selectedAllocationData) {
        showToast("Please select a subject/class first", "error");
        return;
      }

      if (!selectedSubject) {
        showToast("Please select a specific subject", "error");
        return;
      }

      if (!marksTermSelect.value || !marksAssessmentSelect.value || !marksYearInput.value) {
        showToast("Please select Term and Assessment", "error");
        return;
      }

      console.log("🔄 Loading Learners...");
      console.log(`   Class: ${selectedAllocationData.classLabel}`);
      console.log(`   Subject: ${selectedSubject}`);
      console.log(`   Term: ${marksTermSelect.options[marksTermSelect.selectedIndex].text}`);
      console.log(`   Assessment: ${marksAssessmentSelect.options[marksAssessmentSelect.selectedIndex].text}`);
      console.log(`   Year: ${marksYearInput.value}`);

      loadStudentsBtn.disabled = true;
      loadStudentsBtn.innerHTML = '<span class="spinner"></span>Loading...';

      await loadStudentsWithPage(1); // Load first page on manual click
      
      loadStudentsBtn.disabled = false;
      loadStudentsBtn.innerHTML = "📥 Load Learners";
    });
  }

  async function loadStudentsWithPage(page) {
    try {
      const response = await loadStudentsForSubject(selectedAllocationData.classLabel, page);
      const students = response.students || response;
      const totalPages = response.totalPages || 1;
      window.lastStudentsFetchTotalPages = totalPages; // Store globally for pagination controls
      window.lastStudentsFetchTotalCount = response.total || students.length;

      displayStudentsInMarksTable(students);

      if (students.length > 0) {
        showToast(`✅ Loaded ${students.length} Learner(s) from ${selectedAllocationData.classLabel}`, "success");
      } else {
        showToast(`⚠️ No Learners found in ${selectedAllocationData.classLabel}`, "warning");
      }
    } catch (err) {
      showToast("❌ Failed to load Learners: " + err.message, "error");
    }
  }

  // ---------------------------
  // NEW: SUBMIT ALL MARKS
  // ---------------------------
  if (submitAllMarksBtn) {
    submitAllMarksBtn.addEventListener("click", async () => {
      if (allMarksEntered.size === 0) {
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
        const isSeniorSchool = cbcUtils.isSeniorGrade(markData.grade);
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
          let pathway = null;

          for (const pway in seniorSchoolPathways) {
            if (seniorSchoolPathways[pway].map(s => s.toLowerCase()).includes(course.toLowerCase())) {
              pathway = pway;
              break;
            }
          }

          if (!pathway) {
            showToast(`Error: Could not find Pathway for the course "${course}" for student ${markData.studentName}. Please check senior school configurations.`, "error");
            hasCriticalErrors = true;
            break; // Stop processing all marks
          }
          
          markPayload.pathway = pathway;
          markPayload.course = course;
          markPayload.continuousAssessment = (String(markData.continuousAssessment).toUpperCase() === "X") ? null : (markData.continuousAssessment !== null && markData.continuousAssessment !== "" ? Number(markData.continuousAssessment) : null);
          markPayload.projectWork = (String(markData.projectWork).toUpperCase() === "X") ? null : (markData.projectWork !== null && markData.projectWork !== "" ? Number(markData.projectWork) : null);
          markPayload.endTermExam = (String(markData.endTermExam).toUpperCase() === "X") ? null : (markData.endTermExam !== null && markData.endTermExam !== "" ? Number(markData.endTermExam) : null);
          markPayload.finalScore = (String(markData.finalScore).toUpperCase() === "X") ? null : (markData.finalScore !== null && markData.finalScore !== "" ? Number(markData.finalScore) : null);

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

      let confirmationMessage = `You are submitting ${marksToSubmit.length} marks (${newMarksCount} new, ${updatedMarksCount} updates). Do you want to continue?`; // This message is still accurate
      if (!await cbcUtils.showConfirmToast(confirmationMessage)) {
        return;
      }

    submitAllMarksBtn.disabled = true;
    submitAllMarksBtn.innerHTML = '<span class="spinner"></span>Submitting...';

    try {
      let successCount = 0;
      let failureCount = 0;
      const token = authService.getToken();

      // Send all marks in a single bulk request
      const res = await fetch(`${API_BASE}/marks/bulk-add-update`, { // New endpoint
        method: "POST", // Use POST for bulk operation
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(marksToSubmit) // Send the entire array
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error during bulk submission" }));
        throw new Error(errorData.message || "Bulk submission failed");
      }

      const result = await res.json(); // Expecting { successCount, failureCount } from backend

      showToast(`✅ Processed: ${result.successCount} mark(s) saved/updated, ${result.failureCount} failed`, result.successCount > 0 ? "success" : "error");

      if (result.successCount > 0) { // Check result.successCount from backend
        await loadSubmittedMarks(true); // Force refresh after submission
        marksEntryTableBody.innerHTML = "";
        // marksTableContainer.style.display = "none"; // Keep visible for next entry
        subjectAllocationSelect.value = "";
        clearDraft(); // Clear saved draft after successful submission

        // Auto-switch to Submitted Marks tab
        const submittedTabBtn = document.querySelector('[data-tab="submittedMarks"]');
        if (submittedTabBtn) submittedTabBtn.click();
      }
    } catch (err) {
      console.error("Submit marks error:", err);
      showToast("Error submitting marks", "error");
    } finally {
      submitAllMarksBtn.disabled = false;
      submitAllMarksBtn.innerHTML = "✅ Submit All Marks";
    }
    });
  }

  // ---------------------------
  // GRADE & SUBJECTS DATA
  // ---------------------------
  // ---------------------------
  // SENIOR SCHOOL PATHWAYS & COURSES
  // ---------------------------
  const seniorSchoolPathways = {
    STEM: [
      "Mathematics",
      "Biology",
      "Chemistry",
      "Physics",
      "Business Studies",
      "Computer Studies",
      "Environmental Science",
      "Engineering Technology",
      "Applied Sciences",
      "Electricity",
      "Aviation",
      "Agriculture",
      "Marine and Fisheries",
      "Building and Construction",
      "Woodwork",
      "Metalwork",
      "Power Mechanics",
      "General Science",
      "Home Science",
      "Media Technology"
    ],
    "Social Sciences": [
      "History & Citizenship",
      "Geography",
      "Mathematics",
      "Business Studies",
      "Political Studies",
      "Christian Religious Studies (CRE)",
      "Kenya Sign Language",
      "Literature in English",
      "Fasihi ya Kiswahili",
      "Indigenous Language",
      "Hindu Religious Education",
      "French",
      "German",
      "Islamic Religious Education",
    ],
    "Arts & Sports Science": [
      "French",
      "Hindu Religious Education",
      "Mathematics",
      "Computer Studies",
      "Literature in English",
      "Islamic Religious Education",
      "German",
      "Fasihi ya Kiswahili",
      "Kiswahili",
      "History & Citizenship",
      "Geography",
      "Biology",
      "General Science",
      "Fine Art",
      "Film & Media Studies",
      "Fashion & Design",
      "Fasihi ya Kiswahili",
       "Music and Dance",
      "Theatre and Film",
      "Sports and Recreation"
    ]
  };



  async function loadSubmittedMarks(forceRefresh = false) {
    const CACHE_KEY = "teacher_marks_cache";

    // 🆕 Reset to first page when forcing a refresh (e.g., after submission)
    if (forceRefresh) submittedMarksCurrentPage = 1;

    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            console.log("✅ Using cached submitted marks");
            // Handle both legacy array cache and new paginated object structure
            submittedMarks = Array.isArray(data) ? data : (data.marks || []);
            window.currentMarks = submittedMarks; // Keep for compatibility if needed elsewhere
            displayPaginatedMarksGroups(submittedMarksCurrentPage); // Call new function
            // Ensure all details are visible after loading
            submittedMarksContainer.querySelectorAll("details").forEach(d => {
              d.style.display = "";
            });
            return;
          }
        } catch (e) { console.warn("Cache read error:", e); }
      }
    }

    try {
      // 🚀 Fetch with a high limit (1000) to ensure multiple class groups are captured for the accordions
      console.log("Fetching marks from:", `${API_BASE}/marks/teacher?limit=1000`);
      const token = authService.getToken();
      const res = await fetch(`${API_BASE}/marks/teacher?limit=1000`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log("Response status:", res.status);
      
      if (res.status === 403) {
        alert("You are not authorized to view marks.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch marks");
      
      const data = await res.json();
      // Extract the marks array from the paginated object returned by the backend
      submittedMarks = Array.isArray(data) ? data : (data.marks || []);
      console.log("Loaded marks:", submittedMarks);
      subTablePageMap.clear(); // Reset sub-pagination on fresh load
      subSearchMap.clear(); // Reset searches on fresh load

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: submittedMarks
      }));

      console.log("Marks array type:", Array.isArray(submittedMarks));
      console.log("Marks count:", submittedMarks.length);
      
      window.currentMarks = submittedMarks; // Keep for compatibility if needed elsewhere
      displayPaginatedMarksGroups(submittedMarksCurrentPage); // Call new function
    } catch (err) {
      console.error("Load marks error:", err);
      console.error("Error stack:", err.stack);
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
    console.log("Displaying paginated marks groups for page:", page);
    console.log("Total submitted marks:", submittedMarks ? submittedMarks.length : 0);
    
    if (!submittedMarks || !Array.isArray(submittedMarks)) {
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks data available.</p>';
      console.log("DEBUG: submittedMarks is not an array or is empty.");
      return;
    }

    const grouped = {};
    submittedMarks.forEach(m => {
      // Ensure all key components are strings and handle potential null/undefined gracefully
      const grade = (m.grade !== undefined && m.grade !== null) ? String(m.grade) : 'unknown-grade';
      const term = (m.term !== undefined && m.term !== null) ? String(m.term) : 'unknown-term';
      const year = (m.year !== undefined && m.year !== null) ? String(m.year) : 'unknown-year';
      const assessment = (m.assessment !== undefined && m.assessment !== null) ? String(m.assessment) : 'unknown-assessment';

      const isSenior = cbcUtils.isSeniorGrade(grade);
      const subjectKey = isSenior 
        ? (m.course ? String(m.course) : 'no-course') 
        : (m.subject ? String(m.subject) : 'no-subject');
      
      console.log(`DEBUG: Processing mark for student ${m.studentName || m.admissionNo}. Components: Grade=${grade}, Term=${term}, Year=${year}, Assessment=${assessment}, SubjectKey=${subjectKey}`);
      
      // Normalize grade (e.g., "5" vs "Grade 5") to ensure consistent grouping
      const gradeNorm = cbcUtils.normalizeGrade(grade);
      // Form key by Subject, Assessment, Grade, Term, Year as requested
      const key = `${subjectKey}_${m.assessment}_${gradeNorm}_${m.term}_${m.year}`;

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    
    console.log("Grouped marks:", grouped); // DEBUG
    
    // Sort keys descending so newest years/terms appear at the top (Note: Alphabetical sort by subject name first)
    submittedMarksGroupedKeys = Object.keys(grouped).sort().reverse(); 
    const totalGroups = submittedMarksGroupedKeys.length;
    submittedMarksTotalPages = Math.ceil(totalGroups / SUBMITTED_MARKS_LIMIT);
    submittedMarksCurrentPage = page;

    if (page > submittedMarksTotalPages && totalGroups > 0) {
      displayPaginatedMarksGroups(1);
      console.log("DEBUG: Page out of bounds, resetting to page 1.");
      return;
    }

    const startIndex = (page - 1) * SUBMITTED_MARKS_LIMIT;
    const endIndex = startIndex + SUBMITTED_MARKS_LIMIT;
    const keysForCurrentPage = submittedMarksGroupedKeys.slice(startIndex, endIndex);
    
    submittedMarksContainer.innerHTML = '';
    if (!keysForCurrentPage.length) {
      console.log("DEBUG: No keys for current page.");
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks submitted yet.</p>';
      renderSubmittedMarksPaginationControls();
      return;
    }
    keysForCurrentPage.forEach(key => {
      try {
        const fullGroupMarksRaw = grouped[key];
        const searchTerm = subSearchMap.get(key) || "";
        
        // Filter group marks based on local search term
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
        
        const headerInfo = fullGroupMarksRaw[0]; // Use raw data for header metadata
        const details = document.createElement('details');
        details.open = openAccordions.has(key); // Persist open state
        details.className = 'marks-accordion';
        details.ontoggle = () => {
            console.log(`Accordion ${key} toggled. New state: ${details.open}`); // Debug log
            if (details.open) {
                openAccordions.add(key);
                contentWrapper.style.display = 'block'; // Explicitly show content
            } else {
                openAccordions.delete(key);
                contentWrapper.style.display = 'none'; // Explicitly hide content
            }
        };
        const mapping = window.ASSESSMENT_MAPPING || {};
        const assessmentLabel = mapping[headerInfo.assessment] || `Assessment ${headerInfo.assessment}`;

        // Determine if senior school to show appropriate table headers
        const gradeMatch = (headerInfo.grade || "").toString().match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const groupIsSenior = gradeNum >= 10 && gradeNum <= 12;

        const subjectDisplay = groupIsSenior ? `${headerInfo.pathway || 'N/A'} - ${headerInfo.course || 'N/A'}` : (headerInfo.subject || '').replace(/-/g, ' ');
        const summaryText = `Grade: ${sanitize(headerInfo.grade)} • ${sanitize(subjectDisplay)} • Term: ${sanitize(headerInfo.term)} • Year: ${sanitize(headerInfo.year)} • ${assessmentLabel} — ${totalStudents} record${totalStudents > 1 ? 's' : ''}`;

        const summary = document.createElement('summary');
        summary.className = 'marks-accordion-summary';
        summary.innerHTML = `<strong>${summaryText}</strong>`;

        // 🏗️ Wrap accordion content in a div to prevent nesting/rendering glitches
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'marks-accordion-content';
        contentWrapper.style.display = details.open ? 'block' : 'none'; // Set initial display based on open state
        
       // const pdfBtn = document.createElement('button');
       // pdfBtn.className = 'pdf-btn';
       // pdfBtn.textContent = '📄 PDF';
        //pdfBtn.dataset.key = key;
        
        // Search Input for this specific table
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search name or adm...';
        searchInput.value = searchTerm;
        searchInput.style.cssText = "padding: 3px 12px; font-size: 0.75rem; border: 1px solid #cbd5e0; border-radius: 8px; margin-left: 15px; width: 210px; outline: none; background: #fff;";
        
        // Prevent accordion toggle when clicking search input
        searchInput.addEventListener('click', e => e.stopPropagation());
        
        searchInput.addEventListener('input', e => {
          const val = e.target.value.toLowerCase();
          activeSearchInfo = { key, cursor: e.target.selectionStart };
          subSearchMap.set(key, val);
          subTablePageMap.set(key, 1); // Reset to first page on search
          displayPaginatedMarksGroups(submittedMarksCurrentPage);
        });

        // Restore focus and cursor position after re-render
        if (activeSearchInfo.key === key) {
          setTimeout(() => {
            searchInput.focus();
            searchInput.setSelectionRange(activeSearchInfo.cursor, activeSearchInfo.cursor);
          }, 0);
        }

        const table = document.createElement('table');
        table.classList.add('marks-table');
        
        // Different headers for senior vs junior school
        let thead = `
          <thead>
              <tr>
                  <th>Admission</th>
                  <th>Name</th>
                  <th>Subject/Course</th>
        `;
        
              if (groupIsSenior) {
              thead += `<th>Continuous Assessment (30%)</th>
            <th>Project Work (20%)</th>
            <th>End-Term Exam (50%)</th>
            <th>Final Score</th>`;
             } else {
             thead += `<th>Score (%)</th>`;
             }
        
        thead += `<th>Actions</th>
              </tr>
          </thead>`;
        let tbody = `<tbody>
              ${pagedGroupMarks.map(m => {
          const subjectDisplay = groupIsSenior ? `${m.pathway || 'N/A'} - ${m.course || 'N/A'}` : (m.subject || '').replace(/-/g, ' ');
          
          
          let scoreCell = '';
           if (groupIsSenior) {
          const ca = m.continuousAssessment ?? '-';
          const pw = m.projectWork ?? '-';
           const et = m.endTermExam ?? '-';
           const finalScore = m.finalScore ?? '-';
          scoreCell = `<td data-label="Continuous Assessment">${sanitize(ca)}</td>
               <td data-label="Project Work">${sanitize(pw)}</td>
               <td data-label="End-Term Exam">${sanitize(et)}</td>
               <td data-label="Final Score"><strong>${sanitize(finalScore)}</strong></td>`;
          } else {
          scoreCell = `<td data-label="Score">${sanitize(m.score ?? '-')}</td>`;
         }
          
          return `<tr data-id="${m._id || ''}">
                      <td data-label="Admission">${sanitize(m.admissionNo ?? m.admission ?? '')}</td>
                      <td data-label="Name">${sanitize(m.studentName)}</td>
                      <td data-label="Subject/Course">${sanitize(subjectDisplay)}</td>
                      ${scoreCell}
                      <td data-label="Actions">
                          <button class="btn-edit" data-action="edit">✏️</button>
                          <button class="btn-delete" data-action="delete">🗑️</button>
                      </td>
                  </tr>`;
        }).join('')}
          </tbody>
        `;
        
        table.innerHTML = `<caption class="sr-only">${summaryText}</caption>${thead}${tbody}`;

        details.appendChild(summary);
        // contentWrapper.appendChild(pdfBtn);
        contentWrapper.appendChild(searchInput);
        contentWrapper.appendChild(table);

        // Sub-pagination controls for the individual table
        if (totalSubPages > 1) {
          const subPagination = document.createElement('div');
          subPagination.className = 'sub-pagination-controls';
          subPagination.style.cssText = "display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 10px; padding: 5px 10px; border-top: 1px solid #edf2f7;";
          subPagination.innerHTML = `
            <span style="font-size: 0.75rem; color: #718096;">Showing ${startIndex + 1}-${Math.min(startIndex + STUDENTS_PER_TABLE_PAGE, totalStudents)} of ${totalStudents}</span>
            <div style="display:flex; gap:5px;">
              <button class="btn sub-prev-btn" ${currentSubPage === 1 ? 'disabled' : ''} style="padding: 2px 8px; font-size: 0.7rem;">Prev</button>
              <button class="btn sub-next-btn" ${currentSubPage === totalSubPages ? 'disabled' : ''} style="padding: 2px 8px; font-size: 0.7rem;">Next</button>
            </div>
          `;
          
          subPagination.querySelector('.sub-prev-btn').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            subTablePageMap.set(key, currentSubPage - 1);
            displayPaginatedMarksGroups(submittedMarksCurrentPage);
          };
          subPagination.querySelector('.sub-next-btn').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            subTablePageMap.set(key, currentSubPage + 1);
            displayPaginatedMarksGroups(submittedMarksCurrentPage);
          };
         contentWrapper.appendChild(subPagination);
        }
      details.appendChild(contentWrapper);
        submittedMarksContainer.appendChild(details);
      } catch (err) {
        console.error("Error rendering marks group:", err, key);
      }
    });
    renderSubmittedMarksPaginationControls();
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
    if (btn.dataset.action === "edit") {
      // NEW EDIT LOGIC FOR TABLE-BASED ENTRY
      const mark = submittedMarks.find(m => m._id === id);
      if (!mark) return showToast("Error: Mark data not found.", "error");

      // Robust Grade extraction (from mark object)
      const markGradeStr = (mark.grade || "").toString();
      const markGradeMatch = markGradeStr.match(/\d+/);
      const markGradeNum = markGradeMatch ? parseInt(markGradeMatch[0], 10) : 0;

      showToast("Loading learner for editing...", "info");

      const isSeniorSchool = markGradeNum >= 10 && markGradeNum <= 12;

      // 1. Find the correct allocation in the dropdown by normalizing subject/course names and grade
      const allocationOption = Array.from(subjectAllocationSelect.options).find(opt => {
        const classLabelForOption = opt.dataset.classLabel || '';
        const subjectForOption = opt.dataset.subject || '';
        const gradeNumberInLabel = parseInt(classLabelForOption.match(/\d+/)?.[0], 10);
        
        if (gradeNumberInLabel !== markGradeNum) return false;

        // Normalize helper: lowercase, replace hyphens with spaces, trim
        const normalize = s => (s || '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        
        const optSub = normalize(subjectForOption);
        const markSub = normalize(mark.subject);
        const markCourse = normalize(mark.course);

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

        // 7. Populate the mark inputs in that specific row
        if (isSeniorSchool) {
          const caInput = studentRow.querySelector(".ca-input");
          const pwInput = studentRow.querySelector(".pw-input");
          const examInput = studentRow.querySelector(".exam-input");
          if (caInput) caInput.value = mark.continuousAssessment ?? '';
          if (pwInput) pwInput.value = mark.projectWork ?? ''; // Fix: Use pwInput
          if (examInput) examInput.value = mark.endTermExam ?? ''; // Fix: Use examInput
          // Trigger final score calculation and update allMarksEntered
          caInput?.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // Junior school
          const marksInput = studentRow.querySelector(".marks-input");
          if (marksInput) marksInput.value = mark.score ?? '';
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
      if (!confirm("Delete this mark?")) return;
      try {
        const token = authService.getToken();
        const res = await fetch(`${API_BASE}/marks/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
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
    console.log("🚀 Dashboard initialization started");
    console.log("📝 Step 1: Loading teacher profile...");
    await loadTeacherProfile();
    console.log("✅ Step 1 complete");

    // Initialize Tabs
    setupTabs();
    
    console.log("📝 Step 2: Loading school name...");
    await loadSchoolName();
    console.log("✅ Step 2 complete");

    // Step 2.5: Render signature UI now that school info is available
    renderSignatureUI(teacher);
    
    console.log("📝 Step 3: Loading teacher allocations...");
    await loadTeacherAllocations();
    console.log("✅ Step 3 complete");
    
    console.log("📝 Step 4: Loading submitted marks...");
    await loadSubmittedMarks();
    console.log("✅ Step 4 complete (Materials dashboard separated)");
    
    console.log("🎉 Dashboard initialization complete!");
  })();
});