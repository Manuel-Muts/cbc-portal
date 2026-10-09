const apiBase = () => {
  const baseURL = window.config?.api?.baseURL;
  if (!baseURL) throw new Error('API base URL is not configured.');
  return `${baseURL}/teacher-planning`;
};

export const escapePlanningHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

export const renderPlanningTableState = (_columnCount, message, state = '') => `
  <div class="teacher-planning-list-state${state ? ` ${state}` : ''}" role="status" aria-live="polite">
    ${state === 'loading' ? '<span class="teacher-planning-table-spinner" aria-hidden="true"></span>' : ''}
    <span>${escapePlanningHtml(message)}</span>
  </div>
`;

const createClientPlanningPdf = ({ title, subject, grade, weekNumber, fileName, fields }) => {
  const jsPDFClass = window.jsPDF || window.jspdf?.jsPDF;
  if (!jsPDFClass) throw new Error('PDF export is unavailable. Reload the page and try again.');

  const pdf = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 19;
  const teacherName = [
    document.getElementById('teacherProfileName')?.textContent,
    document.getElementById('overviewTeacherName')?.textContent
  ].map(name => String(name ?? '').trim()).find(name => name && name !== 'Teacher') || 'Teacher';
  const printedDate = new Date().toLocaleDateString();
  let y = margin;

  const drawHeader = (continued = false) => {
    const headerHeight = continued ? 24 : 38;
    pdf.setFillColor(8, 145, 178);
    pdf.rect(0, 0, pageWidth, 3, 'F');
    pdf.setFillColor(15, 55, 82);
    pdf.roundedRect(margin, margin, contentWidth, headerHeight, 3, 3, 'F');
    pdf.setFillColor(14, 165, 190);
    pdf.roundedRect(margin, margin, 3, headerHeight, 1.5, 1.5, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(103, 232, 249);
    pdf.text('TEACHER PLANNING', margin + 8, margin + 7);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(continued ? 13 : 19);
    const heading = continued
      ? `${subject || 'Planning'} ${title} (continued)`
      : `${subject || 'TEACHER'} ${title}`.toUpperCase();
    pdf.text(pdf.splitTextToSize(heading, contentWidth - 16).slice(0, 2), margin + 8, margin + (continued ? 17 : 18));

    if (!continued) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(226, 232, 240);
      const headerDetails = [
        `Grade ${grade || '—'}`,
        `Teacher: ${teacherName}`,
        weekNumber !== undefined && weekNumber !== null && weekNumber !== ''
          ? `Week ${weekNumber}`
          : ''
      ].filter(Boolean).join('    |    ');
      pdf.text(pdf.splitTextToSize(headerDetails, contentWidth - 16).slice(0, 2), margin + 8, margin + 31);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(203, 213, 225);
    pdf.text(printedDate, pageWidth - margin - 7, margin + 7, { align: 'right' });
    y = margin + headerHeight + 8;
    pdf.setTextColor(15, 23, 42);
  };

  const addPage = () => {
    pdf.addPage();
    drawHeader(true);
  };

  pdf.setProperties({
    title: `${title} - ${subject || ''} ${grade || ''}`.trim(),
    subject: 'Teacher planning record',
    author: teacherName
  });
  drawHeader();

  const metadataLabels = new Set(['Academic year', 'Term', 'Lesson date', 'Topic']);
  const metadata = [
    ['Subject', subject],
    ['Grade', grade],
    ...fields.filter(([label]) => metadataLabels.has(label))
  ].filter(([, value]) => String(value ?? '').trim());
  const sections = fields.filter(([label]) => !metadataLabels.has(label) && label !== 'Subject' && label !== 'Grade');
  const tileGap = 4;
  const tileWidth = (contentWidth - tileGap) / 2;

  for (let index = 0; index < metadata.length; index += 2) {
    const row = metadata.slice(index, index + 2).map(([label, value]) => ({
      label,
      lines: pdf.splitTextToSize(String(value), tileWidth - 10)
    }));
    const rowHeight = Math.max(...row.map(tile => 13 + tile.lines.length * 4.5));
    if (y + rowHeight > bottom) addPage();

    row.forEach((tile, column) => {
      const x = margin + column * (tileWidth + tileGap);
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(x, y, tileWidth, rowHeight, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text(tile.label.toUpperCase(), x + 5, y + 5);
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(tile.lines, x + 5, y + 10);
    });
    y += rowHeight + 4;
  }

  if (metadata.length) y += 3;

  for (const [label, rawValue] of sections) {
    const valueLines = pdf.splitTextToSize(String(rawValue ?? '').trim() || '—', contentWidth - 4);
    if (y + 17 > bottom) addPage();

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(8, 105, 130);
    pdf.setFillColor(8, 145, 178);
    pdf.roundedRect(margin, y, 1.5, 6, 0.7, 0.7, 'F');
    pdf.text(label.toUpperCase(), margin + 5, y + 4.5);
    y += 10;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(30, 41, 59);

    for (const line of valueLines) {
      if (y + 6 > bottom) addPage();
      pdf.text(line, margin + 2, y);
      y += 4.8;
    }

    y += 3.5;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 6;
  }

  const pageCount = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${teacherName}  |  ${title}`, margin, pageHeight - 8);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const safeFileName = String(fileName || title)
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'teacher-planning-record';
  pdf.save(`${safeFileName}.pdf`);
};

export const downloadPlanningRecordPdf = async ({ entity, recordId }) => {
  const token = window.authService?.getToken();
  if (!token) {
    window.authService?.redirectToLogin();
    throw new Error('Your session has expired. Sign in again.');
  }

  const response = await fetch(`${apiBase()}/pdf/${encodeURIComponent(entity)}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) {
    window.authService?.redirectToLogin();
    throw new Error('Your session has expired. Sign in again.');
  }
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const detail = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    throw new Error(detail?.message || `PDF download failed (${response.status}).`);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `planning-${entity}-${recordId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const requestApi = async (url, options = {}) => {
  const token = window.authService?.getToken();
  if (!token) {
    window.authService?.redirectToLogin();
    throw new Error('Your session has expired. Sign in again.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    window.authService?.redirectToLogin();
    throw new Error('Your session has expired. Sign in again.');
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const detail = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    throw new Error(detail?.message || detail?.msg || `Request failed (${response.status}).`);
  }

  if (response.status === 204) return null;
  return response.json();
};

export const requestPlanningApi = (path, options = {}) => requestApi(`${apiBase()}${path}`, options);

export const initializeCurriculumFields = (
  gradeSelect,
  subjectSelect,
  strandSelect,
  subStrandSelect,
  termSelect,
  weekInput,
  onError
) => {
  let loadSequence = 0;
  const appendOption = (select, value, label = value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  };

  const populate = async (selectedStrand = '', selectedSubStrand = '') => {
    const sequence = ++loadSequence;
    strandSelect.disabled = true;
    subStrandSelect.disabled = true;
    strandSelect.innerHTML = '<option value="">Loading curriculum…</option>';
    subStrandSelect.innerHTML = '<option value="">Select a strand first</option>';
    if (!gradeSelect.value || !subjectSelect.value) {
      strandSelect.innerHTML = '<option value="">Select grade and subject first</option>';
      return;
    }

    const query = new URLSearchParams({ grade: gradeSelect.value, subject: subjectSelect.value });
    if (termSelect?.value) query.set('term', termSelect.value);
    let result;
    try {
      result = await requestPlanningApi(`/curriculum/options?${query}`);
    } catch (error) {
      if (sequence === loadSequence) {
        strandSelect.innerHTML = '<option value="">Curriculum options unavailable</option>';
        subStrandSelect.innerHTML = '<option value="">Try changing the grade or subject</option>';
      }
      throw error;
    }
    if (sequence !== loadSequence) return;
    const { options = [], teachingWeeks } = result;
    if (weekInput) {
      weekInput.max = Number.isInteger(teachingWeeks) ? String(teachingWeeks) : '52';
      weekInput.dataset.teachingWeeks = Number.isInteger(teachingWeeks) ? String(teachingWeeks) : '';
    }
    strandSelect.innerHTML = '<option value="">Select curriculum strand</option>';
    const strands = [...new Set(options.map(option => option.strand))];
    strands.forEach(strand => appendOption(strandSelect, strand));
    if (selectedStrand && !strands.includes(selectedStrand)) {
      appendOption(strandSelect, selectedStrand, `${selectedStrand} (saved)`);
    }
    strandSelect.disabled = false;
    strandSelect.value = selectedStrand;

    const subStrands = options
      .filter(option => option.strand === strandSelect.value)
      .map(option => option.subStrand);
    subStrandSelect.innerHTML = '<option value="">Select curriculum sub-strand</option>';
    subStrands.forEach(subStrand => appendOption(subStrandSelect, subStrand));
    if (selectedSubStrand && !subStrands.includes(selectedSubStrand)) {
      appendOption(subStrandSelect, selectedSubStrand, `${selectedSubStrand} (saved)`);
    }
    subStrandSelect.disabled = false;
    subStrandSelect.value = selectedSubStrand;
    if (!strands.length) {
      strandSelect.innerHTML = '<option value="">No curriculum units published for this selection</option>';
      strandSelect.disabled = true;
      subStrandSelect.innerHTML = '<option value="">No curriculum sub-strands available</option>';
      subStrandSelect.disabled = true;
    }

    strandSelect.onchange = () => {
      subStrandSelect.innerHTML = '<option value="">Select curriculum sub-strand</option>';
      const availableSubStrands = options.filter(option => option.strand === strandSelect.value);
      availableSubStrands.forEach(option => appendOption(subStrandSelect, option.subStrand));
      if (!availableSubStrands.length) {
        subStrandSelect.innerHTML = '<option value="">No curriculum sub-strands available</option>';
      }
      subStrandSelect.disabled = !availableSubStrands.length;
    };
  };

  const refresh = () => populate().catch(error => {
    if (onError) onError(error);
    else console.error('Could not load curriculum options:', error);
  });
  const refreshTerm = () => populate(strandSelect.value, subStrandSelect.value).catch(error => {
    if (onError) onError(error);
    else console.error('Could not load curriculum options:', error);
  });
  gradeSelect.addEventListener('change', refresh);
  subjectSelect.addEventListener('change', refresh);
  termSelect?.addEventListener('change', refreshTerm);
  return {
    refresh: populate,
    setSelection: populate
  };
};

export const generatePlanningDraft = selections => requestPlanningApi('/generate', {
  method: 'POST',
  body: JSON.stringify(selections)
});

export const generateLessonDraftsFromScheme = (schemeId, lessonsPerWeek) => requestPlanningApi(
  `/schemes/${encodeURIComponent(schemeId)}/lesson-drafts`,
  {
    method: 'POST',
    body: JSON.stringify({ lessonsPerWeek })
  }
);

const planningPdfPaymentBase = () => {
  const baseURL = window.config?.api?.baseURL;
  if (!baseURL) throw new Error('API base URL is not configured.');
  return `${baseURL}/stk-payments/planning-pdf`;
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const showPlanningPdfPaymentDialog = ({ record, paymentBase }) => new Promise(resolve => {
  const overlay = document.createElement('div');
  overlay.className = 'teacher-planning-payment-overlay';
  overlay.innerHTML = `
    <section class="teacher-planning-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="teacherPlanningPaymentTitle">
      <h2 id="teacherPlanningPaymentTitle">Unlock planning PDFs</h2>
      <p>Pay KES 1 once to download Schemes of Work and Lesson Plans for ${escapePlanningHtml(record.subject)}, ${escapePlanningHtml(record.term)} ${escapePlanningHtml(record.academicYear)}.</p>
      <form data-planning-payment-form>
        <label for="planningPaymentPhone">M-Pesa phone number</label>
        <div class="teacher-planning-payment-phone">
          <span aria-hidden="true">254</span>
          <input id="planningPaymentPhone" name="phoneNumber" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="7XXXXXXXX" maxlength="9" pattern="7[0-9]{8}" aria-label="M-Pesa phone number after country code 254" required>
        </div>
        <p class="teacher-planning-payment-message" role="status" aria-live="polite" data-planning-payment-message></p>
        <div class="teacher-planning-payment-actions">
          <button class="btn secondary-btn" type="button" data-planning-payment-cancel>Cancel</button>
          <button class="btn primary-btn" type="submit" data-planning-payment-submit>Pay KES 1</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('[data-planning-payment-form]');
  const phone = overlay.querySelector('[name="phoneNumber"]');
  const message = overlay.querySelector('[data-planning-payment-message]');
  const cancel = overlay.querySelector('[data-planning-payment-cancel]');
  const submit = overlay.querySelector('[data-planning-payment-submit]');
  let settled = false;

  phone.addEventListener('input', () => {
    let digits = phone.value.replace(/\D/g, '');
    if (digits.startsWith('254')) digits = digits.slice(3);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    phone.value = digits.startsWith('7') ? digits.slice(0, 9) : '';
  });

  const finish = unlocked => {
    if (settled) return;
    settled = true;
    overlay.remove();
    resolve(unlocked);
  };
  const setBusy = busy => {
    submit.disabled = busy;
    phone.disabled = busy;
  };

  cancel.addEventListener('click', () => finish(false));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    setBusy(true);
    message.textContent = 'Sending the M-Pesa prompt…';

    try {
      const payment = await requestApi(paymentBase, {
        method: 'POST',
        body: JSON.stringify({
          academicYear: record.academicYear,
          term: record.term,
          subject: record.subject,
          phoneNumber: `254${phone.value.trim()}`
        })
      });
      if (settled) return;
      if (payment.unlocked) {
        finish(true);
        return;
      }
      if (payment.status === 'review') {
        message.textContent = 'This payment needs support review. Please contact your school administrator before trying again.';
        submit.disabled = true;
        cancel.disabled = false;
        phone.disabled = false;
        return;
      }
      if (!payment.paymentId) throw new Error('The payment reference was not returned. Please try again.');

      cancel.textContent = 'Stop waiting';
      message.textContent = payment.customerMessage || payment.message || 'Approve the KES 1 M-Pesa prompt on your phone. Waiting for confirmation…';
      const attemptStartedAt = Date.parse(payment.attemptStartedAt) || Date.now();
      const deadline = attemptStartedAt + 45000;
      while (!settled && Date.now() < deadline) {
        await wait(Math.min(3000, deadline - Date.now()));
        if (settled) return;
        if (Date.now() >= deadline) break;
        const currentPayment = await requestApi(`${paymentBase}/${encodeURIComponent(payment.paymentId)}`);
        if (settled) return;
        if (currentPayment.status === 'paid') {
          finish(true);
          return;
        }
        if (currentPayment.status === 'failed') {
          message.textContent = currentPayment.resultDescription || 'Payment was not completed. You can try again.';
          submit.textContent = 'Try payment again';
          setBusy(false);
          return;
        }
        if (currentPayment.status === 'review') {
          message.textContent = 'Payment confirmation needs support review. Please contact your school administrator.';
          submit.disabled = true;
          cancel.disabled = false;
          phone.disabled = false;
          return;
        }
      }

      if (settled) return;
      const finalPaymentStatus = await requestApi(`${paymentBase}/${encodeURIComponent(payment.paymentId)}`);
      if (settled) return;
      if (finalPaymentStatus.status === 'paid') {
        finish(true);
        return;
      }
      if (finalPaymentStatus.status === 'review') {
        message.textContent = 'Payment confirmation needs support review. Please contact your school administrator.';
        submit.disabled = true;
        phone.disabled = false;
        return;
      }
      message.textContent = finalPaymentStatus.resultDescription
        || 'No payment was confirmed within 45 seconds. You can retry. If the old M-Pesa prompt is still on your phone, decline or ignore it before requesting another.';
      submit.textContent = 'Retry payment';
      setBusy(false);
    } catch (error) {
      message.textContent = error.message || 'Could not start or check the payment. Please try again.';
      submit.textContent = 'Retry payment';
      setBusy(false);
    }
  });

  phone.focus();
});

export const ensurePlanningPdfAccess = async record => {
  const paymentBase = planningPdfPaymentBase();
  const query = new URLSearchParams({
    academicYear: String(record.academicYear ?? ''),
    term: String(record.term ?? ''),
    subject: String(record.subject ?? '')
  });
  const access = await requestApi(`${paymentBase}/access?${query}`);
  if (access.unlocked) return true;
  return showPlanningPdfPaymentDialog({ record, paymentBase });
};

export const initializeActiveTermSelect = async termSelect => {
  const cachedTermConfig = window.cbcSettingsCache?.get('term-config');
  let termConfig = cachedTermConfig;

  if (!termConfig) {
    const apiURL = window.config?.api?.baseURL;
    if (!apiURL) throw new Error('API base URL is not configured.');

    const data = await requestApi(`${apiURL}/settings/term-config`);
    termConfig = data?.termConfig;
    if (termConfig) window.cbcSettingsCache?.set('term-config', termConfig);
  }

  const configuredTerm = String(termConfig?.activeTerm ?? '').trim();
  if (!configuredTerm || termSelect.value) return;

  const termNumber = configuredTerm.match(/\d+/)?.[0];
  const activeTerm = termNumber ? `Term ${termNumber}` : configuredTerm;
  if (Array.from(termSelect.options).some(option => option.value === activeTerm)) {
    termSelect.value = activeTerm;
  }
};

export const initializeTeacherAllocationFields = async (gradeSelect, subjectSelect) => {
  gradeSelect.disabled = true;
  subjectSelect.disabled = true;
  gradeSelect.innerHTML = '<option value="">Loading allocated grades…</option>';
  subjectSelect.innerHTML = '<option value="">Select a grade first</option>';

  const apiURL = window.config?.api?.baseURL;
  if (!apiURL) throw new Error('API base URL is not configured.');

  const data = await requestApi(`${apiURL}/users/subjects/my-allocations`);
  if (!Array.isArray(data?.subjectAllocations)) {
    throw new Error('Could not read your teaching allocations.');
  }

  const allocationsByGrade = new Map();
  for (const allocation of data.subjectAllocations) {
    const grade = String(allocation.grade ?? '').trim();
    if (!grade) continue;
    if (!allocationsByGrade.has(grade)) {
      allocationsByGrade.set(grade, {
        label: String(allocation.classLabel || `Grade ${grade}`),
        subjects: new Set()
      });
    }
    for (const subject of Array.isArray(allocation.subjects) ? allocation.subjects : []) {
      const name = String(subject ?? '').trim();
      if (name) allocationsByGrade.get(grade).subjects.add(name);
    }
  }

  const appendOption = (select, value, label = value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  };

  gradeSelect.innerHTML = '<option value="">Select allocated grade</option>';
  for (const [grade, allocation] of allocationsByGrade) {
    appendOption(gradeSelect, grade, allocation.label);
  }
  if (!allocationsByGrade.size) appendOption(gradeSelect, '', 'No allocated grades');
  gradeSelect.disabled = !allocationsByGrade.size;

  const populateSubjects = (selectedSubject = '') => {
    const allocation = allocationsByGrade.get(gradeSelect.value);
    subjectSelect.innerHTML = '<option value="">Select allocated subject</option>';
    if (!allocation) {
      subjectSelect.disabled = true;
      return;
    }
    for (const subject of allocation.subjects) appendOption(subjectSelect, subject);
    if (selectedSubject && !allocation.subjects.has(selectedSubject)) {
      appendOption(subjectSelect, selectedSubject, `${selectedSubject} (saved)`);
    }
    if (!allocation.subjects.size && !selectedSubject) {
      appendOption(subjectSelect, '', 'No subjects allocated for this grade');
    }
    subjectSelect.disabled = false;
    subjectSelect.value = selectedSubject;
  };

  gradeSelect.addEventListener('change', () => populateSubjects());
  subjectSelect.disabled = true;

  return (grade, subject) => {
    const selectedGrade = String(grade ?? '');
    if (selectedGrade && !allocationsByGrade.has(selectedGrade)) {
      allocationsByGrade.set(selectedGrade, {
        label: `${selectedGrade} (saved)`,
        subjects: new Set()
      });
      appendOption(gradeSelect, selectedGrade, `${selectedGrade} (saved)`);
    }
    gradeSelect.value = selectedGrade;
    populateSubjects(String(subject ?? ''));
  };
};
