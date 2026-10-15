import {
  escapePlanningHtml,
  downloadPlanningRecordPdf,
  ensurePlanningPdfAccess,
  generateLessonDraftsFromScheme,
  renderPlanningTableState,
  requestPlanningApi
} from './planning-api.js';

const root = document.getElementById('lessonPlansModule');
if (root) {
  root.innerHTML = `
    <div class="teacher-planning-header">
      <div><p class="teacher-planning-eyebrow">DAILY TEACHING</p><h2>📝 Lesson Plans</h2><p>Choose a teaching week from a saved term scheme to create an aligned lesson.</p></div>
    </div>
    <div class="teacher-planning-tabs" role="tablist" aria-label="Lesson plans">
      <button class="teacher-planning-tab active" id="lessonCreateTab" type="button" role="tab" aria-selected="true" aria-controls="lessonCreatePanel">Create lesson plan</button>
      <button class="teacher-planning-tab" id="lessonSavedTab" type="button" role="tab" aria-selected="false" aria-controls="lessonSavedPanel">Saved lesson plans</button>
    </div>
    <div class="teacher-planning-feedback" data-lesson-status role="status" aria-live="polite" hidden>
      <span></span><button type="button" aria-label="Dismiss message">&times;</button>
    </div>
    <section class="teacher-planning-panel" id="lessonCreatePanel" role="tabpanel" aria-labelledby="lessonCreateTab">
      <form class="teacher-planning-form" data-lesson-form>
        <input type="hidden" name="recordId">
        <input type="hidden" name="lessonNumber" value="1">
        <input type="hidden" name="academicYear">
        <input type="hidden" name="term">
        <input type="hidden" name="grade">
        <input type="hidden" name="subject">
        <input type="hidden" name="weekNumber">
        <input type="hidden" name="strand">
        <input type="hidden" name="subStrand">
        <section class="teacher-planning-form-section wide teacher-lesson-source">
          <div class="teacher-planning-section-heading"><span><i class="fas fa-book-open" aria-hidden="true"></i></span><div><h3>Start from a saved term scheme</h3><p>Choose a scheme and teaching week. The lesson draft will use that week’s saved outcomes, activities, resources, and assessment focus.</p></div></div>
          <div class="teacher-planning-field-grid">
            <label class="teacher-planning-scheme-select">Saved scheme<select name="schemeId"><option value="">Loading saved schemes…</option></select></label>
            <label class="teacher-planning-scheme-select" data-scheme-week-field hidden>Teaching week<select name="schemeWeekNumber"></select></label>
            <label>Lesson date<input name="lessonDate" type="date"></label>
          </div>
          <div class="teacher-scheme-context-summary" data-lesson-context-text hidden></div>
          <div class="teacher-planning-form-actions">
            <button class="btn primary-btn" type="button" data-lesson-from-scheme disabled><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Generate lesson plan</button>
          </div>
        </section>
        <section class="teacher-planning-form-section wide teacher-lesson-editor" data-lesson-editor hidden>
          <div class="teacher-planning-section-heading"><span><i class="fas fa-pen-to-square" aria-hidden="true"></i></span><div><h3>Review the lesson plan</h3><p>Make any edits before saving it.</p></div></div>
          <div class="teacher-planning-field-grid">
            <label>Topic<input name="topic" maxlength="250" required placeholder="Lesson topic"></label>
          </div>
          <div class="teacher-planning-field-grid teacher-planning-content-grid">
            <label>Lesson objectives<textarea name="lessonObjectives" maxlength="4000" required placeholder="What should learners achieve by the end of the lesson?"></textarea></label>
            <label>Learning activities<textarea name="learningActivities" maxlength="4000" required placeholder="Describe the learner and teacher activities."></textarea></label>
            <label>Resources<textarea name="resources" maxlength="2000" placeholder="List materials needed for this lesson."></textarea></label>
            <label>Assessment<textarea name="assessment" maxlength="3000" placeholder="How will you check understanding?"></textarea></label>
            <label class="wide">Reflection<textarea name="reflection" maxlength="3000" placeholder="Record what worked and what to improve after teaching."></textarea></label>
          </div>
        </section>
        <div class="teacher-planning-form-actions wide teacher-planning-submit-actions" data-lesson-actions hidden>
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
  `;

  const form = root.querySelector('[data-lesson-form]');
  const status = root.querySelector('[data-lesson-status]');
  const statusText = status.querySelector('span');
  const count = root.querySelector('[data-lesson-count]');
  const records = root.querySelector('[data-lesson-records]');
  const submit = root.querySelector('[data-lesson-submit]');
  const cancel = root.querySelector('[data-lesson-cancel]');
  const generateFromScheme = root.querySelector('[data-lesson-from-scheme]');
  const schemeWeekField = root.querySelector('[data-scheme-week-field]');
  const contextSummary = root.querySelector('[data-lesson-context-text]');
  const editor = root.querySelector('[data-lesson-editor]');
  const formActions = root.querySelector('[data-lesson-actions]');
  const tabs = root.querySelectorAll('.teacher-planning-tab');
  const panels = root.querySelectorAll('.teacher-planning-panel');
  let loaded = false;
  let loading = false;
  let savedRecords = [];
  let availableSchemes = [];
  let generatedLessons = [];

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

  const setStatus = (message, isError = false) => {
    statusText.textContent = message;
    status.hidden = !message;
    status.classList.toggle('error', isError);
    status.setAttribute('role', isError ? 'alert' : 'status');
  };
  status.querySelector('button').addEventListener('click', () => {
    status.hidden = true;
    statusText.textContent = '';
  });

  const selectedScheme = () => availableSchemes.find(item => item.id === form.elements.schemeId.value);
  const selectedWeekPlan = scheme => scheme?.schemeType === 'termly'
    ? scheme.weeklyPlan?.find(week => week.weekNumber === Number(form.elements.schemeWeekNumber.value) && !week.isBreak)
    : scheme ? {
      weekNumber: scheme.weekNumber,
      strand: scheme.strand,
      subStrand: scheme.subStrand,
      learningOutcomes: scheme.learningOutcomes,
      learningExperiences: scheme.learningExperiences,
      resources: scheme.resources,
      assessment: scheme.assessment
    } : null;
  const updateSelectedScheme = (preferredWeek = '') => {
    const scheme = selectedScheme();
    if (!scheme) {
      schemeWeekField.hidden = true;
      form.elements.schemeWeekNumber.replaceChildren();
      generateFromScheme.disabled = true;
      contextSummary.hidden = true;
      return;
    }
    form.elements.academicYear.value = scheme.academicYear;
    form.elements.term.value = scheme.term;
    form.elements.grade.value = scheme.grade;
    form.elements.subject.value = scheme.subject;
    if (scheme.schemeType === 'termly') {
      const teachingWeeks = (scheme.weeklyPlan || []).filter(week => !week.isBreak);
      form.elements.schemeWeekNumber.innerHTML = teachingWeeks.map(week => (
        `<option value="${week.weekNumber}">Week ${week.weekNumber} · ${escapePlanningHtml(week.subStrand || week.strand || 'Teaching week')}</option>`
      )).join('');
      const selectedWeek = String(preferredWeek || form.elements.schemeWeekNumber.value || '');
      form.elements.schemeWeekNumber.value = teachingWeeks.some(week => String(week.weekNumber) === selectedWeek)
        ? selectedWeek
        : String(teachingWeeks[0]?.weekNumber || '');
      schemeWeekField.hidden = teachingWeeks.length === 0;
    } else {
      form.elements.schemeWeekNumber.replaceChildren();
      schemeWeekField.hidden = true;
    }
    form.elements.weekNumber.value = scheme.schemeType === 'termly'
      ? form.elements.schemeWeekNumber.value
      : scheme.weekNumber;
    const weekPlan = selectedWeekPlan(scheme);
    form.elements.strand.value = weekPlan?.strand || '';
    form.elements.subStrand.value = weekPlan?.subStrand || '';
    contextSummary.textContent = weekPlan
      ? `${scheme.grade} · ${scheme.subject} · ${scheme.term} ${scheme.academicYear} · Week ${weekPlan.weekNumber}\nLearning outcomes: ${weekPlan.learningOutcomes || 'Not specified'}\nLearning experiences: ${weekPlan.learningExperiences || 'Not specified'}`
      : 'This saved scheme has no available teaching week.';
    contextSummary.hidden = false;
    generateFromScheme.disabled = !weekPlan;
  };

  const loadSchemesForLesson = async () => {
    try {
      const { records: schemes = [] } = await requestPlanningApi('/schemes');
      availableSchemes = schemes;
      const selectedSchemeId = form.elements.schemeId.value;
      form.elements.schemeId.innerHTML = '<option value="">Select a saved scheme</option>' + schemes.map(scheme => (
        `<option value="${escapePlanningHtml(scheme.id)}">${escapePlanningHtml(scheme.grade)} · ${escapePlanningHtml(scheme.subject)} · ${escapePlanningHtml(scheme.term)} ${escapePlanningHtml(scheme.academicYear)} · ${scheme.schemeType === 'termly' ? `${escapePlanningHtml(scheme.weeksInTerm)}-week term` : `Week ${escapePlanningHtml(scheme.weekNumber)}`}</option>`
      )).join('');
      form.elements.schemeId.value = selectedSchemeId;
      updateSelectedScheme();
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
    form.elements.schemeId.value = '';
    form.elements.schemeWeekNumber.replaceChildren();
    schemeWeekField.hidden = true;
    generateFromScheme.disabled = true;
    contextSummary.hidden = true;
    contextSummary.textContent = '';
    editor.hidden = true;
    formActions.hidden = true;
    submit.textContent = 'Save lesson plan';
    cancel.hidden = true;
    generatedLessons = [];
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
      ` : '<div class="teacher-planning-list-empty"><strong>No lesson plans saved yet</strong><span>Choose a saved Scheme of Work and teaching week to generate your first lesson plan.</span><button class="btn primary-btn" type="button" data-create-first-lesson>Create a lesson plan</button></div>';
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

  const applyGeneratedLesson = lesson => {
    form.elements.schemeId.value = lesson.schemeId || '';
    generateFromScheme.disabled = !form.elements.schemeId.value;
    form.elements.topic.value = lesson.topic;
    form.elements.strand.value = lesson.strand;
    form.elements.subStrand.value = lesson.subStrand;
    form.elements.lessonObjectives.value = lesson.lessonObjectives;
    form.elements.learningActivities.value = lesson.learningActivities;
    form.elements.resources.value = lesson.resources;
    form.elements.assessment.value = lesson.assessment;
    form.elements.reflection.value = '';
    form.elements.weekNumber.value = lesson.weekNumber;
    form.elements.lessonNumber.value = lesson.lessonNumber;
  };

  form.elements.schemeId.addEventListener('change', () => {
    editor.hidden = true;
    formActions.hidden = true;
    generatedLessons = [];
    updateSelectedScheme();
  });

  form.elements.schemeWeekNumber.addEventListener('change', () => {
    if (!editor.hidden && !window.confirm('Changing the week will discard this lesson draft. Continue?')) {
      form.elements.schemeWeekNumber.value = form.elements.weekNumber.value;
      return;
    }
    editor.hidden = true;
    formActions.hidden = true;
    generatedLessons = [];
    updateSelectedScheme();
  });

  generateFromScheme.addEventListener('click', async () => {
    const schemeId = form.elements.schemeId.value;
    const scheme = selectedScheme();
    if (!scheme) {
      setStatus('Select one of your saved schemes first.', true);
      return;
    }
    const selectedWeek = scheme.schemeType === 'termly' ? form.elements.schemeWeekNumber.value : null;
    if (scheme.schemeType === 'termly' && !selectedWeek) {
      setStatus('Choose a teaching week from the selected term scheme.', true);
      return;
    }
    showButtonLoading(generateFromScheme, 'Generating lesson plan…');
    try {
      const { draft } = await generateLessonDraftsFromScheme(
        schemeId,
        selectedWeek
      );
      generatedLessons = draft.lessons;
      applyGeneratedLesson(generatedLessons[0]);
      editor.hidden = false;
      formActions.hidden = false;
      const weekPlan = selectedWeekPlan(scheme);
      contextSummary.textContent = `${scheme.grade} · ${draft.scheme.subject} · ${draft.scheme.term} ${draft.scheme.academicYear} · Week ${draft.scheme.weekNumber}\nLearning outcomes: ${weekPlan?.learningOutcomes || 'Not specified'}\nLearning experiences: ${weekPlan?.learningExperiences || 'Not specified'}\nDraft generated from this saved scheme week. Review and edit before saving.`;
      setStatus('Lesson plan generated from the selected saved scheme week.');
    } catch (error) {
      setStatus(error.message || 'Could not generate a lesson plan from the selected scheme week.', true);
    } finally {
      hideButtonLoading(generateFromScheme);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const recordId = form.elements.recordId.value;
    const record = Object.fromEntries(new FormData(form).entries());
    delete record.recordId;
    delete record.schemeWeekNumber;
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
        form.elements.recordId.value = record.id;
        for (const [key, value] of Object.entries(record)) {
          if (form.elements[key]) {
            form.elements[key].value = value ?? '';
          }
        }
        updateSelectedScheme(record.weekNumber);
        form.elements.strand.value = record.strand || '';
        form.elements.subStrand.value = record.subStrand || '';
        editor.hidden = false;
        formActions.hidden = false;
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
}
