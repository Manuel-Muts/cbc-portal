import {
  escapePlanningHtml,
  downloadPlanningRecordPdf,
  ensurePlanningPdfAccess,
  initializeActiveTermSelect,
  initializeTeacherAllocationFields,
  renderPlanningTableState,
  requestPlanningApi
} from './planning-api.js';

const root = document.getElementById('schemesOfWorkModule');
if (root) {
  root.innerHTML = `
    <div class="teacher-planning-header">
      <div><p class="teacher-planning-eyebrow">TERM PLANNING</p><h2>📘 Schemes of Work</h2><p>Shape a balanced plan for the whole term, then review each week before saving.</p></div>
    </div>
    <div class="teacher-planning-tabs" role="tablist" aria-label="Schemes of work">
      <button class="teacher-planning-tab active" id="schemeCreateTab" type="button" role="tab" aria-selected="true" aria-controls="schemeCreatePanel">Create term plan</button>
      <button class="teacher-planning-tab" id="schemeSavedTab" type="button" role="tab" aria-selected="false" aria-controls="schemeSavedPanel">Saved schemes</button>
    </div>
    <div class="teacher-planning-feedback" data-scheme-status role="status" aria-live="polite" hidden>
      <span></span><button type="button" aria-label="Dismiss message">&times;</button>
    </div>
    <section class="teacher-planning-panel" id="schemeCreatePanel" role="tabpanel" aria-labelledby="schemeCreateTab">
      <ol class="teacher-scheme-stepper" aria-label="Scheme creation steps">
        <li class="active" data-scheme-step-indicator="1"><span>1</span><div><strong>Settings</strong><small>Class and term</small></div></li>
        <li data-scheme-step-indicator="2"><span>2</span><div><strong>Generate</strong><small>Build the plan</small></div></li>
        <li data-scheme-step-indicator="3"><span>3</span><div><strong>Preview &amp; save</strong><small>Review each week</small></div></li>
      </ol>
      <form class="teacher-planning-form" data-scheme-form>
        <input type="hidden" name="recordId">
        <section class="teacher-planning-form-section wide teacher-scheme-step" data-scheme-step="1">
          <div class="teacher-planning-section-heading"><span>01</span><div><h3>Set your teaching context</h3><p>Tell us which class and term this scheme should cover.</p></div></div>
          <div class="teacher-planning-field-grid">
            <label>Academic year<input name="academicYear" type="number" min="2000" max="2200" required></label>
            <label>Term<select name="term" required><option value="">Select term</option><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
            <label>Grade<select name="grade" required><option value="">Loading allocated grades…</option></select></label>
            <label>Subject<select name="subject" required disabled><option value="">Select a grade first</option></select></label>
            <label>Weeks in this term<input name="weeksInTerm" type="number" min="1" max="24" value="13" required></label>
            <label>Break weeks <span class="teacher-planning-field-hint">(week numbers, comma separated)</span><input name="breakWeeksInput" type="text" inputmode="numeric" placeholder="e.g. 6, 11"></label>
          </div>
          <div class="teacher-planning-form-actions teacher-scheme-step-actions">
            <span></span>
            <button class="btn primary-btn" type="button" data-scheme-next="2">Continue to generation <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        </section>
        <section class="teacher-planning-form-section wide teacher-scheme-step" data-scheme-step="2" hidden>
          <div class="teacher-planning-section-heading"><span>02</span><div><h3>Build your term scheme</h3><p>The scheme covers the whole term and is organized by teaching week. Generate a curriculum-grounded draft, or start with a blank term plan. AI remains subject to provider eligibility review.</p></div></div>
          <div class="teacher-scheme-context-summary" data-scheme-context-summary></div>
          <div class="teacher-planning-form-actions">
            <button class="btn primary-btn" type="button" data-scheme-generate><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Generate</button>
            <button class="btn secondary-btn" type="button" data-scheme-prepare>Prepare blank term plan</button>
          </div>
          <div class="teacher-planning-form-actions teacher-scheme-step-actions">
            <button class="btn secondary-btn" type="button" data-scheme-back="1"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to settings</button>
          </div>
        </section>
        <section class="teacher-planning-form-section wide teacher-scheme-step" data-scheme-step="3" hidden>
          <div class="teacher-planning-section-heading"><span>03</span><div><h3>Preview your term scheme</h3><p>Review and edit the term plan's teaching-week breakdown. Break weeks are shown separately.</p></div></div>
          <div class="teacher-planning-term-sources" data-scheme-sources hidden></div>
          <div class="teacher-planning-weekly-editor" data-scheme-weekly-editor></div>
          <div class="teacher-planning-form-actions teacher-scheme-step-actions">
            <button class="btn secondary-btn" type="button" data-scheme-back="2"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to generation</button>
            <div class="teacher-planning-form-actions teacher-planning-submit-actions">
              <button class="btn secondary-btn" type="button" data-scheme-cancel hidden>Cancel edit</button>
              <button class="btn primary-btn" type="submit" data-scheme-submit>Save term scheme</button>
            </div>
          </div>
        </section>
      </form>
    </section>
    <section class="teacher-planning-panel teacher-planning-saved" id="schemeSavedPanel" role="tabpanel" aria-labelledby="schemeSavedTab" hidden>
      <div class="teacher-planning-panel-header">
        <h3>Saved schemes <span class="teacher-planning-count" data-scheme-count></span></h3>
        <button class="btn secondary-btn" type="button" data-scheme-refresh><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </div>
      <div class="teacher-planning-record-list" data-scheme-records></div>
    </section>
  `;

  const form = root.querySelector('[data-scheme-form]');
  const status = root.querySelector('[data-scheme-status]');
  const statusText = status.querySelector('span');
  const count = root.querySelector('[data-scheme-count]');
  const records = root.querySelector('[data-scheme-records]');
  const submit = root.querySelector('[data-scheme-submit]');
  const cancel = root.querySelector('[data-scheme-cancel]');
  const generate = root.querySelector('[data-scheme-generate]');
  const prepare = root.querySelector('[data-scheme-prepare]');
  const weeklyEditor = root.querySelector('[data-scheme-weekly-editor]');
  const sources = root.querySelector('[data-scheme-sources]');
  const steps = root.querySelectorAll('[data-scheme-step]');
  const stepIndicators = root.querySelectorAll('[data-scheme-step-indicator]');
  const contextSummary = root.querySelector('[data-scheme-context-summary]');
  const tabs = root.querySelectorAll('.teacher-planning-tab');
  const panels = root.querySelectorAll('.teacher-planning-panel');
  let loaded = false;
  let loading = false;
  let savedRecords = [];
  let curriculumSources = [];
  let editingLegacy = false;
  let planContextKey = null;

  const getPlanContextKey = configuration => JSON.stringify({
    academicYear: form.elements.academicYear.value,
    term: form.elements.term.value,
    grade: form.elements.grade.value,
    subject: form.elements.subject.value,
    weeksInTerm: configuration.weeksInTerm,
    breakWeeks: configuration.breakWeeks
  });

  const setWizardStep = step => {
    steps.forEach(section => { section.hidden = Number(section.dataset.schemeStep) !== step; });
    stepIndicators.forEach(indicator => {
      const indicatorStep = Number(indicator.dataset.schemeStepIndicator);
      indicator.classList.toggle('active', indicatorStep === step);
      indicator.classList.toggle('complete', indicatorStep < step);
      if (indicatorStep === step) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
    });
    if (step === 2) {
      contextSummary.textContent = [
        `${form.elements.grade.value} · ${form.elements.subject.value}`,
        `${form.elements.term.value} · ${form.elements.weeksInTerm.value} weeks`,
        `Break weeks: ${form.elements.breakWeeksInput.value.trim() || 'None'}`
      ].join('  |  ');
    }
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
  const showButtonLoading = (button, message) => {
    if (window.spinner?.show) window.spinner.show(button, message);
    else button.disabled = true;
  };
  const hideButtonLoading = button => {
    if (window.spinner?.hide) window.spinner.hide(button);
    else button.disabled = false;
  };
  const showPanel = panelName => {
    tabs.forEach(tab => {
      const selected = tab.getAttribute('aria-controls') === `scheme${panelName}Panel`;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    panels.forEach(panel => { panel.hidden = panel.id !== `scheme${panelName}Panel`; });
    if (panelName === 'Saved') loadRecords();
  };
  tabs.forEach(tab => tab.addEventListener('click', () => {
    showPanel(tab.getAttribute('aria-controls') === 'schemeCreatePanel' ? 'Create' : 'Saved');
  }));
  form.querySelector('[data-scheme-next="2"]').addEventListener('click', () => {
    const requiredSettings = [
      form.elements.academicYear,
      form.elements.term,
      form.elements.grade,
      form.elements.subject
    ];
    const invalidSetting = requiredSettings.find(field => !field.checkValidity());
    if (invalidSetting) {
      invalidSetting.reportValidity();
      return;
    }
    try {
      const configuration = parseConfiguration();
      if (weeklyEditor.children.length && planContextKey !== getPlanContextKey(configuration)) {
        if (!window.confirm('Your settings changed. Discard the current term plan and generate a new one for these settings?')) return;
        weeklyEditor.replaceChildren();
        clearSources();
        planContextKey = null;
        editingLegacy = false;
        submit.textContent = form.elements.recordId.value ? 'Update term scheme' : 'Save term scheme';
      }
      setStatus('');
      setWizardStep(2);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  form.querySelectorAll('[data-scheme-back]').forEach(button => {
    button.addEventListener('click', () => {
      setStatus('');
      setWizardStep(Number(button.dataset.schemeBack));
    });
  });

  const parseConfiguration = () => {
    const weeksInTerm = Number(form.elements.weeksInTerm.value);
    if (!Number.isInteger(weeksInTerm) || weeksInTerm < 1 || weeksInTerm > 24) {
      throw new Error('Term length must be between 1 and 24 weeks.');
    }
    const rawBreaks = form.elements.breakWeeksInput.value.trim();
    const breakWeeks = rawBreaks
      ? rawBreaks.split(',').map(value => value.trim()).map(Number)
      : [];
    if (rawBreaks && (breakWeeks.some(week => !Number.isInteger(week))
      || new Set(breakWeeks).size !== breakWeeks.length
      || breakWeeks.some(week => week < 1 || week > weeksInTerm)
      || breakWeeks.length >= weeksInTerm)) {
      throw new Error(`Enter unique break week numbers between 1 and ${weeksInTerm}, leaving at least one teaching week.`);
    }
    if (!form.elements.term.value || !form.elements.grade.value || !form.elements.subject.value) {
      throw new Error('Choose the term, grade, and subject first.');
    }
    return { weeksInTerm, breakWeeks: breakWeeks.sort((a, b) => a - b) };
  };

  const renderWeeklyPlan = (weeklyPlan, focus = true) => {
    weeklyEditor.innerHTML = weeklyPlan.map(week => week.isBreak ? `
      <article class="teacher-planning-week-card is-break" data-week-number="${week.weekNumber}">
        <div class="teacher-planning-week-heading"><span>WEEK ${week.weekNumber}</span><strong>Break week</strong></div>
        <p>No teaching activities are planned for this week.</p>
      </article>
    ` : `
      <article class="teacher-planning-week-card" data-week-number="${week.weekNumber}">
        <div class="teacher-planning-week-heading"><span>WEEK ${week.weekNumber}</span><strong>Teaching week</strong></div>
        <div class="teacher-planning-week-focus">
          <label>Strand<input data-week-field="strand" maxlength="200" value="${escapePlanningHtml(week.strand || '')}" required></label>
          <label>Sub-strand<input data-week-field="subStrand" maxlength="200" value="${escapePlanningHtml(week.subStrand || '')}" required></label>
        </div>
        <div class="teacher-planning-field-grid teacher-planning-content-grid">
          <label>Learning outcomes<textarea data-week-field="learningOutcomes" maxlength="4000" required>${escapePlanningHtml(week.learningOutcomes || '')}</textarea></label>
          <label>Learning experiences<textarea data-week-field="learningExperiences" maxlength="4000" required>${escapePlanningHtml(week.learningExperiences || '')}</textarea></label>
          <label>Resources<textarea data-week-field="resources" maxlength="2000" required>${escapePlanningHtml(week.resources || '')}</textarea></label>
          <label>Assessment<textarea data-week-field="assessment" maxlength="3000" required>${escapePlanningHtml(week.assessment || '')}</textarea></label>
        </div>
      </article>
    `).join('');
    if (focus) weeklyEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const blankPlan = ({ weeksInTerm, breakWeeks }) => Array.from({ length: weeksInTerm }, (_, index) => ({
    weekNumber: index + 1,
    isBreak: breakWeeks.includes(index + 1),
    strand: '',
    subStrand: '',
    learningOutcomes: '',
    learningExperiences: '',
    resources: '',
    assessment: ''
  }));
  const clearSources = () => {
    curriculumSources = [];
    sources.hidden = true;
    sources.replaceChildren();
  };
  const renderSources = sourceRecords => {
    const uniqueSources = [...new Map(sourceRecords.map(source => [
      `${source.title}|${source.url}`,
      { title: source.title, url: source.url, revision: source.revision || '' }
    ])).values()];
    const safeSources = uniqueSources.filter(source => {
      try {
        return new URL(source.url).protocol === 'https:';
      } catch {
        return false;
      }
    });
    sources.innerHTML = safeSources.length
      ? `<strong>Verified curriculum sources</strong>${safeSources.map(source => `
          <a href="${escapePlanningHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            ${escapePlanningHtml(source.title)}${source.revision ? ` — ${escapePlanningHtml(source.revision)}` : ''}
          </a>`).join('')}`
      : '';
    sources.hidden = !safeSources.length;
    curriculumSources = safeSources;
  };

  const allocationFieldsReady = initializeTeacherAllocationFields(
    form.elements.grade,
    form.elements.subject
  ).then(setSelection => ({ setSelection }), error => {
    setStatus(error.message || 'Could not load your teaching allocations.', true);
    return { error };
  });
  initializeActiveTermSelect(form.elements.term).catch(error => {
    setStatus(error.message || 'Could not load the active term.', true);
  });

  const resetForm = () => {
    form.reset();
    form.elements.recordId.value = '';
    form.elements.academicYear.value = new Date().getFullYear();
    form.elements.weeksInTerm.value = 13;
    weeklyEditor.replaceChildren();
    clearSources();
    editingLegacy = false;
    planContextKey = null;
    submit.textContent = 'Save term scheme';
    cancel.hidden = true;
    setWizardStep(1);
  };

  const loadRecords = async (force = false, refreshButton = null) => {
    if (loading || (loaded && !force)) return;
    loading = true;
    records.setAttribute('aria-busy', 'true');
    if (refreshButton) showButtonLoading(refreshButton, 'Refreshing…');
    records.innerHTML = renderPlanningTableState(0, 'Loading your saved schemes…', 'loading');
    try {
      const { records: items = [] } = await requestPlanningApi('/schemes');
      savedRecords = items;
      count.textContent = `${items.length} saved`;
      records.innerHTML = items.length ? `
        <div class="teacher-planning-table-wrap">
          <table class="teacher-planning-table teacher-planning-record-table">
            <thead><tr><th>Coverage</th><th>Class</th><th>Learning focus</th><th>Plan</th><th>Actions</th></tr></thead>
            <tbody>${items.map(record => {
              const termly = record.schemeType === 'termly';
              const weeklyContent = termly
                ? (record.weeklyPlan || []).map(week => week.isBreak
                  ? `<section class="teacher-planning-saved-week is-break"><h5>Week ${week.weekNumber} · Break</h5></section>`
                  : `<section class="teacher-planning-saved-week"><h5>Week ${week.weekNumber} · ${escapePlanningHtml(week.strand)} / ${escapePlanningHtml(week.subStrand)}</h5>
                      <p><strong>Outcomes:</strong> ${escapePlanningHtml(week.learningOutcomes)}</p>
                      <p><strong>Experiences:</strong> ${escapePlanningHtml(week.learningExperiences)}</p>
                      <p><strong>Resources:</strong> ${escapePlanningHtml(week.resources)}</p>
                      <p><strong>Assessment:</strong> ${escapePlanningHtml(week.assessment)}</p></section>`).join('')
                : `<section><h5>Learning outcomes</h5><p>${escapePlanningHtml(record.learningOutcomes || 'Not added')}</p></section>
                   <section><h5>Learning experiences</h5><p>${escapePlanningHtml(record.learningExperiences || 'Not added')}</p></section>
                   <section><h5>Resources</h5><p>${escapePlanningHtml(record.resources || 'Not added')}</p></section>
                   <section><h5>Assessment</h5><p>${escapePlanningHtml(record.assessment || 'Not added')}</p></section>`;
              return `<tr>
                <td><strong>${termly ? `${escapePlanningHtml(record.weeksInTerm)}-week term` : `Legacy week ${escapePlanningHtml(record.weekNumber)}`}</strong><br>${escapePlanningHtml(record.term)} ${escapePlanningHtml(record.academicYear)}${termly && record.breakWeeks?.length ? `<br><span class="teacher-planning-table-muted">Breaks: ${escapePlanningHtml(record.breakWeeks.join(', '))}</span>` : ''}</td>
                <td>${escapePlanningHtml(record.grade)}<br>${escapePlanningHtml(record.subject)}</td>
                <td><strong>${escapePlanningHtml(termly ? 'Termly curriculum plan' : record.subStrand || record.strand || 'Not specified')}</strong><br><span class="teacher-planning-table-muted">${escapePlanningHtml(record.strand || 'Curriculum focus')}</span></td>
                <td><details class="teacher-planning-record-details"><summary>View ${termly ? 'term' : 'weekly'} plan</summary><div class="teacher-planning-record-detail-grid">${weeklyContent}${termly && record.curriculumSources?.length ? `<section class="teacher-planning-saved-week"><h5>Verified curriculum sources</h5>${record.curriculumSources.map(source => `<p><a href="${escapePlanningHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapePlanningHtml(source.title)}${source.revision ? ` — ${escapePlanningHtml(source.revision)}` : ''}</a></p>`).join('')}</section>` : ''}</div></details></td>
                <td><div class="teacher-planning-record-actions">
                  <button class="btn secondary-btn" type="button" data-scheme-pdf="${escapePlanningHtml(record.id)}">PDF</button>
                  <button class="btn secondary-btn" type="button" data-scheme-edit="${escapePlanningHtml(record.id)}">Edit</button>
                  <button class="btn delete-btn" type="button" data-scheme-delete="${escapePlanningHtml(record.id)}">Delete</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      ` : '<div class="teacher-planning-list-empty"><strong>No schemes saved yet</strong><span>Create a term plan to organize teaching across the term.</span><button class="btn primary-btn" type="button" data-create-first-scheme>Create a term plan</button></div>';
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

  prepare.addEventListener('click', () => {
    try {
      const configuration = parseConfiguration();
      if (weeklyEditor.querySelector('[data-week-field]') && !window.confirm('Replace the current term plan with a blank term plan?')) return;
      clearSources();
      planContextKey = getPlanContextKey(configuration);
      setWizardStep(3);
      renderWeeklyPlan(blankPlan(configuration));
      setStatus('Your blank term plan is ready. Complete the teaching-week sections, then save the term scheme.');
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  generate.addEventListener('click', async () => {
    let configuration;
    try {
      configuration = parseConfiguration();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }
    if ([...weeklyEditor.querySelectorAll('[data-week-field]')]
      .some(field => field.value.trim())
      && !window.confirm('Replace the current term plan with a new generated draft?')) return;
    showButtonLoading(generate, 'Drafting your term…');
    try {
      const { draft } = await requestPlanningApi('/generate-term', {
        method: 'POST',
        body: JSON.stringify({
          grade: form.elements.grade.value,
          subject: form.elements.subject.value,
          term: form.elements.term.value,
          ...configuration
        })
      });
      planContextKey = getPlanContextKey(configuration);
      setWizardStep(3);
      renderWeeklyPlan(draft.weeklyPlan);
      renderSources(draft.curriculumSources || []);
      setStatus('Your term scheme draft is ready from verified curriculum. Review and edit its teaching-week sections before saving.');
    } catch (error) {
      setStatus(error.message || 'Could not generate a term draft.', true);
    } finally {
      hideButtonLoading(generate);
    }
  });

  const gatherWeeklyPlan = () => [...weeklyEditor.querySelectorAll('[data-week-number]')].map(card => {
    const weekNumber = Number(card.dataset.weekNumber);
    const isBreak = card.classList.contains('is-break');
    const week = { weekNumber, isBreak };
    for (const field of ['strand', 'subStrand', 'learningOutcomes', 'learningExperiences', 'resources', 'assessment']) {
      week[field] = isBreak ? '' : card.querySelector(`[data-week-field="${field}"]`).value.trim();
    }
    return week;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const recordId = form.elements.recordId.value;
    const wasLegacy = editingLegacy;
    let configuration;
    try {
      configuration = parseConfiguration();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }
    const weeklyPlan = gatherWeeklyPlan();
    if (weeklyPlan.length !== configuration.weeksInTerm) {
      setStatus('Prepare the term plan or generate a draft before saving.', true);
      return;
    }
    if (!editingLegacy && weeklyPlan.some((week, index) => week.weekNumber !== index + 1
      || week.isBreak !== configuration.breakWeeks.includes(index + 1))) {
      setStatus('The teaching-week sections do not match the selected term length and break weeks. Prepare the term plan again.', true);
      return;
    }
    const missingWeek = weeklyPlan.find(week => !week.isBreak
      && ['strand', 'subStrand', 'learningOutcomes', 'learningExperiences', 'resources', 'assessment']
        .some(field => !week[field]));
    if (missingWeek) {
      setStatus(`Complete all fields for teaching week ${missingWeek.weekNumber} before saving.`, true);
      return;
    }
    const record = editingLegacy ? {
      academicYear: form.elements.academicYear.value,
      term: form.elements.term.value,
      grade: form.elements.grade.value,
      subject: form.elements.subject.value,
      schemeType: 'weekly',
      weekNumber: weeklyPlan[0].weekNumber,
      weeksInTerm: null,
      breakWeeks: [],
      weeklyPlan: null,
      curriculumSources: [],
      strand: weeklyPlan[0].strand,
      subStrand: weeklyPlan[0].subStrand,
      learningOutcomes: weeklyPlan[0].learningOutcomes,
      learningExperiences: weeklyPlan[0].learningExperiences,
      resources: weeklyPlan[0].resources,
      assessment: weeklyPlan[0].assessment
    } : {
      academicYear: form.elements.academicYear.value,
      term: form.elements.term.value,
      grade: form.elements.grade.value,
      subject: form.elements.subject.value,
      schemeType: 'termly',
      weekNumber: null,
      weeksInTerm: configuration.weeksInTerm,
      breakWeeks: configuration.breakWeeks,
      weeklyPlan,
      curriculumSources,
      strand: 'See term plan',
      subStrand: 'Termly plan',
      learningOutcomes: `Term scheme with ${weeklyPlan.filter(week => !week.isBreak).length} teaching weeks. See the term plan.`,
      learningExperiences: 'See the teacher-reviewed term plan.',
      resources: 'See the teacher-reviewed term plan.',
      assessment: 'See the teacher-reviewed term plan.'
    };
    showButtonLoading(submit, recordId ? 'Updating…' : 'Saving…');
    try {
      await requestPlanningApi(`/schemes${recordId ? `/${encodeURIComponent(recordId)}` : ''}`, {
        method: recordId ? 'PUT' : 'POST',
        body: JSON.stringify(record)
      });
      resetForm();
      await loadRecords(true);
      showPanel('Saved');
      setStatus(recordId
        ? (wasLegacy ? 'Weekly scheme updated.' : 'Term scheme updated.')
        : 'Term scheme saved.');
    } catch (error) {
      setStatus(error.message || 'Could not save the term scheme.', true);
    } finally {
      hideButtonLoading(submit);
    }
  });

  records.addEventListener('click', async event => {
    if (event.target.closest('[data-create-first-scheme]')) {
      showPanel('Create');
      return;
    }
    const pdfButton = event.target.closest('[data-scheme-pdf]');
    const editButton = event.target.closest('[data-scheme-edit]');
    const deleteButton = event.target.closest('[data-scheme-delete]');
    if (pdfButton) {
      showButtonLoading(pdfButton, 'Checking payment…');
      try {
        const record = savedRecords.find(item => item.id === pdfButton.dataset.schemePdf);
        if (!record) throw new Error('Scheme not found. Refresh the list and try again.');
        if (await ensurePlanningPdfAccess(record)) {
          showButtonLoading(pdfButton, 'Downloading PDF…');
          await downloadPlanningRecordPdf({ entity: 'schemes', recordId: record.id });
        }
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
        const record = savedRecords.find(item => item.id === editButton.dataset.schemeEdit);
        if (!record) throw new Error('Scheme not found. Refresh the list and try again.');
        const allocationFields = await allocationFieldsReady;
        if (allocationFields.error) throw allocationFields.error;
        allocationFields.setSelection(record.grade, record.subject);
        form.elements.recordId.value = record.id;
        form.elements.academicYear.value = record.academicYear;
        form.elements.term.value = record.term;
        editingLegacy = record.schemeType !== 'termly';
        if (editingLegacy) {
          form.elements.weeksInTerm.value = 1;
          form.elements.breakWeeksInput.value = '';
          renderWeeklyPlan([{
            weekNumber: record.weekNumber,
            isBreak: false,
            strand: record.strand || '',
            subStrand: record.subStrand || '',
            learningOutcomes: record.learningOutcomes || '',
            learningExperiences: record.learningExperiences || '',
            resources: record.resources || '',
            assessment: record.assessment || ''
          }], false);
          clearSources();
          setStatus('This is a legacy weekly scheme. Saving will keep it as a weekly record.');
        } else {
          form.elements.weeksInTerm.value = record.weeksInTerm;
          form.elements.breakWeeksInput.value = (record.breakWeeks || []).join(', ');
          planContextKey = getPlanContextKey(parseConfiguration());
          renderWeeklyPlan(record.weeklyPlan, false);
          renderSources(record.curriculumSources || []);
        }
        if (editingLegacy) planContextKey = getPlanContextKey(parseConfiguration());
        submit.textContent = editingLegacy ? 'Update weekly scheme' : 'Update term scheme';
        cancel.hidden = false;
        setWizardStep(3);
        showPanel('Create');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        setStatus(error.message || 'Could not open term scheme.', true);
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

  root.querySelector('[data-scheme-refresh]').addEventListener('click', event => loadRecords(true, event.currentTarget));
  cancel.addEventListener('click', resetForm);
  form.elements.academicYear.value = new Date().getFullYear();
}
