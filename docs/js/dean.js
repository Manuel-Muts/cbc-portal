// ---------------------------
// STYLES FOR SPINNER
// ---------------------------
const deanInjectedStyle = document.createElement("style");
deanInjectedStyle.textContent = `
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: dean-spin 0.8s linear infinite;
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
  }
  @keyframes dean-spin { to { transform: rotate(360deg); } }

  /* 🆕 Sidebar Professional Blue Styling (Matches Admin Sidebar) */
  .sidebar-nav {
    background-color: #589be3 !important;
    background-color: #2b6cb0 !important;
    padding: 20px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
  }
  .sidebar-nav .tab-btn {
    background: transparent !important;
    color: rgba(255, 255, 255, 0.85) !important;
    border: none !important;
    text-align: left !important;
    padding: 12px 24px !important;
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    font-size: 0.88rem !important;
    border-radius: 0 !important;
    transition: all 0.2s ease !important;
  }
  .sidebar-nav .tab-btn:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    color: white !important;
  }
  .sidebar-nav .tab-btn.active {
    background-color: #9bb5d6 !important;
    background-color: #1a4d8c !important;
    color: white !important;
    font-weight: 700 !important;
    box-shadow: inset 5px 0 0 #fff !important;
  }
  .status-card-sidebar {
    margin: auto 15px 20px 15px !important;
    padding: 12px !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
  }
  .status-card-sidebar p {
    color: #fff !important;
    margin: 0 !important;
    font-size: 0.75rem !important;
  }
`;
document.head.appendChild(deanInjectedStyle);

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
const printMissingReportBtn = document.getElementById("printMissingReportBtn"); // 🆕 Print button for missing exams

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
const missingExamsTableWrap = document.getElementById("missingExamsTableWrap"); // 🆕 Container for missing exams table

const gradeTrendChartEl = document.getElementById("gradeTrendChart");
let gradeTrendChart = null;
let deanProfileData = null;
let currentAnalysisRawData = null;
let currentPrevRawData = null;
let currentIsSenior = false;
let currentValidKeys = new Set();

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
  // If it's already a data URI, return it immediately to avoid CSP issues with fetch
  if (url.startsWith('data:')) return url;

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

/**
 * Helper to extract image format from base64 data URI
 */
function getImageFormat(base64String) {
  if (!base64String) return 'PNG';
  const match = base64String.match(/^data:image\/([a-zA-Z+]+);base64,/);
  if (match && match[1]) {
    const format = match[1].toUpperCase();
    return format === 'JPG' ? 'JPEG' : format;
  }
  return 'PNG';
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

  if (!grade) return cbcUtils.showToast("Please select a grade.", "error");

  applyFiltersBtn.disabled = true;
  applyFiltersBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

  // Allow UI to render spinner before potentially heavy cache/processing logic
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const cacheKey = `${grade}_${term}_${year}_${assessment}`;
  const cached = getAnalyticsCache(cacheKey);

  if (cached) {
    console.log("✅ Using cached analytics for Grade: " + grade);
    analysisSection.style.display = "block";
    currentPrevRawData = cached.prevTermData;
    processAnalysisData(cached.rawData, cached.isSenior, assessment, cached.prevTermData, cached.roster);

    applyFiltersBtn.disabled = false;
    applyFiltersBtn.innerHTML = "🔍 View Results";
    return;
  }
  
  try {
    // 🚀 Fetch marks and the full class roster in parallel
    const [marksData, rosterResponse] = await Promise.all([
      fetchWithAuth(`${API_BASE}/marks/by-grade?${new URLSearchParams({ grade, term, year, assessment })}`),
      fetchWithAuth(`${API_BASE}/enrollments/class/${grade}?limit=1000`)
    ]);

    if (!marksData || marksData.length === 0) {
      analysisSection.style.display = "none";
      cbcUtils.showToast("No marks found for the selected filters.", "error");
      return;
    }

    const roster = rosterResponse.students || (Array.isArray(rosterResponse) ? rosterResponse : []);
    
    let prevTermData = null;
    const termNum = parseInt(term);
    if (termNum > 1) {
      try {
        prevTermData = await fetchWithAuth(`${API_BASE}/marks/by-grade?${new URLSearchParams({ grade, term: termNum - 1, year, assessment })}`);
      } catch (e) {
        console.log("Progress analysis skipped: Previous term data not found.");
      }
    }

    analysisSection.style.display = "block";
    const gradeNum = parseInt(grade.match(/\d+/)?.[0] || 0);
    const isSenior = gradeNum >= 10;

    currentPrevRawData = prevTermData;
    setAnalyticsCache(cacheKey, {
      rawData: marksData,
      isSenior: isSenior,
      prevTermData: prevTermData,
      roster: roster
    });

    processAnalysisData(marksData, isSenior, assessment, prevTermData, roster);
  } catch (err) {
    if (err.message.includes("No marks found")) {
      analysisSection.style.display = "none";
      cbcUtils.showToast("No results found for the selected filters.", "error");
    } else {
      console.error("Analysis Error:", err);
      cbcUtils.showToast("Failed to analyze grade results.", "error");
    }
  } finally {
    applyFiltersBtn.disabled = false;
    applyFiltersBtn.innerHTML = "🔍 View Results";
  }
}

function processAnalysisData(allRaw, isSenior, assessment, allPrevRaw = null, roster = []) {
  const streamsSet = new Set();

  // 🆕 Build a map of streams to their expected subjects from allRaw (before stream filtering)
  // This is crucial for the "All Streams" absence check, so a student isn't penalized
  // for not taking a subject that only another stream takes.
  const streamExpectedSubjectsMap = {};
  const allSubjectsInGrade = new Set(); // 🆕 Track all unique subjects in this grade
  allRaw.forEach(m => {
    const stream = m.stream || "Unassigned"; // Handle students without a stream explicitly
    if (!streamExpectedSubjectsMap[stream]) {
      streamExpectedSubjectsMap[stream] = new Set();
    }
    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (subName) {
        streamExpectedSubjectsMap[stream].add(subName);
        allSubjectsInGrade.add(subName);
      }
    });
  });
  // Convert sets to sorted arrays for consistent iteration
  Object.keys(streamExpectedSubjectsMap).forEach(stream => {
    streamExpectedSubjectsMap[stream] = Array.from(streamExpectedSubjectsMap[stream]).sort();
  });

  // 🆕 Identify cross-stream subject discrepancies (where a stream is missing a subject others have)
  const streamDiscrepancies = [];
  Object.entries(streamExpectedSubjectsMap).forEach(([stream, subjects]) => {
    const missingInStream = Array.from(allSubjectsInGrade).filter(s => !subjects.includes(s));
    if (missingInStream.length > 0) {
      streamDiscrepancies.push({ stream, missingSubjects: missingInStream });
    }
  });

  // Discover all streams available in this dataset
  allRaw.forEach(m => { if (m.stream) streamsSet.add(m.stream); });

  // 🆕 Ensure streams that haven't submitted any marks yet still appear in the filter
  if (roster && Array.isArray(roster)) {
    roster.forEach(s => { if (s.stream) streamsSet.add(s.stream); });
  }

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
    // Only show stream filter if there's more than one stream to choose from
    filterStreamEl.style.display = streamsSet.size > 1 ? "inline-block" : "none";
  }

  // Filter data based on current stream selection
  const selectedStream = filterStreamEl?.value || "all";
  const raw = selectedStream === "all" ? allRaw : allRaw.filter(m => m.stream === selectedStream);
  const prevRaw = (allPrevRaw && selectedStream !== "all") ? allPrevRaw.filter(m => m.stream === selectedStream) : allPrevRaw;

  // --- IMPORTANT CHANGE HERE ---
  // Discover subjects *after* stream filtering, from the 'raw' data
  const subjectsSet = new Set();
  raw.forEach(m => {
    m.subjects.forEach(sub => { const subName = isSenior ? sub.course : sub.subject; if (subName) subjectsSet.add(subName); });
  });
  const sortedSubjects = Array.from(subjectsSet).sort();
  // --- END IMPORTANT CHANGE ---

  const studentsMap = {};
  const subjectTotals = {};
  const subjectCounts = {};
  const subjectTermStats = {}; // To track T1, T2, T3 means for trend line
  const missingExamsMap = {}; // 🆕 Use a map to group missed subjects by student/assessment

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
    
    // Default to 'trend' only if no value is set
    if (!chartTypeToggle.value) chartTypeToggle.value = "trend";
  }

  // Show results area
  analysisSection.style.display = "block";
  
  // Calculate statistics for all cases (even All Assessments)
  raw.forEach(m => {
    // Group by admission number if "All" is selected to show overall means
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    if (!studentsMap[key]) {
      studentsMap[key] = { 
        name: m.studentName, 
        adm: m.admissionNo, 
        stream: m.stream || "Unassigned", // Fix: Retain stream for grouped analysis
        assess: isAll ? "Overall" : (m.assessment || "N/A"), 
        subjects: {}, _sum: {}, _cnt: {},
        hasAbsence: false
      };
    }

    m.subjects.forEach(sub => {
      const subName = isSenior ? sub.course : sub.subject;
      if (!subName) return;
      
      // Robust missing/absent detection (catches null, undefined, empty, or "X")
      const isX = (v) => v === null || v === undefined || String(v).trim() === "" || (typeof v === 'string' && v.trim().toUpperCase() === "X");
      
      let isAbsent = isSenior 
        ? (isX(sub.endTermExam) || isX(sub.continuousAssessment) || isX(sub.projectWork))
        : isX(sub.score);
      
      const score = isSenior ? (isAbsent ? "X" : cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam)) : sub.score;

      // Robust absence flag setting
      const isExplicitlyAbsent = isAbsent || score === null || score === undefined || (typeof score === 'string' && score.trim().toUpperCase() === "X");
      if (isExplicitlyAbsent) {
        studentsMap[key].hasAbsence = true;
      }
      
      if (score !== undefined) {

        if (!isAll || studentsMap[key].subjects[subName] === undefined) {
          studentsMap[key].subjects[subName] = score;
        }

      // Only count numeric scores for individual student averages; ignore "X" or null
      if (score !== "" && score !== null && !isNaN(score) && score !== "X" && score !== "x") {
          const numScore = Number(score);

        if (isAll) {
          studentsMap[key]._sum[subName] = (studentsMap[key]._sum[subName] || 0) + numScore;
          studentsMap[key]._cnt[subName] = (studentsMap[key]._cnt[subName] || 0) + 1;
          studentsMap[key].subjects[subName] = parseFloat((studentsMap[key]._sum[subName] / studentsMap[key]._cnt[subName]).toFixed(1));
        }
      }
      }
    });
  });

  // 🆕 SECOND PASS: Strict Incomplete/Absence Detection
  // A student is marked as having an absence if they are missing a score (or have an 'X')
  // for any subject they *were expected to take*.
  Object.values(studentsMap).forEach(s => {
    let subjectsToValidateAgainst = [];

    if (selectedStream === "all") {
      // When viewing all streams, validate against subjects expected for the student's *own* stream
      subjectsToValidateAgainst = streamExpectedSubjectsMap[s.stream || "Unassigned"] || [];
    } else {
      // When viewing a specific stream, validate against all subjects found in that stream's data
      // (sortedSubjects is already filtered by selectedStream in this case)
      subjectsToValidateAgainst = sortedSubjects;
    }

    subjectsToValidateAgainst.forEach(subName => {
      const score = s.subjects[subName];
      // Robust detection: Catch undefined (missing record), null (X from DB), or explicit 'X' string
      const isMissing = score === undefined || score === null || (typeof score === 'string' && score.trim().toUpperCase() === "X");

      if (isMissing) {
        s.hasAbsence = true;

        // Group markers into the missing exams map
        const studentAssessKey = isAll ? `${s.adm}_overall` : `${s.adm}_${s.assess}`; // Key for missing exams map
        
        if (!missingExamsMap[studentAssessKey]) {
          const mapping = window.ASSESSMENT_MAPPING || {};
          missingExamsMap[studentAssessKey] = {
            name: s.name,
            adm: s.adm,
            stream: s.stream || "Unassigned",
            assess: isAll ? "Overall Performance" : (mapping[s.assess] || `Assessment ${s.assess}`),
            subjects: []
          };
        }
        if (!missingExamsMap[studentAssessKey].subjects.includes(subName)) {
          missingExamsMap[studentAssessKey].subjects.push(subName);
        }
      }
    });
  });

  // 🆕 Update global set of valid keys for chart consistency
  currentValidKeys = new Set(
    Object.values(studentsMap)
      .filter(s => !s.hasAbsence)
      .map(s => isAll ? s.adm : `${s.adm}_${s.assess}`)
  );

  // 🆕 THIRD PASS: Calculate Subject Stats excluding disqualified learners
  // This ensures Subject Means and Trend Lines only reflect consistent data from fully-tested students.
  raw.forEach(m => {
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    const student = studentsMap[key];
    
    // Only process scores for students who are NOT disqualified
    if (student && !student.hasAbsence) {
      m.subjects.forEach(sub => {
        const subName = isSenior ? sub.course : sub.subject;
        if (!subName) return;

        const score = isSenior ? cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam) : sub.score;
        const scoreStr = String(score).trim().toUpperCase();

        if (score !== "" && score !== null && !isNaN(score) && scoreStr !== "X") {
          const numScore = Number(score);
          const termNum = m.term;
          
          // Collect per-term stats for the trend line
          if (termNum >= 1 && termNum <= 3) {
            if (!subjectTermStats[subName]) subjectTermStats[subName] = { 1: { s: 0, c: 0 }, 2: { s: 0, c: 0 }, 3: { s: 0, c: 0 } };
            subjectTermStats[subName][termNum].s += numScore;
            subjectTermStats[subName][termNum].c++;
          }

          subjectTotals[subName] = (subjectTotals[subName] || 0) + numScore;
          subjectCounts[subName] = (subjectCounts[subName] || 0) + 1;
        }
      });
    }
  });

  // 🆕 IDENTIFY UNGRADED LEARNERS: Compare roster against marks fetched
  // This finds students who have NO record at all for the current filtered context
  let filteredRoster = roster;
  if (selectedStream !== "all") { filteredRoster = roster.filter(s => s.stream === selectedStream); }
  if (filteredRoster && filteredRoster.length > 0 && assessment !== "all") {
    const submittedAdms = new Set(raw.map(m => m.admissionNo)); // Use 'raw' data for submitted admissions
    const mapping = window.ASSESSMENT_MAPPING || {};
    const currentAssessLabel = mapping[assessment] || `Assessment ${assessment}`;

    filteredRoster.forEach(student => { // Iterate over filtered roster
      const adm = student.admissionNo || student.admission;
      if (!submittedAdms.has(adm)) {
        // Filter by stream if selected
        if (selectedStream !== "all" && student.stream !== selectedStream) return;

        missingExamsMap[`${adm}_ungraded`] = {
          name: student.name,
          adm: adm,
          stream: student.stream || "Unassigned",
          assess: currentAssessLabel,
          subjects: ["RECORDS NOT FOUND (Entirely Ungraded)"]
        };
      }
    });
  }

  const studentArray = Object.values(studentsMap)
    .filter(s => !s.hasAbsence) // TODO: Re-evaluate this. Maybe display with ABS, but exclude from ranking.
    .map(s => {
    const rawScores = Object.values(s.subjects);
    // Filter out non-numeric scores (like "X") for student total and mean calculation
    const validScores = rawScores.filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v) && v !== "X" && v !== "x").map(Number);
    const total = validScores.reduce((a, b) => a + b, 0);
    const mean = validScores.length ? total / validScores.length : 0;
    const points = rawScores.reduce((sum, sc) => sum + cbcUtils.getPoints(sc), 0);

    const studentKey = isAll ? s.adm : `${s.adm}_${s.assess}`;
    const pMean = prevStudentMeans[studentKey];
    const progress = pMean !== undefined ? (mean - pMean) : null;

    return { ...s, total, mean, points, progress };
  }).sort((a, b) => b.mean - a.mean);

  // Convert map to list and sort missing list by name
  const missingExamsList = Object.values(missingExamsMap);
  missingExamsList.sort((a, b) => a.name.localeCompare(b.name));

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
  renderMissingExamsTable(missingExamsList, streamDiscrepancies); // 🆕 Call renderer for missing exams
}

function renderRankingTable(students, subjects, isSenior) {
  // Identify tied ranks
  const rankCounts = {};
  students.forEach(s => {
    rankCounts[s.rank] = (rankCounts[s.rank] || 0) + 1;
  });

  const totalHeader = !isSenior ? '<th class="total-column-header">Total</th>' : '';
  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Rank</th><th>Name</th><th>Adm</th>${subjects.map(s => `<th>${s} <small style="display:block; font-size:0.6rem; font-weight:normal; opacity:0.7;">(Score & Pts)</small></th>`).join("")}${totalHeader}<th>Mean</th><th>Progress</th><th>Total Points</th><th>Level</th></tr></thead>
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
      ${subjects.map(sub => {
        const score = s.subjects[sub];
        const isAbs = score === undefined || score === null || String(score).toUpperCase() === "X";
        if (isAbs) {
          return `<td><span style="color:#ef4444; font-weight:700;">ABS</span> <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">(0)</span></td>`;
        }
        const pts = cbcUtils.getPoints(Number(score));
        return `<td>${score} <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">(${pts})</span></td>`;
      }).join("")}
      ${totalCell}
      <td>${s.mean.toFixed(1)}%</td>
      <td>${progressHtml}</td>
      <td>${s.points}</td><td>${cbcUtils.getSubdivision(s.mean)}</td>
    </tr>`;
  });

  // Calculate Totals and Means for Footer
  const groupCount = students.length || 1;
  const groupTotalMarks = students.reduce((acc, s) => acc + (s.total || 0), 0);
  const groupTotalPoints = students.reduce((acc, s) => acc + (s.points || 0), 0);
  const groupMeanSum = students.reduce((acc, s) => acc + (s.mean || 0), 0);

  html += `</tbody><tfoot style="background-color: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e0;">`;
  
  // TOTAL Row
  html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">TOTAL:</td>`;
  subjects.forEach(sub => {
    const subSum = students.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
    html += `<td style="text-align: center; padding: 8px;">${subSum.toFixed(0)}</td>`;
  });
  if (!isSenior) {
    html += `<td style="text-align: center; padding: 8px;">${groupTotalMarks.toFixed(0)}</td>`;
  }
  html += `<td style="text-align: center; padding: 8px;"></td>`; // Mean col
  html += `<td></td>`; // Progress column
  html += `<td style="text-align: center; padding: 8px;">${groupTotalPoints}</td>`;
  html += `<td></td>`; // Performance Level col
  html += `</tr>`;

  // MEAN Row
  html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">MEAN:</td>`;
  subjects.forEach(sub => {
    const subSum = students.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
    const subCount = students.filter(s => s.subjects[sub] !== undefined && s.subjects[sub] !== null).length || 1;
    html += `<td style="text-align: center; padding: 8px;">${(subSum / subCount).toFixed(1)}</td>`;
  });
  if (!isSenior) {
    html += `<td style="text-align: center; padding: 8px;">${(groupTotalMarks / groupCount).toFixed(1)}</td>`;
  }
  html += `<td style="text-align: center; padding: 8px;">${(groupMeanSum / groupCount).toFixed(1)}%</td>`;
  html += `<td></td>`; // Progress column
  html += `<td style="text-align: center; padding: 8px;">${(groupTotalPoints / groupCount).toFixed(1)}</td>`;
  html += `<td style="text-align: center; padding: 8px; color: #1a237e;">${cbcUtils.getSubdivision(groupMeanSum / groupCount)}</td>`;
  html += `</tr></tfoot></table>`;
  rankingTableWrap.innerHTML = html;
}

async function downloadRankingAsPDF() {
  const table = rankingTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  const originalHTML = printReportBtn.innerHTML;
  printReportBtn.disabled = true;
  printReportBtn.innerHTML = '<span class="spinner"></span> Generating PDF...';

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 100));

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

  let yPos = 12;

  try {
  // Header - School Logo & Name
  if (deanProfileData && deanProfileData.schoolLogoBase64) {
    try {
      // Use pre-calculated properties to avoid expensive re-parsing
      const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
      const format = deanProfileData.logoFormat || getImageFormat(deanProfileData.schoolLogoBase64);
      const imgWidth = 25; 
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - imgWidth) / 2, yPos - 8, imgWidth, imgHeight, undefined, 'FAST');
      yPos += imgHeight;
    } catch (e) {
      console.warn("Could not embed school logo in PDF:", e);
    }
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos - 5, { align: "center" });

  // 2. Subheader - Year | Term | Assessment
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | ${termLabel} | ${assessLabel}${streamInfo}`, pageWidth / 2, yPos - 1, { align: "center" });

  // 3. Title Line
  doc.setFontSize(14);
  doc.text(`CLASS GRADING REPORT: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`, 14, yPos + 5);

  // OPTIMIZATION: Extract column mapping once to avoid repeated indexOf lookups
  const rawHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
  const nameIdx = rawHeaders.indexOf("Name");
  const admIdx = rawHeaders.indexOf("Adm");
  const progressIdx = rawHeaders.indexOf("Progress");
  const levelIdx = rawHeaders.length - 1;

  // Determine which columns to skip for PDF clarity
  const skipIndices = new Set();
  if (admIdx !== -1) skipIndices.add(admIdx);
  
  // Check if Progress column should be hidden (only N/A values)
  const tbodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const hasMeaningfulProgress = tbodyRows.some(tr => {
    const p = tr.querySelectorAll("td")[progressIdx]?.textContent.trim();
    return p && p !== "N/A" && p !== "-";
  });
  if (!hasMeaningfulProgress && progressIdx !== -1) skipIndices.add(progressIdx);

  const headers = rawHeaders.filter((_, i) => !skipIndices.has(i));

  // Single-pass row processing: Extract data, level counts, and metadata
  const tiedRowIndices = [];
  const significantDropRowIndices = [];
  const SIGNIFICANT_DROP_THRESHOLD = -5;
  const levelCounts = { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 };

  const rows = tbodyRows.map((tr, rowIdx) => {
    const cells = Array.from(tr.querySelectorAll("td"));
    
    // Metadata for styling
    if (tr.classList.contains("tied-rank")) tiedRowIndices.push(rowIdx);
    const progVal = parseFloat(tr.dataset.progress);
    if (!isNaN(progVal) && progVal < SIGNIFICANT_DROP_THRESHOLD) significantDropRowIndices.push(rowIdx);

    // Count levels for summary while iterating
    const levelStr = cells[levelIdx]?.textContent.trim();
    if (levelCounts[levelStr] !== undefined) levelCounts[levelStr]++;

    return cells
      .filter((_, colIdx) => !skipIndices.has(colIdx))
      .map(td => td.textContent.trim());
  });

  // Optimized Footer Extraction
  const foot = Array.from(table.querySelectorAll("tfoot tr")).map(tr => {
    let colCounter = 0;
    const rowData = [];
    tr.querySelectorAll("td").forEach(td => {
      const colspan = td.colSpan || 1;
      const text = td.textContent.trim();
      for(let i=0; i<colspan; i++) {
        if (!skipIndices.has(colCounter)) rowData.push(i === 0 ? text : "");
        colCounter++;
      }
    });
    return rowData;
  });

  doc.autoTable({ 
    startY: yPos + 9, 
    head: [headers], 
    body: rows, 
    foot: foot || [],
    theme: 'grid',
    styles: { fontSize: 8, lineWidth: 0.1, lineColor: [0, 0, 0] },
    headStyles: { fillColor: [52, 152, 219] },
    footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' },
    showHead: 'everyPage', // Repeat table headers on every page
    showFoot: 'lastPage', // Only show totals/mean at the end of the ranking list
    rowPageBreak: 'avoid', // 🆕 Prevents a single student row from being split across two pages
    margin: { left: 14, right: 14, bottom: 35 }, // 🆕 Leaves space for the signature and footer
    didParseCell: (data) => {
       if (data.section === 'body') {
        // Make student name bold
        const nameColumnIndex = headers.indexOf("Name");
        if (nameColumnIndex !== -1 && data.column.index === nameColumnIndex) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
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
    } // Footer moved to the end of function to appear on the last page
  });

  // 4. Summary Section with Multi-page Safety
  // Threshold: If we have less than 75mm remaining (A4 landscape height ~210mm), move summary to new page
  let summaryStartY = doc.lastAutoTable.finalY + 8;
  if (summaryStartY > pageHeight - 75) {
    doc.addPage();
    summaryStartY = 25;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("REPORT SUMMARY", 14, summaryStartY); 

  doc.setFontSize(9);
  doc.text("Level Distribution", 14, summaryStartY + 5);

  // Level Distribution Table
  doc.autoTable({
    startY: summaryStartY + 7,
    head: [['Level', 'Count']],
    body: Object.entries(levelCounts).map(([lvl, count]) => [lvl, count]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.2, lineColor: [0, 0, 0] },
    headStyles: { fillColor: [52, 152, 219] },
    tableWidth: 50,
    margin: { left: 14 }
  });

  // Performance Key Label (Placed next to Distribution)
  const keyX = 14 + 50 + 20; // margin + table1 width + gap
  doc.text("Performance Key", keyX, summaryStartY + 5);

  // 5. Performance Key Table
  doc.autoTable({
    startY: summaryStartY + 7,
    head: [['Level', 'Range', 'Pts']],
    body: [
      // Original Performance Key data
      ['EE1', '90-100', '8'], ['EE2', '75-89', '7'],
      ['ME1', '58-74', '6'], ['ME2', '41-57', '5'],
      ['AE1', '31-40', '4'], ['AE2', '21-30', '3'],
      ['BE1', '11-20', '2'], ['BE2', '0-10', '1']
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.2, lineColor: [0, 0, 0] },
    headStyles: { fillColor: [44, 62, 80] }, // Darker theme for the key
    tableWidth: 70,
    margin: { left: keyX }
  });

  // --- DRAW FOOTER ON THE LAST PAGE ---
  doc.setPage(doc.internal.getNumberOfPages());
  
  // Safety: If summary tables ended too close to the footer, add one more page for the signature
  let footerY = pageHeight - 20;
  if (doc.lastAutoTable.finalY > footerY - 5) {
    doc.addPage();
    footerY = pageHeight - 20;
  }

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  // Printed date (right)
  const dateStr = `Printed: ${new Date().toLocaleString()}`;
  doc.text(dateStr, pageWidth - 14, footerY, { align: "right" });

  // Dean's digital signature image
  if (deanProfileData && deanProfileData.signatureBase64) {
    try {
      const sigFormat = deanProfileData.sigFormat || getImageFormat(deanProfileData.signatureBase64);
      doc.addImage(deanProfileData.signatureBase64, sigFormat, pageWidth - 54, footerY + 1, 40, 8, undefined, 'FAST');
    } catch (e) {
      console.warn("Could not embed Dean signature in PDF:", e);
    }
  }

  // Dean signature space (right, below date)
  doc.text("__________________________", pageWidth - 14, footerY + 10, { align: "right" });
  doc.text("Dean's Signature", pageWidth - 14, footerY + 15, { align: "right" });

  // --- ADD PAGE NUMBERS & SYSTEM FOOTER TO ALL PAGES ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150); // Professional subtle gray
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 7);
    const genText = "CompetenceHub Analytics";
    const genTextWidth = doc.getTextWidth(genText);
    doc.text(genText, (pageWidth / 2) - (genTextWidth / 2), pageHeight - 7);
  }

  const fileName = `${schoolName}_${grade}_T${termVal}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
  } catch (err) {
    console.error("PDF Export Error:", err);
  } finally {
    printReportBtn.disabled = false;
    printReportBtn.innerHTML = originalHTML;
  }
}

/**
 * 🆕 Renders the list of learners who missed exams
 */
function renderMissingExamsTable(missingList, streamDiscrepancies = []) {
  if (!missingExamsTableWrap) return;

  if (missingList.length === 0 && streamDiscrepancies.length === 0) {
    missingExamsTableWrap.innerHTML = `
      <div style="text-align:center; padding:30px; background:#f8fafc; border-radius:12px; border: 1px dashed #cbd5e0; color:#64748b;">
        <i class="fas fa-check-circle" style="font-size:2rem; color:#10b981; margin-bottom:10px; display:block;"></i>
        <strong>Excellent!</strong> No learners were recorded as absent ("X") for any subjects in this selection.
      </div>`;
    return;
  }

  let html = "";

  // 🆕 Add Stream-Level Warnings (Subject Discrepancies)
  if (streamDiscrepancies.length > 0) {
    html += `
      <div style="margin-bottom: 25px; border-radius: 12px; overflow: hidden; border: 1px solid #fee2e2; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background: #fef2f2; padding: 12px 20px; border-bottom: 1px solid #fee2e2; display: flex; align-items: center; gap: 10px;">
          <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
          <h4 style="margin: 0; color: #991b1b; font-size: 0.95rem;">System Warning: Stream-Level Missing Data</h4>
        </div>
        <div style="padding: 15px 20px; background: white;">
          <p style="font-size: 0.85rem; color: #4b5563; margin-top: 0; line-height: 1.5;">
            The following subjects have marks in other streams for this grade, but <strong>no marks at all</strong> in the streams listed below. 
            This usually means a teacher has not yet submitted any results for that specific class.
          </p>
          <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 0.85rem; color: #1f2937;">
            ${streamDiscrepancies.map(d => `
              <li style="margin-bottom: 8px;">
                <span style="font-weight: 700; color: #1f2937;">Stream ${d.stream}:</span> Entirely missing ${d.missingSubjects.map(s => `<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: #c53030; font-family: inherit; font-weight: 600;">${s}</code>`).join(", ")}
              </li>
            `).join("")}
          </ul>
        </div>
      </div>`;
  }

  if (missingList.length > 0) {
    html += `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead>
      <tr>
        <th>Name</th>
        <th>Adm</th>
        <th>Stream</th>
        <th>Assessment</th>
        <th style="color:#e53e3e;">Missed Subject(s)</th>
      </tr>
    </thead>
    <tbody>`;

  missingList.forEach(m => {
    html += `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td>${m.adm}</td>
        <td>${m.stream}</td>
        <td>${m.assess}</td>
        <td>
          ${m.subjects.map(s => `<span style="display:inline-block; background:#fff5f5; color:#c53030; padding:2px 8px; border-radius:4px; border:1px solid #feb2b2; margin:2px; font-size:0.75rem; font-weight:600;">${s}</span>`).join("")}
        </td>
      </tr>`;
  });

    html += `</tbody></table>`;
  } else if (streamDiscrepancies.length > 0) {
    html += `<div style="text-align:center; padding:15px; background:#f0fdf4; border-radius:8px; border: 1px solid #bcf0da; color:#166534; font-size:0.85rem;">
      <i class="fas fa-check-circle" style="margin-right:5px;"></i> All individual learner exams accounted for.
    </div>`;
  }

  missingExamsTableWrap.innerHTML = html;
}

/**
 * 🆕 Download the Missing Exams list as a PDF
 */
async function downloadMissingExamsAsPDF() {
  const table = missingExamsTableWrap.querySelector("table");
  if (!missingExamsTableWrap || !window.jspdf) return;

  const originalHTML = printMissingReportBtn.innerHTML;
  printMissingReportBtn.disabled = true;
  printMissingReportBtn.innerHTML = '<span class="spinner"></span> Generating PDF...';

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 100));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const schoolName = deanProfileData?.schoolName || "SCHOOL NAME";
  const grade = filterGradeEl.value;
  const termVal = filterTermEl.value;
  const termLabel = termVal === "all" ? "Full Year" : `Term ${termVal}`;
  const year = filterYearEl.value;

    let yPos = 12;

  try {
    // Header - School Logo & Name
    if (deanProfileData && deanProfileData.schoolLogoBase64) {
      const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
      const format = deanProfileData.logoFormat || getImageFormat(deanProfileData.schoolLogoBase64);
      const imgWidth = 25; 
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - imgWidth) / 2, yPos - 8, imgWidth, imgHeight, undefined, 'FAST');
      yPos += imgHeight;
    }

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
      doc.text(schoolName, pageWidth / 2, yPos - 5, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
      doc.text(`${year} | ${termLabel} | Missing Exams Report`, pageWidth / 2, yPos - 1, { align: "center" });

    doc.setFontSize(14);
      doc.text(`Learners Recorded as Absent: ${grade}`, 14, yPos + 5);

    // 🆕 Export Stream Discrepancies to PDF if they exist
    const discrepancyBlock = missingExamsTableWrap.querySelector('div[style*="border: 1px solid #fee2e2"]');
    if (discrepancyBlock) {
      const discItems = Array.from(discrepancyBlock.querySelectorAll('li')).map(li => [li.innerText]);
      doc.autoTable({
        startY: yPos + 9,
        head: [["🚨 STREAM-LEVEL MISSING SUBJECTS (Data Integrity Warning)"]],
        body: discItems,
        theme: 'grid',
        headStyles: { fillColor: [197, 48, 48] }, // #c53030
        styles: { fontSize: 8, fontStyle: 'bold' },
        margin: { bottom: 10 }
      });
      yPos = doc.lastAutoTable.finalY + 5;
      doc.setFontSize(12);
      doc.text(`Individual Absences:`, 14, yPos + 5);
      yPos += 7;
    }

    if (table) {
      const headers = [["Name", "Adm", "Stream", "Assessment", "Missed Subjects"]];
      const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => 
        Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim())
      );

      doc.autoTable({
        startY: yPos + 2, 
        head: headers, 
        body: rows, 
        theme: 'grid',
        headStyles: { fillColor: [231, 76, 60] }, // Red for "Missing"
        styles: { fontSize: 9 },
        rowPageBreak: 'avoid', // 🆕 Prevents splitting a student's missing subjects list
        margin: { bottom: 35 } // 🆕 Space for signature
      });
    } else {
      doc.setFontSize(10);
      doc.text("No individual learner absences recorded.", 14, yPos + 5);
    }

    // Ensure Dean Signature doesn't overlap
    doc.setPage(doc.internal.getNumberOfPages());
    if (doc.lastAutoTable.finalY > pageHeight - 30) {
        doc.addPage();
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 10);
      doc.text(`Printed: ${new Date().toLocaleString()} | CompetenceHub`, pageWidth - 14, pageHeight - 10, { align: "right" });
    }

    doc.save(`Absent_Learners_${grade}_T${termVal}_${year}.pdf`);
  } catch (err) {
    console.error("PDF Export Error:", err);
  } finally {
    printMissingReportBtn.disabled = false;
    printMissingReportBtn.innerHTML = originalHTML;
  }
}

async function downloadSubjectPerformanceAsPDF() {
  const table = subjectTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  const originalHTML = printSubjectReportBtn.innerHTML;
  printSubjectReportBtn.disabled = true;
  printSubjectReportBtn.innerHTML = '<span class="spinner"></span> Generating PDF...';

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 100));

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

  try {
  // Header - School Logo & Name
  if (deanProfileData && deanProfileData.schoolLogoBase64) {
    try {
      // Use pre-calculated properties to avoid expensive re-parsing
      const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
      const format = deanProfileData.logoFormat || getImageFormat(deanProfileData.schoolLogoBase64);
      const imgWidth = 25; 
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - imgWidth) / 2, yPos - 10, imgWidth, imgHeight, undefined, 'FAST');
      yPos += imgHeight;
    } catch (e) {
      console.warn("Could not embed school logo in PDF:", e);
    }
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, yPos - 7, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${year} | ${termLabel} | ${assessLabel}${streamInfo}`, pageWidth / 2, yPos, { align: "center" });

  doc.setFontSize(14);
  doc.text(`Subject Performance Analysis: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`, 14, yPos + 10);

  const rawHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
  const progressIdx = rawHeaders.indexOf("Progress");
  const tbodyRows = Array.from(table.querySelectorAll("tbody tr"));

  // Check if Progress column should be hidden
  const hasMeaningfulProgress = tbodyRows.some(tr => {
    const p = tr.querySelectorAll("td")[progressIdx]?.textContent.trim();
    return p && p !== "N/A" && p !== "-";
  });

  const skipIndices = new Set();
  if (!hasMeaningfulProgress && progressIdx !== -1) skipIndices.add(progressIdx);

  const headers = rawHeaders.filter((_, i) => !skipIndices.has(i));
  const tiedRowIndices = [];

  const rows = tbodyRows.map((tr, idx) => {
    if (tr.classList.contains("tied-rank")) tiedRowIndices.push(idx);
    return Array.from(tr.querySelectorAll("td"))
      .filter((_, colIdx) => !skipIndices.has(colIdx))
      .map(td => td.textContent.trim());
  });

  doc.autoTable({ 
    startY: yPos + 9, 
    head: [headers], 
    body: rows, 
    theme: 'grid',
    styles: { fontSize: 9, lineWidth: 0.1, lineColor: [0, 0, 0] },
    headStyles: { fillColor: [46, 204, 113] }, // Green theme for subject stats
    showHead: 'everyPage', 
    rowPageBreak: 'avoid', // 🆕 Prevents subject rows from splitting
    margin: { bottom: 35 }, // 🆕 Space for signature
    didParseCell: (data) => {
      if (data.section === 'body' && tiedRowIndices.includes(data.row.index)) {
        data.cell.styles.fillColor = [255, 249, 219];
      }
    }
  });

  // --- DRAW SIGNATURE ON THE LAST PAGE ---
  doc.setPage(doc.internal.getNumberOfPages());
  
  // Safety: check for overlap
  let footerY = pageHeight - 20;
  if (doc.lastAutoTable.finalY > footerY - 5) {
    doc.addPage();
    footerY = pageHeight - 20;
  }

  if (deanProfileData && deanProfileData.signatureBase64) {
    try {
      const sigFormat = deanProfileData.sigFormat || getImageFormat(deanProfileData.signatureBase64);
      doc.addImage(deanProfileData.signatureBase64, sigFormat, pageWidth - 54, footerY + 1, 40, 8, undefined, 'FAST');
    } catch (e) {
      console.warn("Could not embed Dean signature in PDF:", e);
    }
  }
  doc.setFontSize(9);
  const dateStr = `Printed: ${new Date().toLocaleString()}`;
  doc.text(dateStr, pageWidth - 14, footerY, { align: "right" });
  doc.text("__________________________", pageWidth - 14, footerY + 10, { align: "right" });
  doc.text("Dean's Signature", pageWidth - 14, footerY + 15, { align: "right" });

  // --- ADD PAGE NUMBERS & SYSTEM FOOTER TO ALL PAGES ---
  const totalPagesCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150); // Professional subtle gray
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${totalPagesCount}`, 14, pageHeight - 7);
    const genText = "CompetenceHub Analytics";
    const genTextWidth = doc.getTextWidth(genText);
    doc.text(genText, (pageWidth / 2) - (genTextWidth / 2), pageHeight - 7);
  }

  const streamSuffix = selectedStream !== "all" ? `_S${selectedStream}` : "";
  const termSuffix = termVal === "all" ? "Year" : `T${termVal}`;
  const fileName = `${schoolName}_Subjects_${grade}${streamSuffix}_${termSuffix}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
  } catch (err) {
    console.error("Subject PDF Export Error:", err);
  } finally {
    printSubjectReportBtn.disabled = false;
    printSubjectReportBtn.innerHTML = originalHTML;
  }
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

  // 🆕 Filter out disqualified learners for consistency across the dashboard
  const assessment = filterAssessmentEl?.value;
  const isAll = assessment === "all" || filterTermEl?.value === "all";
  
  const filteredData = currentAnalysisRawData.filter(m => {
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    return currentValidKeys.has(key);
  });

  // Respect stream filter for trend analysis
  const selectedStream = filterStreamEl?.value || "all";
  const dataToChart = selectedStream === "all" ? filteredData : filteredData.filter(m => m.stream === selectedStream);

  if (type === "trend") {
    renderTrendChart(dataToChart, currentIsSenior);
  } else {
    renderStreamBarChart(filteredData, currentIsSenior);
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
      try {
        deanProfileData.sigFormat = getImageFormat(deanProfileData.signatureBase64);
      } catch(e){}
    }

    // Pre-load school info and logo for PDF generation (always fresh, no cache)
    try {
      // Force clear any cached school info to get latest schoolType
      const SCHOOL_CACHE_KEY = "dean_school_info_cache";
      localStorage.removeItem(SCHOOL_CACHE_KEY);
      
      schoolInfo = await fetchWithAuth(`${API_BASE}/users/my-school?includeLogo=true`);
      if (schoolInfo) {
        // Cache briefly for performance but always refresh on page load
        localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: schoolInfo
        }));
        
        deanProfileData.schoolName = (schoolInfo.name || "School Name").toUpperCase();
        if (schoolInfo.logo) {
          let logoSrc = schoolInfo.logo;
          // If the logo is raw base64 (doesn't start with / or http), prepend the data URI prefix
          if (!logoSrc.startsWith('http') && !logoSrc.startsWith('/') && !logoSrc.startsWith('data:')) {
            const mimeType = schoolInfo.logoMimeType || 'image/png';
            logoSrc = `data:${mimeType};base64,${logoSrc}`;
          }
          
          // Note: getImageBase64 handles relative paths, absolute URLs, and data URIs
          deanProfileData.schoolLogoBase64 = await getImageBase64(logoSrc);

          // Pre-calculate properties once to speed up subsequent PDF generations
          try {
            const { jsPDF } = window.jspdf;
            const tempDoc = new jsPDF();
            deanProfileData.logoProps = tempDoc.getImageProperties(deanProfileData.schoolLogoBase64);
            deanProfileData.logoFormat = getImageFormat(deanProfileData.schoolLogoBase64);
          } catch (e) { console.warn("Failed to pre-parse logo:", e); }
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

// --- EVENT LISTENERS INITIALIZATION ---

if (applyFiltersBtn) applyFiltersBtn.addEventListener("click", generateReport);
if (printReportBtn) printReportBtn.addEventListener("click", downloadRankingAsPDF);
if (printSubjectReportBtn) printSubjectReportBtn.addEventListener("click", downloadSubjectPerformanceAsPDF);
if (printMissingReportBtn) printMissingReportBtn.addEventListener("click", downloadMissingExamsAsPDF);

if (filterSubjectEl) {
  filterSubjectEl.addEventListener("change", () => updateDashboardChart());
}
if (filterTargetEl) {
  filterTargetEl.addEventListener("input", () => updateDashboardChart());
}
if (filterStreamEl) {
  filterStreamEl.addEventListener("change", () => {
    if (currentAnalysisRawData) {
      // 🆕 Retrieve cached roster to ensure "Ungraded" logic continues to work on stream change
      const grade = filterGradeEl.value;
      const term = filterTermEl.value;
      const year = filterYearEl.value;
      const assessment = filterAssessmentEl.value;
      const cacheKey = `${grade}_${term}_${year}_${assessment}`;
      const cached = getAnalyticsCache(cacheKey);
      processAnalysisData(currentAnalysisRawData, currentIsSenior, assessment, currentPrevRawData, cached?.roster || []);
    }
  });
}
if (chartTypeToggle) {
  chartTypeToggle.addEventListener("change", () => updateDashboardChart());
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
  
  // Initialize the dashboard
  loadDeanProfile();
});
   
