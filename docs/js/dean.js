const API_BASE = config.api.baseURL;
const logoutBtn = document.getElementById("logoutBtn");

const filterGradeEl = document.getElementById("filterGrade");
const filterTermEl = document.getElementById("filterTerm");
const filterAssessmentEl = document.getElementById("filterAssessment");
const filterYearEl = document.getElementById("filterYear");
const filterSubjectEl = document.getElementById("filterSubject");
const filterStreamEl = document.getElementById("filterStream");
const filterTargetEl = document.getElementById("filterTarget");
const chartTypeToggle = document.getElementById("chartTypeToggle");
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

const gradeTrendChartEl = document.getElementById("gradeTrendChart");
let gradeTrendChart = null;
let deanProfileData = null;
let currentAnalysisRawData = null;
let currentPrevRawData = null;
let currentIsSenior = false;

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY_PREFIX = "dean_analytics_cache_";

const SCHOOL_TYPES = {
  full: {
    label: "Full School (Grades 1-12)",
    gradeOptions: ["1","2","3","4","5","6","7","8","9","10","11","12"]
  },
  primary_junior: {
    label: "Primary + Junior (Grades 1-9)",
    gradeOptions: ["1","2","3","4","5","6","7","8","9"]
  },
  senior: {
    label: "Senior School (Grades 10-12)",
    gradeOptions: ["10","11","12"]
  }
};

let schoolInfo = null;

function getSchoolTypeKey() {
  return (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
}

function getGradeOptionsForSchool() {
  const schoolType = getSchoolTypeKey();
  return SCHOOL_TYPES[schoolType].gradeOptions.map(g => `Grade ${g}`);
}

function getAnalyticsCache(key) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + key));
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) return cached.data;
  } catch (e) {}
  return null;
}

function setAnalyticsCache(key, data) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (e) {}
}

async function fetchWithAuth(url, options = {}) {
  const token = authService.getToken();
  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 || res.status === 403) return authService.redirectToLogin();
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || "Request failed");
  }
  return res.json();
}

async function getImageBase64(url) {
  if (!url) return null;
  try {
    // Prepend backend URL if the path is relative (e.g., /uploads/...)
    const BACKEND_URL = config.api.baseURL.replace('/api', '');
    const absoluteUrl = (url.startsWith('http') || url.startsWith('data:')) 
      ? url 
      : `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    const response = await fetch(absoluteUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Image conversion error:", e);
    return null;
  }
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  if (tabBtns.length === 0) return;

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (!target) return;

      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const activePane = document.getElementById(target);
      if (activePane) {
        activePane.classList.add("active");
        
        // Always refresh charts when analytics tab is clicked to fix canvas layout issues
        if (target === "analyticsTab") {
           setTimeout(updateDashboardChart, 50);
        }
      }
    });
  });
}

async function generateReport() {
  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const assessment = filterAssessmentEl.value;
  const year = filterYearEl.value;

  if (!grade) return alert("Please select a grade.");
  
  const cacheKey = `${grade}_${term}_${year}_${assessment}`;
  const cached = getAnalyticsCache(cacheKey);

  if (cached) {
    console.log("✅ Using cached analytics for Grade: " + grade);
    analysisSection.style.display = "block";
    currentPrevRawData = cached.prevTermData;
    processAnalysisData(cached.rawData, cached.isSenior, assessment, cached.prevTermData);
    return;
  }
  
  applyFiltersBtn.disabled = true;
  applyFiltersBtn.textContent = "Analyzing...";
  try {
    const params = new URLSearchParams({ grade, term, year, assessment });
    const data = await fetchWithAuth(`${API_BASE}/marks/by-grade?${params}`);
    
    // Fetch previous term data for progress analysis if term > 1
    let prevTermData = null;
    const termNum = parseInt(term);
    if (termNum > 1) {
      try {
        const prevParams = new URLSearchParams({ grade, term: termNum - 1, year, assessment });
        prevTermData = await fetchWithAuth(`${API_BASE}/marks/by-grade?${prevParams}`);
      } catch (e) {
        console.log("Progress analysis skipped: Previous term data not found.");
      }
    }

    analysisSection.style.display = "block";
    const gradeNum = parseInt(grade.match(/\d+/)?.[0] || 0);
    const isSenior = gradeNum >= 10;

    currentPrevRawData = prevTermData;
    setAnalyticsCache(cacheKey, {
      rawData: data,
      isSenior: isSenior,
      prevTermData: prevTermData
    });

    processAnalysisData(data, isSenior, assessment, prevTermData);
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

function processAnalysisData(allRaw, isSenior, assessment, allPrevRaw = null) {
  const subjectsSet = new Set();
  const streamsSet = new Set();

  // Discover all subjects and streams available in this dataset
  allRaw.forEach(m => {
    if (m.stream) streamsSet.add(m.stream);
    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (subName) subjectsSet.add(subName);
    });
  });
  const sortedSubjects = Array.from(subjectsSet).sort();

  // Populate Stream Filter
  if (filterStreamEl) {
    const currentVal = filterStreamEl.value;
    filterStreamEl.innerHTML = '<option value="all">All Streams</option>';
    Array.from(streamsSet).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = `Stream ${s}`;
      filterStreamEl.appendChild(opt);
    });
    if (currentVal && Array.from(filterStreamEl.options).some(o => o.value === currentVal)) {
      filterStreamEl.value = currentVal;
    }
    filterStreamEl.style.display = streamsSet.size > 0 ? "inline-block" : "none";
  }

  // Filter data based on current stream selection
  const selectedStream = filterStreamEl?.value || "all";
  const raw = selectedStream === "all" ? allRaw : allRaw.filter(m => m.stream === selectedStream);
  const prevRaw = (allPrevRaw && selectedStream !== "all") ? allPrevRaw.filter(m => m.stream === selectedStream) : allPrevRaw;

  const studentsMap = {};
  const subjectTotals = {};
  const subjectCounts = {};
  const subjectTermStats = {}; // To track T1, T2, T3 means for trend line

  // Store current state for re-rendering
  currentAnalysisRawData = allRaw;
  currentIsSenior = isSenior;
  const isAll = assessment === "all" || filterTermEl?.value === "all";

  // Calculate previous subject means for progress indicators
  const prevSubjectMeans = {};
  const prevStudentMeans = {};
  if (prevRaw && Array.isArray(prevRaw)) {
    const pSubjectTotals = {};
    const pSubjectCounts = {};
    const pStudentsMap = {}; // This will hold student-level data for previous term

    prevRaw.forEach(m => {
      const studentKey = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
      if (!pStudentsMap[studentKey]) {
        pStudentsMap[studentKey] = { name: m.studentName, adm: m.admissionNo, assess: isAll ? "Overall" : m.assessment, subjects: {}, _sum: {}, _cnt: {} };
      }

      m.subjects.forEach(sub => {
        const subName = isSenior ? sub.course : sub.subject;
        if (!subName) return;
        const score = isSenior ? cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam) : sub.score;
        if (score !== null) {
          // For subject means
          pSubjectTotals[subName] = (pSubjectTotals[subName] || 0) + score;
          pSubjectCounts[subName] = (pSubjectCounts[subName] || 0) + 1;

          // For student means (similar logic as current term's studentsMap)
          if (isAll) {
            pStudentsMap[studentKey]._sum[subName] = (pStudentsMap[studentKey]._sum[subName] || 0) + score;
            pStudentsMap[studentKey]._cnt[subName] = (pStudentsMap[studentKey]._cnt[subName] || 0) + 1;
            pStudentsMap[studentKey].subjects[subName] = parseFloat((pStudentsMap[studentKey]._sum[subName] / pStudentsMap[studentKey]._cnt[subName]).toFixed(1));
          } else {
            pStudentsMap[studentKey].subjects[subName] = score;
          }
        }
      });
    });

    // Calculate previous subject means
    Object.keys(pSubjectCounts).forEach(s => {
      prevSubjectMeans[s] = pSubjectTotals[s] / pSubjectCounts[s];
    });

    // Calculate previous student means and populate prevStudentMeans
    Object.values(pStudentsMap).forEach(s => {
      const scores = Object.values(s.subjects);
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const studentKey = isAll ? s.adm : `${s.adm}_${s.assess}`; // Re-generate key for consistency
      prevStudentMeans[studentKey] = mean;
    });
  }

  // Populate Subject Filter
  if (filterSubjectEl) {
    const currentVal = filterSubjectEl.value;
    filterSubjectEl.innerHTML = '<option value="all">All Subjects (Mean)</option>';
    sortedSubjects.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      filterSubjectEl.appendChild(opt);
    });
    if (currentVal && Array.from(filterSubjectEl.options).some(o => o.value === currentVal)) {
      filterSubjectEl.value = currentVal;
    }
    filterSubjectEl.style.display = "inline-block";
  }

  // Detect stream counts and handle chart toggle visibility
  const hasMultipleStreams = streamsSet.size > 1;
  if (chartTypeToggle) {
    const toggleGroup = chartTypeToggle.closest(".filter-group") || chartTypeToggle.closest(".form-group") || chartTypeToggle.parentElement;
    // Always show the chart type toggle if data is present
    if (toggleGroup) toggleGroup.style.display = sortedSubjects.length > 0 ? "block" : "none";
    
    // Default to 'trend' (Timeline) view automatically
    chartTypeToggle.value = "trend";
  }

  // Show results area
  analysisSection.style.display = "block";
  
  // Calculate statistics for all cases (even All Assessments)
  raw.forEach(m => {
    // Group by admission number if "All" is selected to show overall means
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    if (!studentsMap[key]) {
      studentsMap[key] = { name: m.studentName, adm: m.admissionNo, assess: isAll ? "Overall" : m.assessment, subjects: {}, _sum: {}, _cnt: {} };
      studentsMap[key] = { 
        name: m.studentName, 
        adm: m.admissionNo, 
        stream: m.stream || "Unassigned", // Fix: Retain stream for grouped analysis
        assess: isAll ? "Overall" : m.assessment, 
        subjects: {}, _sum: {}, _cnt: {} 
      };
    }

    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (!subName) return;
      const score = isSenior ? cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam) : sub.score;
      if (score !== null) {
          // Collect per-term stats for the trend line
          const termNum = m.term;
          if (termNum >= 1 && termNum <= 3) {
            if (!subjectTermStats[subName]) {
              subjectTermStats[subName] = {
                1: { s: 0, c: 0 }, 2: { s: 0, c: 0 }, 3: { s: 0, c: 0 }
              };
            }
            subjectTermStats[subName][termNum].s += score;
            subjectTermStats[subName][termNum].c++;
          }

        if (isAll) {
          studentsMap[key]._sum[subName] = (studentsMap[key]._sum[subName] || 0) + score;
          studentsMap[key]._cnt[subName] = (studentsMap[key]._cnt[subName] || 0) + 1;
          studentsMap[key].subjects[subName] = parseFloat((studentsMap[key]._sum[subName] / studentsMap[key]._cnt[subName]).toFixed(1));
        } else {
          studentsMap[key].subjects[subName] = score;
        }
        subjectTotals[subName] = (subjectTotals[subName] || 0) + score;
        subjectCounts[subName] = (subjectCounts[subName] || 0) + 1;
      }
    });
  });

  const studentArray = Object.values(studentsMap).map(s => {
    const scores = Object.values(s.subjects);
    const total = scores.reduce((a, b) => a + b, 0);
    const mean = scores.length ? total / scores.length : 0;
    const points = scores.reduce((sum, sc) => sum + cbcUtils.getPoints(sc), 0);

    const studentKey = isAll ? s.adm : `${s.adm}_${s.assess}`;
    const pMean = prevStudentMeans[studentKey];
    const progress = pMean !== undefined ? (mean - pMean) : null;

    return { ...s, total, mean, points, progress };
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

  // Group subject data for summary stats and identify top/low subjects with ties
  const subjectList = sortedSubjects.map(s => ({
    name: s,
    mean: Number((subjectTotals[s] / subjectCounts[s]).toFixed(2)),
    count: subjectCounts[s]
  })).sort((a, b) => b.mean - a.mean);

  const topSubjectNames = subjectList.length > 0 ? subjectList.filter(s => s.mean === subjectList[0].mean).map(s => `${s.name} (${s.mean.toFixed(1)}%)`).join(', ') : "-";
  const lowSubjectNames = subjectList.length > 0 ? subjectList.filter(s => s.mean === subjectList[subjectList.length - 1].mean).map(s => `${s.name} (${s.mean.toFixed(1)}%)`).join(', ') : "-";

  // Stats
  setText(classMeanEl, (studentArray.reduce((a, s) => a + s.mean, 0) / (studentArray.length || 1)).toFixed(2));
  setText(topLearnerEl, studentArray.length ? topLearnerNames : "-");
  setText(lowLearnerEl, studentArray.length ? lowLearnerNames : "-");
  setText(topSubjectEl, topSubjectNames);
  setText(lowSubjectEl, lowSubjectNames);
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
  updateDashboardChart();
  renderRankingTable(studentArray, sortedSubjects, isSenior);
  renderSubjectStats(sortedSubjects, subjectTotals, subjectCounts, prevSubjectMeans, subjectTermStats);
}

function renderRankingTable(students, subjects, isSenior) {
  // Identify tied ranks
  const rankCounts = {};
  students.forEach(s => {
    rankCounts[s.rank] = (rankCounts[s.rank] || 0) + 1;
  });

  const totalHeader = !isSenior ? '<th class="total-column-header">Total</th>' : '';
  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Rank</th><th>Name</th><th>Adm</th>${subjects.map(s => `<th>${s}</th>`).join("")}${totalHeader}<th>Mean</th><th>Progress</th><th>Points</th><th>Level</th></tr></thead>
    <tbody>`;
  
  students.forEach((s, idx) => {
    const isTied = rankCounts[s.rank] > 1;
    const tiedClass = isTied ? ' class="tied-rank"' : '';
    const totalCell = !isSenior ? `<td>${s.total}</td>` : '';

    let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
    if (s.progress !== null) {
      const diff = s.progress;
      if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-arrow-up"></i> +${diff.toFixed(1)}</span>`;
      else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-arrow-down"></i> ${diff.toFixed(1)}</span>`;
      else progressHtml = `<span style="color:#3498db; font-size:0.8rem;"><i class="fas fa-minus"></i></span>`;
    }
    // Store progress value in a data attribute for PDF generation
    html += `<tr${tiedClass} data-progress="${s.progress !== null ? s.progress : ''}">
      <td>${s.rank}</td><td>${s.name}</td><td>${s.adm}</td>
      ${subjects.map(sub => `<td>${s.subjects[sub] !== undefined ? s.subjects[sub] : "-"}</td>`).join("")}
      ${totalCell}
      <td>${s.mean.toFixed(1)}%</td>
      <td>${progressHtml}</td>
      <td>${s.points}</td><td>${cbcUtils.getSubdivision(s.mean)}</td>
    </tr>`;
  });
  html += "</tbody></table>";
  rankingTableWrap.innerHTML = html;
}

async function downloadRankingAsPDF() {
  const table = rankingTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  const schoolName = deanProfileData?.schoolName || "SCHOOL NAME";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const grade = filterGradeEl.value;
  const termVal = filterTermEl.value;
  const termLabel = termVal === "all" ? "Full Year" : `Term ${termVal}`;
  const year = filterYearEl.value;
  const assessLabel = filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report";
  const selectedStream = filterStreamEl?.value || "all";
  const streamInfo = selectedStream !== "all" ? ` | Stream: ${selectedStream}` : "";

  let yPos = 15;

  // 1. Header - School Logo & Name
  if (deanProfileData && deanProfileData.schoolLogoBase64) {
    try {
      doc.addImage(deanProfileData.schoolLogoBase64, 'PNG', pageWidth / 2 - 15, yPos - 10, 30, 15);
      yPos += 12; // Adjust vertical position for text if logo is present
    } catch (e) {
      console.warn("Could not embed school logo in PDF:", e);
    }
  }

  // 1. Header - School Name
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });

  // 2. Subheader - Year | Term | Assessment
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | ${termLabel} | ${assessLabel}${streamInfo}`, pageWidth / 2, yPos + 7, { align: "center" });

  // 3. Title Line
  doc.setFontSize(14);
  doc.text(`Grade Ranking Report: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`, 14, yPos + 17);

  // Extract headers and rows from the existing DOM table
  const significantDropRowIndices = [];
  const SIGNIFICANT_DROP_THRESHOLD = -5; // Define what constitutes a "significant drop"

  let headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText);
  const tiedRowIndices = [];
  let rows = Array.from(table.querySelectorAll("tbody tr")).map((tr, idx) => {
    if (tr.classList.contains("tied-rank")) {
      tiedRowIndices.push(idx);
    }
    if (tr.dataset.progress && parseFloat(tr.dataset.progress) < SIGNIFICANT_DROP_THRESHOLD) {
      significantDropRowIndices.push(idx);
    }
    return Array.from(tr.querySelectorAll("td")).map(td => td.innerText);
  });

  // Remove "Mean" column from PDF export
  const meanIdx = headers.indexOf("Mean");
  if (meanIdx !== -1) {
    headers.splice(meanIdx, 1);
    rows = rows.map(row => {
      const newRow = [...row];
      newRow.splice(meanIdx, 1);
      return newRow;
    });
  }

  // Check if Progress column should be hidden (only N/A values)
  const progressIdx = headers.indexOf("Progress");
  if (progressIdx !== -1) {
    const allNA = rows.every(row => row[progressIdx] === "N/A");
    if (allNA) {
      headers.splice(progressIdx, 1);
      rows = rows.map(row => {
        const newRow = [...row];
        newRow.splice(progressIdx, 1);
        return newRow;
      });
    }
  }

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
      if (data.section === 'body' && significantDropRowIndices.includes(data.row.index)) {
        data.cell.styles.fillColor = [255, 204, 204]; // Light red for significant drop
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

      // Dean's digital signature image
       if (deanProfileData && deanProfileData.signatureBase64) {
        try {
          // Parameters: Image, Format, X, Y, Width, Height
          doc.addImage(deanProfileData.signatureBase64, 'PNG', pageWidth - 54, footerY + 1, 40, 8);
        } catch (e) {
          console.warn("Could not embed Dean signature in PDF:", e);
        }
      }

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

  const fileName = `${schoolName}_${grade}_T${termVal}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
}

async function downloadSubjectPerformanceAsPDF() {
  const table = subjectTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  const schoolName = deanProfileData?.schoolName || "SCHOOL NAME";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const grade = filterGradeEl.value;
  const termVal = filterTermEl.value;
  const termLabel = termVal === "all" ? "Full Year" : `Term ${termVal}`;
  const year = filterYearEl.value;
  const assessLabel = filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report";
  const selectedStream = filterStreamEl?.value || "all";
  const streamInfo = selectedStream !== "all" ? ` | Stream: ${selectedStream}` : "";

  let yPos = 15;

  // 1. Header - School Logo & Name
  if (deanProfileData && deanProfileData.schoolLogoBase64) {
    try {
      doc.addImage(deanProfileData.schoolLogoBase64, 'PNG', pageWidth / 2 - 15, yPos - 10, 30, 15);
      yPos += 12; // Adjust vertical position for text if logo is present
    } catch (e) {
      console.warn("Could not embed school logo in PDF:", e);
    }
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | ${termLabel} | ${assessLabel}${streamInfo}`, pageWidth / 2, yPos + 7, { align: "center" });

  doc.setFontSize(14);
  doc.text(`Subject Performance Analysis: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`, 14, yPos + 17);

  let headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText);
  const tiedRowIndices = [];
  let rows = Array.from(table.querySelectorAll("tbody tr")).map((tr, idx) => {
    if (tr.classList.contains("tied-rank")) tiedRowIndices.push(idx);
    return Array.from(tr.querySelectorAll("td")).map(td => td.innerText);
  });

  // Check if Progress column should be hidden (only N/A values)
  const progressIdx = headers.indexOf("Progress");
  if (progressIdx !== -1) {
    const allNA = rows.every(row => row[progressIdx] === "N/A");
    if (allNA) {
      headers.splice(progressIdx, 1);
      rows = rows.map(row => {
        const newRow = [...row];
        newRow.splice(progressIdx, 1);
        return newRow;
      });
    }
  }

  doc.autoTable({ 
    startY: yPos + 23, 
    head: [headers], 
    body: rows, 
    theme: 'grid', 
    styles: { fontSize: 10 },
    columnStyles: { 3: { fontSize: 8, halign: 'center' } }, // Optimize Trend column for PDF
    headStyles: { fillColor: [46, 204, 113] }, // Green theme for subject stats
    showHead: 'firstPage', // Only show table headers on the first page
    didParseCell: (data) => {
      if (data.section === 'body' && tiedRowIndices.includes(data.row.index)) {
        data.cell.styles.fillColor = [255, 249, 219];
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber !== 1) return; // Only draw footer on the first page

      const footerY = pageHeight - 20;
      if (deanProfileData && deanProfileData.signatureBase64) {
        try {
           doc.addImage(deanProfileData.signatureBase64, 'PNG', pageWidth - 54, footerY + 1, 40, 8);
        } catch (e) {
          console.warn("Could not embed Dean signature in PDF:", e);
        }
      }
      doc.setFontSize(9);
      const dateStr = `Printed: ${new Date().toLocaleString()}`;
      doc.text(dateStr, pageWidth - 14, footerY, { align: "right" });
      doc.text("__________________________", pageWidth - 14, footerY + 10, { align: "right" });
      doc.text("Dean's Signature", pageWidth - 14, footerY + 15, { align: "right" });
    }
  });

  const streamSuffix = selectedStream !== "all" ? `_S${selectedStream}` : "";
  const termSuffix = termVal === "all" ? "Year" : `T${termVal}`;
  const fileName = `${schoolName}_Subjects_${grade}${streamSuffix}_${termSuffix}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
}

function renderSubjectStats(subjects, totals, counts, prevMeans = {}, termStats = {}) {
  if (!subjects.length) { subjectTableContainer.style.display = "none"; return; }
  subjectTableContainer.style.display = "block";

  // Convert to object list and sort by performance
  const subjectList = subjects.map(s => ({
    name: s,
    mean: Number((totals[s] / counts[s]).toFixed(2)),
    count: counts[s]
  })).sort((a, b) => b.mean - a.mean);

  // Calculate ranks with tie consideration (Competition Ranking)
  let prevMean = null;
  let prevRank = 0;
  subjectList.forEach((s, idx) => {
    if (s.mean === prevMean) s.rank = prevRank;
    else { s.rank = idx + 1; prevRank = s.rank; }
    prevMean = s.mean;
  });

  const rankCounts = {};
  subjectList.forEach(s => { rankCounts[s.rank] = (rankCounts[s.rank] || 0) + 1; });

  // Helper for generating sparkline SVG
  const getTrendLine = (subName) => {
    const stats = termStats[subName];
    if (!stats) return "";
    const points = [];
    [1, 2, 3].forEach((t, i) => {
      if (stats[t] && stats[t].c > 0) {
        const val = stats[t].s / stats[t].c;
        points.push({ x: i * 25 + 5, y: 25 - (val / 100 * 20), val: val.toFixed(0) });
      }
    });

    // Prepare textual statistics for PDF export (picked up by innerText)
    const trendText = points.map((p, i) => `T${i+1}:${p.val}%`).join(' ');
    const hiddenLabel = `<span class="sr-only">${trendText}</span>`;

    if (points.length < 2) return hiddenLabel + `<span style="color:#94a3b8; font-size:0.75rem;">${points[0]?.val || '-'}%</span>`;
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for(let j=1; j<points.length; j++) path += ` L ${points[j].x} ${points[j].y}`;
    
    return hiddenLabel + `<svg width="60" height="30" style="vertical-align:middle; overflow:visible;">
      <path d="${path}" fill="none" stroke="#3498db" stroke-width="2" />
      ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#2980b9"><title>T: ${p.val}%</title></circle>`).join('')}
    </svg>`;
  };

  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Rank</th><th>Subject</th><th>Mean Score</th><th>Yearly Trend</th><th>Progress</th><th>Entries</th></tr></thead>
    <tbody>`;
  
  subjectList.forEach(s => {
    // Calculate progress HTML
    let progressHtml = '<span style="color:#94a3b8; font-size:0.75rem;">N/A</span>';
    const prevMean = prevMeans[s.name];
    if (prevMean !== undefined) {
      const diff = s.mean - prevMean;
      if (diff > 0.1) {
        progressHtml = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-arrow-up"></i> +${diff.toFixed(1)}</span>`;
      } else if (diff < -0.1) {
        progressHtml = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-arrow-down"></i> ${diff.toFixed(1)}</span>`;
      } else {
        progressHtml = `<span style="color:#3498db; font-size:0.8rem;"><i class="fas fa-minus"></i></span>`;
      }
    }

    const isTied = rankCounts[s.rank] > 1;
    const tiedClass = isTied ? ' class="tied-rank"' : '';
    html += `<tr${tiedClass}>
      <td>${s.rank}</td>
      <td>${s.name}</td>
      <td>${s.mean.toFixed(2)}%</td>
      <td style="text-align:center; padding: 2px;">${getTrendLine(s.name)}</td>
      <td>${progressHtml}</td>
      <td>${s.count}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  subjectTableWrap.innerHTML = html;
}

function updateDashboardChart() {
  if (!currentAnalysisRawData) return;
  const type = chartTypeToggle?.value || "trend";

  // Respect stream filter for trend analysis
  const selectedStream = filterStreamEl?.value || "all";
  const dataToChart = selectedStream === "all" ? currentAnalysisRawData : currentAnalysisRawData.filter(m => m.stream === selectedStream);

  if (type === "trend") {
    renderTrendChart(dataToChart, currentIsSenior);
  } else {
    renderStreamBarChart(currentAnalysisRawData, currentIsSenior);
  }
}

function renderTrendChart(raw, isSenior) {
  if (!gradeTrendChartEl || typeof Chart === 'undefined') return;

  const selectedSub = filterSubjectEl?.value || "all";
  const isAllTerms = filterTermEl?.value === "all";

  const manualTarget = filterTargetEl ? parseInt(filterTargetEl.value) : NaN;

  const getSubjectTarget = (sub) => {
    const targets = { Mathematics: 60, English: 65, Kiswahili: 65 };
    return targets[sub] || 50;
  };

  const currentTarget = !isNaN(manualTarget)
    ? manualTarget
    : (selectedSub === "all" ? 50 : getSubjectTarget(selectedSub));

  if (gradeTrendChart) gradeTrendChart.destroy();

  const assessmentData = {};

  raw.forEach(m => {
    const assess = String(m.assessment);
    const term = m.term;
    const key = isAllTerms ? `${term}_${assess.padStart(2, '0')}` : assess;

    if (!assessmentData[key]) {
      assessmentData[key] = {
        total: 0,
        count: 0,
        max: -1,
        min: 101,
        term,
        assessment: assess
      };
    }

    let studentSum = 0;
    let subjectCount = 0;

    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (!subName || (selectedSub !== "all" && subName !== selectedSub)) return;

      const score = isSenior
        ? cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam)
        : sub.score;

      if (score !== null) {
        studentSum += score;
        subjectCount++;
      }
    });

    if (subjectCount > 0) {
      const avg = studentSum / subjectCount;

      assessmentData[key].total += avg;
      assessmentData[key].count++;
      assessmentData[key].max = Math.max(assessmentData[key].max, avg);
      assessmentData[key].min = Math.min(assessmentData[key].min, avg);
    }
  });

  const labels = [];
  const meanData = [];
  const maxData = [];
  const minData = [];
  const targetData = [];

  const sortedKeys = Object.keys(assessmentData).sort();

  sortedKeys.forEach(k => {
    const d = assessmentData[k];
    
    const mapping = window.ASSESSMENT_MAPPING || {};
    const assessLabel = mapping[d.assessment] || `Assmt ${d.assessment}`;

    labels.push(isAllTerms ? `T${d.term} ${assessLabel}` : assessLabel);

    const hasData = d.count > 0;
    meanData.push(hasData ? (d.total / d.count).toFixed(1) : 0);
    maxData.push(hasData ? d.max.toFixed(1) : 0);
    minData.push(hasData ? d.min.toFixed(1) : 0);
    targetData.push(currentTarget);
  });

  const allValues = [...meanData, ...maxData, ...minData, ...targetData].map(v => Number(v) || 0);
  const maxValue = allValues.length ? Math.max(...allValues) : 100;
  const yMax = Math.ceil(maxValue + 10);

  gradeTrendChart = new Chart(gradeTrendChartEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Top Learner',
          data: maxData,
          borderColor: '#10b981',
          borderDash: [5, 5],
          pointRadius: 4,
          tension: 0.2
        },
        {
          label: 'Class Average',
          data: meanData,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,0.1)',
          borderWidth: 3,
          fill: true,
          pointRadius: 5,
          tension: 0.2
        },
        {
          label: 'Lowest Learner',
          data: minData,
          borderColor: '#ef4444',
          borderDash: [5, 5],
          pointRadius: 4,
          tension: 0.2
        },
        {
          label: `Target (${currentTarget}%)`,
          data: targetData,
          borderColor: '#f59e0b',
          borderDash: [8, 6],
          pointRadius: 0,
          tension: 0
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      layout: {
        padding: { top: 80, left: 60, right: 40, bottom: 40 }
      },

      scales: {
       y: {
  beginAtZero: true,
  suggestedMin: 0,
  suggestedMax: yMax,
  title: {
    display: true,
    font: { size: 16, weight: 'bold' },
    text: selectedSub === "all"
      ? 'Score (%)'
      : `${selectedSub} Score (%)`
  },

  grid: {
    color: 'rgba(0,0,0,0.05)'
  },

  ticks: {
    autoSkip: false,
    stepSize: 10,   // Spreads values out more than 5
    padding: 30,    
    font: { size: 18, weight: '800' } // Extremely clear labels for the tall axis
  }
},

        x: {
          title: { display: true, text: 'Assessment Timeline' },
          grid: { display: true, color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            padding: 15,
            autoSkip: true, // Prioritize vertical space by skipping X labels if they crowd
            maxRotation: 0, // Keep horizontal to save height
            minRotation: 0 
          }
        }
      },

      plugins: {
        legend: {
          position: 'top',
          labels: { padding: 20 }
        },

        tooltip: {
          mode: 'index',
          intersect: false,
          padding: 10
        },

        datalabels: {}
      }
    }
  });
}

function renderStreamBarChart(raw, isSenior) {
  if (!gradeTrendChartEl || typeof Chart === 'undefined') return;

  const selectedSub = filterSubjectEl?.value || "all";
  if (gradeTrendChart) gradeTrendChart.destroy();

  const streamData = {};

  raw.forEach(m => {
    const streamName = m.stream || "Unassigned";
    if (!streamData[streamName]) {
      streamData[streamName] = { total: 0, count: 0 };
    }

    let studentSum = 0;
    let subjectCount = 0;

    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (!subName || (selectedSub !== "all" && subName !== selectedSub)) return;

      const score = isSenior
        ? cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam)
        : sub.score;

      if (score !== null) {
        studentSum += score;
        subjectCount++;
      }
    });

    if (subjectCount > 0) {
      streamData[streamName].total += (studentSum / subjectCount);
      streamData[streamName].count++;
    }
  });

  const labels = Object.keys(streamData).sort();
  const averages = labels.map(s =>
    (streamData[s].total / (streamData[s].count || 1)).toFixed(1)
  );

  const manualTarget = filterTargetEl ? parseInt(filterTargetEl.value) : NaN;

  const getSubjectTarget = (sub) => {
    const targets = { Mathematics: 60, English: 65, Kiswahili: 65 };
    return targets[sub] || 50;
  };

  const currentTarget = !isNaN(manualTarget)
    ? manualTarget
    : (selectedSub === "all" ? 50 : getSubjectTarget(selectedSub));

  const allValues = [...averages, currentTarget].map(Number);
  const maxValue = allValues.length ? Math.max(...allValues) : 100;
  const yMax = Math.ceil(maxValue + 10);

  gradeTrendChart = new Chart(gradeTrendChartEl, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: selectedSub === "all"
            ? 'Stream Average (%)'
            : `${selectedSub} Stream Mean (%)`,
          data: averages,
          backgroundColor: labels.map((_, i) => `hsla(${210 + i * 40}, 70%, 50%, 0.7)`),
          borderColor: labels.map((_, i) => `hsla(${210 + i * 40}, 70%, 45%, 1)`),
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      layout: {
        padding: { top: 60, left: 60, right: 30, bottom: 30 }
      },

      scales: {
        y: {
          beginAtZero: true,
          suggestedMin: 0,
          suggestedMax: yMax,
          title: {
            display: true,
            font: { size: 16, weight: 'bold' },
            text: selectedSub === "all"
              ? 'Average Score (%)'
              : `${selectedSub} Score (%)`
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            padding: 30,
            autoSkip: false,
            stepSize: 10,
            font: { size: 18, weight: '800' }
          }
        },

        x: {
          title: { display: true, text: 'Streams' },
          grid: { display: true, color: 'rgba(0,0,0,0.05)' },
          ticks: { padding: 15 }
        }
      },

      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 20 }
        },

        tooltip: {
          padding: 10,
          callbacks: {
            afterLabel: (item) => {
              const stream = labels[item.dataIndex];
              return `Students: ${streamData[stream].count}`;
            }
          }
        },

        datalabels: (typeof ChartDataLabels !== 'undefined')
          ? {
              anchor: 'end',
              align: 'top',
              formatter: (value) => value + '%',
              font: { weight: 'bold', size: 11 },
              color: '#475569',
              offset: 4
            }
          : {},

        annotation: {
          annotations: {
            targetLine: {
              type: 'line',
              yMin: currentTarget,
              yMax: currentTarget,
              borderColor: '#f59e0b',
              borderWidth: 3,
              borderDash: [6, 6],
              label: {
                content: `Target: ${currentTarget}%`,
                display: true,
                position: 'end'
              }
            }
          }
        }
      }
    }
  });
}
function initFilters() {
  const currentYear = new Date().getFullYear();
  if (filterYearEl) {
    filterYearEl.innerHTML = "";
    // Populate selection from 2026 to 2126 (next 100 years)
    for (let y = 2026; y <= 2126; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      filterYearEl.appendChild(opt);
    }
  }

  // Populate Terms
  if (filterTermEl) {
    filterTermEl.innerHTML = `
      <option value="all">All Terms</option>
      <option value="1">Term 1</option>
      <option value="2">Term 2</option>
      <option value="3">Term 3</option>
    `;
  }

  // Populate Assessments
  if (filterAssessmentEl && window.ASSESSMENT_MAPPING) {
    filterAssessmentEl.innerHTML = '<option value="all">All Assessments</option>'; // Keep "All Assessments" option
    Object.entries(window.ASSESSMENT_MAPPING).forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      filterAssessmentEl.appendChild(opt);
    }
    );
  }

  // Populate school grades based on school type
  const grades = getGradeOptionsForSchool();
  grades.forEach(g => {
    const opt = document.createElement("option"); opt.value = g; opt.textContent = g;
    filterGradeEl.appendChild(opt);
  });
}

async function loadDeanProfile() {
  try {
    deanProfileData = await authService.getUserProfile(["teacher", "classteacher"]);
    if (!deanProfileData) return;

    if (!deanProfileData.isDean) {
      alert("Only Deans can access this page.");
      return window.location.href = "teacher-dashboard.html";
    }

    setText(document.getElementById("deanRoleText"), "Authorized Dean access enabled.");
    setText(document.getElementById("deanStatus"), "Authorized");

    // Pre-load signature for PDF generation
    if (deanProfileData.signatureUrl) {
      deanProfileData.signatureBase64 = await getImageBase64(deanProfileData.signatureUrl);
    }

    // Pre-load school info and logo for PDF generation (always fresh, no cache)
    try {
      // Force clear any cached school info to get latest schoolType
      const SCHOOL_CACHE_KEY = "dean_school_info_cache";
      localStorage.removeItem(SCHOOL_CACHE_KEY);
      
      schoolInfo = await fetchWithAuth(`${API_BASE}/users/my-school`);
      if (schoolInfo) {
        // Cache briefly for performance but always refresh on page load
        localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: schoolInfo
        }));
        
        deanProfileData.schoolName = (schoolInfo.name || "School Name").toUpperCase();
        if (schoolInfo.logo) {
          // Note: getImageBase64 now handles both relative paths and absolute URLs
          deanProfileData.schoolLogoBase64 = await getImageBase64(schoolInfo.logo);
        }
      }
    } catch (e) {
      console.warn("Failed to pre-load school logo for Dean:", e);
      deanProfileData.schoolName = "SCHOOL NAME";
    }

    setupTabs();
    initFilters();
  } catch (error) {
    console.error(error.message || "Unable to load dean profile.");
    window.location.href = "teacher-dashboard.html";
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


window.addEventListener("DOMContentLoaded", () => {
  // Implement Logout with Confirmation
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const confirmed = await cbcUtils.showConfirmToast("Are you sure you want to log out of the Dean Panel?");
      if (confirmed) {
        authService.logout();
      }
    });
  }
  loadDeanProfile();
});

if (filterSubjectEl) {
  filterSubjectEl.addEventListener("change", () => {
    updateDashboardChart();
  });
}

if (filterTargetEl) {
  filterTargetEl.addEventListener("input", () => {
    updateDashboardChart();
  });
}

if (filterStreamEl) {
  filterStreamEl.addEventListener("change", () => {
    if (currentAnalysisRawData) {
      processAnalysisData(currentAnalysisRawData, currentIsSenior, filterAssessmentEl.value, currentPrevRawData);
    }
  });
}

if (chartTypeToggle) {
  chartTypeToggle.addEventListener("change", () => {
    updateDashboardChart();
  });
}
