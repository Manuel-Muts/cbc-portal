// docs/js/users.js
(function () {
  const API_BASE = config.api.baseURL;

  // Inject CSS to reduce row height in the users table
  const compactUsersStyle = document.createElement("style");
  compactUsersStyle.textContent = `
    #usersTable td {
      padding: 4px 10px !important;
      vertical-align: middle !important;
    }
    #usersTable th {
      padding: 8px 10px !important;
      position: sticky;
      top: 0;
      background: #f8f9fa;
      z-index: 10;
    }
    .user-type-tabs {
      display: flex;
      list-style: none;
      padding: 0;
      margin: 5px 0 10px 0;
      border-bottom: 1px solid #dee2e6;
    }
    .user-type-tabs li {
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      color: #6c757d;
      font-weight: 600;
      transition: all 0.2s;
    }
    .user-type-tabs li.active {
      border-bottom-color: #2563eb;
      color: #2563eb;
    }

    .tab-section { padding-top: 0 !important; margin-top: 0 !important; align-self: flex-start !important; }
    .card { padding: 10px 15px !important; margin-top: 0 !important; }
    .card h2, .card h3 { margin-top: 0 !important; margin-bottom: 10px !important; }
    
    .admin-section-header-row {
      margin-bottom: 10px !important;
    }

    /* Modern Toast & Confirm Styles */
    #toastContainer { position: fixed; right: 20px; bottom: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; }
    .toast { 
      padding: 12px 18px; border-radius: 8px; color: white !important; font-weight: 600; font-size: 0.9rem;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2); min-width: 250px;
      transform: translateX(0); transition: all 0.35s ease;
    }
    .toast-success { background: #38a169 !important; border-left: 5px solid #22543d; }
    .toast-error { background: #e53e3e !important; border-left: 5px solid #742a2a; }
    .toast-info { background: #3182ce !important; border-left: 5px solid #2a4365; }
    .toast.hiding { opacity: 0; transform: translateX(50px); }

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
    .confirm-box p { margin: 0 0 25px; color: #4a5568; line-height: 1.6; }
    .confirm-buttons { display: flex; justify-content: center; gap: 15px; }
    .confirm-buttons .btn { padding: 10px 24px; font-size: 0.95rem; font-weight: 700; border-radius: 10px; border: none; cursor: pointer; }
  `;
  document.head.appendChild(compactUsersStyle);

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
  let userProfile = null;
  let usersTotalRecords = 0;
  let usersTotalPages = 1;
  const usersCache = {}; // In-memory fallback
  const PERSISTENT_CACHE_PREFIX = "users_mgmt_cache_";
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  let currentRoleTab = "student"; // Default view: Learners (Students)

  // ---------------------------
  // SCHOOL TYPE & GRADE HELPERS
  // ---------------------------
  const SCHOOL_TYPES = {
    full: {
      label: "Full School (Grades 1-12)",
      gradeOptions: ["1","2","3","4","5","6","7","8","9","10","11","12"]
    },
    primary_junior: {
      label: "Primary + Junior (Grades 1-9)",
      gradeOptions: ["1","2","3","4","5","6","7","8","9"]
    },
    senior: {
      label: "Senior School (Grades 10-12)",
      gradeOptions: ["10","11","12"]
    }
  };

  let schoolInfo = null;

  function populateRegistrationGrades() {
    const select = document.getElementById("studentGrade");
    if (!select) return;
    const type = (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
    const grades = SCHOOL_TYPES[type].gradeOptions;
    select.innerHTML = '<option value="">-- Select Grade --</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = `Grade ${g}`;
      select.appendChild(opt);
    });
  }

  // 🆕 Helper for consistent labels across tabs and headings
  function getRoleLabel(role) {
    if (role === "student") return "Registered Learners";
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
        throw new Error(text || `Request failed: ${res.status}`);
      }
      const contentType = res.headers.get("content-type") || "";
      return contentType.includes("application/json") ? res.json() : res.text();
    } catch (err) {
      console.error("Fetch error:", err);
      showToast(err.message, "error");
      return null;
    }
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
      if (userRoleSelect.value === "student") {
        // Show student-specific registration fields
        studentFields.style.display = "flex";
        if (emailGroup) emailGroup.style.display = "none";
        // Show student-specific filters and print button
        if (studentFiltersContainer) studentFiltersContainer.style.display = "flex";
      } else {
        // Hide student-specific registration fields
        studentFields.style.display = "none";
        if (emailGroup) emailGroup.style.display = "block";
        // Hide student-specific filters and print button
        if (studentFiltersContainer) studentFiltersContainer.style.display = "none";
      }
      // Always reload users when role changes to apply new filters
      loadUsers(1, true);
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
    const colCount = isStudentView ? 6 : 4;

    // 🆕 Dynamically Update Headers
    if (isStudentView) {
      thead.innerHTML = `
        <th>Name</th>
        <th>Role</th>
        <th>Admission</th>
        <th>Grade</th>
        <th>Parent's Contact</th>
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
        console.log(`[DEBUG] Raw Learner Data (${u.admission || u.name}):`, u);

        // Ultra-Robust Grade Detection: Check every possible field and variation used in the system
        let rawGrade = u.grade || u.currentGrade || u.classGrade || u.assignedClass || u.className || u.assignedGrade || u.classLabel || u.gradeName || u['class'] || u.assignedGradeLevel || "";

        // Handle cases where the grade is nested inside a populated enrollment object
        if (rawGrade && typeof rawGrade === 'object') rawGrade = rawGrade.grade || rawGrade.name || rawGrade.label || rawGrade.gradeName || "";
        if (!rawGrade && u.enrollmentId) rawGrade = (typeof u.enrollmentId === 'object') ? u.enrollmentId.grade : "";
        if (!rawGrade && u.enrollment) rawGrade = (typeof u.enrollment === 'object') ? u.enrollment.grade : "";
        if (!rawGrade && u.allocations && u.allocations.length > 0) rawGrade = u.allocations[0].grade || u.allocations[0].gradeLevel || "";
        if (!rawGrade && u.studentId && typeof u.studentId === 'object') rawGrade = u.studentId.grade;

        let gradeDisplay = "N/A";

        if (rawGrade) {
          const gStr = String(rawGrade).trim();
          gradeDisplay = gStr.toLowerCase().startsWith("grade") ? gStr : `Grade ${gStr}`;
          
          // Append stream if it exists and isn't already part of the grade string (and is not null)
          let stream = (u.stream || u.assignedStream || u.classStream || u.currentStream || "").trim();
          if (!stream && u.enrollmentId && typeof u.enrollmentId === 'object') stream = u.enrollmentId.stream || "";
          
          if (stream && !gradeDisplay.toLowerCase().includes(String(stream).toLowerCase())) gradeDisplay += ` ${stream}`;
        }

        tr.innerHTML = `
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td>${u.admission || u.admissionNo || ""}</td>
          <td>${gradeDisplay}</td>
          <td>${u.contact || ""}</td>
          <td>
            <button data-id="${u._id}" class="btn danger-btn delete-user-btn" style="padding: 4px 8px; font-size: 12px;">🗑️ Delete</button>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td>${u.name}</td>
          <td>${u.role}</td>
          <td>${u.email || (u.role === "student" ? u.admission : "")}</td>
          <td>
            <button data-id="${u._id}" class="btn danger-btn delete-user-btn" style="padding: 4px 8px; font-size: 12px;">🗑️ Delete</button>
            ${u.role !== "student" ? `<button data-id="${u._id}" class="btn secondary-btn resend-creds-btn" style="padding: 4px 8px; font-size: 12px;">📧 Resend</button>` : ""}
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
      const contact = document.getElementById("studentContact").value.trim();

      // Validation
      if (!role || !name) {
        showFeedback(registerFeedback, "Role and Name are required", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }
      if (role === "student" && (!admission || !grade)) {
        showFeedback(registerFeedback, "Admission and Grade required for students", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }
      if ((role !== "student") && !email) {
        showFeedback(registerFeedback, "Email required", "error");
        submitBtn.disabled = false; submitBtn.textContent = originalText;
        return;
      }

      const body = { role, name };
      if (role === "student") {
        body.admission = admission;
        body.grade = grade;
        if (stream) body.stream = stream;
        if (contact) body.contact = contact;
      } else {
        body.email = email;
      }

      const res = await secureFetch(`${API_BASE}/users/register`, {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (res) {
        showFeedback(registerFeedback, "User registered successfully", "success");
        registerForm.reset();
        studentFields.style.display = "none";
        clearUsersCache();
        loadUsers(1, true);
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
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

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

          // Robust column mapping helper
          const getVal = (row, ...keys) => {
            const rowKeys = Object.keys(row);
            for (const key of keys) {
              const match = rowKeys.find(rk => rk.trim().toLowerCase() === key.toLowerCase());
              if (match !== undefined) {
                const val = row[match];
                return (val !== undefined && val !== null) ? String(val).trim() : undefined;
              }
            }
            return undefined;
          };

          if (!confirm(`Found ${jsonData.length} records. Proceed with import? Columns expected: Name, Admission, Grade, Stream`)) return;

          importUsersBtn.disabled = true;
          importUsersBtn.textContent = "Importing...";
          
          if (importProgressContainer) {
            importProgressContainer.style.display = "block";
            importProgressBar.style.width = "0%";
          }

          let successCount = 0;
          let failCount = 0;
          const failedRecords = [];

          for (const row of jsonData) {
            // Use robust mapping to find columns even if headers have spaces or different cases
            const name = getVal(row, "Name", "Names", "Student Name", "Full Name");
            const admission = getVal(row, "Admission", "Admission No", "Adm", "Admission Number");
            const grade = getVal(row, "Grade", "Class", "Level");
            const stream = getVal(row, "Stream", "Class Stream", "Section");

            if (!name || admission === undefined || grade === undefined) {
              failCount++;
              failedRecords.push({
                name: name || "N/A",
                admission: admission || "N/A", 
                reason: "Missing required fields (Name, Admission, or Grade)"
              });
              continue;
            }

            const body = {
              role: "student",
              name: String(name),
              admission: String(admission),
              grade: String(grade),
              stream: stream ? String(stream) : null
            };

            try {
              const res = await secureFetch(`${API_BASE}/users/register`, {
                method: "POST",
                body: JSON.stringify(body)
              });

              if (res) {
                successCount++;
              } else {
                failCount++;
                failedRecords.push({ name, admission, reason: "Registration failed" });
              }
            } catch (err) {
              failCount++;
              failedRecords.push({ name, admission, reason: "Network error: " + err.message });
            }

            const processed = successCount + failCount;
            const percentage = Math.round((processed / jsonData.length) * 100);
            
            importUsersBtn.textContent = `Importing ${processed}/${jsonData.length}...`;
            if (importProgressBar) importProgressBar.style.width = `${percentage}%`;
            if (importProgressText) importProgressText.textContent = `Processed ${processed} of ${jsonData.length} records (${percentage}%)`;
          }

          if (failedRecords.length > 0) {
            let csvContent = "Name,Admission,Failure Reason\n";
            failedRecords.forEach(rec => {
              csvContent += `"${rec.name}","${rec.admission}","${rec.reason}"\n`;
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "import_errors_log.csv";
            link.click();
            showToast(`Import completed with ${failCount} errors. Log downloaded.`, "warning");
          } else {
            showToast(`Import complete. ${successCount} registered successfully.`, "success");
          }
          
          importUsersBtn.disabled = false;
          importUsersBtn.textContent = "📂 Import Students";
          
          if (importProgressContainer) setTimeout(() => { importProgressContainer.style.display = "none"; }, 5000);

          clearUsersCache();
          loadUsers(1, true);

        } catch (err) {
          console.error("Import error:", err);
          showToast("Failed to process file", "error");
          importUsersBtn.disabled = false;
          importUsersBtn.textContent = "📂 Import Students";
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
      const headers = ["Name", "Admission", "Grade", "Stream"];
      const sampleRow = ["John Doe", "ADM001", "Grade 1", "Blue"];
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
            gradeDisplay = gStr.toLowerCase().startsWith("grade") ? gStr : `Grade ${gStr}`;
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
    const type = (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
    const grades = SCHOOL_TYPES[type].gradeOptions;
    studentGradeFilter.innerHTML = '<option value="all">All Grades</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = `Grade ${g}`;
      opt.textContent = `Grade ${g}`;
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

        const students = res.users;
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }

        // Define CSV headers
        const headers = ["Name", "Grade"]; // Only Name and Grade
        let csvContent = headers.map(h => `"${h}"`).join(",") + "\n"; // Add quotes for CSV safety

        // Generate CSV rows
        students.forEach(u => {
          let finalGradeOutput = "N/A";
          // Ultra-Robust Grade Detection (same as table view)
          let rawGradeValue = u.grade || u.currentGrade || u.classGrade || u.assignedClass || u.className || u.assignedGrade || u.classLabel || u.gradeName || u['class'] || u.assignedGradeLevel || "";
          if (rawGradeValue && typeof rawGradeValue === 'object') rawGradeValue = rawGradeValue.grade || rawGradeValue.name || rawGradeValue.label || rawGradeValue.gradeName || "";
          if (!rawGradeValue && u.enrollmentId) rawGradeValue = (typeof u.enrollmentId === 'object') ? u.enrollmentId.grade : "";
          if (!rawGradeValue && u.enrollment) rawGradeValue = (typeof u.enrollment === 'object') ? u.enrollment.grade : "";
          if (!rawGradeValue && u.allocations && u.allocations.length > 0) rawGradeValue = u.allocations[0].grade || u.allocations[0].gradeLevel || "";
          if (!rawGradeValue && u.studentId && typeof u.studentId === 'object') rawGradeValue = u.studentId.grade;

          let streamValue = (u.stream || u.assignedStream || u.classStream || u.currentStream || "").trim();
          if (!streamValue && u.enrollmentId && typeof u.enrollmentId === 'object') streamValue = u.enrollmentId.stream || "";

          if (rawGradeValue) {
            const gradeString = String(rawGradeValue).trim();
            const gradeNumberMatch = gradeString.match(/\d+/); // Extract numeric part
            const gradeNumber = gradeNumberMatch ? gradeNumberMatch[0] : null;

            if (gradeNumber) {
              if (streamValue) {
                finalGradeOutput = `${gradeNumber}${streamValue}`; // e.g., "7B"
              } else {
                finalGradeOutput = `Grade ${gradeNumber}`; // e.g., "Grade 7"
              }
            } else {
              finalGradeOutput = gradeString; // Fallback if no number found
            }
          }
          const row = [
            u.name,
            finalGradeOutput
          ];
          csvContent += row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
        });

        // Create a Blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Registered_Learners_List_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showToast("CSV generated successfully", "success");
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
    const type = (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
    const grades = SCHOOL_TYPES[type].gradeOptions;
    csvGradeFilter.innerHTML = '<option value="all">All Grades</option>';
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = `Grade ${g}`;
      opt.textContent = `Grade ${g}`;
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

  // Event listener for the new CSV download button
  if (downloadFilteredStudentsCsvBtn) {
    downloadFilteredStudentsCsvBtn.addEventListener("click", async () => {
      const originalHTML = downloadFilteredStudentsCsvBtn.innerHTML;
      downloadFilteredStudentsCsvBtn.disabled = true;
      downloadFilteredStudentsCsvBtn.innerHTML = '<span class="spinner"></span> Generating CSV...';

      // Robustly fetch current values from the DOM to avoid stale/null references
      const gradeVal = document.getElementById("csvGradeFilter")?.value;
      const streamVal = document.getElementById("csvStreamFilter")?.value;

      try {
        // 🆕 Added '_t' (timestamp) to bypass backend/browser caching and fix "stuck" filters
        let params = new URLSearchParams({ limit: 5000, role: "student", page: 1, _t: Date.now() });
        if (gradeVal && gradeVal !== "all") params.append("grade", gradeVal);
        if (streamVal && streamVal !== "all") params.append("stream", streamVal);

        const res = await secureFetch(`${API_BASE}/users?${params.toString()}`);
        if (!res || !res.users) throw new Error("Failed to fetch student data for CSV.");

        const students = res.users;
        if (students.length === 0) {
          showToast("No students found for the selected filters.", "info");
          return;
        }
        // Define CSV headers
        const headers = ["Name", "Grade"]; // Only Name and Grade
        let csvContent = headers.map(h => `"${h}"`).join(",") + "\n"; // Add quotes for CSV safety

        // Generate CSV rows
        students.forEach(u => {
          let finalGradeOutput = "N/A";
          // Robust Grade Detection: Check every possible field
          let rawGradeValue = u.grade || u.currentGrade || u.classGrade || u.assignedClass || u.className || u.assignedGrade || u.classLabel || u.gradeName || u['class'] || u.assignedGradeLevel || "";
          if (rawGradeValue && typeof rawGradeValue === 'object') rawGradeValue = rawGradeValue.grade || rawGradeValue.name || rawGradeValue.label || rawGradeValue.gradeName || "";
          if (!rawGradeValue && u.enrollmentId) rawGradeValue = (typeof u.enrollmentId === 'object') ? u.enrollmentId.grade : "";
          if (!rawGradeValue && u.enrollment) rawGradeValue = (typeof u.enrollment === 'object') ? u.enrollment.grade : "";
          if (!rawGradeValue && u.allocations && u.allocations.length > 0) rawGradeValue = u.allocations[0].grade || u.allocations[0].gradeLevel || "";
          if (!rawGradeValue && u.studentId && typeof u.studentId === 'object') rawGradeValue = u.studentId.grade;

          let streamValue = (u.stream || u.assignedStream || u.classStream || u.currentStream || "").trim();
          if (!streamValue && u.enrollmentId && typeof u.enrollmentId === 'object') streamValue = u.enrollmentId.stream || "";

          if (rawGradeValue) {
            const gradeString = String(rawGradeValue).trim();
            const gradeNumberMatch = gradeString.match(/\d+/); // Extract numeric part
            const gradeNumber = gradeNumberMatch ? gradeNumberMatch[0] : null;

            if (gradeNumber) {
              if (streamValue) {
                finalGradeOutput = `${gradeNumber}${streamValue}`; // e.g., "7B"
              } else {
                finalGradeOutput = `Grade ${gradeNumber}`; // e.g., "Grade 7"
              }
            } else {
              finalGradeOutput = gradeString; // Fallback if no number found
            }
          }
          const row = [
            u.name,
            finalGradeOutput
          ];
          csvContent += row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\n";
        });

        // Create a Blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0,10);
        link.download = `Filtered_Students_List_${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showToast("CSV generated successfully", "success");
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

        // Special handling for the new CSV download tab
        if (targetId === "downloadStudentDataTab") {
          // Only populate if they are currently empty to prevent wiping user selections
          if (csvGradeFilter && csvGradeFilter.options.length <= 1) {
            populateCsvGradeFilter();
            populateCsvStreamFilter();
            // Ensure change listener is only attached once
            csvGradeFilter.onchange = () => populateCsvStreamFilter();
          }
        }
      });
    });

    const active = document.querySelector(".menu li.active[data-section]") || document.querySelector(".menu li[data-section]");
    if (active) active.click();
  }

  // Initialize Application
  (async function init() {
    userProfile = await authService.getUserProfile(["admin"]);
    if (!userProfile) return;
    authService.initLogout();

    // Fetch school info to determine grade options for learner registration
    schoolInfo = await secureFetch(`${API_BASE}/my-school`);
    if (schoolInfo) {
      populateRegistrationGrades();
    }

    populateStudentGradeFilter(); // Populate student grade filter
    populateStudentStreamFilter(); // Populate student stream filter
    setupNavigation();
    setupUserTypeTabs();
    loadUsers();

    // Fetch all counts once to populate labels for all tabs
    refreshAllTabCounts();
  })();
})();
