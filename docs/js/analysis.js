// ===== ANALYSIS.JS(CLASSTEACHERS) =====

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const notAllowedEl = document.getElementById("notAllowed");
  const analysisWrap = document.getElementById("analysisWrap");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const generateBtn = document.getElementById("generateReport");
  const atRiskTabBtn = document.getElementById("atRiskTabBtn");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");

  const gradeFilter = document.getElementById("gradeFilter");
  const termFilter = document.getElementById("termFilter");
  const yearFilter = document.getElementById("yearFilter");
  const streamFilterSelect = document.getElementById("streamFilterSelect"); // 🆕 Stream filter
  const assessmentFilter = document.getElementById("assessmentFilter");

  const rankingTableWrap = document.getElementById("rankingTableWrap");
  const subjectTableWrap = document.getElementById("subjectTableWrap");
  const classMeanEl = document.getElementById("classMean");
  const passRateEl = document.getElementById("passRate");
  const recordsCountEl = document.getElementById("recordsCount");
  const statsSummaryGrid = document.querySelector(".stats-grid"); // Assuming this exists from dashboard layout
  const reportsUI = document.getElementById("reportsGenerationUI");

  // 🆕 New DOM elements for tabs
  const analysisTabsContainer = document.getElementById("analysisTabsContainer");
  const classRankingTabBtn = document.getElementById("classRankingTabBtn");
  const subjectAnalysisTabBtn = document.getElementById("subjectAnalysisTabBtn");
  const trendChartTabBtn = document.getElementById("trendChartTabBtn");
  const missingExamsTabBtn = document.getElementById("missingExamsTabBtn");
  const atRiskMonitorTabBtn = document.getElementById("atRiskMonitorTabBtn");

  const classRankingPane = document.getElementById("classRankingPane");
  const subjectAnalysisPane = document.getElementById("subjectAnalysisPane");
  const trendChartPane = document.getElementById("trendChartPane");

  // 🆕 Apply classes to existing filter containers
  const filterContainer = document.querySelector('.filter-grid') || document.querySelector('.filters-section');
  if (filterContainer) {
    filterContainer.classList.add('filters-section', 'filters-grid');
    filterContainer.querySelectorAll('.form-group, .col, .filter-group').forEach(el => {
      // 🆕 Safeguard: Only apply filter-item styling to actual input groups
      // and never to announcement elements or their containers.
      if (!el.closest('#announcementContainer, .announcement-popup, .announcement-overlay, .dashboard-announcement')) {
        el.classList.add('filter-item');
      }
    });
  }

  // 🆕 LEARNER JOURNEY MODAL
  const journeyModal = document.createElement('div');
  journeyModal.id = 'learnerJourneyModal';
  journeyModal.className = 'modal';
  journeyModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="journeyLearnerName">Learner Academic Journey</h3>
        <div style="display:flex; gap:10px; align-items:center;">
          <button id="printJourneyBtn" class="btn primary-btn small" style="padding: 6px 12px; color: white; font-size: 0.75rem;"><i class="fas fa-file-pdf"></i> Save Report</button>
          <button id="closeJourneyModal" title="Close Modal">&times;</button>
        </div>
      </div>
      <div id="journeyChartsArea">
        <div class="journey-chart-card">
           <h4>Academic Performance Trend</h4>
           <canvas id="individualTrendChart" height="200"></canvas>
        </div>
        <div class="journey-chart-card">
           <h4>Subject Proficiency Breakdown</h4>
           <canvas id="individualSubjectChart" height="200"></canvas>
        </div>
      </div>
      <div id="journeyTableArea" class="table-scroll-wrapper"></div>
    </div>
  `;
  document.body.appendChild(journeyModal);

  document.getElementById("closeJourneyModal").onclick = () => journeyModal.classList.remove('visible');
  document.getElementById("printJourneyBtn").onclick = exportJourneyPdf;

  // 🆕 Proficiency Distribution UI
  function updateProficiencyDistribution(studentArray, grade) {
    const distContainer = document.getElementById("proficiencyDistContainer");
    if (!distContainer) return;

    const levels = { EE: 0, ME: 0, AE: 0, BE: 0 };
    studentArray.forEach(s => {
      const lvl = window.cbcUtils.getPerformanceLevel(s.mean, grade);
      if (levels.hasOwnProperty(lvl)) levels[lvl]++;
    });

    distContainer.innerHTML = `
      <div class="dist-pill ee" title="Exceeding Expectations"><span>EE</span> <strong>${levels.EE}</strong></div>
      <div class="dist-pill me" title="Meeting Expectations"><span>ME</span> <strong>${levels.ME}</strong></div>
      <div class="dist-pill ae" title="Approaching Expectations"><span>AE</span> <strong>${levels.AE}</strong></div>
      <div class="dist-pill be" title="Below Expectations"><span>BE</span> <strong>${levels.BE}</strong></div>
    `;
  }

  let missingExamsTableWrap = document.getElementById("missingExamsTableWrap");
  // ===== API CONFIG =====
  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL;
  let currentUser = null;

  // ===== AUTH CHECK USING CENTRALIZED SERVICE =====
  currentUser = await window.authService?.getUserProfile(["teacher", "classteacher"]);
  if (!currentUser) return; // authService handles redirect to login if session is invalid

  if (!currentUser.isClassTeacher && !currentUser.roles?.includes("classteacher")) {
    alert("Access Denied: Class Teacher role required.");
    return window.location.href = "/teacher";
  }

  function showNotAllowed() {
    notAllowedEl?.classList.remove("hidden");
    analysisWrap?.classList.add("hidden");
  }

  function showAnalysis() {
    notAllowedEl?.classList.add("hidden");
    analysisWrap?.classList.remove("hidden");
    // 🆕 Ensure tab content is visible
    if (analysisTabsContainer) analysisTabsContainer.style.display = "block";
  }

  // ===== HELPERS =====
  function generateAIFeedback(points) {
    if (points >= 7) return "🚀 Outstanding performance! Encourage advanced tasks and peer mentoring.";
    if (points >= 5) return "👍 Good performance. Reinforce collaborative learning and creative thinking.";
    if (points >= 3) return "⚠️ Average performance. Focus on targeted interventions for weaker areas.";
    return "🔴 Below average. Plan personalized learning and extra support sessions.";
  }

  
  // ===== HELPER: GET ASSESSMENT LABEL =====
  const getAssessmentLabel = (value) => {
    const mapping = window.ASSESSMENT_MAPPING || {};
    return mapping[value] || (value === "all" ? "All Assessments" : `Assessment ${value}`);
  };

  // ===== POPULATE YEAR FILTER =====
  function populateYearFilter() {
    if (!yearFilter) return;
    const currentYear = new Date().getFullYear();
    yearFilter.innerHTML = "";
    
    // 🆕 Sensible range for selection
    for (let y = currentYear - 5; y <= currentYear + 100; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearFilter.appendChild(opt);
    }
    // 🆕 Select current year by default
    yearFilter.value = currentYear;
  }
  
  // ===== POPULATE ASSESSMENT FILTER =====
  function populateAssessmentFilter() {
    if (assessmentFilter && window.ASSESSMENT_MAPPING) {
      assessmentFilter.innerHTML = '<option value="">--Select Assessment--</option>';

      const optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "All Assessments";
      assessmentFilter.appendChild(optAll);

      Object.entries(window.ASSESSMENT_MAPPING).forEach(([val, label]) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        assessmentFilter.appendChild(opt);
      });
    }
  }

  // ===== POPULATE TERM FILTER =====
  function populateTermFilter() {
    if (!termFilter) return;
    termFilter.innerHTML = `
      <option value="all">All Terms</option>
      <option value="1">Term 1</option>
      <option value="2">Term 2</option>
      <option value="3">Term 3</option>
    `;
    
    const month = new Date().getMonth() + 1;
    let currentTerm = "1";
    if (month >= 5 && month <= 8) currentTerm = "2";
    else if (month >= 9) currentTerm = "3";
    termFilter.value = currentTerm;
  }

  // ===== BUTTONS =====
  refreshBtn?.addEventListener("click", () => window.location.reload());
  generateBtn?.addEventListener("click", generateReport);
  applyFiltersBtn?.addEventListener("click", generateReport);

  // Create Container for Edit Table
  const editContainer = document.createElement("div");
  editContainer.id = "editContainer";
  editContainer.style.display = "none";
  editContainer.style.marginTop = "20px";
  editContainer.className = "card";
  if (rankingTableWrap && rankingTableWrap.parentNode) {
    rankingTableWrap.parentNode.insertBefore(editContainer, rankingTableWrap);
  }

  /**
   * 🆕 Function to set up tab navigation
   */
  function setupAnalysisTabs() {
    const tabsContainer = document.getElementById("analysisTabsContainer");
    const panesContainer = tabsContainer?.querySelector(".tab-content") || tabsContainer;

    if (!tabsContainer || !panesContainer) return;

    // 🆕 Inject Tab "Vibe" Styles for a modern academic dashboard feel
    if (!document.getElementById('analysisTabVibeStyles')) {
      const style = document.createElement('style');
      style.id = 'analysisTabVibeStyles';
      style.textContent = `
        .analysis-tabs-container { border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; margin-top: 15px; display: flex; flex-wrap: wrap; gap: 8px; }
        .tab-btn { 
          display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; 
          border-radius: 12px; font-weight: 800; font-size: 0.8rem; border: 2px solid transparent;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: #f8fafc; color: #64748b; cursor: pointer;
        }
        .tab-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08); background: #ffffff; color: #1e293b; }
        
        /* Specific Vibe Colors for Active Tabs */
        .tab-btn.active[data-tab="classRankingPane"] { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
        .tab-btn.active[data-tab="subjectAnalysisPane"] { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
        .tab-btn.active[data-tab="trendChartPane"] { background: #f5f3ff; color: #7c3aed; border-color: #ddd6fe; }
        .tab-btn.active[data-tab="missingExamsPane"] { background: #fffbeb; color: #d97706; border-color: #fef3c7; }
        .tab-btn.active[data-tab="atRiskPane"] { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }
        
        .tab-btn i { font-size: 1rem; }
        .tab-btn.active i { transform: scale(1.1); transition: transform 0.3s ease; }
      `;
      document.head.appendChild(style);
    }

    // Inject CSS for compactness of tables
    if (!document.getElementById('analysisTableCompactStyles')) {
      const style = document.createElement("style");
      style.id = 'analysisTableCompactStyles';
      style.textContent = `
        .analysis-tabs-container .marks-table th,
        .analysis-tabs-container .marks-table td {
          padding: 6px 8px !important; /* Reduced padding */
          font-size: 0.8rem !important; /* Slightly smaller font */
        }
        .analysis-tabs-container .marks-table th {
          font-size: 0.7rem !important; /* Even smaller for headers */
          text-transform: uppercase;
          letter-spacing: 0.025em;
          font-weight: 700;
          color: #475569;
          background-color: #f8fafc;
        }
        .analysis-tabs-container .marks-table td {
          color: #1e293b;
        }
        .analysis-tabs-container .marks-table .view-journey-btn {
          padding: 2px 4px !important;
          font-size: 0.6rem !important;
        }
        .analysis-tabs-container .marks-table .ranking-search-toolbar {
          max-width: 300px; /* Make search bar more compact */
        }
        .analysis-tabs-container .marks-table .ranking-search-toolbar input {
          padding: 6px 10px !important;
          font-size: 0.75rem !important;
        }
        .analysis-tabs-container .marks-table .ranking-search-toolbar button {
          font-size: 1rem !important;
          right: 5px !important;
        }
        /* Specific adjustments for subject table */
        #subjectTableWrap .marks-table th,
        #subjectTableWrap .marks-table td {
          text-align: center; /* Center align for numerical data */
        }
        #subjectTableWrap .marks-table th:first-child,
        #subjectTableWrap .marks-table td:first-child {
          text-align: left; /* Left align for subject name */
        }
        /* Missing exams table */
        #missingExamsTableWrap .marks-table th,
        #missingExamsTableWrap .marks-table td {
          padding: 6px 8px !important;
          font-size: 0.8rem !important;
        }
        #missingExamsTableWrap .marks-table th {
          font-size: 0.7rem !important;
        }
        #missingExamsTableWrap .marks-table span.status-badge {
          font-size: 0.65rem !important;
          padding: 2px 5px !important;
        }
      `;
      document.head.appendChild(style);
    }

    // 🆕 Dynamically inject At-Risk Monitor Tab if missing
    if (!document.getElementById("atRiskMonitorTabBtn")) {
      const btn = document.createElement('button');
      btn.id = "atRiskMonitorTabBtn";
      btn.className = "tab-btn";
      btn.dataset.tab = "atRiskPane";
      btn.innerHTML = `<i class="fas fa-shield-alt"></i> At-Risk Monitor <span id="atRiskBadge" class="status-badge" style="display:none; background:#ef4444; color:white; margin-left:5px; font-size:0.6rem; min-width:18px;">0</span>`;

      const existingBtn = document.getElementById("missingExamsTabBtn");
      if (existingBtn) existingBtn.after(btn);
      else tabsContainer.prepend(btn);

      const pane = document.createElement('div');
      pane.id = "atRiskPane";
      pane.className = "tab-pane";
      pane.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8;">Generate a report to load risk analysis.</div>`;
      panesContainer.appendChild(pane);
    }

    // 🆕 Decorate existing buttons with icons and specific Vibes
    const decorate = (id, icon, text) => {
      const el = document.getElementById(id);
      if (el && !el.querySelector('i')) el.innerHTML = `<i class="fas ${icon}"></i> ${text}`;
    };
    decorate("classRankingTabBtn", "fa-award", "Leaderboard");
    decorate("subjectAnalysisTabBtn", "fa-brain", "Performance Map");
    decorate("trendChartTabBtn", "fa-chart-line", "Growth Trends");
    decorate("missingExamsTabBtn", "fa-search-minus", "Audit & Absences");

    const tabButtons = tabsContainer.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".analysis-tabs-container .tab-pane");

    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const targetTabId = button.dataset.tab;

        tabButtons.forEach(btn => btn.classList.remove("active"));
        tabPanes.forEach(pane => pane.classList.remove("active"));

        button.classList.add("active");
        document.getElementById(targetTabId)?.classList.add("active");

        // 🆕 Special handling for chart tab to ensure it renders correctly after being hidden
        if (targetTabId === "trendChartPane") {
          renderTrendChartWithData(currentFilteredData, currentIsSeniorSchool); // Re-render chart
        }
      });
    });
  }

  /**
   * 🆕 Consolidated Dashboard Initialization
   */
  async function initializeAnalysisDashboard(profile) {
    try {
      let classGrade = profile.classGrade || profile.assignedClass;

      // Fallback: If grade isn't in profile, try fetching allocations
      if (!classGrade) {
        try {
          const res = await fetch(`${API_BASE}/users/allocations`, {
            headers: { Authorization: `Bearer ${authService.getToken()}` }
          });
          const allocations = res.ok ? await res.json() : [];
          const myAlloc = allocations.find(a => a.teacherId === profile.id || a.teacherId === profile._id);
          if (myAlloc?.assignedClass) classGrade = myAlloc.assignedClass;
        } catch (e) { console.warn("Grade fallback resolution failed", e); }
      }

      if (!classGrade) return showNotAllowed();
      
      // Update local profile object
      profile.classGrade = classGrade;
      showAnalysis();

      if (gradeFilter) {
        gradeFilter.innerHTML = `<option value="${classGrade}">${classGrade}</option>`;
        gradeFilter.disabled = true;
      }

      const teacherInfoEl = document.getElementById("teacherInfo");
      if (teacherInfoEl) {
        teacherInfoEl.innerHTML = `<strong>${profile.name || "—"}</strong> | Grade: <strong>${classGrade}</strong>`;
        if (profile.assignedStream) {
          teacherInfoEl.innerHTML += ` | Stream: <strong>${profile.assignedStream}</strong>`;
        }
      }

      const streamDisplay = document.getElementById("streamDisplay");
      if (streamDisplay) {
        streamDisplay.style.display = "none"; // Hide the separate stream display element
      }

      if (streamFilterSelect) {
        streamFilterSelect.style.display = profile.assignedStream ? "block" : "none";
      }

      if (termFilter) {
        populateTermFilter();
        const group = termFilter.closest('.form-group, .filter-group, .col, .filter-item');
        if (group) group.style.display = "block";
        termFilter.style.setProperty('display', 'block', 'important');
      }

      // 🆕 Setup tabs after all filters are populated
      setupAnalysisTabs();

      if (yearFilter) {
        populateYearFilter();
        
        // 🆕 Ensure the year filter and its container are visible
        // Checking for common CBC Portal layout wrappers
        const group = yearFilter.closest('.form-group, .filter-group, .col, .filter-item');
        if (group) group.style.display = "block";
        yearFilter.style.setProperty('display', 'block', 'important');
      }
      populateAssessmentFilter();

      // Load School Info
      const schoolRes = await fetch(`${API_BASE}/users/my-school?includeLogo=false&fields=name,gradingConfig`, {
        headers: { Authorization: `Bearer ${authService.getToken()}` }
      });
      if (!schoolRes.ok) return;
      const school = await schoolRes.json();

      const nameEl = document.getElementById("schoolName");
      if (school.gradingConfig) window.cbcUtils.customGradingConfig = school.gradingConfig;
      if (nameEl) nameEl.textContent = `${school.name}`;
    } catch (err) {
      console.error("Initialization Error:", err);
      showNotAllowed();
    }
  }

  // Start sequential init
  await initializeAnalysisDashboard(currentUser);

  let currentFilteredData = null; // 🆕 Store filtered data for chart re-rendering
  let currentIsSeniorSchool = false; // 🆕 Store senior school status for chart re-rendering
  async function getFilteredMarks(page = null, limit = null, search = "", streamOverride = null, assessmentOverride = null, termOverride = null) {
    if (!currentUser?.classGrade) return [];

    // Build filter values - always send term and assessment (use "all" if not selected)
    const termValue = termOverride || termFilter?.value || "all";
    const yearValue = yearFilter?.value ? Number(yearFilter.value) : new Date().getFullYear();
    const assessmentValue = assessmentOverride || assessmentFilter?.value || "all";

    const params = new URLSearchParams({ 
      grade: currentUser.classGrade,
      term: termValue,
      year: yearValue,
      assessment: assessmentValue
    });

    // 🆕 Handle stream filter based on selection
    const streamMode = streamOverride || streamFilterSelect?.value;
    if (streamMode === "assigned" && currentUser.assignedStream) {
      // "My Stream Only" - filter by the teacher's assigned stream
      params.append("stream", currentUser.assignedStream);
    } else {
      // "All Leaners (Whole Class)" - fetch all students in the grade regardless of stream
      params.append("stream", "");
    }

    if (page) params.append("page", page);
    if (limit) params.append("limit", limit);
    if (search) params.append("search", search);

    console.log("[Analysis] Fetching marks with params:", Object.fromEntries(params.entries()));

    try {
      const token = window.authService?.getToken();
      const res = await fetch(`${API_BASE}/marks/by-grade?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        authService.redirectToLogin();
        return [];
      }
      if (!res.ok) throw new Error("Failed to fetch marks");

      const data = await res.json();

      console.log("[Analysis] Received data:", Array.isArray(data) ? data.length : (data.total || 0), "records");

      const rawData = (page && limit && data.data) ? data.data : data;

      const normalized = Array.isArray(rawData) ? rawData.map(m => ({
        admissionNo: m.admissionNo,
        studentName: m.studentName || "Unnamed",
        grade: m.grade || currentUser.classGrade,
        stream: m.stream || null,
        term: Number(m.term) || 0,
        year: Number(m.year) || 0,
        assessment: String(m.assessment),
        subjects: Array.isArray(m.subjects) ? m.subjects.map(s => ({
          _id: s._id, 
          subject: s.subject ? String(s.subject) : null, 
          score: (s.score !== undefined && s.score !== null && s.score !== "") ? Number(s.score) : null,
          course: s.course || null,
          pathway: s.pathway || null,
          continuousAssessment: s.continuousAssessment,
          projectWork: s.projectWork,
          endTermExam: s.endTermExam,
          finalScore: s.finalScore
        })) : [],
        course: m.course || null,
        continuousAssessment: m.continuousAssessment || null,
        projectWork: m.projectWork || null,
        endTermExam: m.endTermExam || null,
        finalScore: m.finalScore || null
      })) : [];

      if (page && limit) {
        return {
          data: normalized,
          total: data.total || 0,
          totalPages: data.totalPages || 1,
          currentPage: data.page || 1
        };
      }

      console.log("[Analysis] Normalized to:", normalized.length, "records");
      return normalized;
    } catch (err) {
      console.error("[Analysis] Error fetching marks:", err);
      return [];
    }
  }

  // ===== CALCULATE STATS =====
  function calculateStats(filtered, roster = [], selectedStreamMode = "all", allTermRaw = null, prevTermRaw = null) {
    if (!filtered.length && !roster.length) return { studentArray: [], subjects: [], subjectMeans: {}, classMean: 0, records: 0, groupedByAssessment: {}, missingExamsList: [], streamDiscrepancies: [] };

    const assessment = assessmentFilter?.value || "all";
    const isAllAssessments = assessment === "all";

    const normalizeSeniorSubjectName = (subjectName) => {
    const name = String(subjectName || "").trim();
    const normalized = name.toLowerCase();
    const aliases = {
      "physical education": "PE",
      "phys ed": "PE",
      "sports and physical education": "PE",
      "physical health education": "PE",
      "pe": "PE"
    };
    return aliases[normalized] || name;
  };

  const isExcludedSeniorSubject = (subjectName) => {
    const normalized = normalizeSeniorSubjectName(subjectName);
    return normalized.toUpperCase() === "PE";
  };

  // 🆕 Determine Baseline for Progress (Intra-term vs Inter-term)
    const prevSubjectMeans = {};
    const prevStudentMeans = {};
    let prevBaselineData = null;

    if (assessment !== "all" && allTermRaw) {
      const currentId = parseInt(assessment);
      const predecessorId = [...new Set(allTermRaw.map(m => parseInt(m.assessment)))]
        .filter(id => id < currentId)
        .sort((a, b) => b - a)[0];

      prevBaselineData = predecessorId ? allTermRaw.filter(m => parseInt(m.assessment) === predecessorId) : prevTermRaw;
    } else {
      prevBaselineData = prevTermRaw;
    }

    if (prevBaselineData && Array.isArray(prevBaselineData)) {
      const pStudentsMap = {};
      prevBaselineData.forEach(m => {
        if (!pStudentsMap[m.admissionNo]) pStudentsMap[m.admissionNo] = { subjects: {}, hasAbsence: false };
        m.subjects.forEach(sub => {
          const score = sub.score;
          const isAbs = score === null || score === undefined || String(score).toUpperCase() === "X" || String(score).trim() === "";
          if (isAbs) pStudentsMap[m.admissionNo].hasAbsence = true;
          pStudentsMap[m.admissionNo].subjects[sub.subject] = isAbs ? null : Number(score);
        });
      });

      const pSubTotals = {}, pSubCounts = {};
      Object.entries(pStudentsMap).forEach(([adm, s]) => {
        if (s.hasAbsence) return;
        const vals = Object.values(s.subjects).filter(v => v !== null);
        if (vals.length) {
          prevStudentMeans[adm] = vals.reduce((a, b) => a + b, 0) / vals.length;
          Object.entries(s.subjects).forEach(([sub, score]) => {
            pSubTotals[sub] = (pSubTotals[sub] || 0) + score;
            pSubCounts[sub] = (pSubCounts[sub] || 0) + 1;
          });
        }
      });
      Object.keys(pSubCounts).forEach(sub => prevSubjectMeans[sub] = pSubTotals[sub] / pSubCounts[sub]);
    }

    const streamExpectedSubjectsMap = {};
    const allSubjectsInGrade = new Set();
    const subjectsSet = new Set();
    const students = {};
    const missingExamsMap = {};

    filtered.forEach(m => {
      const stream = m.stream || "Unassigned";
      if (!streamExpectedSubjectsMap[stream]) streamExpectedSubjectsMap[stream] = new Set();
      
      m.subjects.forEach(sub => {
        if (sub.subject) {
          streamExpectedSubjectsMap[stream].add(sub.subject);
          allSubjectsInGrade.add(sub.subject);
          subjectsSet.add(sub.subject);
        }
      });

      const key = `${m.admissionNo}_${m.assessment}_${m.term}_${m.year}`;

      if (!students[key]) students[key] = { admissionNo: m.admissionNo, name: m.studentName || "Unnamed", grade: m.grade, assessment: m.assessment, term: m.term, year: m.year, subjects: {}, hasAbsence: false };
      m.subjects.forEach(s => { 
        const scoreVal = s.score;
        // Robust absence check: catch null (X from DB), undefined, explicit 'X', or empty
        const isAbs = scoreVal === null || scoreVal === undefined || (typeof scoreVal === 'string' && scoreVal.trim().toUpperCase() === "X") || String(scoreVal).trim() === "";
        
        if (isAbs) students[key].hasAbsence = true;
        students[key].subjects[s.subject] = isAbs ? null : Number(scoreVal); 
      });
    });

    Object.keys(streamExpectedSubjectsMap).forEach(s => {
      streamExpectedSubjectsMap[s] = Array.from(streamExpectedSubjectsMap[s]);
    });

    const streamDiscrepancies = calculateStreamDiscrepancies(streamExpectedSubjectsMap, allSubjectsInGrade);
    const sortedSubjects = Array.from(subjectsSet).sort();

    // Pass 2: Detect Absences/Missing Components
    Object.values(students).forEach(s => {
      const stream = s.stream || "Unassigned";
      const subjectsToValidate = (selectedStreamMode === "all") ? (streamExpectedSubjectsMap[stream] || []) : sortedSubjects;

      subjectsToValidate.forEach(subName => {
        const score = s.subjects[subName];
        const isMissing = score === undefined || score === null || (typeof score === 'string' && score.trim().toUpperCase() === "X");

        if (isMissing) {
          s.hasAbsence = true;
          const studentAssessKey = isAllAssessments ? `${s.admissionNo}_overall` : `${s.admissionNo}_${s.assessment}`;
          if (!missingExamsMap[studentAssessKey]) {
            missingExamsMap[studentAssessKey] = { name: s.name, adm: s.admissionNo, stream: s.stream || "Unassigned", assess: isAllAssessments ? "Overall Performance" : getAssessmentLabel(s.assessment), subjects: [] };
          }
          if (!missingExamsMap[studentAssessKey].subjects.includes(subName)) {
            missingExamsMap[studentAssessKey].subjects.push(subName);
          }
        }
      });
    });

    // Pass 3: Identify Entirely Ungraded Learners
    const targetStream = (selectedStreamMode === "assigned") ? currentUser.assignedStream : null;
    let filteredRoster = roster;
    if (targetStream) filteredRoster = roster.filter(r => r.stream === targetStream);

    if (filteredRoster.length > 0 && !isAllAssessments) {
      const submittedAdms = new Set(filtered.map(m => m.admissionNo));
      const currentAssessLabel = getAssessmentLabel(assessment);

      filteredRoster.forEach(learner => {
        const adm = learner.admissionNo || learner.admission;
        if (!submittedAdms.has(adm)) {
          missingExamsMap[`${adm}_ungraded`] = {
            name: learner.name,
            adm: adm,
            stream: learner.stream || "Unassigned",
            assess: currentAssessLabel,
            subjects: ["RECORDS NOT FOUND (Entirely Ungraded)"]
          };
        }
      });
    }

    const studentArray = Object.values(students)
      .filter(s => !s.hasAbsence) // 🚫 Exclude students with any "X" or missing component from ranking
      .map(s => {
      const scores = Object.values(s.subjects);
      const total = scores.reduce((a, b) => a + b, 0);
      const mean = scores.length ? total / scores.length : 0;
      const totalPoints = scores.reduce((sum, score) => sum + window.cbcUtils.getPoints(score, s.grade), 0);
      
      const pMean = prevStudentMeans[s.admissionNo];
      const progress = (pMean !== undefined && pMean > 0) ? (mean - pMean) : null;
      
      return { ...s, total, mean, totalPoints, progress };
    });

    const groupedByAssessment = {};
    studentArray.forEach(s => {
      if (!groupedByAssessment[s.assessment]) groupedByAssessment[s.assessment] = [];
      groupedByAssessment[s.assessment].push(s);
    });

    Object.values(groupedByAssessment).forEach(arr => {
      arr.sort((a, b) => b.mean - a.mean);
      let prevMean = null, prevRank = 0, currentRank = 0;
      arr.forEach(stu => {
        currentRank++;
        const currentVal = parseFloat(stu.mean.toFixed(2));
        if (currentVal === prevMean) stu.rank = prevRank;
        else { stu.rank = currentRank; prevRank = currentRank; }
        prevMean = currentVal;
      });
    });

    const subjects = Array.from(subjectsSet);
    const classMean = studentArray.length ? studentArray.reduce((a, s) => a + s.mean, 0) / studentArray.length : 0;
    
    // 🆕 Calculate Subject Means only from qualified students
    const subjectTotals = {}, subjectCounts = {};
    studentArray.forEach(s => {
      subjects.forEach(sub => {
        const score = s.subjects[sub];
        if (score !== null && score !== undefined) {
          subjectTotals[sub] = (subjectTotals[sub] || 0) + score;
          subjectCounts[sub] = (subjectCounts[sub] || 0) + 1;
        }
      });
    });

    const subjectMeans = {};
    subjects.forEach(sub => { 
      subjectMeans[sub] = subjectCounts[sub] ? (subjectTotals[sub] / subjectCounts[sub]) : 0; 
    });

    return { studentArray, subjects: sortedSubjects, subjectMeans, subjectCounts, prevSubjectMeans, classMean, records: studentArray.length, groupedByAssessment, missingExamsList: Object.values(missingExamsMap).sort((a,b) => a.name.localeCompare(b.name)), streamDiscrepancies };
  }

  // ===== CALCULATE SENIOR SCHOOL STATS (Component-Based) =====
  function calculateSeniorSchoolStats(filtered, roster = [], selectedStreamMode = "all", allTermRaw = null, prevTermRaw = null) {
    if (!filtered.length && !roster.length) {
      return { studentArray: [], groupedByAssessment: {}, subjects: [], classMean: 0, records: 0, subjectMeans: {}, missingExamsList: [], streamDiscrepancies: [] };
    }

    const assessment = assessmentFilter?.value || "all";
    const isAllAssessments = assessment === "all";

    // 🆕 Determine Baseline for Progress
    const prevSubjectMeans = {};
    const prevStudentMeans = {};
    let prevBaselineData = null;

    if (assessment !== "all" && allTermRaw) {
        const currentId = parseInt(assessment);
        const predecessorId = [...new Set(allTermRaw.map(m => parseInt(m.assessment)))]
            .filter(id => id < currentId)
            .sort((a,b) => b - a)[0];
        prevBaselineData = predecessorId ? allTermRaw.filter(m => parseInt(m.assessment) === predecessorId) : prevTermRaw;
    } else {
        prevBaselineData = prevTermRaw;
    }

    if (prevBaselineData && Array.isArray(prevBaselineData)) {
        const pMap = {};
        prevBaselineData.forEach(m => {
            if (!pMap[m.admissionNo]) pMap[m.admissionNo] = { subjects: {}, hasAbsence: false };
            (m.subjects || []).forEach(sub => {
                const name = sub.course || sub.subject;
                if (!name || name === 'null') return;
                const score = window.cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam);
                if (score === "X" || score === null) pMap[m.admissionNo].hasAbsence = true;
                pMap[m.admissionNo].subjects[name] = score;
            });
        });
        const pSubTotals = {}, pSubCounts = {};
        Object.entries(pMap).forEach(([adm, s]) => {
            if (s.hasAbsence) return;
            const valid = Object.values(s.subjects).filter(v => v !== null && v !== "X").map(Number);
            if (valid.length) {
                prevStudentMeans[adm] = valid.reduce((a,b)=>a+b,0) / valid.length;
                Object.entries(s.subjects).forEach(([n, v]) => {
                    if (v !== null && v !== "X") {
                        pSubTotals[n] = (pSubTotals[n] || 0) + Number(v);
                        pSubCounts[n] = (pSubCounts[n] || 0) + 1;
                    }
                });
            }
        });
        Object.keys(pSubCounts).forEach(n => prevSubjectMeans[n] = pSubTotals[n] / pSubCounts[n]);
    }
  
    const streamExpectedSubjectsMap = {};
    const allSubjectsInGrade = new Set();
    const subjectsSet = new Set();
    const students = {};
    const missingExamsMap = {};

    // Pass 1: Build Subject Maps
    filtered.forEach(m => {
      const stream = m.stream || "Unassigned";
      if (!streamExpectedSubjectsMap[stream]) streamExpectedSubjectsMap[stream] = new Set();
      
      if (m.subjects) {
        m.subjects.forEach(sub => {
          const subName = sub.course || sub.subject;
          if (!subName || subName === 'null' || isExcludedSeniorSubject(subName)) return;
          streamExpectedSubjectsMap[stream].add(subName);
          allSubjectsInGrade.add(subName);
          subjectsSet.add(subName);
        });
      }
    });
    Object.keys(streamExpectedSubjectsMap).forEach(s => streamExpectedSubjectsMap[s] = Array.from(streamExpectedSubjectsMap[s]));

    const subjectTotals = {};
    const subjectCounts = {};
  
    // 1. Group subjects by student and calculate final scores
    filtered.forEach(m => {
      if (!m.subjects || !Array.isArray(m.subjects)) return;
  
      // Use composite key to separate assessments
      const studentKey = `${m.admissionNo}_${m.assessment}_${m.term}_${m.year}`;
      if (!students[studentKey]) {
        students[studentKey] = {
          admissionNo: m.admissionNo,
          name: m.studentName || "Unnamed",
          grade: m.grade,
          assessment: m.assessment,
          subjects: {},
          hasAbsence: false
        };
      }
  
      m.subjects.forEach(sub => {
        if (sub.subject === 'CA' || sub.subject === 'PW') return;

        const subjectName = sub.course || sub.subject;
        if (!subjectName || subjectName === 'null' || isExcludedSeniorSubject(subjectName)) return; // Skip if no name found or is a non-graded senior subject

        const finalScore = window.cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam);
        const isAbs = finalScore === null || finalScore === "X";
        if (isAbs) students[studentKey].hasAbsence = true;

        if (finalScore !== null && !isAbs) {
          students[studentKey].subjects[subjectName] = finalScore;
          subjectTotals[subjectName] = (subjectTotals[subjectName] || 0) + finalScore;
          subjectCounts[subjectName] = (subjectCounts[subjectName] || 0) + 1;
        }
      });
    });
  
    const streamDiscrepancies = calculateStreamDiscrepancies(streamExpectedSubjectsMap, allSubjectsInGrade);
    const sortedSubjects = Array.from(subjectsSet).sort();

    // Pass 2: Absences
    Object.values(students).forEach(s => {
      const stream = s.stream || "Unassigned";
      const subjectsToValidate = (selectedStreamMode === "all") ? (streamExpectedSubjectsMap[stream] || []) : sortedSubjects;

      subjectsToValidate.forEach(subName => {
        const score = s.subjects[subName];
        const isMissing = score === undefined || score === null || score === "X";
        if (isMissing) {
          s.hasAbsence = true;
          const studentAssessKey = isAllAssessments ? `${s.admissionNo}_overall` : `${s.admissionNo}_${s.assessment}`;
          if (!missingExamsMap[studentAssessKey]) {
            missingExamsMap[studentAssessKey] = { name: s.name, adm: s.admissionNo, stream: s.stream || "Unassigned", assess: isAllAssessments ? "Overall" : getAssessmentLabel(s.assessment), subjects: [] };
          }
          if (!missingExamsMap[studentAssessKey].subjects.includes(subName)) missingExamsMap[studentAssessKey].subjects.push(subName);
        }
      });
    });

    // Pass 3: Ungraded
    const targetStream = (selectedStreamMode === "assigned") ? currentUser.assignedStream : null;
    let filteredRoster = roster;
    if (targetStream) filteredRoster = roster.filter(r => r.stream === targetStream);

    if (filteredRoster.length > 0 && !isAllAssessments) {
      const submittedAdms = new Set(filtered.map(m => m.admissionNo));
      const currentAssessLabel = getAssessmentLabel(assessment);

      filteredRoster.forEach(learner => {
        const adm = learner.admissionNo || learner.admission;
        if (!submittedAdms.has(adm)) {
          missingExamsMap[`${adm}_ungraded`] = {
            name: learner.name,
            adm: adm,
            stream: learner.stream || "Unassigned",
            assess: currentAssessLabel,
            subjects: ["RECORDS NOT FOUND (Entirely Ungraded)"]
          };
        }
      });
    }

    // 2. Calculate total, mean, and points for each student
    const studentArray = Object.values(students)
      .filter(s => !s.hasAbsence) // 🚫 Exclude students with any "X" or missing component from ranking
      .map(s => {
      const scores = Object.values(s.subjects).filter(score => score !== null);
      const total = scores.reduce((a, b) => a + b, 0);
      const mean = scores.length ? total / scores.length : 0;
      const totalPoints = scores.reduce((sum, score) => sum + window.cbcUtils.getPoints(score, s.grade), 0);
      
      const pMean = prevStudentMeans[s.admissionNo];
      const progress = (pMean !== undefined && pMean > 0) ? (mean - pMean) : null;

      return { ...s, total, mean, totalPoints, progress };
    });
  
    // 3. Group by Assessment and Rank within groups
    const groupedByAssessment = {};
    studentArray.forEach(s => {
      if (!groupedByAssessment[s.assessment]) groupedByAssessment[s.assessment] = [];
      groupedByAssessment[s.assessment].push(s);
    });

    Object.values(groupedByAssessment).forEach(group => {
      group.sort((a, b) => b.mean - a.mean);
      let prevMean = null, prevRank = 0, currentRank = 0;
      group.forEach(stu => {
        currentRank++;
        const currentVal = parseFloat(stu.mean.toFixed(2));
        if (currentVal === prevMean) {
          stu.rank = prevRank;
        } else {
          stu.rank = currentRank;
          prevRank = currentRank;
        }
        prevMean = currentVal;
      });
    });
  
    // 4. Calculate class mean and subject means
    const classMean = studentArray.length ? studentArray.reduce((a, s) => a + s.mean, 0) / studentArray.length : 0;
    const allSubjects = Array.from(subjectsSet);
    const subjectMeans = {};
    allSubjects.forEach(sub => {
      subjectMeans[sub] = (subjectTotals[sub] || 0) / (subjectCounts[sub] || 1);
    });

    return {
      studentArray,
      groupedByAssessment,
      subjects: allSubjects,
      classMean,
      records: studentArray.length,
      subjectMeans,
      subjectCounts,
      missingExamsList: Object.values(missingExamsMap).sort((a,b) => a.name.localeCompare(b.name)),
      streamDiscrepancies,
      prevSubjectMeans
    };
  }

  function calculateStreamDiscrepancies(streamExpectedSubjectsMap, allSubjectsInGrade) {
    const discrepancies = [];
    Object.entries(streamExpectedSubjectsMap).forEach(([stream, subjects]) => {
      const missingInStream = Array.from(allSubjectsInGrade).filter(s => !subjects.includes(s));
      if (missingInStream.length > 0) discrepancies.push({ stream, missingSubjects: missingInStream });
    });
    return discrepancies;
  }


  // ===== RENDER TABLES =====
  function syncDualScroll(pane) {
    const wrappers = pane.querySelectorAll('.table-responsive');
    wrappers.forEach(wrapper => {
      const table = wrapper.querySelector('table');
      const topScroll = wrapper.previousElementSibling;
      if (!table || !topScroll || !topScroll.classList.contains('top-scroll-wrapper')) return;
      const topContent = topScroll.querySelector('.top-scroll-content');
      
      const update = () => {
        const tableWidth = table.offsetWidth;
        const wrapperWidth = wrapper.offsetWidth;
        topScroll.style.display = tableWidth > wrapperWidth ? "block" : "none";
        topContent.style.width = tableWidth + "px";
      };
      update();
      topScroll.onscroll = () => { wrapper.scrollLeft = topScroll.scrollLeft; };
      wrapper.onscroll = () => { topScroll.scrollLeft = wrapper.scrollLeft; };
      wrapper._syncUpdate = update; // Store for global resize
    });
  }

  function renderRankingTable(stats) {
    if (!classRankingPane) return; // 🆕 Ensure pane exists
    if (!stats.studentArray.length) { classRankingPane.innerHTML = "<div class='small'>No ranking data found.</div>"; return; }
    
    let html = "";
    const searchInputsToAttach = []; // To store IDs and table references for event listeners

    Object.keys(stats.groupedByAssessment).forEach(assessmentKey => {
      const arr = stats.groupedByAssessment[assessmentKey];
      if (!arr.length) return;
      let assessLabel = getAssessmentLabel(assessmentKey);
      
      // Generate unique IDs for search input and clear button for each assessment block
      const searchInputId = `rankingSearchInput_${assessmentKey}`;
      const clearBtnId = `clearRankingSearch_${assessmentKey}`;
      const tableResponsiveId = `tableResponsive_${assessmentKey}`;

      html += `<div style="text-align: right; margin-bottom: 15px;"><button id="exportRankingPdfBtn_${assessmentKey}" class="btn primary-btn">Download Ranking PDF</button></div>`;
      html += `
        <div class="ranking-search-toolbar" style="margin-bottom: 10px; position: relative; max-width: 400px;">
          <input type="text" id="${searchInputId}" placeholder="🔍 Search learner by name or Adm No..." class="form-control" style="width: 100%; padding: 10px; padding-right: 35px; border: 1px solid #cbd5e0; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <button id="${clearBtnId}" title="Clear search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 1.2rem; color: #94a3b8; cursor: pointer; display: none;">&times;</button>
        </div>`;
      html += `<h4>Assessment ${assessLabel}</h4>`;
      html += `<div class="top-scroll-wrapper"><div class="top-scroll-content"></div></div>`;
      html += `<div class="table-responsive" id="${tableResponsiveId}">`;
      html += `<table><thead><tr><th>Rank</th><th>Name</th>`; // Removed inline styles, now handled by CSS
      stats.subjects.forEach(sub => html += `<th>${sub}</th>`); // Removed inline styles, now handled by CSS
      html += `<th>Total Marks</th><th>Progress</th><th>Total Points</th><th>Level</th><th class="no-print">Track</th></tr></thead><tbody>`; // Abbreviated headers
      arr.forEach(s => { // Use getAssessmentLabel for row as well
        let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
        if (s.progress !== null) {
            const diff = s.progress;
            if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;">+${diff.toFixed(1)}</span>`;
            else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;">${diff.toFixed(1)}</span>`;
            else progressHtml = `<span style="color:#3498db; font-size:0.8rem;">-</span>`;
        }
        
        html += `<tr><td>${s.rank}</td><td>${s.name}</td>`; // Removed inline styles, now handled by CSS
        stats.subjects.forEach(sub => {
          const score = s.subjects[sub];
          const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
          const display = isAbs ? '<span style="color:#ef4444; font-weight:700;">ABS</span>' : score;
          html += `<td style="text-align:center;">${display}</td>`; // Center align scores
        });
        html += `<td style="text-align:center;">${s.total}</td><td style="text-align:center;">${progressHtml}</td><td style="text-align:center;"><strong>${s.totalPoints}</strong></td><td style="text-align:center;">${window.cbcUtils.getSubdivision(s.mean, s.grade)}</td>
        <td class="no-print" style="text-align:center;"><button class="btn secondary-btn view-journey-btn" data-adm="${s.admissionNo}" data-name="${s.name}"><i class="fas fa-chart-line"></i></button></td></tr>`; // Icon-only button
      });

      // Calculate Totals and Means for Footer
      const groupTotalMarks = arr.reduce((acc, s) => acc + s.total, 0);
      const groupTotalPoints = arr.reduce((acc, s) => acc + s.totalPoints, 0);
      const groupMeanSum = arr.reduce((acc, s) => acc + s.mean, 0);
      const groupCount = arr.length || 1;

      html += `</tbody><tfoot style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #000;">`;
      
      // TOTAL Row
      html += `<tr><td colspan="2" style="text-align: right;">TOTAL:</td>`;
      stats.subjects.forEach(sub => {
        const subSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        html += `<td style="text-align: center;">${subSum.toFixed(0)}</td>`;
      });
      html += `<td style="text-align: center;">${groupTotalMarks.toFixed(0)}</td>`;
      html += `<td></td>`; // Progress spacer
      html += `<td style="text-align: center;">${groupTotalPoints}</td>`;
      html += `<td></td>`; // Level spacer
      html += `<td></td></tr>`; // Tracking spacer

      // MEAN Row
      html += `<tr><td colspan="2" style="text-align: right;">MEAN:</td>`;
      stats.subjects.forEach(sub => {
        const subSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        const subCount = arr.filter(s => s.subjects[sub] !== undefined).length || 1;
        html += `<td style="text-align: center;">${(subSum / subCount).toFixed(1)}</td>`;
      });
      html += `<td style="text-align: center;">${(groupTotalMarks / groupCount).toFixed(1)}</td>`;
      html += `<td></td>`; // Progress spacer
      html += `<td style="text-align: center;">${(groupTotalPoints / groupCount).toFixed(1)}</td>`;
      html += `<td style="text-align: center; color: #1a237e;">${window.cbcUtils.getSubdivision(groupMeanSum / groupCount, arr[0]?.grade)}</td>`;
      html += `<td></td></tr></tfoot></table></div>`;
    });
    classRankingPane.innerHTML = html; // 🆕 Render directly into pane
    syncDualScroll(classRankingPane);

    // Attach event listeners for each search bar and PDF button
    Object.keys(stats.groupedByAssessment).forEach(assessmentKey => {
      const searchInputId = `rankingSearchInput_${assessmentKey}`;
      const clearBtnId = `clearRankingSearch_${assessmentKey}`;
      const tableResponsiveId = `tableResponsive_${assessmentKey}`;

      const rSearchInput = document.getElementById(searchInputId);
      const rClearBtn = document.getElementById(clearBtnId);
      const tableResponsiveDiv = document.getElementById(tableResponsiveId);

      if (rSearchInput && rClearBtn && tableResponsiveDiv) {
        const filterRanking = (val) => {
          const query = val.toLowerCase().trim();
          const rows = tableResponsiveDiv.querySelectorAll("tbody tr"); // Filter only within this table's rows
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? "" : "none";
          });
          rClearBtn.style.display = query ? "block" : "none";
        };

        rSearchInput.addEventListener("input", (e) => filterRanking(e.target.value));
        rClearBtn.addEventListener("click", () => {
          rSearchInput.value = "";
          filterRanking("");
        });
      }
      document.getElementById(`exportRankingPdfBtn_${assessmentKey}`)?.addEventListener("click", exportPdf);
    });
    // Attach event listener to the newly rendered button
    document.getElementById("exportRankingPdfBtn")?.addEventListener("click", exportPdf);

    // Attach Journey Listeners
    classRankingPane.querySelectorAll('.view-journey-btn').forEach(btn => {
      btn.onclick = () => showLearnerJourney(btn.dataset.adm, btn.dataset.name);
    });
  }

  /**
   * 🆕 Renders a longitudinal journey for a single student
   */
  async function showLearnerJourney(admissionNo, studentName) {
    const grade = gradeFilter?.value;
    const year = yearFilter?.value;
    document.getElementById("journeyLearnerName").textContent = `${studentName} (${admissionNo})`;
    
    if (!currentFilteredData) {
        return window.showToast("Please generate a report first to load journey data.", "error");
    }

    requestAnimationFrame(() => journeyModal.classList.add('visible'));
    
    const tableArea = document.getElementById("journeyTableArea");
    tableArea.innerHTML = '<div style="text-align:center; padding:20px;"><span class="spinner"></span> Loading journey data...</div>';

    try {
      // Filter currentFilteredData (which has all assessments if assessment='all' was selected)
      // or fetch fresh for this student
      // Use loose equality == to handle string/number admission number mismatches
      let studentHistory = currentFilteredData.filter(m => m.admissionNo == admissionNo);
      
      // Sort by Term then Assessment
      studentHistory.sort((a,b) => (a.term - b.term) || (a.assessment - b.assessment));

      let html = `<table class="marks-table"><thead><tr><th>T</th><th>Assess</th>`;
      const subjects = Array.from(new Set(studentHistory.flatMap(h => h.subjects.map(s => s.subject || s.course)))).sort();
      subjects.forEach(s => html += `<th>${window.cbcUtils.getAbbreviatedSubjectName(s)}</th>`);
      html += `<th class="col-mean">Mean</th><th>Level</th></tr></thead><tbody>`;

      const chartLabels = [];
      const chartData = [];

      studentHistory.forEach(h => {
        const scoreMap = {};
        h.subjects.forEach(s => scoreMap[s.subject || s.course] = s.score || s.finalScore);
        
        const scores = Object.values(scoreMap).filter(v => v !== null && !isNaN(v));
        const mean = scores.length ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) : 0;
        const label = `T${h.term} ${getAssessmentLabel(h.assessment)}`;
        
        chartLabels.push(label);
        chartData.push(mean);

        html += `<tr>
          <td>T${h.term}</td>
          <td>${getAssessmentLabel(h.assessment)}</td>
          ${subjects.map(s => `<td>${scoreMap[s] || '-'}</td>`).join('')}
          <td class="col-mean">${mean}%</td>
          <td>${window.cbcUtils.getSubdivision(mean, h.grade)}</td>
        </tr>`;
      });

      html += `</tbody></table>`;
      tableArea.innerHTML = html;

      // Render mini trend chart in modal
      renderIndividualTrendChart(chartLabels, chartData);
      renderIndividualSubjectChart(subjects, studentHistory);

    } catch (e) {
      console.error("Learner Journey Error:", e);
      tableArea.innerHTML = `<p style="color:red; text-align:center;">Failed to load journey.</p>`;
    }
  }

  function renderIndividualTrendChart(labels, data) {
    const ctx = document.getElementById("individualTrendChart").getContext("2d");
    if (window.indivTrendChartInstance instanceof Chart) window.indivTrendChartInstance.destroy();
    window.indivTrendChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Mean Score %', data, borderColor: '#2563eb', tension: 0.3, fill: true, backgroundColor: 'rgba(37,99,235,0.05)' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
  }

  // 🆕 Expose to window for external modules like at-risk-monitor.js
  window.showLearnerJourney = showLearnerJourney;

  function renderIndividualSubjectChart(subjects, history) {
    const ctx = document.getElementById("individualSubjectChart").getContext("2d");
    if (window.indivSubjectChartInstance instanceof Chart) window.indivSubjectChartInstance.destroy();

    const subjectAverages = subjects.map(subName => {
      let sum = 0, count = 0;
      history.forEach(h => {
        const sub = h.subjects.find(s => (s.subject || s.course) === subName);
        const val = sub ? (sub.score !== undefined && sub.score !== null ? sub.score : sub.finalScore) : null;
        if (val !== null && val !== undefined && val !== "X" && !isNaN(val)) {
          sum += Number(val);
          count++;
        }
      });
      return count > 0 ? (sum / count).toFixed(1) : 0;
    });

    const backgroundColors = subjectAverages.map(avg => {
      const val = parseFloat(avg);
      if (val >= 75) return 'rgba(34, 197, 94, 0.6)'; // Green for >75 (EE)
      if (val < 40) return 'rgba(239, 68, 68, 0.6)';  // Red for <40 (BE)
      return 'rgba(59, 130, 246, 0.6)';              // Standard Blue (ME/AE)
    });

    const borderColors = subjectAverages.map(avg => {
      const val = parseFloat(avg);
      if (val >= 75) return '#16a34a';
      if (val < 40) return '#dc2626';
      return '#2563eb';
    });

    window.indivSubjectChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: subjects,
        datasets: [{
          label: 'Avg Score %',
          data: subjectAverages,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal bars are better for subject names
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const score = context.raw;
                const grade = (history && history.length > 0) ? history[history.length - 1].grade : null;
                const perfLevel = window.cbcUtils.getSubdivision(score, grade);
                return ` Avg: ${score}% (${perfLevel})`;
              }
            }
          }
        },
        scales: { x: { beginAtZero: true, max: 100 } }
      }
    });
  }

  function renderSubjectMeansTable(stats) {
    if (!subjectAnalysisPane) return; // 🆕 Ensure pane exists
    if (!stats.subjects || !stats.subjects.length) { subjectAnalysisPane.innerHTML = "<div class='small'>No subject means found.</div>"; return; }

    // Convert to object list and sort by performance (Mean Score)
    const subjectList = stats.subjects.map(s => ({
      name: s,
      mean: stats.subjectMeans[s] || 0,
      count: stats.subjectCounts ? (stats.subjectCounts[s] || 0) : 0
    })).sort((a, b) => b.mean - a.mean);

    // Calculate ranks with tie consideration
    let prevMean = null, prevRank = 0;
    subjectList.forEach((s, idx) => {
      const currentMean = parseFloat(s.mean.toFixed(2));
      if (currentMean === prevMean) s.rank = prevRank;
      else { s.rank = idx + 1; prevRank = s.rank; }
      prevMean = currentMean;
    });

    const prevMeans = stats.prevSubjectMeans || {};

    let html = `<h3>📊 Subject Performance Analysis</h3>`;
    html += `<table class="marks-table" id="subjectAnalysisTable">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Subject</th>
          <th>Mean Score</th>
          <th>Progress</th>
          <th>Entries</th>
        </tr>
      </thead>
      <tbody>`;

    subjectList.forEach(s => {
      let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
      const pMean = prevMeans[s.name];
      if (pMean !== undefined && pMean > 0) {
        const diff = s.mean - pMean;
        if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;">+${diff.toFixed(1)}</span>`;
        else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;">${diff.toFixed(1)}</span>`;
        else progressHtml = `<span style="color:#3498db; font-size:0.8rem;">-</span>`;
      }

      html += `
        <tr>
          <td>${s.rank}</td>
          <td style="text-align:left;">${s.name}</td>
          <td>${s.mean.toFixed(2)}%</td>
          <td>${progressHtml}</td>
          <td>${s.count}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    subjectTableWrap.innerHTML = html;
  }

  // ===== LOAD LEARNERS FOR EDITING =====
  async function loadLearnersForEditing() {
    const btn = document.querySelector("#editContainer").previousElementSibling?.querySelector("button[class*='primary-btn']") || generateBtn.nextElementSibling;
    
    if (assessmentFilter && assessmentFilter.value === "") {
      window.showToast("Please select an assessment before loading learners for editing.", "error");
      return;
    }
    
    window.spinner?.show(btn, "Loading...");
    
    try {
      // Hide analysis view, show edit view
      if (analysisTabsContainer) analysisTabsContainer.style.display = 'none';
      
      editContainer.style.display = 'block';

      const gradeNum = parseInt(gradeFilter?.value) || 0;
      const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
      
      // State
      let currentPage = 1;
      let currentSearch = "";
      let debounceTimer = null;

      // 3. Static Container Structure
      editContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3>📝 Edit Submitted Marks</h3>
          <div style="display:flex; gap:10px;">
            <input type="text" id="editorSearchInput" placeholder="Search Name or Adm..." style="padding:5px; border:1px solid #ccc; width:200px;">
            <button id="closeEditorBtn" style="padding:5px 10px;">Close Editor</button>
          </div>
        </div>
        <div id="editorTableContainer"></div>
        <div id="editorPagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding:10px; background:#f9f9f9; border:1px solid #ccc;"></div>
      `;

      // Add Search Filter Listener
      document.getElementById("editorSearchInput")?.addEventListener("input", function(e) {
        clearTimeout(debounceTimer);
        const val = e.target.value.trim();
        debounceTimer = setTimeout(() => {
        currentSearch = val;
        currentPage = 1;
        fetchAndRenderPage(1);
        }, 600);
      });

      // Fix Close Button CSP Issue & Restore View
      document.getElementById("closeEditorBtn")?.addEventListener("click", () => {
        document.getElementById('editContainer').style.display = 'none';
        document.getElementById('editContainer').innerHTML = ""; // Clear content to free memory
        // 🆕 Show the tab content area again
        if (analysisTabsContainer) analysisTabsContainer.style.display = 'block';
      });

      // 4. Fetch & Render Table Function
      async function fetchAndRenderPage(page) {
        document.getElementById("editorTableContainer").innerHTML = '<div style="text-align:center;padding:20px;">Loading data...</div>';
        document.getElementById("editorPagination").innerHTML = "";

        try {
          const result = await getFilteredMarks(page, 10, currentSearch);
          const students = result.data || [];
          const totalPages = result.totalPages || 1;
          const totalRecords = result.total || 0;
          currentPage = result.currentPage || page;

          // Flatten for display
          let pageRows = [];
          students.forEach(student => {
            student.subjects.forEach(sub => {
              if (sub._id) {
                pageRows.push({ student, sub });
              }
            });
          });

        let html = `<table id="editorTable" class="table" style="width:100%; border-collapse:collapse; border:1px solid #ccc;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:8px; border:1px solid #ccc;">Adm</th>
              <th style="padding:8px; border:1px solid #ccc;">Name</th>
              <th style="padding:8px; border:1px solid #ccc;">${isSeniorSchool ? 'Course' : 'Subject'}</th>
              ${isSeniorSchool 
                ? '<th style="padding:8px; border:1px solid #ccc;">CA (30%)</th><th style="padding:8px; border:1px solid #ccc;">PW (20%)</th><th style="padding:8px; border:1px solid #ccc;">Exam (50%)</th>' 
                : '<th style="padding:8px; border:1px solid #ccc;">Score %</th>'}
              <th style="padding:8px; border:1px solid #ccc;">Action</th>
            </tr>
          </thead>
          <tbody>`;

        if (pageRows.length === 0) {
          html += `<tr><td colspan="5" style="text-align:center; padding:20px;">No records found</td></tr>`;
        } else {
          pageRows.forEach(({ student, sub }) => {
            const rowId = sub._id;
            html += `<tr data-id="${rowId}">
              <td style="padding:8px; border:1px solid #ccc;">${student.admissionNo}</td>
              <td style="padding:8px; border:1px solid #ccc;">${student.studentName}</td>
              <td style="padding:8px; border:1px solid #ccc;">${isSeniorSchool ? (sub.course || '-') : (sub.subject || '-')}</td>
              
              ${isSeniorSchool ? `
                <td style="padding:8px; border:1px solid #ccc;"><input type="text" class="ca-in" inputmode="text" value="${sub.continuousAssessment ?? ''}" style="width:50px;"></td>
                <td style="padding:8px; border:1px solid #ccc;"><input type="text" class="pw-in" inputmode="text" value="${sub.projectWork ?? ''}" style="width:50px;"></td>
                <td style="padding:8px; border:1px solid #ccc;"><input type="text" class="et-in" inputmode="text" value="${sub.endTermExam ?? ''}" style="width:50px;"></td>
              ` : `
                <td style="padding:8px; border:1px solid #ccc;"><input type="text" class="sc-in" inputmode="text" value="${sub.score}" style="width:60px;"></td>
              `}
              
              <td style="padding:8px; border:1px solid #ccc;">
                <button class="save-row-btn" style="background:#4CAF50; color:white; border:none; padding:4px 8px; cursor:pointer;">Save</button>
              </td>
            </tr>`;
          });
        }
        html += `</tbody></table>`;
        document.getElementById("editorTableContainer").innerHTML = html;

        // Update Pagination Controls
        const paginationHtml = `
           <div>Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong> (Total Learners: ${totalRecords})</div>
           <div style="display:flex; gap:5px;">
             <button id="prevPageBtn" ${currentPage === 1 ? 'disabled' : ''} style="padding:5px 10px; cursor:pointer;">Previous</button>
             <button id="nextPageBtn" ${currentPage === totalPages ? 'disabled' : ''} style="padding:5px 10px; cursor:pointer;">Next</button>
           </div>
        `;
        document.getElementById("editorPagination").innerHTML = paginationHtml;

        // Re-attach listeners
        document.getElementById("prevPageBtn").onclick = () => { if(currentPage > 1) { fetchAndRenderPage(currentPage - 1); } };
        document.getElementById("nextPageBtn").onclick = () => { if(currentPage < totalPages) { fetchAndRenderPage(currentPage + 1); } };
        
        attachSaveListeners(students);

        // 🆕 Add input filtering for marks fields
        document.getElementById("editorTableContainer").addEventListener("input", (e) => {
          const inputElement = e.target;
          if (inputElement.classList.contains("ca-in") ||
              inputElement.classList.contains("pw-in") ||
              inputElement.classList.contains("et-in") ||
              inputElement.classList.contains("sc-in")) {

            let inputValue = inputElement.value;

            // 1. Filter characters: allow only digits and 'X'/'x'
            inputValue = inputValue.replace(/[^0-9Xx]/g, '');

            // 2. Handle 'X'/'x': if present, it should be the only character and uppercase
            if (inputValue.toUpperCase().includes('X')) {
                inputValue = 'X';
            } else if (inputValue !== '') {
                // 3. Handle numeric input: ensure it's within 0-100
                let num = parseInt(inputValue, 10);
                if (isNaN(num)) {
                    inputValue = ''; // Clear if not a valid number
                } else if (num < 0) {
                    inputValue = '0';
                } else if (num > 100) {
                    inputValue = ''; // Clear if exceeding 100
                    cbcUtils.showToast("Marks cannot exceed 100. Input cleared.", "warning");
                }
            }
            inputElement.value = inputValue.toUpperCase(); // Ensure 'x' becomes 'X'
          }
        });

        } catch(e) {
          console.error("Page load error:", e);
          document.getElementById("editorTableContainer").innerHTML = '<div style="text-align:center;color:red;padding:20px;">Error loading data</div>';
        }
      }

      function attachSaveListeners(currentStudentsPageData) {
        document.getElementById("editorTable").querySelectorAll('.save-row-btn').forEach(b => {
        b.addEventListener('click', async (e) => {
          const row = e.target.closest('tr');
          const id = row.dataset.id;
          const btn = e.target;
          
          let payload = {};
          const isX = (v) => v !== null && v !== undefined && String(v).trim().toUpperCase() === "X";
          const validateRange = (v) => {
            if (isX(v)) return true;
            const n = parseFloat(v);
            return !isNaN(n) && n >= 0 && n <= 100;
          };
          
          if (isSeniorSchool) {
            payload.continuousAssessment = row.querySelector('.ca-in').value;
            payload.projectWork = row.querySelector('.pw-in').value;
            payload.endTermExam = row.querySelector('.et-in').value;
            // Basic validation
            if((payload.continuousAssessment && !validateRange(payload.continuousAssessment)) ||
               (payload.projectWork && !validateRange(payload.projectWork)) ||
               (payload.endTermExam && !validateRange(payload.endTermExam))) {
                 alert("Marks must be between 0 and 100, or 'X' for Absent."); return;
            }
          } else {
            const score = row.querySelector('.sc-in').value;
            if (!score || !validateRange(score)) { alert("Invalid score. Enter 0-100 or 'X'."); return; }
            payload.score = score;
          }

          // Find original context from filtered data to ensure all required fields are sent
          // (MarkController overwrites fields like grade/term/year, so we must provide them)
          // Look up in the current page data
          const studentData = currentStudentsPageData.find(s => s.subjects.some(sub => sub._id === id));
          if (studentData) {
            payload.grade = studentData.grade;
            payload.stream = studentData.stream;
            payload.term = studentData.term;
            payload.year = studentData.year;
            payload.assessment = studentData.assessment;
            
            const subjectData = studentData.subjects.find(sub => sub._id === id);
            if (subjectData) {
               if (isSeniorSchool) {
                   payload.pathway = subjectData.pathway;
                   payload.course = subjectData.course;
               } else {
                   payload.subject = subjectData.subject;
               }
            }
          } else {
             payload.term = termFilter.value !== 'all' ? termFilter.value : undefined;
             payload.year = yearFilter.value ? yearFilter.value : undefined;
          }
          
          btn.textContent = "Saving...";
          btn.disabled = true;
          
          try {
            const token = window.authService?.getToken();
            const res = await fetch(`${API_BASE}/marks/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify(payload)
            });
            
            if(res.ok) { btn.textContent = "Saved"; setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1500); }
            else { throw new Error("Update failed"); }
          } catch(err) {
            console.error(err);
            btn.textContent = "Error";
            alert("Failed to save mark.");
            btn.disabled = false;
          }
        });
      });
      }

      // Initial load
      await fetchAndRenderPage(1);

    } catch(err) {
      console.error(err);
      alert("Error loading learners for editing.");
    } finally {
      window.spinner?.hide(btn);
    }
  }

  // ===== GENERATE REPORT =====
  async function generateReport() {
    if (assessmentFilter && assessmentFilter.value === "") {
      alert("Please select an assessment first.");
      return;
    }

    console.log("[Analysis] Generate Report clicked");
    window.spinner?.show(generateBtn, "Generating...");


    try {
      const [allTermRaw, rosterResponse] = await Promise.all([
        getFilteredMarks(null, null, "", null, "all"),
        fetch(`${API_BASE}/enrollments/class/${currentUser.classGrade}?limit=1000`, { headers: { Authorization: `Bearer ${window.authService?.getToken()}` } }).then(r => r.json())
      ]);
      
      const assessVal = assessmentFilter?.value || "all";
      const termVal = termFilter?.value || "all";
      
      const filtered = assessVal === "all" ? allTermRaw : allTermRaw.filter(m => String(m.assessment) === assessVal);

      let prevTermRaw = null;
      if (termVal !== "all" && parseInt(termVal) > 1) {
          prevTermRaw = await getFilteredMarks(null, null, "", null, "all", (parseInt(termVal) - 1).toString());
      }

      const roster = rosterResponse.students || (Array.isArray(rosterResponse) ? rosterResponse : []);
      const streamMode = streamFilterSelect?.value;

      if (filtered.length === 0) {
        console.warn("[Analysis] No marks found for the selected filters");
        rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>";
        currentFilteredData = [];
        subjectTableWrap.innerHTML = "<div class='small'>No subject means found.</div>";
        classMeanEl.textContent = "-";
        recordsCountEl.textContent = "0";
        renderTrendChartWithData([]); // Pass empty array to hide and destroy
      } else {
        const gradeNum = parseInt(gradeFilter?.value) || 0;
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
        
        currentFilteredData = allTermRaw;
        currentIsSeniorSchool = isSeniorSchool;

        if (!isSeniorSchool) {
          const stats = calculateStats(filtered, roster, streamMode, allTermRaw, prevTermRaw);
          renderRankingTable(stats);
          renderSubjectMeansTable(stats);
          classMeanEl.textContent = stats.classMean.toFixed(2);
          updateProficiencyDistribution(stats.studentArray, currentUser.classGrade);

          const passCount = stats.studentArray.filter(s => s.mean >= 50).length;
          const passRate = stats.studentArray.length > 0 ? (passCount / stats.studentArray.length) * 100 : 0;
          if (passRateEl) passRateEl.textContent = passRate.toFixed(1) + "%";

          recordsCountEl.textContent = stats.records;
          renderTrendChartWithData(filtered, false);
          renderMissingExamsTable(stats.missingExamsList, stats.streamDiscrepancies);
          
          // 🆕 Initialize At-Risk Monitor
          if (window.AtRiskMonitor) {
            const insights = window.AtRiskMonitor.analyze(stats.studentArray, stats.subjects, currentUser.classGrade);
            window.AtRiskMonitor.render('atRiskPane', insights);
            const badge = document.getElementById('atRiskBadge');
            if (badge) { badge.textContent = insights.critical.length; badge.style.display = insights.critical.length > 0 ? 'inline-block' : 'none'; }
          }

        } else {
          const stats = calculateSeniorSchoolStats(filtered, roster, streamMode, allTermRaw, prevTermRaw);
          renderSeniorSchoolAnalysis(stats);
          renderSubjectMeansTable(stats);
          classMeanEl.textContent = stats.classMean.toFixed(2);
          
          const passCount = stats.studentArray.filter(s => s.mean >= 50).length;
          const passRate = stats.studentArray.length > 0 ? (passCount / stats.studentArray.length) * 100 : 0;
          if (passRateEl) passRateEl.textContent = passRate.toFixed(1) + "%";

          recordsCountEl.textContent = stats.records;
          renderTrendChartWithData(filtered, true);
          renderMissingExamsTable(stats.missingExamsList, stats.streamDiscrepancies);
          
          // 🆕 Initialize At-Risk Monitor (Senior)
          if (window.AtRiskMonitor) {
            const insights = window.AtRiskMonitor.analyze(stats.studentArray, stats.subjects, currentUser.classGrade);
            window.AtRiskMonitor.render('atRiskPane', insights);
            const badge = document.getElementById('atRiskBadge');
            if (badge) { badge.textContent = insights.critical.length; badge.style.display = insights.critical.length > 0 ? 'inline-block' : 'none'; }
          }
        }
      }
    } catch (err) {
      console.error("[Analysis] Error in generateReport:", err);
      alert("Error generating report: " + err.message);
    } finally {
     window.spinner?.hide(generateBtn);
    }
  }

  // ===== RENDER SENIOR SCHOOL ANALYSIS =====
  function renderSeniorSchoolAnalysis(stats) {
    if (!stats.studentArray || !stats.studentArray.length) {
      rankingTableWrap.innerHTML = "<div class='small'>No ranking data found for Senior School.</div>";
      subjectTableWrap.innerHTML = ""; // Clear subject table
      return;
    }
  
    const { groupedByAssessment } = stats;
  
    let html = "";
    // Sort assessments
    const assessmentKeys = Object.keys(groupedByAssessment).sort((a, b) => Number(a) - Number(b));

    assessmentKeys.forEach(assessmentKey => {
      const group = groupedByAssessment[assessmentKey];
      if (!group.length) return;
      
      // Generate unique IDs for search input and clear button for each assessment block
      const searchInputId = `seniorRankingSearchInput_${assessmentKey}`;
      const clearBtnId = `clearSeniorRankingSearch_${assessmentKey}`;
      const tableResponsiveId = `tableResponsive_${assessmentKey}`;

      // Determine subjects present in this assessment group
      const currentSubjectsSet = new Set();
      group.forEach(s => {
        if (s.subjects) {
          Object.keys(s.subjects).forEach(sub => currentSubjectsSet.add(sub));
        }
      });
      const currentSubjects = Array.from(currentSubjectsSet).sort();

      let assessLabel;
      assessLabel = getAssessmentLabel(assessmentKey);

      // Header per assessment
      html += `<div style="text-align: right; margin-bottom: 15px;"><button id="exportSeniorRankingPdfBtn_${assessmentKey}" class="btn primary-btn">Export Ranking PDF</button></div>`;
      html += `<h3>📊 CLASS RANKING - ${assessLabel} (By Final Weighted Score)</h3>`;
      html += `
        <div class="ranking-search-toolbar" style="margin-bottom: 10px; position: relative; max-width: 400px;">
          <input type="text" id="${searchInputId}" placeholder="🔍 Search learner by name or Adm No..." class="form-control" style="width: 100%; padding: 10px; padding-right: 35px; border: 1px solid #cbd5e0; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <button id="${clearBtnId}" title="Clear search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 1.2rem; color: #94a3b8; cursor: pointer; display: none;">&times;</button>
        </div>`;
      html += `<div class="top-scroll-wrapper"><div class="top-scroll-content"></div></div>`;
      html += `<div class="table-responsive" id="${tableResponsiveId}">`;
      html += "<table>";
      
      // Render headers
      html += "<thead><tr class='table-header-alt'>";
      html += "<th>Rank</th>";
      html += "<th>Admission No</th>";
      html += "<th>Student Name</th>";
      currentSubjects.forEach(sub => {
        html += `<th>${sub}</th>`;
      });
      html += "<th>Progress</th>";
      html += "<th>Total Points</th>";
      html += "<th class='no-print'>Tracking</th>";
      html += "<th>Performance Level</th>";
      html += "</tr></thead>";
      
      // Render body
      html += "<tbody>";
      group.forEach(s => {
        const subLevel = window.cbcUtils.getSubdivision(s.mean, s.grade);
        const mainLevel = window.cbcUtils.getPerformanceLevel(s.mean, s.grade);
        const bg = s.rank % 2 === 0 ? "#f9f9f9" : "#fff";

        let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
        if (s.progress !== null) {
            const diff = s.progress;
            if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;">+${diff.toFixed(1)}</span>`;
            else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;">${diff.toFixed(1)}</span>`;
            else progressHtml = `<span style="color:#3498db; font-size:0.8rem;">-</span>`;
        }
        
        html += `<tr style='background:${bg};'>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.rank}</td>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.admissionNo}</td>`; // Removed inline styles, now handled by CSS
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.name}</td>`; // Removed inline styles, now handled by CSS
        
        currentSubjects.forEach(sub => {
          const score = s.subjects[sub];
          const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
          const display = isAbs ? '<span style="color:#ef4444; font-weight:700;">ABS</span>' : score.toFixed(1);
          html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'>${display}</td>`; // Center align scores
        });
        
        html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'>${progressHtml}</td>`; // Removed inline styles, now handled by CSS
        html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'><strong>${s.totalPoints}</strong></td>`; // Removed inline styles, now handled by CSS
        html += `<td class="no-print" style='border:1px solid #ddd;padding:8px;text-align:center;'><button class="btn secondary-btn view-journey-btn" data-adm="${s.admissionNo}" data-name="${s.name}"><i class="fas fa-chart-line"></i></button></td>`; // Icon-only button
        html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'>${subLevel}</td>`; // Center align level, removed full label
        html += "</tr>";
      });

      // Calculate Totals and Means for Senior Footer
      const groupTotalPoints = group.reduce((acc, s) => acc + s.totalPoints, 0);
      const groupMeanSum = group.reduce((acc, s) => acc + s.mean, 0);
      const groupCount = group.length || 1;
      
      html += `</tbody><tfoot style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #337ab7;">`;
      
      // TOTAL Row
      html += `<tr><td colspan="3" style="text-align: right;">TOTAL:</td>`;
      currentSubjects.forEach(sub => {
        const subSum = group.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        html += `<td style="text-align:center;">${subSum.toFixed(0)}</td>`;
      });
      html += `<td></td>`; // Progress spacer
      html += `<td style="text-align:center;">${groupTotalPoints}</td>`;
      html += `<td></td>`; // Tracking spacer
      html += `<td></td></tr>`; // Level spacer

      // MEAN Row
      html += `<tr><td colspan="3" style="text-align: right;">MEAN:</td>`;
      currentSubjects.forEach(sub => {
        const subSum = group.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        const subCount = group.filter(s => s.subjects[sub] !== undefined).length || 1;
        html += `<td style="text-align:center;">${(subSum / subCount).toFixed(1)}</td>`;
      });
      html += `<td></td>`; // Progress spacer
      html += `<td style="text-align:center;">${(groupTotalPoints / groupCount).toFixed(1)}</td>`;
      html += `<td></td>`; // Tracking spacer
      html += `<td style="border:1px solid #ddd;padding:8px;text-align:center; color: #1a237e;">${window.cbcUtils.getSubdivision(groupMeanSum / groupCount, group[0]?.grade)}</td>`; // Removed inline styles, now handled by CSS
      html += `</tr></tfoot></table></div>`;
    });

    classRankingPane.innerHTML = html; 
    syncDualScroll(classRankingPane);

    // Attach event listeners for each search bar and PDF button
    assessmentKeys.forEach(assessmentKey => {
      const searchInputId = `seniorRankingSearchInput_${assessmentKey}`;
      const clearBtnId = `clearSeniorRankingSearch_${assessmentKey}`;
      const tableResponsiveId = `tableResponsive_${assessmentKey}`;

      const sSearchInput = document.getElementById(searchInputId);
      const sClearBtn = document.getElementById(clearBtnId);
      const tableResponsiveDiv = document.getElementById(tableResponsiveId);

      if (sSearchInput && sClearBtn && tableResponsiveDiv) {
        const filterSeniorRanking = (val) => {
          const query = val.toLowerCase().trim();
          const rows = tableResponsiveDiv.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? "" : "none";
          });
          sClearBtn.style.display = query ? "block" : "none";
        };

        sSearchInput.addEventListener("input", (e) => filterSeniorRanking(e.target.value));
        sClearBtn.addEventListener("click", () => {
          sSearchInput.value = "";
          filterSeniorRanking("");
        });
      }
      document.getElementById(`exportSeniorRankingPdfBtn_${assessmentKey}`)?.addEventListener("click", exportPdf);
    });

    // Attach Journey Listeners for Senior
    classRankingPane.querySelectorAll('.view-journey-btn').forEach(btn => {
      btn.onclick = () => showLearnerJourney(btn.dataset.adm, btn.dataset.name);
    });
  }
 // subjectTableWrap is now populated by renderSubjectMeansTable
  function renderMissingExamsTable(missingList, streamDiscrepancies = []) {
    if (!missingExamsTableWrap) return; // 🆕 Ensure the static element exists
    

    if (missingList.length === 0 && streamDiscrepancies.length === 0) {
      missingExamsTableWrap.innerHTML = `
        <div style="text-align:center; padding:20px; color:#64748b; border: 1px dashed #cbd5e0; border-radius:8px;">
          <i class="fas fa-check-circle" style="color:#10b981;"></i> All individual learner exams accounted for.
        </div>`;
      return;
    }

    let html = `<h3>⚠️ Records Audit & Absences</h3>`;
    if (streamDiscrepancies.length > 0) {
      html += `<div style="background:#fff5f5; padding:10px; border:1px solid #feb2b2; border-radius:8px; margin-bottom:15px;">
        <h4 style="color:#c53030; margin-top:0;">🚨 Stream Missing Data</h4>
        <ul style="font-size:0.85rem;">
          ${streamDiscrepancies.map(d => `<li><strong>Stream ${d.stream}:</strong> Missing entire results for ${d.missingSubjects.join(", ")}</li>`).join("")}
        </ul>
      </div>`;
    }

    if (missingList.length > 0) {
      html += `<table class="table" style="width:100%; border-collapse: collapse; font-size:0.85rem;">
        <thead><tr style="background:#f1f5f9;"><th>Name</th><th>Adm</th><th>Assessment</th><th style="color:#e53e3e;">Missed Subject(s)</th></tr></thead>
        <tbody>`;

      missingList.forEach(m => {
        html += `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td>${m.adm}</td>
            <td>${m.assess}</td>
            <td>
              ${m.subjects.map(s => `<span style="display:inline-block; background:#fff5f5; color:#c53030; padding:2px 6px; border-radius:4px; margin:2px; font-size:0.7rem; font-weight:600;">${s}</span>`).join("")}
            </td>
          </tr>`;
      });
      html += `</tbody></table>`;
    }

    missingExamsTableWrap.innerHTML = html;
  }

   // ===== EXPORT JOURNEY PDF =====
  async function exportJourneyPdf() {
    const btn = document.getElementById("printJourneyBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    btn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "pt", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const learnerName = document.getElementById("journeyLearnerName").textContent;
      
      // Header Section
      doc.setFontSize(18);
      doc.setTextColor(30, 58, 138); 
      doc.text("LEARNER ACADEMIC JOURNEY", pageWidth / 2, 50, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(learnerName, pageWidth / 2, 70, { align: "center" });
      
      // Capture Charts Area (Trend + Subject Breakdown)
      const chartsArea = document.getElementById("journeyChartsArea");
      const canvas = await html2canvas(chartsArea, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth - 80;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      doc.addImage(imgData, 'PNG', 40, 90, imgWidth, imgHeight);
      
      // Capture Journey Table
      const table = document.querySelector("#journeyTableArea table");
      if (table) {
        doc.autoTable({
          html: table,
          startY: 110 + imgHeight,
          theme: 'grid',
          headStyles: { fillColor: [30, 58, 138], textColor: 255 },
          styles: { fontSize: 8, cellPadding: 5 },
          margin: { left: 40, right: 40 }
        });
      }
      
      // Add footer to every page
      const totalPages = doc.internal.getNumberOfPages();
      const printedDate = new Date().toLocaleString();
      const footerText = "CompetenceHub Analytics";
      const footerTextWidth = doc.getTextWidth(footerText);
      const pageHeightForFooter = doc.internal.pageSize.getHeight();

      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150); // Subtle gray color for footer text
        doc.text(`Printed: ${printedDate}`, 40, pageHeightForFooter - 20);
        doc.text(footerText, (pageWidth / 2) - (footerTextWidth / 2), pageHeightForFooter - 20);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 40, pageHeightForFooter - 20, { align: "right" });
      }

      doc.save(`Journey_${learnerName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (err) {
      console.error("PDF Export failed", err);
      alert("Failed to generate PDF report.");
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
  
// ===== EXPORT PDF =====
async function exportPdf() {
  try {
    const filtered = await getFilteredMarks();
    if (!filtered.length) return alert("No data to export.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "pt", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const gradeNum = parseInt(gradeFilter?.value) || 0;
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
    const stats = isSeniorSchool ? calculateSeniorSchoolStats(filtered) : calculateStats(filtered);
    const subjects = (stats.subjects || []).filter(s => s && s !== 'null');
    const assessmentLabel = getAssessmentLabel(assessmentFilter.value);

    // 1. HEADER
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("CLASS ANALYSIS REPORT", pageWidth / 2, 45, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const subheader = `Grade: ${currentUser.classGrade || "-"} | Term: ${termFilter.value || "-"} | Year: ${yearFilter.value || "-"} | Assessment: ${assessmentLabel}`;
    doc.text(subheader, pageWidth / 2, 65, { align: "center" });

    let yPos = 90;

    // 2. RANKING TABLES (Grouped by assessment)
    const grouped = stats.groupedByAssessment || {};
    const assessmentKeys = Object.keys(grouped).sort();

    for (const key of assessmentKeys) {
      const arr = grouped[key];
      if (!arr.length) continue;

      // Determine subjects for this group
      const currentSubjectsSet = new Set();
      arr.forEach(s => {
        if (s.subjects) Object.keys(s.subjects).forEach(sub => { if(sub && sub !== 'null') currentSubjectsSet.add(sub); });
      });
      const currentSubjects = Array.from(currentSubjectsSet).sort();

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Assessment: ${getAssessmentLabel(key)}`, 40, yPos);
      yPos += 10;

      let head, body, foot;
    if (isSeniorSchool) {
        head = [["Rank", "Adm No", "Name", ...currentSubjects, "Progress", "Points", "Level"]];
        body = arr.map(s => [
          s.rank ?? "-",
          s.admissionNo,
          s.name,
          ...currentSubjects.map(sub => {
            const score = s.subjects[sub];
            const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
            return isAbs ? "ABS" : score.toFixed(1);
          }),
          s.progress !== null ? (s.progress > 0 ? "+" : "") + s.progress.toFixed(1) : "N/A",
          s.totalPoints ?? "-",
          window.cbcUtils.getSubdivision(s.mean, s.grade)
        ]);
        
        const totalRow = ["", "", "TOTAL:"];
        const meanRow = ["", "", "MEAN:"];
        currentSubjects.forEach(sub => {
          const sSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
          const sCnt = arr.filter(s => s.subjects[sub] !== undefined).length || 1;
          totalRow.push(sSum.toFixed(0));
          meanRow.push((sSum / sCnt).toFixed(1));
        });
        const gPoints = arr.reduce((acc, s) => acc + (s.totalPoints || 0), 0);
        const gMean = arr.reduce((acc, s) => acc + (s.mean || 0), 0) / (arr.length || 1);
        totalRow.push("", gPoints.toFixed(0), "");
        meanRow.push("", (gPoints / (arr.length || 1)).toFixed(1), window.cbcUtils.getSubdivision(gMean, arr[0]?.grade));
        foot = [totalRow, meanRow];
    } else {
        head = [["Rank", "Student", ...subjects, "Total Marks", "Progress", "Total Points", "Performance Level"]];
        body = arr.map(s => [
          s.rank ?? "-",
          s.name || "Unnamed",
          ...subjects.map(sub => {
            const score = s.subjects[sub];
            const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
            return isAbs ? "ABS" : score;
          }),
          s.total ?? 0,
          s.progress !== null ? (s.progress > 0 ? "+" : "") + s.progress.toFixed(1) : "N/A",
          s.totalPoints ?? 0,
          window.cbcUtils.getSubdivision(s.mean, s.grade)
        ]);

        const fTotalMarks = arr.reduce((acc, s) => acc + s.total, 0);
        const fTotalPoints = arr.reduce((acc, s) => acc + s.totalPoints, 0);
        const fMeanSum = arr.reduce((acc, s) => acc + s.mean, 0);
        const fCount = arr.length || 1;

        const totalRow = ["", "TOTAL:"];
        const meanRow = ["", "MEAN:"];
        subjects.forEach(sub => {
          const sSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
          const sCnt = arr.filter(s => s.subjects[sub] !== undefined).length || 1;
          totalRow.push(sSum.toFixed(0));
          meanRow.push((sSum / sCnt).toFixed(1));
        });
        totalRow.push(fTotalMarks.toFixed(0), "", fTotalPoints, "");
        meanRow.push((fTotalMarks / fCount).toFixed(1), "", (fTotalPoints / fCount).toFixed(1), window.cbcUtils.getSubdivision(fMeanSum / fCount, arr[0]?.grade));
        foot = [totalRow, meanRow];
      }

      doc.autoTable({
        startY: yPos,
        head,
        body,
        foot,
        theme: 'grid',
        styles: { fontSize: 8, lineWidth: 0.1, lineColor: [0, 0, 0] },
        headStyles: { fillColor: isSeniorSchool ? [51, 122, 183] : [76, 175, 80] },
        footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' },
        showHead: 'everyPage',
        showFoot: 'lastPage', // Keep totals/mean only on the last page of the ranking list
        margin: { left: 40, right: 40 }
      });
      yPos = doc.lastAutoTable.finalY + 30;
    }

    // 3. SUBJECT MEANS
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("SUBJECT MEANS SUMMARY", 40, yPos);

    // Create a sorted subject list for PDF, mirroring renderSubjectMeansTable
    const subjectList = (stats.subjects || []).map(s => ({
      name: s,
      mean: stats.subjectMeans[s] || 0,
      count: stats.subjectCounts ? (stats.subjectCounts[s] || 0) : 0
    })).sort((a, b) => b.mean - a.mean);

    doc.autoTable({
       startY: yPos + 10,
       head: [["Subject", "Mean Score", "Entries"]],
       body: subjectList.map(s => [s.name, s.mean.toFixed(2), s.count]),
       theme: 'grid',
       styles: { fontSize: 9, lineWidth: 0.1, lineColor: [0, 0, 0] },
       headStyles: { fillColor: [33, 150, 243] },
       tableWidth: 200,
       margin: { left: 40 }, // Ensure consistent left margin
       showHead: 'everyPage'
    });

    // 4. DOCUMENT FOOTER (Last Page Only)
    const totalPages = doc.internal.getNumberOfPages();
    const genText = "CompetenceHub Analytics";
    const genTextWidth = doc.getTextWidth(genText);

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(100);
      
      // Page numbers on every page
      doc.text(genText, (pageWidth / 2) - (genTextWidth / 2), pageHeight - 20, { align: "center" });
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 40, pageHeight - 20, { align: "right" });

      // Teacher info only on the last page
      if (i === totalPages) {
        const teacherName = currentUser?.name || "Teacher";
        const dateGenerated = new Date().toLocaleString();
        doc.text(`${teacherName} | Date: ${dateGenerated}`, 40, pageHeight - 20);
      }
    }

    doc.save(`Class_Report_Grade_${currentUser.classGrade || "-"}.pdf`);

  } catch (err) {
    console.error("PDF export error:", err);
    alert("Failed to generate PDF");
  }
}

  // ===== TREND CHART =====
  function renderTrendChartWithData(filtered, isSeniorSchool = false) {
    const chartCanvas = document.getElementById("classTrendChart"); // This is inside trendChartPane

    if (typeof Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => renderTrendChartWithData(filtered, isSeniorSchool);
      document.head.appendChild(script);
      return;
    }

    // If no data or canvas, hide container and destroy old chart
    if (!chartCanvas || !filtered || filtered.length === 0) {
      if (window.trendChart) window.trendChart.destroy();
      return;
    }
    
    const ctx = chartCanvas.getContext("2d");
    if (!ctx) return;

    const isAllTerms = termFilter?.value === "all";

    // 🆕 Group by Term + Assessment to prevent data collisions and ensure chronological sorting
    const assessmentData = {};
    filtered.forEach(s => {
      const key = `${s.term}_${String(s.assessment).padStart(2, '0')}`;
      if (!assessmentData[key]) assessmentData[key] = { term: s.term, assessment: s.assessment, students: [] };
      assessmentData[key].students.push(s);
    });

    const sortedKeys = Object.keys(assessmentData).sort();

    const classMeans = sortedKeys.map(key => {
      const group = assessmentData[key];

      // 🆕 Apply Clean Student Baseline: Only include students with NO absences in this specific assessment point
      const cleanStudents = group.students.filter(stu => {
        const subjects = stu.subjects || [];
        if (subjects.length === 0) return false;
        
        return subjects.every(sub => {
          if (isSeniorSchool) {
            const fs = window.cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam);
            return fs !== null && fs !== "X";
          }
          const val = sub.score;
          return val !== null && val !== undefined && !isNaN(val);
        });
      });

      const studentAverages = cleanStudents.map(stu => {
        const scores = stu.subjects.map(sub => {
          return isSeniorSchool 
            ? window.cbcUtils.calculateFinalScore(sub.continuousAssessment, sub.projectWork, sub.endTermExam)
            : sub.score;
        }).filter(v => v !== null && v !== "X" && !isNaN(v)).map(Number);
        
        return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      });

      return studentAverages.length ? (studentAverages.reduce((sum, avg) => sum + avg, 0) / studentAverages.length) : 0;
    });

    const labels = sortedKeys.map(key => {
      const group = assessmentData[key];
      const label = getAssessmentLabel(group.assessment);
      return isAllTerms ? `T${group.term} ${label}` : label;
    });

    if (window.trendChart) window.trendChart.destroy();
    window.trendChart = new Chart(ctx, {
      type: "line",
      data: { 
        labels, 
        datasets: [{ 
          label: "Class Mean (%)", 
          data: classMeans, 
          borderColor: "#2563eb", 
          backgroundColor: "rgba(37, 99, 235, 0.1)", 
          fill: true, 
          tension: 0.3, 
          pointRadius: 5 
        }] 
      },
      options: { 
        responsive: true, 
        plugins: { legend: { position: 'bottom' } }, 
        scales: { 
          y: { 
            beginAtZero: true, 
            suggestedMax: 100,
            title: { display: true, text: "Class Mean (%)" } 
          }, 
          x: { 
            title: { display: true, text: isAllTerms ? "Academic Timeline" : "Assessments" } 
          } 
        } 
      }
    });
  }

  // Global resize listener for synced tables
  window.addEventListener('resize', () => {
    document.querySelectorAll('.table-responsive').forEach(el => {
      if (el._syncUpdate) el._syncUpdate();
    });
  });

  // 🆕 Load Module Script
  const script = document.createElement('script');
  script.src = 'js/classteacher/at-risk-monitor.js';
  document.head.appendChild(script);

  window.authService?.initLogout(); // Re-add logout init here as it was removed with exportPdfBtn
});
