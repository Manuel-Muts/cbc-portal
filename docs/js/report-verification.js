(async function verifyPrintedReport() {
  const status = document.getElementById('status');
  const details = document.getElementById('reportDetails');
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    status.textContent = 'This QR code does not contain a report reference.';
    status.classList.add('invalid');
    return;
  }

  try {
    const response = await fetch(`${window.config.api.baseURL}/reports/verification/${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error(`Verification request failed (${response.status}).`);
    const result = await response.json();

    if (!result.valid) {
      status.textContent = 'This report reference is invalid or has been revoked.';
      status.classList.add('invalid');
      return;
    }

    status.textContent = 'This report reference is valid.';
    status.classList.add('valid');
    const report = result.report;
    const rows = [
      ['School', report.schoolName],
      ['Learner', report.learnerName],
      ['Grade', report.grade],
      ['Term', report.term],
      ['Academic year', report.academicYear]
    ];

    details.replaceChildren(...rows.flatMap(([label, value]) => {
      if (value === null || value === undefined || value === '') return [];
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = String(value);
      return [term, description];
    }));
    details.hidden = false;
  } catch (error) {
    console.error('Report verification failed:', error);
    status.textContent = 'Could not verify this report right now. Please try again later.';
    status.classList.add('invalid');
  }
})();
