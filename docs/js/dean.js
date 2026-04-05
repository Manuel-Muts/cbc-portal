const API_BASE = config.api.baseURL;
const token = localStorage.getItem("token");

const deanRoleTextEl = document.getElementById("deanRoleText");
const deanStatusEl = document.getElementById("deanStatus");
const logoutBtn = document.getElementById("logoutBtn");

const filterGradeEl = document.getElementById("filterGrade");
const filterTermEl = document.getElementById("filterTerm");
const filterAssessmentEl = document.getElementById("filterAssessment");
const filterYearEl = document.getElementById("filterYear");
const applyFiltersBtn = document.getElementById("applyFiltersBtn");
const printReportBtn = document.getElementById("printReportBtn");
const printSubjectReportBtn = document.getElementById("printSubjectReportBtn");

const analysisSection = document.getElementById("analysisSection");
const classMeanEl = document.getElementById("classMean");
const topLearnerEl = document.getElementById("topLearner");
const lowLearnerEl = document.getElementById("lowLearner");
const topSubjectEl = document.getElementById("topSubject");
const passRateEl = document.getElementById("passRate");
const lowSubjectEl = document.getElementById("lowSubject");
const recordsCountEl = document.getElementById("recordsCount");
const rankingTableWrap = document.getElementById("rankingTableWrap");
const subjectTableWrap = document.getElementById("subjectTableWrap");
const subjectTableContainer = document.getElementById("subjectTableContainer");
const darkModeToggle = document.getElementById("darkModeToggle");

const gradeTrendChartEl = document.getElementById("gradeTrendChart");
let gradeTrendChart = null;

function redirectToLogin() {
  window.location.href = "login.html";
}

function redirectToTeacherDashboard() {
  window.location.href = "teacher-dashboard.html";
}

async function fetchWithAuth(endpoint, options = {}) {
  if (!token) {
    redirectToLogin();
    return;
  }

  const url = endpoint.startsWith("http") ? endpoint : endpoint;
  const finalOptions = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...options
  };

  const res = await fetch(url, finalOptions);
  if (res.status === 401 || res.status === 403) {
    console.error("Unauthorized access to", url);
    redirectToLogin();
    return null;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || data?.error || "Request failed";
    throw new Error(message);
  }

  return data;
}

function setText(element, text) {
  if (element) element.textContent = text;
}

// --- CBC GRADING HELPERS (for analysis) ---
const CBC_WEIGHTS = { continuousAssessment: 0.30, projectWork: 0.20, endTermExam: 0.50 };

function getScorePoints(score) {
  if (score >= 90) return 8; if (score >= 75) return 7; if (score >= 58) return 6; if (score >= 41) return 5;
  if (score >= 31) return 4; if (score >= 21) return 3; if (score >= 11) return 2; return 1;
}
function getPerformanceSubdivision(score) {
  if (score >= 90) return "EE1"; if (score >= 75) return "EE2"; if (score >= 58) return "ME1"; if (score >= 41) return "ME2";
  if (score >= 31) return "AE1"; if (score >= 21) return "AE2"; if (score >= 11) return "BE1"; return "BE2";
}
function calculateSeniorSchoolFinalScore(mark) {
  if (!mark) return null;
  const ca = mark.continuousAssessment; const pw = mark.projectWork; const et = mark.endTermExam;
  if (ca === null && pw === null && et === null) return null;
  const final = (Number(ca||0) * 0.3) + (Number(pw||0) * 0.2) + (Number(et||0) * 0.5);
  return Math.round(final * 10) / 10;
}

async function generateReport() {
  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const assessment = filterAssessmentEl.value;
  const year = filterYearEl.value;

  if (!grade) return alert("Please select a grade.");
  
  applyFiltersBtn.disabled = true;
  applyFiltersBtn.textContent = "Analyzing...";
  
  try {
    const params = new URLSearchParams({ grade, term, year, assessment });
    const data = await fetchWithAuth(`${API_BASE}/marks/by-grade?${params}`);
    
    analysisSection.style.display = "block";
    const gradeNum = parseInt(grade.match(/\d+/)?.[0] || 0);
    const isSenior = gradeNum >= 10;

    processAnalysisData(data, isSenior, assessment);
  } catch (err) {
    if (err.message.includes("No marks found")) {
      analysisSection.style.display = "none";
      alert("No results found for the selected filters.");
    } else {
      console.error("Analysis Error:", err);
      alert("Failed to analyze grade results.");
    }
  } finally {
    applyFiltersBtn.disabled = false;
    applyFiltersBtn.textContent = "🔍 View Results";
  }
}

function processAnalysisData(raw, isSenior, assessment) {
  const subjectsSet = new Set();
  const studentsMap = {};
  const subjectTotals = {};
  const subjectCounts = {};

  const isAll = assessment === "all";
  const statsGrid = analysisSection.querySelector(".stats-grid");
  const rankingCard = rankingTableWrap.closest(".dashboard-card");

  if (isAll) {
    if (statsGrid) statsGrid.style.display = "none";
    if (rankingCard) rankingCard.style.display = "none";
    if (printReportBtn) printReportBtn.style.display = "none";
    if (printSubjectReportBtn) printSubjectReportBtn.style.display = "none";
    if (subjectTableContainer) subjectTableContainer.style.display = "none";
    renderTrendChart(raw, isSenior);
    return;
  }

  if (printReportBtn) printReportBtn.style.display = "block";
  if (printSubjectReportBtn) printSubjectReportBtn.style.display = "block";
  if (statsGrid) statsGrid.style.display = "grid";
  if (rankingCard) rankingCard.style.display = "block";

  raw.forEach(m => {
    const key = `${m.admissionNo}_${m.assessment}`;
    if (!studentsMap[key]) {
      studentsMap[key] = { name: m.studentName, adm: m.admissionNo, assess: m.assessment, subjects: {} };
    }

    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (!subName) return;
      subjectsSet.add(subName);
      const score = isSenior ? calculateSeniorSchoolFinalScore(sub) : sub.score;
      if (score !== null) {
        studentsMap[key].subjects[subName] = score;
        subjectTotals[subName] = (subjectTotals[subName] || 0) + score;
        subjectCounts[subName] = (subjectCounts[subName] || 0) + 1;
      }
    });
  });

  const studentArray = Object.values(studentsMap).map(s => {
    const scores = Object.values(s.subjects);
    const total = scores.reduce((a, b) => a + b, 0);
    const mean = scores.length ? total / scores.length : 0;
    const points = scores.reduce((sum, sc) => sum + getScorePoints(sc), 0);
    return { ...s, total, mean, points };
  }).sort((a, b) => b.mean - a.mean);

  // Calculate ranks with ties (Standard Competition Ranking)
  let prevMean = null;
  let prevRank = 0;
  studentArray.forEach((s, idx) => {
    const currentMean = parseFloat(s.mean.toFixed(2));
    if (currentMean === prevMean) {
      s.rank = prevRank;
    } else {
      s.rank = idx + 1;
      prevRank = s.rank;
    }
    prevMean = currentMean;
  });

  // Identify top and lowest learners, handling ties
  const topMeanScore = studentArray.length > 0 ? studentArray[0].mean : -1;
  const topLearners = studentArray.filter(s => s.mean === topMeanScore);
  const topLearnerNames = topLearners.map(s => `${s.name} (${s.mean.toFixed(1)}%)`).join(', ');

  const lowMeanScore = studentArray.length > 0 ? studentArray[studentArray.length - 1].mean : -1;
  const lowLearners = studentArray.filter(s => s.mean === lowMeanScore);
  const lowLearnerNames = lowLearners.map(s => `${s.name} (${s.mean.toFixed(1)}%)`).join(', ');

  // Calculate top/low subjects
  const sortedSubjects = Array.from(subjectsSet).sort();
  let topSub = "-", lowSub = "-";
  let topVal = -1, lowVal = 101;

  sortedSubjects.forEach(s => {
    const mean = Number((subjectTotals[s] / subjectCounts[s]).toFixed(2));
    if (mean > topVal) { topVal = mean; topSub = s; }
    if (mean < lowVal) { lowVal = mean; lowSub = s; }
  });

  // Stats
  setText(classMeanEl, (studentArray.reduce((a, s) => a + s.mean, 0) / (studentArray.length || 1)).toFixed(2));
  setText(topLearnerEl, studentArray.length ? topLearnerNames : "-");
  setText(lowLearnerEl, studentArray.length ? lowLearnerNames : "-");
  setText(topSubjectEl, topSub !== "-" ? `${topSub} (${topVal.toFixed(1)}%)` : "-");
  setText(lowSubjectEl, lowSub !== "-" ? `${lowSub} (${lowVal.toFixed(1)}%)` : "-");
  setText(recordsCountEl, studentArray.length);

  // Calculate Pass Rate (students with mean score >= 41%)
  let passCount = 0;
  studentArray.forEach(s => {
    if (s.mean >= 41) { // ME2 or higher is considered passing
      passCount++;
    }
  });
  const passRate = studentArray.length > 0 ? (passCount / studentArray.length * 100).toFixed(1) : 0;
  setText(passRateEl, `${passRate}%`);

  // Tables
  renderTrendChart(raw, isSenior);
  renderRankingTable(studentArray, sortedSubjects, isSenior);
  renderSubjectStats(sortedSubjects, subjectTotals, subjectCounts);
}

function renderRankingTable(students, subjects, isSenior) {
  // Identify tied ranks
  const rankCounts = {};
  students.forEach(s => {
    rankCounts[s.rank] = (rankCounts[s.rank] || 0) + 1;
  });

  const totalHeader = !isSenior ? '<th class="total-column-header">Total</th>' : '';
  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Rank</th><th>Name</th><th>Adm</th>${subjects.map(s => `<th>${s}</th>`).join("")}${totalHeader}<th>Mean</th><th>Points</th><th>Level</th></tr></thead>
    <tbody>`;
  
  students.forEach((s, idx) => {
    const isTied = rankCounts[s.rank] > 1;
    const tiedClass = isTied ? ' class="tied-rank"' : '';
    const totalCell = !isSenior ? `<td>${s.total}</td>` : '';
    html += `<tr${tiedClass}>
      <td>${s.rank}</td><td>${s.name}</td><td>${s.adm}</td>
      ${subjects.map(sub => `<td>${s.subjects[sub] !== undefined ? s.subjects[sub] : "-"}</td>`).join("")}
      ${totalCell}
      <td>${s.mean.toFixed(1)}%</td><td>${s.points}</td><td>${getPerformanceSubdivision(s.mean)}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  rankingTableWrap.innerHTML = html;
}

async function downloadRankingAsPDF() {
  const table = rankingTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  // Fetch school info for the header
  let schoolName = "SCHOOL NAME";
  try {
    const schoolRes = await fetchWithAuth(`${API_BASE}/users/my-school`);
    if (schoolRes) {
      schoolName = (schoolRes.name || "SCHOOL NAME").toUpperCase();
    }
  } catch (err) {
    console.warn("Could not fetch school info for PDF header:", err);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const year = filterYearEl.value;
  const assessLabel = filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report";

  let yPos = 15;

  // 1. Header - School Name
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });

  // 2. Subheader - Year | Term | Assessment
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | Term ${term} | ${assessLabel}`, pageWidth / 2, yPos + 7, { align: "center" });

  // 3. Title Line
  doc.setFontSize(14);
  doc.text(`Grade Ranking Report: ${grade}`, 14, yPos + 17);

  // Extract headers and rows from the existing DOM table
  const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText);
  const tiedRowIndices = [];
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr, idx) => {
    if (tr.classList.contains("tied-rank")) {
      tiedRowIndices.push(idx);
    }
    return Array.from(tr.querySelectorAll("td")).map(td => td.innerText);
  });

  // Calculate Level Distribution
  const levelCounts = { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 };
  rows.forEach(row => {
    const level = row[row.length - 1];
    if (levelCounts[level] !== undefined) levelCounts[level]++;
  });

  doc.autoTable({ 
    startY: yPos + 23, 
    head: [headers], 
    body: rows, 
    theme: 'grid', 
    styles: { fontSize: 8 }, 
    headStyles: { fillColor: [52, 152, 219] },
    showHead: 'firstPage', // Only show table headers on the first page
    didParseCell: (data) => {
      if (data.section === 'body' && tiedRowIndices.includes(data.row.index)) {
        data.cell.styles.fillColor = [255, 249, 219]; // Light yellow matching .tied-rank CSS (#fff9db)
      }
      if (data.section === 'head' && data.cell.text[0] === 'Total') {
        data.cell.styles.fillColor = [52, 73, 94]; // Match #34495e header highlight
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber !== 1) return; // Only draw footer on the first page

      const footerY = pageHeight - 20;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      // Printed date (right)
      const dateStr = `Printed: ${new Date().toLocaleString()}`;
      doc.text(dateStr, pageWidth - 14, footerY, { align: "right" });

      // Dean signature space (right, below date)
      doc.text("__________________________", pageWidth - 14, footerY + 10, { align: "right" });
      doc.text("Dean's Signature", pageWidth - 14, footerY + 15, { align: "right" });
    }
  });

  // 4. Level Distribution Summary
  const summaryStartY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("REPORT SUMMARY", 14, summaryStartY); 

  doc.setFontSize(9);
  doc.text("Level Distribution", 14, summaryStartY + 6);

  doc.autoTable({
    startY: summaryStartY + 8,
    head: [['Level', 'Count']],
    body: Object.entries(levelCounts).map(([lvl, count]) => [lvl, count]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1 },
    headStyles: { fillColor: [52, 152, 219] },
    tableWidth: 40,
    margin: { left: 14 }
  });

  // Table 2 Label
  const keyX = 14 + 40 + 15; // margin + table1 width + gap
  doc.text("Performance Key", keyX, summaryStartY + 6);

  // 5. Performance Key (Last Page)
  doc.autoTable({
    startY: summaryStartY + 8,
    head: [['Level', 'Range', 'Pts']],
    body: [
      // Original Performance Key data
      ['EE1', '90-100', '8'], ['EE2', '75-89', '7'],
      ['ME1', '58-74', '6'], ['ME2', '41-57', '5'],
      ['AE1', '31-40', '4'], ['AE2', '21-30', '3'],
      ['BE1', '11-20', '2'], ['BE2', '0-10', '1']
    ],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [44, 62, 80] }, // Darker theme for the key
    tableWidth: 45,
    margin: { left: keyX }
  });

  const fileName = `${schoolName}_${grade}_T${term}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
}

async function downloadSubjectPerformanceAsPDF() {
  const table = subjectTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  let schoolName = "SCHOOL NAME";
  try {
    const schoolRes = await fetchWithAuth(`${API_BASE}/users/my-school`);
    if (schoolRes) {
      schoolName = (schoolRes.name || "SCHOOL NAME").toUpperCase();
    }
  } catch (err) {
    console.warn("Could not fetch school info for PDF header:", err);
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const year = filterYearEl.value;
  const assessLabel = filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report";

  let yPos = 15;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | Term ${term} | ${assessLabel}`, pageWidth / 2, yPos + 7, { align: "center" });

  doc.setFontSize(14);
  doc.text(`Subject Performance Analysis: ${grade}`, 14, yPos + 17);

  const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText);
  const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => 
    Array.from(tr.querySelectorAll("td")).map(td => td.innerText)
  );

  doc.autoTable({ 
    startY: yPos + 23, 
    head: [headers], 
    body: rows, 
    theme: 'grid', 
    styles: { fontSize: 10 }, 
    headStyles: { fillColor: [46, 204, 113] }, // Green theme for subject stats
    showHead: 'firstPage', // Only show table headers on the first page
    didDrawPage: (data) => {
      if (data.pageNumber !== 1) return; // Only draw footer on the first page

      const footerY = pageHeight - 20;
      doc.setFontSize(9);
      const dateStr = `Printed: ${new Date().toLocaleString()}`;
      doc.text(dateStr, pageWidth - 14, footerY, { align: "right" });
      doc.text("__________________________", pageWidth - 14, footerY + 10, { align: "right" });
      doc.text("Dean's Signature", pageWidth - 14, footerY + 15, { align: "right" });
    }
  });

  const fileName = `${schoolName}_Subjects_${grade}_T${term}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
}

function renderSubjectStats(subjects, totals, counts) {
  if (!subjects.length) { subjectTableContainer.style.display = "none"; return; }
  subjectTableContainer.style.display = "block";
  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Subject</th><th>Mean Score</th><th>Entries</th></tr></thead>
    <tbody>`;
  subjects.forEach(s => {
    const mean = (totals[s] / counts[s]).toFixed(2);
    html += `<tr><td>${s}</td><td>${mean}%</td><td>${counts[s]}</td></tr>`;
  });
  html += "</tbody></table>";
  subjectTableWrap.innerHTML = html;
}

function renderTrendChart(raw, isSenior) {
  if (!gradeTrendChartEl || typeof Chart === 'undefined') return;

  if (gradeTrendChart) gradeTrendChart.destroy();

  // Group by assessment to get means
  const assessmentData = {};
  raw.forEach(m => {
    const assess = String(m.assessment);
    if (!assessmentData[assess]) {
      assessmentData[assess] = { total: 0, count: 0 };
    }

    m.subjects.forEach(sub => {
      const score = isSenior ? calculateSeniorSchoolFinalScore(sub) : sub.score;
      if (score !== null) {
        assessmentData[assess].total += score;
        assessmentData[assess].count += 1;
      }
    });
  });

  const labels = [];
  const dataset = [];
  const sortedAssessKeys = Object.keys(assessmentData).sort((a, b) => Number(a) - Number(b));
  const labelMap = { "0": "Midterm", "5": "End Term" };

  sortedAssessKeys.forEach(a => {
    labels.push(labelMap[a] || `Assmt ${a}`);
    dataset.push((assessmentData[a].total / (assessmentData[a].count || 1)).toFixed(2));
  });

  const isDark = document.body.classList.contains("dark-mode");

  gradeTrendChart = new Chart(gradeTrendChartEl, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Grade Mean %',
        data: dataset,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      scales: { 
        y: { 
          beginAtZero: true, 
          max: 100,
          grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
          ticks: { color: isDark ? '#94a3b8' : '#666' }
        },
        x: {
          grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
          ticks: { color: isDark ? '#94a3b8' : '#666' }
        }
      },
      plugins: { legend: { labels: { color: isDark ? '#f8fafc' : '#666' } } }
    }
  });
}

function initFilters() {
  // Set Year to current
  const currentYear = new Date().getFullYear();
  if (filterYearEl) filterYearEl.value = currentYear;

  // Populate Assessments
  if (filterAssessmentEl) {
    filterAssessmentEl.innerHTML = '<option value="all">All Assessments</option>';
    const midterm = document.createElement("option");
    midterm.value = 0;
    midterm.textContent = "Midterm";
    filterAssessmentEl.appendChild(midterm);
    
    for (let i = 1; i <= 4; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `Assessment ${i}`;
      filterAssessmentEl.appendChild(opt);
    }
    const endTerm = document.createElement("option");
    endTerm.value = 5;
    endTerm.textContent = "End Term";
    filterAssessmentEl.appendChild(endTerm);
  }

  // Populate all school grades
  const grades = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
  grades.forEach(g => {
    const opt = document.createElement("option"); opt.value = g; opt.textContent = g;
    filterGradeEl.appendChild(opt);
  });
}

async function loadDeanProfile() {
  try {
    const profile = await fetchWithAuth(`${API_BASE}/users/user`);
    if (!profile) return;

    if (!profile.isDean) {
      alert("Only Deans can access this page.");
      return redirectToTeacherDashboard();
    }

    setText(deanRoleTextEl, profile.isDean ? "Authorized Dean access enabled." : "No dean authorization detected.");
    setText(deanStatusEl, profile.isDean ? "Authorized" : "Unauthorized");

    initFilters();
  } catch (error) {
    console.error("Dean profile error:", error);
    alert(error.message || "Unable to load dean profile.");
    redirectToTeacherDashboard();
  }
}

if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener("click", generateReport);
}

if (printReportBtn) {
  printReportBtn.addEventListener("click", downloadRankingAsPDF);
}

if (printSubjectReportBtn) {
  printSubjectReportBtn.addEventListener("click", downloadSubjectPerformanceAsPDF);
}

function bindLogout() {
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("userRole");
    localStorage.removeItem("schoolId");
    window.location.href = "login.html";
  });
}

function initDarkMode() {
  const isDark = localStorage.getItem("dean-dark-mode") === "true";
  if (isDark) {
    document.body.classList.add("dark-mode");
    if (darkModeToggle) darkModeToggle.textContent = "☀️";
  }
  
  darkModeToggle?.addEventListener("click", () => {
    const currentlyDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("dean-dark-mode", currentlyDark);
    darkModeToggle.textContent = currentlyDark ? "☀️" : "🌙";
    
    if (gradeTrendChart) {
      const gridColor = currentlyDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      const textColor = currentlyDark ? '#94a3b8' : '#666';
      
      gradeTrendChart.options.scales.y.grid.color = gridColor;
      gradeTrendChart.options.scales.y.ticks.color = textColor;
      gradeTrendChart.options.scales.x.grid.color = gridColor;
      gradeTrendChart.options.scales.x.ticks.color = textColor;
      gradeTrendChart.options.plugins.legend.labels.color = currentlyDark ? '#f8fafc' : '#666';
      gradeTrendChart.update();
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initDarkMode();
  bindLogout();
  if (!token) return redirectToLogin();
  loadDeanProfile();
});
