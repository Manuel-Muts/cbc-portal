document.addEventListener("DOMContentLoaded", () => {
  const menuItems = document.querySelectorAll(".menu li");
  const pageTitle = document.getElementById("pageTitle");
  const contentArea = document.getElementById("contentArea");

  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL; // backend base URL

  // Cache state for overview page
  const OVERVIEW_CACHE_KEY = "overview_cache";
  let overviewLastFetch = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ---------------------------
// GENERIC CACHE HELPER
// ---------------------------
function getCache(key) {
  const cached = JSON.parse(localStorage.getItem(key) || "null");
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    localStorage.removeItem(key);
    return null;
  }

  return cached.data;
}

function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({
    timestamp: Date.now(),
    data
  }));
}

  //OVERVIEW CACHE LOGI
  // ---------------------------
  // JWT FETCH HELPER
  // ---------------------------
  async function authFetch(url, options = {}) {
    const token = window.authService?.getToken();
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

const cacheKey = "overview_cache";
const cached = getCache(cacheKey);

if (!forceRefresh && cached) {
  metrics = cached;
} else {
 const overviewRes = await authFetch(`/overview`);
if (!overviewRes) break;

metrics = await overviewRes.json();
setCache(cacheKey, metrics);
}

        // Defensive check: has the user navigated away while we were fetching?
        if (!document.getElementById("totalSchools")) break;

        document.getElementById("totalSchools").textContent = `Schools: ${metrics.totalSchools}`;
        document.getElementById("totalAdmins").textContent = `Admins: ${metrics.totalAdmins}`;
        document.getElementById("totalTeachers").textContent = `Teachers: ${metrics.totalTeachers}`;
        document.getElementById("totalStudents").textContent = `Students: ${metrics.totalStudents}`;


        const ctx = document.getElementById("teachersStudentsPerSchoolChart");
        if (!ctx) break;
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
        initSchoolsPage(forceRefresh);
        break;

      case "admins":
        initAdminsPage(forceRefresh);
        break;

      case "announcements":
        initAnnouncementsPage(forceRefresh);
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
          let data;
          const cacheKey = "analytics_cache";
          const cached = getCache(cacheKey);

          if (!forceRefresh && cached) {
            data = cached;
          } else {
            const res = await authFetch(`/analytics`);
            if (!res) return;
            data = await res.json();
            setCache(cacheKey, data);
          }

          // Top schools
          const topSchools = Array.isArray(data.topSchools) ? data.topSchools : [];
          const topSchoolsTbody = document.querySelector('#topSchoolsTable tbody');
          const topSchoolsPageInfo = document.getElementById('topSchoolsPageInfo');
          const topSchoolsPrevBtn = document.getElementById('topSchoolsPrevBtn');
          const topSchoolsNextBtn = document.getElementById('topSchoolsNextBtn');
          const ITEMS_PER_PAGE = 10;
          let topSchoolsPage = 1;
          const totalTopSchoolPages = Math.max(1, Math.ceil(topSchools.length / ITEMS_PER_PAGE));

          // Defensive check: ensure the analytics elements still exist
          if (!topSchoolsPrevBtn || !topSchoolsNextBtn || !topSchoolsTbody) return;

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
          if (!regCtx) return;
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
              
              <hr style="margin: 25px 0; border: 0; border-top: 1px solid #eee;">
              <h3>System Maintenance</h3>
              <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px;">
                <button id="manualCleanOrphansBtn" class="btn secondary-btn" style="background: #64748b; color: white; padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer;">🧹 Clean Orphaned Enrollments</button>
                <button id="manualCleanLoginsBtn" class="btn secondary-btn" style="background: #64748b; color: white; padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer;">🛡️ Clean Old Login Attempts</button>
              </div>
            </div>
          </div>
        `;
        initSettingsPage();
        break;
    }
  }

  // ---------------------------
  // ANNOUNCEMENTS LOGIC
  // ---------------------------
  async function initAnnouncementsPage(forceRefresh = false) {
    contentArea.innerHTML = `
      <div class="card">

        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 style="margin-bottom:0;">Announcements Broadcast</h2>
            <div id="smsProviderBalance" style="font-size:0.8rem; color:#64748b; margin-top:5px; font-weight:600;">
              <i class="fas fa-wallet"></i> Gateway Balance: <span id="atBalanceVal">Loading...</span>
            </div>
          </div>
          <button id="addAnnBtn" class="primary-btn">+ New Announcement</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Target School</th>
              <th>Target Role</th>
              <th>Target Page</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="announcementsTable">
            <tr><td colspan="7" style="text-align:center">Loading announcements...</td></tr>
          </tbody>
        </table>
      </div>

      <div id="annModal" class="modal hidden">
        <div class="modal-content">
          <h3>Post New Announcement</h3>
          <label>Title</label>
          <input type="text" id="annTitle" placeholder="e.g., System Update">
          <label>Message</label>
          <textarea id="annMessage" rows="4" style="width:100%; border-radius:8px; padding:10px; border:1px solid #ccc;"></textarea>
          
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:15px; margin-top:10px;">
            <div>
              <label>Target School</label>
              <select id="annSchool">
                <option value="">Global (All Schools)</option>
              </select>
            </div>
            <div>
              <label>Target Role</label>
              <select id="annRole">
                <option value="all">Everyone</option>
                <option value="admin">Admins Only</option>
                <option value="teacher">Teachers Only</option>
                <option value="dean">Deans Only</option>
                <option value="accounts">Accounts Only</option>
                <option value="student">Learners Only</option>
              </select>
            </div>
            <div>
              <label>Target Page</label>
              <select id="annPage">
                <option value="all">All Pages</option>
                <option value="teacher-dashboard.html">Teacher Dashboard</option>
                <option value="dean-dashboard.html">Dean Dashboard</option>
                <option value="accounts-dashboard.html">Accounts Dashboard</option>
                <option value="analysis.html">Class Teacher Dashboard</option>
                <option value="student-dashboard.html">Student Dashboard</option>
                <option value="admin.html">Admin Panel</option>
              </select>
            </div>
          </div>
          <div style="margin-top:15px;">
            <label>Expires At (Optional)</label>
            <input type="datetime-local" id="annExpiresAt" class="form-control">
          </div>

          <div style="margin-top:20px;">
            <button id="saveAnnBtn" class="primary-btn">Broadcast Now</button>
            <button class="close-btn" id="cancelAnnBtn">Cancel</button>
          </div>
        </div>
      </div>
    `;

    const tableBody = document.getElementById("announcementsTable");
    const modal = document.getElementById("annModal");
    const schoolSelect = document.getElementById("annSchool");
    let editingAnnId = null; // 🆕 Track editing state

    // 🆕 Fetch Africa's Talking Balance
    async function loadSmsProviderBalance() {
      const balEl = document.getElementById("atBalanceVal");
      if (!balEl) return;
      try {
        const res = await authFetch("/sms-provider-balance");
        if (res && res.ok) {
          const data = await res.json();
          const color = data.isSandbox ? "#f59e0b" : "#10b981";
          const label = data.isSandbox ? "SANDBOX" : "LIVE";
          
          // Format as currency (e.g. KES -43.00)
          const formattedBalance = data.balance.toLocaleString('en-KE', { style: 'currency', currency: 'KES' });

          balEl.innerHTML = `<strong>${formattedBalance}</strong> 
            <span style="background:${color}; color:white; padding:1px 6px; border-radius:4px; font-size:0.6rem; margin-left:6px; font-weight:700;">${label}</span>`;
        } else {
          const errorData = res ? await res.json().catch(() => ({})) : {};
          balEl.textContent = errorData.msg || "Unavailable";
        }
      } catch (e) {
        balEl.textContent = "Error";
      }
    }

    document.getElementById("addAnnBtn").onclick = async () => {
      editingAnnId = null; // Reset for new announcement
      document.querySelector("#annModal h3").textContent = "Post New Announcement";
      document.getElementById("saveAnnBtn").textContent = "Broadcast Now";
      
      // Clear fields
      document.getElementById("annTitle").value = "";
      document.getElementById("annMessage").value = "";
      document.getElementById("annExpiresAt").value = "";
      document.getElementById("annRole").value = "all";
      document.getElementById("annPage").value = "all";

      modal.classList.remove("hidden");
      await populateAnnSchools();
    };
    document.getElementById("cancelAnnBtn").onclick = () => modal.classList.add("hidden");

    async function populateAnnSchools() {
      if (!schoolSelect) return;
      schoolSelect.innerHTML = '<option value="">Global (All Schools)</option>';
      
      // Fetch schools list for targeting
      const res = await authFetch(`/schools?limit=1000`);
      if (res && res.ok) {
        const data = await res.json();
        const schools = data.schools || [];
        schools.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s._id;
          opt.textContent = s.name;
          schoolSelect.appendChild(opt);
        });
      }
    }

    document.getElementById("saveAnnBtn").onclick = async () => {
      const payload = {
        title: document.getElementById("annTitle").value.trim(),
        message: document.getElementById("annMessage").value.trim(),
        targetRole: document.getElementById("annRole").value,
        targetPage: document.getElementById("annPage").value,
        schoolId: document.getElementById("annSchool").value || null,
        expiresAt: document.getElementById("annExpiresAt").value || null // 🆕 Add expiresAt
      };

      if (!payload.title || !payload.message) return alert("Please fill all fields");


      const saveBtn = document.getElementById("saveAnnBtn");
      window.spinner?.show(saveBtn, editingAnnId ? "Updating..." : "Broadcasting...");

     // 🆕 Determine if we are creating or updating
      const url = editingAnnId ? `/announcements/${editingAnnId}` : "/announcements";
      const method = editingAnnId ? "PUT" : "POST";
       try {
        const res = await authFetch(url, { method, body: JSON.stringify(payload) });
        if (res && res.ok) {
          const isEdit = !!editingAnnId;
          window.showToast(isEdit ? "Announcement updated successfully!" : "Announcement posted successfully!", "success");
          modal.classList.add("hidden");
          loadAnnouncements();
          
          // Clear form fields after successful submission
          if (!isEdit) {
            document.getElementById("annTitle").value = "";
            document.getElementById("annMessage").value = "";
            document.getElementById("annExpiresAt").value = "";
          }
          editingAnnId = null;
        }
      } finally {
        window.spinner?.hide(saveBtn);
      }
    };

    async function loadAnnouncements() {
      // Note: Assumes a route GET /api/announcements/all is mapped to getAllAnnouncements
      const res = await authFetch("/announcements/all"); 
      if (!res) return;
      const announcements = await res.json();

      tableBody.innerHTML = announcements.length ? "" : '<tr><td colspan="8" style="text-align:center">No announcements found</td></tr>'; // 🆕 Update colspan
      
      announcements.forEach(ann => {
        const row = document.createElement("tr");
        const expiresDate = ann.expiresAt ? new Date(ann.expiresAt) : null;
        const isExpired = expiresDate && expiresDate < new Date();
        const statusText = isExpired ? '🔴 Expired' : (ann.isActive ? '✅ Active' : '⚪ Inactive');
        const statusColor = isExpired ? '#ef4444' : (ann.isActive ? '#10b981' : '#94a3b8');

        row.innerHTML = `
          <td><strong>${ann.title}</strong></td>
          <td><span style="font-weight:600; color:#475569;">${ann.schoolId?.name || '🌎 Global (All Schools)'}</span></td>
          <td><span class="status-badge" style="background:#eef2ff; color:#3730a3; padding:2px 8px; border-radius:4px; font-size:0.7rem;">${ann.targetRole}</span></td>
          <td><code>${ann.targetPage}</code></td>
          <td>${expiresDate ? expiresDate.toLocaleDateString() : 'Never'}</td> <!-- 🆕 New column for expiration date -->
          <td><span style="color:${statusColor}; font-weight:600;">${statusText}</span></td> <!-- 🆕 Updated status display -->
          <td>${new Date(ann.createdAt).toLocaleDateString()}</td>
          <td style="white-space:nowrap;">
            <button class="editAnnBtn btn secondary-btn" data-id="${ann._id}" style="padding:4px 8px; font-size:0.7rem;">Edit</button>
            <button class="deleteAnnBtn danger-btn" data-id="${ann._id}" style="padding:4px 8px; font-size:0.7rem;">Remove</button>
          </td>
        `;
        tableBody.appendChild(row);
      });

      // 🆕 Attach Edit Handlers
      document.querySelectorAll(".editAnnBtn").forEach(btn => {
        btn.onclick = async () => {
          const annId = btn.dataset.id;
          const ann = announcements.find(a => a._id === annId);
          if (!ann) return;

          editingAnnId = annId;
          document.querySelector("#annModal h3").textContent = "Edit Announcement";
          document.getElementById("saveAnnBtn").textContent = "Update Announcement";

          // Fill form
          document.getElementById("annTitle").value = ann.title || "";
          document.getElementById("annMessage").value = ann.message || "";
          document.getElementById("annRole").value = ann.targetRole || "all";
          document.getElementById("annPage").value = ann.targetPage || "all";
          
          // Handle Date conversion for datetime-local input
          if (ann.expiresAt) {
            const d = new Date(ann.expiresAt);
            const localISO = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById("annExpiresAt").value = localISO;
          } else {
            document.getElementById("annExpiresAt").value = "";
          }

          await populateAnnSchools();
          document.getElementById("annSchool").value = ann.schoolId?._id || "";
          
          modal.classList.remove("hidden");
        };
      });

      document.querySelectorAll(".deleteAnnBtn").forEach(btn => {
        btn.onclick = async () => {
          if (!confirm("Delete this announcement? It will disappear for all targeted users.")) return;
          await authFetch(`/announcements/${btn.dataset.id}`, { method: "DELETE" });
          loadAnnouncements();
        };
      });
    }

    loadAnnouncements();
    loadSmsProviderBalance();
  }

  // ---------------------------
  // SCHOOLS LOGIC (updated)
  // ---------------------------
  async function initSchoolsPage(forceRefresh = false) {
    contentArea.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2>Schools Management</h2>
          <button id="addSchoolBtn" class="primary-btn">+ Add School</button>
        </div>
        <input type="text" id="searchSchools" placeholder="Search schools..." class="search-input compact">
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>School Name</th>
              <th>Admin Email</th>
              <th>Address</th>
              <th>Type</th>
              <th>Status</th>
              <th>Credits</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="schoolsTable">
            <tr><td colspan="8" style="text-align:center">Loading...</td></tr>
          </tbody>
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
          <label>School Type</label>
          <select id="newSchoolType">
            <option value="full">Full School (Grades 1-12)</option>
            <option value="primary_junior">Primary + Junior (Grades 1-9)</option>
            <option value="senior">Senior School (Grades 10-12)</option>
          </select>
          <label><input type="checkbox" id="newSchoolRegistrationOpen" checked> Allow Student Registrations</label>
          <label><input type="checkbox" id="newSchoolAllowSignatureUpload" checked> Allow Signature Uploads</label>
          <button id="saveSchoolBtn" class="primary-btn">Save</button>
          <button id="cancelAddSchoolBtn" class="close-btn">Cancel</button>
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
          <label>School Type</label>
          <select id="editSchoolType">
            <option value="full">Full School (Grades 1-12)</option>
            <option value="primary_junior">Primary + Junior (Grades 1-9)</option>
            <option value="senior">Senior School (Grades 10-12)</option>
          </select>
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
    const cancelAddSchoolBtn = document.getElementById("cancelAddSchoolBtn");
    if (cancelAddSchoolBtn) {
      cancelAddSchoolBtn.addEventListener("click", () => modal.classList.add("hidden"));
    }
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

      window.spinner?.show(saveBtn, "Creating...");
      try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("adminEmail", adminEmail);
      formData.append("address", address);
      formData.append("schoolType", document.getElementById("newSchoolType").value);
      formData.append("registrationOpen", document.getElementById("newSchoolRegistrationOpen").checked);
      formData.append("allowSignatureUpload", document.getElementById("newSchoolAllowSignatureUpload").checked);
      if (logoFile) formData.append("logo", logoFile);

      const res = await authFetch(`/schools`, {
        method: "POST",
        body: formData
      });

      if (res && res.ok) {
        alert("School created successfully");
        modal.classList.add("hidden");
        localStorage.removeItem("admin_schools_options_cache"); // Clear options cache for dropdowns
        loadSchools(1);
      } else {
        const err = await res.json().catch(() => ({ msg: "Failed" }));
        alert(err.msg || "Failed to create school");
      }
      } finally {
        window.spinner?.hide(saveBtn);
      }
    });

    // ---------------------------
    // LOAD SCHOOLS
    // ---------------------------
    async function loadSchools(page = 1, force = false) {
      const searchEl = document.getElementById("searchSchools");
      if (!searchEl || !tableBody) return;

      const search = searchEl.value.trim();

      const cacheKey = `schools_cache_p${page}_s${search}`;
      const cached = getCache(cacheKey);
      let data;

      if (!force && cached) {
        data = cached;
      } else {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center">Loading...</td></tr>';
        const res = await authFetch(`/schools?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
        if (!res) return;
        data = await res.json();
        setCache(cacheKey, data);
      }

      const schools = data.schools || [];
      totalSchoolPages = data.totalPages || 1;
      currentSchoolPage = data.currentPage || page;

      const schoolsPageInfo = document.getElementById("schoolsPageInfo");
const prevSchoolsBtn = document.getElementById("prevSchools");
const nextSchoolsBtn = document.getElementById("nextSchools");

if (schoolsPageInfo) {
  schoolsPageInfo.textContent = `Page ${currentSchoolPage} of ${totalSchoolPages}`;
}

if (prevSchoolsBtn) {
  prevSchoolsBtn.disabled = currentSchoolPage <= 1;
}

if (nextSchoolsBtn) {
  nextSchoolsBtn.disabled = currentSchoolPage >= totalSchoolPages;
}

      tableBody.innerHTML = "";
      if (schools.length === 0) {
        noResults.style.display = "block";
      } else {
        noResults.style.display = "none";
        schools.forEach((s, i) => {
          const currentStatus = s.status || 'Active';
          const btnText = currentStatus === 'Active' ? 'Suspend' : 'Activate';
          const statusClass = currentStatus === 'Suspended' ? 'suspended-status' : 'active-status';

          tableBody.innerHTML += `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${s.name}</strong></td>
              <td>${s.adminEmail}</td>
              <td>${s.address || ''}</td>
              <td>${s.schoolType === 'primary_junior' ? 'Primary + Junior' : s.schoolType === 'senior' ? 'Senior' : 'Full'}</td>
              <td><span class="${statusClass}">${currentStatus}</span></td>
              <td style="font-weight:700; color:#1e293b;">${s.smsCredits || 0}</td>
              <td class="action-cell">
                <button class="toggleStatusBtn" style="background:#64748b; color:white;" data-id="${s._id}" data-status="${currentStatus}">${btnText}</button>
                <button class="topUpSmsBtn" data-id="${s._id}" style="background: #10b981; color: white;">Top Up</button>
                <button class="editSchoolBtn" style="background:#3b82f6; color:white;" data-id="${s._id}">Edit</button>
                <button class="deleteSchoolBtn" style="background:#ef4444; color:white;" data-id="${s._id}">Delete</button>
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
          document.getElementById("editSchoolType").value = school.schoolType || 'full';
          document.getElementById("editSchoolRegistrationOpen").checked = school.registrationOpen !== false;
          document.getElementById("editSchoolAllowSignatureUpload").checked = school.allowSignatureUpload !== false;
          document.getElementById("editSchoolModal").classList.remove("hidden");

          // Show paybill modal if needed
          showPaybillModalIfNeeded(school);

          const updateBtn = document.getElementById("updateSchoolBtn");
          updateBtn.onclick = async () => {
            const name = document.getElementById("editSchoolName").value.trim();
            const adminEmail = document.getElementById("editSchoolAdmin").value.trim();
            const address = document.getElementById("editSchoolAddress").value.trim();
            const logoFile = document.getElementById("editSchoolLogo").files[0];

            if (!name || !adminEmail || !address) return alert("Fill all fields");

            window.spinner?.show(updateBtn, "Updating...");

            const formData = new FormData();
            formData.append("name", name);
            formData.append("adminEmail", adminEmail);
            formData.append("address", address);
            formData.append("schoolType", document.getElementById("editSchoolType").value);
            formData.append("registrationOpen", document.getElementById("editSchoolRegistrationOpen").checked);
            formData.append("allowSignatureUpload", document.getElementById("editSchoolAllowSignatureUpload").checked);
            if (logoFile) formData.append("logo", logoFile);

            try {
              await authFetch(`/schools/${id}`, {
                method: "PUT",
                body: formData
              });

              document.getElementById("editSchoolModal").classList.add("hidden");
              loadSchools(currentSchoolPage);
            } finally {
              window.spinner?.hide(updateBtn);
            }
          };
        });
      });

      // Delete
      document.querySelectorAll(".deleteSchoolBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          localStorage.removeItem("admin_schools_options_cache");
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
          const statusCell = row.querySelector("td:nth-child(6)");
          const isSuspended = data.school.status === "Suspended";
          statusCell.innerHTML = `<span class="${isSuspended ? "suspended-status" : "active-status"}">${data.school.status}</span>`;
          btn.textContent = data.school.status === "Active" ? "Suspend" : "Activate";
          btn.dataset.status = data.school.status;
          alert(data.msg);

          loadSchools(currentSchoolPage); // Refresh to update cache
        });
      });

      // Top Up SMS Credits
      document.querySelectorAll(".topUpSmsBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const schoolName = btn.closest("tr").querySelector("td:nth-child(2)").textContent;
          const amount = prompt(`Enter amount of SMS credits to add to ${schoolName} (use negative numbers to deduct):`, "1000");
          
          if (amount === null) return; // User cancelled
          const numAmount = Number(amount);
          if (isNaN(numAmount) || numAmount === 0) return alert("Please enter a valid non-zero number.");

          const res = await authFetch(`/schools/${id}/top-up-sms`, {
            method: "POST",
            body: JSON.stringify({ amount: numAmount })
          });

          if (res && res.ok) {
            const data = await res.json();
            alert(data.msg);
            loadSchools(currentSchoolPage, true); // Force refresh cache and UI
          } else {
            const err = await res.json().catch(() => ({ msg: "Action failed" }));
            alert(err.msg || "Failed to update credits");
          }
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
    loadSchools(1, forceRefresh);
  }
  // ---------------------------
  // ADMINS LOGIC
  // ---------------------------
  async function initAdminsPage(forceRefresh = false) {
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
          <tbody id="adminsTable">
            <tr><td colspan="6" style="text-align:center"><span class="spinner"></span> Loading admins...</td></tr>
          </tbody>
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
          <button id="cancelAddAdminBtn" class="close-btn">Cancel</button>
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
          <button id="cancelEditAdminBtn" class="close-btn">Cancel</button>
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
    
    async function loadSchoolsOptions(force = false) {
      const CACHE_KEY = "admin_schools_options_cache";
      
      if (!force) {
        const cached = getCache(CACHE_KEY);
        if (cached) {
          populateDropdowns(cached);
          return;
        }
      }

      // Use a high limit to ensure we get all active schools for dropdown selection
      // The backend now excludes heavy logo fields, making this fetch very lightweight.
      const res = await authFetch(`/schools?limit=1000`);
      if (!res) return;
      
      const data = await res.json();
      const schools = data.schools || [];
      
      setCache(CACHE_KEY, schools);
      populateDropdowns(schools);
    }

    function populateDropdowns(schools) {
      [newAdminSchool, editAdminSchool].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Select School --</option>';
        schools.forEach(s => sel.innerHTML += `<option value="${s._id}">${s.name}</option>`);
      });
    }

    async function loadAdmins(page = 1, force = false) {
      const searchInput = document.getElementById("searchAdmins");
      if (!searchInput || !tableBody) return;

      const search = searchInput.value.trim();

      const cacheKey = `admins_cache_p${page}_s${search}`;
      const cached = getCache(cacheKey);
      let data;

      if (!force && cached) {
        data = cached;
      } else {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center"><span class="spinner"></span> Loading admins...</td></tr>';
        const res = await authFetch(`/admins?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
        if (!res) return;
        data = await res.json();
        setCache(cacheKey, data);
      }

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
          const editModal = document.getElementById("editAdminModal");
          editModal.classList.remove("hidden");
          editModal.classList.add("visible");

          const updateBtn = document.getElementById("updateAdminBtn");
          updateBtn.onclick = async () => {
            window.spinner.show(updateBtn, "Updating...");
            try {
              const name = document.getElementById("editAdminName").value.trim();
              const email = document.getElementById("editAdminEmail").value.trim();
              const schoolId = document.getElementById("editAdminSchool").value;
              await authFetch(`/admins/${id}`, { method: "PUT", body: JSON.stringify({ name, email, schoolId }) });
              editModal.classList.add("hidden");
              editModal.classList.remove("visible");
              loadAdmins(currentAdminPage, true); // Force refresh after update
            } finally {
              window.spinner.hide(updateBtn);
            }
          };
        });
      });

      document.querySelectorAll(".deleteAdminBtn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure?")) return;
          await authFetch(`/admins/${btn.dataset.id}`, { method: "DELETE" });
          loadAdmins(currentAdminPage, true); // Force refresh after delete
        });
      });
    }

    // Search Admins
    document.getElementById("searchAdmins").addEventListener("input", e => {
      clearTimeout(adminSearchDebounce);
      adminSearchDebounce = setTimeout(() => {
        loadAdmins(1, true); // Force refresh on search
      }, 500);
    });

    document.getElementById("prevAdmins").addEventListener("click", () => {
      if (currentAdminPage > 1) {
        loadAdmins(currentAdminPage - 1, false);
      }
    });

    document.getElementById("nextAdmins").addEventListener("click", () => {
      if (currentAdminPage < totalAdminPages) {
        loadAdmins(currentAdminPage + 1, false);
      }
    });

    addBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      modal.classList.add("visible");
    });

    // 🆕 Use event listeners instead of onclick for better reliability
    document.getElementById("cancelAddAdminBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("visible");
    });

    document.getElementById("cancelEditAdminBtn")?.addEventListener("click", () => {
      const editModal = document.getElementById("editAdminModal");
      if (editModal) {
        editModal.classList.add("hidden");
        editModal.classList.remove("visible");
      }
    });

    saveBtn.addEventListener("click", async () => {
      const name = document.getElementById("newAdminName").value.trim();
      const email = document.getElementById("newAdminEmail").value.trim();
      const schoolId = document.getElementById("newAdminSchool").value;
      if (!name || !email || !schoolId) return alert("Fill all fields");
      const password = generatePassword();
      
      window.spinner.show(saveBtn, "Registering...");
      try {
      const res = await authFetch(`/admins`, { method: "POST", body: JSON.stringify({ name, email, schoolId, password }) });
      if (res && res.ok) {
        alert("Admin registered successfully! Login details sent to email.");
        modal.classList.add("hidden");
        modal.classList.remove("visible");
        loadAdmins(1, true); // Force refresh after adding new admin
      } else {
        const errData = res ? await res.json().catch(() => ({ msg: "Registration failed" })) : { msg: "Connection error" };
        alert(`Failed to register admin: ${errData.msg || errData.message}`);
      }
      } finally {
        window.spinner.hide(saveBtn);
      }
    });

    loadAdmins(1, forceRefresh);
    loadSchoolsOptions(forceRefresh); // Load dropdown options in background to prevent blocking table UI
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

      // Maintenance Button Logic
      const cleanOrphansBtn = document.getElementById('manualCleanOrphansBtn');
      const cleanLoginsBtn = document.getElementById('manualCleanLoginsBtn');

      if (cleanOrphansBtn) {
        cleanOrphansBtn.onclick = async () => {
          if (!confirm("Permanently remove enrollment records for students who no longer exist in the system?")) return;
          cleanOrphansBtn.disabled = true;
          cleanOrphansBtn.textContent = 'Processing...';
          try {
            const res = await authFetch('/enrollments/cleanup', { method: 'DELETE' });
            if (res && res.ok) {
              const data = await res.json();
              alert(`Cleanup complete: ${data.deletedCount} orphaned records removed.`);
            } else {
              alert("Cleanup failed or returned no orphans.");
            }
          } finally {
            cleanOrphansBtn.disabled = false;
            cleanOrphansBtn.innerHTML = '🧹 Clean Orphaned Enrollments';
          }
        };
      }

      if (cleanLoginsBtn) {
        cleanLoginsBtn.onclick = async () => {
          if (!confirm("Delete all login attempt logs older than 7 days?")) return;
          cleanLoginsBtn.disabled = true;
          cleanLoginsBtn.textContent = 'Clearing...';
          try {
            const res = await authFetch('/clean-login-attempts', { method: 'DELETE' });
            if (res && res.ok) {
              const data = await res.json();
              alert(`Logs cleared: ${data.deletedCount} old attempts removed.`);
            }
          } finally {
            cleanLoginsBtn.disabled = false;
            cleanLoginsBtn.innerHTML = '🛡️ Clean Old Login Attempts';
          }
        };
      }

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
      window.spinner.show(submitBtn, "Saving...");

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
      window.spinner.hide(submitBtn);
    }
  });

  // Make functions globally available
  window.closePaybillModal = closePaybillModal;
  window.showPaybillModalIfNeeded = showPaybillModalIfNeeded;
});
