(function () {
  // ---------------------------
  // CONFIG + DOM SHORTCUTS
  // ---------------------------
  const API_BASE = "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  if (!token) {
    alert("You must log in first.");
    window.location.href = "login.html";
    return;
  }
  console.log("Stored token:", token);

  // DOM elements
  const registerForm = document.getElementById("registerForm");
  const registerFeedback = document.getElementById("registerFeedback");
  const usersTableBody = document.querySelector("#usersTable tbody");
  const teacherSelect = document.getElementById("teacherSelect");
  const classTeacherSelect = document.getElementById("classTeacherSelect");
  const gradeRangeSelect = document.getElementById("gradeRange");
  const gradesSelect = document.getElementById("gradesSelect");
  const subjectsSelect = document.getElementById("subjectsSelect");
  const subjectAllocTableBody = document.querySelector("#subjectAllocTable tbody");
  const classAllocTableBody = document.querySelector("#classAllocTable tbody");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userSearchInput = document.getElementById("userSearchInput");
  const subjectSearchInput = document.getElementById("subjectSearchInput");
  const classSearchInput = document.getElementById("classSearchInput");
  const exportUsersBtn = document.getElementById("exportUsersBtn");
  const exportSubjectsBtn = document.getElementById("exportSubjectsBtn");
  const exportClassBtn = document.getElementById("exportClassBtn");
  const subjectAllocForm = document.getElementById("subjectAllocForm");
  const classAllocForm = document.getElementById("classAllocForm");
  const classGradeSelect = document.getElementById("classGradeSelect");
  const subjectAllocTable = document.getElementById("subjectAllocTable");
  const classAllocTable = document.getElementById("classAllocTable");
  const usersTable = document.getElementById("usersTable");

  let isRefreshing = false;

  // ---------------------------
  // SMALL UI HELPERS
  // ---------------------------
  let toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toastContainer";
    toastContainer.style.position = "fixed";
    toastContainer.style.right = "16px";
    toastContainer.style.bottom = "16px";
    toastContainer.style.zIndex = "9999";
    document.body.appendChild(toastContainer);
  }

  function showToast(message, type = "info", duration = 3000) {
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = message;
    t.style.marginTop = "8px";
    t.style.padding = "10px 14px";
    t.style.borderRadius = "8px";
    t.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)";
    t.style.background = type === "error" ? "#F8D7DA" : type === "success" ? "#D4EDDA" : "#E2E3E5";
    t.style.color = "#000";
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 350);
    }, duration);
  }

  function showConfirm({ title = "Confirm", message = "Are you sure?", confirmText = "Yes", cancelText = "No" } = {}) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.background = "rgba(0,0,0,0.4)";
      overlay.style.zIndex = "10000";
      overlay.style.display = "flex";
      overlay.style.justifyContent = "center";
      overlay.style.alignItems = "center";

      const box = document.createElement("div");
      box.style.background = "#fff";
      box.style.padding = "18px";
      box.style.borderRadius = "8px";
      box.style.minWidth = "320px";
      box.style.boxShadow = "0 8px 28px rgba(0,0,0,0.2)";

      const h = document.createElement("h4");
      h.textContent = title;
      h.style.margin = "0 0 8px 0";

      const p = document.createElement("p");
      p.textContent = message;
      p.style.margin = "0 0 14px 0";

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.justifyContent = "flex-end";
      btnRow.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = cancelText;
      cancelBtn.style.padding = "6px 10px";
      cancelBtn.onclick = () => { overlay.remove(); resolve(false); };

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = confirmText;
      confirmBtn.style.padding = "6px 10px";
      confirmBtn.style.background = "#0078D4";
      confirmBtn.style.color = "#fff";
      confirmBtn.style.border = "none";
      confirmBtn.onclick = () => { overlay.remove(); resolve(true); };

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(confirmBtn);
      box.appendChild(h);
      box.appendChild(p);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

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
      .feedback.error { color: #721c24; background: #f8d7da; padding:8px; border-radius:6px; }
      .feedback.info { color: #0f5132; background: #d1e7dd; padding:8px; border-radius:6px; }
      .toast { transition: opacity .35s ease; }
      tr.clickable-row { cursor: pointer; }
      .danger { background: #dc3545; color: #fff; border: none; padding: 4px 8px; border-radius:4px; cursor:pointer; }
    `;
    document.head.appendChild(style);
  })();

  // ---------------------------
  // API HELPER
  // ---------------------------
  async function secureFetch(url, options = {}) {
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
  const gradeSubjects = {
    "1-3": ["Mathematics", "Kiswahili", "English", "Environmental Activities", "Social Studies", "CRE", "Creative Arts and Sports"],
    "4-6": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "CRE", "Creative Arts and Sports"],
    "7-9": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Pre-Technical Studies", "Agriculture", "CRE", "Creative Arts and Sports"]
  };

  // ---------------------------
  // RENDER HELPERS
  // ---------------------------
  function clearElement(el) { if (el) el.innerHTML = ""; }

  function renderUsers(data = []) {
    if (!usersTableBody) return;
    const frag = document.createDocumentFragment();
    data.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.role}</td>
        <td>${u.role === 'student' ? (u.admission || "") : (u.email || "")}</td>
        <td class="action-col">
          <button data-id="${u._id}" class="delete-user-btn">🗑️ Delete</button>
          ${u.role !== 'student' ? `<button data-id="${u._id}" class="resend-creds-btn">📧 Resend</button>` : ''}
        </td>
      `;
      frag.appendChild(tr);
    });
    clearElement(usersTableBody);
    usersTableBody.appendChild(frag);

    usersTableBody.querySelectorAll(".delete-user-btn").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const ok = await showConfirm({ message: "Delete this user?" });
        if (!ok) return;
        await secureFetch(`${API_BASE}/users/${id}`, { method: "DELETE" });
        await loadUsers();
        showToast("User deleted", "success");
      };
    });

    usersTableBody.querySelectorAll(".resend-creds-btn").forEach(b => {
      b.onclick = async () => {
        const id = b.dataset.id;
        const ok = await showConfirm({ message: "Resend login credentials to this user?" });
        if (!ok) return;
        await secureFetch(`${API_BASE}/users/resend-credentials`, { 
          method: "POST",
          body: JSON.stringify({ userId: id })
        });
        showToast("Credentials re-sent successfully", "success");
      };
    });
  }

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
          <td>${item.name}</td>
          <td></td>
          <td></td>
          <td>
            <button class="danger" data-id="${item._id}" data-action="remove-subjects">Remove</button>
          </td>
        `;
        frag.appendChild(tr);
      } else {
        allocations.forEach((alloc, index) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${index === 0 ? item.name : ""}</td>
            <td>${alloc.grade}</td>
            <td>${Array.isArray(alloc.subjects) && alloc.subjects.length > 0 ? alloc.subjects.join(", ") : "No subjects allocated"}</td>
            <td>
              <button class="danger" data-id="${item._id}" data-grade="${alloc.grade}" data-action="remove-subjects">Remove</button>
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
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.teacherName}${item.isClassTeacher ? " (Class Teacher)" : ""}</td>
        <td>${item.assignedClass || ""}</td>
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
  async function loadUsers() {
    if (!usersTableBody) return;
    const original = usersTableBody.innerHTML;
    usersTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center">${createSpinner().outerHTML} Loading users...</td></tr>`;
    const data = await secureFetch(`${API_BASE}/users`);
    if (!data) { usersTableBody.innerHTML = original; return; }
    renderUsers(data);
    populateTeacherSelects(data);
  }

  async function loadSubjectAllocations() {
    if (!subjectAllocTableBody) return;
    subjectAllocTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center">${createSpinner().outerHTML} Loading allocations...</td></tr>`;
    const data = await secureFetch(`${API_BASE}/users/subjects/allocations`);
    if (!data) { subjectAllocTableBody.innerHTML = ""; return; }
    renderSubjectAllocations(data);
  }

  async function loadClassAllocations() {
    if (!classAllocTableBody) return;
    classAllocTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center">${createSpinner().outerHTML} Loading class allocations...</td></tr>`;
    // ✅ Corrected URL
    const data = await secureFetch(`${API_BASE}/users/allocations`);
    if (!data) { classAllocTableBody.innerHTML = ""; return; }
    renderClassAllocations(data);
  }

  // ---------------------------
  // FORM SUBMISSIONS
  // ---------------------------
  if (registerForm) {
  registerForm.addEventListener("submit", async e => {
    e.preventDefault();

    const submitBtn = registerForm.querySelector("button[type='submit']");
    if (submitBtn) { 
      submitBtn.disabled = true; 
      submitBtn.appendChild(createSpinner(12)); 
    }

    // -------------------
    // Get form values
    // -------------------
    const role = document.getElementById("userRole").value.trim();
    const name = document.getElementById("userName").value.trim();
    const email = document.getElementById("userEmail").value.trim();
    const admission = document.getElementById("userAdmission").value.trim();

    // -------------------
    // Validate inputs
    // -------------------
    if (!role) {
      showFeedback(registerFeedback, "Please select a role", "error");
      if (submitBtn) submitBtn.disabled = false;
      Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
      return;
    }

    if (!name) {
      showFeedback(registerFeedback, "Please enter full name", "error");
      if (submitBtn) submitBtn.disabled = false;
      Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
      return;
    }

    if (role === "student" && !admission) {
      showFeedback(registerFeedback, "Admission number is required for students", "error");
      if (submitBtn) submitBtn.disabled = false;
      Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
      return;
    }

    if (role === "teacher" && !email) {
      showFeedback(registerFeedback, "Email is required for teachers", "error");
      if (submitBtn) submitBtn.disabled = false;
      Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
      return;
    }

    // -------------------
    // Build request body
    // -------------------
    const body = { role, name };
    if (role === "teacher") body.email = email;
    if (role === "student") body.admission = admission;

    // -------------------
    // Make API request
    // -------------------
    const token = localStorage.getItem("token"); // or however you store it
     console.log("Register body:", body);
  const res = await fetch(`${API_BASE}/users/register`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`   // ✅ include token
  },
  body: JSON.stringify(body)
});

    if (res) {
      showFeedback(registerFeedback, "User registered successfully", "info");
      registerForm.reset();
      await loadUsers();
      showToast("User registered", "success");
    } else {
      showFeedback(registerFeedback, "Failed to register user", "error");
    }

    if (submitBtn) { 
      submitBtn.disabled = false; 
      Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
    }
  });
}

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
const subjects = subjectsSelect ? Array.from(subjectsSelect.selectedOptions).map(opt => opt.value) : [];

const res = await fetch(`${API_BASE}/users/subjects/assign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ teacherId, gradeRange, grade, subjects }) // ✅ send grade
});

      if (res && res.ok) { await loadSubjectAllocations(); showToast("Subject allocation saved successfully!", "success"); }
      else { showToast("Failed to save subject allocation", "error"); }

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

    const res = await fetch(`${API_BASE}/users/classes/assign-teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ teacherId, assignedClass }) // matches controller
    });

    if (res && res.ok) {
      await loadClassTeacherAllocations(); // should GET /users/classes/allocations and pass to renderClassAllocations
      showToast("Class allocation saved successfully!", "success");
    } else {
      showToast("Failed to save class allocation", "error");
    }

    if (submitBtn) { submitBtn.disabled = false; Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove()); }
  });
}

  // ---------------------------
  // REMOVE BUTTON HANDLERS
  // ---------------------------

  subjectAllocTableBody?.addEventListener("click", async (e) => {
  if (e.target.dataset.action === "remove-subjects") {
    const teacherId = e.target.dataset.id;
    const grade = e.target.dataset.grade; // 👈 capture grade from dataset

    const ok = await showConfirm({ message: `Remove allocation for grade ${grade}?` });
    if (!ok) return;

    await secureFetch(`${API_BASE}/users/subjects/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ teacherId, grade }) // 👈 send both teacherId and grade
    });

    await loadSubjectAllocations();
    showToast(`Allocation for grade ${grade} removed`, "success");
  }
});
//remove class allocation handler
  classAllocTableBody?.addEventListener("click", async (e) => {
    if (e.target.dataset.action === "remove-class") {
      const teacherId = e.target.dataset.id;
      const ok = await showConfirm({ message: "Remove this class allocation?" });
      if (!ok) return;
      await secureFetch(`${API_BASE}/users/classes/remove`, { method: "POST", body: JSON.stringify({ teacherId }) });
      await loadClassAllocations();
      showToast("Class allocation removed", "success");
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
        const results = await Promise.allSettled([loadUsers(), loadSubjectAllocations(), loadClassAllocations()]);
        results.forEach((r, idx) => {
          if (r.status === "rejected") errors.push({ step: ["loadUsers", "loadSubjectAllocations", "loadClassAllocations"][idx], error: r.reason });
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
  if (userSearchInput) userSearchInput.addEventListener("input", function () { const q = this.value.toLowerCase(); document.querySelectorAll("#usersTable tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"); });
  if (subjectSearchInput) subjectSearchInput.addEventListener("input", function () { const q = this.value.toLowerCase(); document.querySelectorAll("#subjectAllocTable tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"); });
  if (classSearchInput) classSearchInput.addEventListener("input", function () { const q = this.value.toLowerCase(); document.querySelectorAll("#classAllocTable tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"); });

  // ---------------------------
  // DYNAMIC GRADE & SUBJECT MULTI-SELECT
  // ---------------------------
  if (gradeRangeSelect) {
    gradeRangeSelect.addEventListener("change", () => {
      const selectedRange = gradeRangeSelect.value;
      if (gradesSelect) { gradesSelect.innerHTML = ""; gradesSelect.multiple = true; if (selectedRange) { const [start, end] = selectedRange.split("-").map(Number); for (let i=start;i<=end;i++){ const opt=document.createElement("option"); opt.value=i; opt.textContent=`Grade ${i}`; gradesSelect.appendChild(opt); }}}
      if (subjectsSelect) { subjectsSelect.innerHTML=""; subjectsSelect.multiple=true; if(selectedRange && gradeSubjects[selectedRange]) gradeSubjects[selectedRange].forEach(sub=>{ const opt=document.createElement("option"); opt.value=sub; opt.textContent=sub; subjectsSelect.appendChild(opt); }); }
    });
  }

  function setupMultiSelectSelectAll(selectElement, selectAllBtnId, deselectAllBtnId) {
    if (!selectElement) return;
    document.getElementById(selectAllBtnId)?.addEventListener("click",()=>Array.from(selectElement.options).forEach(opt=>opt.selected=true));
    document.getElementById(deselectAllBtnId)?.addEventListener("click",()=>Array.from(selectElement.options).forEach(opt=>opt.selected=false));
  }
  setupMultiSelectSelectAll(gradesSelect, "selectAllGradesBtn", "deselectAllGradesBtn");
  setupMultiSelectSelectAll(subjectsSelect, "selectAllSubjectsBtn", "deselectAllSubjectsBtn");

  // ---------------------------
  // EXPORT TO PDF
  // ---------------------------
 function exportTableToPDF(tableId, title) {
  if (tableId === "usersTable") {
    // Users table: only visible rows
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const table = document.getElementById("usersTable");
    if (!table) return showToast("Table not found", "error");

    const headers = [];
    const rows = [];
    table.querySelectorAll("thead th").forEach(th => {
      const t = th.textContent.trim();
      if (t.toLowerCase() !== "action") headers.push(t);
    });

    table.querySelectorAll("tbody tr").forEach(tr => {
      if (tr.style.display === "none") return; // skip hidden rows
      const row = [];
      tr.querySelectorAll("td").forEach((td, i) => {
        const h = table.querySelectorAll("thead th")[i]?.textContent.trim().toLowerCase();
        if (h !== "action") row.push(td.textContent.trim());
      });
      if (row.length) rows.push(row);
    });

    const addTableAndSave = () => {
      
      doc.setFontSize(12); doc.text(title, 50, 22);
      doc.setFontSize(10); doc.text(`Exported on: ${new Date().toLocaleString()}`, 50, 28);
      doc.autoTable({ head: [headers], body: rows, startY: 40, theme: 'grid', styles: { fontSize: 10 } });
      doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
    };

    const logo = new Image();
    logo.src = "logo.png";
    logo.onload = () => addTableAndSave();
    logo.onerror = () => addTableAndSave();
  } else {
    // For other tables, fallback to previous behavior
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const table = document.getElementById(tableId);
    if (!table) return showToast("Table not found", "error");

    const headers = [];
    const rows = [];
    table.querySelectorAll("thead th").forEach(th => { 
      const t = th.textContent.trim();
      if (t.toLowerCase() !== "action") headers.push(t);
    });
    table.querySelectorAll("tbody tr").forEach(tr => {
      const row = [];
      tr.querySelectorAll("td").forEach((td,i)=>{
        const h = table.querySelectorAll("thead th")[i]?.textContent.trim().toLowerCase();
        if (h!=="action") row.push(td.textContent.trim());
      });
      rows.push(row);
    });

    const addTableAndSave = () => {
     
      doc.setFontSize(12); doc.text(title, 50, 22);
      doc.setFontSize(10); doc.text(`Exported on: ${new Date().toLocaleString()}`, 50, 28);
      doc.autoTable({ head: [headers], body: rows, startY: 40, theme: 'grid', styles: { fontSize: 10 } });
      doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
    };

    const logo = new Image();
    logo.src = "logo.png";
    logo.onload = () => addTableAndSave();
    logo.onerror = () => addTableAndSave();
  }
}


  exportUsersBtn?.addEventListener("click", () => exportTableToPDF("usersTable", " "));
  exportSubjectsBtn?.addEventListener("click", () => exportTableToPDF("subjectAllocTable", "Subject Allocations"));
  exportClassBtn?.addEventListener("click", () => exportTableToPDF("classAllocTable", "Class Teacher Allocations"));

  // ---------------------------
// EXPORT TO PDF BUTTONS
// ---------------------------

// Users table: exclude admins
exportUsersBtn?.addEventListener("click", () => {
  exportTableToPDF("usersTable", " ");
});

// Subjects table: normal export
exportSubjectsBtn?.addEventListener("click", () => {
  exportTableToPDF("subjectAllocTable", "Subject Allocations");
});

// Class allocations table: normal export
exportClassBtn?.addEventListener("click", () => {
  exportTableToPDF("classAllocTable", "Class Teacher Allocations");
});

  // ---------------------------
  // LOGOUT
  // ---------------------------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const ok = await showConfirm({ message: "Are you sure you want to logout?" });
      if (!ok) return;
      localStorage.removeItem("token");
      window.location.href = "login.html";
    });
  }

  // ---------------------------
  // INITIAL LOAD
  // ---------------------------
  (async function initialLoad() {
    if (isRefreshing) return;
    try { await Promise.all([loadUsers(), loadSubjectAllocations(), loadClassAllocations()]); }
    catch (err) { console.error("Initial load error:", err); }
  })();

  // ---------------------------
  // BACKWARD-COMPATIBLE GLOBAL FUNCTIONS
  // ---------------------------
  window.deleteUser = async function (id) {
    const ok = await showConfirm({ message: "Delete this user?" });
    if (!ok) return;
    await secureFetch(`${API_BASE}/user/${id}`, { method: "DELETE" });
    await loadUsers();
    showToast("User deleted", "success");
  };

  window.resendCredentials = async function (id) {
    const ok = await showConfirm({ message: "Resend login credentials to this user?" });
    if (!ok) return;
    await secureFetch(`${API_BASE}/user/resend-credentials`, { method: "POST", body: JSON.stringify({ userId: id }) });
    showToast("Credentials re-sent successfully", "success");
  };

})();
