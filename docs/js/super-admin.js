document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".menu li");
  const pageTitle = document.getElementById("pageTitle");
  const contentArea = document.getElementById("contentArea");

  const API_BASE = "http://localhost:5000"; // backend base URL

  // ---------------------------
  // SESSION CHECK
  // ---------------------------
  function checkSession() {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in as super-admin.");
      window.location.href = "login.html";
      return false;
    }
    return true;
  }

  // ---------------------------
  // JWT FETCH HELPER
  // ---------------------------
  async function authFetch(url, options = {}) {
    if (!checkSession()) return null;

    const token = localStorage.getItem("token");
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    const res = await fetch(url.startsWith("http") ? url : API_BASE + url, options);

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "login.html";
      return null;
    }

    return res;
  }

  // ---------------------------
  // PASSWORD GENERATOR
  // ---------------------------
  function generatePassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let pass = "";
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  // ---------------------------
  // MENU NAVIGATION
  // ---------------------------
  menuItems.forEach(item => {
    item.addEventListener("click", () => {
      menuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      const page = item.getAttribute("data-page");
      pageTitle.textContent = page.charAt(0).toUpperCase() + page.slice(1);

      loadPage(page);
    });
  });

  // ---------------------------
  // REFRESH BUTTON
  // ---------------------------
  const refreshBtn = document.getElementById("refreshBtn");
  refreshBtn.addEventListener("click", () => {
    const activeItem = document.querySelector(".menu li.active");
    if (activeItem) {
      const page = activeItem.getAttribute("data-page");
      loadPage(page);
    } else {
      location.reload();
    }
  });

  // ---------------------------
  // LOGOUT BUTTON
  // ---------------------------
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "login.html";
  });

  // ---------------------------
  // INITIAL PAGE LOAD
  // ---------------------------
  const firstPage = menuItems[0]?.getAttribute("data-page");
  if (firstPage) loadPage(firstPage);

  // ---------------------------
  // LOAD PAGE FUNCTION
  // ---------------------------
  async function loadPage(page) {
    if (!checkSession()) return;

    switch (page) {
      case "overview":
        contentArea.innerHTML = `<div class="card"><h2>System Overview</h2><p>Summary of system-wide activity.</p></div>`;
        break;

      case "schools":
        initSchoolsPage();
        break;

      case "admins":
        initAdminsPage();
        break;

      case "users":
        contentArea.innerHTML = `<div class="card"><h2>All Users</h2><p>Search and view all users across schools.</p></div>`;
        break;

      case "analytics":
        contentArea.innerHTML = `<div class="card"><h2>Analytics</h2><p>Platform statistics.</p></div>`;
        break;

      case "logs":
        contentArea.innerHTML = `<div class="card"><h2>System Logs</h2><p>Error logs, login logs, email logs.</p></div>`;
        break;

      case "backups":
        contentArea.innerHTML = `<div class="card"><h2>Backups</h2><p>Backup and restore database.</p></div>`;
        break;

      case "settings":
        contentArea.innerHTML = `<div class="card"><h2>System Settings</h2></div>`;
        initSettingsPage();
        break;
    }
  }

  // ---------------------------
  // SCHOOLS LOGIC
  // ---------------------------
  async function initSchoolsPage() {
    contentArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Schools Management</h2>
          <button id="addSchoolBtn" class="primary-btn">+ Add School</button>
        </div>
        <input type="text" id="searchSchools" placeholder="Search schools..." class="search-input">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>School Name</th>
              <th>Admin Email</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="schoolsTable"></tbody>
        </table>
      </div>
      <div id="addSchoolModal" class="modal hidden">
        <div class="modal-content">
          <h3>Add New School</h3>
          <label>School Name</label>
          <input type="text" id="newSchoolName">
          <label>Admin Email</label>
          <input type="email" id="newSchoolAdmin">
          <button id="saveSchoolBtn" class="primary-btn">Save</button>
          <button class="close-btn" onclick="closeAddModal()">Cancel</button>
        </div>
      </div>
      <div id="editSchoolModal" class="modal hidden">
        <div class="modal-content">
          <h3>Edit School</h3>
          <label>School Name</label>
          <input type="text" id="editSchoolName">
          <label>Admin Email</label>
          <input type="email" id="editSchoolAdmin">
          <button id="updateSchoolBtn" class="primary-btn">Update</button>
          <button class="close-btn" onclick="closeEditModal()">Cancel</button>
        </div>
      </div>
    `;

    const addBtn = document.getElementById("addSchoolBtn");
    const modal = document.getElementById("addSchoolModal");
    const saveBtn = document.getElementById("saveSchoolBtn");
    const tableBody = document.getElementById("schoolsTable");
    const searchInput = document.getElementById("searchSchools");

    async function loadSchools() {
      const res = await authFetch(`${API_BASE}/api/schools`);
      if (!res) return;
      const schools = await res.json();

      tableBody.innerHTML = "";
      schools.forEach((s, i) => {
        tableBody.innerHTML += `
          <tr>
            <td>${i + 1}</td>
            <td>${s.name}</td>
            <td>${s.adminEmail}</td>
            <td>${s.status || 'Active'}</td>
            <td>
              <button class="editSchoolBtn" data-id="${s._id}">Edit</button>
              <button class="deleteSchoolBtn" data-id="${s._id}">Delete</button>
            </td>
          </tr>`;
      });

      attachSchoolActions();
    }

    function attachSchoolActions() {
      document.querySelectorAll(".editSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const res = await authFetch(`${API_BASE}/api/schools/${id}`);
          const school = await res.json();

          document.getElementById("editSchoolName").value = school.name;
          document.getElementById("editSchoolAdmin").value = school.adminEmail;
          document.getElementById("editSchoolModal").classList.remove("hidden");

          document.getElementById("updateSchoolBtn").onclick = async () => {
            const name = document.getElementById("editSchoolName").value.trim();
            const adminEmail = document.getElementById("editSchoolAdmin").value.trim();
            await authFetch(`${API_BASE}/api/schools/${id}`, {
              method: "PUT",
              body: JSON.stringify({ name, adminEmail })
            });
            document.getElementById("editSchoolModal").classList.add("hidden");
            loadSchools();
          };
        });
      });

      document.querySelectorAll(".deleteSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          await authFetch(`${API_BASE}/api/schools/${btn.dataset.id}`, { method: "DELETE" });
          loadSchools();
        });
      });
    }

    addBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    window.closeAddModal = () => modal.classList.add("hidden");
    window.closeEditModal = () => document.getElementById("editSchoolModal").classList.add("hidden");

    saveBtn.addEventListener("click", async () => {
      const name = document.getElementById("newSchoolName").value.trim();
      const adminEmail = document.getElementById("newSchoolAdmin").value.trim();
      if (!name || !adminEmail) return alert("Fill all fields");
      const password = generatePassword();
      await authFetch(`${API_BASE}/api/schools`, {
        method: "POST",
        body: JSON.stringify({ name, adminEmail, password })
      });
      modal.classList.add("hidden");
      loadSchools();
    });

    loadSchools();
  }

  // ---------------------------
// ADMINS LOGIC
// ---------------------------
async function initAdminsPage() {
  contentArea.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Admins Management</h2>
        <button id="addAdminBtn" class="primary-btn">+ Add Admin</button>
      </div>
      <input type="text" id="searchAdmins" placeholder="Search admins..." class="search-input">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Admin Name</th>
            <th>Email</th>
            <th>School</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="adminsTable"></tbody>
      </table>
    </div>
    <div id="addAdminModal" class="modal hidden">
      <div class="modal-content">
        <h3>Add New Admin</h3>
        <label>Full Name</label>
        <input type="text" id="newAdminName">
        <label>Email</label>
        <input type="email" id="newAdminEmail">
        <label>Assign School</label>
        <select id="newAdminSchool"></select>
        <button id="saveAdminBtn" class="primary-btn">Save</button>
        <button class="close-btn" onclick="closeAddAdminModal()">Cancel</button>
      </div>
    </div>
    <div id="editAdminModal" class="modal hidden">
      <div class="modal-content">
        <h3>Edit Admin</h3>
        <label>Full Name</label>
        <input type="text" id="editAdminName">
        <label>Email</label>
        <input type="email" id="editAdminEmail">
        <label>School</label>
        <select id="editAdminSchool"></select>
        <button id="updateAdminBtn" class="primary-btn">Update</button>
        <button class="close-btn" onclick="closeEditAdminModal()">Cancel</button>
      </div>
    </div>
  `;

  const addBtn = document.getElementById("addAdminBtn");
  const modal = document.getElementById("addAdminModal");
  const saveBtn = document.getElementById("saveAdminBtn");
  const tableBody = document.getElementById("adminsTable");
  const newAdminSchool = document.getElementById("newAdminSchool");
  const editAdminSchool = document.getElementById("editAdminSchool");

  async function loadSchoolsOptions() {
    const res = await authFetch(`${API_BASE}/api/schools`);
    if (!res) return;
    const schools = await res.json();
    [newAdminSchool, editAdminSchool].forEach(sel => {
      sel.innerHTML = "";
      schools.forEach(s => { sel.innerHTML += `<option value="${s._id}">${s.name}</option>`; });
    });
  }

  async function loadAdmins() {
    const res = await authFetch(`${API_BASE}/api/admins`);
    if (!res) return;
    const admins = await res.json();
    tableBody.innerHTML = "";
    admins.forEach((a, i) => {
      tableBody.innerHTML += `
        <tr>
          <td>${i + 1}</td>
          <td>${a.name}</td>
          <td>${a.email}</td>
          <td>${a.schoolName || ''}</td>
          <td>${a.status || 'Active'}</td>
          <td>
            <button class="editAdminBtn" data-id="${a._id}">Edit</button>
            <button class="deleteAdminBtn" data-id="${a._id}">Delete</button>
          </td>
        </tr>`;
    });
    attachAdminActions();
  }

  function attachAdminActions() {
    document.querySelectorAll(".editAdminBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const res = await authFetch(`${API_BASE}/api/admins/${id}`);
        const admin = await res.json();

        document.getElementById("editAdminName").value = admin.name;
        document.getElementById("editAdminEmail").value = admin.email;
        document.getElementById("editAdminSchool").value = admin.schoolId;
        document.getElementById("editAdminModal").classList.remove("hidden");

        document.getElementById("updateAdminBtn").onclick = async () => {
          const name = document.getElementById("editAdminName").value.trim();
          const email = document.getElementById("editAdminEmail").value.trim();
          const schoolId = document.getElementById("editAdminSchool").value;
          await authFetch(`${API_BASE}/api/admins/${id}`, {
            method: "PUT",
            body: JSON.stringify({ name, email, schoolId })
          });
          document.getElementById("editAdminModal").classList.add("hidden");
          loadAdmins();
        };
      });
    });

    document.querySelectorAll(".deleteAdminBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Are you sure?")) return;
        await authFetch(`${API_BASE}/api/admins/${btn.dataset.id}`, { method: "DELETE" });
        loadAdmins();
      });
    });
  }

  addBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  window.closeAddAdminModal = () => modal.classList.add("hidden");
  window.closeEditAdminModal = () => document.getElementById("editAdminModal").classList.add("hidden");

  saveBtn.addEventListener("click", async () => {
    const name = document.getElementById("newAdminName").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const schoolId = document.getElementById("newAdminSchool").value;
    if (!name || !email || !schoolId) return alert("Fill all fields");
    const password = generatePassword();
    await authFetch(`${API_BASE}/api/admins`, {
      method: "POST",
      body: JSON.stringify({ name, email, schoolId, password })
    });
    modal.classList.add("hidden");
    loadAdmins();
  });

  await loadSchoolsOptions();
  loadAdmins();
}

  // ---------------------------
  // SETTINGS PAGE INIT
  // ---------------------------
  function initSettingsPage() {
    contentArea.innerHTML = `<p>Settings page coming soon.</p>`;
  }

});
