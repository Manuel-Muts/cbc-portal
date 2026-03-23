// docs/js/users.js
(function () {
  const API_BASE = config.api.baseURL;
  const token = localStorage.getItem("token");

  if (!token) {
    alert("You must log in first.");
    window.location.href = "/login";
    return;
  }

  // DOM Elements
  const registerForm = document.getElementById("registerForm");
  const registerFeedback = document.getElementById("registerFeedback");
  const userRoleSelect = document.getElementById("userRole");
  const studentFields = document.getElementById("studentFields");
  
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
  
  // Pagination
  const usersPrevPageBtn = document.getElementById("usersPrevPage");
  const usersNextPageBtn = document.getElementById("usersNextPage");
  const usersPageInfo = document.getElementById("usersPageInfo");
  let usersPage = 1;
  const usersPerPage = 10;
  let usersTotalRecords = 0;
  const usersCache = {};

  // ---------------------------
  // HELPERS (Copied/Shared Logic)
  // ---------------------------
  function showToast(message, type = "info") {
    const t = document.createElement("div");
    t.style.position = "fixed"; t.style.right = "16px"; t.style.bottom = "16px";
    t.style.padding = "10px 14px"; t.style.background = type === "error" ? "#F8D7DA" : "#D4EDDA";
    t.style.borderRadius = "8px"; t.textContent = message; t.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function showConfirm(options) {
    return new Promise(resolve => {
      if (confirm(options.message || "Are you sure?")) resolve(true);
      else resolve(false);
    });
  }

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

  // ---------------------------
  // UI LOGIC
  // ---------------------------
  if (userRoleSelect) {
    userRoleSelect.addEventListener("change", () => {
      if (userRoleSelect.value === "student") {
        studentFields.style.display = "flex";
      } else {
        studentFields.style.display = "none";
      }
    });
  }

  // ---------------------------
  // USERS TABLE LOGIC
  // ---------------------------
  function renderUsers(data = []) {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = "";
    
    if (data.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center">No users found</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    data.forEach(u => {
      // Skip super admin
      if (u.role === "super_admin" || u.isSuperAdmin === true) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.role}</td>
        <td>${u.role === "student" ? (u.admission || "") : (u.email || "")}</td>
        <td>
          <button data-id="${u._id}" class="btn danger-btn delete-user-btn" style="padding: 4px 8px; font-size: 12px;">🗑️ Delete</button>
          ${u.role !== "student" ? `<button data-id="${u._id}" class="btn secondary-btn resend-creds-btn" style="padding: 4px 8px; font-size: 12px;">📧 Resend</button>` : ""}
        </td>
      `;
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
    
    if (!forceReload && usersCache[page]) {
      renderUsers(usersCache[page]);
      updateUsersPagination(page, usersTotalPages);
      return;
    }

    usersTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center">Loading...</td></tr>`;
    const search = userSearchInput ? userSearchInput.value.trim() : "";
    
    const res = await secureFetch(`${API_BASE}/users?page=${page}&limit=${usersPerPage}&search=${encodeURIComponent(search)}`);
    if (res) {
      const { users = [], total = 0, pages = 1 } = res;
      usersTotalPages = pages;
      usersTotalRecords = total;
      usersCache[page] = users;
      renderUsers(users);
      updateUsersPagination(page, pages);
    }
  }

  function updateUsersPagination(page, totalPages) {
    if (usersPageInfo) usersPageInfo.textContent = `Page ${page} of ${totalPages}`;
    if (usersPrevPageBtn) usersPrevPageBtn.disabled = page <= 1;
    if (usersNextPageBtn) usersNextPageBtn.disabled = page >= totalPages;
  }

  function clearUsersCache() {
    Object.keys(usersCache).forEach(key => delete usersCache[key]);
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
    let debounceTimer;
    userSearchInput.addEventListener("input", () => {
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
      } else {
        body.email = email;
      }

      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showFeedback(registerFeedback, "User registered successfully", "success");
        registerForm.reset();
        studentFields.style.display = "none";
        clearUsersCache();
        loadUsers(1, true);
      } else {
        const err = await res.text();
        // Try parsing json error
        try {
           const jsonErr = JSON.parse(err);
           showFeedback(registerFeedback, jsonErr.msg || jsonErr.message || "Registration failed", "error");
        } catch(e) {
           showFeedback(registerFeedback, "Registration failed: " + err, "error");
        }
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
      doc.text("Registered Users List", 14, 15);
      
      const rows = [];
      document.querySelectorAll("#usersTable tbody tr").forEach(tr => {
        const cells = tr.querySelectorAll("td");
        if (cells.length > 0) {
          rows.push([cells[0].textContent, cells[1].textContent, cells[2].textContent]);
        }
      });

      doc.autoTable({
        head: [["Name", "Role", "Email/Admission"]],
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

          if (!confirm(`Found ${jsonData.length} records. Proceed with import? Columns expected: Name, Admission, Grade, Stream (Optional)`)) return;

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
            // Case insensitive key mapping
            const name = row.Name || row.name || row.NAME;
            const admission = row.Admission || row.admission || row.ADMISSION;
            const grade = row.Grade || row.grade || row.GRADE;
            const stream = row.Stream || row.stream || row.STREAM;

            if (!name || !admission || !grade) {
              failCount++;
              failedRecords.push({
                name: name || "N/A",
                admission: admission || "N/A", 
                reason: "Missing required fields (Name, Admission, or Grade)"
              });
              continue;
            }

            if (!name || !admission || !grade) {
              failCount++;
              failedRecords.push({
                name: name || "Unknown",
                admission: admission || "Unknown", 
                reason: "Missing required fields"
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
              const res = await fetch(`${API_BASE}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(body)
              });

              if (res.ok) {
                successCount++;
              } else {
                failCount++;
                const errText = await res.text();
                let reason = "Unknown error";
                try {
                   const jsonErr = JSON.parse(errText);
                   reason = jsonErr.msg || jsonErr.message || errText;
                } catch(e) {
                   reason = errText || res.statusText;
                }
                failedRecords.push({ name, admission, reason });
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

  // Initialize
  loadUsers();


})();
