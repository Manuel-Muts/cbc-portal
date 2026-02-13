//admin.js
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

  // DOM shortcuts
  const schoolNameDisplay = document.getElementById("schoolNameDisplay");

  let schoolInfo = null;


  // DOM elements
  const registerForm = document.getElementById("registerForm");
  const registerFeedback = document.getElementById("registerFeedback");
  const usersTableBody = document.querySelector("#usersTable tbody");
  const teacherSelect = document.getElementById("teacherSelect");
  const classTeacherSelect = document.getElementById("classTeacherSelect");
  const gradeRangeSelect = document.getElementById("gradeRange");
  const gradesSelect = document.getElementById("gradesSelect");
  const subjectsSelect = document.getElementById("subjectsSelect");
  const streamInput = document.getElementById("streamInput"); // 🆕 Stream for subjects
  const classStreamSelect = document.getElementById("classStreamSelect"); // 🆕 Stream for class teacher
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
  const fromAcademicYearInput = document.getElementById("fromAcademicYear");
  const toAcademicYearInput = document.getElementById("toAcademicYear");
  const previewPromotionBtn = document.getElementById("previewPromotionBtn");
  const confirmPromotionBtn = document.getElementById("confirmPromotionBtn");
  const promotionPreviewBody = document.querySelector("#promotionPreviewTable tbody");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
   const studentSearchBody = document.getElementById("studentSearchBody");


  let isRefreshing = false;
// ---------------------------
// FETCH SCHOOL INFO
// ---------------------------
const BACKEND_URL = "http://localhost:5000";

async function loadSchoolInfo() {
  try {
    const res = await fetch(`${API_BASE}/school-info`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Failed to fetch school info");

    schoolInfo = await res.json();
    window.schoolInfo = schoolInfo;
    renderSchoolInfo();

  } catch (err) {
    console.error("School info error:", err);
    showToast("Failed to load school info", "error");
  }
}

function renderSchoolInfo() {
  if (!schoolNameDisplay || !schoolInfo) return;

  const logoURL = schoolInfo.logo
    ? `${BACKEND_URL}${schoolInfo.logo}`   // ✅ ONE PLACE ONLY
    : "";

  schoolNameDisplay.innerHTML = `
  <div class="school-header">
    ${logoURL ? `<img src="${logoURL}" class="school-logo" crossorigin="anonymous">` : ""}
    <h1 class="school-name">${schoolInfo.name || "School Name"}</h1>
    <p class="school-address">${schoolInfo.address || ""}</p>
  </div>
`;


  // For PDF export
  if (window.schoolLogoElem && logoURL) {
    schoolLogoElem.crossOrigin = "anonymous";
    schoolLogoElem.src = logoURL;
  }
}



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
  promotionPreviewBody.innerHTML = "";

  if (!data.length) {
    promotionPreviewBody.innerHTML =
      `<tr><td colspan="5" style="text-align:center">No students found</td></tr>`;
    confirmPromotionBtn.disabled = true;
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
  confirmPromotionBtn.disabled = !data.some(s => s.status === "active");
}


previewPromotionBtn.addEventListener("click", async () => {
  const year = fromAcademicYearInput.value.trim();
  if (!year) {
    showToast("Enter academic year", "error");
    return;
  }

  const res = await secureFetch(
    `${API_BASE}/promotions/preview?academicYear=${year}`
  );

  if (res) renderPromotionPreview(res.preview);
});

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
});


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
    "1-3": ["Mathematics", "Kiswahili", "English", "Environmental Activities", "Social Studies", "Christian Religious Education", "Creative Arts and Sports"],
    "4-6": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Christian Religious Education", "Creative Arts and Sports"],
    "7-9": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Pre-Technical Studies", "Agriculture", "Christian Religious Education", "Creative Arts and Sports"]
  };

  // SENIOR SCHOOL PATHWAYS & COURSES (Grade 10-12)
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
      "Christian Religious Education",
      "Kenya Sign Language",
      "Literature in English",
      "Fasihi ya Kiswahili",
      "Indigenous Language",
      "Hindu Religious Education",
      "French",
      "German",
      "Islamic Religious Education"
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
      "Music and Dance",
      "Theatre and Film",
      "Sports and Recreation"
    ]
  };

  // ---------------------------
  // RENDER HELPERS
  // ---------------------------
  function clearElement(el) { if (el) el.innerHTML = ""; }

 function renderUsers(data = []) {
  if (!usersTableBody) return;

  usersTableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  data.forEach(u => {

    // ================
    // EXEMPT SUPER ADMIN
    // ================
    if (
      u.role === "super_admin" ||                   // by role
      u.email === "admin@admin.com" ||             // by email (adjust if needed)
      u.isSuperAdmin === true                      // optional backend flag
    ) {
      return; // skip rendering this user
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.name}</td>
      <td>${u.role}</td>
      <td>${u.role === "student" ? (u.admission || "") : (u.email || "")}</td>
      <td class="action-col">
        <button data-id="${u._id}" class="delete-user-btn">🗑️ Delete</button>
        ${
          u.role !== "student"
            ? `<button data-id="${u._id}" class="resend-creds-btn">📧 Resend</button>`
            : ""
        }
      </td>
    `;
    frag.appendChild(tr);
  });

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
        const email = b.parentElement.previousElementSibling.textContent.trim();
        const ok = await showConfirm({ message: "Resend login credentials to this user?" });
        if (!ok) return;
        try {
          const result = await secureFetch(`${API_BASE}/users/resend-credentials`, { 
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ email: email })
          });
          if (result) {
            showToast("Credentials re-sent successfully", "success");
          }
        } catch (err) {
          console.error("Resend error:", err);
          showToast("Failed to resend credentials", "error");
        }
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
          const gradeLabel = alloc.stream ? `Grade ${alloc.grade}${alloc.stream}` : `Grade ${alloc.grade}`;
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${index === 0 ? item.name : ""}</td>
            <td>${gradeLabel}</td>
            <td>${Array.isArray(alloc.subjects) && alloc.subjects.length > 0 ? alloc.subjects.join(", ") : "No subjects allocated"}</td>
            <td>
              <button class="danger" data-id="${item._id}" data-grade="${alloc.grade}" data-stream="${alloc.stream || ''}" data-action="remove-subjects">Remove</button>
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

  document.getElementById("cancelEditBtn").onclick = () => modal.remove();

  document.getElementById("saveEditBtn").onclick = async () => {
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
      studentSearchBtn.click(); // refresh search results
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

(async function initialLoad() {
  if (isRefreshing) return;
  try { 
    await Promise.all([
      loadUsers(), 
      loadSubjectAllocations(), 
      loadClassAllocations(),
      loadSchoolInfo()  // ✅ Fetch school info here
    ]); 
  } catch (err) { 
    console.error("Initial load error:", err); 
  }
})();


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
    const grade = role === "student" ? document.getElementById("studentGrade").value.trim() : null;
    const stream = role === "student" ? document.getElementById("studentStream").value.trim() : null;

    // -------------------
    // Validate inputs
    // -------------------
    if (!role) {
      showFeedback(registerFeedback, "Please select a role", "error");
      resetSubmitBtn();
      return;
    }

    if (!name) {
      showFeedback(registerFeedback, "Please enter full name", "error");
      resetSubmitBtn();
      return;
    }

    // Students: require admission & grade
    if (role === "student") {
      if (!admission) {
        showFeedback(registerFeedback, "Admission number is required for students", "error");
        resetSubmitBtn();
        return;
      }
      if (!grade) {
        showFeedback(registerFeedback, "Please select a grade for the student", "error");
        resetSubmitBtn();
        return;
      }
    }

    // Teachers & Accounts: require email
    if ((role === "teacher" || role === "accounts") && !email) {
      showFeedback(registerFeedback, "Email is required for this role", "error");
      resetSubmitBtn();
      return;
    }

    // -------------------
    // Build request body
    // -------------------
    const body = { role, name };

    if (role === "student") {
      body.admission = admission;
      body.grade = grade;
      if (stream) {
        body.stream = stream; // Include stream if provided
      }
    } else {
      // Teacher or Accounts: include email
      body.email = email;
    }

    // -------------------
    // Make API request
    // -------------------
    const token = localStorage.getItem("token"); 
    console.log("Register body:", body);

    try {
      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (res && res.ok) {
        showFeedback(registerFeedback, "User registered successfully", "info");
        registerForm.reset();
        await loadUsers();
        showToast("User registered", "success");
      } else {
        const errorText = await res.text();
        showFeedback(registerFeedback, `Failed to register user: ${errorText}`, "error");
      }
    } catch (err) {
      console.error(err);
      showFeedback(registerFeedback, "Network error or server issue", "error");
    }

    resetSubmitBtn();

    function resetSubmitBtn() {
      if (submitBtn) { 
        submitBtn.disabled = false; 
        Array.from(submitBtn.querySelectorAll(".spinner")).forEach(n => n.remove());
      }
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
const stream = streamInput?.value?.trim() || null; // 🆕 Get stream from input
const subjects = subjectsSelect ? Array.from(subjectsSelect.selectedOptions).map(opt => opt.value) : [];

const res = await fetch(`${API_BASE}/users/subjects/assign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ teacherId, gradeRange, grade, stream, subjects }) // 🆕 Include stream
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
    const assignedStream = classStreamSelect?.value?.trim() || null; // 🆕 Get stream from input

    const res = await fetch(`${API_BASE}/users/classes/assign-teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ teacherId, assignedClass, assignedStream }) // 🆕 Include stream
    });

    if (res && res.ok) {
      await loadClassAllocations(); // should GET /users/classes/allocations and pass to renderClassAllocations
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
    let stream = e.target.dataset.stream; // 🆕 capture stream from dataset
    
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
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ teacherId, grade, stream })
      });
      
      console.log(`[DEBUG] Remove result:`, result);
      
      if (result) {
        // Wait a moment for backend to process
        await new Promise(r => setTimeout(r, 800));
        
        // Reload all allocations to refresh the table
        await loadSubjectAllocations();
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
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ teacherId })
        });
        
        if (result) {
          await loadClassAllocations();
          showToast("Class allocation removed", "success");
        } else {
          showToast("Failed to remove class allocation", "error");
        }
      } catch (err) {
        console.error("Remove class allocation error:", err);
        showToast("Error removing class allocation", "error");
      }
    }
  });
// ---------------------------
//EDIT ENROLLMENT BUTTON HANDLER
// ---------------------------
  studentSearchBody.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("btn-edit")) return;

  const tr = e.target.closest("tr");
  const enrollmentId = tr.dataset.enrollmentId;

if (!enrollmentId) {
  showToast("No enrollment found for this student", "error");
  return;
}

const res = await secureFetch(
  `${API_BASE}/enrollments/${enrollmentId}`
);
  try {
    if (!res) return;
    
    openEditModal(res); // render edit form with fetched data
  } catch (err) {
    console.error("Edit fetch error:", err);
    showToast(err.message || "Failed to fetch student data", "error");
  }
});

// ---------------------------
// VIEW HISTORY BUTTON HANDLER
// ---------------------------
studentSearchBody.addEventListener("click", async (e) => {
  const btn = e.target;

  if (!btn.classList.contains("btn-history")) return;

  const tr = btn.closest("tr");
  const studentId = tr?.dataset.studentId;

  if (!studentId) {
    showToast("Student ID missing", "error");
    return;
  }

  await openHistoryModal(studentId);
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
if (exportUsersBtn) {
  exportUsersBtn.addEventListener("click", () => {
    try {
      console.log(`[Export] Users button clicked`);
      exportTableToPDF("usersTable", "Registered Users");
    } catch (err) {
      console.error("PDF export error:", err);
      showToast("Failed to export PDF: " + err.message, "error");
    }
  });
}

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
// USERS TABLE COLLAPSE
// ---------------------------
const toggleUsersBtn = document.getElementById("toggleUsersBtn");
const usersContent = document.getElementById("usersContent");
const usersPanelHeader = document.querySelector("#usersPanel .panel-header");

function toggleUsersPanel() {
  const isCollapsed = usersContent.classList.toggle("collapsed");
  toggleUsersBtn.textContent = isCollapsed ? "►" : "▼";
}

if (toggleUsersBtn && usersPanelHeader) {
  // Clicking header or button both collapse the panel
  toggleUsersBtn.addEventListener("click", toggleUsersPanel);
  usersPanelHeader.addEventListener("click", (e) => {
    if (e.target.id !== "toggleUsersBtn") toggleUsersPanel();
  });
}

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
  // ---------------------------
// PROMOTION TABLE FILTER
// ---------------------------

studentSearchBtn.addEventListener("click", async () => {
  const q = studentSearchInput.value.trim();
  if (!q) {
    showToast("Enter name or admission", "info");
    return;
  }

  const res = await secureFetch(
    `${API_BASE}/enrollments/admin-search?q=${encodeURIComponent(q)}`
  );

  studentSearchBody.innerHTML = "";

  if (!res || !res.results.length) {
    studentSearchBody.innerHTML =
      `<tr><td colspan="6" style="text-align:center">No student found</td></tr>`;
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
    <td>${s.academicYear || "-"}</td>
    <td>${gradeLabel}</td>
    <td>${s.status}</td>
    <td>
      <button class="btn-history" data-student-id="${s.studentId}" data-student-name="${s.name}" style="padding: 6px 10px; margin-right: 5px; background: #0077b6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📋 History</button>
      <button class="btn-edit" data-enrollment-id="${s.enrollmentId}" data-student-id="${s.studentId}" style="padding: 6px 10px; background: #2ecc71; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">✏️ Edit</button>
    </td>
  `;

  studentSearchBody.appendChild(tr);
});

});

})();
