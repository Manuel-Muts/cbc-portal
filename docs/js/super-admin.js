document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".menu li");
  const pageTitle = document.getElementById("pageTitle");
  const contentArea = document.getElementById("contentArea");

  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL; // backend base URL

  // Cache state for overview page
  let overviewCache = null;
  let overviewLastFetch = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ---------------------------
  // SESSION CHECK
  // ---------------------------
  // ---------------------------
  // JWT FETCH HELPER
  // ---------------------------
  async function authFetch(url, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return null;
    }
    
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`
    };

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const configOptions = { ...options, headers };
    
    // Handle absolute vs relative URLs robustly
    const finalUrl = url.startsWith("http") ? url : (API_BASE + url);

    try {
      const res = await fetch(finalUrl, configOptions);

      if (res.status === 401) {
        console.warn("Session expired or invalid token. Redirecting to login.");
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/login";
        return null;
      }
      return res;
    } catch (err) {
      console.error("Network error:", err);
      return null;
    }
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
      loadPage(page, true);
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
    window.location.href = "/login";
  });

  // ---------------------------
  // INITIAL PAGE LOAD
  // ---------------------------
  const firstPage = menuItems[0]?.getAttribute("data-page");
  if (firstPage) loadPage(firstPage);

  // ---------------------------
  // LOAD PAGE FUNCTION
  // ---------------------------
  async function loadPage(page, forceRefresh = false) {
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

            <h3>Charts</h3>
            <div class="chart-scroll" id="teachersChartWrap">
              <canvas id="teachersStudentsPerSchoolChart" style="margin-bottom:20px;"></canvas>
            </div>
          </div>
        `;

        let metrics;
        // Use cache if available, valid, and not forced to refresh
        if (!forceRefresh && overviewCache && (Date.now() - overviewLastFetch < CACHE_TTL)) {
          metrics = overviewCache;
        } else {
          const overviewRes = await authFetch(`/overview`);
          if (!overviewRes) break;
          metrics = await overviewRes.json();
          overviewCache = metrics;
          overviewLastFetch = Date.now();
        }

        document.getElementById("totalSchools").textContent = `Schools: ${metrics.totalSchools}`;
        document.getElementById("totalAdmins").textContent = `Admins: ${metrics.totalAdmins}`;
        document.getElementById("totalTeachers").textContent = `Teachers: ${metrics.totalTeachers}`;
        document.getElementById("totalStudents").textContent = `Students: ${metrics.totalStudents}`;


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
            <div class="table-pagination" style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 20px;">
              <div><span id="topSchoolsPageInfo">Page 1</span></div>
              <div>
                <button id="topSchoolsPrevBtn" class="btn secondary-btn" disabled>Previous</button>
                <button id="topSchoolsNextBtn" class="btn secondary-btn" disabled>Next</button>
              </div>
            </div>
            <h3>Registrations (last 12 months)</h3>
            <canvas id="registrationsChart"></canvas>
          </div>
        `;

        (async () => {
          const res = await authFetch(`/analytics`);
          if (!res) return;
          const data = await res.json();

          // Top schools
          const topSchools = Array.isArray(data.topSchools) ? data.topSchools : [];
          const topSchoolsTbody = document.querySelector('#topSchoolsTable tbody');
          const topSchoolsPageInfo = document.getElementById('topSchoolsPageInfo');
          const topSchoolsPrevBtn = document.getElementById('topSchoolsPrevBtn');
          const topSchoolsNextBtn = document.getElementById('topSchoolsNextBtn');
          const ITEMS_PER_PAGE = 10;
          let topSchoolsPage = 1;
          const totalTopSchoolPages = Math.max(1, Math.ceil(topSchools.length / ITEMS_PER_PAGE));

          function renderTopSchoolsPage() {
            const start = (topSchoolsPage - 1) * ITEMS_PER_PAGE;
            const pageItems = topSchools.slice(start, start + ITEMS_PER_PAGE);
            topSchoolsTbody.innerHTML = '';
            if (!pageItems.length) {
              topSchoolsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center">No top schools available</td></tr>`;
            } else {
              pageItems.forEach((s, i) => {
                const rowNumber = start + i + 1;
                topSchoolsTbody.innerHTML += `<tr><td>${rowNumber}</td><td>${s.schoolName||'Unknown'}</td><td>${s.students||0}</td></tr>`;
              });
            }
            topSchoolsPageInfo.textContent = `Page ${topSchoolsPage} of ${totalTopSchoolPages}`;
            topSchoolsPrevBtn.disabled = topSchoolsPage <= 1;
            topSchoolsNextBtn.disabled = topSchoolsPage >= totalTopSchoolPages;
          }

          topSchoolsPrevBtn.onclick = () => {
            if (topSchoolsPage > 1) {
              topSchoolsPage -= 1;
              renderTopSchoolsPage();
            }
          };

          topSchoolsNextBtn.onclick = () => {
            if (topSchoolsPage < totalTopSchoolPages) {
              topSchoolsPage += 1;
              renderTopSchoolsPage();
            }
          };

          renderTopSchoolsPage();

          // Registrations chart
          const regCtx = document.getElementById('registrationsChart');
          const regLabels = data.registrations.map(r => `${r._id.month}/${r._id.year}`);
          const regData = data.registrations.map(r => r.count);
          if (window.regChart) window.regChart.destroy();
          window.regChart = new Chart(regCtx, {
            type: 'line',
            data: { labels: regLabels, datasets: [{ label: 'Registrations', data: regData, borderColor: 'rgba(54,162,235,0.8)', fill:false }] }
          });

        })();
        break;

      case "logs":
        contentArea.innerHTML = `
          <div class="card">
            <h2>System Logs</h2>
            <div id="logsTopArea" style="margin-bottom:12px;"></div>
          </div>
        `;

        (async () => {
          const res = await authFetch(`/logs`);
          if (!res) return;
          const data = await res.json();

          // Show top failed login attempts
          const top = data.topLoginAttempt;
          const topHtml = top ?
            `<div class="analytics-card" style="margin-bottom:12px;"><h4>Top Failed Logins</h4><p>${top.userName} — ${top.role} (${top.schoolName || 'No school'})<br><strong>${top.attempts}</strong> failed attempts</p></div>` :
            `<div class="analytics-card" style="margin-bottom:12px;"><h4>Top Failed Logins</h4><p>No failed login attempts recorded</p></div>`;
          const topArea = document.getElementById('logsTopArea');
          if (topArea) topArea.innerHTML = topHtml;
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
        <div class="pagination-controls" style="margin-top:15px; display:flex; justify-content:center; gap:10px; align-items:center;">
          <button id="prevSchools" class="btn secondary-btn" disabled>Prev</button>
          <span id="schoolsPageInfo">Page 1</span>
          <button id="nextSchools" class="btn secondary-btn" disabled>Next</button>
        </div>
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
          <label><input type="checkbox" id="newSchoolRegistrationOpen" checked> Allow Student Registrations</label>
          <label><input type="checkbox" id="newSchoolAllowSignatureUpload" checked> Allow Signature Uploads</label>
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
          <label><input type="checkbox" id="editSchoolRegistrationOpen"> Allow Student Registrations</label>
          <label><input type="checkbox" id="editSchoolAllowSignatureUpload"> Allow Signature Uploads</label>
          <button id="updateSchoolBtn" class="primary-btn">Update</button>
          <button id="cancelEditSchoolBtn" class="close-btn">Cancel</button>
        </div>
      </div>
    `;

    const addBtn = document.getElementById("addSchoolBtn");
    const modal = document.getElementById("addSchoolModal");
    const saveBtn = document.getElementById("saveSchoolBtn");
    const tableBody = document.getElementById("schoolsTable");
    const noResults = document.getElementById("noSchoolsFound");
    
    let currentSchoolPage = 1;
    let totalSchoolPages = 1;
    let searchDebounce;

    addBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    window.closeAddModal = () => modal.classList.add("hidden");
    const editSchoolModal = document.getElementById("editSchoolModal");
    const cancelEditSchoolBtn = document.getElementById("cancelEditSchoolBtn");
    if (cancelEditSchoolBtn) {
      cancelEditSchoolBtn.addEventListener("click", () => editSchoolModal.classList.add("hidden"));
    }
    window.closeEditModal = () => editSchoolModal.classList.add("hidden");

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
      formData.append("registrationOpen", document.getElementById("newSchoolRegistrationOpen").checked);
      formData.append("allowSignatureUpload", document.getElementById("newSchoolAllowSignatureUpload").checked);
      if (logoFile) formData.append("logo", logoFile);

      await authFetch(`/schools`, {
        method: "POST",
        body: formData
      });

      modal.classList.add("hidden");
      loadSchools(1);
    });

    // ---------------------------
    // LOAD SCHOOLS
    // ---------------------------
    async function loadSchools(page = 1) {
      const search = document.getElementById("searchSchools").value.trim();
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Loading...</td></tr>';
      
      const res = await authFetch(`/schools?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      if (!res) return;
      
      const data = await res.json();
      const schools = data.schools || [];
      totalSchoolPages = data.totalPages || 1;
      currentSchoolPage = data.currentPage || page;

      document.getElementById("schoolsPageInfo").textContent = `Page ${currentSchoolPage} of ${totalSchoolPages}`;
      document.getElementById("prevSchools").disabled = currentSchoolPage <= 1;
      document.getElementById("nextSchools").disabled = currentSchoolPage >= totalSchoolPages;

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
          const res = await authFetch(`/schools/${id}`);
          const school = await res.json();

          document.getElementById("editSchoolName").value = school.name;
          document.getElementById("editSchoolAdmin").value = school.adminEmail;
          document.getElementById("editSchoolAddress").value = school.address || '';
          document.getElementById("editSchoolRegistrationOpen").checked = school.registrationOpen !== false;
          document.getElementById("editSchoolAllowSignatureUpload").checked = school.allowSignatureUpload !== false;
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
            formData.append("registrationOpen", document.getElementById("editSchoolRegistrationOpen").checked);
            formData.append("allowSignatureUpload", document.getElementById("editSchoolAllowSignatureUpload").checked);
            if (logoFile) formData.append("logo", logoFile);

            await authFetch(`/schools/${id}`, {
              method: "PUT",
              body: formData
            });

            document.getElementById("editSchoolModal").classList.add("hidden");
            loadSchools(currentSchoolPage);
          };
        });
      });

      // Delete
      document.querySelectorAll(".deleteSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          await authFetch(`/schools/${btn.dataset.id}`, { method: "DELETE" });
          loadSchools(currentSchoolPage);
        });
      });

      // Suspend / Activate
      document.querySelectorAll(".toggleStatusBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const currentStatus = btn.dataset.status;

          const res = await authFetch(`/schools/${id}/toggle-status`, { method: "PATCH" });
          if (!res) return;
          const data = await res.json();

          const row = btn.closest("tr");
          const statusCell = row.querySelector("td:nth-child(4)");
          statusCell.textContent = data.school.status;
          statusCell.className = data.school.status === "Suspended" ? "suspended-status" : "";
          btn.textContent = data.school.status === "Active" ? "Suspend" : "Activate";
          btn.dataset.status = data.school.status;
          alert(data.msg);

          loadSchools(currentSchoolPage); // Refresh to update cache
        });
      });
    }

    // ---------------------------
    // SEARCH SCHOOLS
    // ---------------------------
    document.getElementById("searchSchools").addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        loadSchools(1);
      }, 500);
    });

    document.getElementById("prevSchools").addEventListener("click", () => {
      if (currentSchoolPage > 1) {
        loadSchools(currentSchoolPage - 1);
      }
    });

    document.getElementById("nextSchools").addEventListener("click", () => {
      if (currentSchoolPage < totalSchoolPages) {
        loadSchools(currentSchoolPage + 1);
      }
    });

    // Initial load
    loadSchools(1);
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
        <div class="pagination-controls" style="margin-top:15px; display:flex; justify-content:center; gap:10px; align-items:center;">
          <button id="prevAdmins" class="btn secondary-btn" disabled>Prev</button>
          <span id="adminsPageInfo">Page 1</span>
          <button id="nextAdmins" class="btn secondary-btn" disabled>Next</button>
        </div>
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
    
    let currentAdminPage = 1;
    let totalAdminPages = 1;
    let adminSearchDebounce;

    async function loadSchoolsOptions() {
      const res = await authFetch(`/schools?limit=1000`);
      if (!res) return;
      const data = await res.json();
      const schools = data.schools || [];
      [newAdminSchool, editAdminSchool].forEach(sel => {
        sel.innerHTML = "";
        schools.forEach(s => sel.innerHTML += `<option value="${s._id}">${s.name}</option>`);
      });
    }

    async function loadAdmins(page = 1) {
      const search = document.getElementById("searchAdmins").value.trim();
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Loading...</td></tr>';

      const res = await authFetch(`/admins?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      if (!res) return;
      const data = await res.json();
      const admins = data.admins || [];
      totalAdminPages = data.totalPages || 1;
      currentAdminPage = data.currentPage || page;

      document.getElementById("adminsPageInfo").textContent = `Page ${currentAdminPage} of ${totalAdminPages}`;
      document.getElementById("prevAdmins").disabled = currentAdminPage <= 1;
      document.getElementById("nextAdmins").disabled = currentAdminPage >= totalAdminPages;

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
          const res = await authFetch(`/admins/${id}`);
          const admin = await res.json();

          document.getElementById("editAdminName").value = admin.name;
          document.getElementById("editAdminEmail").value = admin.email;
          document.getElementById("editAdminSchool").value = admin.schoolId;
          document.getElementById("editAdminModal").classList.remove("hidden");

          document.getElementById("updateAdminBtn").onclick = async () => {
            const name = document.getElementById("editAdminName").value.trim();
            const email = document.getElementById("editAdminEmail").value.trim();
            const schoolId = document.getElementById("editAdminSchool").value;
            await authFetch(`/admins/${id}`, { method: "PUT", body: JSON.stringify({ name, email, schoolId }) });
            document.getElementById("editAdminModal").classList.add("hidden");
            loadAdmins(currentAdminPage);
          };
        });
      });

      document.querySelectorAll(".deleteAdminBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          await authFetch(`/admins/${btn.dataset.id}`, { method: "DELETE" });
          loadAdmins(currentAdminPage);
        });
      });
    }

    // Search Admins
    document.getElementById("searchAdmins").addEventListener("input", e => {
      clearTimeout(adminSearchDebounce);
      adminSearchDebounce = setTimeout(() => {
        loadAdmins(1);
      }, 500);
    });

    document.getElementById("prevAdmins").addEventListener("click", () => {
      if (currentAdminPage > 1) {
        loadAdmins(currentAdminPage - 1);
      }
    });

    document.getElementById("nextAdmins").addEventListener("click", () => {
      if (currentAdminPage < totalAdminPages) {
        loadAdmins(currentAdminPage + 1);
      }
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
      await authFetch(`/admins`, { method: "POST", body: JSON.stringify({ name, email, schoolId, password }) });
      modal.classList.add("hidden");
      loadAdmins(1);
    });

    await loadSchoolsOptions();
    loadAdmins(1);
  }

  // ---------------------------
  // SETTINGS PAGE INIT
  // ---------------------------
  function initSettingsPage() {
    // fetch current settings
    (async () => {
      const res = await authFetch(`/settings`);
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
          const r = await authFetch(`/settings`, { method: 'PUT', body: JSON.stringify(payload) });
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
      const response = await fetch(`${API_BASE}/update-paybill`, {
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
