import {
  escapePlanningHtml,
  downloadPlanningRecordPdf,
  ensurePlanningPdfAccess,
  generateLessonDraftsFromScheme,
  initializeActiveTermSelect,
  initializeCurriculumFields,
  initializeTeacherAllocationFields,
  generatePlanningDraft,
  renderPlanningTableState,
  requestPlanningApi
} from './planning-api.js';

const root = document.getElementById('lessonPlansModule');
if (root) {
  root.innerHTML = `
    <div class="teacher-planning-header">
      <div><p class="teacher-planning-eyebrow">DAILY TEACHING</p><h2>📝 Lesson Plans</h2><p>Turn a weekly scheme into clear, teachable lessons.</p></div>
    </div>
    <div class="teacher-planning-tabs" role="tablist" aria-label="Lesson plans">
      <button class="teacher-planning-tab active" id="lessonCreateTab" type="button" role="tab" aria-selected="true" aria-controls="lessonCreatePanel">Create lesson plan</button>
      <button class="teacher-planning-tab" id="lessonSavedTab" type="button" role="tab" aria-selected="false" aria-controls="lessonSavedPanel">Saved lesson plans</button>
    </div>
    <section class="teacher-planning-panel" id="lessonCreatePanel" role="tabpanel" aria-labelledby="lessonCreateTab">
      <form class="teacher-planning-form" data-lesson-form>
        <input type="hidden" name="recordId">
        <input type="hidden" name="lessonNumber">
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>01</span><div><h3>Set your lesson context</h3><p>Choose when and where this lesson will be taught.</p></div></div>
          <div class="teacher-planning-field-grid">
            <label>Lesson date<input name="lessonDate" type="date"></label>
            <label>Academic year<input name="academicYear" type="number" min="2000" max="2200" required></label>
            <label>Term<select name="term" required><option value="">Select term</option><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
            <label>Grade<select name="grade" required><option value="">Loading allocated grades…</option></select></label>
            <label>Subject<select name="subject" required disabled><option value="">Select a grade first</option></select></label>
            <label>Week number<input name="weekNumber" type="number" min="1" max="52"></label>
            <label>Lessons this week<input name="lessonsPerWeek" type="number" min="1" max="20" value="1"></label>
            <label>Topic<input name="topic" maxlength="250" required placeholder="Enter the lesson topic"></label>
          </div>
        </section>
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>02</span><div><h3>Choose where to start</h3><p>Recommended: select a saved scheme to carry its learning focus into this lesson.</p></div></div>
          <label class="teacher-planning-scheme-select">Saved scheme<select name="schemeId"><option value="">Choose a saved scheme, or continue without one</option></select></label>
          <div class="teacher-planning-form-actions">
            <button class="btn primary-btn" type="button" data-lesson-from-scheme disabled>Generate from selected scheme</button>
            <span class="teacher-planning-or">or</span>
            <button class="btn secondary-btn" type="button" data-lesson-generate>Build drafts from curriculum</button>
          </div>
        </section>
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>03</span><div><h3>Confirm the learning focus</h3><p>Choose a published curriculum unit when available, or enter the focus manually.</p></div></div>
          <div class="teacher-planning-focus-toggle" role="group" aria-label="Learning focus source">
            <button type="button" data-focus-mode="curriculum" aria-pressed="false">Choose curriculum</button>
            <button type="button" class="active" data-focus-mode="manual" aria-pressed="true">Enter manually</button>
          </div>
          <div class="teacher-planning-field-grid" data-focus-fields="curriculum" hidden>
            <label>Curriculum strand<select name="curriculumStrand" disabled><option value="">Select grade and subject first</option></select></label>
            <label>Curriculum sub-strand<select name="curriculumSubStrand" disabled><option value="">Select a strand first</option></select></label>
          </div>
          <div class="teacher-planning-field-grid" data-focus-fields="manual">
            <label>Strand<input name="strand" maxlength="200" placeholder="Enter the strand"></label>
            <label>Sub-strand<input name="subStrand" maxlength="200" placeholder="Enter the sub-strand"></label>
          </div>
          <div class="teacher-planning-curriculum-context" data-lesson-context hidden>
            <label>Generated lesson draft<select data-lesson-draft-select></select></label>
            <p data-lesson-context-text></p>
            <a data-lesson-source target="_blank" rel="noopener noreferrer">View verified curriculum source</a>
          </div>
        </section>
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>04</span><div><h3>Plan the learning experience</h3><p>Review and edit generated content. Your saved plan remains editable.</p></div></div>
          <div class="teacher-planning-field-grid teacher-planning-content-grid">
            <label>Lesson objectives<textarea name="lessonObjectives" maxlength="4000" required placeholder="What should learners achieve by the end of the lesson?"></textarea></label>
            <label>Learning activities<textarea name="learningActivities" maxlength="4000" required placeholder="Describe the learner and teacher activities."></textarea></label>
            <label>Resources<textarea name="resources" maxlength="2000" placeholder="List materials needed for this lesson."></textarea></label>
            <label>Assessment<textarea name="assessment" maxlength="3000" placeholder="How will you check understanding?"></textarea></label>
            <label class="wide">Reflection<textarea name="reflection" maxlength="3000" placeholder="Record what worked and what to improve after teaching."></textarea></label>
          </div>
        </section>
        <div class="teacher-planning-form-actions wide teacher-planning-submit-actions">
          <button class="btn primary-btn" type="submit" data-lesson-submit>Save lesson plan</button>
          <button class="btn secondary-btn" type="button" data-lesson-cancel hidden>Cancel edit</button>
        </div>
      </form>
    </section>
    <section class="teacher-planning-panel teacher-planning-saved" id="lessonSavedPanel" role="tabpanel" aria-labelledby="lessonSavedTab" hidden>
      <div class="teacher-planning-panel-header">
        <h3>Saved lesson plans <span class="teacher-planning-count" data-lesson-count></span></h3>
        <button class="btn secondary-btn" type="button" data-lesson-refresh><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </div>
      <div class="teacher-planning-record-list" data-lesson-records></div>
    </section>
    <p class="teacher-planning-status" role="status" aria-live="polite" data-lesson-status></p>
  `;

  const form = root.querySelector('[data-lesson-form]');
  const status = root.querySelector('[data-lesson-status]');
  const count = root.querySelector('[data-lesson-count]');
  const records = root.querySelector('[data-lesson-records]');
  const submit = root.querySelector('[data-lesson-submit]');
  const cancel = root.querySelector('[data-lesson-cancel]');
  const generate = root.querySelector('[data-lesson-generate]');
  const generateFromScheme = root.querySelector('[data-lesson-from-scheme]');
  const context = root.querySelector('[data-lesson-context]');
  const draftSelect = root.querySelector('[data-lesson-draft-select]');
  const tabs = root.querySelectorAll('.teacher-planning-tab');
  const panels = root.querySelectorAll('.teacher-planning-panel');
  const focusModeButtons = root.querySelectorAll('[data-focus-mode]');
  const focusModeFields = root.querySelectorAll('[data-focus-fields]');
  let loaded = false;
  let loading = false;
  let savedRecords = [];
  let availableSchemes = [];

  const showPanel = (panelName) => {
    tabs.forEach(tab => {
      const selected = tab.getAttribute('aria-controls') === `lesson${panelName}Panel`;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    panels.forEach(panel => {
      panel.hidden = panel.id !== `lesson${panelName}Panel`;
    });
    if (panelName === 'Saved') loadRecords();
    if (panelName === 'Create') loadSchemesForLesson();
  };

  function setFocusMode(mode) {
    form.dataset.focusMode = mode;
    focusModeButtons.forEach(button => {
      const selected = button.dataset.focusMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    focusModeFields.forEach(fields => {
      fields.hidden = fields.dataset.focusFields !== mode;
    });
  }

  focusModeButtons.forEach(button => button.addEventListener('click', () => setFocusMode(button.dataset.focusMode)));
  setFocusMode('manual');

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  const allocationFieldsReady = initializeTeacherAllocationFields(
    form.elements.grade,
    form.elements.subject
  ).then(setSelection => ({ setSelection }), error => {
    setStatus(error.message || 'Could not load your teaching allocations.', true);
    return { error };
  });
  const curriculumFields = initializeCurriculumFields(
    form.elements.grade,
    form.elements.subject,
    form.elements.curriculumStrand,
    form.elements.curriculumSubStrand,
    form.elements.term,
    form.elements.weekNumber,
    error => setStatus(error.message || 'Could not load curriculum options.', true)
  );
  initializeActiveTermSelect(form.elements.term).catch(error => {
    setStatus(error.message || 'Could not load the active term.', true);
  });
  const loadSchemesForLesson = async () => {
    try {
      const { records: schemes = [] } = await requestPlanningApi('/schemes');
      availableSchemes = schemes;
      const selectedSchemeId = form.elements.schemeId.value;
      form.elements.schemeId.innerHTML = '<option value="">Create without a scheme</option>' + schemes.map(scheme => (
        `<option value="${escapePlanningHtml(scheme.id)}">${escapePlanningHtml(scheme.grade)} · ${escapePlanningHtml(scheme.subject)} · ${escapePlanningHtml(scheme.term)} · Week ${escapePlanningHtml(scheme.weekNumber)} · ${escapePlanningHtml(scheme.subStrand || scheme.strand || 'Untitled')}</option>`
      )).join('');
      form.elements.schemeId.value = selectedSchemeId;
      generateFromScheme.disabled = !form.elements.schemeId.value;
    } catch (error) {
      setStatus(error.message || 'Could not load saved schemes.', true);
    }
  };
  loadSchemesForLesson();

  const showButtonLoading = (button, message) => {
    if (window.spinner?.show) window.spinner.show(button, message);
    else button.disabled = true;
  };

  const hideButtonLoading = button => {
    if (window.spinner?.hide) window.spinner.hide(button);
    else button.disabled = false;
  };

  const resetForm = () => {
    form.reset();
    form.elements.recordId.value = '';
    form.elements.academicYear.value = new Date().getFullYear();
    form.elements.lessonNumber.value = '';
    form.elements.lessonsPerWeek.value = 1;
    form.elements.schemeId.value = '';
    generateFromScheme.disabled = true;
    context.hidden = true;
    setFocusMode('manual');
    submit.textContent = 'Save lesson plan';
    cancel.hidden = true;
  };

  const loadRecords = async (force = false, refreshButton = null) => {
    if (loading || (loaded && !force)) return;
    loading = true;
    records.setAttribute('aria-busy', 'true');
    if (refreshButton) showButtonLoading(refreshButton, 'Refreshing…');
    setStatus('Loading lesson plans…');
    records.innerHTML = renderPlanningTableState(0, 'Loading your saved lesson plans…', 'loading');
    try {
      const data = await requestPlanningApi('/lessons');
      const items = data.records || [];
      savedRecords = items;
      count.textContent = `${items.length} saved`;
      records.innerHTML = items.length ? `
        <div class="teacher-planning-table-wrap">
          <table class="teacher-planning-table teacher-planning-record-table">
            <thead><tr><th>Date / week</th><th>Class</th><th>Topic and focus</th><th>Lesson plan</th><th>Source</th><th>Actions</th></tr></thead>
            <tbody>${items.map(record => `
              <tr>
                <td>${escapePlanningHtml(record.lessonDate || `${record.term} ${record.academicYear}`)}${record.weekNumber ? `<br><strong>Week ${escapePlanningHtml(record.weekNumber)}${record.lessonNumber ? ` · Lesson ${escapePlanningHtml(record.lessonNumber)}` : ''}</strong>` : ''}</td>
                <td>${escapePlanningHtml(record.grade)}<br>${escapePlanningHtml(record.subject)}</td>
                <td><strong>${escapePlanningHtml(record.topic)}</strong><br><span class="teacher-planning-table-muted">${escapePlanningHtml(record.subStrand || record.strand || 'Focus not specified')}</span></td>
                <td><details class="teacher-planning-record-details">
                  <summary>View lesson details</summary>
                  <div class="teacher-planning-record-detail-grid">
                    <section><h5>Lesson objectives</h5><p>${escapePlanningHtml(record.lessonObjectives || 'Not added')}</p></section>
                    <section><h5>Learning activities</h5><p>${escapePlanningHtml(record.learningActivities || 'Not added')}</p></section>
                    <section><h5>Resources</h5><p>${escapePlanningHtml(record.resources || 'Not added')}</p></section>
                    <section><h5>Assessment</h5><p>${escapePlanningHtml(record.assessment || 'Not added')}</p></section>
                    <section><h5>Reflection</h5><p>${escapePlanningHtml(record.reflection || 'Not added')}</p></section>
                  </div>
                </details></td>
                <td>${record.schemeId ? '<span class="teacher-planning-linked-badge">From scheme</span>' : 'Independent'}</td>
                <td><div class="teacher-planning-record-actions">
                  <button class="btn secondary-btn" type="button" data-lesson-pdf="${escapePlanningHtml(record.id)}">PDF</button>
                  <button class="btn secondary-btn" type="button" data-lesson-edit="${escapePlanningHtml(record.id)}">Edit</button>
                  <button class="btn delete-btn" type="button" data-lesson-delete="${escapePlanningHtml(record.id)}">Delete</button>
                </div></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      ` : '<div class="teacher-planning-list-empty"><strong>No lesson plans saved yet</strong><span>Start from one of your saved schemes or create a lesson plan directly.</span><button class="btn primary-btn" type="button" data-create-first-lesson>Create a lesson plan</button></div>';
      setStatus('');
      loaded = true;
    } catch (error) {
      const message = error.message || 'Could not load lesson plans.';
      records.innerHTML = renderPlanningTableState(0, `${message} Use Refresh to try again.`, 'error');
      count.textContent = 'Unavailable';
      loaded = false;
      setStatus(message, true);
    } finally {
      loading = false;
      records.removeAttribute('aria-busy');
      if (refreshButton) hideButtonLoading(refreshButton);
    }
  };

  tabs.forEach(tab => tab.addEventListener('click', () => {
    showPanel(tab.getAttribute('aria-controls') === 'lessonCreatePanel' ? 'Create' : 'Saved');
  }));
  const refreshButton = root.querySelector('[data-lesson-refresh]');
  refreshButton.addEventListener('click', () => loadRecords(true, refreshButton));
  root.querySelector('[data-lesson-cancel]').addEventListener('click', resetForm);
  records.addEventListener('click', event => {
    if (event.target.closest('[data-create-first-lesson]')) showPanel('Create');
  });

  let generatedLessons = [];
  const applyGeneratedLesson = lesson => {
    form.elements.schemeId.value = lesson.schemeId || '';
    generateFromScheme.disabled = !form.elements.schemeId.value;
    form.elements.topic.value = lesson.topic;
    form.elements.strand.value = lesson.strand;
    form.elements.subStrand.value = lesson.subStrand;
    form.elements.curriculumStrand.value = lesson.strand;
    form.elements.curriculumSubStrand.value = lesson.subStrand;
    form.elements.lessonObjectives.value = lesson.lessonObjectives;
    form.elements.learningActivities.value = lesson.learningActivities;
    form.elements.resources.value = lesson.resources;
    form.elements.assessment.value = lesson.assessment;
    form.elements.reflection.value = '';
    setFocusMode('manual');
    form.elements.weekNumber.value = lesson.weekNumber;
    form.elements.lessonNumber.value = lesson.lessonNumber;
  };

  form.elements.schemeId.addEventListener('change', () => {
    const scheme = availableSchemes.find(item => item.id === form.elements.schemeId.value);
    generateFromScheme.disabled = !scheme;
    if (!scheme) return;
    form.elements.academicYear.value = scheme.academicYear;
    form.elements.term.value = scheme.term;
    form.elements.weekNumber.value = scheme.weekNumber;
    form.elements.grade.value = scheme.grade;
    form.elements.strand.value = scheme.strand || '';
    form.elements.subStrand.value = scheme.subStrand || '';
    setFocusMode('manual');
    allocationFieldsReady.then(allocationFields => {
      if (allocationFields.error) throw allocationFields.error;
      allocationFields.setSelection(scheme.grade, scheme.subject);
    }).catch(error => {
      setStatus(error.message || 'Could not load the selected scheme.', true);
    });
    form.elements.topic.value = scheme.subStrand || scheme.strand || scheme.subject;
    form.elements.strand.value = scheme.strand || '';
    form.elements.subStrand.value = scheme.subStrand || '';
    form.elements.curriculumStrand.value = scheme.strand || '';
  });

  generateFromScheme.addEventListener('click', async () => {
    const schemeId = form.elements.schemeId.value;
    const scheme = availableSchemes.find(item => item.id === schemeId);
    if (!scheme) {
      setStatus('Select one of your saved schemes first.', true);
      return;
    }
    showButtonLoading(generateFromScheme, 'Generating from scheme…');
    try {
      const allocationFields = await allocationFieldsReady;
      if (allocationFields.error) throw allocationFields.error;
      allocationFields.setSelection(scheme.grade, scheme.subject);
      form.elements.strand.value = scheme.strand || '';
      form.elements.subStrand.value = scheme.subStrand || '';
      setFocusMode('manual');
      const { draft } = await generateLessonDraftsFromScheme(schemeId, form.elements.lessonsPerWeek.value);
      generatedLessons = draft.lessons;
      draftSelect.innerHTML = generatedLessons.map((lesson, index) => (
        `<option value="${index}">Week ${lesson.weekNumber} · Lesson ${lesson.lessonNumber} of ${draft.lessons.length}</option>`
      )).join('');
      applyGeneratedLesson(generatedLessons[0]);
      root.querySelector('[data-lesson-context-text]').textContent =
        `Based on your saved ${draft.scheme.subject} scheme for Week ${draft.scheme.weekNumber}. Learning outcomes and suggested experiences are carried forward for teacher review.`;
      const sourceLink = root.querySelector('[data-lesson-source]');
      sourceLink.hidden = true;
      context.hidden = false;
      setStatus(`${generatedLessons.length} lesson draft(s) created from the saved scheme. Review and edit each before saving.`);
    } catch (error) {
      setStatus(error.message || 'Could not generate lessons from the selected scheme.', true);
    } finally {
      hideButtonLoading(generateFromScheme);
    }
  });

  generate.addEventListener('click', async () => {
    const selections = {
      grade: form.elements.grade.value,
      subject: form.elements.subject.value,
      term: form.elements.term.value,
      strand: form.elements.curriculumStrand.value,
      subStrand: form.elements.curriculumSubStrand.value,
      weekNumber: form.elements.weekNumber.value,
      lessonsPerWeek: form.elements.lessonsPerWeek.value
    };
    showButtonLoading(generate, 'Building curriculum drafts…');
    try {
      const { draft } = await generatePlanningDraft(selections);
      generatedLessons = draft.lessons;
      draftSelect.innerHTML = generatedLessons.map((lesson, index) => (
        `<option value="${index}">Lesson ${lesson.lessonNumber} of ${draft.lessons.length}</option>`
      )).join('');
      applyGeneratedLesson(generatedLessons[0]);
      const sourceLink = root.querySelector('[data-lesson-source]');
      sourceLink.href = draft.curriculumContext.source.url;
      sourceLink.textContent = `${draft.curriculumContext.source.title} — ${draft.curriculumContext.source.revision}`;
      sourceLink.hidden = false;
      root.querySelector('[data-lesson-context-text]').textContent = [
        `Key inquiry questions: ${draft.curriculumContext.keyInquiryQuestions.join(' · ') || 'Not provided'}`,
        `Core competencies: ${draft.curriculumContext.coreCompetencies.join(' · ') || 'Not provided'}`,
        `Values: ${draft.curriculumContext.values.join(' · ') || 'Not provided'}`,
        `Pertinent and contemporary issues: ${draft.curriculumContext.pertinentContemporaryIssues.join(' · ') || 'Not provided'}`,
        `Term length: ${draft.teachingWeeks} teaching weeks. Review and edit each draft before saving.`
      ].join('\n');
      context.hidden = false;
      setStatus(`${generatedLessons.length} curriculum-based lesson draft(s) loaded. Review and edit before saving.`);
    } catch (error) {
      setStatus(error.message || 'Could not build lesson drafts.', true);
    } finally {
      hideButtonLoading(generate);
    }
  });
  draftSelect.addEventListener('change', () => {
    const lesson = generatedLessons[Number(draftSelect.value)];
    if (lesson) applyGeneratedLesson(lesson);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.focusMode === 'curriculum' && !form.elements.curriculumStrand.value) {
      setStatus('Choose a curriculum strand or switch to manual input before saving.', true);
      return;
    }
    const recordId = form.elements.recordId.value;
    const record = Object.fromEntries(new FormData(form).entries());
    record.strand = form.dataset.focusMode === 'manual'
      ? form.elements.strand.value.trim()
      : form.elements.curriculumStrand.value;
    record.subStrand = form.dataset.focusMode === 'manual'
      ? form.elements.subStrand.value.trim()
      : form.elements.curriculumSubStrand.value;
    delete record.recordId;
    delete record.lessonsPerWeek;
    delete record.curriculumStrand;
    delete record.curriculumSubStrand;
    if (!record.schemeId) delete record.schemeId;
    showButtonLoading(submit, recordId ? 'Updating…' : 'Saving…');
    try {
      await requestPlanningApi(`/lessons${recordId ? `/${encodeURIComponent(recordId)}` : ''}`, {
        method: recordId ? 'PUT' : 'POST',
        body: JSON.stringify(record)
      });
      hideButtonLoading(submit);
      resetForm();
      await loadRecords(true);
      showPanel('Saved');
      setStatus(recordId ? 'Lesson plan updated.' : 'Lesson plan saved.');
    } catch (error) {
      setStatus(error.message || 'Could not save lesson plan.', true);
    } finally {
      hideButtonLoading(submit);
    }
  });

  records.addEventListener('click', async event => {
    const pdfButton = event.target.closest('[data-lesson-pdf]');
    const editButton = event.target.closest('[data-lesson-edit]');
    const deleteButton = event.target.closest('[data-lesson-delete]');
    if (pdfButton) {
      showButtonLoading(pdfButton, 'Checking payment…');
      try {
        const record = savedRecords.find(item => item.id === pdfButton.dataset.lessonPdf);
        if (!record) throw new Error('Lesson plan not found. Refresh the list and try again.');
        if (!await ensurePlanningPdfAccess(record)) return;
        showButtonLoading(pdfButton, 'Downloading PDF…');
        await downloadPlanningRecordPdf({ entity: 'lessons', recordId: record.id });
      } catch (error) {
        setStatus(error.message || 'Could not create the lesson plan PDF.', true);
      } finally {
        hideButtonLoading(pdfButton);
      }
      return;
    }
    if (editButton) {
      showButtonLoading(editButton, 'Opening…');
      try {
        const { records: items } = await requestPlanningApi('/lessons');
        const record = items.find(item => item.id === editButton.dataset.lessonEdit);
        if (!record) throw new Error('Lesson plan not found. Refresh the list and try again.');
        await loadSchemesForLesson();
        const allocationFields = await allocationFieldsReady;
        if (allocationFields.error) throw allocationFields.error;
        allocationFields.setSelection(record.grade, record.subject);
        setFocusMode('manual');
        form.elements.recordId.value = record.id;
        for (const [key, value] of Object.entries(record)) {
          if (key !== 'grade' && key !== 'subject' && form.elements[key]) {
            form.elements[key].value = value ?? '';
          }
        }
        submit.textContent = 'Update lesson plan';
        cancel.hidden = false;
        showPanel('Create');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        setStatus(error.message || 'Could not open lesson plan.', true);
      } finally {
        hideButtonLoading(editButton);
      }
      return;
    }
    if (deleteButton && window.confirm('Delete this lesson plan?')) {
      showButtonLoading(deleteButton, 'Deleting…');
      try {
        await requestPlanningApi(`/lessons/${encodeURIComponent(deleteButton.dataset.lessonDelete)}`, { method: 'DELETE' });
        resetForm();
        await loadRecords(true);
        setStatus('Lesson plan deleted.');
      } catch (error) {
        setStatus(error.message || 'Could not delete lesson plan.', true);
      } finally {
        hideButtonLoading(deleteButton);
      }
    }
  });
  form.elements.academicYear.value = new Date().getFullYear();
}
