
// electives-admin.js
(function () {
  const API_BASE = (window.config && window.config.api && window.config.api.baseURL) || "";
  const ROOT_ID = "electiveModuleRoot";

  const state = {
    initialized: false,
    electiveSets: [],
    electiveSubjects: [],
    learners: [],
    assignments: [],
    assignmentsAll: [],
    assignmentPage: 1,
    assignmentLimit: 20,
    selectedAssignmentPathway: "",
    assignmentSearch: "",
    selectedGrade: "",
    selectedPathway: "",
    searchTerm: "",
    selectedSetId: "",
    selectedLearnerIds: new Set(),
  };

  function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function apiFetch(url, options = {}) {
    const token = window.authService?.getToken?.();

    const headers = {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 || res.status === 403) {
      window.authService?.redirectToLogin?.();
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const message =
        (data && data.message) ||
        (typeof data === "string" ? data : "Request failed");
      throw new Error(message);
    }

    return data;
  }

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function isSeniorGradeValue(grade) {
    const normalized = String(grade || "").trim();
    const match = normalized.match(/(\d+)/);
    const gradeNum = match ? Number(match[1]) : null;
    return [10, 11, 12].includes(gradeNum);
  }

  function renderLayout() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = `
      <div class="card" style="padding:12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;">Electives</h3>
            <p style="margin:4px 0 0;color:#64748b;font-size:0.85rem;">Assign elective sets to senior learners</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="refreshElectivesBtn" class="btn secondary-btn" style="padding:8px 12px; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Refresh</button>
            <button id="openElectiveSetsModalBtn" class="btn primary-btn" style="padding:8px 12px; border-radius:8px; background:#2563eb; color:#ffffff; border:1px solid #2563eb;">Manage Elective Sets</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:12px;margin-bottom:12px;">
        <h4 style="margin:0 0 10px;">Assign</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end;">
          <select id="electiveAssignGrade" class="form-control" style="min-width:160px;">
            <option value="">-- Select Grade --</option>
            <option>Grade 10</option>
            <option>Grade 11</option>
            <option>Grade 12</option>
          </select>
          <select id="electiveAssignPathway" class="form-control" style="min-width:180px;" disabled>
            <option value="">-- Select grade first --</option>
          </select>
          <input id="electiveSearchLearner" class="form-control" placeholder="Search learner" disabled style="min-width:180px;">
          <select id="electiveSetSelect" class="form-control" style="min-width:180px;"></select>
          <button id="bulkAssignBtn" class="btn secondary-btn" style="padding:8px 14px; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Bulk</button>
        </div>
        <div id="electiveLearnerList" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="padding:12px;">
        <h4 style="margin:0 0 10px;">Assignments</h4>
        <div style="overflow:auto;">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <select id="assignmentPathwaySelect" class="form-control" style="min-width:180px;">
              <option value="">-- All Pathways --</option>
            </select>
            <input id="assignmentSearchInput" class="form-control" placeholder="Search name or admission" style="min-width:220px;">
            <button id="assignmentRefreshBtn" class="btn secondary-btn" style="padding:8px 12px; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Refresh</button>
          </div>
          <table class="table table-compact table-striped" style="width:100%;border-collapse:collapse;font-size:0.78rem;">
            <thead>
              <tr style="background:#f8fafc;">
                  <th style="padding:6px 8px; font-size:0.82rem;">Learner</th>
                  <th style="padding:6px 8px; font-size:0.82rem;">Grade</th>
                  <th style="padding:6px 8px; font-size:0.82rem;">Actions</th>
                </tr>
            </thead>
            <tbody id="electiveAssignmentsBody">
              <tr><td colspan="3" style="padding:8px 6px;color:#94a3b8;">Loading...</td></tr>
            </tbody>
          </table>
              <div id="electiveAssignmentsPagination" style="display:flex; justify-content:space-between; align-items:center; padding:8px 6px;"> </div>
        </div>
      </div>

      <div id="electiveSetsModal" class="confirm-overlay" style="display:none;">
        <div class="confirm-box" style="max-width:900px; width:calc(100% - 40px); text-align:left; max-height:calc(100vh - 80px); overflow:auto; padding:14px; border-radius:14px; box-shadow:0 24px 48px rgba(15, 23, 42, 0.12);">
          <div style="display:flex;justify-content:space-between;align-items:center; gap:8px; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; font-size:1.15rem;">Manage Elective Sets</h3>
              <p style="margin:6px 0 0;color:#475569;font-size:0.85rem; line-height:1.25;">Create, review and delete elective sets for senior grades.</p>
            </div>
            <button id="modalCloseElectiveSetsBtn" class="btn secondary-btn" style="white-space:nowrap; padding:8px 12px; font-size:0.9rem;">Close</button>
          </div>

          <div style="display:grid; grid-template-columns:1fr; gap:12px;">
            <div style="padding:12px; border:1px solid #e6eef7; border-radius:10px; background:#ffffff;">
              <h4 style="margin:0 0 10px; font-size:1rem;">Create Set</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; align-items:center;">
                <input id="electiveSetName" class="form-control" placeholder="Set name" style="grid-column:1 / -1;">
                <select id="electiveGrade" class="form-control">
                  <option value="">Grade</option>
                  <option>Grade 10</option>
                  <option>Grade 11</option>
                  <option>Grade 12</option>
                </select>
                <input id="electiveMaxSubjects" type="number" value="3" class="form-control">
                <select id="electiveSetStatus" class="form-control">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div id="electiveSubjectChecks" style="margin-top:10px; display:flex; flex-direction:column; gap:8px; max-height:320px; overflow:auto; padding:8px; border:1px solid #eef6fb; border-radius:10px; background:#fbfdff; font-size:0.92rem;">
                <div style="color:#64748b;">Loading...</div>
              </div>
              <div style="margin-top:10px; text-align:right;">
                <button id="saveElectiveSetBtn" class="btn primary-btn" style="padding:8px 14px; font-size:0.95rem;">Save</button>
              </div>
            </div>

            <div style="padding:12px; border:1px solid #e6eef7; border-radius:10px; background:#ffffff;">
              <h4 style="margin:0 0 10px; font-size:1rem;">Elective Sets</h4>
              <div style="overflow:auto; max-height:340px;">
                <table class="table table-compact table-striped" style="width:100%;border-collapse:collapse;font-size:0.84rem;">
                  <thead>
                    <tr style="background:#fbfdff;">
                      <th style="padding:8px 6px; text-align:left;">Name</th>
                      <th style="padding:8px 6px; text-align:left;">Grade</th>
                      <th style="padding:8px 6px; text-align:left;">Subjects</th>
                      <th style="padding:8px 6px; text-align:center; width:60px;">Max</th>
                      <th style="padding:8px 6px; text-align:center; width:80px;">Status</th>
                      <th style="padding:8px 6px; text-align:center; width:120px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="electiveSetsTableBody">
                    <tr><td colspan="6" style="padding:10px; color:#64748b; text-align:center;">Loading sets...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById("refreshElectivesBtn")?.addEventListener("click", refreshAll);

    document.getElementById("electiveGrade")?.addEventListener("change", () => {
      loadElectiveSubjects();
    });

    document.getElementById("electiveAssignGrade")?.addEventListener("change", async (e) => {
      state.selectedGrade = e.target.value;
      state.selectedPathway = "";
      const isSenior = isSeniorGradeValue(state.selectedGrade);
      populatePathwayFilter(isSenior);
      updateLearnerSearchState();
      await loadLearners();
    });

    document.getElementById("electiveAssignPathway")?.addEventListener("change", async (e) => {
      state.selectedPathway = e.target.value;
      await loadLearners();
    });

    // Assignments filters
    const assignmentPathway = document.getElementById('assignmentPathwaySelect');
    const assignmentSearch = document.getElementById('assignmentSearchInput');
    const assignmentRefresh = document.getElementById('assignmentRefreshBtn');

    if (assignmentPathway) {
      // populate pathways
      const pathways = (window.SUBJECT_DATA && window.SUBJECT_DATA.seniorSchoolPathways) ? Object.keys(window.SUBJECT_DATA.seniorSchoolPathways) : ["STEM", "Social Sciences", "Arts & Sports Science"];
      pathways.forEach(p => {
        const opt = document.createElement('option'); opt.value = p; opt.textContent = p; assignmentPathway.appendChild(opt);
      });
      assignmentPathway.addEventListener('change', async (e) => {
        state.selectedAssignmentPathway = e.target.value;
        await loadAssignments(1);
      });
    }

    if (assignmentSearch) {
      assignmentSearch.addEventListener('input', debounce(async (e) => {
        state.assignmentSearch = e.target.value.trim();
        await loadAssignments(1);
      }, 350));
    }

    assignmentRefresh?.addEventListener('click', async () => {
      await loadAssignments(1);
    });

    const searchInput = document.getElementById("electiveSearchLearner");
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce(async (e) => {
          state.searchTerm = e.target.value.trim();
          await loadLearners();
        }, 300)
      );
    }

    document.getElementById("saveElectiveSetBtn")?.addEventListener("click", saveElectiveSet);
    document.getElementById("openElectiveSetsModalBtn")?.addEventListener("click", openElectiveSetsModal);
    document.getElementById("modalCloseElectiveSetsBtn")?.addEventListener("click", closeElectiveSetsModal);
    document.getElementById("bulkAssignBtn")?.addEventListener("click", bulkAssignToSelectedLearners);

    const electiveSetsModal = document.getElementById("electiveSetsModal");
    if (electiveSetsModal) {
      electiveSetsModal.addEventListener("click", (event) => {
        if (event.target === electiveSetsModal) {
          closeElectiveSetsModal();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && electiveSetsModal.classList.contains("visible")) {
          closeElectiveSetsModal();
        }
      });
    }

    document.getElementById("electiveSetsTableBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const action = btn.dataset.action;
      const setId = btn.dataset.setId;

      if (action === "delete-set") {
        await deleteElectiveSetById(setId);
      }
    });

    document.getElementById("electiveLearnerList")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const learnerId = btn.dataset.learnerId;

      if (action === "assign-one") {
        await assignSingleLearner(learnerId);
      }

      if (action === "toggle-select") {
        const checked = btn.checked;
        if (checked) state.selectedLearnerIds.add(learnerId);
        else state.selectedLearnerIds.delete(learnerId);
      }
    });

    document.getElementById("electiveAssignmentsBody")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const action = btn.dataset.action;
      const assignmentId = btn.dataset.assignmentId;
      const learnerId = btn.dataset.learnerId;
      const assignmentIds = btn.dataset.assignmentIds ? String(btn.dataset.assignmentIds).split(",").filter(Boolean) : [];

      if (action === "remove-assignment") {
        await removeAssignment(assignmentId);
      }

      if (action === "remove-learner-assignments") {
        await removeAssignmentsForLearner(learnerId, assignmentIds);
      }

      if (action === "view-learner") {
        await openLearnerAssignmentModal(learnerId);
      }
    });

    // Pagination controls for assignments
    document.getElementById("electiveAssignmentsPagination")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.id === 'assignmentPrevBtn') {
        renderAssignmentsPage(state.assignmentPage - 1);
      } else if (btn.id === 'assignmentNextBtn') {
        renderAssignmentsPage(state.assignmentPage + 1);
      }
    });
  }

  function openElectiveSetsModal() {
    const modal = document.getElementById("electiveSetsModal");
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.add("visible");
    document.body.classList.add("modal-open");
  }

  function closeElectiveSetsModal() {
    const modal = document.getElementById("electiveSetsModal");
    if (!modal) return;
    modal.classList.remove("visible");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  async function loadElectiveSubjects() {
    const grade = document.getElementById("electiveGrade")?.value || "";

    const container = document.getElementById("electiveSubjectChecks");
    if (!container) return;

    container.innerHTML = `<div style="color:#94a3b8;">Loading elective subjects...</div>`;

    try {
      // Adjust this endpoint if your subject API is different
      const query = grade ? `?grade=${encodeURIComponent(grade)}&type=elective` : `?type=elective`;
      const res = await apiFetch(`${API_BASE}/subjects${query}`);

      const subjects = Array.isArray(res) ? res : res?.data || res?.subjects || [];
      state.electiveSubjects = subjects;

      if (!subjects.length) {
        container.innerHTML = `<div style="color:#94a3b8;">No elective subjects found.</div>`;
        return;
      }

      // Group subjects by pathway for easier navigation (use SUBJECT_DATA if available)
      const groups = {};
      const allowedPaths = (window.SUBJECT_DATA && window.SUBJECT_DATA.seniorSchoolPathways)
        ? Object.keys(window.SUBJECT_DATA.seniorSchoolPathways)
        : ["STEM", "Social Sciences", "Arts & Sports Science"];

      subjects.forEach((s) => {
        const value = s.name || s.subjectName || s.title || "";
        let pathway = null;
        try {
          if (window.SUBJECT_DATA && typeof window.SUBJECT_DATA.getSeniorPathway === 'function') {
            pathway = window.SUBJECT_DATA.getSeniorPathway(value);
          } else if (window.cbcUtils && typeof window.cbcUtils.normalizePathway === 'function') {
            pathway = window.cbcUtils.normalizePathway(value);
          }
        } catch (e) {
          pathway = null;
        }

        // Only include known elective pathways; exclude 'Core' and uncategorized
        if (!pathway || !allowedPaths.includes(pathway)) return;

        if (!groups[pathway]) groups[pathway] = [];
        groups[pathway].push({ value, id: s._id || s.id || value.replace(/\s+/g, "-").toLowerCase() });
      });

      if (!Object.keys(groups).length) {
        container.innerHTML = `<div style="color:#94a3b8;">No elective subjects found for the selected grade/pathways.</div>`;
        return;
      }

      // Build grouped, collapsed sections using <details>
      let html = "";

      html += Object.keys(groups).map(path => {
        const normalizedPath = escapeHtml(path);
        const items = groups[path].map(item => `
          <div data-subject="${escapeHtml(String(item.value).toLowerCase())}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid #e6eef7; border-radius:8px; background:#ffffff;">
            <div style="font-size:0.95rem; color:#0f172a; flex:1; min-width:0; margin-right:12px;">${escapeHtml(item.value)}</div>
            <div style="flex:0 0 auto; margin-left:8px;">
              <input type="checkbox" class="elective-subject-check" value="${escapeHtml(item.value)}" data-id="${escapeHtml(item.id)}" style="width:18px; height:18px; vertical-align:middle;">
            </div>
          </div>
        `).join("");

        return `
          <details data-path="${escapeHtml(path)}" style="margin-bottom:10px; border-radius:10px; padding:8px; background:#f8fafc; border:1px solid #e6eef7;">
            <summary style="font-weight:700; padding:6px 8px; cursor:pointer;">${normalizedPath} <small style=\"color:#64748b; font-weight:400;\">(${groups[path].length})</small></summary>
            <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
              <input class="pathway-subject-search" data-path="${escapeHtml(path)}" placeholder="Search subjects..." style="flex:1;padding:8px;border-radius:6px;border:1px solid #e6eef7;">
            </div>
            <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
              ${items}
            </div>
          </details>
        `;
      }).join("");

      container.innerHTML = html;

      // Ensure pathway groups are collapsed by default and accessible
      container.querySelectorAll('details[data-path]').forEach((d) => {
        d.removeAttribute('open');
        const s = d.querySelector('summary');
        if (s) {
          s.setAttribute('role', 'button');
          s.setAttribute('aria-expanded', 'false');
        }
        d.addEventListener('toggle', () => {
          if (s) s.setAttribute('aria-expanded', d.open ? 'true' : 'false');
        });
      });

      // Wire per-pathway subject search inputs (debounced)
      container.querySelectorAll('.pathway-subject-search').forEach((input) => {
        input.addEventListener('input', debounce((e) => {
          const q = String(e.target.value || '').trim().toLowerCase();
          const path = e.target.dataset.path;
          if (!path) return;
          const details = container.querySelector(`details[data-path="${CSS.escape(path)}"]`);
          if (!details) return;
          details.querySelectorAll('[data-subject]').forEach((row) => {
            const subj = String(row.dataset.subject || '');
            row.style.display = q === '' || subj.includes(q) ? '' : 'none';
          });
        }, 180));
      });

      // No pathway filter: all pathway groups are displayed by default
    } catch (err) {
      console.error("Load elective subjects error:", err);
      container.innerHTML = `<div style="color:#ef4444;">Failed to load subjects: ${escapeHtml(err.message)}</div>`;
    }
  }

  function populatePathwayFilter(enable) {
    const pathwaySelect = document.getElementById("electiveAssignPathway");
    if (!pathwaySelect) return;

    if (!enable) {
      pathwaySelect.innerHTML = `<option value="">-- Select Grade 10-12 --</option>`;
      pathwaySelect.disabled = true;
      return;
    }

    const pathways = (window.SUBJECT_DATA && window.SUBJECT_DATA.seniorSchoolPathways)
      ? Object.keys(window.SUBJECT_DATA.seniorSchoolPathways)
      : ["STEM", "Social Sciences", "Arts & Sports Science"];

    pathwaySelect.innerHTML = `<option value="">-- Select Pathway --</option>`;
    pathways.forEach((pathway) => {
      const opt = document.createElement("option");
      opt.value = pathway;
      opt.textContent = pathway;
      pathwaySelect.appendChild(opt);
    });

    pathwaySelect.disabled = false;
  }

  async function loadElectiveSets() {
    const setSelect = document.getElementById("electiveSetSelect");
    if (!setSelect) return;

    setSelect.innerHTML = `<option value="">-- Loading sets... --</option>`;

    try {
      const res = await apiFetch(`${API_BASE}/electives/sets`);
      const sets = Array.isArray(res) ? res : res?.data || res?.sets || [];
      state.electiveSets = sets;

      setSelect.innerHTML = `<option value="">-- Select Elective Set --</option>`;
      if (!sets.length) {
        setSelect.innerHTML = `<option value="">-- No sets available --</option>`;
        return;
      }

      sets.forEach((set) => {
        const opt = document.createElement("option");
        opt.value = set._id || set.id;
        const gradeLabel = set.grade || "";
        opt.textContent = `${set.name} (${gradeLabel})`;
        setSelect.appendChild(opt);
      });

      const setsTableBody = document.getElementById("electiveSetsTableBody");
      if (setsTableBody) {
        setsTableBody.innerHTML = sets.length
          ? sets.map((set) => {
              const subjects = Array.isArray(set.subjects) ? set.subjects.join(", ") : "";
              return `
                <tr>
                  <td style="padding:6px;">${escapeHtml(set.name)}</td>
                  <td style="padding:6px;">${escapeHtml(set.grade || "-")}</td>
                  <td style="padding:6px;">${escapeHtml(subjects)}</td>
                  <td style="padding:6px;">${escapeHtml(String(set.maxSubjects || 3))}</td>
                  <td style="padding:6px;">${escapeHtml(set.status || "active")}</td>
                  <td style="padding:6px; white-space:nowrap;">
                    <button class="btn secondary-btn" data-action="delete-set" data-set-id="${escapeHtml(set._id || set.id)}">Delete</button>
                  </td>
                </tr>
              `;
            }).join("")
          : `<tr><td colspan="6" style="padding:12px; color:#94a3b8;">No elective sets available.</td></tr>`;
      }
    } catch (err) {
      console.error("Load elective sets error:", err);
      setSelect.innerHTML = `<option value="">-- Failed to load sets --</option>`;
    }
  }

  function updateLearnerSearchState() {
    const searchInput = document.getElementById("electiveSearchLearner");
    if (!searchInput) return;

    if (state.selectedGrade) {
      searchInput.disabled = false;
      if (!searchInput.value) {
        searchInput.placeholder = "Search learner";
      }
    } else {
      searchInput.disabled = true;
      searchInput.value = "";
      state.searchTerm = "";
      searchInput.placeholder = "Select a grade first";
    }
  }

  async function loadLearners() {
    const container = document.getElementById("electiveLearnerList");
    if (!container) return;

    const grade = state.selectedGrade || "";
    const search = state.searchTerm || "";

    updateLearnerSearchState();

    if (!grade) {
      state.learners = [];
      const pathwaySelect = document.getElementById("electiveAssignPathway");
      if (pathwaySelect) {
        pathwaySelect.value = "";
        pathwaySelect.disabled = true;
      }
      container.innerHTML = `<div style="color:#64748b;">Select a grade to load senior learners.</div>`;
      return;
    }

    container.innerHTML = `<div style="color:#94a3b8;">Loading learners...</div>`;

    try {
      // Adjust this endpoint to match your learner API
      let url = `${API_BASE}/learners?limit=100&grade=${encodeURIComponent(grade)}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await apiFetch(url);
      const learners = Array.isArray(res) ? res : res?.data || res?.learners || [];
      const seniorLearners = learners.filter((learner) => isSeniorGradeValue(learner.grade));
      const normalizedPathway = (value) => {
        if (!value && value !== 0) return "";
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (window.cbcUtils && typeof window.cbcUtils.normalizePathway === 'function') {
          return window.cbcUtils.normalizePathway(raw);
        }
        return raw;
      };
      const pathwayFilter = normalizedPathway(state.selectedPathway);
      const filteredLearners = pathwayFilter
        ? seniorLearners.filter((learner) => normalizedPathway(learner.pathway) === pathwayFilter)
        : seniorLearners;

      // Fetch assigned learner IDs for this grade so we can exclude them from the assign list
      let assignedLearnerIds = new Set();
      try {
        const idsRes = await apiFetch(`${API_BASE}/electives/assignments/ids?grade=${encodeURIComponent(grade)}`);
        const ids = Array.isArray(idsRes) ? idsRes : idsRes?.data || [];
        assignedLearnerIds = new Set((ids || []).map((i) => String(i)));
        // save to state for potential reuse
        state.assignedLearnerIdsForGrade = assignedLearnerIds;
      } catch (e) {
        console.warn('Could not fetch assigned learner ids:', e);
      }

      // Exclude learners that already have assignments
      const unassignedLearners = filteredLearners.filter((learner) => {
        const lid = String(learner._id || learner.id || "");
        return !assignedLearnerIds.has(lid);
      });

      state.learners = unassignedLearners;

      if (!unassignedLearners.length) {
        const noMatchMessage = state.selectedPathway
          ? `No unassigned learners found for ${escapeHtml(grade)} in ${escapeHtml(state.selectedPathway)}.`
          : `No unassigned senior learners found for ${escapeHtml(grade)}.`;
        container.innerHTML = `<div style="color:#94a3b8;">${noMatchMessage}</div>`;
        return;
      }

      const selectedPathwayLabel = state.selectedPathway ? ` in ${escapeHtml(state.selectedPathway)}` : "";
      const totalCount = filteredLearners.length;
      const assignedCount = filteredLearners.filter((learner) => {
        const lid = String(learner._id || learner.id || "");
        return assignedLearnerIds.has(lid);
      }).length;
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:12px;">
          <div style="font-size:0.85rem; color:#64748b; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#d1fae5; color:#166534; font-weight:700;"> Total ${totalCount}</span>
                        <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#fce7f3; color:#9f1239; font-weight:700;"> Assigned ${assignedCount}</span>
            <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#eef2ff; color:#3730a3; font-weight:700;"> Unassigned ${unassignedLearners.length}</span>
            ${selectedPathwayLabel ? `<span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#f8fafc; color:#334155;">${selectedPathwayLabel}</span>` : ""}
          </div>
          <div style="font-size:0.8rem; color:#94a3b8;">Tick learners to bulk assign</div>
        </div>
        <div style="max-height:360px; overflow:auto; border:1px solid #e2e8f0; border-radius:10px;">
            ${unassignedLearners.map(renderLearnerRow).join("")}
          </div>
      `;
    } catch (err) {
      console.error("Load learners error:", err);
      container.innerHTML = `<div style="color:#ef4444;">Failed to load learners: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderLearnerRow(learner) {
    const id = learner._id || learner.id;
    const name = learner.name || learner.fullName || "Unnamed learner";
    const admission = learner.admission || learner.admissionNumber || "-";
    const grade = learner.grade || "-";
    const stream = learner.stream ? ` ${learner.stream}` : "";

    return `
      <div style="display:grid; grid-template-columns: 24px 1.6fr 0.8fr 1fr auto; gap:8px; align-items:center; padding:8px 8px; border-bottom:1px solid #f1f5f9; font-size:0.88rem;">
        <input type="checkbox" data-action="toggle-select" data-learner-id="${escapeHtml(id)}" ${state.selectedLearnerIds.has(String(id)) ? "checked" : ""}>
        <div>
          <div style="display:flex; gap:8px; align-items:center;">
            <small style="color:#64748b; font-size:0.82rem;">${escapeHtml(admission)}</small>
            <strong style="font-size:0.95rem;">${escapeHtml(name)}</strong>
          </div>
          
        </div>
        <div style="font-size:0.9rem; color:#0f172a;">${escapeHtml(grade)}${escapeHtml(stream)}</div>
        <div>
          <select class="learner-set-select" data-learner-id="${escapeHtml(id)}" style="width:100%; font-size:0.86rem; padding:6px 8px;">
            <option value="">Select set</option>
            ${state.electiveSets.map((s) => `
              <option value="${escapeHtml(s._id || s.id)}">${escapeHtml(s.name)}${s.grade ? ` (${escapeHtml(s.grade)})` : ""}</option>
            `).join("")}
          </select>
        </div>
        <div>
          <button class="btn primary-btn" data-action="assign-one" data-learner-id="${escapeHtml(id)}" style="padding:6px 8px; font-size:0.82rem; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Assign</button>
        </div>
      </div>
    `;
  }

  async function loadAssignments(page = 1) {
    const tbody = document.getElementById("electiveAssignmentsBody");
    if (!tbody) return;

    const pager = document.getElementById("electiveAssignmentsPagination");
    tbody.innerHTML = `<tr><td colspan="3" style="padding:12px; color:#94a3b8;">Loading assignments...</td></tr>`;

    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', state.assignmentLimit);
      if (state.selectedAssignmentPathway) params.set('pathway', state.selectedAssignmentPathway);
      if (state.assignmentSearch) params.set('q', state.assignmentSearch);
      const url = `${API_BASE}/electives/assignments?${params.toString()}`;
      const res = await apiFetch(url);
      const data = res?.data || [];
      const total = res?.total || 0;
      const totalPages = res?.totalPages || Math.max(1, Math.ceil(total / state.assignmentLimit));

      // server returns grouped learner rows
      state.assignmentsAll = data;
      state.assignmentPage = res?.page || page;
      state.totalAssignments = total;
      state.totalAssignmentPages = totalPages;

      renderAssignmentsPage(state.assignmentPage);
    } catch (err) {
      console.error("Load assignments error:", err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="padding:12px; color:#ef4444;">Failed to load assignments: ${escapeHtml(err.message)}</td></tr>`;
      if (pager) pager.innerHTML = '';
    }
  }

  function renderAssignmentsPage(page = state.assignmentPage) {
    const tbody = document.getElementById("electiveAssignmentsBody");
    const pager = document.getElementById("electiveAssignmentsPagination");
    if (!tbody) return;

    const groups = state.assignmentsAll || [];
    if (!groups.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="padding:12px; color:#94a3b8;">No elective assignments yet.</td></tr>`;
      if (pager) pager.innerHTML = '';
      return;
    }

    const limit = Number(state.assignmentLimit) || 20;
    const total = Number(state.totalAssignments) || (groups.length);
    const totalPages = Number(state.totalAssignmentPages) || Math.max(1, Math.ceil(total / limit));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    state.assignmentPage = page;

    const start = (page - 1) * limit;

    tbody.innerHTML = groups.map((group) => {
      // Normalize shape: server returns { learner: { name, admission, _id }, assignmentIds, subjectLines, grade }
      const learnerObj = group.learner || {};
      const learnerId = String(learnerObj._id || group._id || group.learnerId || "");
      const learnerName = learnerObj.name || group.learnerName || "Unknown";
      const admission = learnerObj.admission || group.admission || "-";
      const canRemoveMultiple = (group.assignmentIds || []).length > 1;

      return `
        <tr data-learner-id="${escapeHtml(learnerId)}">
          <td style="padding:4px; font-size:0.92rem;"><div style="display:flex; gap:8px; align-items:center;"><small style="color:#64748b; font-size:0.82rem;">${escapeHtml(admission)}</small><span style="font-weight:600;">${escapeHtml(learnerName)}</span></div></td>
          <td style="padding:4px; font-size:0.92rem;">${escapeHtml(group.grade || "-")}</td>
          <td style="padding:4px; white-space:nowrap;">
            <button class="btn secondary-btn" data-action="view-learner" data-learner-id="${escapeHtml(learnerId)}" style="padding:6px 8px; font-size:0.82rem; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">View</button>
            <button class="btn danger" data-action="${canRemoveMultiple ? 'remove-learner-assignments' : 'remove-assignment'}" data-learner-id="${escapeHtml(learnerId)}" data-assignment-ids="${escapeHtml((group.assignmentIds || []).join(","))}" style="padding:6px 8px; font-size:0.82rem; border-radius:8px; background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;">
              ${canRemoveMultiple ? 'Remove All' : 'Remove'}
            </button>
          </td>
        </tr>
      `;
    }).join("");
    if (pager) {
      pager.innerHTML = `
        <div style="font-size:0.85rem; color:#64748b;">Showing ${start + 1}-${Math.min(start + limit, total)} of ${total}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="assignmentPrevBtn" class="btn secondary-btn" ${page === 1 ? 'disabled' : ''} style="padding:8px 12px; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Prev</button>
          <span style="font-size:0.85rem; color:#475569;">Page ${page} of ${totalPages}</span>
          <button id="assignmentNextBtn" class="btn secondary-btn" ${page === totalPages ? 'disabled' : ''} style="padding:8px 12px; border-radius:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">Next</button>
        </div>
      `;
    }
  }

  async function deleteElectiveSetById(setId) {
    if (!setId) {
      return window.showToast?.("Invalid elective set selected", "error");
    }

    const ok = await window.showConfirm?.({
      title: "Delete Elective Set",
      message: "Are you sure you want to delete this elective set? This will also remove related assignments.",
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/electives/sets/${encodeURIComponent(setId)}`, {
        method: "DELETE",
      });

      window.showToast?.(res?.message || "Elective set deleted successfully", "success");
      await refreshAll();
    } catch (err) {
      console.error("Delete elective set error:", err);
      window.showToast?.(err.message || "Failed to delete elective set", "error");
    }
  }

  async function deleteSelectedElectiveSet() {
    const setId = document.getElementById("electiveSetSelect")?.value || "";
    if (!setId) {
      return window.showToast?.("Please select a set to delete", "error");
    }
    await deleteElectiveSetById(setId);
  }

  async function saveElectiveSet() {
    const name = document.getElementById("electiveSetName")?.value.trim();
    const grade = document.getElementById("electiveGrade")?.value;
    const maxSubjects = Number(document.getElementById("electiveMaxSubjects")?.value || 3);
    const status = document.getElementById("electiveSetStatus")?.value || "active";

    const subjects = Array.from(document.querySelectorAll(".elective-subject-check:checked"))
      .map((cb) => cb.value)
      .filter(Boolean);

    if (!name) return window.showToast?.("Please enter a set name", "error");
    if (!grade) return window.showToast?.("Please select a grade", "error");
    if (!subjects.length) return window.showToast?.("Please select at least one elective subject", "error");

    const ok = await window.showConfirm?.({
      title: "Save Elective Set",
      message: `Create elective set "${name}" for ${grade}?`
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/electives/sets`, {
        method: "POST",
        body: JSON.stringify({ name, grade, maxSubjects, status, subjects }),
      });

      window.showToast?.(res?.message || "Elective set saved successfully", "success");
      await refreshAll();
    } catch (err) {
      console.error("Save elective set error:", err);
      window.showToast?.(err.message || "Failed to save elective set", "error");
    }
  }

  async function getSelectedSetForLearner(learnerId) {
    const row = document.querySelector(`.learner-set-select[data-learner-id="${CSS.escape(String(learnerId))}"]`);
    return row?.value || "";
  }

  async function assignSingleLearner(learnerId) {
    const setId = await getSelectedSetForLearner(learnerId);

    if (!setId) {
      return window.showToast?.("Please select an elective set for this learner", "error");
    }

    const learner = state.learners.find((l) => String(l._id || l.id) === String(learnerId));
    const learnerName = learner?.name || "this learner";

    const ok = await window.showConfirm?.({
      title: "Assign Electives",
      message: `Assign selected elective set to ${learnerName}?`
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/electives/assignments`, {
        method: "POST",
        body: JSON.stringify({
          learnerId,
          electiveSetId: setId,
        }),
      });

      window.showToast?.(res?.message || "Electives assigned successfully", "success");
      await loadAssignments();
      await loadLearners();
    } catch (err) {
      console.error("Assign learner error:", err);
      window.showToast?.(err.message || "Failed to assign electives", "error");
    }
  }

  async function bulkAssignToSelectedLearners() {
    const setId = document.getElementById("electiveSetSelect")?.value || "";
    const learnerIds = Array.from(state.selectedLearnerIds);

    if (!setId) {
      return window.showToast?.("Please select an elective set", "error");
    }

    if (!learnerIds.length) {
      return window.showToast?.("Please tick at least one learner", "error");
    }

    const ok = await window.showConfirm?.({
      title: "Bulk Assign Electives",
      message: `Assign this elective set to ${learnerIds.length} learner(s)?`
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/electives/assignments/bulk`, {
        method: "POST",
        body: JSON.stringify({
          electiveSetId: setId,
          learnerIds,
        }),
      });

      window.showToast?.(res?.message || "Bulk assignment completed", "success");
      state.selectedLearnerIds.clear();
      await refreshAll();
    } catch (err) {
      console.error("Bulk assign error:", err);
      window.showToast?.(err.message || "Failed to bulk assign electives", "error");
    }
  }

  async function removeAssignment(assignmentId) {
    if (!assignmentId) return;

    const ok = await window.showConfirm?.({
      title: "Remove Assignment",
      message: "Are you sure you want to remove this elective assignment?"
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`${API_BASE}/electives/assignments/${assignmentId}`, {
        method: "DELETE",
      });

      window.showToast?.(res?.message || "Assignment removed", "success");
      await refreshAll();
    } catch (err) {
      console.error("Remove assignment error:", err);
      window.showToast?.(err.message || "Failed to remove assignment", "error");
    }
  }

  async function removeAssignmentsForLearner(learnerId, assignmentIds = []) {
    if (!learnerId || !assignmentIds.length) return;

    const ok = await window.showConfirm?.({
      title: "Remove Learner Assignments",
      message: `Are you sure you want to remove all elective assignments for this learner? (${assignmentIds.length} item${assignmentIds.length > 1 ? 's' : ''})`
    });

    if (!ok) return;

    try {
      await Promise.all(assignmentIds.map((assignmentId) =>
        apiFetch(`${API_BASE}/electives/assignments/${assignmentId}`, {
          method: "DELETE",
        })
      ));

      window.showToast?.("All assignments removed", "success");
      await refreshAll();
    } catch (err) {
      console.error("Remove learner assignments error:", err);
      window.showToast?.(err.message || "Failed to remove learner assignments", "error");
    }
  }

  async function openLearnerAssignmentModal(learnerId) {
    try {
      const res = await apiFetch(`${API_BASE}/electives/learners/${learnerId}`);
      const data = res?.data || res || {};

      const modal = document.createElement("div");
      modal.className = "confirm-overlay visible";
      modal.style.zIndex = "10005";

      const learnerName = data.learner?.name || "Learner";
      const admission = data.learner?.admission || "-";
      const assignments = Array.isArray(data.assignments) ? data.assignments : [];
      const electives = Array.isArray(data.electives) ? data.electives : [];

      modal.innerHTML = `
        <div class="confirm-box" style="max-width:700px; width:95%; text-align:left;">
          <h3 style="margin-top:0;">Learner Electives</h3>
          <p style="color:#64748b; margin-top:0;">${escapeHtml(learnerName)} | ${escapeHtml(admission)}</p>

          <div style="border:1px solid #e2e8f0; border-radius:10px; padding:12px; background:#fafafa; max-height:320px; overflow:auto;">
            ${
              assignments.length
                ? assignments.map((assignment) => {
                    const setName = assignment?.electiveSetId?.name || "Assigned set";
                    const setSubjects = Array.isArray(assignment?.subjects) && assignment.subjects.length
                      ? assignment.subjects
                      : Array.isArray(assignment?.electiveSetId?.subjects)
                        ? assignment.electiveSetId.subjects
                        : [];
                    return `
                      <div style="padding:10px 0; border-bottom:1px solid #edf2f7;">
                        <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(setName)}</div>
                        <div style="color:#475569; font-size:0.9rem;">
                          ${setSubjects.length ? setSubjects.map((s) => `<span style="display:inline-block; margin-right:8px; margin-bottom:4px; padding:4px 10px; background:#eef2ff; border-radius:999px; color:#3730a3; font-size:0.85rem;">${escapeHtml(s)}</span>`).join("") : "<span style=\"color:#94a3b8;\">No subjects listed</span>"}
                        </div>
                      </div>
                    `;
                  }).join("")
                : (electives.length
                  ? electives.map((s) => `<div style="padding:8px 0; border-bottom:1px solid #edf2f7;">${escapeHtml(s)}</div>`).join("")
                  : `<div style="color:#94a3b8;">No electives assigned.</div>`)
            }
          </div>

          <div style="text-align:right; margin-top:16px;">
            <button id="closeElectiveModalBtn" class="btn secondary-btn">Close</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.querySelector("#closeElectiveModalBtn").onclick = () => {
        modal.remove();
      };
    } catch (err) {
      console.error("Open learner modal error:", err);
      window.showToast?.(err.message || "Failed to load learner electives", "error");
    }
  }

  async function refreshAll() {
    // Load assignments first so we can filter learners reliably,
    // then fetch other resources in parallel.
    await loadAssignments();
    await Promise.all([
      loadElectiveSubjects(),
      loadElectiveSets(),
      loadLearners(),
    ]);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;

    const root = getRoot();
    if (!root) {
      console.warn("electiveModuleRoot not found. Add <div id='electiveModuleRoot'></div> to admin.html");
      return;
    }

    renderLayout();
    refreshAll();
  }

  window.ElectivesAdmin = {
    init,
    refreshAll,
  };
})();
