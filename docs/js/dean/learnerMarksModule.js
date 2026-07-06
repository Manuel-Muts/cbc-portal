// docs/js/dean/learnerMarksModule.js

const LearnerMarksModule = (function() {
  let isInitialized = false;
  let lmGradeSelect;
  let lmTermSelect;
  let lmAssessmentSelect;
  let lmYearSelect;
  let lmSubjectSelect;
  let lmSearchInput;
  let lmSearchBtn;
  let lmSearchResults;
  let lmLearnerSummary;
  let lmMarkForm;
  let lmSubmitBtn;
  let lmStatusMessage;
  let selectedLearner = null;
  let currentExistingMark = null;

  const API_BASE = config.api.baseURL;
  let gradeOptions = []; // 🆕 Now dynamic, not const
  const assessmentMapping = window.ASSESSMENT_MAPPING || { 1: "Assessment 1", 2: "Assessment 2", 3: "Assessment 3" };

  // 🆕 Get grade options based on current school type
  function getGradeOptionsForSchool() {
    // Try to get school-specific grades first
    if (window.cbcUtils?.getGradeOptionsForSchool) {
      const schoolGrades = window.cbcUtils.getGradeOptionsForSchool();
      if (schoolGrades && Array.isArray(schoolGrades) && schoolGrades.length > 0) {
        return schoolGrades;
      }
    }

    // Fallback to default grades
    return [
      "PG", "PP1", "PP2",
      "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
      "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"
    ];
  }

  // 🆕 Watch for school type changes and update grades
  function watchSchoolTypeChanges() {
    // Initial load
    gradeOptions = getGradeOptionsForSchool();

    // Create a property watcher for schoolInfo changes
    const observer = setInterval(() => {
      const newGrades = getGradeOptionsForSchool();
      if (JSON.stringify(newGrades) !== JSON.stringify(gradeOptions)) {
        console.log("🔄 School type detected, updating grade options...");
        gradeOptions = newGrades;
        // Re-render if already initialized
        if (lmGradeSelect) {
          renderGradeOptions();
        }
      }
    }, 2000); // Check every 2 seconds

    // Store observer ID for cleanup if needed
    window.lmSchoolTypeObserver = observer;
  }

  function fetchWithAuth(url, options = {}) {
    const token = authService.getToken();
    if (!token) return authService.redirectToLogin();

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers
    };

    return fetch(url, { ...options, headers });
  }

  function getGradeBucket(grade) {
    const normalized = window.cbcUtils.normalizeGrade(grade);
    const num = window.cbcUtils.getGradeNum(grade);
    if (["PG", "PP1", "PP2"].includes(normalized)) return "PG-PP2";
    if (num >= 1 && num <= 3) return "1-3";
    if (num >= 4 && num <= 6) return "4-6";
    if (num >= 7 && num <= 9) return "7-9";
    if (num >= 10 && num <= 12) return "10-12";
    return "7-9";
  }

  function getSubjectOptionsForGrade(grade) {
    const bucket = getGradeBucket(grade);
    return window.SUBJECT_DATA?.gradeSubjects?.[bucket] || [];
  }

  function getSeniorPathwayForSubject(subject) {
    if (!window.SUBJECT_DATA?.getSeniorPathway) return "Core";
    const pathway = window.SUBJECT_DATA.getSeniorPathway(subject);
    return pathway || "Core";
  }

  function clearStatus() {
    if (lmStatusMessage) lmStatusMessage.textContent = "";
  }

  function setStatus(text, type = "info") {
    if (!lmStatusMessage) return;
    lmStatusMessage.textContent = text;
    lmStatusMessage.className = `lm-status lm-status-${type}`;
  }

  function renderGradeOptions() {
    if (!lmGradeSelect) return;
    lmGradeSelect.innerHTML = `<option value="">-- Select Grade --</option>` + gradeOptions
      .map(grade => `<option value="${grade}">${grade}</option>`)
      .join('');
  }

  function renderTermAssessmentYear() {
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentTerm = currentMonth <= 4 ? "1" : currentMonth <= 8 ? "2" : "3";

    if (lmTermSelect) {
      lmTermSelect.innerHTML = `
        <option value="">-- Select Term --</option>
        <option value="1" ${currentTerm === "1" ? 'selected' : ''}>Term 1</option>
        <option value="2" ${currentTerm === "2" ? 'selected' : ''}>Term 2</option>
        <option value="3" ${currentTerm === "3" ? 'selected' : ''}>Term 3</option>
      `;
    }

    if (lmAssessmentSelect) {
      lmAssessmentSelect.innerHTML = `<option value="">-- Select Assessment --</option>` +
        Object.entries(assessmentMapping)
          .map(([value, label]) => `<option value="${value}">${label}</option>`)
          .join('');
    }

    if (lmYearSelect) {
      const currentYear = new Date().getFullYear();
      lmYearSelect.innerHTML = `<option value="">-- Select Year --</option>` +
        Array.from({ length: 6 }, (_, index) => currentYear - 2 + index)
          .map(year => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`)
          .join('');
    }
  }

  // 🆕 Toggle subject select visibility
  function toggleSubjectSelect(show = true) {
    if (!lmSubjectSelect) return;
    const container = lmSubjectSelect.closest('.form-group') || lmSubjectSelect.parentElement;
    if (container) {
      container.style.display = show ? 'block' : 'none';
    } else {
      lmSubjectSelect.style.display = show ? 'block' : 'none';
    }
  }

  function updateSubjects() {
    const grade = lmGradeSelect?.value;
    if (!lmSubjectSelect) return;
    if (!grade) {
      lmSubjectSelect.innerHTML = `<option value="">Select grade first</option>`;
      return;
    }

    const subjects = getSubjectOptionsForGrade(grade);
    lmSubjectSelect.innerHTML = `<option value="">-- Select Subject --</option>` +
      subjects.map(subject => `<option value="${subject}">${subject}</option>`).join('');
    if (subjects.length === 0) {
      lmSubjectSelect.innerHTML = `<option value="">No subjects available</option>`;
    }
  }

  async function searchLearners() {
    clearStatus();
    const grade = lmGradeSelect.value;
    const term = lmTermSelect.value;
    const assessment = lmAssessmentSelect.value;
    const year = lmYearSelect.value;
    const search = lmSearchInput.value.trim();

    if (!grade) return setStatus("Select grade before searching for a learner.", "error");
    if (!search) return setStatus("Search by admission number or name.", "error");

    lmSearchResults.innerHTML = `<div class="loader">Searching learners...</div>`;
    try {
      const params = new URLSearchParams({ grade, search, limit: 20, page: 1 });
      const res = await fetchWithAuth(`${API_BASE}/learners?${params}`);
      if (!res.ok) throw new Error("Unable to fetch learners.");
      const data = await res.json();
      let learners = data?.data || [];

      // 🆕 Smart filtering: exact match for numeric admission, substring for names
      const isNumericSearch = /^\d+$/.test(search); // Check if search is all digits
      if (learners.length > 0 && isNumericSearch) {
        // For numeric searches, filter to exact admission matches only
        learners = learners.filter(student => 
          (student.admission || student.admissionNo || "").toString() === search
        );
      }

      if (!learners.length) {
        lmSearchResults.innerHTML = `<div class="empty-state">No learner found with that name or admission in ${grade}.</div>`;
        return;
      }

      lmSearchResults.innerHTML = learners.map(student => `
        <button type="button" class="lm-learner-card" data-admission="${student.admission || student.admissionNo}" data-grade="${student.grade}" data-stream="${student.stream || ''}" data-name="${student.name}">
          <div><strong>${student.name}</strong></div>
          <div>Admission: ${student.admission || student.admissionNo}</div>
          <div>Grade: ${student.grade}${student.stream ? ` • Stream: ${student.stream}` : ''}</div>
        </button>
      `).join('');
    } catch (err) {
      console.error(err);
      lmSearchResults.innerHTML = `<div class="empty-state">Search failed. Try again.</div>`;
      setStatus(err.message, "error");
    }
  }

  async function loadExistingMark() {
    currentExistingMark = null;
    if (!selectedLearner) return;
    const grade = lmGradeSelect.value;
    const term = lmTermSelect.value;
    const assessment = lmAssessmentSelect.value;
    const year = lmYearSelect.value;
    const subject = lmSubjectSelect.value;

    if (!grade || !term || !assessment || !year || !subject) {
      renderMarkForm();
      return;
    }

    try {
      setStatus("Checking for existing mark...", "info");
      const params = new URLSearchParams({
        grade,
        term,
        year,
        assessment,
        admissionNos: selectedLearner.admission,
      });
      if (window.cbcUtils.isSeniorGrade(grade)) {
        params.append('course', subject);
      } else {
        params.append('subject', subject);
      }

      const res = await fetchWithAuth(`${API_BASE}/marks/by-grade-and-students?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Could not verify existing marks.");
      }
      const data = await res.json();
      currentExistingMark = Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error(err);
      setStatus(err.message, "error");
    } finally {
      renderMarkForm();
    }
  }

  function renderLearnerCard() {
    if (!lmLearnerSummary) return;
    if (!selectedLearner) {
     
      return;
    }

    lmLearnerSummary.innerHTML = `
      <div class="lm-learner-summary-card">
        <div><strong>${selectedLearner.name}</strong></div>
        <div>Admission: ${selectedLearner.admission}</div>
        <div>Grade: ${selectedLearner.grade}${selectedLearner.stream ? ` • Stream: ${selectedLearner.stream}` : ''}</div>
        <div>${selectedLearner.electives ? `Pathway: ${selectedLearner.pathway || 'Not set'}` : ''}</div>
      </div>
    `;
  }

  function renderMarkForm() {
    if (!lmMarkForm) return;
    if (!selectedLearner) {
      lmMarkForm.innerHTML = `<div class="empty-state">Select a learner to show the mark entry form.</div>`;
      return;
    }

    const grade = lmGradeSelect.value;
    const isSenior = window.cbcUtils.isSeniorGrade(grade);
    const subject = lmSubjectSelect.value;
    const hasExisting = !!currentExistingMark;

    let message = `<div class="lm-form-note">`;
    if (!subject) {
      message += `Select a subject first to continue.`;
    } else if (!lmTermSelect.value || !lmAssessmentSelect.value || !lmYearSelect.value) {
      message += `Fill term, assessment and year before submitting.`;
    } else if (hasExisting) {
      message += `A mark already exists for this learner in the chosen context. Dean submission is only available when the mark is missing.`;
    } else {
      message += `No matching mark was found. You can submit a new learner mark for this subject.`;
    }
    message += `</div>`;

    if (isSenior) {
      const existingSeniorScore = currentExistingMark?.score ?? currentExistingMark?.finalScore ?? window.cbcUtils.calculateFinalScore(
        currentExistingMark?.continuousAssessment ?? "",
        currentExistingMark?.projectWork ?? "",
        currentExistingMark?.endTermExam ?? ""
      ) ?? "";

      lmMarkForm.innerHTML = `
        ${message}
        <div class="lm-mark-grid lm-mark-grid-single">
          <label>Score (%) or X</label>
          <input type="text" id="lmScoreInput" value="${existingSeniorScore}" placeholder="0-100 or X" ${hasExisting ? 'disabled' : ''} />
        </div>
      `;
    } else {
      const existingScore = currentExistingMark?.score ?? "";
      lmMarkForm.innerHTML = `
        ${message}
        <div class="lm-mark-grid lm-mark-grid-single">
          <label>Score (%) or X</label>
          <input type="text" id="lmScoreInput" value="${existingScore}" placeholder="0-100 or X" ${hasExisting ? 'disabled' : ''} />
        </div>
      `;
    }

    if (lmSubmitBtn) {
      lmSubmitBtn.disabled = !subject || !lmTermSelect.value || !lmAssessmentSelect.value || !lmYearSelect.value || hasExisting || !selectedLearner;
      lmSubmitBtn.textContent = hasExisting ? "Existing mark detected" : "Submit Learner Mark";
    }
  }

  function sanitizeInput(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toUpperCase();
  }

  function validateScoreValue(value) {
    const normalized = sanitizeInput(value);
    if (normalized === "X") return "X";
    if (normalized === "") return null;
    if (!/^[0-9]{1,3}$/.test(normalized)) return null;
    const number = Number(normalized);
    return number >= 0 && number <= 100 ? number : null;
  }

  function buildPayload() {
    const grade = lmGradeSelect.value;
    const term = Number(lmTermSelect.value);
    const assessment = Number(lmAssessmentSelect.value);
    const year = Number(lmYearSelect.value);
    const subject = lmSubjectSelect.value;
    const admissionNo = selectedLearner.admission;
    const studentName = selectedLearner.name;
    const stream = selectedLearner.stream || null;

    const payload = {
      admissionNo,
      studentName,
      grade,
      stream,
      term,
      year,
      assessment,
      teacherId: undefined
    };

    if (window.cbcUtils.isSeniorGrade(grade)) {
      const course = subject;
      const pathway = getSeniorPathwayForSubject(course);
      const score = validateScoreValue(document.getElementById("lmScoreInput")?.value);
      if (score === null) {
        throw new Error("Enter a valid senior score or X.");
      }

      payload.pathway = pathway;
      payload.course = course;
      payload.subject = null;
      payload.score = score;
      payload.continuousAssessment = null;
      payload.projectWork = null;
      payload.endTermExam = null;
    } else {
      const score = validateScoreValue(document.getElementById("lmScoreInput")?.value);
      if (score === null) {
        throw new Error("Enter a valid junior score or X.");
      }
      payload.subject = subject;
      payload.pathway = null;
      payload.course = null;
      payload.score = score;
    }

    return payload;
  }

  async function submitLearnerMark() {
    clearStatus();
    if (!selectedLearner) return setStatus("Select a learner first.", "error");
    if (currentExistingMark) return setStatus("A mark already exists for this context.", "error");

    try {
      const payload = buildPayload();
      lmSubmitBtn.disabled = true;
      lmSubmitBtn.innerHTML = "Submitting...";

      const res = await fetchWithAuth(`${API_BASE}/marks/add`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit mark.");
      }

      const data = await res.json();
      setStatus(`Mark submitted successfully for ${selectedLearner.name}.`, "success");
      currentExistingMark = data.mark || null;
      renderMarkForm();
    } catch (err) {
      console.error(err);
      setStatus(err.message, "error");
    } finally {
      lmSubmitBtn.disabled = false;
      lmSubmitBtn.textContent = currentExistingMark ? "Existing mark detected" : "Submit Learner Mark";
    }
  }

  function renderControls() {
    if (!lmSearchResults || !lmGradeSelect) return;
    lmSearchResults.addEventListener("click", async (event) => {
      const button = event.target.closest(".lm-learner-card");
      if (!button) return;
      selectedLearner = {
        admission: button.dataset.admission,
        grade: button.dataset.grade,
        stream: button.dataset.stream,
        name: button.dataset.name
      };
      lmGradeSelect.value = selectedLearner.grade;
      updateSubjects();
      renderLearnerCard();
      // 🆕 Show subject select when learner is selected
      toggleSubjectSelect(true);
      await loadExistingMark();
    });
  }

  function init() {
    if (isInitialized) return;
    lmGradeSelect = document.getElementById("lmGradeSelect");
    lmTermSelect = document.getElementById("lmTermSelect");
    lmAssessmentSelect = document.getElementById("lmAssessmentSelect");
    lmYearSelect = document.getElementById("lmYearSelect");
    lmSubjectSelect = document.getElementById("lmSubjectSelect");
    lmSearchInput = document.getElementById("lmSearchInput");
    lmSearchBtn = document.getElementById("lmSearchBtn");
    lmSearchResults = document.getElementById("lmSearchResults");
    lmLearnerSummary = document.getElementById("lmLearnerSummary");
    lmMarkForm = document.getElementById("lmMarkForm");
    lmSubmitBtn = document.getElementById("lmSubmitBtn");
    lmStatusMessage = document.getElementById("lmStatusMessage");

    if (!lmGradeSelect || !lmTermSelect || !lmAssessmentSelect || !lmYearSelect ||
        !lmSubjectSelect || !lmSearchInput || !lmSearchBtn || !lmSearchResults ||
        !lmLearnerSummary || !lmMarkForm || !lmSubmitBtn || !lmStatusMessage) {
      console.warn("LearnerMarksModule: missing required DOM elements.");
      return;
    }

    // 🆕 Start watching for school type changes
    watchSchoolTypeChanges();

    renderGradeOptions();
    renderTermAssessmentYear();
    updateSubjects();
    // 🆕 Initially hide subject select until a learner is searched and selected
    toggleSubjectSelect(false);
    renderLearnerCard();
    renderMarkForm();
    clearStatus();

    lmGradeSelect.addEventListener("change", () => {
      updateSubjects();
      if (selectedLearner) {
        selectedLearner.grade = lmGradeSelect.value;
        renderLearnerCard();
        // 🆕 Keep subject select visible when grade changes after learner is selected
        toggleSubjectSelect(true);
        loadExistingMark();
      }
    });
    lmSubjectSelect.addEventListener("change", loadExistingMark);
    lmTermSelect.addEventListener("change", loadExistingMark);
    lmAssessmentSelect.addEventListener("change", loadExistingMark);
    lmYearSelect.addEventListener("change", loadExistingMark);

    lmSearchBtn.addEventListener("click", searchLearners);
    lmSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchLearners();
      }
    });
    // 🆕 Hide subject select when search input is cleared
    lmSearchInput.addEventListener("input", (event) => {
      if (!event.target.value.trim()) {
        selectedLearner = null;
        toggleSubjectSelect(false);
        renderLearnerCard();
      }
    });
    lmSubmitBtn.addEventListener("click", submitLearnerMark);

    renderControls();
    isInitialized = true;
    console.log("📌 LearnerMarksModule initialized.");
  }

  return {
    init
  };
})();

window.LearnerMarksModule = LearnerMarksModule;
