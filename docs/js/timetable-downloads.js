const TimetableDownloads = (function() {
  const yearSelect = document.getElementById('downloadYearSelect');
  const termSelect = document.getElementById('downloadTermSelect');
  const loadBtn = document.getElementById('loadSavedTimetablesBtn');
  const refreshBtn = document.getElementById('refreshSavedTimetablesBtn');
  const statusBanner = document.getElementById('downloadStatus');
  const savedTimetablesList = document.getElementById('savedTimetablesList');
  const teacherSchedulesList = document.getElementById('teacherSchedulesList');
  const downloadAllSavedClassesBtn = document.getElementById('downloadAllSavedClassesBtn');
  const downloadAllTeachersBtn = document.getElementById('downloadAllTeachersBtn');

  let savedTimetables = [];
  let allocations = [];
  let isBulkClassExporting = false;

  function init() {
    populateYearOptions();
    // auto-select current term
    try { if (termSelect) termSelect.value = getCurrentTerm(); } catch(e){}
    setupToastHelpers();
    if (loadBtn) loadBtn.addEventListener('click', handleLoadSavedTimetables);
    if (refreshBtn) refreshBtn.addEventListener('click', handleRefresh);
    if (downloadAllSavedClassesBtn) {
      downloadAllSavedClassesBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void handleDownloadAllSavedClasses();
      });
    }
    if (downloadAllTeachersBtn) downloadAllTeachersBtn.addEventListener('click', handleDownloadAllTeachers);
    loadSavedTimetables(true);
  }

  /* Toast + confirm helpers */
  function setupToastHelpers() {
    if (!window.showToast) {
      window.showToast = (msg, type = 'info', ttl = 4000) => {
        const container = document.getElementById('toastContainer');
        if (!container) return console.info(msg);
        const t = document.createElement('div');
        t.className = `toast ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
        t.textContent = msg;
        container.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.addEventListener('transitionend', () => t.remove()); }, ttl);
      };
    }

    if (!window.confirmAction) {
      window.confirmAction = async (options) => {
        return new Promise((resolve) => {
          const root = document.getElementById('confirmRoot');
          if (!root) return resolve(false);
          const overlay = document.createElement('div');
          overlay.className = 'confirm-overlay';
          const dlg = document.createElement('div');
          dlg.className = 'confirm-dialog';
          const p = document.createElement('p');
          p.textContent = options.message || 'Are you sure?';
          dlg.appendChild(p);
          const actions = document.createElement('div');
          actions.className = 'confirm-actions';
          const cancel = document.createElement('button');
          cancel.className = 'btn secondary-btn';
          cancel.textContent = options.cancelText || 'Cancel';
          const ok = document.createElement('button');
          ok.className = 'btn primary-btn';
          ok.textContent = options.okText || 'Proceed';
          actions.appendChild(cancel);
          actions.appendChild(ok);
          dlg.appendChild(actions);
          overlay.appendChild(dlg);
          root.appendChild(overlay);

          cancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
          ok.addEventListener('click', () => { overlay.remove(); resolve(true); });
        });
      };
    }
  }

  function populateYearOptions() {
    if (!yearSelect) return;
    const currentYear = new Date().getFullYear();
    const minYear = 2026;
    const maxYear = 3026;
    yearSelect.innerHTML = '';
    for (let y = minYear; y <= maxYear; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
  }

  function getCurrentTerm() {
    // Rough heuristics: Jan-Apr -> Term 1, May-Aug -> Term 2, Sep-Dec -> Term 3
    const m = new Date().getMonth() + 1; // 1-12
    if (m >= 1 && m <= 4) return 'Term 1';
    if (m >= 5 && m <= 8) return 'Term 2';
    return 'Term 3';
  }

  function showStatus(message, type = 'info') {
    if (!statusBanner) return;
    statusBanner.textContent = message;
    statusBanner.style.display = 'flex';
    statusBanner.style.background = type === 'error' ? '#fee2e2' : '#eef2ff';
    statusBanner.style.borderColor = type === 'error' ? '#fecaca' : '#c7d2fe';
    statusBanner.style.color = type === 'error' ? '#991b1b' : '#4338ca';
  }

  function clearStatus() {
    if (!statusBanner) return;
    statusBanner.style.display = 'none';
    statusBanner.textContent = '';
  }

  function notifyUser(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }
    if (window.cbcUtils?.showToast) {
      window.cbcUtils.showToast(message, type);
      return;
    }
    console.info(message);
  }

  async function requestConfirmation(message, okText = 'Proceed', cancelText = 'Cancel') {
    if (typeof window.confirmAction === 'function') {
      return window.confirmAction({ message, okText, cancelText });
    }
    if (window.cbcUtils?.showConfirmToast) {
      return window.cbcUtils.showConfirmToast(message, { confirmText: okText, cancelText });
    }
    return true;
  }

  async function handleLoadSavedTimetables() {
    await loadSavedTimetables(true);
  }

  async function handleRefresh() {
    clearStatus();
    await loadSavedTimetables(true);
  }

  async function loadSavedTimetables(force = false) {
    try {
      if (loadBtn) {
        loadBtn.disabled = true;
        loadBtn.innerHTML = '<span class="spinner"></span> Loading...';
      }
      if (refreshBtn) refreshBtn.disabled = true;

      const token = TimetableCommon.getAuthToken?.();
      if (!token) {
        showStatus('No active login session found. Please login again and refresh this page.', 'error');
        return;
      }

      await TimetableCommon.fetchSchoolInfo(force);
      const year = yearSelect.value;
      const term = termSelect.value;
      const data = await TimetableCommon.fetchSavedTimetables(year, term, force);
      savedTimetables = Array.isArray(data) ? data : [];
      if (!savedTimetables.length) {
        showStatus(`No saved timetables found for ${term} ${year}.`, 'info');
      } else {
        showStatus(`Loaded ${savedTimetables.length} saved timetable${savedTimetables.length === 1 ? '' : 's'} for ${term} ${year}.`, 'success');
      }
      await loadAllocations(force);
      renderSavedTimetables();
      renderTeacherSchedules();
    } catch (err) {
      console.error('Timetable Downloads loadSavedTimetables error:', err);
      showStatus(err.message || 'Unable to fetch saved timetables. Check your network or login session.', 'error');
    } finally {
      if (loadBtn) {
        loadBtn.disabled = false;
        loadBtn.innerHTML = '<i class="fas fa-download"></i> Load Saved Class Timetables';
      }
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  async function loadAllocations(force = false) {
    if (!force && allocations.length) return;
    allocations = await TimetableCommon.fetchAllocations(force) || [];
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function buildAllocationMap() {
    return TimetableCommon.buildAllocationMap(allocations);
  }

  function getTeacherForSubject(grade, stream, subject, allocationMap) {
    return TimetableCommon.getTeacherForSubject(grade, stream, subject, allocationMap);
  }

  function getClassTeacherForGrade(grade, stream) {
    return TimetableCommon.getClassTeacherForGrade(grade, stream, allocations);
  }

  function renderSavedTimetables() {
    if (!savedTimetablesList) return;
    if (!savedTimetables.length) {
      savedTimetablesList.innerHTML = '<div class="saved-placeholder">No saved timetables available for the selected filters.</div>';
      return;
    }
    const sorted = savedTimetables.slice().sort((a, b) => {
      const gradeA = String(a.grade || '');
      const gradeB = String(b.grade || '');
      if (gradeA !== gradeB) return gradeA.localeCompare(gradeB, undefined, { numeric: true });
      return String(a.stream || '').localeCompare(String(b.stream || ''));
    });

    const cards = sorted.map((tt, index) => {
      const streamLabel = tt.stream ? ` / ${tt.stream}` : '';
      const title = `${tt.grade}${streamLabel}`;
      const year = tt.academicYear || tt.year || yearSelect.value;
      const subjectCount = Array.isArray(tt.grid) ? tt.grid.flat().filter(Boolean).length : 0;
      return `
        <div class="saved-timetable-card">
          <div class="saved-timetable-card__title">${title}</div>
          <div class="saved-timetable-card__meta">${subjectCount} lessons</div>
          <button class="btn secondary-btn download-class-btn" data-index="${index}" data-grade="${encodeURIComponent(tt.grade || '')}" data-stream="${encodeURIComponent(tt.stream || '')}" data-year="${encodeURIComponent(year)}" data-term="${encodeURIComponent(tt.term || termSelect.value)}">Download PDF</button>
        </div>`;
    }).join('');

    savedTimetablesList.innerHTML = `
      <div class="table-wrapper">
        <div class="saved-timetables-grid">${cards}</div>
      </div>`;

    document.querySelectorAll('.download-class-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = Number(btn.dataset.index);
        const sortedIndex = Number.isInteger(index) ? index : null;
        const tt = sortedIndex !== null && sortedIndex >= 0 ? sorted[sortedIndex] : null;
        if (!tt) {
          const grade = decodeURIComponent(btn.dataset.grade || '');
          const stream = decodeURIComponent(btn.dataset.stream || '');
          const year = decodeURIComponent(btn.dataset.year || yearSelect.value);
          const term = decodeURIComponent(btn.dataset.term || termSelect.value);
          const fallback = savedTimetables.find(item => normalizeKey(item.grade) === normalizeKey(grade) && normalizeKey(item.stream || '') === normalizeKey(stream || '') && String(item.academicYear || item.year || year) === String(year) && normalizeKey(item.term) === normalizeKey(term));
          if (!fallback) return showStatus('Selected timetable not found.', 'error');
          await downloadClassTimetablePdf(fallback);
          return;
        }
        await downloadClassTimetablePdf(tt);
      });
    });
  }

  function renderTeacherSchedules() {
    if (!teacherSchedulesList) return;
    const allocationMap = buildAllocationMap();
    const teacherSchedules = buildTeacherSchedules(allocationMap);
    const scheduleItems = Object.values(teacherSchedules).sort((a, b) => a.name.localeCompare(b.name));

    if (!scheduleItems.length) {
      teacherSchedulesList.innerHTML = '<div class="teacher-placeholder">No teacher schedule data could be derived from saved timetables.</div>';
      return;
    }

    teacherSchedulesList.innerHTML = `
      <div style="display:grid; gap:14px;">
        ${scheduleItems.map(schedule => `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div>
              <div style="font-weight:700; color:#0f172a;">${schedule.name}</div>
              <div style="color:#475569; font-size:0.9rem; margin-top:4px;">${schedule.lessonCount} assigned lesson${schedule.lessonCount === 1 ? '' : 's'} across ${schedule.classCount} class${schedule.classCount === 1 ? '' : 'es'}</div>
            </div>
            <button class="btn secondary-btn download-teacher-btn" data-teacher-id="${schedule.id}">Download PDF</button>
          </div>`).join('')}
      </div>`;

    document.querySelectorAll('.download-teacher-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teacherId = btn.dataset.teacherId;
        const schedule = buildTeacherSchedules(allocationMap)[teacherId];
        if (!schedule) return showStatus('Teacher schedule not found.', 'error');
        await downloadSingleTeacherPdf(schedule);
      });
    });
  }

  function buildTeacherSchedules(allocationMap) {
    const teacherSchedules = {};
    const selectedYear = yearSelect.value;
    const selectedTerm = termSelect.value;

    savedTimetables.forEach(tt => {
      const termMatches = !tt.term || normalizeKey(tt.term) === normalizeKey(selectedTerm);
      const yearMatches = !tt.academicYear || String(tt.academicYear) === String(selectedYear) || String(tt.year) === String(selectedYear);
      if (!termMatches || !yearMatches) return;
      const gradeKey = normalizeKey(tt.grade);
      const streamKey = normalizeKey(tt.stream || '');
      const classLabel = tt.stream ? `${tt.grade} ${tt.stream}` : tt.grade;
      const grid = Array.isArray(tt.grid) ? tt.grid : [];
      grid.forEach((lessonRow, lessonIndex) => {
        if (!Array.isArray(lessonRow)) return;
        lessonRow.forEach((subject, dayIndex) => {
          if (!subject) return;
          const teacher = getTeacherForSubject(tt.grade, tt.stream, subject, allocationMap);
          if (!teacher) return;
          if (!teacherSchedules[teacher.id]) {
            teacherSchedules[teacher.id] = {
              id: teacher.id,
              name: teacher.name,
              classes: new Set(),
              lessonCount: 0,
              schedule: [],
              settings: null,
              extraActivities: null
            };
          }
          const schedule = teacherSchedules[teacher.id];
          if (!schedule.settings && tt.settings) {
            schedule.settings = tt.settings;
          }
          if (!schedule.extraActivities && tt.extraActivities) {
            schedule.extraActivities = tt.extraActivities;
          }
          schedule.classes.add(classLabel);
          schedule.lessonCount += 1;
          if (!schedule.schedule[lessonIndex]) {
            schedule.schedule[lessonIndex] = Array(5).fill(null);
          }
          schedule.schedule[lessonIndex][dayIndex] = { subject, classLabel };
        });
      });
    });

    Object.values(teacherSchedules).forEach(schedule => {
      schedule.classCount = schedule.classes.size;
      schedule.classes = Array.from(schedule.classes).sort();
      if (!schedule.settings) {
        schedule.settings = {
          lessonDuration: 35,
          lessonsPerDay: schedule.schedule.length || 8,
          startTime: '08:20',
          breaks: []
        };
      }
      if (!schedule.extraActivities) {
        schedule.extraActivities = getSharedActivityOrder();
      }
      const maxLesson = schedule.schedule.length;
      for (let i = 0; i < maxLesson; i++) {
        if (!Array.isArray(schedule.schedule[i])) {
          schedule.schedule[i] = Array(5).fill(null);
        }
      }
    });
    return teacherSchedules;
  }

  function drawPdfHeader(doc, pageWidth, title, term, year) {
    return TimetableCommon.drawPdfHeader(doc, pageWidth, title, term, year);
  }

  function addMinutes(time, mins) {
    return TimetableCommon.addMinutes(time, mins);
  }

  function getLessonHeader(lessonIndex) {
    return TimetableCommon.getLessonHeader(lessonIndex);
  }

  function getDayLabels() {
    return TimetableCommon.getDayLabels();
  }

  function getSharedActivityOrder() {
    return TimetableCommon.getSharedActivityOrder();
  }

  function getActivityCellLabel(dayIdx, extraActivities = getSharedActivityOrder()) {
    return dayIdx === 4 ? 'GENERAL CLEANING' : (extraActivities[dayIdx] || 'GAMES & SPORTS');
  }

  function renderActivityCellHtml(activityName) {
    return `
      <td style="padding:4px 2px; text-align:center; border:1px solid #cbd5e1; background:#f1f5f9; min-width:90px; vertical-align:middle;">
        <div style="font-weight:900; font-size:0.72rem; color:#0f172a; text-transform:uppercase; letter-spacing:0.4px; line-height:1.25;">${activityName}</div>
      </td>`;
  }

  function buildClassTimetablePage(doc, tt, pageWidth, allocationMap) {
    return TimetableCommon.buildClassTimetablePdfPage(doc, tt, pageWidth, allocationMap);
  }


  async function downloadClassTimetablePdf(tt) {
    try {
      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!jsPDFClass) {
        notifyUser('PDF generation library not loaded.', 'error');
        return;
      }
      const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      buildClassTimetablePage(doc, tt, pageWidth, allocations);
      TimetableCommon.addPdfFooter(doc);

      const title = `${tt.grade}${tt.stream ? ' ' + tt.stream : ''} Timetable`;
      const filename = `${title.replace(/\s+/g, '_')}_${(tt.term || termSelect.value).replace(/\s+/g, '')}_${tt.academicYear || tt.year || yearSelect.value}.pdf`;
      doc.save(filename);
      notifyUser('Class timetable PDF ready.', 'success');
    } catch (err) {
      console.error('Class PDF generation error:', err);
      notifyUser('Failed to generate class timetable PDF.', 'error');
    }
  }

  async function handleDownloadAllSavedClasses() {
    if (isBulkClassExporting || downloadAllSavedClassesBtn?.disabled) {
      return;
    }

    isBulkClassExporting = true;
    if (downloadAllSavedClassesBtn) {
      window.spinner?.show(downloadAllSavedClassesBtn, 'Generating PDF...');
    }
    showStatus('Generating bulk class timetable PDF...', 'info');

    try {
      if (!savedTimetables.length) {
        showStatus('Loading saved timetables before downloading...', 'info');
        await loadSavedTimetables(true);
      }
      if (!savedTimetables.length) {
        showStatus('No saved timetables were found to download.', 'error');
        return;
      }

      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!jsPDFClass) {
        notifyUser('PDF generation library not loaded.', 'error');
        return;
      }
      const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      let generatedCount = 0;
      for (const tt of savedTimetables) {
        try {
          if (!tt || !tt.grade) continue;
          if (generatedCount > 0) doc.addPage();
          buildClassTimetablePage(doc, tt, pageWidth, allocations);
          generatedCount += 1;
        } catch (itemErr) {
          console.warn('Skipping one timetable in bulk export due to an error:', itemErr, tt);
        }
      }

      if (!generatedCount) {
        notifyUser('No class timetables could be added to the bulk PDF.', 'error');
        return;
      }

      TimetableCommon.addPdfFooter(doc);
      const filename = `All_Saved_Class_Timetables_${termSelect.value.replace(/\s+/g, '')}_${yearSelect.value}.pdf`;
      doc.save(filename);
      showStatus('Bulk class timetable PDF ready.', 'success');
      notifyUser('Bulk class timetable PDF ready.', 'success');
    } catch (err) {
      console.error('Bulk class PDF error:', err);
      showStatus('Failed to generate bulk class PDF.', 'error');
      notifyUser('Failed to generate bulk class PDF.', 'error');
    } finally {
      isBulkClassExporting = false;
      if (downloadAllSavedClassesBtn) {
        window.spinner?.hide(downloadAllSavedClassesBtn);
      }
    }
  }

  async function handleDownloadAllTeachers() {
    const allocationMap = buildAllocationMap();
    const teacherSchedules = Object.values(buildTeacherSchedules(allocationMap)).sort((a, b) => a.name.localeCompare(b.name));
    if (!teacherSchedules.length) {
      showStatus('No teacher schedules available to download.', 'error');
      return;
    }
    const ok = await window.confirmAction({ message: `Generate a combined PDF containing ${teacherSchedules.length} teacher schedules? This may take a few moments.` , okText: 'Generate', cancelText: 'Cancel' });
    if (!ok) return window.showToast('Bulk teacher download cancelled.', 'info');
    try {
      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!jsPDFClass) {
        window.showToast('PDF generation library not loaded.', 'error');
        return;
      }
      const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      teacherSchedules.forEach((schedule, index) => {
        if (index > 0) doc.addPage();
        TimetableCommon.buildTeacherSchedulePdfPage(doc, schedule, pageWidth, termSelect.value, yearSelect.value);
      });

      TimetableCommon.addPdfFooter(doc);
      const filename = `Teacher_Timetables_${termSelect.value.replace(/\s+/g, '')}_${yearSelect.value}.pdf`;
      doc.save(filename);
      window.showToast('Bulk teacher schedules PDF ready.', 'success');
    } catch (err) {
      console.error('Bulk teacher PDF generation error:', err);
      window.showToast('Failed to generate bulk teacher schedules PDF.', 'error');
    }
  }

  async function downloadSingleTeacherPdf(schedule) {
    try {
      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
      if (!jsPDFClass) {
        window.showToast('PDF generation library not loaded.', 'error');
        return;
      }
      const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      TimetableCommon.buildTeacherSchedulePdfPage(doc, schedule, pageWidth, termSelect.value, yearSelect.value);
      TimetableCommon.addPdfFooter(doc);
      const filename = `${schedule.name.replace(/\s+/g, '_')}_Teacher_Timetable_${termSelect.value.replace(/\s+/g, '')}_${yearSelect.value}.pdf`;
      doc.save(filename);
      window.showToast('Teacher schedule PDF ready.', 'success');
    } catch (err) {
      console.error('Single teacher PDF error:', err);
      window.showToast('Failed to generate teacher PDF.', 'error');
    }
  }

  return { init };
})();

window.TimetableDownloads = TimetableDownloads;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.TimetableDownloads) window.TimetableDownloads.init();
  });
} else {
  if (window.TimetableDownloads) window.TimetableDownloads.init();
}
