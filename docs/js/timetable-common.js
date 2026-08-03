const TimetableCommon = (function() {
  const CACHE_TTL = 5 * 60 * 1000;
  const TIMETABLES_CACHE_TTL = 2 * 60 * 1000;
  const ALLOCATIONS_CACHE_KEY = 'timetable_allocations_cache';
  const SAVED_TIMETABLES_CACHE_KEY = 'timetable_saved_cache';
  const SCHOOL_INFO_CACHE_KEY = 'timetable_school_info_cache';
  const DEFAULT_ACTIVITY_PERIODS = ['SPORTS', 'CLUBS & SOCIETIES', 'CAREER & GUIDANCE', 'GUIDANCE & COUNSELING', 'GENERAL CLEANING'];

  const DEFAULT_BREAKS = {
    pp: [
      { name: 'SHORT BREAK', afterLesson: 2, duration: 30 },
      { name: 'LONG BREAK', afterLesson: 4, duration: 30 }
    ],
    primary: [
      { name: 'SHORT BREAK', afterLesson: 2, duration: 20 },
      { name: 'LONG BREAK', afterLesson: 4, duration: 30 },
      { name: 'LUNCH', afterLesson: 6, duration: 80 },
      { name: 'WRAP UP', afterLesson: 8, duration: 5 }
    ],
    junior: [
      { name: 'SHORT BREAK', afterLesson: 2, duration: 10 },
      { name: 'LONG BREAK', afterLesson: 4, duration: 20 },
      { name: 'LUNCH', afterLesson: 6, duration: 70 },
      { name: 'WRAP UP', afterLesson: 8, duration: 5 }
    ],
    senior: [
      { name: 'BREAK', afterLesson: 2, duration: 30 },
      { name: 'BREAK', afterLesson: 4, duration: 10 },
      { name: 'LUNCH', afterLesson: 6, duration: 60 }
    ]
  };

  function getDefaultBreaks(key) {
    return Array.isArray(DEFAULT_BREAKS[key]) ? DEFAULT_BREAKS[key].slice() : [];
  }

  function getApiBase() {
    return window.config?.api?.baseURL || '';
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getTokenKey() {
    return window.config?.auth?.tokenKey || 'authToken';
  }

  function getAuthToken() {
    const tokenKey = getTokenKey();
    return window.authService?.getToken?.() ||
      localStorage.getItem(tokenKey) ||
      localStorage.getItem('token') ||
      sessionStorage.getItem(tokenKey) ||
      sessionStorage.getItem('token') ||
      null;
  }

  async function fetchSchoolInfo(force = false) {
    try {
      const token = getAuthToken();
      if (!token) return null;

      const cached = !force ? localStorage.getItem(SCHOOL_INFO_CACHE_KEY) : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < CACHE_TTL && parsed.data?.name) {
            window.schoolInfo = parsed.data;
            return parsed.data;
          }
        } catch {
          localStorage.removeItem(SCHOOL_INFO_CACHE_KEY);
        }
      }

      const res = await fetch(`${getApiBase()}/users/my-school?includeLogo=false&fields=name,schoolType`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.name) return null;
      localStorage.setItem(SCHOOL_INFO_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
      window.schoolInfo = data;
      return data;
    } catch (err) {
      console.error('TimetableCommon.fetchSchoolInfo error:', err);
      return null;
    }
  }

  function addMinutes(time, mins) {
    const [hours, minutes] = String(time || '08:20').split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
    const total = hours * 60 + minutes + Number(mins);
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function drawPdfHeader(doc, pageWidth, title, term, year) {
    const schoolName = (window.schoolInfo?.name || 'COMPETENCEHUB').toUpperCase();
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(schoolName, pageWidth / 2, 40, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${title} - ${term} ${year}`, pageWidth / 2, 58, { align: 'center' });
  }

  function addPdfFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const printedStr = `Printed: ${new Date().toLocaleString()}`;
      const brandStr = 'CompetenceHub Timetables';
      doc.text(printedStr, 40, pageHeight - 20);
      doc.text(brandStr, pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, pageHeight - 20, { align: 'right' });
    }
  }

  function getDefaultClassSettingsForGrade(grade) {
    const gradeText = String(grade || '').trim().toUpperCase();
    const isEarlyYears = gradeText === 'PG' || gradeText.startsWith('PP');
    const gradeMatch = String(grade || '').match(/\d+/);
    const gradeNum = gradeMatch ? Number.parseInt(gradeMatch[0], 10) : 0;
    const isPrimary = (gradeNum >= 1 && gradeNum <= 6) || isEarlyYears;
    const isJunior = gradeNum >= 7 && gradeNum <= 9;
    const isSenior = Boolean(window.cbcUtils?.isSeniorGrade?.(grade));

    if (gradeText === 'PG' || gradeText === 'PP1') {
      return {
        startTime: '08:20',
        lessonDuration: 30,
        lessonsPerDay: 5,
        breaks: getDefaultBreaks('pp')
      };
    }

    if (gradeText === 'PP2') {
      return {
        startTime: '08:20',
        lessonDuration: 35,
        lessonsPerDay: 6,
        breaks: getDefaultBreaks('pp')
      };
    }

    if (isPrimary) {
      return {
        startTime: '08:20',
        lessonDuration: 35,
        lessonsPerDay: 8,
        breaks: getDefaultBreaks('primary')
      };
    }

    if (isJunior) {
      return {
        startTime: '08:20',
        lessonDuration: 40,
        lessonsPerDay: 8,
        breaks: getDefaultBreaks('junior')
      };
    }

    if (isSenior) {
      return {
        startTime: '08:20',
        lessonDuration: 40,
        lessonsPerDay: 9,
        breaks: getDefaultBreaks('senior')
      };
    }

    return {
      startTime: '08:20',
      lessonDuration: 35,
      lessonsPerDay: 8,
      breaks: getDefaultBreaks('primary')
    };
  }

  function getSharedActivityOrder() {
    try {
      const stored = localStorage.getItem('tt_shared_activity_order');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_ACTIVITY_PERIODS.length) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Unable to load shared activity order from storage:', err);
    }
    return [...DEFAULT_ACTIVITY_PERIODS];
  }

  function getActivityCellLabel(dayIdx, extraActivities = getSharedActivityOrder()) {
    return dayIdx === 4 ? 'GENERAL CLEANING' : (extraActivities[dayIdx] || 'SPORTS');
  }

  function getLessonHeader(lessonIndex) {
    return `Lesson ${lessonIndex + 1}`;
  }

  function getDayLabels() {
    return ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  }

  function buildTeacherSchedulePdfPage(doc, schedule, pageWidth, term, year) {
    const title = `${schedule.name} — Teacher Timetable`;
    drawPdfHeader(doc, pageWidth, title, term, year);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryText = `${schedule.lessonCount || 0} lessons across ${schedule.classCount || 0} class${schedule.classCount === 1 ? '' : 'es'}`;
    doc.text(summaryText, pageWidth / 2, 56, { align: 'center' });

    const tSettings = schedule.settings || {
      lessonDuration: 35,
      lessonsPerDay: schedule.schedule.length || 8,
      startTime: '08:20',
      breaks: []
    };
    const isSenior = Boolean(window.cbcUtils?.isSeniorGrade?.(schedule.grade));

    const columns = Array.isArray(schedule.columns) && schedule.columns.length
      ? schedule.columns
      : buildTeacherColumns(tSettings, isSenior);

    function buildTeacherColumns(settings, isSeniorGrade) {
      const cols = [];
      let curTimeLocal = settings.startTime || '08:20';
      for (let l = 1; l <= Number(settings.lessonsPerDay || 8); l += 1) {
        const endTime = addMinutes(curTimeLocal, Number(settings.lessonDuration) || 35);
        cols.push({ type: 'LESSON', index: l - 1, pStart: curTimeLocal, pEnd: endTime, jStart: curTimeLocal, jEnd: endTime });
        curTimeLocal = endTime;
        (Array.isArray(settings.breaks) ? settings.breaks : []).filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
          cols.push({ type: 'BREAK', pStart: curTimeLocal, jStart: curTimeLocal, name: b.name || 'BREAK' });
          curTimeLocal = addMinutes(curTimeLocal, b.duration);
        });
      }
      if (!isSeniorGrade) {
        cols.push({ type: 'ACTIVITY', name: 'ACTIVITIES' });
      }
      return cols;
    }

    const activityOrder = Array.isArray(schedule.extraActivities) && schedule.extraActivities.length === 5
      ? schedule.extraActivities
      : getSharedActivityOrder();

    const head = [["DAY / TIME", ...columns.map(col => {
      if (col.type === 'ACTIVITY') return col.name.toUpperCase();
      if (col.type === 'BREAK') return `${col.pStart} / ${col.jStart}`;
      return `Lesson ${col.index + 1}\n${col.pStart}-${col.pEnd}\n${col.jStart}-${col.jEnd}`;
    })]];

    const body = getDayLabels().map((dayName, dIdx) => {
      const row = [dayName];
      columns.forEach(col => {
        if (col.type === 'ACTIVITY') {
          row.push(dIdx === 4 ? 'GENERAL CLEANING' : (activityOrder[dIdx] || 'SPORTS'));
        } else if (col.type === 'BREAK') {
          row.push(col.name || 'BREAK');
        } else {
          const content = schedule.schedule[col.index]?.[dIdx];
          if (content && content.subject) {
            row.push(`${window.cbcUtils.getAbbreviatedSubjectName(content.subject)}\n${content.classLabel}`);
          } else {
            row.push('-');
          }
        }
      });
      return row;
    });

    doc.autoTable({
      startY: 80,
      head,
      body,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 5,
        halign: 'center',
        valign: 'middle',
        overflow: 'linebreak',
        lineWidth: 0.5,
        lineColor: [40, 40, 40]
      },
      headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 8.5 },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      columnStyles: { 0: { fontStyle: 'bold', halign: 'left', width: 85, fillColor: [248, 250, 252] } },
      didParseCell: (data) => {
        const text = String(data.cell.text[0] || '');
        const upperText = text.toUpperCase();
        const isBreak = upperText.includes('BREAK') || upperText.includes('LUNCH');
        const isActivity = data.section === 'body' && data.column.index > 0 && /CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER/.test(upperText);

        if (data.section === 'body' && (isBreak || isActivity)) {
          data.cell.styles.fillColor = [241, 245, 249];
          if (isBreak) {
            data.cell.styles.textColor = [15, 23, 42];
            data.cell.styles.halign = 'center';
            data.cell.styles.valign = 'middle';
            data.cell.text = [upperText.includes('LUNCH') ? 'LUNCH' : 'BREAK'];
          }
        }

        if (data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && !isActivity) {
          data.cell.styles.textColor = [255, 255, 255];
        }
      },
      didDrawCell: (data) => {
        const text = String(data.cell.text[0] || '');
        const upperText = text.toUpperCase();
        const isBreak = upperText.includes('BREAK') || upperText.includes('LUNCH');
        const isActivity = data.section === 'body' && data.column.index > 0 && /CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER/.test(upperText);

        if (data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && !isActivity) {
          const doc = data.doc;
          const cell = data.cell;
          const p = cell.styles.cellPadding;
          const pTop = (typeof p === 'number' ? p : (p.top || 0));
          const pLeft = (typeof p === 'number' ? p : (p.left || 0));
          const pRight = (typeof p === 'number' ? p : (p.right || 0));
          const centerX = cell.x + pLeft + (cell.width - pLeft - pRight) / 2;
          let y = cell.y + pTop + 10;

          data.cell.text.forEach((line, idx) => {
            const isSecondary = idx > 0;
            doc.setFont('helvetica', isSecondary ? 'normal' : 'bold');
            doc.setFontSize(isSecondary ? 6.5 : 8);
            doc.setTextColor(isSecondary ? 37 : 15, isSecondary ? 99 : 23, isSecondary ? 235 : 42);
            const wrappedLines = doc.splitTextToSize(line, cell.width - 6);
            wrappedLines.forEach(l => {
              doc.text(l, centerX, y, { align: 'center' });
              y += isSecondary ? 7.5 : 9;
            });
            if (!isSecondary) y += 2;
          });
        }
      }
    });

    const workloadCounts = {};
    (schedule.schedule || []).forEach(row => {
      (row || []).forEach(slot => {
        if (slot && slot.subject) {
          const key = `${slot.subject} (${slot.classLabel})`;
          workloadCounts[key] = (workloadCounts[key] || 0) + 1;
        }
      });
    });

    const workloadRows = Object.entries(workloadCounts).map(([label, count]) => [label, `${count} lessons`]);
    const totalLessons = Object.values(workloadCounts).reduce((sum, count) => sum + count, 0);
    if (workloadRows.length > 0) {
      workloadRows.push([
        { content: 'TOTAL WEEKLY WORKLOAD', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: `${totalLessons} lessons`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
      ]);
      doc.autoTable({
        startY: doc.lastAutoTable?.finalY + 20 || 100,
        head: [['Subject (Grade)', 'Lessons per Week']],
        body: workloadRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 4, lineWidth: 0.5, lineColor: [40, 40, 40] },
        headStyles: { fillColor: [71, 85, 105], textColor: 255 },
        tableWidth: 250,
        margin: { left: 85 }
      });
    }
  }

  function mapToArray(allocationsOrMap) {
    if (allocationsOrMap instanceof Map) return Array.from(allocationsOrMap.values());
    if (Array.isArray(allocationsOrMap)) return allocationsOrMap;
    return [];
  }

  function getTeacherForSubject(grade, stream, subject, allocationsOrMap) {
    if (!grade || !subject) return null;
    const subjectKey = normalizeKey(subject);
    if (!subjectKey) return null;

    const gradeKey = normalizeKey(window.cbcUtils?.normalizeGrade(grade) || grade);
    const streamKey = normalizeKey(stream || '');

    if (allocationsOrMap instanceof Map) {
      return allocationsOrMap.get(`${gradeKey}|${streamKey}|${subjectKey}`) || null;
    }

    const allocations = mapToArray(allocationsOrMap);
    for (const teacher of allocations) {
      const sources = Array.isArray(teacher.allocations) ? teacher.allocations : [];
      for (const allocation of sources) {
        if (normalizeKey(window.cbcUtils?.normalizeGrade(allocation.grade) || allocation.grade) !== gradeKey) continue;
        if (normalizeKey(allocation.stream) !== streamKey) continue;
        const subjects = Array.isArray(allocation.subjects) ? allocation.subjects : [];
        if (subjects.some(s => normalizeKey(s) === subjectKey)) {
          return { id: teacher._id || teacher.id || teacher.name, name: teacher.name };
        }
      }
    }
    return null;
  }

  function getClassTeacherForGrade(grade, stream, allocationsOrArray) {
    if (!grade) return null;
    const allocations = mapToArray(allocationsOrArray);
    const targetGrade = normalizeKey(grade);
    const targetStream = normalizeKey(stream || '');

    const teacher = allocations.find(t => {
      if (!t.assignedClass) return false;
      return normalizeKey(t.assignedClass) === targetGrade && normalizeKey(t.assignedStream || '') === targetStream;
    });
    return teacher ? teacher.name : null;
  }

  function buildClassTimetablePdfPage(doc, tt, pageWidth, allocationSource) {
    const term = tt.term || '';
    const year = tt.academicYear || tt.year || '';
    const title = `${tt.grade}${tt.stream ? ' ' + tt.stream : ''} WEEKLY TIMETABLE`;
    drawPdfHeader(doc, pageWidth, title, term, year);

    const allocationMap = allocationSource instanceof Map ? allocationSource : buildAllocationMap(allocationSource);
    const classTeacher = getClassTeacherForGrade(tt.grade, tt.stream, allocationSource);

    const fallbackSettings = getDefaultClassSettingsForGrade(tt.grade);
    const settings = {
      ...fallbackSettings,
      ...(tt.settings || {})
    };
    const duration = Number(settings.lessonDuration) || fallbackSettings.lessonDuration;
    const lessonCount = Number(settings.lessonsPerDay) || fallbackSettings.lessonsPerDay;
    const breaks = Array.isArray(settings.breaks) && settings.breaks.length
      ? settings.breaks
      : fallbackSettings.breaks || [];
    const isSenior = Boolean(window.cbcUtils?.isSeniorGrade?.(tt.grade));

    const colDefs = [];
    let curTime = settings.startTime || '08:20';
    for (let l = 1; l <= lessonCount; l += 1) {
      const endTime = addMinutes(curTime, duration);
      colDefs.push({ type: 'L', lNum: l, label: `Lesson ${l}\n${curTime}-${endTime}` });
      curTime = endTime;
      breaks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
        colDefs.push({ type: 'B', label: curTime, breakName: b.name });
        curTime = addMinutes(curTime, b.duration);
      });
    }
    if (!isSenior) {
      colDefs.push({ type: 'A', label: 'ACTIVITIES' });
    }

    const head = [["DAY / TIME", ...colDefs.map(c => c.label)]];
    const activityOrder = Array.isArray(tt.extraActivities) && tt.extraActivities.length === 5 ? tt.extraActivities : getSharedActivityOrder();

    const body = getDayLabels().map((dayName, dIdx) => {
      const row = [dayName];
      colDefs.forEach(col => {
        if (col.type === 'B') {
          row.push(col.breakName || 'BREAK');
          return;
        }
        if (col.type === 'A') {
          row.push(getActivityCellLabel(dIdx, activityOrder));
          return;
        }

        const subject = tt.grid?.[col.lNum - 1]?.[dIdx];
        if (!subject) {
          row.push('-');
          return;
        }

        const normalizedSubject = String(subject).trim();
        const upperSubject = normalizedSubject.toUpperCase();
        const isSpecial = upperSubject === 'PE' || upperSubject === 'PPI';
        if (isSpecial) {
          row.push(window.cbcUtils?.getAbbreviatedSubjectName(normalizedSubject) || normalizedSubject);
          return;
        }

        const teacher = getTeacherForSubject(tt.grade, tt.stream, normalizedSubject, allocationMap);
        row.push(`${window.cbcUtils?.getAbbreviatedSubjectName(normalizedSubject) || normalizedSubject}\n(${teacher?.name || 'Unassigned'})`);
      });
      return row;
    });

    doc.autoTable({
      startY: 80,
      head,
      body,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 6,
        minCellHeight: 72,
        halign: 'center',
        valign: 'top',
        overflow: 'linebreak',
        lineWidth: 0.5,
        lineColor: [40, 40, 40]
      },
      headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 10, minCellHeight: 24 },
      showHead: 'everyPage',
      rowPageBreak: 'auto',
      columnStyles: { 0: { fontStyle: 'bold', halign: 'left', width: 92, fillColor: [248, 250, 252] } },
      didParseCell: (data) => {
        const cellText = Array.isArray(data.cell.text) ? data.cell.text.join(' ').trim() : String(data.cell.text || '');
        const text = cellText.trim();
        const isBreak = text && (text.toUpperCase().includes('BREAK') || text.toUpperCase().includes('LUNCH'));
        const isActivity = data.section === 'body' && data.column.index > 0 && /CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER|ACTIVITIES/.test(text.toUpperCase());

        if (data.section === 'body' && isBreak) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [148, 163, 184];
          data.cell.styles.halign = 'center';
          data.cell.styles.valign = 'middle';
          data.cell.text = [text.toUpperCase().includes('LUNCH') ? 'LUNCH' : 'BREAK'];
        }

        if (data.section === 'body' && isActivity) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [15, 23, 42];
          data.cell.styles.halign = 'left';
          data.cell.styles.valign = 'top';
          data.cell.styles.fontStyle = 'bold';
          data.cell.text = [text];
        }

        if (data.section === 'body' && data.column.index > 0 && !isBreak && !isActivity && data.cell.text.length > 1) {
          data.cell.styles.textColor = [255, 255, 255];
        }
      },
      didDrawCell: (data) => {
        const cellText = Array.isArray(data.cell.text) ? data.cell.text.join(' ').trim() : String(data.cell.text || '');
        const text = cellText.trim();
        const isBreak = text.toUpperCase().includes('BREAK') || text.toUpperCase().includes('LUNCH');
        const isActivity = data.section === 'body' && data.column.index > 0 && /CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER|ACTIVITIES/.test(text.toUpperCase());

        if (data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && !isActivity) {
          const doc = data.doc;
          const cell = data.cell;
          const p = cell.styles.cellPadding;
          const pTop = (typeof p === 'number' ? p : (p.top || 0));
          const centerX = cell.x + cell.width / 2;
          let y = cell.y + pTop + 12;
          let inTeacherName = false;

          data.cell.text.forEach(line => {
            const trimmed = String(line).trim();
            if (trimmed.startsWith('(')) inTeacherName = true;
            const isTeacher = inTeacherName;
            doc.setFont('helvetica', isTeacher ? 'normal' : 'bold');
            doc.setFontSize(isTeacher ? 7.5 : 9);
            doc.setTextColor(isTeacher ? 37 : 15, isTeacher ? 99 : 23, isTeacher ? 235 : 42);
            const wrappedLines = doc.splitTextToSize(line, cell.width - 10);
            wrappedLines.forEach(l => {
              doc.text(l, centerX, y, { align: 'center' });
              y += isTeacher ? 8.2 : 10.0;
            });
            if (trimmed.endsWith(')')) inTeacherName = false;
            if (!isTeacher) y += 2;
          });
        }
      }
    });

    const tableBottomY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 14 : 82;
    const classTeacherText = String(classTeacher || 'UNASSIGNED').toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`CLASSTEACHER: ${classTeacherText}`, 40, tableBottomY, { align: 'left' });
  }

  async function fetchAllocations(force = false) {
    try {
      const token = getAuthToken();
      if (!token) return [];
      const cached = !force ? localStorage.getItem(ALLOCATIONS_CACHE_KEY) : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < CACHE_TTL && Array.isArray(parsed.data)) {
            return parsed.data;
          }
        } catch {
          localStorage.removeItem(ALLOCATIONS_CACHE_KEY);
        }
      }

      const res = await fetch(`${getApiBase()}/users/subjects/allocations?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        console.error(`TimetableCommon.fetchAllocations failed: ${res.status} ${res.statusText}`);
        return [];
      }
      const data = await res.json();
      const allocations = Array.isArray(data) ? data : data.data || [];
      localStorage.setItem(ALLOCATIONS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: allocations }));
      return allocations;
    } catch (err) {
      console.error('TimetableCommon.fetchAllocations error:', err);
      return [];
    }
  }

  async function fetchSavedTimetables(year, term, force = false) {
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      const cacheKey = `${SAVED_TIMETABLES_CACHE_KEY}_${year}_${term}`;
      const cached = !force ? localStorage.getItem(cacheKey) : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.timestamp && Date.now() - parsed.timestamp < TIMETABLES_CACHE_TTL && Array.isArray(parsed.data)) {
            return parsed.data;
          }
        } catch {
          localStorage.removeItem(cacheKey);
        }
      }

      const apiUrl = window.config?.getApiUrl ? window.config.getApiUrl(`/timetables/all?academicYear=${encodeURIComponent(year)}&year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`) : `${getApiBase()}/timetables/all?academicYear=${encodeURIComponent(year)}&year=${encodeURIComponent(year)}&term=${encodeURIComponent(term)}`;
      if (!apiUrl) {
        throw new Error('API base URL is not configured.');
      }

      const res = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        let body = null;
        try {
          body = await res.json();
        } catch {
          body = await res.text().catch(() => null);
        }
        const message = typeof body === 'object' && body ? body.message || JSON.stringify(body) : body || res.statusText;
        throw new Error(`Saved timetables request failed (${res.status}): ${message}`);
      }

      const data = await res.json();
      const timetables = Array.isArray(data) ? data : data.timetables || data.data || data.results || [];
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: timetables }));
      return timetables;
    } catch (err) {
      console.error('TimetableCommon.fetchSavedTimetables error:', err);
      throw err;
    }
  }

  function buildAllocationMap(allocations) {
    const map = new Map();
    if (!Array.isArray(allocations)) return map;
    allocations.forEach(teacher => {
      const teacherName = teacher.name || 'Teacher';
      const teacherId = teacher._id || teacher.id || teacherName;
      const subjectsAlloc = Array.isArray(teacher.allocations) ? teacher.allocations : [];
      subjectsAlloc.forEach(allocation => {
        const gradeKey = normalizeKey(window.cbcUtils?.normalizeGrade(allocation.grade) || allocation.grade || '');
        const streamKey = normalizeKey(allocation.stream || '');
        const subjects = Array.isArray(allocation.subjects) ? allocation.subjects : [];
        subjects.forEach(subject => {
          const subjectKey = normalizeKey(subject);
          if (subjectKey) {
            map.set(`${gradeKey}|${streamKey}|${subjectKey}`, { id: teacherId, name: teacherName });
          }
        });
      });
    });
    return map;
  }

  return {
    addMinutes,
    drawPdfHeader,
    addPdfFooter,
    getSharedActivityOrder,
    getActivityCellLabel,
    fetchSchoolInfo,
    getLessonHeader,
    getDayLabels,
    getTeacherForSubject,
    getClassTeacherForGrade,
    getAuthToken,
    fetchAllocations,
    fetchSavedTimetables,
    buildAllocationMap,
    buildClassTimetablePdfPage,
    buildTeacherSchedulePdfPage,
    normalizeKey,
    getDefaultBreaks
  };
})();
window.TimetableCommon = TimetableCommon;
