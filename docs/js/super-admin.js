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
      // Don't set Content-Type if using FormData
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" })
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
        contentArea.innerHTML = `
          <div class="card">
            <h2>System Overview</h2>
            <div class="overview-cards" style="display:flex; gap:15px; flex-wrap:wrap;">
              <div class="card-item" id="totalSchools" style="flex:1; padding:10px; border:1px solid #ccc;">Schools: -</div>
              <div class="card-item" id="totalAdmins" style="flex:1; padding:10px; border:1px solid #ccc;">Admins: -</div>
              <div class="card-item" id="totalTeachers" style="flex:1; padding:10px; border:1px solid #ccc;">Teachers: -</div>
              <div class="card-item" id="totalStudents" style="flex:1; padding:10px; border:1px solid #ccc;">Students: -</div>
            </div><br>

            <h3>Recent Schools Added</h3>
            <table class="table" id="recentSchoolsTable">
              <thead><tr><th>#</th><th>School Name</th><th>Admin Email</th><th>Status</th></tr></thead>
              <tbody></tbody>
            </table><br>

            <h3>Recent Admins Added</h3>
            <table class="table" id="recentAdminsTable">
              <thead><tr><th>#</th><th>Name</th><th>Email</th><th>School</th><th>Status</th></tr></thead>
              <tbody></tbody>
            </table><br>

            <h3>Charts</h3>
            <div class="chart-scroll" id="teachersChartWrap">
              <canvas id="teachersStudentsPerSchoolChart" style="margin-bottom:20px;"></canvas>
            </div>
          </div>
        `;

        const overviewRes = await authFetch(`${API_BASE}/api/overview`);
        if (!overviewRes) break;
        const metrics = await overviewRes.json();

        document.getElementById("totalSchools").textContent = `Schools: ${metrics.totalSchools}`;
        document.getElementById("totalAdmins").textContent = `Admins: ${metrics.totalAdmins}`;
        document.getElementById("totalTeachers").textContent = `Teachers: ${metrics.totalTeachers}`;
        document.getElementById("totalStudents").textContent = `Students: ${metrics.totalStudents}`;

        const schoolTbody = document.querySelector("#recentSchoolsTable tbody");
        schoolTbody.innerHTML = "";
        metrics.recentSchools.forEach((s, i) => {
          schoolTbody.innerHTML += `<tr>
            <td>${i + 1}</td>
            <td>${s.name}</td>
            <td>${s.adminEmail}</td>
            <td>${s.status || "Active"}</td>
          </tr>`;
        });

        const adminTbody = document.querySelector("#recentAdminsTable tbody");
        adminTbody.innerHTML = "";
        metrics.recentAdmins.forEach((a, i) => {
          adminTbody.innerHTML += `<tr>
            <td>${i + 1}</td>
            <td>${a.name}</td>
            <td>${a.email}</td>
            <td>${a.schoolName || "-"}</td>
            <td>${a.status || "Active"}</td>
          </tr>`;
        });

        const ctx = document.getElementById("teachersStudentsPerSchoolChart");
        // Ensure a constant display height (CSS class ensures fixed height)
        ctx.classList.add('teachers-chart');

        // Compute desired width so each school gets a reasonable bar width
        const labels = metrics.usersPerSchool.map(u => u.schoolName);
        const perLabelPx = 60; // target width per label
        const desiredWidth = Math.max((labels.length * perLabelPx), ctx.parentElement.clientWidth || 600);
        // Apply width to canvas so the parent .chart-scroll can scroll horizontally
        ctx.style.width = desiredWidth + 'px';

        if (window.schoolChart) window.schoolChart.destroy();
        window.schoolChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Students",
                data: metrics.usersPerSchool.map(u => u.studentsCount || 0),
                backgroundColor: "rgba(255, 99, 132, 0.7)"
              },
              {
                label: "Teachers",
                data: metrics.usersPerSchool.map(u => u.teachersCount || 0),
                backgroundColor: "rgba(54, 162, 235, 0.7)"
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
              legend: { display: true },
              tooltip: {
                enabled: true,
                mode: 'nearest',
                intersect: true,
                callbacks: {
                  title: (items) => (items && items.length ? items[0].label : ''),
                  label: (context) => {
                    const value = context.parsed && typeof context.parsed.y !== 'undefined' ? context.parsed.y : context.formattedValue;
                    return `${context.dataset.label}: ${value}`;
                  }
                }
              }
            },
            hover: { mode: 'nearest', intersect: true },
            scales: {
              x: {
                ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
              },
              y: { beginAtZero: true, ticks: { stepSize: 5 } }
            }
          }
        });
        // Reset scroll to left
        const wrap = document.getElementById('teachersChartWrap');
        if (wrap) wrap.scrollLeft = 0;
        break;

      case "schools":
        initSchoolsPage();
        break;

      case "admins":
        initAdminsPage();
        break;

      case "analytics":
        contentArea.innerHTML = `
          <div class="card">
            <h2>Analytics</h2>
            <div id="analyticsSummary" style="display:flex; gap:12px; flex-wrap:wrap;"></div>
            <h3>Top Schools</h3>
            <table class="table" id="topSchoolsTable"><thead><tr><th>#</th><th>School</th><th>Students</th></tr></thead><tbody></tbody></table>
            <h3>Registrations (last 12 months)</h3>
            <canvas id="registrationsChart"></canvas>
            <h3>Payments (last 12 months)</h3>
            <canvas id="paymentsChart"></canvas>
          </div>
        `;

        (async () => {
          const res = await authFetch(`${API_BASE}/api/analytics`);
          if (!res) return;
          const data = await res.json();

          // Top schools
          const tbody = document.querySelector('#topSchoolsTable tbody');
          tbody.innerHTML = '';
          data.topSchools.forEach((s, i) => {
            tbody.innerHTML += `<tr><td>${i+1}</td><td>${s.schoolName||'Unknown'}</td><td>${s.students||0}</td></tr>`;
          });

          // Registrations chart
          const regCtx = document.getElementById('registrationsChart');
          const regLabels = data.registrations.map(r => `${r._id.month}/${r._id.year}`);
          const regData = data.registrations.map(r => r.count);
          if (window.regChart) window.regChart.destroy();
          window.regChart = new Chart(regCtx, {
            type: 'line',
            data: { labels: regLabels, datasets: [{ label: 'Registrations', data: regData, borderColor: 'rgba(54,162,235,0.8)', fill:false }] }
          });

          // Payments chart
          const payCtx = document.getElementById('paymentsChart');
          const payLabels = data.payments.map(p => `${p._id.month}/${p._id.year}`);
          const payData = data.payments.map(p => p.total);
          if (window.payChart) window.payChart.destroy();
          window.payChart = new Chart(payCtx, {
            type: 'bar',
            data: { labels: payLabels, datasets: [{ label: 'KES', data: payData, backgroundColor: 'rgba(75,192,192,0.6)' }] }
          });
        })();
        break;

      case "logs":
        contentArea.innerHTML = `
          <div class="card">
            <h2>System Logs</h2>
            <div id="logsTopArea" style="margin-bottom:12px;"></div>

            <h3>Recent Payments</h3>
            <div class="table-responsive">
              <table class="table" id="recentPaymentsTable"><thead><tr><th>Date</th><th>Student</th><th>Admission</th><th class="number">Amount</th><th>Ref</th></tr></thead><tbody></tbody></table>
            </div>

            <h3>Recent Schools</h3>
            <div class="table-responsive">
              <table class="table" id="recentSchoolsTable2"><thead><tr><th>Date</th><th>School</th><th>Admin Email</th></tr></thead><tbody></tbody></table>
            </div>

            <h3>Recent Admins</h3>
            <div class="table-responsive">
              <table class="table" id="recentAdminsTable2"><thead><tr><th>Date</th><th>Name</th><th>Email</th></tr></thead><tbody></tbody></table>
            </div>
          </div>
        `;

        (async () => {
          const res = await authFetch(`${API_BASE}/api/logs`);
          if (!res) return;
          const data = await res.json();

          // Show top failed login attempts
          const top = data.topLoginAttempt;
          const topHtml = top ?
            `<div class="analytics-card" style="margin-bottom:12px;"><h4>Top Failed Logins</h4><p>${top.userName} — ${top.role} (${top.schoolName || 'No school'})<br><strong>${top.attempts}</strong> failed attempts</p></div>` :
            `<div class="analytics-card" style="margin-bottom:12px;"><h4>Top Failed Logins</h4><p>No failed login attempts recorded</p></div>`;
          const topArea = document.getElementById('logsTopArea');
          if (topArea) topArea.innerHTML = topHtml;

          const paymentsTbody = document.querySelector('#recentPaymentsTable tbody');
          paymentsTbody.innerHTML = '';
          data.recentPayments.forEach(p => {
            paymentsTbody.innerHTML += `<tr><td>${new Date(p.createdAt).toLocaleString()}</td><td>${p.studentId?.name||'-'}</td><td>${p.studentId?.admission||'-'}</td><td style="text-align:right">${p.amount}</td><td>${p.reference}</td></tr>`;
          });

          const schoolsTbody = document.querySelector('#recentSchoolsTable2 tbody');
          schoolsTbody.innerHTML = '';
          data.recentSchools.forEach(s => {
            schoolsTbody.innerHTML += `<tr><td>${new Date(s.createdAt).toLocaleString()}</td><td>${s.name}</td><td>${s.adminEmail}</td></tr>`;
          });

          const adminsTbody = document.querySelector('#recentAdminsTable2 tbody');
          adminsTbody.innerHTML = '';
          data.recentAdmins.forEach(a => {
            adminsTbody.innerHTML += `<tr><td>${new Date(a.createdAt).toLocaleString()}</td><td>${a.name}</td><td>${a.email}</td></tr>`;
          });
        })();

        break;

      case "backups":
        contentArea.innerHTML = `<div class="card"><h2>Backups</h2><p>Backup and restore database.</p></div>`;
        break;

      case "settings":
        contentArea.innerHTML = `
          <div class="card">
            <h2>System Settings</h2>
            <div id="settingsArea">
              <label><input type="checkbox" id="maintenanceMode"> Maintenance Mode</label><br>
              <label><input type="checkbox" id="registrationOpen"> Allow Registrations</label><br>
              <button id="saveSettingsBtn" class="primary-btn">Save Settings</button>
            </div>
          </div>
        `;
        initSettingsPage();
        break;
    }
  }

  // ---------------------------
  // SCHOOLS LOGIC (updated)
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
              <th>Address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="schoolsTable"></tbody>
        </table>
        <p id="noSchoolsFound" style="display:none; text-align:center; margin-top:10px; color:#888;">No results found</p>
      </div>

      <div id="addSchoolModal" class="modal hidden">
        <div class="modal-content">
          <h3>Add New School</h3>
          <label>School Name</label>
          <input type="text" id="newSchoolName">
          <label>Admin Email</label>
          <input type="email" id="newSchoolAdmin">
          <label>Address</label>
          <input type="text" id="newSchoolAddress">
          <label>Logo</label>
          <input type="file" id="newSchoolLogo" accept="image/*">
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
          <label>Address</label>
          <input type="text" id="editSchoolAddress">
          <label>Logo</label>
          <input type="file" id="editSchoolLogo" accept="image/*">
          <button id="updateSchoolBtn" class="primary-btn">Update</button>
          <button class="close-btn" onclick="closeEditModal()">Cancel</button>
        </div>
      </div>
    `;

    const addBtn = document.getElementById("addSchoolBtn");
    const modal = document.getElementById("addSchoolModal");
    const saveBtn = document.getElementById("saveSchoolBtn");
    const tableBody = document.getElementById("schoolsTable");
    const noResults = document.getElementById("noSchoolsFound");

    addBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    window.closeAddModal = () => modal.classList.add("hidden");
    window.closeEditModal = () => document.getElementById("editSchoolModal").classList.add("hidden");

    // ---------------------------
    // ADD NEW SCHOOL
    // ---------------------------
    saveBtn.addEventListener("click", async () => {
      const name = document.getElementById("newSchoolName").value.trim();
      const adminEmail = document.getElementById("newSchoolAdmin").value.trim();
      const address = document.getElementById("newSchoolAddress").value.trim();
      const logoFile = document.getElementById("newSchoolLogo").files[0];

      if (!name || !adminEmail || !address) return alert("Fill all fields");

      const formData = new FormData();
      formData.append("name", name);
      formData.append("adminEmail", adminEmail);
      formData.append("address", address);
      if (logoFile) formData.append("logo", logoFile);

      await authFetch(`${API_BASE}/api/schools`, {
        method: "POST",
        body: formData
      });

      modal.classList.add("hidden");
      loadSchools();
    });

    // ---------------------------
    // LOAD SCHOOLS
    // ---------------------------
    async function loadSchools() {
      const res = await authFetch(`${API_BASE}/api/schools`);
      if (!res) return;
      const schools = await res.json();

      tableBody.innerHTML = "";
      if (schools.length === 0) {
        noResults.style.display = "block";
      } else {
        noResults.style.display = "none";
        schools.forEach((s, i) => {
          const currentStatus = s.status || 'Active';
          const btnText = currentStatus === 'Active' ? 'Suspend' : 'Activate';
          const statusClass = currentStatus === 'Suspended' ? 'suspended-status' : '';

          tableBody.innerHTML += `
            <tr>
              <td>${i + 1}</td>
              <td>${s.name}</td>
              <td>${s.adminEmail}</td>
              <td>${s.address || ''}</td>
              <td class="${statusClass}">${currentStatus}</td>
              <td>
                <button class="toggleStatusBtn" data-id="${s._id}" data-status="${currentStatus}">${btnText}</button>
                <button class="editSchoolBtn" data-id="${s._id}">Edit</button>
                <button class="deleteSchoolBtn" data-id="${s._id}">Delete</button>
              </td>
            </tr>`;
        });
      }

      attachSchoolActions();
    }

    // ---------------------------
    // ATTACH SCHOOL ACTIONS
    // ---------------------------
    async function attachSchoolActions() {
      document.querySelectorAll(".editSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const res = await authFetch(`${API_BASE}/api/schools/${id}`);
          const school = await res.json();

          document.getElementById("editSchoolName").value = school.name;
          document.getElementById("editSchoolAdmin").value = school.adminEmail;
          document.getElementById("editSchoolAddress").value = school.address || '';
          document.getElementById("editSchoolModal").classList.remove("hidden");

          // Show paybill modal if needed
          showPaybillModalIfNeeded(school);

            document.getElementById("updateSchoolBtn").onclick = async () => {
            const name = document.getElementById("editSchoolName").value.trim();
            const adminEmail = document.getElementById("editSchoolAdmin").value.trim();
            const address = document.getElementById("editSchoolAddress").value.trim();
            const logoFile = document.getElementById("editSchoolLogo").files[0];

            if (!name || !adminEmail || !address ) return alert("Fill all fields");

            const formData = new FormData();
            formData.append("name", name);
            formData.append("adminEmail", adminEmail);
            formData.append("address", address);
            if (logoFile) formData.append("logo", logoFile);

            await authFetch(`${API_BASE}/api/schools/${id}`, {
              method: "PUT",
              body: formData
            });

            document.getElementById("editSchoolModal").classList.add("hidden");
            loadSchools();
          };
        });
      });

      // Delete
      document.querySelectorAll(".deleteSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          await authFetch(`${API_BASE}/api/schools/${btn.dataset.id}`, { method: "DELETE" });
          loadSchools();
        });
      });

      // Suspend / Activate
      document.querySelectorAll(".toggleStatusBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const currentStatus = btn.dataset.status;

          const res = await authFetch(`${API_BASE}/api/schools/${id}/toggle-status`, { method: "PATCH" });
          if (!res) return;
          const data = await res.json();

          const row = btn.closest("tr");
          const statusCell = row.querySelector("td:nth-child(4)");
          statusCell.textContent = data.school.status;
          statusCell.className = data.school.status === "Suspended" ? "suspended-status" : "";
          btn.textContent = data.school.status === "Active" ? "Suspend" : "Activate";
          btn.dataset.status = data.school.status;
          alert(data.msg);

          loadSchools();
        });
      });
    }

    // ---------------------------
    // SEARCH SCHOOLS
    // ---------------------------
    document.getElementById("searchSchools").addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      let visibleCount = 0;
      document.querySelectorAll("#schoolsTable tr").forEach(row => {
        const schoolName = row.children[1].textContent.toLowerCase();
        const adminEmail = row.children[2].textContent.toLowerCase();
        const match = schoolName.includes(query) || adminEmail.includes(query);
        row.style.display = match ? "" : "none";
        if (match) visibleCount++;
      });
      noResults.style.display = visibleCount === 0 ? "block" : "none";
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
        schools.forEach(s => sel.innerHTML += `<option value="${s._id}">${s.name}</option>`);
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
            await authFetch(`${API_BASE}/api/admins/${id}`, { method: "PUT", body: JSON.stringify({ name, email, schoolId }) });
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

    // Search Admins
    document.getElementById("searchAdmins").addEventListener("input", e => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll("#adminsTable tr").forEach(row => {
        const name = row.children[1].textContent.toLowerCase();
        const email = row.children[2].textContent.toLowerCase();
        const school = row.children[3].textContent.toLowerCase();
        row.style.display = (name.includes(query) || email.includes(query) || school.includes(query)) ? "" : "none";
      });
    });

    addBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    window.closeAddAdminModal = () => modal.classList.add("hidden");
    window.closeEditAdminModal = () => document.getElementById("editAdminModal").classList.add("hidden");

    saveBtn.addEventListener("click", async () => {
      const name = document.getElementById("newAdminName").value.trim();
      const email = document.getElementById("newAdminEmail").value.trim();
      const schoolId = document.getElementById("newAdminSchool").value;
      if (!name || !email || !schoolId) return alert("Fill all fields");
      const password = generatePassword();
      await authFetch(`${API_BASE}/api/admins`, { method: "POST", body: JSON.stringify({ name, email, schoolId, password }) });
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
    // fetch current settings
    (async () => {
      const res = await authFetch(`${API_BASE}/api/settings`);
      if (!res) return;
      const data = await res.json();
      const s = data.settings || {};
      document.getElementById('maintenanceMode').checked = !!s.maintenanceMode;
      document.getElementById('registrationOpen').checked = s.registrationOpen !== false; // default true
      const saveBtn = document.getElementById('saveSettingsBtn');
      saveBtn.addEventListener('click', async () => {
        const payload = {
          maintenanceMode: document.getElementById('maintenanceMode').checked,
          registrationOpen: document.getElementById('registrationOpen').checked
        };
        try {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          // Use relative path so authFetch appends API_BASE
          const r = await authFetch('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
          if (!r) throw new Error('No response (session?)');
          if (r.ok) {
            alert('Settings saved');
          } else {
            const err = await r.json().catch(() => ({ message: 'Unknown error' }));
            alert(`Failed to save settings: ${err.message || err.msg || JSON.stringify(err)}`);
          }
        } catch (err) {
          console.error('Save settings error:', err);
          alert('Failed to save settings: ' + (err.message || err));
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Settings';
        }
      });
    })();
  }

  // ---------------------------
  // PAYBILL MODAL MANAGEMENT
  // ---------------------------
  function openPaybillModal() {
    const modal = document.getElementById("paybillModal");
    const overlay = document.getElementById("paybillOverlay");
    if (modal) modal.style.display = "block";
    if (overlay) overlay.style.display = "block";
  }

  function closePaybillModal() {
    const modal = document.getElementById("paybillModal");
    const overlay = document.getElementById("paybillOverlay");
    if (modal) modal.style.display = "none";
    if (overlay) overlay.style.display = "none";
  }

  // Show paybill modal if school is being selected and has no paybill configured
  function showPaybillModalIfNeeded(schoolData) {
    if (schoolData && !schoolData.paybill) {
      // Check if user has already dismissed this session
      if (!sessionStorage.getItem(`paybillModalDismissed_${schoolData._id}`)) {
        const paybillInput = document.getElementById("paybillInput");
        if (paybillInput) {
          paybillInput.value = "";
          // Store current school ID for this modal
          document.getElementById("paybillForm").dataset.schoolId = schoolData._id;
          // Show setup view
          document.getElementById("paybillSetup").style.display = "block";
          document.getElementById("paybillInfo").style.display = "none";
          openPaybillModal();
        }
      }
    } else if (schoolData && schoolData.paybill) {
      // Show configured info
      const paybillInput = document.getElementById("paybillInput");
      const currentPaybill = document.getElementById("currentPaybill");

      if (paybillInput) paybillInput.value = schoolData.paybill;
      if (currentPaybill) currentPaybill.textContent = schoolData.paybill;

      // Store current school ID for this modal
      document.getElementById("paybillForm").dataset.schoolId = schoolData._id;
      // Show info view
      document.getElementById("paybillSetup").style.display = "none";
      document.getElementById("paybillInfo").style.display = "block";
      openPaybillModal();
    }
  }

  // Modal event listeners
  document.getElementById("closePaybillModal")?.addEventListener("click", closePaybillModal);
  document.getElementById("skipPaybillBtn")?.addEventListener("click", () => {
    const schoolId = document.getElementById("paybillForm").dataset.schoolId;
    if (schoolId) {
      sessionStorage.setItem(`paybillModalDismissed_${schoolId}`, "true");
    }
    closePaybillModal();
  });

  // Handle paybill form submission
  document.getElementById("paybillForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const paybill = document.getElementById("paybillInput").value.trim();
    const feedback = document.getElementById("paybillFeedback");
    const submitBtn = document.querySelector("#paybillForm button[type='submit']");
    const schoolId = document.getElementById("paybillForm").dataset.schoolId;

    // Validation
    if (!paybill) {
      feedback.className = "modal-feedback error";
      feedback.textContent = "Paybill number is required";
      feedback.style.display = "block";
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/update-paybill`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ paybill, schoolId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.msg || "Failed to update paybill");
      }

      const result = await response.json();

      // Show success feedback
      feedback.className = "modal-feedback success";
      feedback.textContent = "✓ Paybill configuration saved successfully!";
      feedback.style.display = "block";

      // Close modal after 1.5 seconds
      setTimeout(() => {
        closePaybillModal();
        if (schoolId) {
          sessionStorage.setItem(`paybillModalDismissed_${schoolId}`, "true");
        }
      }, 1500);

    } catch (err) {
      console.error("Paybill update error:", err);
      feedback.className = "modal-feedback error";
      feedback.textContent = `Error: ${err.message}`;
      feedback.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Configuration";
    }
  });

  // Make functions globally available
  window.closePaybillModal = closePaybillModal;
  window.showPaybillModalIfNeeded = showPaybillModalIfNeeded;
});
