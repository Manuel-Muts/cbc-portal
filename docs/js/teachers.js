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

  let submittedMarks = []; // in-memory marks list
  let editingMarkId = null;
  let teacher = null;

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
  // ---------------------------
  // HELPER FUNCTIONS (Logic Consolidation)
  // ---------------------------
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
  if (marksAssessmentSelect) {
    marksAssessmentSelect.value = "0"; // Default to Midterm
  }

  // ---------------------------
  // NEW: STORE TEACHER ALLOCATIONS & STUDENTS
  // ---------------------------
  let teacherAllocations = [];
  let selectedAllocationData = null;
  let selectedSubject = null; // 🆕 Store selected subject
  let loadedStudents = [];
  let currentStudentPage = 1;
  const STUDENTS_PER_PAGE = 20;

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
        <span>${(teacher.name || "TEACHER").toUpperCase()}</span>
        ${teacher.isDean ? `
          <a href="dean-dashboard.html" class="btn secondary-btn" style="margin-left:15px; font-size:0.75rem; padding:5px 12px; text-decoration:none; display:inline-block; vertical-align:middle; border-radius:6px; font-weight:600; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            🎓 DEAN PANEL
          </a>
        ` : ''}
        <button id="headerRefreshBtn" title="Refresh Dashboard" style="background:none; border:none; cursor:pointer; margin-left:10px; font-size:1.1rem; color:inherit; vertical-align:middle; transition: transform 0.5s ease;">
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
        <h4>🏫 Class Teacher Assignment:</h4>
        <div style="padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
          <strong>${data.classTeacherAssignment.classLabel}</strong>
        </div>
      `;
    } else {
      html += '<p><strong>🏫 Class Teacher Assignment:</strong> None</p>';
    }

    html += '</div>';
    infoWrapper.innerHTML = html;
  }


  // ---------------------------
  // ASSESSMENT SELECT POPULATE
  // ---------------------------
  (function populateAssessments() {
    const selectElements = [assessmentSelect, marksAssessmentSelect].filter(el => el);
    selectElements.forEach(select => {
      select.innerHTML = '<option value="">-- Select Assessment --</option>';
      const midterm = document.createElement("option");
      midterm.value = 0;
      midterm.textContent = "Midterm";
      select.appendChild(midterm);
      
      for (let i = 1; i <= 4; i++) {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `Assessment ${i}`;
        select.appendChild(opt);
      }
      const endTerm = document.createElement("option");
      endTerm.value = 5;
      endTerm.textContent = "End Term";
      select.appendChild(endTerm);
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
  // PAGINATION CONTROLS
  // ---------------------------
  function updateStudentsPaginationControls() {
    let paginationEl = document.getElementById("studentsPagination");
    if (!paginationEl) {
      paginationEl = document.createElement("div");
      paginationEl.id = "studentsPagination";
      paginationEl.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px; padding: 10px;";
      marksEntryTable.parentElement.appendChild(paginationEl);
    }

    // If we can't determine total pages from global context easily here without storing it, 
    // we rely on the caller or just basic next/prev logic. 
    // For simplicity, we will just render buttons. 
    // Ideally loadStudentsForSubject response should drive this, but displayStudentsInMarksTable takes an array.
    // Let's assume we have stored total pages or check loadedStudents length.
    // However, best to just render simplistic controls here or rely on the `loadStudentsBtn` logic to pass metadata.
    // Let's clear it here and let the load function handle rendering if needed, or:
    
    paginationEl.innerHTML = `
      <button type="button" id="prevStudentsBtn" class="btn secondary-btn" ${currentStudentPage === 1 ? "disabled" : ""} style="padding: 5px 10px; font-size: 0.9em;">Previous</button>
      <span style="font-weight: bold; color: #555;">Page ${currentStudentPage}</span>
      <button type="button" id="nextStudentsBtn" class="btn secondary-btn" style="padding: 5px 10px; font-size: 0.9em;">Next</button>
    `;

    document.getElementById("prevStudentsBtn")?.addEventListener("click", () => {
      if (currentStudentPage > 1) {
        const btn = document.getElementById("loadStudentsBtn");
        if (btn) btn.click(); // Re-trigger load but we need to inject page logic
        loadStudentsWithPage(currentStudentPage - 1);
      }
    });

    document.getElementById("nextStudentsBtn")?.addEventListener("click", () => {
      loadStudentsWithPage(currentStudentPage + 1);
    });
  }

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
    const isSeniorSchool = cbcUtils.isSeniorGrade(students[0].grade);

    // 🆕 Update table title to show selected subject
    const marksControlsSection = document.querySelector('.marks-controls');
    if (marksControlsSection && selectedSubject) {
      let titleElement = marksControlsSection.querySelector('.selected-subject-title');
      if (!titleElement) {
        titleElement = document.createElement('div');
        titleElement.className = 'selected-subject-title';
        marksControlsSection.appendChild(titleElement);
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
    students.forEach(student => {
      const row = marksEntryTableBody.insertRow();
      row.dataset.studentId = student._id;
      row.dataset.admission = student.admissionNo || student.admission;
      row.dataset.name = student.name;
      row.dataset.grade = student.grade;
      row.dataset.subject = selectedSubject; // 🆕 Store selected subject with each row
      
      // ADM and Name columns
     row.innerHTML = `
  <td data-label="Admission">${sanitize(student.admissionNo || student.admission)}</td>
  <td data-label="Name">${sanitize(student.name)}</td>
  <td data-label="Marks" class="marks-entry-cell">
    ${isSeniorSchool ? `
      <div class="marks-input-grid">
        <input type="number" class="marks-entry-input ca-input" min="0" max="100" placeholder="CA" />
        <input type="number" class="marks-entry-input pw-input" min="0" max="100" placeholder="PW" />
        <input type="number" class="marks-entry-input exam-input" min="0" max="100" placeholder="Exam" />
        <input type="number" class="marks-entry-input final-input" min="0" max="100" placeholder="Final" readonly />
      </div>
    ` : `
      <input type="number" class="marks-entry-input marks-input" min="0" max="100" placeholder="Score" />
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
          finalInput.value = score > 0 ? score : "";
        };

        caInput.addEventListener("input", updateFinal);
        pwInput.addEventListener("input", updateFinal);
        examInput.addEventListener("input", updateFinal);
      }
    });

    // Check if draft exists for loaded selection
    checkForExistingDraft();
    
    updateStudentsPaginationControls(students);
  }

  // ---------------------------
  // TABLE EVENT DELEGATION - Handle interactions
  // ---------------------------
  marksEntryTableBody.addEventListener("change", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    });

  marksEntryTableBody.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;

    // When any marks input changes, mark row as modified
    if (e.target.classList.contains("marks-input") || 
        e.target.classList.contains("ca-input") ||
        e.target.classList.contains("pw-input") ||
        e.target.classList.contains("exam-input")) {
      row.style.backgroundColor = "#fffacd"; // Light yellow to show modified
    }
  });

  // ---------------------------
  // TABLE RESET/CLEAR FUNCTION
  // ---------------------------
  function resetMarksTable() {
    marksEntryTableBody.innerHTML = "";
    marksColumnHeader.innerHTML = "Marks (%)";
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
    
    marksEntryTableBody.querySelectorAll("tr").forEach((row, idx) => {
   if (!marksTermSelect.value) {
  errors.push("Term not selected");
}

if (!marksAssessmentSelect.value) {
  errors.push("Assessment not selected");
}
      // Check for marks
      const marksInput = row.querySelector(".marks-input");
      const caInput = row.querySelector(".ca-input");
      
      if (marksInput && !marksInput.value) {
        errors.push(`Row ${idx + 1}: Marks not entered`);
      }
      if (caInput && !caInput.value && !row.querySelector(".pw-input")?.value && !row.querySelector(".exam-input")?.value) {
        errors.push(`Row ${idx + 1}: At least one marks component required`);
      }
    });

    return errors;
  }

  // ---------------------------
  // DRAFT FUNCTIONALITY
  // ---------------------------
  function getDraftKey() {
    if (!selectedAllocationData) return null;
    return `marks-draft-${selectedAllocationData.classLabel}-${marksTermSelect.value}-${marksAssessmentSelect.value}`;
  }

  function collectMarksData() {
    const marksData = {};
    marksEntryTableBody.querySelectorAll("tr").forEach(row => {
      const admission = row.dataset.admission;
     const selectedTerm = marksTermSelect.value;
    const selectedAssessment = marksAssessmentSelect.value;

      const marksInput = row.querySelector(".marks-input");
      const caInput = row.querySelector(".ca-input");
      const pwInput = row.querySelector(".pw-input");
      const examInput = row.querySelector(".exam-input");

      marksData[admission] = {
        term: selectedTerm,
        assessment: selectedAssessment,
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
  }

  function saveDraft() {
    if (!selectedAllocationData || marksEntryTableBody.rows.length === 0) {
      showToast("No data to save. Please load Learners first.", "error");
      return;
    }

    const draftKey = getDraftKey();
    if (!draftKey) {
      showToast("Please select subject and assessment", "error");
      return;
    }

    const marksData = collectMarksData();
    const draftObj = {
      marksData,
      classLabel: selectedAllocationData.classLabel,
      subject: selectedSubject,
      term: marksTermSelect.value,
      assessment: marksAssessmentSelect.value,
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

    showToast("✓ Draft saved successfully", "success");
    
    // Show load draft button if draft exists
    if (loadDraftBtn) {
      loadDraftBtn.style.display = "inline-block";
    }
  }

  function loadDraft() {
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
    populateMarksFromDraft(draftObj.marksData);
    showToast(`✓ Draft loaded from ${draftObj.timestamp}`, "success");
  }

  function clearDraft() {
    const draftKey = getDraftKey();
    if (draftKey) {
      localStorage.removeItem(draftKey);
    }
    if (loadDraftBtn) {
      loadDraftBtn.style.display = "none";
    }
  }

  // ---------------------------
  // CHECK FOR EXISTING DRAFT ON LOAD
  // ---------------------------
  function checkForExistingDraft() {
    if (!selectedAllocationData) return;
    const draftKey = getDraftKey();
    if (draftKey && localStorage.getItem(draftKey)) {
      if (loadDraftBtn) {
        loadDraftBtn.style.display = "inline-block";
      }
    }
  }

  // ---------------------------
  // DRAFT & COPY BUTTONS EVENT LISTENERS
  // ---------------------------
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener("click", saveDraft);
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

      displayStudentsInMarksTable(students);

      // Update pagination UI explicitly
      let paginationEl = document.getElementById("studentsPagination");
      if (paginationEl) {
        const prevBtn = document.getElementById("prevStudentsBtn");
        const nextBtn = document.getElementById("nextStudentsBtn");
        const span = paginationEl.querySelector("span");
        
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;
        if (span) span.textContent = `Page ${page} of ${totalPages}`;
        currentStudentPage = page;
      }

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
      if (!marksTermSelect.value || !marksAssessmentSelect.value || !marksYearInput.value) {
        showToast("Please select Term and Assessment", "error");
      return;
    }

    if (marksEntryTableBody.rows.length === 0) {
      showToast("No Learners loaded", "error");
      return;
    }

    if (!selectedAllocationData) {
      showToast("No subject selected", "error");
      return;
    }

    const marks = [];
    let hasErrors = false;

    marksEntryTableBody.querySelectorAll("tr").forEach((row, idx) => {
      const admission = row.dataset.admission;
      const name = row.dataset.name;
      const grade = row.dataset.grade;
      const stream = row.dataset.stream; // Fix: Capture stream from dataset
      
      // Use global Term/Assessment selections
      const term = marksTermSelect.value;
      const assessment = marksAssessmentSelect.value;

      const isSeniorSchool = cbcUtils.isSeniorGrade(grade);
      const gradeNum = parseInt(grade.match(/\d+/)?.[0] || grade);

      let mark = {
        admissionNo: admission,
        studentName: name,
        grade: gradeNum,
        stream: stream || null, // Fix: Include stream in submission
        term: Number(term),
        year: Number(marksYearInput.value),
        assessment: Number(assessment),
        // Subject/Course/Pathway added conditionally below
      };

      if (isSeniorSchool) {
        const course = selectedSubject;
        let pathway = null;

        // Find pathway for the given course
        for (const pway in seniorSchoolPathways) {
          if (seniorSchoolPathways[pway].map(s => s.toLowerCase()).includes(course.toLowerCase())) {
            pathway = pway;
            break;
          }
        }

        if (!pathway) {
          showToast(`Error: Could not find Pathway for the course "${course}". Please check senior school configurations.`, "error");
          hasErrors = true;
          return; // Stop processing this row
        }
        
        mark.pathway = pathway;
        mark.course = course;

        const ca = row.querySelector(".ca-input")?.value;
        const pw = row.querySelector(".pw-input")?.value;
        const exam = row.querySelector(".exam-input")?.value;

        if (!ca && !pw && !exam) {
          // Skip empty rows instead of erroring (allows partial updates)
          return;
        }

        mark.continuousAssessment = ca ? Number(ca) : null;
        mark.projectWork = pw ? Number(pw) : null;
        mark.endTermExam = exam ? Number(exam) : null;
        mark.finalScore = cbcUtils.calculateFinalScore(ca, pw, exam) || null;

        // Validate component scores
        if (ca && (isNaN(Number(ca)) || Number(ca) < 0 || Number(ca) > 100)) {
          showToast(`Row ${idx + 1}: CA must be 0-100`, "error");
          hasErrors = true;
          return;
        }
        if (pw && (isNaN(Number(pw)) || Number(pw) < 0 || Number(pw) > 100)) {
          showToast(`Row ${idx + 1}: PW must be 0-100`, "error");
          hasErrors = true;
          return;
        }
        if (exam && (isNaN(Number(exam)) || Number(exam) < 0 || Number(exam) > 100)) {
          showToast(`Row ${idx + 1}: Exam must be 0-100`, "error");
          hasErrors = true;
          return;
        }
      } else {
        mark.subject = selectedSubject; // Set subject for non-senior school

        const marksInput = row.querySelector(".marks-input")?.value;
        if (!marksInput) {
          // Skip empty rows instead of erroring (allows partial updates)
          return;
        }

        if (isNaN(Number(marksInput)) || Number(marksInput) < 0 || Number(marksInput) > 100) {
          showToast(`Row ${idx + 1}: Marks must be 0-100`, "error");
          hasErrors = true;
          return;
        }

        mark.score = Number(marksInput);
      }

      // Check for existing mark to update instead of create (prevents duplicates)
      const existingEntry = submittedMarks.find(m => 
        m.admissionNo === mark.admissionNo &&
        m.term === mark.term &&
        m.year === mark.year &&
        m.assessment === mark.assessment &&
        (
          (isSeniorSchool && m.course === mark.course) ||
          (!isSeniorSchool && m.subject === mark.subject)
        )
      );

      if (existingEntry) {
        mark._id = existingEntry._id; // Attach ID for update
      }

      marks.push(mark);
    });

    if (hasErrors) {
      return;
    }

    if (marks.length === 0) {
      showToast("No marks entered to submit", "warning");
      return;
    }

    const confirmed = await cbcUtils.showConfirmToast(`Are you sure you want to submit marks for ${marks.length} learner(s)?`);
    if (!confirmed) {
      return;
    }    

    submitAllMarksBtn.disabled = true;
    submitAllMarksBtn.innerHTML = '<span class="spinner"></span>Submitting...';

    try { 
      let successCount = 0;
      let failureCount = 0;
      const token = authService.getToken();

      for (const mark of marks) {
        try {
          // Determine if we are updating (PUT) or creating (POST)
          let url = `${API_BASE}/marks/add`;
          let method = "POST";
          
          if (mark._id) {
            url = `${API_BASE}/marks/${mark._id}`;
            method = "PUT";
          }

          const res = await fetch(url, {
            method: method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(mark)
          });

          if (!res.ok) {
            failureCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          failureCount++;
        }
      }

      showToast(`✅ Processed: ${successCount} mark(s) saved/updated, ${failureCount} failed`, successCount > 0 ? "success" : "error");
      
      if (successCount > 0) {
        await loadSubmittedMarks(true); // Force refresh after submission
        marksEntryTableBody.innerHTML = "";
        marksTableContainer.style.display = "none";
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
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            console.log("✅ Using cached submitted marks");
            submittedMarks = data;
            window.currentMarks = submittedMarks;
            displayMarks(submittedMarks);
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
      console.log("Fetching marks from:", `${API_BASE}/marks/teacher`);
      const token = authService.getToken();
      const res = await fetch(`${API_BASE}/marks/teacher`, {
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
      
      submittedMarks = await res.json();
      console.log("Loaded marks:", submittedMarks);

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: submittedMarks
      }));

      console.log("Marks array type:", Array.isArray(submittedMarks));
      console.log("Marks count:", submittedMarks.length);
      
      window.currentMarks = submittedMarks;
      displayMarks(submittedMarks);
    } catch (err) {
      console.error("Load marks error:", err);
      console.error("Error stack:", err.stack);
    }
  }

  // ---------------------------
  // DISPLAY FUNCTIONS
  // ---------------------------
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

  function displayMarks(marks) {
    console.log("Displaying marks:", marks); // DEBUG
    console.log("Marks count:", marks ? marks.length : 0); // DEBUG
    
    const grouped = {};
    (marks || []).forEach(m => {
      const key = `${m.assessment}_${m.term}_${m.year}_${m.grade}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    
    console.log("Grouped marks:", grouped); // DEBUG
    console.log("Grouped keys:", Object.keys(grouped)); // DEBUG
    
    submittedMarksContainer.innerHTML = '';
    if (!Object.keys(grouped).length) {
      console.log("No marks to display"); // DEBUG
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks submitted yet.</p>';
      return;
    }
    Object.keys(grouped).forEach(key => {
      try {
        const groupMarks = grouped[key];
        const headerInfo = groupMarks[0];
        const details = document.createElement('details');
        details.open = false; // Ensure it's collapsed by default
        details.className = 'marks-accordion';
        let assessmentLabel;
        if (headerInfo.assessment === 0) {
          assessmentLabel = 'Midterm';
        } else if (headerInfo.assessment === 5) {
          assessmentLabel = 'End Term';
        } else {
          assessmentLabel = 'Assessment ' + headerInfo.assessment;
        }
        const summaryText = `Grade: ${sanitize(headerInfo.grade)} • Term: ${sanitize(headerInfo.term)} • Year: ${sanitize(headerInfo.year)} • ${assessmentLabel} — ${groupMarks.length} record${groupMarks.length > 1 ? 's' : ''}`;
        const summary = document.createElement('summary');
        summary.className = 'marks-accordion-summary';
        summary.innerHTML = `<strong>${summaryText}</strong>`;
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'pdf-btn';
        pdfBtn.textContent = '📄 Download PDF';
        pdfBtn.dataset.key = key;
        
        // Determine if senior school to show appropriate table headers
        const gradeMatch = headerInfo.grade.toString().match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
        
        const table = document.createElement('table');
        table.classList.add('marks-table');
        
        // Different headers for senior vs junior school
        let thead = `<thead>
              <tr>
                  <th>Admission</th>
                  <th>Name</th>
                  <th>Subject/Course</th>`;
        
              if (isSeniorSchool) {
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
              ${groupMarks.map(m => {
          const isSeniorSchool = cbcUtils.isSeniorGrade(m.grade);
          const subjectDisplay = isSeniorSchool ? `${m.pathway || 'N/A'} - ${m.course || 'N/A'}` : (m.subject || '').replace(/-/g, ' ');
          
          let scoreCell = '';
          if (isSeniorSchool) {
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
        details.appendChild(pdfBtn);
        details.appendChild(table);
        submittedMarksContainer.appendChild(details);
      } catch (err) {
        console.error("Error rendering marks group:", err, key);
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

      // Robust Grade extraction
      const markGradeStr = (mark.grade || "").toString();
      const markGradeMatch = markGradeStr.match(/\d+/);
      const markGradeNum = markGradeMatch ? parseInt(markGradeMatch[0], 10) : 0;

      showToast("Loading learner for editing...", "info");

      const isSeniorSchool = markGradeNum >= 10 && markGradeNum <= 12;

      // 1. Find the correct allocation in the dropdown by normalizing subject/course names
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
      subjectAllocationSelect.value = allocationOption.value;
      marksTermSelect.value = mark.term;
      marksAssessmentSelect.value = mark.assessment;
      marksYearInput.value = mark.year;

      // 3. Trigger a 'change' on the allocation select to update internal state
      subjectAllocationSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // 4. Create a mock student object from the mark data
      const studentToEdit = {
        admissionNo: mark.admissionNo,
        admission: mark.admissionNo, // for compatibility
        name: mark.studentName,
        grade: mark.grade
      };

      // 5. Display just this one student in the table
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
          if (pwInput) pwInput.value = mark.projectWork ?? '';
          if (examInput) examInput.value = mark.endTermExam ?? '';
          caInput?.dispatchEvent(new Event('input', {
            bubbles: true
          })); // Trigger final score calculation
        } else {
          const marksInput = studentRow.querySelector(".marks-input");
          if (marksInput) marksInput.value = mark.score ?? '';
        }

        // 8. Scroll to the table and highlight the row
        marksTableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        studentRow.style.backgroundColor = "#d4edda"; // Light green to highlight
        setTimeout(() => {
          studentRow.style.backgroundColor = "#fffacd"; // Back to 'modified' color
        }, 5000);

        showToast("Learner loaded. Please update the mark and submit.", "success");      
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
    const title = btn.previousElementSibling?.innerText || "Marks_Report";
    downloadTableAsPDF(table, title);
  });

  // ---------------------------
  // SEARCH FILTER
  // ---------------------------
  document.getElementById("marksSearchBox")?.addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    submittedMarksContainer.querySelectorAll("details").forEach(d => {
      const text = d.innerText.toLowerCase();
      d.style.display = text.includes(term) ? "" : "none";
    });
  });

  // ---------------------------
  // TOAST
  // ---------------------------

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