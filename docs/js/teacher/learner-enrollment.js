(() => {
  const moduleState = {
    initialized: false,
    getContext: null,
    reloadStudents: null,
    action: null,
    searchAction: null,
    searchInFlight: false,
    lastSearchKey: "",
    lastSearchAt: 0
  };

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const getToken = () => window.authService?.getToken?.();

  const getNextAdmissionNumber = async () => {
    const token = getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${config.api.baseURL}/users/last-admission?role=student`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) return null;

      const data = await response.json();
      const highest = Number.parseInt(data.lastAdmission, 10);
      return Number.isFinite(highest) ? String(highest + 1) : null;
    } catch (error) {
      console.warn("Could not load the next admission number:", error);
      return null;
    }
  };

  const showMessage = (message, type = "error") => {
    if (window.showToast) {
      window.showToast(message, type);
    } else if (window.cbcUtils?.showToast) {
      window.cbcUtils.showToast(message, type);
    }
  };

  const closeModal = () => {
    const modal = document.getElementById("teacherCreateLearnerModal");
    if (modal) modal.remove();
  };

  const updateVisibility = () => {
    if (!moduleState.action) return;
    const context = moduleState.getContext?.() || {};
    moduleState.action.hidden = !(context.classLabel && context.subject && context.assessment);
    if (moduleState.searchAction) {
      moduleState.searchAction.hidden = !(context.classLabel && context.subject && context.assessment);
    }
    updateSearchButtonVisibility();
  };

  const updateSearchButtonVisibility = () => {
    const input = document.getElementById("findLearnerAdmission");
    const button = document.getElementById("findLearnerBtn");
    const clearButton = document.getElementById("clearLearnerSearchBtn");
    const hasValue = Boolean(input?.value.trim());
    if (button) button.hidden = !hasValue;
    if (clearButton) clearButton.hidden = !hasValue;
  };

  const findLearner = async () => {
    const context = moduleState.getContext?.() || {};
    const input = document.getElementById("findLearnerAdmission");
    const button = document.getElementById("findLearnerBtn");
    const admission = input?.value.trim();
    if (!context.classLabel || !context.subject || !context.assessment || !admission) {
      showMessage("Select subject and assessment, then enter an admission number.", "error");
      return;
    }

    const token = getToken();
    if (!token) return;
    const searchKey = `${context.classLabel}|${admission}`;
    const now = Date.now();
    if (moduleState.searchInFlight || (moduleState.lastSearchKey === searchKey && now - moduleState.lastSearchAt < 800)) return;

    moduleState.searchInFlight = true;
    moduleState.lastSearchKey = searchKey;
    moduleState.lastSearchAt = now;
    try {
      const response = await fetch(`${config.api.baseURL}/enrollments/class/${encodeURIComponent(context.classLabel)}/learner?admission=${encodeURIComponent(admission)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Learner not found in this class");
      const added = await moduleState.reloadStudents?.(data.student);
      if (added === false) return;
      input.value = "";
      updateSearchButtonVisibility();
      showMessage("Learner added to the marks table.", "success");
    } catch (error) {
      showMessage(error.message || "Learner search failed", "error");
    } finally {
      moduleState.searchInFlight = false;
    }
  };

  const renderModal = (context) => {
    closeModal();
    const modal = document.createElement("div");
    modal.id = "teacherCreateLearnerModal";
    modal.className = "teacher-learner-modal-backdrop";
    modal.innerHTML = `
      <section class="teacher-learner-modal" role="dialog" aria-modal="true" aria-labelledby="teacherCreateLearnerTitle">
        <div class="teacher-learner-modal-header">
          <div>
            <p class="teacher-learner-eyebrow">Add to marks roster</p>
            <h3 id="teacherCreateLearnerTitle">Create learner</h3>
            <p>${escapeHtml(context.classLabel)}</p>
          </div>
          <button type="button" class="teacher-learner-close" data-close-learner-modal aria-label="Close">&times;</button>
        </div>
        <form id="teacherCreateLearnerForm" class="teacher-learner-form">
          <div class="teacher-learner-form-grid">
            <label>Full name *<input name="name" class="learner-name-input" required autocomplete="name" maxlength="120" style="text-transform: uppercase;"></label>
            <label>Admission number *<input name="admission" required readonly maxlength="40" placeholder="Suggested number loading..."></label>
            <label>Gender
              <select name="gender">
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </label>
            <label>Date of birth<input name="dateOfBirth" type="date"></label>
            <label>Contact number<input name="contact" inputmode="tel" maxlength="25"></label>
            <label>Pathway
              <select name="pathway">
                <option value="">Not applicable</option>
                <option value="STEM">STEM</option>
                <option value="Social Sciences">Social Sciences</option>
                <option value="Arts & Sports Science">Arts & Sports Science</option>
              </select>
            </label>
          </div>
          <p class="teacher-learner-form-note">The learner will be enrolled in ${escapeHtml(context.classLabel)} for ${escapeHtml(context.year)} and added to this marks table.</p>
          <div class="teacher-learner-modal-actions">
            <button type="button" class="btn secondary-btn" data-close-learner-modal>Cancel</button>
            <button type="submit" class="btn accent-btn" id="saveTeacherLearnerBtn">Save learner</button>
          </div>
        </form>
      </section>`;

    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close-learner-modal]").forEach(button => button.addEventListener("click", closeModal));
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal();
    });

    modal.querySelector("input[name='name']")?.focus();
    modal.querySelector("input[name='name']")?.addEventListener("input", event => {
      event.target.value = event.target.value.toUpperCase();
    });
    const admissionInput = modal.querySelector("input[name='admission']");
    getNextAdmissionNumber().then(nextAdmission => {
      if (!admissionInput || admissionInput.value || !nextAdmission) return;
      admissionInput.value = nextAdmission;
      admissionInput.placeholder = "Admission number";
    });
    modal.querySelector("#teacherCreateLearnerForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const saveButton = modal.querySelector("#saveTeacherLearnerBtn");
      const token = getToken();
      if (!token) return;

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.name = String(payload.name || "").trim().toUpperCase();
      payload.academicYear = context.year;
      payload.term = context.term;

      saveButton.disabled = true;
      const originalButtonText = saveButton.textContent;
      saveButton.textContent = "Checking...";
      try {
        const nameCheckResponse = await fetch(`${config.api.baseURL}/enrollments/class/${encodeURIComponent(context.classLabel)}/learner/name-check?name=${encodeURIComponent(payload.name)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const nameCheckData = await nameCheckResponse.json().catch(() => ({}));
        if (!nameCheckResponse.ok) throw new Error(nameCheckData.message || "Could not check the learner name");

        if (Array.isArray(nameCheckData.matches) && nameCheckData.matches.length > 0) {
          const existingLearners = nameCheckData.matches
            .map(match => `${escapeHtml(match.name)} (${escapeHtml(match.admissionNo)})`)
            .join(", ");
          const confirmed = await window.cbcUtils?.showConfirmToast?.(
            `A learner with the name <strong>${escapeHtml(payload.name)}</strong> already exists in ${escapeHtml(context.classLabel)}: ${existingLearners}. Proceed anyway?`,
            { confirmText: "Proceed", cancelText: "Cancel" }
          );
          if (!confirmed) {
            saveButton.disabled = false;
            saveButton.textContent = originalButtonText;
            return;
          }
        }

        saveButton.textContent = "Saving...";
        const response = await fetch(`${config.api.baseURL}/enrollments/class/${encodeURIComponent(context.classLabel)}/learner`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.msg || "Failed to create learner");

        closeModal();
        showMessage("Learner created and added to the marks roster.", "success");
        document.dispatchEvent(new CustomEvent("teacher-notifications-updated"));
        await moduleState.reloadStudents?.(data.student);
      } catch (error) {
        showMessage(error.message || "Failed to create learner", "error");
        saveButton.disabled = false;
        saveButton.textContent = originalButtonText;
      }
    });
  };

  window.TeacherLearnerEnrollment = {
    init(options = {}) {
      if (moduleState.initialized) return;
      moduleState.initialized = true;
      moduleState.getContext = options.getContext;
      moduleState.reloadStudents = options.reloadStudents;
      moduleState.action = document.getElementById("createLearnerAction");
      moduleState.searchAction = document.getElementById("findLearnerAction");
      updateVisibility();

      const button = document.getElementById("createLearnerBtn");
      button?.addEventListener("click", () => {
        const context = moduleState.getContext?.();
        if (!context?.classLabel || !context.subject || !context.term || !context.year) {
          showMessage("Select a subject, assessment, term, and year first.", "error");
          return;
        }
        renderModal(context);
      });

      const admissionSearchInput = document.getElementById("findLearnerAdmission");
      const searchButton = document.getElementById("findLearnerBtn");
      const clearButton = document.getElementById("clearLearnerSearchBtn");
      admissionSearchInput?.addEventListener("input", updateSearchButtonVisibility);
      searchButton?.addEventListener("click", findLearner);
      clearButton?.addEventListener("click", () => {
        admissionSearchInput.value = "";
        updateSearchButtonVisibility();
        admissionSearchInput.focus();
      });
      admissionSearchInput?.addEventListener("change", findLearner);
      admissionSearchInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          findLearner();
        }
      });
    },
    updateVisibility
  };
})();
