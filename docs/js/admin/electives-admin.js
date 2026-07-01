
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
    selectedGrade: "",
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
            <button id="refreshElectivesBtn" class="btn secondary-btn">Refresh</button>
            <button id="openElectiveSetsModalBtn" class="btn primary-btn">Manage Elective Sets</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:12px;margin-bottom:12px;">
        <h4 style="margin:0 0 10px;">Assign</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;">
          <select id="electiveAssignGrade" class="form-control" style="min-width:160px;">
            <option value="">-- Select Grade --</option>
            <option>Grade 10</option>
            <option>Grade 11</option>
            <option>Grade 12</option>
          </select>
          <input id="electiveSearchLearner" class="form-control" placeholder="Search learner" disabled style="min-width:180px;">
          <select id="electiveSetSelect" class="form-control" style="min-width:180px;"></select>
          <button id="bulkAssignBtn" class="btn secondary-btn" style="padding:10px 18px;">Bulk</button>
        </div>
        <div id="electiveLearnerList" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="padding:12px;">
        <h4 style="margin:0 0 10px;">Assignments</h4>
        <div style="overflow:auto;">
          <table class="table table-compact table-striped" style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:5px 6px;">Learner</th>
                <th style="padding:5px 6px;">Adm</th>
                <th style="padding:5px 6px;">Grade</th>
                <th style="padding:5px 6px;">Electives</th>
                <th style="padding:5px 6px;">Actions</th>
              </tr>
            </thead>
            <tbody id="electiveAssignmentsBody">
              <tr><td colspan="5" style="padding:8px 6px;color:#94a3b8;">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="electiveSetsModal" class="confirm-overlay" style="display:none;">
        <div class="confirm-box" style="max-width:960px; width:calc(100% - 40px); text-align:left; max-height:calc(100vh - 60px); overflow:auto; padding:24px; border-radius:22px; box-shadow:0 32px 80px rgba(15, 23, 42, 0.18);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap; margin-bottom:16px;">
            <div style="flex:1 1 300px; min-width:0;">
              <h3 style="margin:0; font-size:1.35rem;">Manage Elective Sets</h3>
              <p style="margin:8px 0 0;color:#475569;font-size:0.95rem; line-height:1.5;">Create, review and delete elective sets for senior grades from one modal.</p>
            </div>
            <button id="modalCloseElectiveSetsBtn" class="btn secondary-btn" style="white-space:nowrap; padding:10px 16px;">Close</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr;gap:18px;">
            <div style="padding:18px; border:1px solid #e2e8f0; border-radius:16px; background:#ffffff; box-shadow: inset 0 0 0 1px rgba(226,232,240,0.45);">
              <h4 style="margin:0 0 14px; font-size:1.05rem;">Create Set</h4>
              <div style="display:grid;grid-template-columns:1fr;gap:12px;">
                <input id="electiveSetName" class="form-control" placeholder="Set name">
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
              <div id="electiveSubjectChecks" style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;max-height:260px;overflow:auto;padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">
                <div style="color:#64748b;">Loading...</div>
              </div>
              <div style="margin-top:16px; text-align:right;">
                <button id="saveElectiveSetBtn" class="btn primary-btn" style="padding:10px 18px;">Save</button>
              </div>
            </div>

            <div style="padding:18px; border:1px solid #e2e8f0; border-radius:16px; background:#ffffff; box-shadow: inset 0 0 0 1px rgba(226,232,240,0.45);">
              <h4 style="margin:0 0 14px; font-size:1.05rem;">Elective Sets</h4>
              <div style="overflow:auto; max-height:420px;">
                <table class="table table-compact table-striped" style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                  <thead>
                    <tr style="background:#f8fafc;">
                      <th style="padding:10px 8px; text-align:left;">Name</th>
                      <th style="padding:10px 8px; text-align:left;">Grade</th>
                      <th style="padding:10px 8px; text-align:left;">Subjects</th>
                      <th style="padding:10px 8px; text-align:center;">Max</th>
                      <th style="padding:10px 8px; text-align:center;">Status</th>
                      <th style="padding:10px 8px; text-align:center;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="electiveSetsTableBody">
                    <tr><td colspan="6" style="padding:14px; color:#64748b; text-align:center;">Loading sets...</td></tr>
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
      updateLearnerSearchState();
      await loadLearners();
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

      if (action === "remove-assignment") {
        await removeAssignment(assignmentId);
      }

      if (action === "view-learner") {
        await openLearnerAssignmentModal(learnerId);
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

      container.innerHTML = subjects.map((s) => {
        const value = s.name || s.subjectName || s.title || "";
        const id = s._id || s.id || value.replace(/\s+/g, "-").toLowerCase();
        return `
          <label style="display:flex; gap:8px; align-items:center; padding:8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff;">
            <input type="checkbox" class="elective-subject-check" value="${escapeHtml(value)}" data-id="${escapeHtml(id)}">
            <span style="font-size:0.9rem;">${escapeHtml(value)}</span>
          </label>
        `;
      }).join("");
    } catch (err) {
      console.error("Load elective subjects error:", err);
      container.innerHTML = `<div style="color:#ef4444;">Failed to load subjects: ${escapeHtml(err.message)}</div>`;
    }
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
      state.learners = seniorLearners;

      if (!seniorLearners.length) {
        container.innerHTML = `<div style="color:#94a3b8;">No senior learners found for ${escapeHtml(grade)}.</div>`;
        return;
      }

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:0.85rem; color:#64748b;">${seniorLearners.length} learner(s) found</div>
          <div style="font-size:0.8rem; color:#94a3b8;">Tick learners to bulk assign</div>
        </div>
        <div style="max-height:360px; overflow:auto; border:1px solid #e2e8f0; border-radius:10px;">
          ${seniorLearners.map(renderLearnerRow).join("")}
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
    const alreadyAssigned = learner.electives && learner.electives.length ? learner.electives.join(", ") : "None";

    return `
      <div style="display:grid; grid-template-columns: 24px 1.6fr 1fr 1fr 1fr auto; gap:10px; align-items:center; padding:12px; border-bottom:1px solid #f1f5f9;">
        <input type="checkbox" data-action="toggle-select" data-learner-id="${escapeHtml(id)}" ${state.selectedLearnerIds.has(String(id)) ? "checked" : ""}>
        <div>
          <strong>${escapeHtml(name)}</strong><br>
          <small style="color:#64748b;">${escapeHtml(admission)}</small>
        </div>
        <div>${escapeHtml(grade)}${escapeHtml(stream)}</div>
        <div style="color:#64748b;">${escapeHtml(alreadyAssigned)}</div>
        <div>
          <select class="learner-set-select" data-learner-id="${escapeHtml(id)}" style="width:100%;">
            <option value="">Select set</option>
            ${state.electiveSets.map((s) => `
              <option value="${escapeHtml(s._id || s.id)}">${escapeHtml(s.name)}${s.grade ? ` (${escapeHtml(s.grade)})` : ""}</option>
            `).join("")}
          </select>
        </div>
        <div>
          <button class="btn primary-btn" data-action="assign-one" data-learner-id="${escapeHtml(id)}">Assign</button>
        </div>
      </div>
    `;
  }

  async function loadAssignments() {
    const tbody = document.getElementById("electiveAssignmentsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#94a3b8;">Loading assignments...</td></tr>`;

    try {
      const res = await apiFetch(`${API_BASE}/electives/assignments`);
      const assignments = Array.isArray(res) ? res : res?.data || res?.assignments || [];
      state.assignments = assignments;

      if (!assignments.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#94a3b8;">No elective assignments yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = assignments.map((a) => {
        
        const learner = a.learnerId || a.learner || {};
        const learnerId = learner._id || a.learnerId?._id || "";
        const assignmentId = a._id || a.id || "";


               const learnerName =
                learner.name ||
                learner.fullName ||
                "Unknown";

                const admission =
                 learner.admission ||
                learner.admissionNumber ||
                "-";

                const grade =
               a.grade ||
               learner.grade ||
                 "-";

           const subjects = Array.isArray(a.subjects)
  ? a.subjects.join(", ")
  : (a.subjects || a.electives || "-");
        return `
          <tr>
            <td style="padding:6px;">${escapeHtml(learnerName)}</td>
            <td style="padding:6px;">${escapeHtml(admission)}</td>
            <td style="padding:6px;">${escapeHtml(grade)}</td>
            <td style="padding:6px;">${escapeHtml(subjects)}</td>
            <td style="padding:6px; white-space:nowrap;">
              <button class="btn secondary-btn" data-action="view-learner" data-learner-id="${escapeHtml(learnerId)}">View</button>
              <button class="btn danger" data-action="remove-assignment" data-assignment-id="${escapeHtml(assignmentId)}">Remove</button>
            </td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      console.error("Load assignments error:", err);
      tbody.innerHTML = `<tr><td colspan="5" style="padding:12px; color:#ef4444;">Failed to load assignments: ${escapeHtml(err.message)}</td></tr>`;
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
                          ${setSubjects.length ? setSubjects.map((s) => `<span style="display:inline-block; margin-right:8px; margin-bottom:4px; padding:2px 8px; background:#fff; border-radius:999px; border:1px solid #e2e8f0;">${escapeHtml(s)}</span>`).join("") : "<span style=\"color:#94a3b8;\">No subjects listed</span>"}
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
    await Promise.all([
      loadElectiveSubjects(),
      loadElectiveSets(),
      loadLearners(),
      loadAssignments(),
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
