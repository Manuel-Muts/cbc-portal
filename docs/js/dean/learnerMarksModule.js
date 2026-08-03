// docs/js/dean/learnerMarksModule.js

const LearnerMarksModule = (function() {
  let isInitialized = false;
  let lmGradeSelect;
  let lmTermSelect;
  let lmAssessmentSelect;
  let lmYearSelect;
  let lmSearchInput;
  let lmSearchBtn;
  let lmSearchResults;
  let lmLearnerSummary;
  let lmMarkForm;
  let lmSubmitBtn;
  let lmStatusMessage;
  let lmMarkModal;
  let lmMarkModalTitle;
  let lmMarkModalContent;
  let lmMarkModalInput;
  let lmMarkModalSaveBtn;
  let selectedLearner = null;
  let selectedSubjectName = null;
  let currentExistingMark = null;
  let learnerContextMarks = [];
  let classmateContextMarks = [];
  let lmSubjectsTableWrap;

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

  function getClassSubjectOptions() {
    if (!selectedLearner || !classmateContextMarks.length) return [];
    const isSenior = window.cbcUtils.isSeniorGrade(selectedLearner.grade);
    const seen = new Set();
    const subjects = [];

    classmateContextMarks.forEach((mark) => {
      const raw = isSenior ? mark.course : mark.subject;
      const key = normalizeLearnerKey(raw);
      if (!key || seen.has(key)) return;
      seen.add(key);
      subjects.push(raw);
    });

    return subjects;
  }

  function createMarkModal() {
    if (document.getElementById('lmMarkModal')) return;

    const modal = document.createElement('div');
    modal.id = 'lmMarkModal';
    modal.className = 'lm-modal hidden';
    modal.innerHTML = `
      <div class="lm-modal-backdrop"></div>
      <div class="lm-modal-card">
        <div class="lm-modal-header">
          <h3 id="lmMarkModalTitle">Enter learner mark</h3>
          <button type="button" id="lmMarkModalCloseBtn" class="lm-modal-close-btn">×</button>
        </div>
        <div id="lmMarkModalContent" class="lm-modal-content"></div>
        <div class="lm-modal-actions">
          <button type="button" id="lmMarkModalCancelBtn" class="btn secondary-btn">Cancel</button>
          <button type="button" id="lmMarkModalSaveBtn" class="btn primary-btn">Save Mark</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .lm-modal {position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,0.7); z-index: 9999; padding: 18px;}
      .lm-modal.hidden {display: none;}
      .lm-modal-card {width: min(540px,100%); background: #fff; border-radius: 18px; padding: 22px; box-shadow: 0 30px 80px rgba(15,23,42,0.16); position: relative;}
      .lm-modal-header {display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px;}
      .lm-modal-header h3 {margin: 0; font-size: 1.05rem; color: #0f172a;}
      .lm-modal-close-btn {border: none; background: transparent; font-size: 1.75rem; line-height: 1; cursor: pointer; color: #334155;}
      .lm-modal-content {display: grid; gap: 14px;}
      .lm-modal-actions {display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;}
      .lm-modal-row {display: grid; gap: 8px;}
      .lm-modal-row label {font-size: 0.95rem; color: #1f2937; font-weight: 700;}
      .lm-modal-row input {width: 100%; padding: 12px 14px; border: 1px solid #cbd5e0; border-radius: 10px; font-size: 1rem; color: #0f172a;}
      .lm-modal-note {font-size: 0.94rem; color: #475569; line-height: 1.5;}
      .lm-button-spinner {display: inline-flex; align-items: center; justify-content: center; gap: 8px;}
      .lm-button-spinner .lm-spinner {width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.35); border-top-color: currentColor; border-radius: 50%; animation: lm-spin 0.8s linear infinite;}
      @keyframes lm-spin {to {transform: rotate(360deg);}}
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    lmMarkModal = modal;
    lmMarkModalTitle = modal.querySelector('#lmMarkModalTitle');
    lmMarkModalContent = modal.querySelector('#lmMarkModalContent');
    lmMarkModalInput = document.createElement('input');
    lmMarkModalInput.type = 'text';
    lmMarkModalInput.id = 'lmMarkModalInput';
    lmMarkModalInput.inputMode = 'numeric';
    lmMarkModalInput.pattern = '[0-9Xx]*';
    lmMarkModalInput.placeholder = '0-100 or X';
    lmMarkModalInput.setAttribute('maxlength', '3');
    lmMarkModalInput.style.width = '100%';
    lmMarkModalInput.style.padding = '12px 14px';
    lmMarkModalInput.style.border = '1px solid #cbd5e0';
    lmMarkModalInput.style.borderRadius = '10px';
    lmMarkModalInput.style.fontSize = '1rem';
    lmMarkModalInput.addEventListener('input', () => {
      const rawValue = lmMarkModalInput.value;
      const sanitized = sanitizeInput(rawValue);

      if (sanitized === '' || sanitized === 'X') {
        lmMarkModalInput.value = sanitized || '';
        return;
      }

      const digitsOnly = sanitized.replace(/[^0-9]/g, '');
      if (digitsOnly !== sanitized) {
        lmMarkModalInput.value = digitsOnly.slice(0, 3);
        return;
      }

      if (/^[0-9]{1,3}$/.test(sanitized)) {
        const numericValue = Number(sanitized);
        lmMarkModalInput.value = numericValue > 100 ? '100' : sanitized;
      } else {
        lmMarkModalInput.value = '';
      }
    });

    lmMarkModalSaveBtn = modal.querySelector('#lmMarkModalSaveBtn');
    const closeBtn = modal.querySelector('#lmMarkModalCloseBtn');
    const cancelBtn = modal.querySelector('#lmMarkModalCancelBtn');

    closeBtn.addEventListener('click', hideMarkModal);
    cancelBtn.addEventListener('click', hideMarkModal);
    modal.querySelector('.lm-modal-backdrop').addEventListener('click', hideMarkModal);
    lmMarkModalSaveBtn.addEventListener('click', async () => {
      await submitLearnerMark();
    });
  }

  function showMarkModal() {
    if (!lmMarkModal) return;
    lmMarkModal.classList.remove('hidden');
    lmMarkModalInput.focus();
  }

  function hideMarkModal() {
    if (!lmMarkModal) return;
    lmMarkModal.classList.add('hidden');
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent.trim();
      button.disabled = true;
      button.style.cursor = 'wait';
      button.innerHTML = `<span class="lm-button-spinner"><span class="lm-spinner"></span>${loadingText}</span>`;
      return;
    }

    button.disabled = false;
    button.style.cursor = '';
    const originalText = button.dataset.originalText || button.textContent.trim();
    button.innerHTML = originalText;
    delete button.dataset.originalText;
  }

  async function openMarkModal(subject, triggerButton = null) {
    if (!selectedLearner) return;
    selectedSubjectName = subject;
    if (triggerButton) {
      setButtonLoading(triggerButton, true, 'Opening...');
    }

    try {
      await loadExistingMark(subject);

      const action = currentExistingMark ? 'Edit' : 'Add';
      if (lmMarkModalTitle) {
        lmMarkModalTitle.textContent = `${action} mark for ${subject}`;
      }
      if (lmMarkModalContent) {
        lmMarkModalContent.innerHTML = `
          <div class="lm-modal-row">
            <label>Student</label>
            <div style="font-weight:700; color:#0f172a;">${selectedLearner.name} (${selectedLearner.admission})</div>
          </div>
          <div class="lm-modal-row">
            <label>Subject / Course</label>
            <div style="font-weight:700; color:#0f172a;">${subject}</div>
          </div>
          <div class="lm-modal-row">
            <label>Term / Year</label>
            <div style="color:#475569;">Term ${lmTermSelect.value}, ${lmYearSelect.value}</div>
          </div>
        `;
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'lm-modal-row';
        inputWrapper.innerHTML = `<label for="lmMarkModalInput">Score (%) or X</label>`;
        inputWrapper.appendChild(lmMarkModalInput);
        lmMarkModalContent.appendChild(inputWrapper);
      }

      const existingScore = currentExistingMark?.score ?? currentExistingMark?.finalScore ?? '';
      const currentScore = existingScore !== null && existingScore !== undefined ? existingScore : '';
      if (lmMarkModalInput) {
        lmMarkModalInput.value = currentScore;
      }
      if (lmMarkModalSaveBtn) {
        lmMarkModalSaveBtn.textContent = currentExistingMark ? 'Save changes' : 'Save mark';
        lmMarkModalSaveBtn.disabled = false;
      }
      showMarkModal();
    } finally {
      if (triggerButton) {
        setButtonLoading(triggerButton, false, currentExistingMark ? 'Edit' : 'Add');
      }
    }
  }

  function clearStatus() {
    if (lmStatusMessage) lmStatusMessage.textContent = "";
  }

  function setStatus(text, type = "info") {
    if (!lmStatusMessage) return;
    lmStatusMessage.textContent = text;
    lmStatusMessage.className = `lm-status lm-status-${type}`;
  }

  function normalizeLearnerKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getMarkKey(mark) {
    if (!mark) return "";
    return normalizeLearnerKey(window.cbcUtils.isSeniorGrade(mark.grade) ? mark.course : mark.subject);
  }

  function getSelectedSubjectKey() {
    return normalizeLearnerKey(selectedSubjectName || "");
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

  function updateSubjects() {
    return;
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

    if (lmSearchBtn) {
      setButtonLoading(lmSearchBtn, true, 'Searching...');
    }
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
    } finally {
      if (lmSearchBtn) {
        setButtonLoading(lmSearchBtn, false, 'Search');
      }
    }
  }

  async function loadStudentMarkContext() {
    learnerContextMarks = [];
    classmateContextMarks = [];
    if (!selectedLearner) return;

    const grade = lmGradeSelect.value;
    const term = lmTermSelect.value;
    const assessment = lmAssessmentSelect.value;
    const year = lmYearSelect.value;

    if (!grade || !term || !assessment || !year) {
      renderLearnerSubjectTable();
      return;
    }

    try {
      setStatus("Loading class context marks for selected learner...", "info");
      const params = new URLSearchParams({
        grade,
        term,
        year,
        assessment,
        admissionNos: selectedLearner.admission,
        classContext: "true"
      });
      if (selectedLearner.stream) {
        params.set("stream", selectedLearner.stream);
      }

      const res = await fetchWithAuth(`${API_BASE}/marks/by-grade-and-students?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Could not load learner marks.");
      }
      const data = await res.json();
      const marks = Array.isArray(data) ? data : [];
      learnerContextMarks = marks.filter((mark) => String(mark.admissionNo) === String(selectedLearner.admission));
      classmateContextMarks = marks.filter((mark) => String(mark.admissionNo) !== String(selectedLearner.admission));
      updateSubjects();
    } catch (err) {
      console.error(err);
      setStatus(err.message, "error");
    } finally {
      renderLearnerSubjectTable();
    }
  }

  async function loadExistingMark(subjectOverride) {
    currentExistingMark = null;
    if (!selectedLearner) return;
    const grade = lmGradeSelect.value;
    const term = lmTermSelect.value;
    const assessment = lmAssessmentSelect.value;
    const year = lmYearSelect.value;
    const subject = subjectOverride || selectedSubjectName;

    if (!grade || !term || !assessment || !year) {
      renderMarkForm();
      return;
    }

    try {
      setStatus("Loading class context and checking marks...", "info");
      await loadStudentMarkContext();

      if (subject) {
        const currentKey = normalizeLearnerKey(subject);
        currentExistingMark = learnerContextMarks.find((mark) => getMarkKey(mark) === currentKey) || null;
      }
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
      lmLearnerSummary.innerHTML = "";
      renderLearnerSubjectTable();
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
    renderLearnerSubjectTable();
  }

  function renderMarkForm() {
    if (!lmMarkForm) return;
    if (!selectedLearner) {
      lmMarkForm.innerHTML = "";
      if (lmSubmitBtn) lmSubmitBtn.style.display = 'none';
      return;
    }

    lmMarkForm.innerHTML = `
      <div class="lm-form-note">
        Use the subject list above and click Add / Edit to open the mark modal. Save changes there to persist marks to the database.
      </div>
    `;

    if (lmSubmitBtn) {
      lmSubmitBtn.style.display = 'none';
    }
  }

  function sanitizeInput(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().toUpperCase();
  }

  function getSuggestedSeniorSubjects(grade) {
    const seniorSubjects = window.SUBJECT_DATA?.gradeSubjects?.["10-12"] || [];
    const pathwaySubjects = selectedLearner?.pathway && window.SUBJECT_DATA?.seniorSchoolPathways?.[selectedLearner.pathway]
      ? window.SUBJECT_DATA.seniorSchoolPathways[selectedLearner.pathway]
      : [];
    const compSubjects = window.SUBJECT_DATA?.seniorCompulsorySubjects || [];
    return Array.from(new Set([...compSubjects, ...pathwaySubjects, ...seniorSubjects]));
  }

  function renderLearnerSubjectTable() {
    if (!lmSubjectsTableWrap) return;

    if (!selectedLearner) {
      lmSubjectsTableWrap.innerHTML = "";
      return;
    }

    const grade = lmGradeSelect.value;
    const term = lmTermSelect.value;
    const assessment = lmAssessmentSelect.value;
    const year = lmYearSelect.value;

    if (!grade || !term || !assessment || !year) {
      lmSubjectsTableWrap.innerHTML = `<div class="empty-state" style="padding:18px; border-radius:12px; background:#f8fafc; color:#475569;">Select grade, term, assessment and year to view class subject entries for this learner.</div>`;
      return;
    }

    const isSenior = window.cbcUtils.isSeniorGrade(grade);
    const classSubjects = getClassSubjectOptions();
    let subjects = classSubjects.length > 0 ? classSubjects :
      (isSenior ? getSuggestedSeniorSubjects(grade) : getSubjectOptionsForGrade(grade));

    if (!subjects || subjects.length === 0) {
      lmSubjectsTableWrap.innerHTML = `<div class="empty-state" style="padding:18px; border-radius:12px; background:#f8fafc; color:#475569;">No class subject submissions were found for ${grade}${selectedLearner.stream ? ` ${selectedLearner.stream}` : ''}. Use the subject selector to add a missing mark.</div>`;
      return;
    }

    const existingMap = new Map();
    learnerContextMarks.forEach((mark) => {
      const key = getMarkKey(mark);
      if (key) existingMap.set(key, mark);
    });

    const selectedKey = getSelectedSubjectKey();
    const rows = subjects.map((subject) => {
      const key = normalizeLearnerKey(subject);
      const existingMark = existingMap.get(key);
      const scoreValue = existingMark ?
        (existingMark.score !== null ? existingMark.score : (existingMark.finalScore ?? "X")) : "-";
      const status = existingMark ? "Submitted" : "Missing";
      const actionText = existingMark ? "Edit" : "Add";
      const isSelected = selectedKey === key;

      return `
        <tr class="lm-subject-row" style="background:${isSelected ? '#eef6ff' : '#fff'}; border-bottom:1px solid #e2e8f0;">
          <td style="padding: 12px 10px;">${subject}</td>
          <td style="padding: 12px 10px; text-align:center;">${scoreValue}</td>
          <td style="padding: 12px 10px; text-align:center; color:${existingMark ? '#16a34a' : '#c2410c'}; font-weight:700;">${status}</td>
          <td style="padding: 12px 10px; text-align:center;">
            <button type="button" class="lm-subject-action btn secondary-btn" data-subject="${subject}">${actionText}</button>
          </td>
        </tr>
      `;
    }).join("");

    lmSubjectsTableWrap.innerHTML = `
      <div style="margin-top:20px; background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px;">
          <div>
            <h4 style="margin:0; color:#0f172a;">Learner subject marks</h4>
            <p style="margin:6px 0 0; color:#475569; font-size:0.95rem;">Click a subject to enter or update the learner's mark for the selected academic term.</p>
          </div>
          <div style="font-size:0.9rem; color:#64748b; font-weight:600;">${learnerContextMarks.length} existing mark${learnerContextMarks.length === 1 ? '' : 's'}</div>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%; border-collapse:collapse; min-width:660px;">
            <thead>
              <tr style="background:#f1f5f9; color:#0f172a; text-align:left; font-size:0.9rem;">
                <th style="padding:12px 10px;">Subject / Course</th>
                <th style="padding:12px 10px; text-align:center;">Current Score</th>
                <th style="padding:12px 10px; text-align:center;">Status</th>
                <th style="padding:12px 10px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
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
    const subject = selectedSubjectName;
    const admissionNo = selectedLearner.admission;
    const studentName = selectedLearner.name;
    const stream = selectedLearner.stream || null;

    const payload = {
      grade,
      stream,
      term,
      year,
      assessment,
      admissionNo,
      studentName,
      teacherId: undefined
    };

    const score = validateScoreValue(lmMarkModalInput?.value);
    if (score === null) {
      throw new Error("Enter a valid score or X.");
    }

    if (window.cbcUtils.isSeniorGrade(grade)) {
      const course = subject;
      const pathway = getSeniorPathwayForSubject(course);
      payload.pathway = pathway;
      payload.course = course;
      payload.subject = null;
      payload.score = score;
      payload.continuousAssessment = null;
      payload.projectWork = null;
      payload.endTermExam = null;
    } else {
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

    const isEditingExisting = Boolean(currentExistingMark);

    try {
      const payload = buildPayload();
      if (currentExistingMark) {
        payload._id = currentExistingMark._id;
      }

      if (lmMarkModalSaveBtn) {
        setButtonLoading(lmMarkModalSaveBtn, true, "Saving...");
      }

      const endpoint = currentExistingMark ? `${API_BASE}/marks/${currentExistingMark._id}` : `${API_BASE}/marks/add`;
      const method = currentExistingMark ? "PUT" : "POST";

      const res = await fetchWithAuth(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit mark.");
      }

      const data = await res.json();
      setStatus(currentExistingMark ? `Mark updated successfully for ${selectedLearner.name}.` : `Mark submitted successfully for ${selectedLearner.name}.`, "success");
      currentExistingMark = data.mark || currentExistingMark;
      await loadStudentMarkContext();
      renderLearnerSubjectTable();
      renderMarkForm();
      hideMarkModal();
    } catch (err) {
      console.error(err);
      setStatus(err.message, "error");
    } finally {
      if (lmMarkModalSaveBtn) {
        setButtonLoading(lmMarkModalSaveBtn, false, isEditingExisting ? "Save changes" : "Save mark");
      }
    }
  }

  function renderControls() {
    if (!lmSearchResults || !lmGradeSelect) return;
    lmSearchResults.addEventListener("click", async (event) => {
      const button = event.target.closest(".lm-learner-card");
      if (!button) return;
      setButtonLoading(button, true, 'Loading...');
      selectedLearner = {
        admission: button.dataset.admission,
        grade: button.dataset.grade,
        stream: button.dataset.stream,
        name: button.dataset.name
      };
      lmGradeSelect.value = selectedLearner.grade;
      updateSubjects();
      renderLearnerCard();
      try {
        await loadExistingMark();
      } finally {
        setButtonLoading(button, false, 'Select');
      }
    });
  }

  function init() {
    if (isInitialized) return;
    lmGradeSelect = document.getElementById("lmGradeSelect");
    lmTermSelect = document.getElementById("lmTermSelect");
    lmAssessmentSelect = document.getElementById("lmAssessmentSelect");
    lmYearSelect = document.getElementById("lmYearSelect");
    lmSearchInput = document.getElementById("lmSearchInput");
    lmSearchBtn = document.getElementById("lmSearchBtn");
    lmSearchResults = document.getElementById("lmSearchResults");
    lmLearnerSummary = document.getElementById("lmLearnerSummary");
    lmSubjectsTableWrap = document.getElementById("lmSubjectsTableWrap");
    lmMarkForm = document.getElementById("lmMarkForm");
    lmSubmitBtn = document.getElementById("lmSubmitBtn");
    lmStatusMessage = document.getElementById("lmStatusMessage");

    if (!lmGradeSelect || !lmTermSelect || !lmAssessmentSelect || !lmYearSelect ||
        !lmSearchInput || !lmSearchBtn || !lmSearchResults ||
        !lmLearnerSummary || !lmSubjectsTableWrap || !lmMarkForm || !lmSubmitBtn || !lmStatusMessage) {
      console.warn("LearnerMarksModule: missing required DOM elements.");
      return;
    }

    // 🆕 Start watching for school type changes
    watchSchoolTypeChanges();

    renderGradeOptions();
    renderTermAssessmentYear();
    updateSubjects();
    renderLearnerCard();
    renderMarkForm();
    createMarkModal();
    clearStatus();

    lmGradeSelect.addEventListener("change", () => {
      updateSubjects();
      if (selectedLearner) {
        selectedLearner.grade = lmGradeSelect.value;
        renderLearnerCard();
        loadExistingMark();
      }
    });
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
    // 🆕 Enable subject table clicks for faster context selection
    if (lmSubjectsTableWrap) {
      lmSubjectsTableWrap.addEventListener("click", async (event) => {
        const button = event.target.closest(".lm-subject-action");
        if (!button) return;
        const subject = button.dataset.subject;
        if (!subject) return;
        await openMarkModal(subject, button);
      });
    }
    // 🆕 Hide subject select when search input is cleared
    lmSearchInput.addEventListener("input", (event) => {
      if (!event.target.value.trim()) {
        selectedLearner = null;
        selectedSubjectName = null;
        renderLearnerCard();
      }
    });
    lmSubmitBtn.addEventListener("click", submitLearnerMark);
    lmSubmitBtn.style.display = 'none';

    renderControls();
    isInitialized = true;
    console.log("📌 LearnerMarksModule initialized.");
  }

  return {
    init
  };
})();

window.LearnerMarksModule = LearnerMarksModule;
