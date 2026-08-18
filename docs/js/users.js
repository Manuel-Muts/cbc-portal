// docs/js/users.js
(function () {
  const API_BASE = config.api.baseURL;


  // DOM Elements
  const registerForm = document.getElementById("registerForm");
  const registerFeedback = document.getElementById("registerFeedback");
  const userRoleSelect = document.getElementById("userRole");
  const studentFields = document.getElementById("studentFields");
  const emailGroup = document.getElementById("emailGroup");
  
  const usersTableBody = document.querySelector("#usersTable tbody");
  const userSearchInput = document.getElementById("userSearchInput");
  const exportUsersBtn = document.getElementById("exportUsersBtn");
  const refreshUsersBtn = document.getElementById("refreshUsersBtn");
  const importUsersBtn = document.getElementById("importUsersBtn");
  const importUsersFile = document.getElementById("importUsersFile");
  const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
  const importProgressContainer = document.getElementById("importProgressContainer");
  const importProgressBar = document.getElementById("importProgressBar");
  const importProgressText = document.getElementById("importProgressText");
  const studentFiltersContainer = document.getElementById("studentFiltersContainer"); // New container for student filters
  const studentGradeFilter = document.getElementById("studentGradeFilter"); // New grade filter
  const studentStreamFilter = document.getElementById("studentStreamFilter"); // New stream filter
  const printStudentsListBtn = document.getElementById("printStudentsListBtn"); // New print button
  let debounceTimer; // Declare debounceTimer in a broader scope
  const downloadStudentsCsvBtn = document.getElementById("downloadStudentsCsvBtn"); // 🆕 New CSV download button
  
  // Pagination
  const usersPrevPageBtn = document.getElementById("usersPrevPage");
  const usersNextPageBtn = document.getElementById("usersNextPage");
  const usersPageInfo = document.getElementById("usersPageInfo");
  let usersPage = 1;
  const usersPerPage = 10;

  // NEW DOM ELEMENTS FOR CSV DOWNLOAD SECTION
  const csvGradeFilter = document.getElementById("csvGradeFilter");
  const csvStreamFilter = document.getElementById("csvStreamFilter");
  const downloadFilteredStudentsCsvBtn = document.getElementById("downloadFilteredStudentsCsvBtn");
  const downloadScoreSheetsPdfBtn = document.getElementById("downloadScoreSheetsPdfBtn"); // 🆕 New PDF button
  let userProfile = null;
  let importCancelled = false;
  let usersTotalRecords = 0;
  let usersTotalPages = 1;
  const usersCache = {}; // In-memory fallback
  const PERSISTENT_CACHE_PREFIX = "users_mgmt_cache_";
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  let currentRoleTab = "student"; // Default view: Learners (Students)
  let usersTabInitialized = false; // 🆕 Lazy loading flag for users table
  let demographicsTabInitialized = false; // 🆕 Lazy loading flag for demographics
  // Prefetched school assets to speed up PDF generation
  let prefetchedSchoolLogoBase64 = null;
  let prefetchedSchoolName = null;
  let lastAdmissionValue = null;
  const lastAdmissionBadge = document.getElementById("lastAdmissionBadge");

  // 🆕 TERM CONFIGURATION CACHE & ACTIVE TERM
  const termConfigCache = new Map(); // Cache for term config data
  const termConfigInFlight = new Set(); // Track in-flight requests to prevent duplicates
  let activeTermValue = null; // Store the active term from API

  // Prefetch function (call when downloads tab is opened)
  async function prefetchSchoolAssets() {
    if (prefetchedSchoolName || prefetchedSchoolLogoBase64) return; // already prefetched
    try {
      const schoolRes = await secureFetch(`${API_BASE}/my-school?includeLogo=true&fields=name,logo,logoMimeType`);
      if (schoolRes) {
        prefetchedSchoolName = schoolRes?.schoolName || schoolRes?.name || prefetchedSchoolName;
        const logoCandidate = schoolRes?.logo;
        const mime = schoolRes?.logoMimeType || 'image/png';
        if (logoCandidate) {
          if (typeof logoCandidate === 'string' && logoCandidate.startsWith('data:')) {
            prefetchedSchoolLogoBase64 = logoCandidate;
          } else if (typeof logoCandidate === 'string' && (logoCandidate.startsWith('http') || logoCandidate.startsWith('/'))) {
            try {
              const resp = await fetch(logoCandidate.startsWith('/') ? (window.location.origin + logoCandidate) : logoCandidate);
              const blob = await resp.blob();
              prefetchedSchoolLogoBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (err) {
              console.warn('Failed to fetch/convert prefetched school logo:', err);
            }
          } else if (typeof logoCandidate === 'string') {
            prefetchedSchoolLogoBase64 = `data:${mime};base64,${logoCandidate}`;
          }
        }
      }
    } catch (e) {
      console.warn('Prefetch school assets failed:', e);
    }
  }

  // ---------------------------
  // SCHOOL TYPE & GRADE HELPERS
  // ---------------------------
    const SCHOOL_TYPES = {
        full: {
            label: "Full School (Grades PG-12)",
            gradeOptions: ["PG", "PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
        },
        primary_junior: {
            label: "Primary + Junior (Grades PG-9)",
            gradeOptions: ["PG", "PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
        },
        senior: {
            label: "Senior School (Grades 10-12)",
            gradeOptions: ["10","11","12"]
        }
    };

  let schoolInfo = null;

    function getSchoolTypeKey() {
        if (!schoolInfo || !schoolInfo.schoolType) return 'full';
        const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
        if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
        if (rawType.includes('senior')) return 'senior';
        return 'full';
    }

  function populateRegistrationGrades() {
    const select = document.getElementById("studentGrade");
    if (!select) return;
    const type = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[type].gradeOptions;
    select.innerHTML = '<option value="">-- Select Grade --</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g; // Value can be "PP1" or "1"
      opt.textContent = (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`; // Display "PG", "PP1" or "Grade 1"
      select.appendChild(opt);
    });
  }

  // 🆕 Helper for consistent labels across tabs and headings
  function getRoleLabel(role) {
    if (role === "student" || role === "learner") return "Registered Learners";
    if (role === "teacher") return "Registered Teachers";
    if (role === "accounts") return "Accounts Staff";
    if (role === "admin") return "Admins";
    return "";
  }

  // ---------------------------
  // HELPERS (Copied/Shared Logic)
  // ---------------------------

  function createSpinner() {
    const s = document.createElement("span");
    s.className = "spinner";
    return s;
  }

  function showFeedback(element, message, type = "info") {
    if (!element) return;
    element.textContent = message;
    element.className = `feedback ${type}`;
    element.style.display = "block";
    setTimeout(() => element.style.display = "none", 4000);
  }

  async function secureFetch(url, options = {}) {
    const token = authService.getToken();
    options.headers = { ...options.headers, "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text();
        // 🆕 Throw an error object with status for specific handling by caller
        const error = new Error(text || `Request failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
      const contentType = res.headers.get("content-type") || "";
      return contentType.includes("application/json") ? res.json() : res.text();
    } catch (err) {
      console.error("Fetch error:", err);
      // 🆕 Only show toast if it's not a rate limit error, or if the caller doesn't handle it
      if (err.status !== 429) {
        showToast(err.message, "error");
      }
      return null;
    }
  }

  async function refreshLastAdmissionBadge(selectedRole = 'student') {
    if (!lastAdmissionBadge) return;
    lastAdmissionBadge.textContent = 'Highest: ...';
    lastAdmissionBadge.style.display = 'inline-flex';
    try {
      const roleParam = selectedRole === 'learner' ? 'learner' : 'student';
      const res = await secureFetch(`${API_BASE}/users/last-admission?role=${encodeURIComponent(roleParam)}`);
      const lastAdmission = res?.lastAdmission ?? null;
      lastAdmissionValue = lastAdmission;
      if (lastAdmission !== null && lastAdmission !== undefined && lastAdmission !== '') {
        lastAdmissionBadge.textContent = `Highest: ${lastAdmission}`;
      } else {
        lastAdmissionBadge.textContent = 'Highest: N/A';
      }
    } catch (err) {
      console.warn('Unable to refresh last admission badge:', err);
      if (lastAdmissionBadge) {
        lastAdmissionBadge.textContent = 'Highest: N/A';
        lastAdmissionBadge.style.display = 'inline-flex';
      }
    }
  }

  // 🆕 Helper to introduce a delay
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize all tab labels with current system counts
   */
  async function refreshAllTabCounts() {
    const roles = ["student", "teacher", "accounts", "admin"];
    const results = await Promise.all(roles.map(role => 
      secureFetch(`${API_BASE}/users?page=1&limit=1&role=${role}`)
    ));

    results.forEach((res, index) => {
      if (!res) return;
      const role = roles[index];
      const tab = document.querySelector(`.user-type-tabs li[data-role="${role}"]`);
      if (tab) tab.textContent = `${getRoleLabel(role)} (${res.total || 0})`;
    });
  }

  // ---------------------------
  // UI LOGIC
  // ---------------------------
  if (userRoleSelect) {
    userRoleSelect.addEventListener("change", () => {
      const role = userRoleSelect.value;
      const isStudent = role === "student" || role === "learner";
      const isTeacher = role === "teacher" || role === "classteacher";

      // Show registration group for students (Full) or teachers (Contact only)
      studentFields.style.display = (isStudent || isTeacher) ? "flex" : "none";
      if (emailGroup) emailGroup.style.display = isStudent ? "none" : "block";

      // Manage visibility of individual fields inside the studentFields group
      const admField = document.getElementById("userAdmission")?.parentElement;
      const gradeField = document.getElementById("studentGrade")?.parentElement;
      const streamField = document.getElementById("studentStream")?.parentElement;
      const pathwayField = document.getElementById("studentPathway")?.parentElement;
      const genderField = document.getElementById("studentGender")?.parentElement;
      const dobField = document.getElementById("studentDob")?.parentElement;
      const contactField = document.getElementById("studentContact")?.parentElement;

      if (admField) admField.style.display = isStudent ? "block" : "none";
      if (gradeField) gradeField.style.display = isStudent ? "block" : "none";
      if (streamField) streamField.style.display = isStudent ? "block" : "none";
      if (genderField) genderField.style.display = isStudent ? "block" : "none";
      if (dobField) dobField.style.display = isStudent ? "block" : "none";
      if (pathwayField) {
        const isSenior = isStudent && window.cbcUtils.isSeniorGrade(document.getElementById("studentGrade")?.value);
        pathwayField.style.display = isSenior ? "block" : "none";
      }
      if (contactField) contactField.style.display = (isStudent || isTeacher) ? "block" : "none";

      // 🆕 Update contact field label based on role
      const contactLabel = contactField?.querySelector('label');
      if (contactLabel) {
        contactLabel.textContent = isStudent ? "Parent Contact" : "Teacher Contact";
      }

      // Show student-specific filters and print button in the management table
      if (studentFiltersContainer) studentFiltersContainer.style.display = isStudent ? "flex" : "none";

      // Always reload users when role changes to apply new filters
      loadUsers(1, true);
      if (isStudent) {
        refreshLastAdmissionBadge(role);
      } else if (lastAdmissionBadge) {
        lastAdmissionBadge.style.display = 'none';
      }
    });
  }

  // 🆕 Add listener for grade selection to toggle pathway visibility
  const studentGradeSelect = document.getElementById("studentGrade");
  if (studentGradeSelect) {
    studentGradeSelect.addEventListener("change", () => {
      const pathwayField = document.getElementById("studentPathway")?.parentElement;
      if (pathwayField) {
        pathwayField.style.display = window.cbcUtils.isSeniorGrade(studentGradeSelect.value) ? "block" : "none";
      }
    });
  }

  // ---------------------------
  // USERS TABLE LOGIC
  // ---------------------------
  function renderUsers(data = []) {
    if (!usersTableBody) return;
    
    const table = document.querySelector("#usersTable");
    const thead = table.querySelector("thead tr");
    const isStudentView = currentRoleTab === "student";

    // Determine if Pathway column should be shown based on school type
    const schoolType = getSchoolTypeKey();
    const showPathwayColumn = isStudentView && (schoolType === 'senior' || schoolType === 'full');
    const colCount = isStudentView ? (showPathwayColumn ? 7 : 6) : 4;

    // Dynamically Update Headers
    if (isStudentView) {
      thead.innerHTML = `
        <th>Name</th>
        <th style="width: 80px;">Role</th>
        <th style="width: 100px;">Admission</th>
        <th style="width: 100px;">Grade</th>
        ${showPathwayColumn ? '<th>Pathway</th>' : ''}
        <th>Contact</th>
        <th>Action</th>
      `;
    } else {
      thead.innerHTML = `
        <th>Name</th>
        <th>Role</th>
        <th>Email</th>
        <th>Action</th>
      `;
    }

    usersTableBody.innerHTML = "";
    
    if (data.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center">No users found</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    data.forEach(u => {
      // Skip super admin
      if (u.role === "super_admin" || u.isSuperAdmin === true) return;

      const tr = document.createElement("tr");
      if (isStudentView) {
        // 🧪 DEBUG LOG: Check console to see the available properties


        // Ultra-Robust Grade Detection: Check every possible field and variation used in the system
        let rawGrade = u.grade || u.currentGrade || u.classGrade || u.assignedClass || u.className || u.assignedGrade || u.classLabel || u.gradeName || u['class'] || u.assignedGradeLevel || "";

        // Handle cases where the grade is nested inside a populated enrollment object
        if (rawGrade && typeof rawGrade === 'object') rawGrade = rawGrade.grade || rawGrade.name || rawGrade.label || rawGrade.gradeName || "";
        if (!rawGrade && u.enrollmentId) rawGrade = (typeof u.enrollmentId === 'object') ? u.enrollmentId.grade : "";
        if (!rawGrade && u.enrollment) rawGrade = (typeof u.enrollment === 'object') ? u.enrollment.grade : "";
        if (!rawGrade && u.allocations && u.allocations.length > 0) rawGrade = u.allocations[0].grade || u.allocations[0].gradeLevel || "";
        if (!rawGrade && u.studentId && typeof u.studentId === 'object') rawGrade = u.studentId.grade;

        // 🚀 FIX: Fallback to rawGrade if cbcUtils is not yet loaded, preventing "N/A" when data exists.
        let gradeDisplay = (window.cbcUtils ? window.cbcUtils.normalizeGrade(rawGrade) : rawGrade) || "N/A";

        // Extract stream, prioritizing enrollmentId for students
        let stream = "";
        if (u.role === "student" && u.enrollmentId && typeof u.enrollmentId === 'object') {
            stream = u.enrollmentId.stream || "";
        } else {
            // Fallback: check direct fields on user object (supports legacy/unlinked records)
            stream = (u.stream || u.assignedStream || u.classStream || u.currentStream || u.studentStream || "").trim();
        }
        stream = stream.trim(); // Ensure it's trimmed

        // 🚀 FIX: Use end-of-string space check instead of .includes() to prevent hiding numeric streams that match grade numbers
        if (stream && gradeDisplay !== "N/A" && !gradeDisplay.toLowerCase().endsWith(" " + stream.toLowerCase())) {
            gradeDisplay += ` ${stream}`;
        }

        tr.innerHTML = `
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td class="users-table-compact-col">${u.admission || u.admissionNo || ""}</td>
          <td class="users-table-compact-col">${gradeDisplay}</td>
          ${showPathwayColumn ? `<td>${u.pathway || ""}</td>` : ''}
          <td>${u.contact || ""}</td>
          <td class="action-cell">
            <button data-id="${u._id}" class="btn danger-btn delete-user-btn" style="padding: 2px 6px; font-size: 11px;">🗑️ Delete</button>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td>${u.email || (u.role === "student" ? u.admission : "")}</td>
          <td class="action-cell">
            <button data-id="${u._id}" class="btn danger-btn delete-user-btn" style="padding: 2px 6px; font-size: 11px;">🗑️ Delete</button>
            ${u.role !== "student" ? `<button data-id="${u._id}" class="btn secondary-btn resend-creds-btn" style="padding: 2px 6px; font-size: 11px;">📧 Resend</button>` : ""}
          </td>
        `;
      }
      frag.appendChild(tr);
    });
    usersTableBody.appendChild(frag);

    // Attach listeners
    usersTableBody.querySelectorAll(".delete-user-btn").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        if (await showConfirm({ message: "Delete this user?" })) {
          await secureFetch(`${API_BASE}/users/${id}`, { method: "DELETE" });
          clearUsersCache();
          loadUsers(usersPage, true);
          showToast("User deleted", "success");
        }
      };
    });

    usersTableBody.querySelectorAll(".resend-creds-btn").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const email = b.parentElement.previousElementSibling.textContent.trim();
        if (await showConfirm({ message: "Resend login credentials?" })) {
          const res = await secureFetch(`${API_BASE}/users/resend-credentials`, {
            method: "POST",
            body: JSON.stringify({ email })
          });
          if (res) showToast("Credentials re-sent", "success");
        }
      };
    });
  }

  async function loadUsers(page = 1, forceReload = false) {
    if (!usersTableBody) return;
    
    const cacheKey = `${currentRoleTab}_${page}`;
    const storageKey = PERSISTENT_CACHE_PREFIX + cacheKey;

    if (!forceReload) {
      // Check memory first, then localStorage
      let data = usersCache[cacheKey];
      if (!data) {
        try {
          const cached = JSON.parse(localStorage.getItem(storageKey));
          if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) data = cached.data;
        } catch (e) {}
      }

      if (data) {
        usersTotalPages = data.pages;
        usersTotalRecords = data.total;
        renderUsers(data.users);
        updateUsersPagination(page, usersTotalPages);
        return;
      }
    }

    const colCount = currentRoleTab === "student" ? 6 : 4;
    usersTableBody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center">Loading ${currentRoleTab} records...</td></tr>`;
    const search = userSearchInput ? userSearchInput.value.trim() : "";
    
    // Dynamically fetch filter values to ensure we aren't using stale references
    const activeGradeFilter = document.getElementById("studentGradeFilter");
    const activeStreamFilter = document.getElementById("studentStreamFilter");

    let queryParams = `page=${page}&limit=${usersPerPage}&search=${encodeURIComponent(search)}&role=${currentRoleTab}`;
    
    // Add grade and stream filters if current tab is student
    if (currentRoleTab === "student") {
      if (activeGradeFilter?.value && activeGradeFilter.value !== "all") queryParams += `&grade=${encodeURIComponent(activeGradeFilter.value)}`;
      if (activeStreamFilter?.value && activeStreamFilter.value !== "all") queryParams += `&stream=${encodeURIComponent(activeStreamFilter.value)}`;
    }
    const res = await secureFetch(`${API_BASE}/users?${queryParams}`);
    if (res) {
      const { users = [], total = 0, pages = 1 } = res;
      usersTotalPages = pages;
      usersTotalRecords = total;

      const cacheData = { users, total, pages };
      usersCache[cacheKey] = cacheData;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ timestamp: Date.now(), data: cacheData }));
      } catch (e) {}

      renderUsers(users);
      updateUsersPagination(page, pages);

      // 🆕 Update Tab Label with count (only when not searching)
      if (!search) {
        const tab = document.querySelector(`.user-type-tabs li[data-role="${currentRoleTab}"]`);
        if (tab) {
          const label = getRoleLabel(currentRoleTab);
          tab.textContent = `${label} (${total})`;
          
          const heading = document.querySelector(".tab-section#userManagement h3") || document.querySelector(".card h3");
          if (heading && tab.classList.contains("active")) heading.textContent = tab.textContent;
        }
      }
    }
  }

  function updateUsersPagination(page, totalPages) {
    if (usersPageInfo) usersPageInfo.textContent = `Page ${page} of ${totalPages}`;
    if (usersPrevPageBtn) usersPrevPageBtn.disabled = page <= 1;
    if (usersNextPageBtn) usersNextPageBtn.disabled = page >= totalPages;
  }

  function clearUsersCache() {
    // Clear in-memory
    Object.keys(usersCache).forEach(key => delete usersCache[key]);
    // Clear persistent localStorage keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(PERSISTENT_CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  // ---------------------------
  // EVENT LISTENERS
  // ---------------------------
 if (usersPrevPageBtn) {
  usersPrevPageBtn.addEventListener("click", () => {
    if (usersPage > 1) {
      usersPage--;
      loadUsers(usersPage);
    }
  });
}

if (usersNextPageBtn) {
  usersNextPageBtn.addEventListener("click", () => {
    if (usersPage < usersTotalPages) {
      usersPage++;
      loadUsers(usersPage);
    }
  });
}

  if (userSearchInput) {
    userSearchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        clearUsersCache();
        loadUsers(1, true);
      }, 500);
    });
  }

  // 🆕 Student specific filter change listeners
  if (studentGradeFilter) {
    studentGradeFilter.addEventListener("change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        clearUsersCache(); // Clear cache to force reload with new filter
        loadUsers(1, true);
      }, 500);
    });
  }

  if (studentStreamFilter) {
    studentStreamFilter.addEventListener("change", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        clearUsersCache();
        loadUsers(1, true);
      }, 500);
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async e => {
      e.preventDefault();
      const submitBtn = registerForm.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "Registering...";

      const role = document.getElementById("userRole").value;
      const name = document.getElementById("userName").value.trim();
      const email = document.getElementById("userEmail").value.trim();
      const admission = document.getElementById("userAdmission").value.trim();
      const grade = document.getElementById("studentGrade").value;
      const stream = document.getElementById("studentStream").value.trim();
      const gender = document.getElementById("studentGender")?.value?.trim() || "";
      const dateOfBirth = document.getElementById("studentDob")?.value?.trim() || "";
      const rawPathway = document.getElementById("studentPathway")?.value || null;
      const pathway = rawPathway ? (window.cbcUtils?.normalizePathway?.(rawPathway) || String(rawPathway).trim()) : null;
      const contact = document.getElementById("studentContact").value.trim();
      const normalizedEmail = email ? email.toLowerCase() : "";

      // Validation
      if (!role || !name) {
        showFeedback(registerFeedback, "Role and Name are required", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }
      if ((role === "student" || role === "learner") && (!admission || !grade)) {
        showFeedback(registerFeedback, "Admission and Grade required for students", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }
      if ((role === "student" || role === "learner") && window.cbcUtils.isSeniorGrade(grade) && !pathway) {
        showFeedback(registerFeedback, "Select a senior school pathway for this learner", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }
      if (role !== "student" && role !== "learner" && !normalizedEmail) {
        showFeedback(registerFeedback, "Email required", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }

      const body = { role, name };
      if (contact) body.contact = contact; // 🆕 Ensure contact is sent for all roles

      if (role === "student" || role === "learner") {
        body.admission = admission;
        body.grade = grade;
        if (pathway) body.pathway = pathway;
        if (stream) body.stream = stream;
        if (gender) body.gender = gender;
        if (dateOfBirth) body.dateOfBirth = dateOfBirth;
      } else {
        body.email = normalizedEmail;
      }

      const res = await secureFetch(`${API_BASE}/users/register`, {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (res) {
        showFeedback(registerFeedback, "User registered successfully", "success");
        registerForm.reset();
        userRoleSelect.dispatchEvent(new Event("change"));
        clearUsersCache();
        loadUsers(1, true);
        refreshLastAdmissionBadge(document.getElementById("userRole")?.value || 'student');
      } else {
        showFeedback(registerFeedback, "Registration failed", "error");
      }

      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    });
  }

  // Export PDF
  if (exportUsersBtn) {
    exportUsersBtn.addEventListener("click", () => {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { showToast("PDF Library not loaded", "error"); return; }
      const doc = new jsPDF();
      const title = `${currentRoleTab.charAt(0).toUpperCase() + currentRoleTab.slice(1)}s List`;
      doc.text(title, 14, 15);
      
      const isStudentView = currentRoleTab === "student";
      const rows = [];
      document.querySelectorAll("#usersTable tbody tr").forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length > 0) {
          if (isStudentView) {
            rows.push([cells[0].textContent, cells[1].textContent, cells[2].textContent, cells[3].textContent, cells[4].textContent]);
          } else {
            rows.push([cells[0].textContent, cells[1].textContent, cells[2].textContent]);
          }
        }
      });

      doc.autoTable({
        head: [isStudentView ? ["Name", "Role", "Admission", "Grade", "Contact"] : ["Name", "Role", "Email"]],
        body: rows,
        startY: 20
      });
      doc.save("users_list.pdf");
    });
  }

  // Refresh Users
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", async () => {
      refreshUsersBtn.disabled = true;
      const originalText = refreshUsersBtn.textContent;
      refreshUsersBtn.textContent = "Refreshing...";

      clearUsersCache();
      await loadUsers(usersPage, true);

      refreshUsersBtn.disabled = false;
      refreshUsersBtn.textContent = originalText;
      showToast("Users list refreshed", "success");
    });
  }

  // ---------------------------
  // BULK IMPORT STUDENTS
  // ---------------------------
  if (importUsersBtn && importUsersFile) {
    importUsersBtn.addEventListener("click", () => {
      importUsersFile.click();
    });

    importUsersFile.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.XLSX) {
        showToast("Excel library not loaded. Please refresh the page.", "error");
        return;
      }

      // Clear input so same file can be selected again if needed
      importUsersFile.value = "";

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            defval: "",
            raw: false,
            cellDates: true
          });

          if (jsonData.length === 0) {
            showToast("File appears to be empty", "error");
            return;
          }

          // Check for duplicate admission numbers within the file
          const admissionSet = new Set();
          const duplicateAdmissions = new Set();

          for (const row of jsonData) {
            const admission = row.Admission || row.admission || row.ADMISSION;
            if (admission) {
              const admVal = String(admission);
              if (admissionSet.has(admVal)) duplicateAdmissions.add(admVal);
              admissionSet.add(admVal);
            }
          }

          if (duplicateAdmissions.size > 0) {
            showToast(`Duplicate admissions found in file: ${Array.from(duplicateAdmissions).join(", ")}`, "error");
            importUsersFile.value = "";
            return;
          }

           const normalizeHeaderKey = (value) => {
             if (value === undefined || value === null) return "";
             return String(value)
               .trim()
               .toLowerCase()
               .replace(/[^a-z0-9]+/g, "");
           };

           const normalizeGenderValue = (value) => {
             if (value === undefined || value === null || value === "") return null;

             const normalized = String(value).trim().toLowerCase();
             if (["male","Male","MALE","m","M", "boy", "man"].includes(normalized)) return "Male";
             if (["female", "Female", "FEMALE", "f", "F", "girl", "woman"].includes(normalized)) return "Female";
             if (["other", "Other", "OTHER", "others", "nonbinary", "non-binary", "prefer not to say", "prefer not to say", "prefer not say", "not say"].includes(normalized)) return "Prefer not to say";
             return String(value).trim();
           };

           const formatDateValue = (value) => {
             if (value === undefined || value === null || value === "") return undefined;

             if (value instanceof Date) {
               return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
             }

             if (typeof value === "number" && Number.isFinite(value)) {
               const serial = Number(value);
               const excelEpoch = new Date(Date.UTC(1899, 11, 30));
               const parsed = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
               if (!Number.isNaN(parsed.getTime())) {
                 return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
               }
             }

             const raw = String(value).trim();
             if (!raw) return undefined;

             const numeric = Number(raw);
             if (Number.isFinite(numeric) && Math.abs(numeric) > 1000) {
               const excelEpoch = new Date(Date.UTC(1899, 11, 30));
               const parsed = new Date(excelEpoch.getTime() + numeric * 24 * 60 * 60 * 1000);
               if (!Number.isNaN(parsed.getTime())) {
                 return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
               }
             }

             const parsedDate = new Date(raw);
             if (!Number.isNaN(parsedDate.getTime())) {
               return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
             }

             return raw;
           };

           const normalizeImportValue = (value) => {
             return String(value).trim();
           };

           // Robust column mapping helper
           const getVal = (row, ...keys) => {
             const normalizedKeys = Object.keys(row).reduce((acc, rk) => {
               acc[normalizeHeaderKey(rk)] = rk;
               return acc;
             }, {});

             for (const key of keys) {
               const normalizedKey = normalizeHeaderKey(key);
               const match = normalizedKeys[normalizedKey];
               if (match !== undefined) {
                 const val = row[match];
                 return normalizeImportValue(val);
               }
             }
             return undefined;
           };
 
           const studentsToRegister = [];
           const localFailed = [];
 
           for (const row of jsonData) {
             const name = getVal(row, "Name", "Names", "Student Name", "Full Name");
             const admission = getVal(row, "Admission","admission","ADMISSION", "Admission No","admission no","ADMISSION NO", "Adm","ADM","adm", "Admission Number","admission number","ADMISSION NUMBER");
             const grade = getVal(row, "Grade","grade","GRADE", "Class","class","CLASS", "Level");
             const stream = getVal(row, "Stream","stream","STREAM", "Class Stream", "Section");
             const contact = getVal(row, "Contact","contact", "Phone","phone", "Parent Contact", "Contact Number", "Telephone", "Mobile");
             const pathway=getVal(row,"pathway","PATHWAY","Pathway","Senior Pathway","senior pathway");
             const gender = normalizeGenderValue(getVal(row, "Gender","gender","GENDER", "Sex","sex","SEX"));
             const dateOfBirth = formatDateValue(getVal(row, "Date of Birth", "Date Of Birth", "DATE OF BIRTH", "date of birth","DateOfBirth","dateOfBirth","DOB","dob","Date of Birth (Optional)", "DOB (Optional)"));
             const normalizedPathway = pathway ? (window.cbcUtils?.normalizePathway?.(pathway) || String(pathway).trim()) : null;
 
             if (!name || admission === undefined || grade === undefined) {
               localFailed.push({ name: name || "N/A", admission: admission || "N/A", reason: "Missing required fields" });
               continue;
             }
 
             studentsToRegister.push({
               name,
               admission,
               grade,
               stream: stream || null,
               contact: contact || null,
               pathway: normalizedPathway,
               gender: gender || null,
               dateOfBirth: dateOfBirth || null
             });
           }
 
           if (studentsToRegister.length === 0) {
             showToast("No valid student records found in the file.", "error");
             return;
           }
 
           if (!confirm(`Found ${studentsToRegister.length} valid records. Proceed with bulk import?`)) return;
 
           importUsersBtn.disabled = true;
           importUsersBtn.textContent = "Importing...";
           if (importProgressContainer) {
             importProgressContainer.style.display = "block";
             importProgressBar.style.width = "50%";
             importProgressText.textContent = "Uploading to server...";
           }
 
           const res = await secureFetch(`${API_BASE}/users/bulk-register`, {
             method: "POST",
             body: JSON.stringify(studentsToRegister)
           });
 
           if (res) {
             if (importProgressBar) importProgressBar.style.width = "100%";
             if (importProgressText) importProgressText.textContent = "Import Complete!";
             
             const totalFails = (res.failureCount || 0) + localFailed.length;
             const allErrors = [...localFailed, ...(res.errors || [])];
 
             if (totalFails > 0) {
               let csvContent = "Name,Admission,Failure Reason\n";
               allErrors.forEach(rec => { csvContent += `"${rec.name}","${rec.admission}","${rec.message || rec.reason}"\n`; });
               const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
               const link = document.createElement("a");
               link.href = URL.createObjectURL(blob);
               link.download = "import_errors_log.csv";
               link.click();
               showToast(`Import completed with ${totalFails} errors. Log downloaded.`, "warning");
             } else {
               showToast(`Import complete. ${res.successCount} registered successfully.`, "success");
             }
             clearUsersCache();
             loadUsers(1, true);
             refreshLastAdmissionBadge(document.getElementById("userRole")?.value || 'student');
           }
        } catch (err) {
          console.error("Import error:", err);
          showToast(err.message || "Failed to process file", "error");
        } finally {
          importUsersBtn.disabled = false;
          importUsersBtn.textContent = "📂 Import Students";
          setTimeout(() => { if (importProgressContainer) importProgressContainer.style.display = "none"; }, 3000);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // ---------------------------
  // DOWNLOAD TEMPLATE
  // ---------------------------
  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener("click", () => {
      const headers = ["Name", "Admission", "Grade", "Stream", "Contact"];
      const sampleRow = ["John Doe", "ADM001", "PP1", "Blue", "0712345678"];
      const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + sampleRow.join(",");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "student_import_template.csv");
      document.body.appendChild(link); // Required for FF
      link.click();
      document.body.removeChild(link);
    });
  }

  // 🆕 Print Students List Button Logic
  if (printStudentsListBtn) {
    printStudentsListBtn.addEventListener("click", async () => {
      printStudentsListBtn.disabled = true;
      printStudentsListBtn.innerHTML = '<span class="spinner"></span> Generating PDF...';

      try {
        const search = userSearchInput ? userSearchInput.value.trim() : "";
        let queryParams = `limit=10000&search=${encodeURIComponent(search)}&role=student`; // High limit to get all
        if (studentGradeFilter?.value && studentGradeFilter.value !== "all") queryParams += `&grade=${encodeURIComponent(studentGradeFilter.value)}`;
        if (studentStreamFilter?.value && studentStreamFilter.value !== "all") queryParams += `&stream=${encodeURIComponent(studentStreamFilter.value)}`;

        const res = await secureFetch(`${API_BASE}/users?${queryParams}`);
        if (!res || !res.users) throw new Error("Failed to fetch student data for PDF.");

        const students = res.users;
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) { showToast("PDF Library not loaded", "error"); return; }
        const doc = new jsPDF();

        let title = "Registered Learners List";
        let filterInfo = [];
        if (studentGradeFilter?.value && studentGradeFilter.value !== "all") filterInfo.push(studentGradeFilter.value);
        if (studentStreamFilter?.value && studentStreamFilter.value !== "all") filterInfo.push(`Stream ${studentStreamFilter.value}`);
        if (search) filterInfo.push(`Search: "${search}"`);

        if (filterInfo.length > 0) title += ` (${filterInfo.join(", ")})`;

        doc.text(title, 14, 15);

        const headers = [["Name", "Admission", "Grade", "Stream", "Contact"]];
        const rows = students.map(u => {
          let gradeDisplay = "N/A";
          if (u.grade) {
            const gStr = String(u.grade).trim();
            // FIX: If it's a PP or PG grade, display it as is, otherwise prepend "Grade"
            if (gStr.toUpperCase().startsWith("PP") || gStr.toUpperCase() === "PG") {
              gradeDisplay = gStr;
            } else {
              gradeDisplay = gStr.toLowerCase().startsWith("grade") ? gStr : `Grade ${gStr}`;
            }
          }
          return [
            u.name,
            u.admission || "",
            gradeDisplay,
            u.stream || "-",
            u.contact || ""
          ];
        });

        doc.autoTable({
          head: headers,
          body: rows,
          startY: 20,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [41, 128, 185] },
          didDrawPage: (data) => {
            doc.setFontSize(8);
            doc.setTextColor(100);
            const dateStr = `Generated: ${new Date().toLocaleString()}`;
            doc.text(dateStr, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
            doc.text(`Page ${data.pageNumber} of ${data.pageCount}`, doc.internal.pageSize.getWidth() - data.settings.margin.right, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
          }
        });
        doc.save(`${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
        showToast("PDF generated successfully", "success");

      } catch (err) {
        console.error("Print Students List Error:", err);
        showToast("Failed to generate PDF: " + (err.message || "Unknown error"), "error");
      } finally {
        printStudentsListBtn.disabled = false;
        printStudentsListBtn.innerHTML = '📄 Print Students List';
      }
    });
  }

  // 🆕 Populate student grade filter based on school type
  function populateStudentGradeFilter() {
    if (!studentGradeFilter) return;
    const type = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[type].gradeOptions;
    studentGradeFilter.innerHTML = '<option value="all">All Grades</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`; // Value can be "PG", "PP1" or "Grade 1"
      opt.textContent = (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`; // Display "PG", "PP1" or "Grade 1"
      studentGradeFilter.appendChild(opt);
    });
    studentGradeFilter.addEventListener("change", () => {
      populateStudentStreamFilter();
    });
  }

  // 🆕 Populate student stream filter
  async function populateStudentStreamFilter() {
    if (!studentStreamFilter) return;
    studentStreamFilter.innerHTML = '<option value="all">All Streams</option>';
    try {
      const selectedGrade = studentGradeFilter?.value; // 🆕 Get selected grade
      let query = '';
      if (selectedGrade && selectedGrade !== 'all') {
        query = `?grade=${encodeURIComponent(selectedGrade)}`;
      }
      const streams = await secureFetch(`${API_BASE}/enrollments/unique-streams${query}`); // 🆕 Pass grade
      if (streams && Array.isArray(streams)) {
        streams.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = `Stream ${s}`;
          studentStreamFilter.appendChild(opt);
        });
      }
    } catch (e) { console.error("Failed to load streams:", e); }
  }

  function getStudentExportName(user) {
    return String(user.name || user.fullName || user.firstName || user.lastName || "").trim();
  }

  function sortStudentsAlphabetically(students) {
    return [...students].sort((a, b) => {
      return getStudentExportName(a).localeCompare(getStudentExportName(b), undefined, { sensitivity: "base", numeric: true });
    });
  }

  function createExcelCellStyle({ bold = false, fontSize = 12, align = "left", wrap = true, border = true } = {}) {
    return {
      font: { name: "Calibri", sz: fontSize, bold },
      alignment: { vertical: "center", horizontal: align, wrapText: wrap },
      border: border ? {
        top: { style: "thin", color: { rgb: "FF333333" } },
        bottom: { style: "thin", color: { rgb: "FF333333" } },
        left: { style: "thin", color: { rgb: "FF333333" } },
        right: { style: "thin", color: { rgb: "FF333333" } }
      } : undefined
    };
  }

  function buildStudentWorkbook(rows, { grade = "", stream = "" } = {}) {
    if (!window.XLSX) {
      throw new Error("Excel library is not available.");
    }

    const schoolName = (prefetchedSchoolName || "School").toString().trim() || "School";
    const normalizedGrade = grade && grade !== "all" ? grade : "All";
    const normalizedStream = stream && stream !== "all" ? stream : "All";

    const dataRows = [
      [schoolName],
      ["GRADE", normalizedGrade],
      ["STREAM", normalizedStream],
      [],
      ["No", "ADM NO", "NAME"],
      ...rows
    ];

    const sheet = XLSX.utils.aoa_to_sheet(dataRows);
    sheet['!cols'] = [{ wpx: 40 }, { wpx: 140 }, { wpx: 320 }];
    sheet['!rows'] = [{ hpx: 28 }, { hpx: 22 }, { hpx: 22 }, { hpx: 10 }, { hpx: 24 }];
    sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
    sheet['!pageSetup'] = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    sheet['!printOptions'] = { gridLines: true, horizontalCentered: true, verticalCentered: false };
    sheet['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

    const titleStyle = createExcelCellStyle({ bold: true, fontSize: 15, align: "center", wrap: true });
    const metadataStyle = createExcelCellStyle({ bold: false, fontSize: 12, align: "left", wrap: false });
    const headerStyle = createExcelCellStyle({ bold: true, fontSize: 12, align: "center", wrap: true });

    const applyStyle = (cellRef, style) => {
      const cell = sheet[cellRef];
      if (cell) cell.s = style;
    };

    applyStyle("A1", titleStyle);
    applyStyle("A2", metadataStyle);
    applyStyle("B2", metadataStyle);
    applyStyle("A3", metadataStyle);
    applyStyle("B3", metadataStyle);
    applyStyle("A5", headerStyle);
    applyStyle("B5", headerStyle);
    applyStyle("C5", headerStyle);

    dataRows.slice(5).forEach((_, index) => {
      const rowNumber = index + 6;
      applyStyle(`A${rowNumber}`, metadataStyle);
      applyStyle(`B${rowNumber}`, metadataStyle);
      applyStyle(`C${rowNumber}`, metadataStyle);
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Learner List");
    return workbook;
  }

  function triggerWorkbookDownload(workbook, filename) {
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // 🆕 Download Students List as CSV Button Logic
  if (downloadStudentsCsvBtn) {
    downloadStudentsCsvBtn.addEventListener("click", async () => {
      downloadStudentsCsvBtn.disabled = true;
      downloadStudentsCsvBtn.innerHTML = '<span class="spinner"></span> Generating CSV...';

      try {
        const search = userSearchInput ? userSearchInput.value.trim() : "";
        let queryParams = `limit=10000&search=${encodeURIComponent(search)}&role=student`; // High limit to get all
        if (studentGradeFilter?.value && studentGradeFilter.value !== "all") queryParams += `&grade=${encodeURIComponent(studentGradeFilter.value)}`;
        if (studentStreamFilter?.value && studentStreamFilter.value !== "all") queryParams += `&stream=${encodeURIComponent(studentStreamFilter.value)}`;

        const res = await secureFetch(`${API_BASE}/users?${queryParams}`);
        if (!res || !res.users) throw new Error("Failed to fetch student data for CSV.");

        const students = sortStudentsAlphabetically(res.users);
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }

        await prefetchSchoolAssets();
        const gradeFilterValue = studentGradeFilter?.value || "";
        let streamFilterValue = studentStreamFilter?.value || "";
        if (/^stream\s+/i.test(streamFilterValue)) streamFilterValue = streamFilterValue.replace(/^stream\s+/i, "");

        const rows = students.map(u => [
          u.admission || u.admissionNo || "",
          u.name
        ]);
        const workbook = buildStudentWorkbook(rows, {
          grade: gradeFilterValue,
          stream: streamFilterValue
        });
        triggerWorkbookDownload(workbook, `Registered_Learners_List_${new Date().toISOString().slice(0,10)}.xlsx`);

        showToast("Excel export generated successfully", "success");
      } catch (err) {
        console.error("Download CSV Error:", err);
        showToast("Failed to generate CSV: " + (err.message || "Unknown error"), "error");
      } finally {
        downloadStudentsCsvBtn.disabled = false;
        downloadStudentsCsvBtn.innerHTML = '📊 Download CSV';
      }
    });
  }

  // ---------------------------
  // NEW CSV DOWNLOAD SECTION LOGIC
  // ---------------------------

  // Populate grade filter for the new CSV download section
  function populateCsvGradeFilter() {
    if (!csvGradeFilter) return;
    const type = getSchoolTypeKey();
    const grades = SCHOOL_TYPES[type].gradeOptions;
    csvGradeFilter.innerHTML = '<option value="all">All Grades</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      const isPP = String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG";
      opt.value = isPP ? g : `Grade ${g}`;
      opt.textContent = isPP ? g : `Grade ${g}`;
      csvGradeFilter.appendChild(opt);
    });
  }

  // Populate stream filter for the new CSV download section
  async function populateCsvStreamFilter() {
    const csvGradeFilter = document.getElementById("csvGradeFilter");
    const csvStreamFilter = document.getElementById("csvStreamFilter");
    if (!csvStreamFilter) return;
    csvStreamFilter.innerHTML = '<option value="all">All Streams</option>';
    try {
      const selectedGrade = csvGradeFilter?.value;
      let query = '';
      if (selectedGrade && selectedGrade !== 'all') {
        query = `?grade=${encodeURIComponent(selectedGrade)}`;
      }
      const streams = await secureFetch(`${API_BASE}/enrollments/unique-streams${query}`);
      if (streams && Array.isArray(streams)) {
        streams.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = `Stream ${s}`;
          csvStreamFilter.appendChild(opt);
        });
      }
    } catch (e) { console.error("Failed to load streams for CSV filter:", e); }
  }

  function getCsvDownloadFilterValues() {
    const rawGradeVal = document.getElementById("csvGradeFilter")?.value || "";
    const rawStreamVal = document.getElementById("csvStreamFilter")?.value || "";
    const gradeVal = rawGradeVal.trim();
    let streamVal = rawStreamVal.trim();
    if (/^stream\s+/i.test(streamVal)) streamVal = streamVal.replace(/^stream\s+/i, "");
    return { gradeVal, streamVal };
  }

  function validateCsvDownloadFilters() {
    const { gradeVal, streamVal } = getCsvDownloadFilterValues();
    const gradeMissing = !gradeVal || gradeVal === "all";
    const streamMissing = !streamVal || streamVal === "all";
    if (gradeMissing || streamMissing) {
      const message = gradeMissing && streamMissing
        ? "Please select a grade and a stream before downloading."
        : gradeMissing
          ? "Please select a grade before downloading."
          : "Please select a stream before downloading.";
      showToast(message, "warning");
      return { valid: false };
    }
    return { valid: true, gradeVal, streamVal };
  }

  // Event listener for the new CSV download button
  if (downloadFilteredStudentsCsvBtn) {
    downloadFilteredStudentsCsvBtn.addEventListener("click", async () => {
      const validation = validateCsvDownloadFilters();
      if (!validation.valid) return;
      const { gradeVal, streamVal } = validation;

      const originalHTML = downloadFilteredStudentsCsvBtn.innerHTML;
      downloadFilteredStudentsCsvBtn.disabled = true;
      downloadFilteredStudentsCsvBtn.innerHTML = '<span class="spinner"></span> Generating CSV...';

      try {
        // 🆕 Added '_t' (timestamp) to bypass backend/browser caching and fix "stuck" filters
        let params = new URLSearchParams({ limit: 5000, role: "student", page: 1, _t: Date.now() });
        if (gradeVal && gradeVal !== "all") params.append("grade", gradeVal);
        if (streamVal && streamVal !== "all") params.append("stream", streamVal);

        const res = await secureFetch(`${API_BASE}/users?${params.toString()}`);
        if (!res || !res.users) throw new Error("Failed to fetch student data for CSV.");

        const students = sortStudentsAlphabetically(res.users);
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }
        await prefetchSchoolAssets();
        const rows = students.map((u, index) => [
          index + 1,
          u.admission || u.admissionNo || "",
          u.name
        ]);
        const workbook = buildStudentWorkbook(rows, {
          grade: gradeVal,
          stream: streamVal
        });
        const timestamp = new Date().toISOString().slice(0,10);
        triggerWorkbookDownload(workbook, `Filtered_Students_List_${timestamp}.xlsx`);

        showToast("Excel export generated successfully", "success");
      } catch (err) {
        console.error("Download Filtered CSV Error:", err);
        showToast("Failed to generate CSV: " + (err.message || "Unknown error"), "error");
      } finally {
        downloadFilteredStudentsCsvBtn.disabled = false;
        downloadFilteredStudentsCsvBtn.innerHTML = originalHTML;
      }
    });
  }

  // ---------------------------
  // 🆕 DOWNLOAD SCORE SHEETS PDF
  // ---------------------------
  if (downloadScoreSheetsPdfBtn) {
    downloadScoreSheetsPdfBtn.addEventListener("click", async () => {
      const validation = validateCsvDownloadFilters();
      if (!validation.valid) return;
      const { gradeVal, streamVal } = validation;

      const originalHTML = downloadScoreSheetsPdfBtn.innerHTML;
      downloadScoreSheetsPdfBtn.disabled = true;
      downloadScoreSheetsPdfBtn.innerHTML = '<span class="spinner"></span> Generating PDF...';

      try {
        // Fetch students for the selected grade/stream

        // Fetch students for the selected grade/stream
        let params = new URLSearchParams({ limit: 5000, role: "student", page: 1, _t: Date.now() });
        if (gradeVal && gradeVal !== "all") params.append("grade", gradeVal);
        if (streamVal && streamVal !== "all") params.append("stream", streamVal);

        const res = await secureFetch(`${API_BASE}/users?${params.toString()}`);
        if (!res || !res.users) throw new Error("Failed to fetch student data for PDF.");

        const students = sortStudentsAlphabetically(res.users);
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }

        // Get current year
        const currentYear = new Date().getFullYear();

        // Use prefetched school info/logo if available to speed up PDF generation
        let schoolName = prefetchedSchoolName || "School";
        let schoolLogoBase64 = prefetchedSchoolLogoBase64 || null;
        // Fallback: if not prefetched, fetch now (rare)
        if (!schoolLogoBase64 || !prefetchedSchoolName) {
          try {
            const schoolRes = await secureFetch(`${API_BASE}/my-school?includeLogo=true&fields=name,logo,logoMimeType`);
            schoolName = schoolRes?.schoolName || schoolRes?.name || schoolName;
            const logoCandidate = schoolRes?.logo;
            const mime = schoolRes?.logoMimeType || 'image/png';
            if (logoCandidate) {
              if (typeof logoCandidate === 'string' && logoCandidate.startsWith('data:')) {
                schoolLogoBase64 = logoCandidate;
              } else if (typeof logoCandidate === 'string' && (logoCandidate.startsWith('http') || logoCandidate.startsWith('/'))) {
                try {
                  const resp = await fetch(logoCandidate.startsWith('/') ? (window.location.origin + logoCandidate) : logoCandidate);
                  const blob = await resp.blob();
                  schoolLogoBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                } catch (err) {
                  console.warn('Failed to fetch/convert school logo:', err);
                }
              } else if (typeof logoCandidate === 'string') {
                schoolLogoBase64 = `data:${mime};base64,${logoCandidate}`;
              }
            }
          } catch (e) {
            console.warn("Could not fetch school info:", e);
          }
        }

        // Generate a blank score sheet PDF for teacher entry
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let currentY = 15;

        // 🆕 Use active term from API if available, fallback to month-based calculation
        let termLabel = activeTermValue || 'Term 1';
        if (!termLabel.includes('Term')) {
          // If activeTermValue is just a number, format it
          const currentMonth = new Date().getMonth() + 1;
          let currentTerm = '1';
          if (currentMonth >= 5 && currentMonth <= 8) currentTerm = '2';
          else if (currentMonth >= 9) currentTerm = '3';
          termLabel = `Term ${currentTerm}`;
        }

        // Header (school name centered)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const schoolNameY = currentY;
        doc.text(schoolName.toUpperCase(), pageWidth / 2, schoolNameY, { align: 'center' });
        currentY += 8;

        doc.setFontSize(12);
        doc.text('OFFICIAL SCORE SHEET', pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;

        // Place logo on the upper-left of the page (left-hand side)
        if (schoolLogoBase64) {
          try {
            const imgProps = doc.getImageProperties(schoolLogoBase64);
            const maxLogoHeight = 28; // mm
            let logoWidth = 28;
            let logoHeight = (imgProps.height / imgProps.width) * logoWidth;
            if (logoHeight > maxLogoHeight) {
              const scale = maxLogoHeight / logoHeight;
              logoHeight = maxLogoHeight;
              logoWidth = logoWidth * scale;
            }
            const logoX = 14; // left margin
            const logoY = 6;  // upper area of the page
            doc.addImage(schoolLogoBase64, imgProps.imageType || 'PNG', logoX, logoY, logoWidth, logoHeight, undefined, 'FAST');
          } catch (err) {
            console.warn('Could not embed school logo in PDF:', err);
          }
        }

        doc.setFont('helvetica', 'normal');
        // Header details (make key info bold)
        const normalizedGrade = gradeVal && gradeVal.toString().trim();
        const gradeLabel = normalizedGrade && normalizedGrade.toLowerCase().startsWith('grade ') ? normalizedGrade : `Grade ${normalizedGrade}`;
        const gradeDisplay = normalizedGrade && normalizedGrade !== "all"
          ? (streamVal ? `${gradeLabel} - ${streamVal}` : gradeLabel)
          : "All Grades";
        // Academic Year and Class/Stream in bold
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`Academic Year: ${currentYear}`, 14, currentY);
        doc.text(`Class / Stream: ${gradeDisplay}`, pageWidth - 14, currentY, { align: 'right' });
        currentY += 7;

        const generatedOn = new Date().toLocaleDateString();
        // Generated line bold
        doc.setFontSize(9);
        doc.text(`Printed: ${generatedOn}`, 14, currentY);
        // small right note in normal weight
        doc.setFont('helvetica', 'normal');
        doc.text(`For teacher score entry only`, pageWidth - 14, currentY, { align: 'right' });
        currentY += 8;
        // Reset to normal
        doc.setFont('helvetica', 'normal');

        doc.setDrawColor(15, 118, 110);
        doc.setLineWidth(0.8);
        doc.line(14, currentY, pageWidth - 14, currentY);
        currentY += 10;

        // Prepare table data for blank score entry
        const headers = [
          [
            { content: "No", rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: "ADM No", rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: "Name", rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
            { content: termLabel, colSpan: 3, styles: { halign: 'center', valign: 'middle' } }
          ],
          [
            "Opener", "Midterm", "Endterm"
          ]
        ];

        const tableData = students.map((student, index) => {
          const admission = student.admission || student.admissionNo || "";
          const name = (student.name || "").substring(0, 35);
          return [index + 1, admission, name, "", "", ""];
        });

        doc.autoTable({
          head: headers,
          body: tableData,
          startY: currentY,
          margin: { left: 14, right: 14, bottom: 24 },
          tableWidth: pageWidth - 28,
          tableLineColor: [130, 130, 130],
          tableLineWidth: 0.2,
          styles: {
            font: 'helvetica',
            fontSize: 8,
            halign: 'center',
            valign: 'middle',
            cellPadding: 2,
            lineColor: [130, 130, 130],
            lineWidth: 0.2,
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { cellWidth: 14, halign: 'center' },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 66, halign: 'left' },
            3: { cellWidth: 27 },
            4: { cellWidth: 27 },
            5: { cellWidth: 27 }
          },
          headStyles: {
            fillColor: [15, 118, 110],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center',
            valign: 'middle',
            lineColor: [255, 255, 255],
            lineWidth: 0.4
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: [20, 20, 20],
            cellPadding: 2,
            lineColor: [130, 130, 130],
            lineWidth: 0.2
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250]
          },
          didDrawPage: (data) => {
            const pageCount = doc.internal.pages.length - 1;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text('CompetenceHub Score_Sheets', pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
          }
        });

        // Add watermark (school logo) to all pages, faint and centered
        if (schoolLogoBase64) {
          try {
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
              doc.setPage(i);
              try {
                const imgProps = doc.getImageProperties(schoolLogoBase64);
                const format = imgProps.imageType || 'PNG';
                const maxWidth = pageWidth * 0.6;
                let w = Math.min(maxWidth, 140);
                let h = (imgProps.height * w) / imgProps.width;
                if (h > pageHeight * 0.6) {
                  const scale = (pageHeight * 0.6) / h;
                  h = h * scale;
                  w = w * scale;
                }
                doc.saveGraphicsState();
                doc.setGState(new doc.GState({ opacity: 0.06 }));
                doc.addImage(schoolLogoBase64, format, (pageWidth - w) / 2, (pageHeight - h) / 2, w, h, undefined, 'FAST');
                doc.restoreGraphicsState();
              } catch (e) {
                console.warn('Watermark rendering error:', e);
              }
            }
          } catch (e) {
            console.warn('Failed to apply watermark to pages:', e);
          }
        }

        // Add official footer section on the first page if there is room below the table
        const firstPageY = doc.lastAutoTable?.finalY || currentY;
        const footerSpacing = 14;
        const footerHeight = 16;
        if (firstPageY + footerSpacing + footerHeight < pageHeight - 24) {
          const footerY = firstPageY + footerSpacing;
          doc.setFontSize(10);
          doc.setTextColor(0);
          doc.text('__________________________', 40, footerY);
          doc.text('Teacher Signature', 40, footerY + 5);
          doc.text('__________________________', pageWidth - 80, footerY);
          doc.text('Date', pageWidth - 80, footerY + 5);
        }

        // Download the PDF
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = gradeVal && gradeVal !== "all" 
          ? `Score_Sheet_${gradeVal}${streamVal ? '_' + streamVal : ''}_${timestamp}.pdf`
          : `Score_Sheet_All_Grades_${timestamp}.pdf`;

        doc.save(filename);
        showToast("PDF generated successfully", "success");

      } catch (err) {
        console.error("Download Score Sheet PDF Error:", err);
        showToast("Failed to generate PDF: " + (err.message || "Unknown error"), "error");
      } finally {
        downloadScoreSheetsPdfBtn.disabled = false;
        downloadScoreSheetsPdfBtn.innerHTML = originalHTML;
      }
    });
  }

  // ---------------------------
  // USER TYPE TABS (🆕)
  // ---------------------------
  function setupUserTypeTabs() {
    const userTabs = document.querySelectorAll(".user-type-tabs li");
    const heading = document.querySelector(".tab-section#userManagement h3") || document.querySelector(".card h3");

    if (userTabs.length === 0) return;

    // Set the initial heading based on the default active tab
    const activeTab = document.querySelector(".user-type-tabs li.active");
    if (heading && activeTab) heading.textContent = activeTab.textContent;

    // Add event listeners to role tabs
    userTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        userTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const role = tab.getAttribute("data-role");
        currentRoleTab = role;
        
        // Toggle visibility of student-specific filters
        if (studentFiltersContainer) {
          if (role === "student") {
            studentFiltersContainer.style.display = "flex";
          } else {
            studentFiltersContainer.style.display = "none";
          }
        }

        if (heading) heading.textContent = tab.textContent;
        
        usersPage = 1;
        clearUsersCache();
        loadUsers(1, true);
      });
    });

    // Fetch all counts once to populate labels for all tabs
    refreshAllTabCounts();
  }

  // ---------------------------
  // NAVIGATION / TAB SWITCHING
  // ---------------------------
  function setupNavigation() {
    const tabs = document.querySelectorAll(".menu li");
    const sections = document.querySelectorAll(".tab-section");
 
    const pageTitle = document.getElementById('pageTitle');
    
    const sectionTitles = {
      "registerTab": "Register New User",
      "userManagement": "Registered Users",
      "downloadStudentDataTab": "Download Student Data" // NEW TITLE
    };
  

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetId = tab.getAttribute("data-section");
        if (!targetId) return;

        // Update active tab styling
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        // Toggle visibility of sections
        if (pageTitle) {
          pageTitle.textContent = sectionTitles[targetId] || targetId;
        }
        
        // 🆕 Ensure the view jumps to the top when switching sections
        window.scrollTo(0, 0);

        sections.forEach((sec) => {
          sec.style.display = sec.id === targetId ? "block" : "none";
        });

        // 🆕 Special handling for Users Management tab - lazy load on first click
        if (targetId === "userManagement" && !usersTabInitialized) {
          usersTabInitialized = true;
          populateStudentGradeFilter();
          populateStudentStreamFilter();
          loadUsers(1, true);
          console.log("[LAZY LOAD] Users table initialized on first tab click");
        }

        // Special handling for the new CSV download tab
        if (targetId === "downloadStudentDataTab") {
          // Only populate if they are currently empty to prevent wiping user selections
          if (csvGradeFilter && csvGradeFilter.options.length <= 1) {
            populateCsvGradeFilter();
            populateCsvStreamFilter();
            // Ensure change listener is only attached once
            csvGradeFilter.onchange = () => {
              populateCsvStreamFilter();
              if (csvStreamFilter) csvStreamFilter.value = "all";
            };
          }
          // Prefetch school assets to speed up Score Sheets PDF generation
          prefetchSchoolAssets();
        }

        // 🆕 Special handling for Demographics tab - lazy load on first click
        if (targetId === "learnerDemographicsTab" && !demographicsTabInitialized) {
          demographicsTabInitialized = true;
          if (window.demographicsModule && typeof window.demographicsModule.initLazy === 'function') {
            window.demographicsModule.initLazy();
            console.log("[LAZY LOAD] Demographics tab initialized on first tab click");
          }
        }
      });
    });

    const active = document.querySelector(".menu li.active[data-section]") || document.querySelector(".menu li[data-section]");
    if (active) active.click();
  }

  // 🆕 LOAD ACTIVE TERM FROM CONFIGURATION
  async function loadActiveTerm() {
    const cacheKey = "term-config";
    
    // Check cache first
    const cached = termConfigCache.get(cacheKey);
    if (cached) {
      activeTermValue = cached.activeTerm;
      return cached.activeTerm;
    }

    // Prevent duplicate in-flight requests
    if (termConfigInFlight.has(cacheKey)) {
      // Wait for existing request
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (termConfigCache.has(cacheKey)) {
          const cached = termConfigCache.get(cacheKey);
          activeTermValue = cached.activeTerm;
          return cached.activeTerm;
        }
      }
      return activeTermValue; // Return last known value if cache still empty
    }

    termConfigInFlight.add(cacheKey);

    try {
      const res = await secureFetch(`${API_BASE}/settings/term-config`);
      if (!res) return activeTermValue;

      const { termConfig = { activeTerm: 'Term 1' } } = res;
      termConfigCache.set(cacheKey, termConfig);
      activeTermValue = termConfig.activeTerm;
      return termConfig.activeTerm;
    } catch (err) {
      console.warn("Error loading active term:", err);
      // Fallback to Term 1 if API fails
      activeTermValue = 'Term 1';
      return 'Term 1';
    } finally {
      termConfigInFlight.delete(cacheKey);
    }
  }

  // Initialize Application
  (async function init() {
    userProfile = await authService.getUserProfile(["admin"]);
    if (!userProfile) return;
    authService.initLogout();

    // Fetch school info to determine grade options for learner registration
    // 🚀 Optimization: Request only schoolType to exclude heavy/unneeded data like logo or address.
    schoolInfo = await secureFetch(`${API_BASE}/my-school?fields=schoolType`);
    if (schoolInfo) {
      populateRegistrationGrades();
    }

    // 🆕 Fetch active term configuration from API
    await loadActiveTerm();

    // Prefetch school name and logo in background to speed up PDF generation
    (async function prefetchSchoolAssets() {
      try {
        const schoolRes = await secureFetch(`${API_BASE}/my-school?includeLogo=true&fields=name,logo,logoMimeType`);
        if (schoolRes) {
          prefetchedSchoolName = schoolRes?.schoolName || schoolRes?.name || prefetchedSchoolName;
          const logoCandidate = schoolRes?.logo;
          const mime = schoolRes?.logoMimeType || 'image/png';
          if (logoCandidate) {
            if (typeof logoCandidate === 'string' && logoCandidate.startsWith('data:')) {
              prefetchedSchoolLogoBase64 = logoCandidate;
            } else if (typeof logoCandidate === 'string' && (logoCandidate.startsWith('http') || logoCandidate.startsWith('/'))) {
              try {
                const resp = await fetch(logoCandidate.startsWith('/') ? (window.location.origin + logoCandidate) : logoCandidate);
                const blob = await resp.blob();
                prefetchedSchoolLogoBase64 = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } catch (err) {
                console.warn('Failed to fetch/convert prefetched school logo:', err);
              }
            } else if (typeof logoCandidate === 'string') {
              prefetchedSchoolLogoBase64 = `data:${mime};base64,${logoCandidate}`;
            }
          }
        }
      } catch (e) {
        console.warn('Prefetch school assets failed:', e);
      }
    })();

    // 🆕 Setup navigation and user type tabs first
    setupNavigation();
    setupUserTypeTabs();

    // 🆕 Lazy load: Only populate filters and load users when the tab is actually clicked
    // Don't load here - let setupNavigation handle it via lazy loading

    // Refresh the admission badge immediately if the form is already set to student/learner
    if (userRoleSelect && (userRoleSelect.value === 'student' || userRoleSelect.value === 'learner')) {
      refreshLastAdmissionBadge(userRoleSelect.value);
    }

    // 🆕 Defer tab count loading: Load counts after main UI is ready (background task)
    setTimeout(() => refreshAllTabCounts(), 500);
  })();
})();
