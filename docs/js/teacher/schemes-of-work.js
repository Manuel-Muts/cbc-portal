import {
  escapePlanningHtml,
  downloadPlanningRecordPdf,
  ensurePlanningPdfAccess,
  initializeActiveTermSelect,
  initializeCurriculumFields,
  initializeTeacherAllocationFields,
  renderPlanningTableState,
  generatePlanningDraft,
  requestPlanningApi
} from './planning-api.js';

const root = document.getElementById('schemesOfWorkModule');
if (root) {
  root.innerHTML = `
    <div class="teacher-planning-header">
      <div><p class="teacher-planning-eyebrow">WEEKLY PLANNING</p><h2>📘 Schemes of Work</h2><p>Map the learning focus and activities for each teaching week.</p></div>
    </div>
    <div class="teacher-planning-tabs" role="tablist" aria-label="Schemes of work">
      <button class="teacher-planning-tab active" id="schemeCreateTab" type="button" role="tab" aria-selected="true" aria-controls="schemeCreatePanel">Create scheme</button>
      <button class="teacher-planning-tab" id="schemeSavedTab" type="button" role="tab" aria-selected="false" aria-controls="schemeSavedPanel">Saved schemes</button>
    </div>
    <section class="teacher-planning-panel" id="schemeCreatePanel" role="tabpanel" aria-labelledby="schemeCreateTab">
      <form class="teacher-planning-form" data-scheme-form>
        <input type="hidden" name="recordId">
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>01</span><div><h3>Set your teaching context</h3><p>Choose the class, subject and week this scheme covers.</p></div></div>
          <div class="teacher-planning-field-grid">
            <label>Academic year<input name="academicYear" type="number" min="2000" max="2200" required></label>
            <label>Term<select name="term" required><option value="">Select term</option><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
            <label>Grade<select name="grade" required><option value="">Loading allocated grades…</option></select></label>
            <label>Subject<select name="subject" required disabled><option value="">Select a grade first</option></select></label>
            <label>Week number<input name="weekNumber" type="number" min="1" max="52" required></label>
            <label>Lessons per week<input name="lessonsPerWeek" type="number" min="1" max="20" value="3" required></label>
          </div>
        </section>
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>02</span><div><h3>Choose the learning focus</h3><p>Use published curriculum options when available, or enter the strand details yourself.</p></div></div>
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
        </section>
        <section class="teacher-planning-form-section wide">
          <div class="teacher-planning-section-heading"><span>03</span><div><h3>Build the weekly plan</h3><p>Generate a draft from the selected curriculum unit, then review it before saving.</p></div></div>
          <div class="teacher-planning-form-actions">
          <button class="btn secondary-btn" type="button" data-scheme-generate>Build draft from curriculum</button>
          </div>
          <details class="teacher-planning-curriculum-context" data-scheme-context hidden>
            <summary>Curriculum context and source</summary>
            <p data-scheme-context-text></p>
            <a data-scheme-source target="_blank" rel="noopener noreferrer">View verified curriculum source</a>
          </details>
          <div class="teacher-planning-field-grid teacher-planning-content-grid">
            <label>Learning outcomes<textarea name="learningOutcomes" maxlength="4000" placeholder="What should learners know or be able to do?"></textarea></label>
            <label>Learning experiences<textarea name="learningExperiences" maxlength="4000" placeholder="How will learners build the intended knowledge and skills?"></textarea></label>
            <label>Resources<textarea name="resources" maxlength="2000" placeholder="List materials needed for the week."></textarea></label>
            <label>Assessment<textarea name="assessment" maxlength="3000" placeholder="How will you check learning?"></textarea></label>
          </div>
        </section>
        <div class="teacher-planning-form-actions wide teacher-planning-submit-actions">
          <button class="btn primary-btn" type="submit" data-scheme-submit>Save scheme</button>
          <button class="btn secondary-btn" type="button" data-scheme-cancel hidden>Cancel edit</button>
        </div>
      </form>
    </section>
    <section class="teacher-planning-panel teacher-planning-saved" id="schemeSavedPanel" role="tabpanel" aria-labelledby="schemeSavedTab" hidden>
      <div class="teacher-planning-panel-header">
        <h3>Saved schemes <span class="teacher-planning-count" data-scheme-count></span></h3>
        <button class="btn secondary-btn" type="button" data-scheme-refresh><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </div>
      <div class="teacher-planning-record-list" data-scheme-records></div>
    </section>
    <p class="teacher-planning-status" role="status" aria-live="polite" data-scheme-status></p>
  `;

  const form = root.querySelector('[data-scheme-form]');
  const status = root.querySelector('[data-scheme-status]');
  const count = root.querySelector('[data-scheme-count]');
  const records = root.querySelector('[data-scheme-records]');
  const submit = root.querySelector('[data-scheme-submit]');
  const cancel = root.querySelector('[data-scheme-cancel]');
  const generate = root.querySelector('[data-scheme-generate]');
  const context = root.querySelector('[data-scheme-context]');
  const tabs = root.querySelectorAll('.teacher-planning-tab');
  const panels = root.querySelectorAll('.teacher-planning-panel');
  const focusModeButtons = root.querySelectorAll('[data-focus-mode]');
  const focusModeFields = root.querySelectorAll('[data-focus-fields]');
  let loaded = false;
  let loading = false;
  let savedRecords = [];

  const showPanel = (panelName) => {
    tabs.forEach(tab => {
      const selected = tab.getAttribute('aria-controls') === `scheme${panelName}Panel`;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    panels.forEach(panel => {
      panel.hidden = panel.id !== `scheme${panelName}Panel`;
    });
    if (panelName === 'Saved') loadRecords();
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
  records.addEventListener('click', event => {
    if (event.target.closest('[data-create-first-scheme]')) showPanel('Create');
  });

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
    form.elements.lessonsPerWeek.value = 3;
    context.hidden = true;
    setFocusMode('manual');
    submit.textContent = 'Save scheme';
    cancel.hidden = true;
  };

  const loadRecords = async (force = false, refreshButton = null) => {
    if (loading || (loaded && !force)) return;
    loading = true;
    records.setAttribute('aria-busy', 'true');
    if (refreshButton) showButtonLoading(refreshButton, 'Refreshing…');
    setStatus('Loading schemes…');
    records.innerHTML = renderPlanningTableState(0, 'Loading your saved schemes…', 'loading');
    try {
      const data = await requestPlanningApi('/schemes');
      const items = data.records || [];
      savedRecords = items;
      count.textContent = `${items.length} saved`;
      records.innerHTML = items.length ? `
        <div class="teacher-planning-table-wrap">
          <table class="teacher-planning-table teacher-planning-record-table">
            <thead><tr><th>Week</th><th>Class</th><th>Learning focus</th><th>Weekly plan</th><th>Actions</th></tr></thead>
            <tbody>${items.map(record => `
              <tr>
                <td><strong>Week ${escapePlanningHtml(record.weekNumber)}</strong><br>${escapePlanningHtml(record.term)} ${escapePlanningHtml(record.academicYear)}</td>
                <td>${escapePlanningHtml(record.grade)}<br>${escapePlanningHtml(record.subject)}</td>
                <td><strong>${escapePlanningHtml(record.subStrand || record.strand || 'Not specified')}</strong><br><span class="teacher-planning-table-muted">${escapePlanningHtml(record.strand || 'Strand not specified')}</span></td>
                <td><details class="teacher-planning-record-details">
                  <summary>View weekly plan</summary>
                  <div class="teacher-planning-record-detail-grid">
                    <section><h5>Learning outcomes</h5><p>${escapePlanningHtml(record.learningOutcomes || 'Not added')}</p></section>
                    <section><h5>Learning experiences</h5><p>${escapePlanningHtml(record.learningExperiences || 'Not added')}</p></section>
                    <section><h5>Resources</h5><p>${escapePlanningHtml(record.resources || 'Not added')}</p></section>
                    <section><h5>Assessment</h5><p>${escapePlanningHtml(record.assessment || 'Not added')}</p></section>
                  </div>
                </details></td>
                <td><div class="teacher-planning-record-actions">
                  <button class="btn secondary-btn" type="button" data-scheme-pdf="${escapePlanningHtml(record.id)}">PDF</button>
                  <button class="btn secondary-btn" type="button" data-scheme-edit="${escapePlanningHtml(record.id)}">Edit</button>
                  <button class="btn delete-btn" type="button" data-scheme-delete="${escapePlanningHtml(record.id)}">Delete</button>
                </div></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      ` : '<div class="teacher-planning-list-empty"><strong>No schemes saved yet</strong><span>Create a weekly scheme to organize learning outcomes, activities and assessment.</span><button class="btn primary-btn" type="button" data-create-first-scheme>Create a scheme</button></div>';
      setStatus('');
      loaded = true;
    } catch (error) {
      const message = error.message || 'Could not load schemes.';
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
    showPanel(tab.getAttribute('aria-controls') === 'schemeCreatePanel' ? 'Create' : 'Saved');
  }));
  const refreshButton = root.querySelector('[data-scheme-refresh]');
  refreshButton.addEventListener('click', () => loadRecords(true, refreshButton));
  root.querySelector('[data-scheme-cancel]').addEventListener('click', resetForm);

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
    showButtonLoading(generate, 'Building curriculum draft…');
    try {
      const { draft } = await generatePlanningDraft(selections);
      form.elements.learningOutcomes.value = draft.scheme.learningOutcomes;
      form.elements.learningExperiences.value = draft.scheme.learningExperiences;
      form.elements.resources.value = draft.scheme.resources;
      form.elements.assessment.value = draft.scheme.assessment;
      await curriculumFields.setSelection(draft.scheme.strand, draft.scheme.subStrand);
      setFocusMode('curriculum');
      root.querySelector('[data-scheme-context-text]').textContent = [
        `Key inquiry questions: ${draft.curriculumContext.keyInquiryQuestions.join(' · ') || 'Not provided'}`,
        `Core competencies: ${draft.curriculumContext.coreCompetencies.join(' · ') || 'Not provided'}`,
        `Values: ${draft.curriculumContext.values.join(' · ') || 'Not provided'}`,
        `Pertinent and contemporary issues: ${draft.curriculumContext.pertinentContemporaryIssues.join(' · ') || 'Not provided'}`,
        `This term has ${draft.teachingWeeks} teaching weeks. ${draft.lessons.length} lesson draft(s) are available for this week.`
      ].join('\n');
      const sourceLink = root.querySelector('[data-scheme-source]');
      sourceLink.href = draft.curriculumContext.source.url;
      sourceLink.textContent = `${draft.curriculumContext.source.title} — ${draft.curriculumContext.source.revision}`;
      context.hidden = false;
      setStatus('Curriculum-based draft loaded. Review and edit the scheme before saving.');
    } catch (error) {
      setStatus(error.message || 'Could not build a curriculum draft.', true);
    } finally {
      hideButtonLoading(generate);
    }
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
    showButtonLoading(submit, recordId ? 'Updating…' : 'Saving…');
    try {
      await requestPlanningApi(`/schemes${recordId ? `/${encodeURIComponent(recordId)}` : ''}`, {
        method: recordId ? 'PUT' : 'POST',
        body: JSON.stringify(record)
      });
      hideButtonLoading(submit);
      resetForm();
      await loadRecords(true);
      showPanel('Saved');
      setStatus(recordId ? 'Scheme updated.' : 'Scheme saved.');
    } catch (error) {
      setStatus(error.message || 'Could not save scheme.', true);
    } finally {
      hideButtonLoading(submit);
    }
  });

  records.addEventListener('click', async event => {
    const pdfButton = event.target.closest('[data-scheme-pdf]');
    const editButton = event.target.closest('[data-scheme-edit]');
    const deleteButton = event.target.closest('[data-scheme-delete]');
    if (pdfButton) {
      showButtonLoading(pdfButton, 'Checking payment…');
      try {
        const record = savedRecords.find(item => item.id === pdfButton.dataset.schemePdf);
        if (!record) throw new Error('Scheme not found. Refresh the list and try again.');
        if (!await ensurePlanningPdfAccess(record)) return;
        showButtonLoading(pdfButton, 'Downloading PDF…');
        await downloadPlanningRecordPdf({ entity: 'schemes', recordId: record.id });
      } catch (error) {
        setStatus(error.message || 'Could not create the scheme PDF.', true);
      } finally {
        hideButtonLoading(pdfButton);
      }
      return;
    }
    if (editButton) {
      showButtonLoading(editButton, 'Opening…');
      try {
        const { records: items } = await requestPlanningApi('/schemes');
        const record = items.find(item => item.id === editButton.dataset.schemeEdit);
        if (!record) throw new Error('Scheme not found. Refresh the list and try again.');
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
        submit.textContent = 'Update scheme';
        cancel.hidden = false;
        showPanel('Create');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        setStatus(error.message || 'Could not open scheme.', true);
      } finally {
        hideButtonLoading(editButton);
      }
      return;
    }
    if (deleteButton && window.confirm('Delete this scheme of work?')) {
      showButtonLoading(deleteButton, 'Deleting…');
      try {
        await requestPlanningApi(`/schemes/${encodeURIComponent(deleteButton.dataset.schemeDelete)}`, { method: 'DELETE' });
        resetForm();
        await loadRecords(true);
        setStatus('Scheme deleted.');
      } catch (error) {
        setStatus(error.message || 'Could not delete scheme.', true);
      } finally {
        hideButtonLoading(deleteButton);
      }
    }
  });
  form.elements.academicYear.value = new Date().getFullYear();
}
