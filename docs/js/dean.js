import { formatDate } from './Utility/date-utils.js';

const API_BASE = config.api.baseURL;
const filterGradeEl = document.getElementById("filterGrade");
const pageTitle = document.getElementById('pageTitle');
const filterTermEl = document.getElementById("filterTerm");
const filterAssessmentEl = document.getElementById("filterAssessment");
const filterYearEl = document.getElementById("filterYear");
const filterStreamEl = document.getElementById("filterStream");
const filterPathwayEl = document.getElementById("filterPathway");
const schoolRankingsTableWrap = document.getElementById("schoolRankingsTableWrap");
const generateSchoolRankingsBtn = document.getElementById("generateSchoolRankingsBtn");
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
const rankingExtras = document.getElementById("rankingExtras");
const missingExamsTableWrap = document.getElementById("missingExamsTableWrap"); // 🆕 Container for missing exams table

const configureGradingBtn = document.getElementById("configureGradingBtn"); // 🆕 Grading config button
const broadcastSmsBtn = document.getElementById("broadcastSmsBtn");
const deanSmsBalanceEl = document.getElementById("deanSmsBalance");
const smsBroadcastUI = document.getElementById("smsBroadcastUI");
const smsPlaceholder = document.getElementById("smsPlaceholder");
const smsTargetText = document.getElementById("smsTargetText");
const smsBroadcastProgressWrap = document.getElementById("smsBroadcastProgressWrap");
const smsBroadcastProgressBar = document.getElementById("smsBroadcastProgressBar");
const smsBroadcastProgressText = document.getElementById("smsBroadcastProgressText");
const cancelSmsBroadcastBtn = document.getElementById("cancelSmsBroadcastBtn");

let deanProfileData = null;
let smsBroadcastAbortController = null; // 🆕 Track broadcast session for cancellation
let currentAnalysisRawData = null;
let currentPrevRawData = null;
let currentIsSenior = false;
let currentRoster = []; // 🆕 Store roster globally for re-analysis
let lastProcessedStudents = []; // 🆕 For reports tab
let lastCompleteGradeStudents = []; // Complete grade records used for overall subject ranks
let lastProcessedSubjects = []; // 🆕 For reports tab
let currentElectiveAssignments = []; // 🆕 Cache elective assignments for debug and re-analysis
const lazyWidgetCache = {
  missingExams: null,
  rankings: null,
};

function renderLazySchoolRankingsWidget() {
  const term = filterTermEl?.value;
  const assessment = filterAssessmentEl?.value;
  const year = filterYearEl?.value;
  const cacheKey = `${term}|${year}|${assessment}`;

  if (!schoolRankingsTableWrap) return;

  if (lazyWidgetCache.rankings && lazyWidgetCache.rankings.key === cacheKey && Array.isArray(lazyWidgetCache.rankings.data)) {
    if (lazyWidgetCache.rankings.data.length === 0) {
      schoolRankingsTableWrap.innerHTML = '<div class="empty-state">No rankings available for this period.</div>';
    } else {
      renderSchoolWideRankingsTable(lazyWidgetCache.rankings.data);
    }
    return;
  }

  if (term === "all" || assessment === "all") {
    schoolRankingsTableWrap.innerHTML = `
      <div class="instruction-state" style="text-align:center; padding:40px; margin-top: 20px; background:#f8fafc; border-radius:12px; border: 1px dashed #cbd5e0; color:#64748b;">
        <h3 style="margin-top:0; color:#1e293b;">School-Wide Performance Rankings</h3>
        <p style="font-size:1rem; margin-bottom:15px;">View and download top performers across all grades for the selected academic period.</p>
        <p style="font-size:0.9rem; font-weight:600; color:#475569;">Select a specific Term and Assessment, then open the <strong>SCHOOL RANKINGS</strong> tab to view the report.</p>
      </div>`;
    return;
  }

  schoolRankingsTableWrap.innerHTML = '<div style="text-align:center; padding:40px;"><span class="spinner"></span> Loading school-wide performance...</div>';
  generateSchoolWideReport();
}

// Helper function to set text content of an element
const setText = (el, value) => {
  if (el) el.textContent = value;
};
let currentValidKeys = new Set();

function updateReportsActionState() {
  const button = document.getElementById("generateBulkReportsBtn");
  const statusText = document.getElementById("reportsStatusText");
  const count = lastProcessedStudents?.length || 0;
  const selectedStream = filterStreamEl?.value || "all";
  const grade = filterGradeEl?.value || "";

  if (button) {
    const label = count > 0 ? `Generate Reports (${count} learners)` : "Generate Reports";
    button.innerHTML = `<i class="fas fa-file-pdf"></i><span>${label}</span>`;
    button.disabled = count === 0;
    button.style.opacity = count === 0 ? "0.7" : "1";
  }

  if (statusText) {
    if (!grade) {
      statusText.textContent = "Select a grade to preview the learner count.";
    } else if (count > 0) {
      const streamLabel = selectedStream && selectedStream !== "all" ? ` • Stream: ${selectedStream}` : "";
      statusText.textContent = `Ready to generate reports for ${count} learners in ${grade}${streamLabel}.`;
    } else {
      const streamLabel = selectedStream && selectedStream !== "all" ? ` in ${selectedStream}` : "";
      statusText.textContent = `No learners found for ${grade}${streamLabel}.`;
    }
  }
}

// 🆕 Debug helper: call from browser console to inspect a student's eligibility and visible subjects
window.deanDebugCheckStudent = function(admissionNo) {
  try {
    const adm = String(admissionNo || '').trim();
    if (!adm) return console.warn('Provide an admission number');
    let roster = currentRoster || [];
    let electiveAssignments = currentElectiveAssignments || [];
    let subjectsList = lastProcessedSubjects || [];

    // If roster or assignments are empty, try reading cached analytics for current filters
    if ((!roster || roster.length === 0) || (!electiveAssignments || electiveAssignments.length === 0)) {
      try {
        const grade = filterGradeEl?.value || '';
        const term = filterTermEl?.value || '';
        const year = filterYearEl?.value || '';
        const assessment = filterAssessmentEl?.value || '';
        const cacheKey = `${grade}_${term}_${year}_${assessment}`;
        const cached = getAnalyticsCache(cacheKey);
        if (cached) {
          roster = roster && roster.length ? roster : (cached.roster || roster);
          electiveAssignments = electiveAssignments && electiveAssignments.length ? electiveAssignments : (cached.electiveAssignments || []);
        }
      } catch (e) {
        console.warn('Failed to read analytics cache', e);
      }
    }
    const subjectEligibilityMap = buildSeniorSubjectEligibilityMap(roster, electiveAssignments);
    const eligibility = subjectEligibilityMap.get(adm) || subjectEligibilityMap.get(String(adm)) || null;

    const subjects = (subjectsList && subjectsList.length) ? subjectsList : (lastProcessedSubjects && lastProcessedSubjects.length ? lastProcessedSubjects : []);
    const results = subjects.map(sub => ({
      subject: sub,
      eligible: isSubjectEligibleForStudent(adm, sub, true, subjectEligibilityMap)
    }));

    console.group(`Dean Debug: Admission ${adm}`);
    console.log('Roster entry:', roster.find(r => String(r.admissionNo || r.admission) === adm) || null);
    console.log('Elective assignments (matched):', electiveAssignments.filter(a => {
      const aid = String(
        a?.learnerId?._id ||
        a?.learner?._id ||
        a?.learnerId ||
        a?.learner ||
        a?.admissionNo ||
        ""
      ).trim();
      const aAdm = String(a?.learnerId?.admission || a?.learner?.admission || a?.admissionNo || "").trim();
      return aid === adm || aAdm === adm;
    }));
    console.log('Eligibility set:', eligibility ? Array.from(eligibility) : 'none');
    console.table(results);
    console.groupEnd();

    return { admission: adm, eligibility: eligibility ? Array.from(eligibility) : null, subjects: results };
  } catch (e) {
    console.error('deanDebugCheckStudent error', e);
    return null;
  }
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY_PREFIX = "dean_analytics_cache_v2_";

let schoolInfo = null;
//.................................
// 🆕 Grading Configuration Modal
//...................................
const gradingConfigModal = document.createElement('div');
gradingConfigModal.id = 'gradingConfigModal';
gradingConfigModal.className = 'modal hidden';
gradingConfigModal.innerHTML = `
  <div class="modal-content">
    <h3>Configure School Grading Levels</h3>
    <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 15px;">Define custom mark ranges, labels (EE, ME, AE, BE), and points for Primary and Secondary grades.</p>
    
    <div class="tab-navigation">
      <button class="tab-btn active" data-grade-type="primary">Primary Grades (PG-Grade 6)</button>
      <button class="tab-btn" data-grade-type="secondary">Secondary Grades (Grade 7-12)</button>
    </div>

    <div class="grading-config-panel" id="primaryGradingPanel">
      <h4>Primary Grading Scale (4-Point)</h4>
      <div id="primaryRanges" class="grading-ranges-container"></div>
      <button class="btn secondary-btn add-range-btn" data-grade-type="primary"><i class="fas fa-plus-circle"></i> Add Range</button>
    </div>

    <div class="grading-config-panel hidden" id="secondaryGradingPanel">
      <h4>Secondary Grading Scale (8-Point)</h4>
      <div id="secondaryRanges" class="grading-ranges-container"></div>
      <button class="btn secondary-btn add-range-btn" data-grade-type="secondary"><i class="fas fa-plus-circle"></i> Add Range</button>
    </div>

    <div class="modal-footer" style="margin-top: 25px; text-align: right;">
      <button class="btn danger-btn" id="resetGradingConfigBtn" style="float: left;"><i class="fas fa-undo"></i> Reset to Defaults</button>
      <button class="btn secondary-btn" id="cancelGradingConfigBtn">Cancel</button>
      <button class="btn primary-btn" id="saveGradingConfigBtn"><i class="fas fa-save"></i> Save Configuration</button>
    </div>
  </div>
`;
document.body.appendChild(gradingConfigModal);

// 🆕 System Default Scales (sourced from cbc-utils)
const SYSTEM_DEFAULTS = window.cbcUtils?.getDefaultGradingConfig
  ? {
      primary: window.cbcUtils.getDefaultGradingConfig('primary'),
      secondary: window.cbcUtils.getDefaultGradingConfig('secondary')
    }
  : { primary: [], secondary: [] };

let currentGradingConfig = JSON.parse(JSON.stringify(SYSTEM_DEFAULTS));
let activeGradeType = 'primary';

function openGradingConfigModal() {
  // Load existing config from cbcUtils if available
  if (window.cbcUtils.customGradingConfig) {
    currentGradingConfig = JSON.parse(JSON.stringify(window.cbcUtils.customGradingConfig)); // Deep copy
  }
  renderGradingRanges('primary');
  renderGradingRanges('secondary');
  gradingConfigModal.classList.remove('hidden');
  gradingConfigModal.classList.add('visible');
}

function renderGradingRanges(gradeType) {
  const container = document.getElementById(`${gradeType}Ranges`);
  if (!container) return;
  container.innerHTML = '';

  // Add header for columns to improve clarity
  const header = document.createElement('div');
  header.className = "grading-range-header";
  header.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #475569; font-size: 0.75rem; text-align: center;";
  header.innerHTML = `
    <div style="width: 55px;">Min %</div>
    <div style="width: 55px;">Max %</div>
    <div style="flex: 1; text-align: center;">Grade Label</div>
    <div style="width: 55px;">Points</div>
    <div style="width: 32px;"></div>
  `;
  container.appendChild(header);

  currentGradingConfig[gradeType].sort((a, b) => b.min - a.min).forEach((range, index) => {
    const div = document.createElement('div');
    div.className = 'grading-range-item';
    div.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 10px;";
    div.innerHTML = `
      <input type="number" class="range-min" value="${range.min}" placeholder="Min" min="0" max="100" style="width: 55px; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; text-align: center;">
      <span style="color: #94a3b8; font-weight: bold;">-</span>
      <input type="number" class="range-max" value="${range.max}" placeholder="Max" min="0" max="100" style="width: 55px; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; text-align: center;">
      <input type="text" class="range-label" value="${range.label}" placeholder="Label" maxlength="3" style="flex: 1; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; text-align: center; text-transform: uppercase; font-weight: 700; color: #1e293b;">
      <input type="number" class="range-points" value="${range.points}" placeholder="Pts" min="1" max="8" style="width: 55px; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; text-align: center; font-weight: 700;">
      <button class="btn danger-btn remove-range-btn" style="padding: 6px 10px;"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);

    div.querySelector('.remove-range-btn').onclick = () => {
      currentGradingConfig[gradeType].splice(index, 1);
      renderGradingRanges(gradeType);
    };
    ['.range-min', '.range-max', '.range-label', '.range-points'].forEach(selector => {
      div.querySelector(selector).addEventListener('change', (e) => {
        const val = e.target.value;
        if (e.target.classList.contains('range-label')) range.label = val.toUpperCase();
        else range[e.target.className.replace('range-', '')] = Number(val);
      });
    });
  });
}

gradingConfigModal.querySelectorAll('.tab-navigation .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    gradingConfigModal.querySelectorAll('.tab-navigation .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeGradeType = btn.dataset.gradeType;
    gradingConfigModal.querySelectorAll('.grading-config-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(`${activeGradeType}GradingPanel`).classList.remove('hidden');
  });
});

gradingConfigModal.querySelectorAll('.add-range-btn').forEach(btn => {
  btn.onclick = () => {
    const gradeType = btn.dataset.gradeType;
    const newRange = { min: 0, max: 0, label: '', points: 0 };
    if (gradeType === 'primary') newRange.points = 1;
    else newRange.points = 1;
    currentGradingConfig[gradeType].push(newRange);
    renderGradingRanges(gradeType);
  };
});

document.getElementById('resetGradingConfigBtn').onclick = async () => {
  const confirmed = await cbcUtils.showConfirmToast("Reset all grading ranges to system defaults? This will overwrite your current unsaved changes.");
  if (confirmed) {
    currentGradingConfig = JSON.parse(JSON.stringify(SYSTEM_DEFAULTS));
    renderGradingRanges('primary');
    renderGradingRanges('secondary');
    cbcUtils.showToast("Ranges reset to defaults. Click 'Save' to apply permanently.", "info");
  }
};

document.getElementById('cancelGradingConfigBtn').onclick = () => {
  gradingConfigModal.classList.remove('visible');
  gradingConfigModal.classList.add('hidden');
};

document.getElementById('saveGradingConfigBtn').onclick = async () => {
  // Basic validation: check for overlapping ranges or gaps
  for (const type of ['primary', 'secondary']) {
    const ranges = currentGradingConfig[type].sort((a, b) => a.min - b.min);
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i].min < 0 || ranges[i].max > 100 || ranges[i].min > ranges[i].max) {
        cbcUtils.showToast(`Invalid range in ${type} grading: Min/Max scores must be between 0-100 and Min <= Max.`, 'error');
        return;
      }
      if (!ranges[i].label || !ranges[i].points) {
        cbcUtils.showToast(`Missing label or points in ${type} grading.`, 'error');
        return;
      }
      if (i > 0 && ranges[i].min !== ranges[i-1].max + 1) {
        cbcUtils.showToast(`Gap or overlap detected in ${type} grading ranges. Ensure ranges are contiguous (e.g., 0-10, 11-20).`, 'error');
        return;
      }
    }
    // Check if 0-100 is fully covered
    if (ranges.length > 0 && (ranges[0].min !== 0 || ranges[ranges.length - 1].max !== 100)) {
      cbcUtils.showToast(`Grading scale for ${type} must cover the full 0-100 range.`, 'error');
      return;
    }
  }

  const saveBtn = document.getElementById('saveGradingConfigBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    const res = await fetchWithAuth(`${API_BASE}/users/my-school/grading-config`, {
      method: 'PUT',
      body: JSON.stringify({ gradingConfig: currentGradingConfig })
    });

    if (res) {
      const savedConfig = JSON.parse(JSON.stringify(currentGradingConfig));
      window.cbcUtils.customGradingConfig = savedConfig;
      
      // Sync internal state to prevent data loss on subsequent modal opens
      if (schoolInfo) schoolInfo.gradingConfig = savedConfig;
      if (window.schoolInfo) window.schoolInfo.gradingConfig = savedConfig;

      // Update the local school info cache so changes persist across page visits
      const SCHOOL_CACHE_KEY = "dean_school_info_cache";
      const cached = localStorage.getItem(SCHOOL_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.data) {
            parsed.data.gradingConfig = savedConfig;
            localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(parsed));
          }
        } catch (e) { localStorage.removeItem(SCHOOL_CACHE_KEY); }
      }

      cbcUtils.showToast('Grading configuration saved successfully!', 'success');
      gradingConfigModal.classList.remove('visible');
      gradingConfigModal.classList.add('hidden');

      // 🆕 Instantly update dashboard metrics with new custom scales
      if (currentAnalysisRawData) {
        processAnalysisData(currentAnalysisRawData, currentIsSenior, filterAssessmentEl.value, currentPrevRawData, currentRoster, currentElectiveAssignments);
      }
    }
  } catch (err) {
    console.error('Save grading config error:', err);
    cbcUtils.showToast(err.message || 'Failed to save grading configuration.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Configuration';
  }
};

// Initial render of active panel
document.getElementById('primaryGradingPanel').classList.remove('hidden');

// 🆕 Ensure cbcUtils namespace exists before any properties are attached
window.cbcUtils = window.cbcUtils || {};

// 🆕 Reuse the shared school-type helper from cbc-utils when available.
if (!window.cbcUtils.getSchoolTypeKey) {
  window.cbcUtils.getSchoolTypeKey = () => window.schoolInfo?.schoolType || 'full';
}

// 🆕 Provide a fallback grade option helper if the shared utility has not loaded yet.
if (!window.cbcUtils.getGradeOptionsForSchool) {
  window.cbcUtils.getGradeOptionsForSchool = function() {
    const schoolType = window.cbcUtils?.getSchoolTypeKey?.() || 'full';
    const typeConfig = window.cbcUtils?.SCHOOL_TYPES?.[schoolType] || window.cbcUtils?.SCHOOL_TYPES?.full;
    return (typeConfig?.gradeOptions || []).map(g =>
      (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`
    );
  };
}

function buildStudentTermProgressSeries(student) {
  if (!Array.isArray(currentAnalysisRawData) || !currentAnalysisRawData.length || !student) return [];

  const targetAdm = String(student.adm || student.admissionNo || "");
  const grade = filterGradeEl?.value;
  const selectedStream = filterStreamEl?.value || "all";
  const term = filterTermEl?.value;
  const year = filterYearEl?.value;
  const selectedAssessments = new Set(Array.from(document.querySelectorAll(".baseline-check:checked"))
    .map(input => String(input.value)));

  const grouped = {};
  currentAnalysisRawData.forEach((entry) => {
    const entryAdm = String(entry.admissionNo || entry.admission || "");
    const sameStudent = entryAdm === targetAdm;
    const sameGrade = !grade || String(entry.grade) === String(grade) || cbcUtils.normalizeGrade(entry.grade) === cbcUtils.normalizeGrade(grade);
    const sameTerm = !term || String(entry.term) === String(term);
    const sameYear = !year || String(entry.year) === String(year);
    const sameStream = selectedStream === "all" || String(entry.stream || "Unassigned") === String(selectedStream);
    const assessmentKey = String(entry.assessment);
    const selectedAssessment = selectedAssessments.has(assessmentKey);

    if (!sameStudent || !sameGrade || !sameTerm || !sameYear || !sameStream || !selectedAssessment) return;

    if (!grouped[assessmentKey]) {
      grouped[assessmentKey] = { total: 0, count: 0 };
    }

    entry.subjects.forEach((sub) => {
      const subName = getAnalysisSubjectName(sub, currentIsSenior);
      if (!subName || (currentIsSenior && isExcludedSeniorSubject(subName))) return;

      const score = currentIsSenior ? getSeniorSubjectScore(sub) : sub.score;
      if (score !== undefined && score !== null && score !== "" && score !== "X" && score !== "x" && !isNaN(score)) {
        grouped[assessmentKey].total += Number(score);
        grouped[assessmentKey].count += 1;
      }
    });
  });

  return Object.entries(grouped)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([assessment, data]) => ({
      assessment,
      mean: data.count ? data.total / data.count : 0,
      label: sanitizePdfText(window.ASSESSMENT_MAPPING?.[assessment] || "")
    }));
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
  if (!token) return authService.redirectToLogin();

  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) return authService.redirectToLogin();

  const error = !res.ok ? await res.json().catch(() => ({})) : null;
  if (error) {
    if (res.status === 403) {
      throw new Error(error.message || "Access denied. You do not have permission to perform this action.");
    }
    throw new Error(error.message || "Request failed");
  }
  return res.json();
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".menu li[data-tab]");
  const tabPanes = document.querySelectorAll(".tab-pane");

  if (tabBtns.length === 0) return;

  tabBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // Use closest to handle clicks on icons inside the tab button
      const target = btn.dataset.tab || btn.closest('[data-tab]')?.dataset.tab;
      if (!target) return;

      // 🆕 Redirect Timetable to a new standalone window (Robust check)
      console.log(`Timetable tab clicked. Is standalone-view already present? ${document.body.classList.contains('standalone-view')}`);
      if (target.toLowerCase().includes("timetable") && !document.body.classList.contains('standalone-view')) {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('view', 'timetable');
        window.open(url.toString(), '_blank');
        return; // Prevent switching in the current window
      }

      tabBtns.forEach(b => b.classList.remove("active"));
      tabPanes.forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const activePane = document.getElementById(target);
      if (activePane) {
        activePane.classList.add("active");

        // 🆕 Toggle global Dean filters and analysis stats: Hidden for module tabs that use their own filters
        const globalFilters = document.querySelector('.filters-section');
        const summaryCards = document.querySelector('.stats-grid');
        const isModuleTab = target === "submittedSubjectsTab" || target === "learnerMarksTab";
        if (globalFilters) globalFilters.style.display = isModuleTab ? "none" : "block";
        if (summaryCards) summaryCards.style.display = isModuleTab ? "none" : "grid";
        if (analysisSection) analysisSection.style.display = isModuleTab ? "none" : "block";

        // 🆕 Initialize Timetable Logic when tab is opened
        if (target.toLowerCase().includes("timetable") && window.TimetableModule) {
           // Ensure the container section is visible regardless of academic analysis status
           if (analysisSection) {
               analysisSection.style.display = "block";
           } else {
               console.warn("analysisSection not found for timetable tab.");
           }
           window.TimetableModule.init();
        }

        // 🆕 Initialize SubmittedSubjectsModule when its tab is opened (Check for both possible names)
        if (target === "submittedSubjectsTab") {
           // 🆕 Check for the module and retry with an increased delay to handle race conditions
           const checkAndInit = () => {
              const ssModule = window.SubmittedSubjectsModule || window.submittedSubjectsModule;
              if (ssModule && typeof ssModule.init === 'function') {
                  ssModule.init();
                  return true;
              }
              return false;
           };

           if (!checkAndInit()) {
           setTimeout(() => {
                if (!checkAndInit()) {
                    console.warn("⚠️ SubmittedSubjectsModule not found on window object. Verify the script tag in your HTML.");
                }
             }, 150); // Increased delay for slower network loads or script execution
           }
        }
        if (target === "learnerMarksTab") {
           if (window.LearnerMarksModule && typeof window.LearnerMarksModule.init === 'function') {
             window.LearnerMarksModule.init();
           } else {
             setTimeout(() => {
               if (window.LearnerMarksModule && typeof window.LearnerMarksModule.init === 'function') {
                 window.LearnerMarksModule.init();
               } else {
                 console.warn("⚠️ LearnerMarksModule not found on window object. Verify the script tag in your HTML.");
               }
             }, 150);
           }
        }

        // 🆕 Refresh SMS Balance when SMS results tab is opened
        // 🆕 Refresh SMS Data when SMS results tab is opened
        if (target === "smsResultsTab") {
           updateDeanSmsBalance();
           fetchSmsHistorySummary(true);
        }

        // 🆕 Lazy-load rankings when the rankings tab is opened
        if (target === "schoolRankingsTab") {
           renderLazySchoolRankingsWidget();
        }

        if (target === "missingExamsTab") {
           renderLazyMissingExamsWidget();
        }
      }
    });
  });
}

function renderLazyMissingExamsWidget() {
  if (!lazyWidgetCache.missingExams) {
    if (missingExamsTableWrap) {
      missingExamsTableWrap.innerHTML = '<div class="empty-state" style="padding: 30px; text-align:center; color:#475569;">Run analysis first to view missing exams.</div>';
    }
    return;
  }

  const { missingExamsList, streamDiscrepancies } = lazyWidgetCache.missingExams;
  renderMissingExamsTable(missingExamsList, streamDiscrepancies);
}

async function generateReport() {
  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const assessment = filterAssessmentEl.value;
  const year = filterYearEl.value;

  if (!grade) return cbcUtils.showToast("Please select a grade.", "error");
  if (term === "all" || assessment === "all") {
    analysisSection.style.display = "none";
    cbcUtils.showToast("Please select a specific term and assessment to generate a dashboard report.", "info");
    return;
  }

  window.spinner?.show(applyFiltersBtn, "Analyzing...");

  // Allow UI to render spinner before potentially heavy cache/processing logic
  await new Promise(resolve => setTimeout(resolve, 100));

  const gradeNum = window.cbcUtils?.getGradeNum?.(grade) ?? 0;
  const isSenior = gradeNum >= 10;
  const cacheKey = `${grade}_${term}_${year}_${assessment}_${filterStreamEl?.value || "all"}`;
  const cached = getAnalyticsCache(cacheKey); // Check cache

  if (cached) {
    console.log("✅ Using cached analytics for Grade: " + grade);
    analysisSection.style.display = "block";
    currentPrevRawData = cached.prevTermData;
    currentRoster = cached.roster || [];
    currentElectiveAssignments = cached.electiveAssignments || [];
    processAnalysisData(cached.rawData, cached.isSenior, assessment, cached.prevTermData, cached.roster, cached.electiveAssignments || []);

    // 🆕 Update Reports Tab UI
    const reportsUI = document.getElementById("reportsGenerationUI");
    const reportsPlaceholder = document.getElementById("reportsPlaceholder");
    if (reportsUI) reportsUI.style.display = "block";
    if (reportsPlaceholder) reportsPlaceholder.style.display = "none";

    window.spinner?.hide(applyFiltersBtn);
    return;
  }
  
  try {
    const marksPromise = fetchWithAuth(`${API_BASE}/marks/by-grade?${new URLSearchParams({ grade, term, year, assessment: 'all' })}`);
    const rosterPromise = fetchWithAuth(`${API_BASE}/enrollments/class/${encodeURIComponent(grade)}?limit=500`);
    const electivePromise = isSenior
      ? fetchWithAuth(`${API_BASE}/electives/assignments`)
      : Promise.resolve([]);

    const [marksData, rosterResponse, electiveAssignmentsResponse] = await Promise.all([
      marksPromise,
      rosterPromise,
      electivePromise
    ]);

    if (!marksData || marksData.length === 0) {
      analysisSection.style.display = "none";
      cbcUtils.showToast("No marks found for the selected filters.", "error");
      return;
    }

    const roster = rosterResponse?.students || (Array.isArray(rosterResponse) ? rosterResponse : []);
    const electiveAssignments = Array.isArray(electiveAssignmentsResponse)
      ? electiveAssignmentsResponse
      : (electiveAssignmentsResponse?.data || electiveAssignmentsResponse?.assignments || []);
    currentRoster = roster; // 🆕 Cache roster for local re-analysis
    currentElectiveAssignments = electiveAssignments;
    
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
    // 🆕 Update Reports Tab UI
    const reportsUI = document.getElementById("reportsGenerationUI");
    const reportsPlaceholder = document.getElementById("reportsPlaceholder");
    if (reportsUI) reportsUI.style.display = "block";
    if (reportsPlaceholder) reportsPlaceholder.style.display = "none";

    currentPrevRawData = prevTermData;
    setAnalyticsCache(cacheKey, {
      rawData: marksData,
      isSenior: isSenior,
      prevTermData: prevTermData,
      roster: roster,
      electiveAssignments: electiveAssignments
    });

    processAnalysisData(marksData, isSenior, assessment, prevTermData, roster, electiveAssignments);
  } catch (err) {
    if (err.message.includes("No marks found")) {
      analysisSection.style.display = "none";
      cbcUtils.showToast("No results found for the selected filters.", "error");
    } else {
      console.error("Analysis Error:", err);
      cbcUtils.showToast(err.message || "Failed to analyze grade results.", "error");
    }
  } finally {
    applyFiltersBtn.disabled = false;
    applyFiltersBtn.innerHTML = "🔍 View Results";
    window.spinner?.hide(applyFiltersBtn);
  }
}

/**
 * 🆕 GENERATE SCHOOL-WIDE RANKINGS
 * Fetches top performers across all grades from the backend.
 */
function normalizeSchoolRankingGrade(grade) {
  return String(window.cbcUtils?.normalizeGrade?.(grade) || String(grade || "").trim() || "").trim();
}

function getSchoolRankingPhaseKey(grade) {
  const normalizedGrade = normalizeSchoolRankingGrade(grade).toUpperCase();
  if (["PG", "PP1", "PP2"].includes(normalizedGrade)) return "early-years";

  const gradeMatch = String(normalizeSchoolRankingGrade(grade)).match(/\d+/);
  const gradeNum = gradeMatch ? Number(gradeMatch[0]) : null;

  if (gradeNum !== null) {
    if (gradeNum >= 1 && gradeNum <= 3) return "lower-primary";
    if (gradeNum >= 4 && gradeNum <= 6) return "upper-primary";
    if (gradeNum >= 7 && gradeNum <= 9) return "junior-school";
  }

  return null;
}

function getSchoolRankingSections(rankings = []) {
  const sections = [
    {
      key: "early-years",
      title: "PG-PP2 Rankings (Top 10)",
      grades: new Set(["PG", "PP1", "PP2"]),
    },
    {
      key: "lower-primary",
      title: "Grade 1-3 Rankings (Top 10)",
      grades: new Set(["1", "2", "3"]),
    },
    {
      key: "upper-primary",
      title: "Grade 4-6 Rankings (Top 10)",
      grades: new Set(["4", "5", "6"]),
    },
    {
      key: "junior-school",
      title: "Junior School 7-9 Rankings (Top 10)",
      grades: new Set(["7", "8", "9"]),
    },
  ];

  return sections.map((section) => {
    const rows = (rankings || [])
      .filter((item) => getSchoolRankingPhaseKey(item?.grade) === section.key)
      .map((item) => ({
        ...item,
        meanScore: Number(item?.meanScore) || 0,
        totalPoints: item?.scores ? item.scores.reduce((sum, score) => sum + (window.cbcUtils?.getPoints?.(score, item.grade) || 0), 0) : 0,
        level: window.cbcUtils?.getSubdivision?.(Number(item?.meanScore) || 0, item?.grade) || "-",
      }))
      .sort((a, b) => {
        if (b.meanScore !== a.meanScore) return b.meanScore - a.meanScore;
        return String(a.studentName || "").localeCompare(String(b.studentName || ""));
      })
      .slice(0, 10)
      .map((row, index) => ({ ...row, localRank: index + 1 }));

    return {
      ...section,
      rows,
    };
  }).filter((section) => section.rows.length > 0);
}

async function generateSchoolWideReport() {
  const term = filterTermEl.value;
  const assessment = filterAssessmentEl.value;
  const year = filterYearEl.value;
  const cacheKey = `${term}|${year}|${assessment}`;

  if (term === "all" || assessment === "all") {
    if (schoolRankingsTableWrap) {
      schoolRankingsTableWrap.innerHTML = `
        <div class="instruction-state" style="text-align:center; padding:40px; margin-top: 20px; background:#f8fafc; border-radius:12px; border: 1px dashed #cbd5e0; color:#64748b;">
          <h3 style="margin-top:0; color:#1e293b;">School-Wide Performance Rankings</h3>
          <p style="font-size:1rem; margin-bottom:15px;">View and download top performers across all grades for the selected academic period.</p>
          <p style="font-size:0.9rem; font-weight:600; color:#475569;">Select a specific Term and Assessment, then open the <strong>SCHOOL RANKINGS</strong> tab to view the report.</p>
        </div>`;
    }
    return;
  }

  if (!schoolRankingsTableWrap) return;

  if (lazyWidgetCache.rankings && lazyWidgetCache.rankings.key === cacheKey) {
    const payload = Array.isArray(lazyWidgetCache.rankings.data) ? lazyWidgetCache.rankings.data : [];
    if (payload.length === 0) {
      schoolRankingsTableWrap.innerHTML = '<div class="empty-state">No rankings available for this period.</div>';
    } else {
      renderSchoolWideRankingsTable(payload);
    }
    return;
  }

  schoolRankingsTableWrap.innerHTML = '<div style="text-align:center; padding:40px;"><span class="spinner"></span> Analyzing school-wide performance...</div>';

  try {
    const res = await fetchWithAuth(`${API_BASE}/marks/school-wide-rankings?${new URLSearchParams({ term, year, assessment, limit: 200 })}`);

    const rankings = Array.isArray(res?.rankings) ? res.rankings : [];
    lazyWidgetCache.rankings = { key: cacheKey, data: rankings };

    if (rankings.length === 0) {
      schoolRankingsTableWrap.innerHTML = '<div class="empty-state">No rankings available for this period.</div>';
      return;
    }

    renderSchoolWideRankingsTable(rankings);
  } catch (err) {
    console.error("School Ranking Error:", err);
    schoolRankingsTableWrap.innerHTML = '<div class="error-state">Failed to load school rankings.</div>';
  }
}

function buildSchoolRankingSummarySections(sections = []) {
  const phaseDefinitions = [
    { key: "early-years", title: "PG-PP2 Counts" },
    { key: "lower-primary", title: "Grade 1-3 Counts" },
    { key: "upper-primary", title: "Grade 4-6 Counts" },
    { key: "junior-school", title: "Junior 7-9 Counts" },
  ];

  return phaseDefinitions.map((phase) => {
    const section = sections.find((item) => item.key === phase.key);
    const summaryMap = new Map();

    (section?.rows || []).forEach((row) => {
      const grade = normalizeSchoolRankingGrade(row?.grade) || "Unassigned";
      const stream = String(row?.stream || "").trim() || "Unassigned";
      const key = `${grade}::${stream}`;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, { grade, stream, count: 0 });
      }

      summaryMap.get(key).count += 1;
    });

    const rows = Array.from(summaryMap.values()).sort((a, b) => {
      const gradeA = normalizeSchoolRankingGrade(a.grade);
      const gradeB = normalizeSchoolRankingGrade(b.grade);
      const orderA = window.cbcUtils?.GRADE_ORDER?.indexOf(gradeA) ?? -1;
      const orderB = window.cbcUtils?.GRADE_ORDER?.indexOf(gradeB) ?? -1;
      if (orderA !== -1 && orderB !== -1 && orderA !== orderB) return orderA - orderB;
      const numA = window.cbcUtils?.getGradeNum?.(gradeA) || 0;
      const numB = window.cbcUtils?.getGradeNum?.(gradeB) || 0;
      if (numA !== numB) return numA - numB;
      return a.stream.localeCompare(b.stream);
    });

    return {
      title: phase.title,
      rows: rows.length > 0 ? rows : [{ grade: "No data", stream: "-", count: 0 }],
    };
  });
}

function renderSchoolWideRankingsTable(rankings) {
  const sections = getSchoolRankingSections(rankings);

  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
      <div>
        <h4 style="margin:0; color:#1e293b;">School Phase Rankings</h4>
        <p style="margin:6px 0 0; color:#64748b; font-size:0.9rem;">Top 10 learners from each school phase for the selected period, displayed together for easy comparison.</p>
      </div>
      <button id="printSchoolRankingsBtn" class="btn secondary-btn"><i class="fas fa-file-pdf"></i> Download Rankings PDF</button>
    </div>
  `;

  html += `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; align-items:start;">
      ${sections.map((section) => `
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <h5 style="margin:0 0 8px; color:#0f172a;">${section.title}</h5>
          <div style="overflow:auto; border:1px solid #e2e8f0; border-radius:10px;">
            <table class="marks-table" style="width:100%; border-collapse:collapse; min-width:260px;">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>Mean</th>
                </tr>
              </thead>
              <tbody>
                ${section.rows.map((row) => `
                  <tr>
                    <td style="font-weight:800; color:#2563eb;">#${row.localRank}</td>
                    <td><strong>${row.studentName}</strong></td>
                    <td><span class="status-badge" style="background:#eef2ff; color:#3730a3;">${row.grade} ${row.stream || ''}</span></td>
                    <td style="font-weight:700;">${Number(row.meanScore || 0).toFixed(2)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  schoolRankingsTableWrap.innerHTML = html;

  document.getElementById("printSchoolRankingsBtn")?.addEventListener("click", () => downloadSchoolWideRankingAsPDF(rankings));
}

async function downloadSchoolWideRankingAsPDF(rankings) {
  const btn = document.getElementById("printSchoolRankingsBtn");
  const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;

  if (!jsPDFClass) return cbcUtils.showToast("PDF generation library is not loaded.", "error");

  if (window.spinner) {
    window.spinner.show(btn, "Generating...");
  }

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const doc = new jsPDFClass();
    const pageWidth = doc.internal.pageSize.getWidth();
    const schoolName = sanitizePdfText((schoolInfo?.name || "SCHOOL NAME").toUpperCase());
    const sections = getSchoolRankingSections(rankings);

    const drawSchoolRankingWatermark = () => {
      if (!deanProfileData?.schoolLogoBase64) return;
      try {
        const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
        const format = deanProfileData.logoFormat || "PNG";
        const pageHeight = doc.internal.pageSize.getHeight();
        const width = 80;
        const height = (imgProps.height * width) / imgProps.width;

        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.035 }));
        doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
        doc.restoreGraphicsState();
      } catch (e) { console.warn("Watermark rendering error:", e); }
    };
    
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(schoolName, pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.text("SCHOOL PHASE RANKINGS", pageWidth / 2, 30, { align: "center" });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const term = sanitizePdfText(filterTermEl.value);
    const year = sanitizePdfText(filterYearEl.value);
    const assess = sanitizePdfText(filterAssessmentEl.options[filterAssessmentEl.selectedIndex].text);
    doc.text(sanitizePdfText(`${year} | Term ${term} | ${assess}`), pageWidth / 2, 38, { align: "center" });

    let yPos = 48;

    sections.forEach((section, index) => {
      if (index > 0 && yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(section.title, 14, yPos);
      yPos += 6;

      const headers = [["Rank", "Student Name", "Grade", "Mean Score", "Points", "Level"]];
      const data = section.rows.map((row) => [
        `#${row.localRank}`,
        row.studentName,
        `${row.grade} ${row.stream || ''}`,
        `${Number(row.meanScore || 0).toFixed(2)}%`,
        row.totalPoints,
        row.level,
      ]);

      doc.autoTable({
        startY: yPos,
        head: headers,
        body: data,
        theme: 'grid',
        rowPageBreak: 'avoid',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 8 },
        didDrawPage: (data) => {
          drawSchoolRankingWatermark();

          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text("CompetenceHub Analytics", pageWidth / 2, pageHeight - 10, { align: "center" });
          doc.text(`Page ${data.pageNumber}`, pageWidth - 20, pageHeight - 10, { align: "right" });
        }
      });

      yPos = doc.lastAutoTable.finalY + 12;
    });

    const summarySections = buildSchoolRankingSummarySections(sections);
    if (summarySections.length > 0) {
      if (yPos > 160) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("COUNT SUMMARY", 14, yPos);
      yPos += 8;

      const summaryTableWidth = 82;
      const summaryColumns = [
        { x: 14 },
        { x: 14 + summaryTableWidth + 10 },
      ];
      const summaryRows = [
        [summarySections[0], summarySections[1]],
        [summarySections[2], summarySections[3]],
      ];

      const drawSummaryPageDecor = (data) => {
        drawSchoolRankingWatermark();

        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("CompetenceHub Analytics", pageWidth / 2, pageHeight - 10, { align: "center" });
        doc.text(`Page ${data.pageNumber}`, pageWidth - 20, pageHeight - 10, { align: "right" });
      };

      const drawSummaryTable = (summarySection, columnX, tableStartY) => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(summarySection.title, columnX, tableStartY);

        doc.autoTable({
          startY: tableStartY + 4,
          margin: { left: columnX },
          head: [["Grade", "Count"]],
          body: summarySection.rows.map((row) => {
            const streamLabel = row.stream && row.stream !== "Unassigned" ? ` ${row.stream}` : "";
            return [`${row.grade}${streamLabel}`, row.count];
          }),
          theme: "grid",
          rowPageBreak: "avoid",
          tableWidth: summaryTableWidth,
          headStyles: { fillColor: [30, 41, 59], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1.5 },
          didDrawPage: drawSummaryPageDecor,
        });

        return doc.lastAutoTable.finalY;
      };

      summaryRows.forEach((rowPair) => {
        const rowStartY = yPos + 4;
        let rowBottomY = rowStartY;

        rowPair.forEach((summarySection, columnIndex) => {
          if (!summarySection) return;
          const columnX = summaryColumns[columnIndex]?.x ?? summaryColumns[0].x;
          const tableBottomY = drawSummaryTable(summarySection, columnX, rowStartY);
          rowBottomY = Math.max(rowBottomY, tableBottomY);
        });

        yPos = rowBottomY + 10;
      });
    }

    doc.save(`School_Phase_Rankings_${year}_T${term}.pdf`);
  } finally {
    if (window.spinner) {
      window.spinner.hide(btn);
    }
  }
}

function normalizeSubjectName(subjectName) {
  return String(subjectName || "").trim().toLowerCase();
}

function getAnalysisSubjectName(sub, isSenior) {
  if (!sub || typeof sub !== 'object') return null;

  const rawName = String(isSenior ? (sub.course || sub.subject || "") : (sub.subject || sub.course || "")).trim();
  if (!rawName) return null;

  if (isSenior && window.SUBJECT_DATA && typeof window.SUBJECT_DATA.normalizeSeniorSubjectName === 'function') {
    const normalized = window.SUBJECT_DATA.normalizeSeniorSubjectName(rawName);
    return normalized || rawName;
  }

  return rawName;
}

function isExcludedSeniorSubject(subjectName) {
  const normalized = normalizeSubjectName(subjectName);
  const excluded = new Set([
    "pe",
    "physical education",
    "phys ed",
    "sports and physical education",
    "physical health education",
    "ict",
    "information communication technology",
    "information and communication technology",
    "information communication technoloy",
    "information and communication technoloy"
  ]);
  return excluded.has(normalized);
}

function buildSeniorSubjectEligibilityMap(roster = [], electiveAssignments = []) {
  const eligibilityMap = new Map();
  electiveAssignments = Array.isArray(electiveAssignments)
    ? electiveAssignments
    : Array.isArray(electiveAssignments?.data)
      ? electiveAssignments.data
      : Array.isArray(electiveAssignments?.assignments)
        ? electiveAssignments.assignments
        : [];

  const normalize = (name) => {
    if (window.SUBJECT_DATA && typeof window.SUBJECT_DATA.normalizeSeniorSubjectName === 'function') {
      return window.SUBJECT_DATA.normalizeSeniorSubjectName(String(name || "").trim());
    }
    return String(name || "").trim();
  };

  const compulsorySubjects = (window.SUBJECT_DATA?.seniorCompulsorySubjects || [])
    .map((subject) => normalize(subject))
    .filter(Boolean)
    .filter((subject) => !isExcludedSeniorSubject(subject));

  roster.forEach((student) => {
    const admission = String(student?.admissionNo || student?.admission || "").trim();
    const learnerId = String(student?._id || student?.id || student?.studentId || "").trim();
    const grade = student?.grade;
    const isSenior = window.cbcUtils?.isSeniorGrade?.(grade) || false;

    const eligibleSubjects = new Set(compulsorySubjects);

    if (isSenior) {
      const assignmentsForStudent = electiveAssignments.filter((assignment) => {
        const assignmentLearnerId = String(
          assignment?.learnerId?._id ||
          assignment?.learner?._id ||
          assignment?.learnerId ||
          assignment?.learner ||
          ""
        ).trim();
        const assignmentAdmission = String(
          assignment?.learnerId?.admission ||
          assignment?.learner?.admission ||
          assignment?.admissionNo ||
          ""
        ).trim();

        return (learnerId && assignmentLearnerId && assignmentLearnerId === learnerId) ||
          (admission && assignmentAdmission && assignmentAdmission === admission);
      });

      assignmentsForStudent.forEach((assignment) => {
        const rawSubjects = Array.isArray(assignment?.subjects)
          ? assignment.subjects
          : Array.isArray(assignment?.subjectLines)
            ? assignment.subjectLines
            : Array.isArray(assignment?.electiveSet?.subjects)
              ? assignment.electiveSet.subjects
              : Array.isArray(assignment?.electiveSets)
                ? assignment.electiveSets.flatMap((set) => Array.isArray(set?.subjects) ? set.subjects : [])
                : [];

        const subjects = rawSubjects.map((subject) => {
          if (typeof subject === 'string') return subject;
          if (subject && typeof subject === 'object') {
            return String(subject.subject || subject.course || subject.name || '').trim();
          }
          return '';
        }).filter(Boolean);

        subjects.forEach((subject) => {
          const subjectName = normalize(subject);
          if (subjectName && !isExcludedSeniorSubject(subjectName)) eligibleSubjects.add(subjectName);
        });
      });
    }

    if (admission) eligibilityMap.set(admission, eligibleSubjects);
    if (learnerId) eligibilityMap.set(learnerId, eligibleSubjects);
  });

  return eligibilityMap;
}

function isSubjectEligibleForStudent(studentKey, subjectName, isSenior, eligibilityMap) {
  if (!isSenior) return true;
  if (!subjectName) return false;
  if (isExcludedSeniorSubject(subjectName)) return false;

  const eligibility = eligibilityMap.get(String(studentKey));
  if (!eligibility || eligibility.size === 0) {
    // If we have no eligibility info for this student, restrict to compulsory senior subjects only.
    try {
      const normalize = (name) => {
        if (window.SUBJECT_DATA && typeof window.SUBJECT_DATA.normalizeSeniorSubjectName === 'function') return window.SUBJECT_DATA.normalizeSeniorSubjectName(String(name || '').trim());
        return String(name || '').trim();
      };
      const compulsory = (window.SUBJECT_DATA?.seniorCompulsorySubjects || []).map(s => normalize(s)).map(s => s.toLowerCase());
      return compulsory.includes(String(normalize(subjectName)).toLowerCase());
    } catch (e) {
      return false;
    }
  }

  const normalizedSubject = normalizeSubjectName(subjectName);
  return Array.from(eligibility).some((item) => {
    const normalizedItem = normalizeSubjectName(item);
    return normalizedItem === normalizedSubject || normalizedItem.includes(normalizedSubject) || normalizedSubject.includes(normalizedItem);
  });
}

function getSeniorSubjectScore(sub) {
  const isX = (v) => v === null || v === undefined || String(v).trim() === "" || (typeof v === 'string' && v.trim().toUpperCase() === "X");
  return isX(sub.score) ? "X" : sub.score;
}

/**
 * 🆕 Orders subjects by grade level for consistent PDF/report layout
 * @param {string[]} subjects - Array of subject names
 * @param {string} grade - Grade level (e.g., "Grade 7", "Grade 4", "PP2")
 * @returns {string[]} Subjects ordered by grade-specific sequence with proper formatting
 */
function getSubjectOrderForGrade(subjects, grade) {
  // 🆕 Helper to format subject names: Title Case (each word capitalized) and preserve abbreviations like ILA
  const formatSubjectName = (s) => {
    const str = String(s || "").trim();
    if (!str) return str;
    
    // Check if it's an abbreviation (2-4 uppercase letters) - preserve as is
    if (/^[A-Z]{2,4}$/.test(str)) {
      return str; // Keep abbreviations like "ILA", "PG", "PP1", "PP2" as is
    }
    
    // Title Case: capitalize first letter of each word, rest lowercase
    // BUT keep "and" entirely lowercase
    // AND handle hyphenated words (e.g., "PRE-TECHNICAL" -> "Pre-Technical")
    return str
      .split(' ')
      .map((word, idx, arr) => {
        const lowerWord = word.toLowerCase();
        // Keep "and" lowercase
        if (lowerWord === 'and') {
          return 'and';
        }
        // Handle hyphenated words: capitalize each part separately
        if (word.includes('-')) {
          return word
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('-');
        }
        // Capitalize first letter, rest lowercase
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };
  
  const normalizeSubject = (s) => String(s || "").trim().toUpperCase();
  const normalizedSubjects = subjects.map(normalizeSubject);
  
  let gradeOrder = [];
  
  // Grade 7-12 (Secondary)
  if (/Grade\s*(7|8|9|10|11|12)/.test(grade)) {
    gradeOrder = [
      "ENGLISH",
      "KISWAHILI",
      "MATHEMATICS",
      "INTEGRATED SCIENCE",
      "SOCIAL STUDIES",
      "CHRISTIAN RELIGIOUS EDUCATION",
      "AGRICULTURE",
      "PRE-TECHNICAL STUDIES",
      "CREATIVE ARTS AND SPORTS"
    ];
  }
  // Grade 4-6 (Upper Primary)
  else if (/Grade\s*(4|5|6)/.test(grade)) {
    gradeOrder = [
      "ENGLISH",
      "KISWAHILI",
      "MATHEMATICS",
      "SCIENCE AND TECHNOLOGY",
      "SOCIAL STUDIES",
      "CREATIVE ARTS AND SPORTS"
    ];
  }
  // Grade 1-3 (Lower Primary)
  else if (/Grade\s*(1|2|3)/.test(grade)) {
    gradeOrder = [
      "ENGLISH",
      "KISWAHILI",
      "MATHEMATICS",
      "ILA"
    ];
  }
  // PP2 (Pre-Primary 2)
  else if (/PP2|PRE-PRIMARY\s*2/.test(grade)) {
    gradeOrder = [
      "LANGUAGE",
      "LITERACY",
      "KISWAHILI",
      "NUMBERWORK",
      "PSYCOMOTOR",
      "ENVIRONMENTAL ACTIVITIES"
    ];
  }
  // PG, PP1 (Pre-Primary & Playgroup)
  else if (/PG|PP1|PRE-PRIMARY\s*1|PLAYGROUP/.test(grade)) {
    gradeOrder = [
      "LANGUAGE",
      "LITERACY",
      "NUMBERWORK",
      "PSYCOMOTOR",
      "ENVIRONMENTAL ACTIVITIES"
    ];
  }
  
  // Sort subjects according to gradeOrder, with unknown subjects at the end (alphabetically)
  const ordered = [];
  const unknown = [];
  
  normalizedSubjects.forEach(subj => {
    const orderIdx = gradeOrder.findIndex(o => o === subj);
    if (orderIdx !== -1) {
      ordered[orderIdx] = subj;
    } else {
      unknown.push(subj);
    }
  });
  
  // 🆕 Return ordered subjects with Title Case formatting (capitalize each word) and preserved abbreviations
  const result = [...ordered.filter(Boolean), ...unknown.sort()];
  return result.map(formatSubjectName);
}

function processAnalysisData(allRaw, isSenior, assessment, allPrevRaw = null, roster = [], electiveAssignments = []) {
  if (!allRaw || !allRaw.length) return;
  let streamsSet = new Set(); // Use let for reassignment

  // 🆕 Build a map of streams to their expected subjects from allRaw (before stream filtering)
  // This is crucial for the "All Streams" absence check, so a student isn't penalized
  // for not taking a subject that only another stream takes.
  const streamExpectedSubjectsMap = {};
  const allSubjectsInGrade = new Set(); // 🆕 Track all unique subjects in this grade
  allRaw.forEach(m => {
    const stream = m.stream || "Unassigned";
    if (!m.stream) m.stream = stream; // Ensure stream is always defined for grouping
    if (!streamExpectedSubjectsMap[stream]) {
      streamExpectedSubjectsMap[stream] = new Set();
    }
    m.subjects.forEach(sub => {
      const subName = getAnalysisSubjectName(sub, isSenior);
      if (!subName || (isSenior && isExcludedSeniorSubject(subName))) return;
      streamExpectedSubjectsMap[stream].add(subName);
      allSubjectsInGrade.add(subName);
    });
  });
  // Convert sets to sorted arrays for consistent iteration
  Object.keys(streamExpectedSubjectsMap).forEach(stream => {
    streamExpectedSubjectsMap[stream] = Array.from(streamExpectedSubjectsMap[stream]).sort();
  });

  // 🆕 Identify cross-stream subject discrepancies (where a stream is missing a subject others have)
  const streamDiscrepancies = calculateStreamDiscrepancies(streamExpectedSubjectsMap, allSubjectsInGrade);

  // Discover all streams available in this dataset
  allRaw.forEach(m => { if (m.stream) streamsSet.add(m.stream); });

  // 🆕 Ensure streams that haven't submitted any marks yet still appear in the filter
  if (roster && Array.isArray(roster)) {
    // Filter roster by grade to ensure only relevant students are considered
    const currentGrade = filterGradeEl.value;
    const normalizedCurrentGrade = cbcUtils.normalizeGrade(currentGrade);
    
    roster = roster.filter(s => {
      const studentGrade = s.grade || s.enrollmentId?.grade; // Check both user.grade and enrollmentId.grade
      return cbcUtils.normalizeGrade(studentGrade) === normalizedCurrentGrade;
    });

    // Add streams from the filtered roster
    streamsSet = new Set([...streamsSet, ...roster.map(s => s.stream).filter(Boolean)]);
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
    // Only show stream filter if there's more than one stream to choose from (or if "all" is the only option)
    filterStreamEl.style.display = streamsSet.size > 1 ? "inline-block" : "none";
  }

  // Filter data based on current stream selection
  const selectedStream = filterStreamEl?.value || "all";
  const streamFilteredRaw = selectedStream === "all" ? allRaw : allRaw.filter(m => m.stream === selectedStream);
  const prevRaw = (allPrevRaw && selectedStream !== "all") ? allPrevRaw.filter(m => m.stream === selectedStream) : allPrevRaw;

  // 🆕 Apply Pathway filter for Senior/Full schools: limits roster and marks to selected pathway
  const selectedPathwayRaw = filterPathwayEl?.value || "";
  const selectedPathway = selectedPathwayRaw === 'all'
    ? 'all'
    : (window.cbcUtils?.normalizePathway?.(selectedPathwayRaw) || selectedPathwayRaw);
  let pathwayFilteredRaw = streamFilteredRaw;
  let overallPathwayFilteredRaw = allRaw;
  if (isSenior && selectedPathway && selectedPathway !== 'all') {
    try {
      const pathwayRoster = Array.isArray(roster) ? roster.filter(s => {
        const sp = window.cbcUtils?.normalizePathway?.(s.pathway || s.enrollmentId?.pathway) || String(s.pathway || s.enrollmentId?.pathway || '').trim();
        return sp === selectedPathway;
      }) : [];
      const pathwayAdms = new Set(pathwayRoster.map(s => (s.admissionNo || s.admission || (s.enrollmentId && s.enrollmentId.admissionNo) || '').toString()));
      pathwayFilteredRaw = streamFilteredRaw.filter(m => pathwayAdms.has(String(m.admissionNo)));
      overallPathwayFilteredRaw = allRaw.filter(m => pathwayAdms.has(String(m.admissionNo)));
      // Replace roster with filtered roster for downstream logic (missing/ungrouped lists)
      roster = pathwayRoster;
    } catch (e) {
      console.warn('Pathway filtering failed', e);
    }
  }

  // 🆕 Determine the current view data based on assessment selection
  const isAll = assessment === "all" || filterTermEl?.value === "all";
  const rawBase = isSenior ? pathwayFilteredRaw : streamFilteredRaw;
  const raw = isAll ? rawBase : rawBase.filter(m => String(m.assessment) === assessment);

  // --- IMPORTANT CHANGE HERE ---
  // Discover subjects *after* stream filtering, from the 'raw' data
  const subjectsSet = new Set();
  raw.forEach(m => { // Iterate over filtered raw data
    m.subjects.forEach(sub => {
      const subName = getAnalysisSubjectName(sub, isSenior);
      if (!subName || (isSenior && isExcludedSeniorSubject(subName))) return;
      subjectsSet.add(subName);
    });
  });

  // 🆕 CHANGED: Use grade-specific subject ordering instead of alphabetical
  const sortedSubjects = getSubjectOrderForGrade(Array.from(subjectsSet), filterGradeEl.value);
  // --- END IMPORTANT CHANGE ---

  const studentsMap = {};
  const subjectTotals = {};
  const subjectCounts = {};
  const missingExamsMap = {}; // 🆕 Use a map to group missed subjects by student/assessment
  const pathwayByAdmission = new Map();
  if (Array.isArray(roster)) {
    roster.forEach((student) => {
      const adm = String(student?.admissionNo || student?.admission || "").trim();
      if (!adm) return;
      const pathwayValue = window.cbcUtils?.normalizePathway?.(student.pathway || student.enrollmentId?.pathway) || String(student.pathway || student.enrollmentId?.pathway || "").trim();
      if (pathwayValue) pathwayByAdmission.set(adm, pathwayValue);
    });
  }

  const subjectEligibilityMap = buildSeniorSubjectEligibilityMap(roster, electiveAssignments);

  // Store current state for re-rendering
  currentAnalysisRawData = allRaw; // Store the unfiltered raw data
  currentIsSenior = isSenior;

  // 🆕 Calculate previous assessment means for progress indicators
  const prevSubjectMeans = {};
  const prevStudentMeans = {};
  const prevStudentSubjects = {};

  // 🆕 Improved baseline selection for Intra-Term Tracking (e.g. Mid-Term vs Opener)
  let prevBaselineData = null;
  if (assessment !== "all") {
    const currentId = parseInt(assessment);
    // 🆕 Identify which assessments the Dean has marked as academic milestones for progress tracking
    const allowedBaselines = Array.from(document.querySelectorAll('.baseline-check:checked')).map(cb => parseInt(cb.value));

    const predecessorAssessId = [...new Set(streamFilteredRaw.map(m => parseInt(m.assessment)))]
        .filter(id => id < currentId && allowedBaselines.includes(id))
        .sort((a, b) => b - a)[0]; // Get the closest previous ID in this term

    if (predecessorAssessId) {
        prevBaselineData = streamFilteredRaw.filter(m => parseInt(m.assessment) === predecessorAssessId);
    } else {
        prevBaselineData = prevRaw; // Fallback to previous term's final data
    }
  } else {
    prevBaselineData = prevRaw;
  }

  if (prevBaselineData && Array.isArray(prevBaselineData)) {
    const pStudentsMap = {}; // This will hold student-level data for previous term
    prevBaselineData.forEach(m => {
      const studentKey = m.admissionNo;
      if (!pStudentsMap[studentKey]) {
        pStudentsMap[studentKey] = { name: m.studentName, adm: m.admissionNo, assess: isAll ? "Overall" : m.assessment, subjects: {}, _sum: {}, _cnt: {}, hasAbsence: false };
      }

      m.subjects.forEach(sub => {
        const subName = getAnalysisSubjectName(sub, isSenior);
        if (!subName) return;
        if (!isSubjectEligibleForStudent(studentKey, subName, isSenior, subjectEligibilityMap)) return;

        const isX = (v) => v === null || v === undefined || String(v).trim() === "" || (typeof v === 'string' && v.trim().toUpperCase() === "X");
        const hasSeniorScore = !isX(sub.score);
        let isAbsent = isSenior
            ? !hasSeniorScore
            : isX(sub.score);

        const score = isSenior ? getSeniorSubjectScore(sub) : sub.score;
        
        if (isAbsent || score === "X") pStudentsMap[studentKey].hasAbsence = true;

        if (score !== null) {
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

    // 🆕 Process "Clean" students for Previous Term baseline
    const pSubjectTotals = {};
    const pSubjectCounts = {};
    
    Object.values(pStudentsMap).forEach(s => {
      prevStudentSubjects[s.adm] = { ...s.subjects };
        if (s.hasAbsence) return; // Skip absent students for a fair baseline

        const rawScores = Object.values(s.subjects);
        const validScores = rawScores.filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v) && v !== "X" && v !== "x").map(Number);
        const mean = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;

       // 🆕 Accumulate for Subject Means using only qualified (clean) students
        Object.entries(s.subjects).forEach(([subName, score]) => {
            if (score !== null && score !== undefined && score !== "X") {
                pSubjectTotals[subName] = (pSubjectTotals[subName] || 0) + Number(score);
                pSubjectCounts[subName] = (pSubjectCounts[subName] || 0) + 1;
            }
        });
        
        const studentKey = s.adm;
        prevStudentMeans[studentKey] = mean;
    });

    // Finalize previous subject means
    Object.keys(pSubjectCounts).forEach(sub => {
      prevSubjectMeans[sub] = pSubjectTotals[sub] / pSubjectCounts[sub];
    });
  }

  // Show results area
  analysisSection.style.display = "block";
  
  // Calculate statistics for all cases (even All Assessments)
  raw.forEach(m => {
    // Group by admission number if "All" is selected to show overall means
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    if (!studentsMap[key]) {
      const pathwayValue = pathwayByAdmission.get(String(m.admissionNo)) || window.cbcUtils?.normalizePathway?.(m.pathway || "") || String(m.pathway || "").trim();
      studentsMap[key] = { 
        name: m.studentName, 
        adm: m.admissionNo, 
        grade: m.grade,
        stream: m.stream || "Unassigned", // Fix: Retain stream for grouped analysis
        pathway: pathwayValue || undefined,
        assess: isAll ? "Overall" : (m.assessment || "N/A"), 
        subjects: {}, _sum: {}, _cnt: {},
        hasAbsence: false
      };
    }

    m.subjects.forEach(sub => { // Iterate over subjects
      const subName = getAnalysisSubjectName(sub, isSenior);
      if (!subName || (isSenior && isExcludedSeniorSubject(subName))) return;
      
      // Robust missing/absent detection (catches null, undefined, empty, or "X")
      const isX = (v) => v === null || v === undefined || String(v).trim() === "" || (typeof v === 'string' && v.trim().toUpperCase() === "X");
      const hasSeniorScore = !isX(sub.score);
      let isAbsent = isSenior
        ? !hasSeniorScore
        : (isX(sub.score) || sub.score === 0);
      
      const score = isSenior ? getSeniorSubjectScore(sub) : sub.score;

      // Robust absence flag setting
      const isExplicitlyAbsent = isAbsent || score === null || score === undefined || (typeof score === 'string' && score.trim().toUpperCase() === "X");
      if (isExplicitlyAbsent) {
        studentsMap[key].hasAbsence = true;
      }
      
      if (score !== undefined) {

        if (!isAll || studentsMap[key].subjects[subName] === undefined) { // Assign score if not already assigned
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
  // A student is marked as having an absence if they are missing a score (or have an 'X') for any subject they *were expected to take*.
  Object.values(studentsMap).forEach(s => {
    let subjectsToValidateAgainst = [];

    if (isSenior) {
      const eligibility = subjectEligibilityMap.get(String(s.adm)) || subjectEligibilityMap.get(String(s.adm || ""));
      const submittedSubjects = Object.keys(s.subjects || {});
      const expectedSet = new Set();
      if (eligibility) Array.from(eligibility).forEach(sub => expectedSet.add(sub));
      submittedSubjects.forEach(sub => expectedSet.add(sub));
      subjectsToValidateAgainst = Array.from(expectedSet);
    } else if (selectedStream === "all") {
      // When viewing all streams, validate against subjects expected for the student's *own* stream
      subjectsToValidateAgainst = streamExpectedSubjectsMap[s.stream || "Unassigned"] || [];
    } 
    else { // If a specific stream is selected
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

        // Group markers into the missing exams map (for the missing exams table)
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
          missingExamsMap[studentAssessKey].subjects.push(subName); // Add missing subject
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

  // 🆕 THIRD PASS: Calculate current subject means excluding disqualified learners.
  raw.forEach(m => {
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    const student = studentsMap[key];
    
    // Only process scores for students who are NOT disqualified
    if (student && !student.hasAbsence) {
      m.subjects.forEach(sub => {
        const subName = getAnalysisSubjectName(sub, isSenior);
        if (!subName || (isSenior && isExcludedSeniorSubject(subName))) return;

        const score = isSenior ? getSeniorSubjectScore(sub) : sub.score;
        const scoreStr = String(score).trim().toUpperCase();
        
        if (score !== "" && score !== null && !isNaN(score) && scoreStr !== "X") {
          const numScore = Number(score);
          const termNum = m.term;
          
          subjectTotals[subName] = (subjectTotals[subName] || 0) + numScore;
          subjectCounts[subName] = (subjectCounts[subName] || 0) + 1;
        }
      });
    }
  });

  // 🆕 IDENTIFY UNGRADED LEARNERS: Compare roster against marks fetched
  // This finds students who have NO record at all for the current filtered context
  let filteredRoster = roster;
  if (selectedStream !== "all") { filteredRoster = roster.filter(s => s.stream === selectedStream); } // Filter roster by selected stream
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
    .filter(s => !s.hasAbsence) // Only include students without absences for ranking
    .filter(s => !s.hasAbsence || assessment === "all") // 🆕 Allow 'All' view to show partials without disqualifying
    .map(s => {
    const rawScores = Object.values(s.subjects);
    // Filter out non-numeric scores (like "X") for student total and mean calculation (for ranking)
    const validScores = rawScores.filter(v => v !== null && v !== undefined && v !== "" && !isNaN(v) && v !== "X" && v !== "x").map(Number);
    const total = validScores.reduce((a, b) => a + b, 0);
    const mean = validScores.length ? total / validScores.length : 0;
    const points = rawScores.reduce((sum, sc) => sum + window.cbcUtils.getPoints(sc, s.grade), 0);

    const pMean = prevStudentMeans[s.adm];
    const progress = (pMean !== undefined && pMean > 0) ? (mean - pMean) : null;

    return {
      ...s,
      total,
      mean,
      points,
      progress,
      previousSubjects: prevStudentSubjects[s.adm] || {}
    }; // Return student object with calculated stats
  }).sort((a, b) => b.mean - a.mean);

  lastProcessedStudents = studentArray; // 🆕 Store for bulk reports
  lastProcessedSubjects = sortedSubjects; // 🆕 Store for bulk reports
  updateReportsActionState();

  // Update SMS Tab UI
  if (smsBroadcastUI) smsBroadcastUI.style.display = "block";
  if (smsPlaceholder) smsPlaceholder.style.display = "none";
  if (smsTargetText) {
    const mapping = window.ASSESSMENT_MAPPING || {};
    const assessLabel = mapping[assessment] || `Assessment ${assessment}`;
    smsTargetText.innerHTML = `Ready to broadcast <strong>${assessLabel}</strong> results for <strong>${filterGradeEl.value}</strong>.`;
  }
  updateDeanSmsBalance();

  // Convert map to list and sort missing list by name // Convert map to list and sort
  const missingExamsList = Object.values(missingExamsMap);
  missingExamsList.sort((a, b) => a.name.localeCompare(b.name));

  lazyWidgetCache.missingExams = { missingExamsList, streamDiscrepancies };
  if (document.getElementById("missingExamsTab")?.classList.contains("active")) {
    renderLazyMissingExamsWidget();
  }

  const overallRankRaw = isAll ? overallPathwayFilteredRaw : overallPathwayFilteredRaw.filter(m => String(m.assessment) === assessment);
  const overallRankStudentMap = {};
  const overallExpectedSubjectsByStream = {};

  overallRankRaw.forEach((m) => {
    const stream = m.stream || "Unassigned";
    if (!overallExpectedSubjectsByStream[stream]) overallExpectedSubjectsByStream[stream] = new Set();
    m.subjects.forEach((sub) => {
      const subName = getAnalysisSubjectName(sub, isSenior);
      if (subName && !(isSenior && isExcludedSeniorSubject(subName))) {
        overallExpectedSubjectsByStream[stream].add(subName);
      }
    });
  });

  overallRankRaw.forEach((m) => {
    const key = isAll ? m.admissionNo : `${m.admissionNo}_${m.assessment}`;
    if (!overallRankStudentMap[key]) {
      overallRankStudentMap[key] = {
        adm: m.admissionNo,
        name: m.studentName,
        grade: m.grade,
        stream: m.stream || "Unassigned",
        subjects: {},
        hasAbsence: false
      };
    }

    m.subjects.forEach((sub) => {
      const subName = getAnalysisSubjectName(sub, isSenior);
      if (!subName || (isSenior && isExcludedSeniorSubject(subName))) return;
      if (isSenior && !isSubjectEligibleForStudent(m.admissionNo, subName, isSenior, subjectEligibilityMap)) return;

      const score = isSenior ? getSeniorSubjectScore(sub) : sub.score;
      const isMissing = score === undefined || score === null || score === "" || (typeof score === "string" && score.trim().toUpperCase() === "X");
      if (isMissing) {
        overallRankStudentMap[key].hasAbsence = true;
      }

      if (score !== undefined && score !== null && score !== "" && !isNaN(score) && score !== "X" && score !== "x") {
        if (overallRankStudentMap[key].subjects[subName] === undefined) {
          overallRankStudentMap[key].subjects[subName] = Number(score);
        }
      }
    });
  });

  Object.values(overallRankStudentMap).forEach((s) => {
    const expectedSubjects = [];
    if (isSenior) {
      const eligibility = subjectEligibilityMap.get(String(s.adm)) || subjectEligibilityMap.get(String(s.adm || ""));
      if (eligibility) Array.from(eligibility).forEach(sub => expectedSubjects.push(sub));
      Object.keys(s.subjects || {}).forEach(sub => {
        if (!expectedSubjects.includes(sub)) expectedSubjects.push(sub);
      });
    } else {
      expectedSubjects.push(...Array.from(overallExpectedSubjectsByStream[s.stream || "Unassigned"] || []));
    }

    expectedSubjects.forEach(subName => {
      const score = s.subjects[subName];
      const isMissing = score === undefined || score === null || (typeof score === "string" && score.trim().toUpperCase() === "X");
      if (isMissing) {
        s.hasAbsence = true;
      }
    });
  });

  const overallCompleteStudents = Object.values(overallRankStudentMap)
    .filter(s => !s.hasAbsence)
    .map((s) => {
      const rawScores = Object.values(s.subjects);
      const validScores = rawScores.filter((v) => v !== null && v !== undefined && v !== "" && !isNaN(v) && v !== "X" && v !== "x").map(Number);
      const total = validScores.reduce((a, b) => a + b, 0);
      const mean = validScores.length ? total / validScores.length : 0;
      return { ...s, total, mean };
    })
    .sort((a, b) => b.mean - a.mean);

  lastCompleteGradeStudents = overallCompleteStudents;

  let prevOverallMean = null;
  let prevOverallRank = 0;
  overallCompleteStudents.forEach((s, idx) => {
    const currentMean = parseFloat(s.mean.toFixed(2));
    if (currentMean === prevOverallMean) {
      s.overallRank = prevOverallRank;
    } else {
      s.overallRank = idx + 1;
      prevOverallRank = s.overallRank;
    }
    s.overallRankTotal = overallCompleteStudents.length;
    prevOverallMean = currentMean;
  });

  const overallRankMap = Object.fromEntries(overallCompleteStudents.map((s) => [String(s.adm), s]));
  studentArray.forEach((s) => {
    const match = overallRankMap[String(s.adm)];
    if (match) {
      s.overallRank = match.overallRank;
      s.overallRankTotal = match.overallRankTotal;
      s.rank = match.overallRank;
      s.rankTotal = match.rankTotal;
    }
  });

  // Calculate stream ranks using the same ranking logic
  const streamGroups = {};
  studentArray.forEach((s) => {
    const streamKey = String(s.stream || "Unassigned");
    if (!streamGroups[streamKey]) streamGroups[streamKey] = [];
    streamGroups[streamKey].push(s);
  });

  Object.values(streamGroups).forEach((streamStudents) => {
    streamStudents.sort((a, b) => b.mean - a.mean);

    let prevStreamMean = null;
    let prevStreamRank = 0;
    streamStudents.forEach((s, idx) => {
      const currentMean = parseFloat(s.mean.toFixed(2));
      if (currentMean === prevStreamMean) {
        s.streamRank = prevStreamRank;
      } else {
        s.streamRank = idx + 1;
        prevStreamRank = s.streamRank;
      }
      prevStreamMean = currentMean;
      s.streamTotal = streamStudents.length;
    });
  });

  studentArray.forEach((s) => {
    if (selectedStream !== "all") {
      s.displayRank = s.streamRank ?? s.overallRank ?? s.rank;
      s.displayRankTotal = s.streamTotal ?? s.overallRankTotal ?? s.rankTotal;
    } else {
      s.displayRank = s.overallRank ?? s.rank;
      s.displayRankTotal = s.overallRankTotal ?? s.rankTotal;
    }
  });

  lastProcessedStudents = studentArray; // 🆕 Store for bulk reports after ranks are assigned
  lastProcessedSubjects = sortedSubjects; // 🆕 Store for bulk reports
  updateReportsActionState();

  // Identify top and lowest learners, handling ties
  const topMeanScore = studentArray.length > 0 ? studentArray[0].mean : -1;
  const topLearners = studentArray.filter(s => s.mean === topMeanScore);
  const topLearnerNames = topLearners.map(s => `${s.name} (${s.mean.toFixed(2)}%)`).join(', ');

  const lowMeanScore = studentArray.length > 0 ? studentArray[studentArray.length - 1].mean : -1;
  const lowLearners = studentArray.filter(s => s.mean === lowMeanScore);
  const lowLearnerNames = lowLearners.map(s => `${s.name} (${s.mean.toFixed(2)}%)`).join(', ');

  // Group subject data for summary stats and identify top/low subjects with ties
  const subjectList = sortedSubjects.map(s => ({ // Map subjects to objects with mean and count
    name: s,
    mean: Number((subjectTotals[s] / subjectCounts[s]).toFixed(2)),
    count: subjectCounts[s]
  })).sort((a, b) => b.mean - a.mean);

  const topSubjectNames = subjectList.length > 0 ? subjectList.filter(s => s.mean === subjectList[0].mean).map(s => `${s.name} (${s.mean.toFixed(2)}%)`).join(', ') : "-";
  const lowSubjectNames = subjectList.length > 0 ? subjectList.filter(s => s.mean === subjectList[subjectList.length - 1].mean).map(s => `${s.name} (${s.mean.toFixed(2)}%)`).join(', ') : "-";

  // Stats
  setText(classMeanEl, (studentArray.reduce((a, s) => a + s.mean, 0) / (studentArray.length || 1)).toFixed(2));
  setText(topLearnerEl, studentArray.length ? topLearnerNames : "-");
  setText(lowLearnerEl, studentArray.length ? lowLearnerNames : "-"); // Set lowest learner
  setText(topSubjectEl, topSubjectNames);
  setText(lowSubjectEl, lowSubjectNames);
  setText(recordsCountEl, studentArray.length);

  // Calculate Pass Rate (students with mean score >= 50%)
  let passCount = 0;
  studentArray.forEach(s => {
    if (s.mean >= 50) { // 🆕 Standardized to 50% for consistency with analysis.js
      passCount++;
    }
  });
  const passRate = studentArray.length > 0 ? (passCount / studentArray.length * 100).toFixed(1) : 0;
  setText(passRateEl, `${passRate}%`);
  
  // Tables
  renderRankingTable(studentArray, sortedSubjects, isSenior, selectedStream);
  renderSubjectStats(sortedSubjects, subjectTotals, subjectCounts, prevSubjectMeans, isSenior);
  renderMissingExamsTable(missingExamsList, streamDiscrepancies); // 🆕 Call renderer for missing exams
}

/**
 * 🆕 Calculates stream-level subject discrepancies.
 * @param {Object} streamExpectedSubjectsMap - Map of stream to expected subjects.
 * @param {Set} allSubjectsInGrade - Set of all unique subjects in the grade.
 * @returns {Array} List of discrepancies.
 */
function calculateStreamDiscrepancies(streamExpectedSubjectsMap, allSubjectsInGrade) {
  const discrepancies = [];
  Object.entries(streamExpectedSubjectsMap).forEach(([stream, subjects]) => {
    const missingInStream = Array.from(allSubjectsInGrade).filter(s => !subjects.includes(s));
    if (missingInStream.length > 0) discrepancies.push({ stream, missingSubjects: missingInStream });
  });
  return discrepancies;
}

function renderRankingTable(students, subjects, isSenior, selectedStream = "all") {
  // Identify tied ranks using the display rank shown in the table
  const rankCounts = {};
  students.forEach(s => {
    const rankValue = s.displayRank ?? s.rank;
    rankCounts[rankValue] = (rankCounts[rankValue] || 0) + 1;
  });

  // const classMean = students.length ? students.reduce((acc, s) => acc + (s.mean || 0), 0) / students.length : 0; // Not used here

  if (rankingExtras) {
    rankingExtras.innerHTML = '';
    rankingExtras.style.display = 'none';
  }

  const totalHeader = !isSenior ? '<th class="total-column-header">Total</th>' : '';
  const rankLabel = selectedStream && selectedStream !== "all" ? "Stream Rank" : "Overall Rank";
  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>${rankLabel}</th><th>Name</th><th>Adm</th>${subjects.map(s => `<th>${s} <small style="display:block; font-size:0.6rem; font-weight:normal; opacity:0.7;">(Score & Pts)</small></th>`).join("")}${totalHeader}<th>Mean</th><th>Progress</th><th>Total Points</th><th>Level</th></tr></thead>
    <tbody>`;
  
  students.forEach((s, idx) => {
    const rankValue = s.displayRank ?? s.rank;
    const isTied = rankCounts[rankValue] > 1;
    const tiedClass = isTied ? ' class="tied-rank"' : '';
    const totalCell = !isSenior ? `<td>${s.total}</td>` : ''; // Total column for junior school

    let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
    if (s.progress !== null) {
      const diff = s.progress;
      if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;"><i class="fas fa-arrow-up"></i> +${diff.toFixed(1)}</span>`;
      else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;"><i class="fas fa-arrow-down"></i> ${diff.toFixed(1)}</span>`;
      else progressHtml = `<span style="color:#3498db; font-size:0.8rem;"><i class="fas fa-minus"></i></span>`;
    }
    // Store progress value in a data attribute for PDF generation (used in PDF export)
    html += `<tr${tiedClass} data-progress="${s.progress !== null ? s.progress : ''}">
      <td>${rankValue}</td><td>${s.name}</td><td>${s.adm}</td>
      ${subjects.map(sub => {
        const score = s.subjects[sub];
        const isAbs = score === undefined || score === null || String(score).toUpperCase() === "X";
        if (isAbs) {
          return `<td><span style="color:#64748b; font-weight:700; font-size:0.95rem;">-</span></td>`;
        }
        const pts = window.cbcUtils.getPoints(Number(score), s.grade);
        return `<td>${score} <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">(${pts})</span></td>`;
      }).join("")}
      ${totalCell}
      <td>${s.mean.toFixed(2)}%</td>
      <td>${progressHtml}</td>
      <td>${s.points}</td><td>${window.cbcUtils.getSubdivision(s.mean, s.grade)}</td>
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
    html += `<td style="text-align: center; padding: 8px;">${subSum.toFixed(0)}</td>`; // Subject total
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
    const subCount = students.filter(s => s.subjects[sub] !== undefined && s.subjects[sub] !== null).length || 1; // Count for subject mean
    html += `<td style="text-align: center; padding: 8px;">${(subSum / subCount).toFixed(2)}</td>`;
  });
  if (!isSenior) {
    html += `<td style="text-align: center; padding: 8px;">${(groupTotalMarks / groupCount).toFixed(2)}</td>`;
  }
  html += `<td style="text-align: center; padding: 8px;">${(groupMeanSum / groupCount).toFixed(2)}%</td>`;
  html += `<td></td>`; // Progress column
  html += `<td style="text-align: center; padding: 8px;">${(groupTotalPoints / groupCount).toFixed(2)}</td>`;
  html += `<td style="text-align: center; padding: 8px; color: #1a237e;">${window.cbcUtils.getSubdivision(groupMeanSum / groupCount, students[0]?.grade)}</td>`;
  html += `</tr></tfoot></table>`;
  rankingTableWrap.innerHTML = html;
}

function drawDeanPdfHeader(doc, { schoolName, subheader, pageWidth, logoBase64, logoProps, logoFormat, logoWidth = 32, maxLogoHeight = 32, startY = 8 }) {
  let yPos = startY;

  if (logoBase64) {
    try {
      const imgProps = logoProps || doc.getImageProperties(logoBase64);
      const format = logoFormat || cbcUtils.getImageFormat(logoBase64);
      let imgWidth = logoWidth;
      let imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      if (imgHeight > maxLogoHeight) {
        const scale = maxLogoHeight / imgHeight;
        imgHeight = maxLogoHeight;
        imgWidth = imgWidth * scale;
      }
      doc.addImage(logoBase64, format, (pageWidth - imgWidth) / 2, yPos, imgWidth, imgHeight, undefined, 'FAST');
      yPos += imgHeight + 4;
    } catch (e) {
      console.warn("Could not embed school logo in PDF:", e);
    }
  }

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizePdfText(schoolName), pageWidth / 2, yPos, { align: "center" });
  yPos += 6;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  if (subheader) {
    doc.text(sanitizePdfText(subheader), pageWidth / 2, yPos, { align: "center" });
    yPos += 8;
  }

  return yPos;
}

async function downloadRankingAsPDF() {
  const table = rankingTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  if (window.spinner) {
    window.spinner.show(printReportBtn, "Generating PDF...");
  }

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 50)); // Shorter delay

  const schoolName = sanitizePdfText(deanProfileData?.schoolName || "SCHOOL NAME");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const grade = sanitizePdfText(filterGradeEl.value);
  const isPrimary = cbcUtils.isPrimaryGrade(grade);
  const termVal = sanitizePdfText(filterTermEl.value);
  const termLabel = termVal === "all" ? "Full Year" : `Term ${termVal}`;
  const year = sanitizePdfText(filterYearEl.value);
  const assessLabel = sanitizePdfText(filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report");
  const selectedStream = sanitizePdfText(filterStreamEl?.value || "all");
  const streamInfo = selectedStream !== "all" ? ` | Stream: ${selectedStream}` : "";
  const passRate = document.getElementById("passRate")?.textContent || "N/A"; // Retrieve pass rate from UI

  let yPos = drawDeanPdfHeader(doc, {
    schoolName,
    subheader: `${year} | ${termLabel} | ${assessLabel}${streamInfo}`,
    pageWidth,
    logoBase64: deanProfileData?.schoolLogoBase64,
    logoProps: deanProfileData?.logoProps,
    logoFormat: deanProfileData?.logoFormat,
    logoWidth: 32,
    startY: 8
  });

  try {
  // 3. Title Line
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizePdfText(`CLASS GRADING REPORT: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`), 14, yPos);
  yPos += 6; // Spacing after title

  // 🆕 Add Pass Rate
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(sanitizePdfText(`Pass Rate: ${passRate}`), 14, yPos);
  yPos += 2; // Reduced spacing before the table begins

  // OPTIMIZATION: Extract column mapping once to avoid repeated indexOf lookups
  const rawHeaders = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
  // 🆕 Support both Primary/Junior ("Name", "Adm") and Senior ("Student Name", "Admission No") labels
  const nameIdx = rawHeaders.findIndex(h => h.toLowerCase().includes("name"));
  const admIdx = rawHeaders.findIndex(h => h.toLowerCase().includes("adm"));
  const progressIdx = rawHeaders.indexOf("Progress"); // Index of the progress column
  const levelIdx = rawHeaders.length - 1;
  const rankHeaderIndex = rawHeaders.findIndex(h => /rank/i.test(h));
  const isStreamFilter = selectedStream !== "all";
  const nameLabelForProgress = nameIdx !== -1 ? rawHeaders[nameIdx] : "Name";

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

  const headers = [];
  rawHeaders.forEach((header, idx) => {
    if (skipIndices.has(idx)) return;
    if (idx === rankHeaderIndex) {
      if (isStreamFilter) {
        headers.push("Overall Rank", "Stream Rank");
      } else {
        headers.push(header);
      }
    } else {
      headers.push(header);
    }
  });

  // Single-pass row processing: Extract data, level counts, and metadata
  const tiedRowIndices = [];
  const significantDropRowIndices = [];
  const SIGNIFICANT_DROP_THRESHOLD = -5;
  const levelCounts = cbcUtils.isPrimaryGrade(grade) 
    ? { EE: 0, ME: 0, AE: 0, BE: 0 } 
    : { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 };

  const rows = tbodyRows.map((tr, rowIdx) => {
    const cells = Array.from(tr.querySelectorAll("td"));
    
    // Metadata for styling
    if (tr.classList.contains("tied-rank")) tiedRowIndices.push(rowIdx); // Check for tied ranks
    const progVal = parseFloat(tr.dataset.progress);
    if (!isNaN(progVal) && progVal < SIGNIFICANT_DROP_THRESHOLD) significantDropRowIndices.push(rowIdx);

    // Count levels for summary while iterating
    const levelStr = cells[levelIdx]?.textContent.trim();
    if (levelCounts[levelStr] !== undefined) levelCounts[levelStr]++;

    const filteredCells = [];
    cells.forEach((td, colIdx) => {
      if (skipIndices.has(colIdx)) return;
      if (colIdx === rankHeaderIndex) {
        const student = lastProcessedStudents[rowIdx] || {};
        if (isStreamFilter) {
          const overallRankValue = student.overallRank ?? student.rank ?? '-';
          const streamRankValue = student.streamRank ?? '-';
          filteredCells.push(overallRankValue, streamRankValue);
        } else {
          const displayRankValue = student.displayRank ?? student.overallRank ?? student.rank ?? '-';
          filteredCells.push(displayRankValue);
        }
      } else {
        filteredCells.push(td.textContent.trim());
      }
    });

    return filteredCells;
  });

  const specialHeaderNames = new Set(["Overall Rank", "Stream Rank", "Rank", "Name", "Student Name", "Adm", "Admission No", "Total", "Mean", "Progress", "Total Points", "Level"]);
  const subjectColumns = headers.reduce((acc, header, idx) => {
    if (!specialHeaderNames.has(header)) acc.push({ idx, header });
    return acc;
  }, []);

  const groupCount = lastProcessedStudents?.length || 1;
  const groupTotalMarks = (lastProcessedStudents || []).reduce((acc, s) => acc + (s.total || 0), 0);
  const groupTotalPoints = (lastProcessedStudents || []).reduce((acc, s) => acc + (s.points || 0), 0);
  const groupMeanSum = (lastProcessedStudents || []).reduce((acc, s) => acc + (s.mean || 0), 0);

  const buildFooterRow = (label, type) => {
    const row = [];
    const prefixSpan = headers.findIndex(header => !specialHeaderNames.has(header));
    const labelSpan = prefixSpan >= 0 ? prefixSpan : 1;
    row.push({ content: label, colSpan: Math.max(1, labelSpan) });

    subjectColumns.forEach((subjectCol, subjectIndex) => {
      const subjectName = lastProcessedSubjects?.[subjectIndex] || subjectCol.header;
      const subjectSum = (lastProcessedStudents || []).reduce((acc, s) => acc + (Number(s.subjects?.[subjectName]) || 0), 0);
      const subjectCount = (lastProcessedStudents || []).filter(s => s.subjects?.[subjectName] !== undefined && s.subjects?.[subjectName] !== null && s.subjects?.[subjectName] !== "" && s.subjects?.[subjectName] !== "X" && s.subjects?.[subjectName] !== "x").length || 1;
      const value = type === "total"
        ? subjectSum.toFixed(0)
        : (subjectSum / subjectCount).toFixed(2);
      row.push(value);
    });

    const totalColIndex = headers.indexOf("Total");
    if (totalColIndex !== -1) {
      row.push(type === "total" ? groupTotalMarks.toFixed(0) : (groupTotalMarks / groupCount).toFixed(2));
    }

    const meanColIndex = headers.indexOf("Mean");
    if (meanColIndex !== -1) {
      row.push(type === "total" ? "" : `${(groupMeanSum / groupCount).toFixed(2)}%`);
    }

    const progressColIndex = headers.indexOf("Progress");
    if (progressColIndex !== -1) {
      row.push("");
    }

    const pointsColIndex = headers.indexOf("Total Points");
    if (pointsColIndex !== -1) {
      row.push(type === "total" ? groupTotalPoints.toFixed(0) : (groupTotalPoints / groupCount).toFixed(2));
    }

    const levelColIndex = headers.indexOf("Level");
    if (levelColIndex !== -1) {
      row.push(type === "total" ? "" : window.cbcUtils.getSubdivision(groupMeanSum / groupCount, grade));
    }

    return row;
  };

  const foot = [buildFooterRow("TOTAL:", "total"), buildFooterRow("MEAN:", "mean")];

  const streamRankColIndex = headers.indexOf("Stream Rank");
  const progressColIndex = headers.indexOf("Progress");
  doc.autoTable({ 
    startY: yPos, // Use the updated yPos
    head: [headers], 
    body: rows, 
    foot: foot || [],
    theme: 'grid', // Use 'grid' theme for borders
    styles: { fontSize: 8, lineWidth: 0.2, lineColor: [0, 0, 0] }, // Darker lines
    headStyles: { fillColor: [52, 152, 219] },
    footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' },
    showHead: 'everyPage', // Repeat table headers on every page
    showFoot: 'lastPage', // Only show totals/mean at the end of the ranking list
    rowPageBreak: 'avoid', // 🆕 Prevents a single student row from being split across two pages
    columnStyles: streamRankColIndex !== -1 ? {
      [streamRankColIndex]: {
        fillColor: [235, 245, 255],
        textColor: [17, 77, 115],
        fontStyle: 'bold',
        halign: 'center'
      }
    } : {},
    margin: { left: 14, right: 14, bottom: 35 }, // 🆕 Leaves space for the signature and footer
    didParseCell: (data) => {
      if (data.section === 'body') {
        // Make student name bold
        const nameColumnIndex = headers.indexOf("Name");
        if (nameColumnIndex !== -1 && data.column.index === nameColumnIndex) {
          data.cell.styles.fontStyle = 'bold';
        }
        if (streamRankColIndex !== -1 && data.column.index === streamRankColIndex) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [17, 77, 115];
        }
        if (progressColIndex !== -1 && data.column.index === progressColIndex) {
          const progressValue = parseFloat(String(data.cell.raw).replace(/[^0-9+.-]/g, ''));
          if (!Number.isNaN(progressValue)) {
            data.cell.styles.textColor = progressValue > 0
              ? [22, 163, 74]
              : progressValue < 0
                ? [220, 38, 38]
                : [71, 85, 105];
            data.cell.styles.fontStyle = 'bold';
          }
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
  }); // AutoTable for ranking

  // 4. Summary Section with Multi-page Safety
  let summaryStartY = doc.lastAutoTable.finalY + 10;
  // A4 Landscape height is ~210mm. Ensure summary area (approx 50mm) has enough remaining space.
  if (summaryStartY > pageHeight - 65) {
    doc.addPage();
    summaryStartY = 20;
  } // Add new page if summary overlaps footer

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("REPORT SUMMARY", 14, summaryStartY);
  summaryStartY += 6;

  // 1. Level Distribution (Left Side)
  doc.setFontSize(9);
  doc.text("Level Distribution", 14, summaryStartY); // Level distribution title

  doc.autoTable({
    startY: summaryStartY + 3,
    head: [['Level', 'Count']],
    body: Object.entries(levelCounts).map(([lvl, count]) => [lvl, count]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.2, lineWidth: 0.1, lineColor: [80, 80, 80] },
    headStyles: { fillColor: [52, 152, 219], halign: 'center' },
    columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'center' } },
    tableWidth: 32,
    margin: { left: 14 }
  });

  // 2. Performance Key (Right Side - Compact)
  const keyX = 14 + 32 + 12; // Start after margin + distribution table width + gap
  doc.setFontSize(9);
  doc.text("Performance Key", keyX, summaryStartY); // Performance key title

  doc.autoTable({ 
    startY: summaryStartY + 3,
    head: [['Level', 'Range', 'Pts']], 
    body: cbcUtils.getPerformanceKey(grade).map(item => [item.subdivision, item.range, item.points.toString()]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.2, lineWidth: 0.1, lineColor: [80, 80, 80] },
    headStyles: { fillColor: [44, 62, 80], halign: 'center' },
    columnStyles: { 0: { halign: 'center', fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
    tableWidth: 48,
    margin: { left: keyX }
  });

  // --- ADD PAGE NUMBERS & SYSTEM FOOTER TO ALL PAGES ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // 🆕 Watermark (School Logo) - Rendered last to ensure it stays on top of table backgrounds
    if (deanProfileData?.schoolLogoBase64) {
      try {
        const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
        const format = deanProfileData.logoFormat || "PNG";
        const width = 100; 
        const height = (imgProps.height * width) / imgProps.width;
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
        doc.restoreGraphicsState();
      } catch (e) { console.warn("Watermark rendering error:", e); }
    }

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 7);
    const genText = "CompetenceHub Analytics";
    const genTextWidth = doc.getTextWidth(genText);
    doc.text(genText, (pageWidth / 2) - (genTextWidth / 2), pageHeight - 7);
  }

  // 🆕 Add Most Improved & Most Dropped Students on a separate page (for internal zone analysis)
  const progressData = rows
    .map((row, idx) => ({
      name: row[headers.indexOf(nameLabelForProgress)],
      progress: parseFloat(tbodyRows[idx].dataset.progress)
    }))
    .filter(s => !isNaN(s.progress));

  const improvedStudents = progressData
    .filter(s => s.progress > 0)
    .sort((a, b) => b.progress - a.progress).slice(0, 3);

  const droppedStudents = progressData
    .filter(s => s.progress < 0)
    .sort((a, b) => a.progress - b.progress).slice(0, 3);

  // Only add a new page if there's data to display
  if (improvedStudents.length > 0 || droppedStudents.length > 0) {
    doc.addPage();
    let zoneAnalysisY = 20;

    // Page header for zone analysis
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("INTERNAL USE ONLY", 14, zoneAnalysisY);
    zoneAnalysisY += 8;

    // If both tables exist, render side-by-side
    if (improvedStudents.length > 0 && droppedStudents.length > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Top 3 Most Improved Learners", 14, zoneAnalysisY);
      doc.autoTable({
        startY: zoneAnalysisY + 3,
        head: [['Rank', 'Name', 'Progress']],
        body: improvedStudents.map((s, i) => [`#${i + 1}`, s.name, `+${s.progress.toFixed(1)}%`]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        headStyles: { fillColor: [16, 185, 129], halign: 'center' },
        tableWidth: 80,
        margin: { left: 14 }
      });

      const dropX = 14 + 80 + 10;
      doc.setFont("helvetica", "bold");
      doc.text("Top 3 Significant Drops", dropX, zoneAnalysisY);
      doc.autoTable({
        startY: zoneAnalysisY + 3,
        head: [['Rank', 'Name', 'Drop']],
        body: droppedStudents.map((s, i) => [`#${i + 1}`, s.name, `${s.progress.toFixed(1)}%`]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        headStyles: { fillColor: [239, 68, 68], halign: 'center' },
        tableWidth: 80,
        margin: { left: dropX }
      });
    } else if (improvedStudents.length > 0) {
      // Only improved students
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Top 3 Most Improved Learners", 14, zoneAnalysisY);
      doc.autoTable({
        startY: zoneAnalysisY + 3,
        head: [['Rank', 'Name', 'Progress']],
        body: improvedStudents.map((s, i) => [`#${i + 1}`, s.name, `+${s.progress.toFixed(1)}%`]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        headStyles: { fillColor: [16, 185, 129], halign: 'center' },
        tableWidth: 80,
        margin: { left: 14 }
      });
    } else if (droppedStudents.length > 0) {
      // Only dropped students
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Top 3 Significant Drops", 14, zoneAnalysisY);
      doc.autoTable({
        startY: zoneAnalysisY + 3,
        head: [['Rank', 'Name', 'Drop']],
        body: droppedStudents.map((s, i) => [`#${i + 1}`, s.name, `${s.progress.toFixed(1)}%`]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.2 },
        headStyles: { fillColor: [239, 68, 68], halign: 'center' },
        tableWidth: 80,
        margin: { left: 14 }
      });
    }

    // Add page numbers to the new zone analysis page
    const updatedTotalPages = doc.internal.getNumberOfPages();
    doc.setPage(updatedTotalPages);

    if (deanProfileData?.schoolLogoBase64) {
      try {
        const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
        const format = deanProfileData.logoFormat || "PNG";
        const width = 100; 
        const height = (imgProps.height * width) / imgProps.width;
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
        doc.restoreGraphicsState();
      } catch (e) { console.warn("Watermark rendering error:", e); }
    }

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${updatedTotalPages} of ${updatedTotalPages}`, 14, pageHeight - 7);
    const genText = "CompetenceHub Analytics";
    const genTextWidth = doc.getTextWidth(genText);
    doc.text(genText, (pageWidth / 2) - (genTextWidth / 2), pageHeight - 7);
  }

  // 🆕 Draw Dean's signature on the actual last page (which may be zone analysis or ranking summary)
  const finalTotalPages = doc.internal.getNumberOfPages();
  doc.setPage(finalTotalPages); // Set to the last page
  let footerY = pageHeight - 25;

  // Dean's digital signature image
  if (deanProfileData && deanProfileData.signatureBase64) {
    try {
      const sigFormat = deanProfileData.sigFormat || cbcUtils.getImageFormat(deanProfileData.signatureBase64);
      doc.addImage(deanProfileData.signatureBase64, sigFormat, pageWidth - 54, footerY - 8, 40, 8, undefined, 'FAST');
    } catch (e) { console.warn("Signature error:", e); }
  }

  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("__________________________", pageWidth - 14, footerY, { align: "right" });
  doc.text("Dean's Signature", pageWidth - 14, footerY + 5, { align: "right" });

  const fileName = `${schoolName}_${grade}_T${termVal}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
  } catch (err) {
    console.error("PDF Export Error:", err);
  } finally {
    if (window.spinner) {
      window.spinner.hide(printReportBtn);
    }
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

  if (window.spinner) {
    window.spinner.show(printMissingReportBtn, "Generating PDF...");
  }

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

    let yPos = 12; // Initial Y position

  try {
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });
    yPos += 7;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`${year} | ${termLabel} | Missing Exams Report`, pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Learners Recorded as Absent: ${grade}`, 14, yPos);
    yPos += 8;

    // Export Stream Discrepancies to PDF if they exist
    const discrepancyBlock = missingExamsTableWrap.querySelector('div[style*="border: 1px solid #fee2e2"]');
    if (discrepancyBlock) {
      const discItems = Array.from(discrepancyBlock.querySelectorAll('li')).map(li => [li.innerText]);
      doc.autoTable({
        startY: yPos,
        head: [["🚨 STREAM-LEVEL MISSING SUBJECTS (Data Integrity Warning)"]],
        body: discItems,
        theme: 'grid',
        headStyles: { fillColor: [197, 48, 48] }, // Red theme for warnings
        styles: { fontSize: 8, fontStyle: 'bold' },
        margin: { bottom: 10 }
      });
      yPos = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`Individual Absences:`, 14, yPos);
      yPos += 7;
    } 

    if (table) {
      const headers = [["Name", "Adm", "Stream", "Assessment", "Missed Subjects"]];
      const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
        return Array.from(tr.querySelectorAll("td")).map((td, idx) => {
          // 🚀 Optimization: For the "Missed Subjects" column (index 4), join the individual badge spans 
          // with commas so they are readable in the PDF instead of appearing as a single sentence.
          if (idx === 4) {
            const spans = Array.from(td.querySelectorAll("span"));
            if (spans.length > 0) return spans.map(s => s.textContent.trim()).join(", ");
          }
          return td.textContent.trim();
        });
      });

      doc.autoTable({
        startY: yPos, 
        head: headers, 
        body: rows, 
        theme: 'grid',
        headStyles: { fillColor: [231, 76, 60] }, // Red for "Missing"
        styles: { fontSize: 9, lineWidth: 0.2, lineColor: [0, 0, 0] }, // Darker lines
        rowPageBreak: 'avoid', // 🆕 Prevents splitting a student's missing subjects list
        margin: { bottom: 35 } // Space for signature
      });
    } else {
      doc.setFontSize(10);
      doc.text("No individual learner absences recorded.", 14, yPos + 5);
    }

    // Ensure Dean Signature doesn't overlap
    doc.setPage(doc.internal.getNumberOfPages()); // Set to last page
    if (doc.lastAutoTable.finalY > pageHeight - 30) {
        doc.addPage();
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // 🆕 Watermark (School Logo)
      if (deanProfileData?.schoolLogoBase64) {
        try {
          const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
          const format = deanProfileData.logoFormat || "PNG";
          const width = 100;
          const height = (imgProps.height * width) / imgProps.width;
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.08 }));
          doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
          doc.restoreGraphicsState();
        } catch (e) {}
      }

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 10);
      doc.text(`Printed: ${formatDate(new Date(), { withTime: true })} | CompetenceHub`, pageWidth - 14, pageHeight - 10, { align: "right" });
    }

    doc.save(`Absent_Learners_${grade}_T${termVal}_${year}.pdf`);
  } catch (err) {
    console.error("PDF Export Error:", err);
  } finally {
    if (window.spinner) {
      window.spinner.hide(printMissingReportBtn);
    }
  }
}

async function downloadSubjectPerformanceAsPDF() {
  const table = subjectTableWrap.querySelector("table");
  if (!table || !window.jspdf) return;

  const btn = printSubjectReportBtn;
  if (window.spinner) {
    window.spinner.show(btn, "Generating PDF...");
  }

  // Allow UI to render spinner before heavy PDF task blocks the thread
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const schoolName = sanitizePdfText(deanProfileData?.schoolName || "SCHOOL NAME");
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
    const doc = new jsPDFClass({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const grade = sanitizePdfText(filterGradeEl.value);
    const termVal = sanitizePdfText(filterTermEl.value);
    const termLabel = termVal === "all" ? "Full Year" : `Term ${termVal}`;
    const year = sanitizePdfText(filterYearEl.value);
    const assessLabel = sanitizePdfText(filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report");
    const selectedStream = sanitizePdfText(filterStreamEl?.value || "all");
    const streamInfo = selectedStream !== "all" ? ` | Stream: ${selectedStream}` : "";

    let yPos = drawDeanPdfHeader(doc, {
      schoolName,
      subheader: `${year} | ${termLabel} | ${assessLabel}${streamInfo}`,
      pageWidth,
      logoBase64: deanProfileData?.schoolLogoBase64,
      logoProps: deanProfileData?.logoProps,
      logoFormat: deanProfileData?.logoFormat,
      logoWidth: 36,
      maxLogoHeight: 36,
      startY: 6
    });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(sanitizePdfText(`Subject Performance Analysis: ${grade}${selectedStream !== "all" ? ' - Stream ' + selectedStream : ''}`), 14, yPos);
  yPos += 3;

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
  const pdfProgressIdx = headers.indexOf("Progress");
  const tiedRowIndices = [];

  const rows = tbodyRows.map((tr, idx) => {
    if (tr.classList.contains("tied-rank")) tiedRowIndices.push(idx);
    return Array.from(tr.querySelectorAll("td"))
      .filter((_, colIdx) => !skipIndices.has(colIdx))
      .map(td => td.textContent.trim());
  });

  doc.autoTable({ 
    startY: yPos + 5, 
    head: [headers], 
    body: rows, 
    theme: 'grid', // Use 'grid' theme for borders
    styles: { fontSize: 9, lineWidth: 0.2, lineColor: [0, 0, 0] }, // Darker lines
    headStyles: { fillColor: [46, 204, 113] }, // Green theme for subject stats
    showHead: 'everyPage', 
    rowPageBreak: 'avoid', // 🆕 Prevents subject rows from splitting
    margin: { bottom: 35 }, // 🆕 Space for signature
    didParseCell: (data) => {
      if (data.section === 'body' && pdfProgressIdx !== -1 && data.column.index === pdfProgressIdx) {
        const progressValue = parseFloat(String(data.cell.raw).replace(/[^0-9+.-]/g, ''));
        if (!Number.isNaN(progressValue)) {
          data.cell.styles.textColor = progressValue > 0
            ? [22, 163, 74]
            : progressValue < 0
              ? [220, 38, 38]
              : [71, 85, 105];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && tiedRowIndices.includes(data.row.index)) {
        data.cell.styles.fillColor = [255, 249, 219];
      }
    }
  });

  // --- DRAW SIGNATURE ON THE LAST PAGE ---
  doc.setPage(doc.internal.getNumberOfPages());
  
  let footerY = pageHeight - 25;
  if (doc.lastAutoTable.finalY > footerY - 5) {
    doc.addPage();
    footerY = pageHeight - 25;
  }

  if (deanProfileData && deanProfileData.signatureBase64) {
    try {
      const sigFormat = deanProfileData.sigFormat || cbcUtils.getImageFormat(deanProfileData.signatureBase64);
      doc.addImage(deanProfileData.signatureBase64, sigFormat, pageWidth - 54, footerY - 8, 40, 8, undefined, 'FAST');
    } catch (e) { // Catch error if signature is invalid
      console.warn("Could not embed Dean signature in PDF:", e);
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("__________________________", pageWidth - 14, footerY, { align: "right" });
  doc.text("Dean's Signature", pageWidth - 14, footerY + 5, { align: "right" });

  // --- ADD PAGE NUMBERS, WATERMARK & SYSTEM FOOTER TO ALL PAGES ---
  const totalPagesCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesCount; i++) {
    doc.setPage(i);

    // 🆕 Watermark (School Logo)
    if (deanProfileData?.schoolLogoBase64) {
      try {
        const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
        const format = deanProfileData.logoFormat || "PNG";
        const width = 100; 
        const height = (imgProps.height * width) / imgProps.width;
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
        doc.restoreGraphicsState();
      } catch (e) { console.warn("Watermark rendering error:", e); }
    }

    doc.setFontSize(8);
    doc.setTextColor(150); 
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${i} of ${totalPagesCount}`, 14, pageHeight - 10);
    const genText = "CompetenceHub Analytics";
    doc.text(genText, pageWidth / 2, pageHeight - 10, { align: "center" });
    doc.text(`Printed: ${formatDate(new Date(), { withTime: true })}`, pageWidth - 14, pageHeight - 10, { align: "right" });
  }

  const streamSuffix = selectedStream !== "all" ? `_S${selectedStream}` : "";
  const termSuffix = termVal === "all" ? "Year" : `T${termVal}`;
  const fileName = `${schoolName}_Subjects_${grade}${streamSuffix}_${termSuffix}_${year}`.replace(/\s+/g, '_');
  doc.save(`${fileName}.pdf`);
  } catch (err) {
    console.error("Subject PDF Export Error:", err);
  } finally {
    if (window.spinner) {
      window.spinner.hide(btn);
    }
  }
}

function renderSubjectStats(subjects, totals, counts, prevMeans = {}, isSenior = false) {
  if (!subjects.length) { subjectTableContainer.style.display = "none"; return; }
  subjectTableContainer.style.display = "block";

  // Convert to object list and sort by performance
  const subjectList = subjects.map(s => {
    const total = Number(totals[s] || 0);
    const count = Number(counts[s] || 0);
    const mean = count > 0 ? Number((total / count).toFixed(2)) : null;
    return {
      name: s,
      mean,
      count,
      level: mean === null ? '-' : window.cbcUtils.getSubdivision(mean, filterGradeEl.value)
    };
  }).sort((a, b) => {
    if (a.mean === null && b.mean === null) return 0;
    if (a.mean === null) return 1;
    if (b.mean === null) return -1;
    return b.mean - a.mean;
  });

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

  let html = `<table class="marks-table" style="width:100%; border-collapse: collapse;">
    <thead><tr><th>Rank</th><th>Subject</th><th>Mean Score</th><th>Performance Level</th><th>Progress</th><th>Entries</th></tr></thead>
    <tbody>`;
  
  subjectList.forEach(s => {
    // Calculate progress HTML
    let progressHtml = '<span style="color:#94a3b8; font-size:0.75rem;">N/A</span>';
    const prevMean = prevMeans[s.name];
    if (prevMean !== undefined) {
      const diff = parseFloat((s.mean - prevMean).toFixed(2));
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
      <td>${s.mean !== null ? s.mean.toFixed(2) + '%' : 'N/A'}</td>
      <td>${s.level}</td>
      <td>${progressHtml}</td>
      <td>${s.count}</td>
    </tr>`;
  });

  html += "</tbody></table>";
  subjectTableWrap.innerHTML = html;
}


/**
 * 🆕 Renders multi-select checkboxes to define baseline milestones
 */
function renderBaselineCheckboxes() {
    const filterSection = document.querySelector('.filters-section') || document.querySelector('.filter-grid');
    if (!filterSection || document.getElementById("baselineCheckboxesWrap")) return;

    const wrap = document.createElement('div');
    wrap.id = "baselineCheckboxesWrap";
    wrap.className = "filter-item"; 
    wrap.style.cssText = "grid-column: 1 / -1; margin-top: 10px; padding: 12px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);";

    const mapping = window.ASSESSMENT_MAPPING || {};
    const defaults = [1, 5, 8]; // IDs for Opener, Midterm, Endterm

    let html = `<label style="display:block; font-size:0.7rem; font-weight:800; color:#64748b; margin-bottom:10px; text-transform:uppercase;">
                    <i class="fas fa-chart-line" style="color:#3b82f6;"></i> Progress Baseline Milestones (Milestones to compare against):
                </label>
                <div style="display:flex; flex-wrap:wrap; gap:18px;">`;
    
    Object.entries(mapping).forEach(([id, label]) => {
        const checked = defaults.includes(parseInt(id)) ? 'checked' : '';
        html += `
            <label style="font-size:0.78rem; display:flex; align-items:center; gap:8px; cursor:pointer; color: #1e293b; font-weight: 600;">
                <input type="checkbox" class="baseline-check" value="${id}" ${checked} style="width: 16px; height: 16px; cursor:pointer;"> ${label}
            </label>
        `;
    });
    html += `</div>`;
    wrap.innerHTML = html;
    filterSection.appendChild(wrap);
}

function initFilters() {
  const currentYear = new Date().getFullYear(); // Current year for default selection
  if (filterYearEl) {
    filterYearEl.innerHTML = "";
    // Populate selection from 2026 to 2126 (next 100 years)
    for (let y = 2026; y <= 2126; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true; // Select current year by default
      filterYearEl.appendChild(opt);
    }
  }

  // Populate Terms
  if (filterTermEl) {
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentTerm = currentMonth <= 4 ? "1" : currentMonth <= 8 ? "2" : "3";
    filterTermEl.innerHTML = `
      <option value="all">All Terms</option>
      <option value="1" ${currentTerm === "1" ? 'selected' : ''}>Term 1</option>
      <option value="2" ${currentTerm === "2" ? 'selected' : ''}>Term 2</option>
      <option value="3" ${currentTerm === "3" ? 'selected' : ''}>Term 3</option>
    `;
  }

  // Populate Assessments
  if (filterAssessmentEl && window.ASSESSMENT_MAPPING) { // Check if mapping is available
    filterAssessmentEl.innerHTML = '<option value="all">All Assessments</option>'; // Keep "All Assessments" option
    Object.entries(window.ASSESSMENT_MAPPING).forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      filterAssessmentEl.appendChild(opt);
    }
    );
  }

  // 🆕 Initialize Baseline Checkboxes
  renderBaselineCheckboxes();

  // Populate school grades based on the shared cbc-utils school-type config
  const grades = window.cbcUtils?.getGradeOptionsForSchool?.() || [];
  grades.forEach(g => { // Iterate over grades
    const opt = document.createElement("option"); opt.value = g; opt.textContent = g;
    filterGradeEl.appendChild(opt);
  });

  // Populate Pathway filter for Senior/Full school types
  try {
    const schoolType = window.cbcUtils?.getSchoolTypeKey?.() || "";
    const pathwayGroup = document.getElementById('pathwayFilterGroup');
    if (pathwayGroup && filterPathwayEl) {
      // Only show for senior or full school types
      if (schoolType === 'senior' || schoolType === 'full') {
        pathwayGroup.style.display = 'block';
        filterPathwayEl.innerHTML = '';
        const selectOpt = document.createElement('option'); selectOpt.value = ''; selectOpt.textContent = '-- Select Pathway --';
        filterPathwayEl.appendChild(selectOpt);
        const allOpt = document.createElement('option'); allOpt.value = 'all'; allOpt.textContent = 'All Pathways';
        filterPathwayEl.appendChild(allOpt);

        const pathways = (window.SUBJECT_DATA && window.SUBJECT_DATA.seniorSchoolPathways)
          ? Object.keys(window.SUBJECT_DATA.seniorSchoolPathways)
          : [];
        pathways.forEach(p => {
          const o = document.createElement('option'); o.value = p; o.textContent = p; filterPathwayEl.appendChild(o);
        });
      } else {
        pathwayGroup.style.display = 'none';
      }
    }
  } catch (e) {
    console.warn('Pathway filter init failed', e);
  }
}

async function loadDeanProfile() {
  // 🆕 Show Initialization Overlay (similar to timetable.js)
  const overlay = document.createElement('div');
  overlay.id = 'deanInitOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background:
      radial-gradient(circle at top left, rgba(147, 197, 253, 0.32), transparent 30%),
      radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.2), transparent 38%),
      linear-gradient(135deg, rgba(239, 246, 255, 0.92) 0%, rgba(224, 242, 254, 0.82) 42%, rgba(219, 234, 254, 0.76) 100%);
    z-index: 20000; display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    transition: opacity 0.4s ease; overflow: hidden;
  `;
  overlay.innerHTML = `
    <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; animation: deanShellFade 0.45s ease-out;">
      <span style="position:absolute; width: 280px; height: 280px; border-radius: 50%; background: rgba(96, 165, 250, 0.18); filter: blur(28px); top: 12%; left: 18%; animation: deanOrbFloat 7s ease-in-out infinite;"></span>
      <span style="position:absolute; width: 220px; height: 220px; border-radius: 50%; background: rgba(125, 211, 252, 0.18); filter: blur(24px); bottom: 10%; right: 18%; animation: deanOrbFloat 9s ease-in-out infinite reverse;"></span>
      <span style="position:absolute; width: 170px; height: 170px; border-radius: 50%; background: rgba(191, 219, 254, 0.24); filter: blur(22px); top: 38%; right: 28%; animation: deanOrbFloat 8s ease-in-out infinite;"></span>

      <div style="position: relative; width: min(430px, 92vw); padding: 28px 28px 24px; border-radius: 28px;
        background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 22px 60px rgba(37, 99, 235, 0.14), inset 0 1px 0 rgba(255,255,255,0.7);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); animation: deanCardRise 0.6s cubic-bezier(.2,.8,.2,1);">
        <div style="position:absolute; inset: 0 auto auto 0; width: 100%; height: 4px; border-radius: 28px 28px 0 0;
          background: linear-gradient(90deg, #2563eb, #38bdf8, #60a5fa, #2563eb); background-size: 200% 100%;
          animation: deanLoadBarSweep 2.6s ease-in-out infinite;"></div>
        <div style="display:flex; align-items:center; justify-content:center; gap:18px; margin-bottom: 16px;">
          <div class="spinner" style="width: 48px; height: 48px; border-width: 4px; border-top-color: #2563eb; border-right-color: #60a5fa; display: inline-block; margin-right: 0; box-shadow: 0 0 0 4px rgba(37,99,235,0.08), 0 0 24px rgba(96,165,250,0.28);"></div>
          <div style="display:flex; align-items:center; gap:8px; background: rgba(37,99,235,0.07); border: 1px solid rgba(96,165,250,0.25);
            border-radius: 999px; padding: 6px 12px; color: #1d4ed8; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif;">
            <span style="width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 12px rgba(34,197,94,0.8); display:inline-block;"></span>
            Syncing
          </div>
        </div>
        <div style="text-align:center;">
          <h2 style="margin: 0 0 10px; color: #0f172a; font-size: clamp(1.4rem, 2vw, 1.8rem); font-weight: 900; letter-spacing: -0.04em; text-transform: uppercase; font-family: 'Segoe UI', 'Trebuchet MS', 'Arial Black', sans-serif; text-shadow: 0 1px 0 rgba(255,255,255,0.4); animation: deanTextFade 0.9s ease-out;">Dean's Panel</h2>
          <p style="margin: 0; color: #475569; font-size: 0.98rem; font-weight: 500; line-height: 1.6; font-family: 'Segoe UI', 'Trebuchet MS', sans-serif; letter-spacing: 0.01em; animation: deanTextFade 1.1s ease-out;">
            Authenticating session and synchronizing academic analytics...
          </p>
        </div>
      </div>
    </div>
    <style>
      @keyframes deanLoadBarSweep {
        0% { background-position: 0% 50%; opacity: 0.8; }
        50% { background-position: 100% 50%; opacity: 1; }
        100% { background-position: 0% 50%; opacity: 0.8; }
      }
      @keyframes deanOrbFloat {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.7; }
        50% { transform: translate3d(18px, -22px, 0) scale(1.08); opacity: 1; }
      }
      @keyframes deanCardRise {
        0% { opacity: 0; transform: translateY(18px) scale(0.98); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes deanTextFade {
        0% { opacity: 0; transform: translateY(6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes deanShellFade {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }
    </style>
  `;
  document.body.appendChild(overlay);

  // 🆕 Dynamically add Refresh button and group header actions
  const mainHeader = document.querySelector('.main-content header'); // Target the new header in main-content
  const logoutBtn = document.getElementById('logoutBtn'); // Logout button is now in sidebar-actions
  if (mainHeader && logoutBtn) {

    // Check if actions container already exists to avoid duplicates on re-init
    let headerActions = mainHeader.querySelector('.header-actions');
    if (!headerActions) {
      headerActions = document.createElement('div');
    }
    headerActions.className = 'header-actions';

    // 🆕 Add Back to Teachers Dashboard Button
    const backToTeachersBtn = document.createElement('button');
    backToTeachersBtn.id = 'backToTeachersBtn';
    backToTeachersBtn.className = 'btn secondary-btn';
    backToTeachersBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Teacher';
    backToTeachersBtn.title = 'Go back to Teachers Dashboard';
    backToTeachersBtn.style.marginRight = '10px'; // Add some spacing
    backToTeachersBtn.addEventListener('click', () => {
      window.location.href = '/teacher'; // Redirect to the teacher dashboard
    });
    headerActions.appendChild(backToTeachersBtn);



    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshDeanBtn';
    refreshBtn.className = 'btn secondary-btn';
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    refreshBtn.title = 'Refresh Dashboard Data';
    refreshBtn.addEventListener('click', () => {
      // Clear relevant caches to ensure a fresh load
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX) || key === 'dean_school_info_cache' || key === 'user_profile_cache' || key === 'dean_sms_summary_cache' || key === 'dean_teacher_sig_cache') {
          localStorage.removeItem(key);
        }
      });
      window.location.reload();
    });
    headerActions.appendChild(refreshBtn);
    // The logout button is now in the sidebar, so we don't append it here.
    mainHeader.appendChild(headerActions); // Append the new container to the header
  }

  try {
    deanProfileData = await authService.getUserProfile(["teacher", "classteacher"]);
    if (!deanProfileData) {
      if (overlay) overlay.remove();
      return;
    }

    console.log("DEBUG: Is Dean flag at redirection check:", deanProfileData.isDean);

    if (!deanProfileData.isDean) {
      alert("Only Deans can access this page.");
      return window.location.href = "/teacher";
    }

    // These elements are no longer in the HTML, as the sidebar is now centralized.
    // The global suspension check in auth-service.js handles the primary authorization.

    // 🚀 Parallelize: Fetch school info and convert images concurrently
    const SCHOOL_CACHE_KEY = "dean_school_info_cache";
    const cachedSchool = localStorage.getItem(SCHOOL_CACHE_KEY);
    if (cachedSchool) {
      try { // Try to parse cached school info
        const { timestamp, data } = JSON.parse(cachedSchool);
        if (Date.now() - timestamp < CACHE_TTL) {
          schoolInfo = data;
        }
      } catch (e) { localStorage.removeItem(SCHOOL_CACHE_KEY); }
    }

    try {
      // Start fetching school info and signature conversion in parallel // 🆕 Use Promise.allSettled
      const results = await Promise.allSettled([ // Use Promise.allSettled to prevent one failure from blocking others
        schoolInfo ? Promise.resolve(schoolInfo) : fetchWithAuth(`${API_BASE}/users/my-school?includeLogo=true&fields=name,status,logo,logoMimeType,schoolType,headteacherSignatureUrl,gradingConfig`).catch(e => { console.warn("Failed to fetch school info:", e); return null; }),
        (deanProfileData.signatureUrl && !deanProfileData.signatureBase64) ? cbcUtils.getImageBase64(deanProfileData.signatureUrl).then(base64 => {
          deanProfileData.signatureBase64 = base64;
          deanProfileData.sigFormat = cbcUtils.getImageFormat(base64);
          return base64;
        }).catch(e => console.warn("Dean signature conversion failed:", e)) : Promise.resolve(null)
      ]);

      if (results[0].status === 'fulfilled' && results[0].value) {
        schoolInfo = results[0].value;
        window.schoolInfo = schoolInfo; // Expose globally for cbcUtils
      }

      // 🆕 Activate custom school grading logic immediately after fetch or cache load
      if (schoolInfo && schoolInfo.gradingConfig) { // Check if schoolInfo and gradingConfig exist
        window.cbcUtils.customGradingConfig = schoolInfo.gradingConfig;
      }

      if (schoolInfo) {
        if (!cachedSchool) localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: schoolInfo
        }));
        
        deanProfileData.schoolName = (schoolInfo.name || "DEAN PORTAL").toUpperCase(); // 🆕 Update sidebar brand
        if (schoolInfo.logo) {
          let logoSrc = schoolInfo.logo;
          // If the logo is raw base64 (doesn't start with / or http), prepend the data URI prefix
          if (!logoSrc.startsWith('http') && !logoSrc.startsWith('/') && !logoSrc.startsWith('data:')) {
            const mimeType = schoolInfo.logoMimeType || 'image/png';
            logoSrc = `data:${mimeType};base64,${logoSrc}`;
          }
          
          // Convert logo to base64 and extract format upfront
          deanProfileData.schoolLogoBase64 = await cbcUtils.getImageBase64(logoSrc); // 🆕 Use cbcUtils.getImageBase64
          deanProfileData.logoFormat = cbcUtils.getImageFormat(deanProfileData.schoolLogoBase64); // 🆕 Use cbcUtils.getImageFormat
        }
        
        // 🆕 Fetch and convert Headteacher/Principal signature if available in school profile
        if (schoolInfo.headteacherSignatureUrl) {
          try { // 🆕 Use cbcUtils.getImageBase64
            deanProfileData.headSignatureBase64 = await cbcUtils.getImageBase64(schoolInfo.headteacherSignatureUrl); // 🆕 Use cbcUtils.getImageBase64
            deanProfileData.headSigFormat = cbcUtils.getImageFormat(deanProfileData.headSignatureBase64); // 🆕 Use cbcUtils.getImageFormat
          } catch(e) { console.warn("Headteacher signature pre-load failed:", e); }
        } else { // If headteacherSignatureUrl is not available, try to use the dean's signature as fallback (if dean has one)
            if (deanProfileData.signatureBase64) { // Only fallback if dean has a signature
                deanProfileData.headSignatureBase64 = deanProfileData.signatureBase64;
                deanProfileData.headSigFormat = deanProfileData.sigFormat;
            }
          }

        // 🆕 PRE-CALCULATE IMAGE PROPERTIES ONCE TO OPTIMIZE PDF GENERATION SPEED
        // This prevents expensive binary re-parsing inside report generation loops.
        const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
        if (jsPDF && (!deanProfileData.logoProps || !deanProfileData.sigProps || !deanProfileData.headSigProps)) {
          const tempDoc = new jsPDF();
          if (deanProfileData.schoolLogoBase64) {
            try { 
                deanProfileData.logoProps = tempDoc.getImageProperties(deanProfileData.schoolLogoBase64); 
                deanProfileData.logoFormat = deanProfileData.logoFormat || cbcUtils.getImageFormat(deanProfileData.schoolLogoBase64);
            } catch (e) {}
          }
          if (deanProfileData.signatureBase64) {
            try { 
                deanProfileData.sigProps = tempDoc.getImageProperties(deanProfileData.signatureBase64); 
                deanProfileData.sigFormat = deanProfileData.sigFormat || cbcUtils.getImageFormat(deanProfileData.signatureBase64);
            } catch (e) {}
          }
          if (deanProfileData.headSignatureBase64) {
            try { 
                deanProfileData.headSigProps = tempDoc.getImageProperties(deanProfileData.headSignatureBase64); // 🆕 Use cbcUtils.getImageFormat
                deanProfileData.headSigFormat = cbcUtils.getImageFormat(deanProfileData.headSignatureBase64);
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn("Failed to pre-load school info or logo:", e);
      deanProfileData.schoolName = "SCHOOL NAME";
    }

    setupTabs(); // Initialize tabs
    initFilters();

    // 🆕 Update page title
    if (pageTitle) {
      pageTitle.textContent = "Dean's Panel";
    }

    // 🆕 Check if we should auto-open Timetable in standalone mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'timetable') {
        document.body.classList.add('standalone-view');
        
        // 🆕 Aggressively hide standard dashboard elements to isolate the timetable workspace
        const elementsToHide = [
            '.sidebar', 
            '.sidebar-nav', 
            '#sidebar', 
            'aside:not(.tt-sidebar)', 
            '.filters-section', 
            '.filter-grid', 
            '.marks-controls', 
            '.stats-grid',
            '.stats-summary',
            '.header'
        ];

        elementsToHide.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
        
        // Ensure content area expands fully in standalone
        const contentArea = document.getElementById('contentArea');
        if (contentArea) {
            contentArea.style.paddingTop = '0';
        }

        const mainContent = document.querySelector('main') || document.querySelector('.main-content');
        if (mainContent) mainContent.style.marginLeft = '0';

        // Deactivate other tabs
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

        // Mark the button active as well for UI consistency // Mark button active
        const ttBtn = document.querySelector('.tab-btn[data-tab*="timetable"]');
        if (ttBtn) ttBtn.classList.add('active');

        const pane = document.getElementById('timetableTab') || document.querySelector('.tab-pane[id*="timetable"]');
        if (pane) {
            pane.classList.add('active');
            if (analysisSection) {
                analysisSection.style.display = "block";
            } else {
                console.warn("analysisSection not found in standalone view for timetable.");
            }
            
            // 🆕 Use a short timeout to ensure TimetableModule has been fully loaded and defined on the window object
            setTimeout(() => {
                if (window.TimetableModule && typeof window.TimetableModule.init === 'function') {
                    window.TimetableModule.init();
                } else {
                    console.error("TimetableModule is not defined or missing init function when trying to initialize in standalone view. Verify script loading order in your HTML file.");
                }
            }, 100);
        } // Initialize TimetableModule
    }


    // 🆕 Gracefully remove overlay once everything is ready
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 400);
    }, 600);
 

  } catch (error) {
    console.error(error.message || "Unable to load dean profile.");
    window.location.href = "/teacher";
  }
}

function sanitizePdfText(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/\u00A0/g, " ")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x00-\x7F]/g, "")
        .trim();
}

/**
 * Generates a high-quality merged PDF for all students in the grade.
 * This logic uses data already in memory to avoid extra database costs.
 */
async function generateBulkReportCards() {
    if (!lastProcessedStudents.length) return;

    // Robust constructor resolution for jsPDF (handles both standard and UMD builds)
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
    if (!jsPDFClass) {
        return cbcUtils.showToast("PDF generation library is not loaded. Please wait a moment or refresh.", "error");
    }

    const btn = document.getElementById("generateBulkReportsBtn");
    const progressWrap = document.getElementById("reportsProgressWrap");
    const progressBar = document.getElementById("reportsProgressBar");
    const progressText = document.getElementById("reportsProgressText");
    const progressPercent = document.getElementById("reportsProgressPercent");
    const originalHTML = btn?.innerHTML || "Generate Reports";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generating Reports...</span>';
    }
    if (progressWrap) progressWrap.style.display = "block";
    if (progressBar) progressBar.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    if (progressText) progressText.textContent = "Preparing report pack...";

    await new Promise(r => setTimeout(r, 100));

    const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // const teacherSigCache = new Map(); // Store {base64, format} by streamKey // Not used
    
    const schoolName = sanitizePdfText(deanProfileData?.schoolName || "SCHOOL NAME");
    const termVal = sanitizePdfText(filterTermEl.value);
    const year = sanitizePdfText(filterYearEl.value);
    const assessLabel = sanitizePdfText(filterAssessmentEl.options[filterAssessmentEl.selectedIndex]?.text || "Report");
    const selectedStream = sanitizePdfText(filterStreamEl?.value || "all");
    const gradeLabel = sanitizePdfText(filterGradeEl.value);
    
    // 🆕 Pre-map static Performance Key to avoid repeated calculations in the loop
    // 🆕 Batch fetch all class teachers for all unique grade/stream combinations
    const uniqueGradeStreamPairs = new Set();
    lastProcessedStudents.forEach(s => {
        const grade = filterGradeEl.value; // Assuming all students are from the same grade
        const stream = s.stream || "Unassigned";
        uniqueGradeStreamPairs.add(`${grade}_${stream}`);
    });

    const gradeStreamPairsArray = Array.from(uniqueGradeStreamPairs).map(pair => {
        const [grade, stream] = pair.split('_');
        return { grade, stream: stream === "Unassigned" ? null : stream };
    });

    // 🆕 Persistent Cache for Teacher Signatures
    const TEACHER_CACHE_KEY = "dean_teacher_sig_cache";
    const teacherCache = JSON.parse(localStorage.getItem(TEACHER_CACHE_KEY) || "{}");
    const classTeacherMap = new Map();
    const pairsToFetch = [];

    gradeStreamPairsArray.forEach(pair => {
        const key = `${window.cbcUtils.normalizeGrade(pair.grade)}_${pair.stream || 'Unassigned'}`;
        if (teacherCache[key] && (Date.now() - teacherCache[key].timestamp < CACHE_TTL)) {
            classTeacherMap.set(key, teacherCache[key].data);
        } else {
            pairsToFetch.push(pair);
        } // Add to list of pairs to fetch
    });

    if (pairsToFetch.length > 0) {
        const batchResults = await fetchWithAuth(`${API_BASE}/users/class-teachers/batch`, {
            method: 'POST',
            body: JSON.stringify({ gradeStreamPairs: pairsToFetch })
        });

        await Promise.all(batchResults.map(async (ct) => {
            const normGrade = window.cbcUtils.normalizeGrade(ct.assignedClass);
            const key = `${normGrade}_${ct.assignedStream || 'Unassigned'}`;
            
            let sigData = null; // 🆕 Track signature data
            if (ct.signatureUrl) {
                const b64 = await cbcUtils.getImageBase64(ct.signatureUrl); // Use cbcUtils.getImageBase64
                if (b64) sigData = { base64: b64, format: cbcUtils.getImageFormat(b64) };
            }
            const teacherData = { ...ct, sigData };
            classTeacherMap.set(key, teacherData);
            teacherCache[key] = { timestamp: Date.now(), data: teacherData };
        }));
        localStorage.setItem(TEACHER_CACHE_KEY, JSON.stringify(teacherCache));
    }

    const perfKeyBody = cbcUtils.getPerformanceKey(gradeLabel).map(item => [
        sanitizePdfText(item.subdivision),
        sanitizePdfText(item.range),
        sanitizePdfText(item.points)
    ]);

    const hasGradeStreams = lastProcessedStudents.some(student => {
      const stream = String(student.stream || "").trim();
      return stream && stream.toLowerCase() !== "unassigned";
    });
    const subjectRankMaps = { grade: new Map(), stream: new Map() };
    const subjectRankTotals = { grade: new Map(), stream: new Map() };
    const buildSubjectRankMap = (students, totalsMap, groupKey = "") => {
      const rankMap = new Map();
      const subjectNames = new Set();
      students.forEach(student => Object.keys(student.subjects || {}).forEach(subject => subjectNames.add(subject)));

      subjectNames.forEach(subject => {
        const ranked = students
          .filter(student => {
            const score = student.subjects?.[subject];
            return score !== undefined && score !== null && score !== "" && !isNaN(score) && String(score).toUpperCase() !== "X";
          })
          .sort((a, b) => Number(b.subjects[subject]) - Number(a.subjects[subject]));
        let previousScore = null;
        let previousRank = 0;
        totalsMap.set(`${groupKey}::${subject}`, ranked.length);
        ranked.forEach((student, index) => {
          const score = Number(student.subjects[subject]);
          const rank = score === previousScore ? previousRank : index + 1;
          rankMap.set(`${student.adm}::${subject}`, rank);
          previousScore = score;
          previousRank = rank;
        });
      });
      return rankMap;
    };

    subjectRankMaps.grade = buildSubjectRankMap(lastCompleteGradeStudents, subjectRankTotals.grade);
    const studentsByStream = new Map();
    lastProcessedStudents.forEach(student => {
      const stream = String(student.stream || "Unassigned");
      if (!studentsByStream.has(stream)) studentsByStream.set(stream, []);
      studentsByStream.get(stream).push(student);
    });
    studentsByStream.forEach((students, stream) => {
      const streamRanks = buildSubjectRankMap(students, subjectRankTotals.stream, stream);
      streamRanks.forEach((rank, key) => subjectRankMaps.stream.set(key, rank));
    });

    for (let i = 0; i < lastProcessedStudents.length; i++) {
        const s = lastProcessedStudents[i];
        const percent = Math.round((i / lastProcessedStudents.length) * 100);
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressText) progressText.textContent = `Preparing ${s.name} (${i + 1} of ${lastProcessedStudents.length})...`;
        await new Promise(r => setTimeout(r, 10));

        if (i > 0) doc.addPage();

        // 🆕 Reset color state to Black (0) at the start of every report 
        // to prevent footer grey from leaking into the next page. // Reset color to black
        doc.setTextColor(0, 0, 0);

        // 1. Report Header
        let headerY = 8; // Minimised top margin
        const schoolNameText = schoolName;
        const schoolNameFontSize = 15;
        doc.setFont("helvetica", "bold").setFontSize(schoolNameFontSize);

        if (deanProfileData?.schoolLogoBase64) {
            try { // Embed school logo
                const imgProps = deanProfileData.logoProps || { width: 22, height: 22 };
                const logoFormat = deanProfileData.logoFormat || 'PNG';
                const imgWidth = 18; // Optimized sizing
                const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

                const words = schoolNameText.split(' ');
                if (words.length >= 3) {
                    const mid = Math.ceil(words.length / 2);
                    const part1 = words.slice(0, mid).join(' ');
                    const part2 = words.slice(mid).join(' ');
                    
                    const w1 = doc.getTextWidth(part1);
                    const w2 = doc.getTextWidth(part2);
                    const gap = 4; // Spacing around logo
                    const totalW = w1 + imgWidth + (gap * 2) + w2;
                    const startX = (pageWidth - totalW) / 2;
                    const textBaselineY = headerY + (imgHeight / 2) + 1.5; // Vertically center text with logo

                    doc.text(part1, startX, textBaselineY);
                    doc.addImage(deanProfileData.schoolLogoBase64, logoFormat, startX + w1 + gap, headerY, imgWidth, imgHeight, undefined, 'FAST');
                    doc.text(part2, startX + w1 + gap + imgWidth + gap, textBaselineY);
                    headerY += imgHeight + 3;
                } else { // If school name is short, center it
                    doc.addImage(deanProfileData.schoolLogoBase64, logoFormat, (pageWidth - imgWidth) / 2, headerY, imgWidth, imgHeight, undefined, 'FAST');
                    headerY += imgHeight + 3;
                    doc.text(schoolNameText, pageWidth / 2, headerY, { align: "center" });
                    headerY += 6;
                }
            } catch (e) {
                doc.text(schoolNameText, pageWidth / 2, headerY, { align: "center" });
                headerY += 6; // Fallback if logo fails
            }
        } else {
            doc.text(schoolNameText, pageWidth / 2, headerY, { align: "center" });
            headerY += 6;
        }

        const reportTitle = sanitizePdfText("LEARNERS PROGRESS REPORT");
        const reportSubtitle = sanitizePdfText(`${assessLabel} - Term ${termVal}, ${year}`);

        doc.setFont("helvetica", "normal").setFontSize(10).text(reportTitle, pageWidth / 2, headerY, { align: "center" });
        headerY += 5; // Spacing after report title
        doc.setFontSize(9).text(reportSubtitle, pageWidth / 2, headerY, { align: "center" });
        headerY += 6;

        // 2. Student Info Box
        const studentStream = sanitizePdfText(s.stream || "");
        const studentPathway = sanitizePdfText(s.pathway || "");
        const infoBoxY = headerY + 2;
        const leftColX = 18;
        const centerColX = pageWidth / 2 - 10;
        const rightColX = pageWidth - 74;
        doc.setFillColor(240, 245, 250).setDrawColor(200).setLineWidth(0.3).rect(15, infoBoxY, pageWidth - 30, 34, 'FD');

        doc.setFont("helvetica", "bold").setFontSize(8.5);
        doc.text(`Name: ${sanitizePdfText(s.name)}`, leftColX, infoBoxY + 7);

        doc.setFont("helvetica", "normal").setFontSize(8.5);
        doc.text(`ADM: ${sanitizePdfText(s.adm)}`, leftColX, infoBoxY + 13);

        if (studentPathway) {
          doc.setFont("helvetica", "bold").setFontSize(8.5);
          doc.text(`${studentPathway}`, leftColX, infoBoxY + 19);
        }

        doc.setFont("helvetica", "bold").setFontSize(8.2);
        doc.text(`Overall Rank:`, centerColX - 14, infoBoxY + 7, { align: "center" });
        doc.setFont("helvetica", "normal").setFontSize(8.2);
        doc.text(`${s.overallRank || s.rank || '-'} of ${s.overallRankTotal || s.rankTotal || lastProcessedStudents.length}`, centerColX + 10, infoBoxY + 7, { align: "center" });
        if (hasGradeStreams) {
          doc.setFont("helvetica", "bold").setFontSize(8.2);
          doc.text(`Stream Rank:`, centerColX - 14, infoBoxY + 13, { align: "center" });
          doc.setFont("helvetica", "normal").setFontSize(8.2);
          doc.text(`${s.streamRank || '-'} of ${s.streamTotal || 1}`, centerColX + 10, infoBoxY + 13, { align: "center" });
        }

        doc.setFont("helvetica", "bold").setFontSize(8.2);
        doc.text(`Grade:`, rightColX - 6, infoBoxY + 7, { align: "right" });
        doc.setFont("helvetica", "normal").setFontSize(8.2);
        doc.text(`${sanitizePdfText(filterGradeEl.value)}`, rightColX + 18, infoBoxY + 7, { align: "right" });
        if (hasGradeStreams) {
          doc.setFont("helvetica", "bold").setFontSize(8.2);
          doc.text(`Stream:`, rightColX - 6, infoBoxY + 13, { align: "right" });
          doc.setFont("helvetica", "normal").setFontSize(8.2);
          doc.text(`${studentStream}`, rightColX + 18, infoBoxY + 13, { align: "right" });
        }

        // 3. Subject Grid
        const rankingHeaders = hasGradeStreams ? ["Stream Rank", "Overall Rank"] : ["Overall Rank"];
        const headers = [
          [
            { content: "Subject", rowSpan: 2 },
            { content: "Score", rowSpan: 2 },
            { content: "Progress", rowSpan: 2 },
            { content: "SUBJECTS RANKING", colSpan: rankingHeaders.length, styles: { halign: "center" } },
            { content: "Level", rowSpan: 2 },
            { content: "Points", rowSpan: 2 },
            { content: "Remarks", rowSpan: 2 }
          ],
          rankingHeaders
        ];
        const tableStartY = infoBoxY + 26; // Y position for table

        // Determine senior status and eligibility map (use cached roster/elective assignments)
        const currentIsSenior = window.cbcUtils?.isSeniorGrade ? window.cbcUtils.isSeniorGrade(gradeLabel) : false;
        let eligibilityMap = new Map();
        try {
          if (currentIsSenior && typeof buildSeniorSubjectEligibilityMap === 'function') {
            eligibilityMap = buildSeniorSubjectEligibilityMap(currentRoster || [], currentElectiveAssignments || []);
          }
        } catch (e) {
          // fail silently and fall back to showing all subjects
          eligibilityMap = new Map();
        }

        // Filter subjects for senior learners based on eligibility; for non-senior show all
        const subjectsToShow = (currentIsSenior)
          ? lastProcessedSubjects.filter(sub => isSubjectEligibleForStudent(s.adm || s.admission || s.admissionNo || s.adm, sub, true, eligibilityMap))
          : lastProcessedSubjects.slice();

        const rows = subjectsToShow.map(sub => {
          const score = s.subjects[sub];
          const previousScore = s.previousSubjects?.[sub];
          const val = (score === undefined || score === null) ? "ABS" : score;
          const isNumericScore = (value) => value !== null && value !== undefined && value !== ""
            && !isNaN(value) && String(value).trim().toUpperCase() !== "X";
          const currentNumber = Number(score);
          const previousNumber = Number(previousScore);
          const subjectProgress = isNumericScore(score) && isNumericScore(previousScore)
            && Number.isFinite(currentNumber) && Number.isFinite(previousNumber)
            ? `${currentNumber - previousNumber >= 0 ? "+" : ""}${(currentNumber - previousNumber).toFixed(1)}`
            : "N/A";
          const remark = cbcUtils.getSubjectRemark(score, sub);
          const streamRank = subjectRankMaps.stream.get(`${s.adm}::${sub}`);
          const gradeRank = subjectRankMaps.grade.get(`${s.adm}::${sub}`);
          return [
            sub,
            val,
            subjectProgress,
            ...(hasGradeStreams ? [
              streamRank ? `${streamRank}/${subjectRankTotals.stream.get(`${String(s.stream || "Unassigned")}::${sub}`) || 1}` : "-",
              gradeRank ? `${gradeRank}/${subjectRankTotals.grade.get(`::${sub}`) || 1}` : "-"
            ] : [gradeRank ? `${gradeRank}/${subjectRankTotals.grade.get(`::${sub}`) || 1}` : "-"]),
            cbcUtils.getSubdivision(score, s.grade),
            cbcUtils.getPoints(score, s.grade),
            remark
          ];
        });

        doc.autoTable({
            startY: tableStartY,
            head: headers,
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [147, 197, 253], textColor: [15, 23, 42] },
            styles: { fontSize: 7.5, cellPadding: 2, lineWidth: 0.2, lineColor: [0, 0, 0] },
            bodyStyles: { valign: 'middle' },
            didParseCell: (data) => {
              if (data.section !== 'body') return;

              const isRankingColumn = data.column.index >= 3
                && data.column.index < (hasGradeStreams ? 5 : 4);
              if (isRankingColumn && /^\d+\/\d+$/.test(String(data.cell.raw))) {
                data.cell.customRankText = String(data.cell.raw);
                data.cell.text = [];
                return;
              }

              if (data.column.index !== 2) return;

              const progressValue = parseFloat(String(data.cell.raw));
              if (Number.isNaN(progressValue)) return;

              data.cell.styles.textColor = progressValue > 0
                ? [22, 163, 74]
                : progressValue < 0
                  ? [220, 38, 38]
                  : [71, 85, 105];
              data.cell.styles.fontStyle = 'bold';
            },
            didDrawCell: (data) => {
              if (data.section !== 'body' || !data.cell.customRankText) return;

              const [position, total] = data.cell.customRankText.split('/');
              const centerX = data.cell.x + (data.cell.width / 2);
              const baselineY = data.cell.y + (data.cell.height / 2) + 1.1;
              doc.setTextColor(15, 23, 42);
              doc.setFont('helvetica', 'bold');
              const positionWidth = doc.getTextWidth(position);
              doc.setFont('helvetica', 'normal');
              const suffixWidth = doc.getTextWidth(`/${total}`);
              const startX = centerX - ((positionWidth + suffixWidth) / 2);
              doc.setFont('helvetica', 'bold');
              doc.text(position, startX, baselineY);
              doc.setFont('helvetica', 'normal');
              doc.text(`/${total}`, startX + positionWidth, baselineY);
            },
            alternateRowStyles: { fillColor: [247, 248, 250] },
            margin: { left: 15, right: 15 },
            tableWidth: pageWidth - 30
        });

        // 4. Summary & Remarks
        const finalY = doc.lastAutoTable.finalY + 8; // Y position after table
        const studentRemark = window.cbcUtils?.getSubjectRemark?.(s.mean) || 'N/A';
        const metaX = 15; // Left Margin
        const metaX2 = pageWidth / 2 + 5;
        const labelOffset = 36; // Reduced from 45 to fix unnecessary spacing
        const remarkMaxWidth = pageWidth - (metaX2 + labelOffset) - 15; // Max width for column 2 comments

        // Data definitions for 2-column layout
        const statLabels = ["Total Marks", "Total Points", "Overall Performance"];
        // Compute max totals assuming 100 per subject shown in this report
        const maxTotalMarks = subjectsToShow.length * 100;
        const maxTotalPoints = subjectsToShow.reduce((acc, sub) => {
          try {
            return acc + (Number(cbcUtils.getPoints(100, gradeLabel)) || 0);
          } catch (e) {
            return acc;
          }
        }, 0);
        const statValues = [
          sanitizePdfText(`${s.total} / ${maxTotalMarks}`),
          sanitizePdfText(`${s.points} / ${maxTotalPoints}`),
          sanitizePdfText(cbcUtils.getSubdivision(s.mean, s.grade))
        ];
        const remarkLabels = ["Learner Remark", "Class Teacher", "Headteacher"];
        const remarkValues = [
          sanitizePdfText(studentRemark),
          sanitizePdfText(cbcUtils.getTeacherComment(s.mean)),
          sanitizePdfText(cbcUtils.getHeadteacherComment(s.mean))
        ];

        doc.setFontSize(8);
        for (let j = 0; j < 3; j++) { // Iterate for 3 rows of stats/remarks
            const y = finalY + (j * 6.5); // Consistent line height
            
            // Column 1: Performance Metrics
            doc.setFont("helvetica", "bold").text(`${statLabels[j]}:`, metaX, y);
            if (j === 0 || j === 1) {
                const [labelValue, maxValue] = statValues[j].split(' / ');
                doc.setFont("helvetica", "bold").text(labelValue, metaX + labelOffset, y);
                doc.setFont("helvetica", "normal").text(` / ${maxValue}`, metaX + labelOffset + doc.getTextWidth(labelValue), y);
            } else {
                doc.setFont("helvetica", "normal").text(statValues[j], metaX + labelOffset, y);
            }

            // Column 2: Comments (with wrapping to prevent overflow)
            doc.setFont("helvetica", "bold").text(`${remarkLabels[j]}:`, metaX2, y);
            doc.setFont("helvetica", "normal").text(remarkValues[j], metaX2 + labelOffset, y, { maxWidth: remarkMaxWidth });
        }

        const keyStartY = finalY + 20; // Y position for performance key
        doc.setFont("helvetica", "bold").setFontSize(7.5).text(sanitizePdfText("Performance Key"), metaX, keyStartY);
        doc.autoTable({
            startY: keyStartY + 2.5,
            head: [["Level", "Range", "Pts"]],
            body: perfKeyBody,
            theme: 'grid',
            headStyles: { fillColor: [147, 197, 253], textColor: [15, 23, 42], fontSize: 6.2, halign: 'center' },
            styles: { fontSize: 6, cellPadding: 1.2, lineWidth: 0.2, lineColor: [0, 0, 0] },
            margin: { left: metaX },
            tableWidth: 62
        });

        const progressSeries = buildStudentTermProgressSeries(s);
        const chartX = metaX + 68;
        const chartY = keyStartY;
        const chartW = 72;
        const chartH = 34;
        if (progressSeries.length >= 1) {
            doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(0, 0, 0);
            doc.text(sanitizePdfText("Term Progress"), chartX, chartY);
            doc.setDrawColor(203, 213, 225).setLineWidth(0.25).rect(chartX, chartY + 2, chartW, chartH);

            const plotX = chartX + 6;
            const plotY = chartY + 8;
            const plotW = chartW - 12;
            const plotH = chartH - 12;
            const maxVal = 100;
            const minVal = 0;
            const ySteps = [0, 25, 50, 75, 100];

            const points = progressSeries.map((point, index) => ({
                x: plotX + (index / Math.max(progressSeries.length - 1, 1)) * plotW,
                y: plotY + plotH - ((point.mean - minVal) / (maxVal - minVal || 1)) * plotH,
            }));

            doc.setDrawColor(226, 232, 240).setLineWidth(0.2);
            ySteps.forEach((step) => {
                const y = plotY + plotH - ((step - minVal) / (maxVal - minVal || 1)) * plotH;
                doc.line(plotX, y, plotX + plotW, y);
            });

            doc.setDrawColor(148, 163, 184).setLineWidth(0.2);
            doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);
            doc.line(plotX, plotY, plotX, plotY + plotH);

            doc.setFont("helvetica", "normal").setFontSize(5.5);
            ySteps.forEach((step) => {
                const y = plotY + plotH - ((step - minVal) / (maxVal - minVal || 1)) * plotH;
                doc.text(String(step), plotX - 2, y + 0.8, { align: "right" });
            });

            doc.text(sanitizePdfText("Mean"), plotX - 8, plotY + plotH / 2, { align: "center", angle: -90 });
            doc.text(sanitizePdfText("Assessments"), plotX + plotW / 2, plotY + plotH + 8, { align: "center" });

            doc.setDrawColor(37, 99, 235).setLineWidth(0.4);
            points.forEach((point, index) => {
                if (index > 0) {
                    const prev = points[index - 1];
                    doc.line(prev.x, prev.y, point.x, point.y);
                }
            });
            doc.setFillColor(37, 99, 235);
            points.forEach((point) => doc.circle(point.x, point.y, 0.9, 'F'));

            doc.setFont("helvetica", "bold").setFontSize(5.8);
            progressSeries.forEach((point, index) => {
                const pointX = points[index].x;
                const label = sanitizePdfText(point.label);
                doc.text(label, pointX, plotY + plotH + 4, { align: "center" });
            });

            doc.setFont("helvetica", "bold").setFontSize(6.2);
            progressSeries.forEach((point, index) => {
                const pointX = points[index].x;
                const valueText = sanitizePdfText(`${Math.round(point.mean)}%`);
                doc.text(valueText, pointX, points[index].y - 2, { align: "center" });
            });
        }

        const isSeniorGrade = cbcUtils.isSeniorGrade(gradeLabel);
        // Always render three signature columns: Principal | Class Teacher | Parent/Guardian
        const signatureY = pageHeight - 38;
        const leftMargin = 15;
        const cols = 3;
        const signatureBlockWidth = (pageWidth - (leftMargin * 2)) / cols;
        const leftX = leftMargin;
        const middleX = leftX + signatureBlockWidth;
        const rightX = leftX + signatureBlockWidth * 2;
        const headteacherLabel = isSeniorGrade ? "Principal's Signature" : "Headteacher's Signature";
        const parentGuardianLabel = "Parent/Guardian Signature";

        doc.setFont("helvetica", "normal"); // Reset font

        doc.setDrawColor(0, 0, 0).setLineWidth(0.25);
        doc.setLineDash([1.2, 1.2], 0);

        // Line length and offsets to keep labels inside margins
        const linePadding = 10;
        const lineLen = Math.max(40, signatureBlockWidth - (linePadding * 2));

        // Helper to draw a centered dashed line and label for a column
        const drawSigColumn = (startX, label) => {
          const lineStart = startX + linePadding;
          const lineEnd = lineStart + lineLen;
          doc.line(lineStart, signatureY, lineEnd, signatureY);
          doc.setFont("helvetica", "bold").setFontSize(9);
          doc.text(label, lineStart + (lineLen / 2), signatureY + 6, { align: 'center' });
          doc.setFont("helvetica", "normal");
          return { lineStart, lineLen };
        };

        // Draw columns
        const leftCol = drawSigColumn(leftX, headteacherLabel);
        const midCol = drawSigColumn(middleX, "Class Teacher's Signature");
        const rightCol = drawSigColumn(rightX, parentGuardianLabel);

        doc.setLineDash([]);

        // 🆕 Embed Signatures centered above each line when available
        const streamKey = s.stream || "Unassigned";
        const ct = classTeacherMap.get(`${window.cbcUtils.normalizeGrade(gradeLabel)}_${streamKey}`);

        const imgW = 30;
        const imgH = 9;
        try {
          if (ct?.sigData) {
            const x = midCol.lineStart + (midCol.lineLen - imgW) / 2;
            doc.addImage(ct.sigData.base64, ct.sigData.format, x, signatureY - imgH - 2, imgW, imgH, undefined, 'FAST');
          }

          const headSigB64 = deanProfileData.headSignatureBase64 || deanProfileData.signatureBase64;
          const headSigFmt = deanProfileData.headSignatureBase64 ? deanProfileData.headSigFormat : deanProfileData.sigFormat;
          if (headSigB64) {
            const x = leftCol.lineStart + (leftCol.lineLen - imgW) / 2;
            doc.addImage(headSigB64, headSigFmt, x, signatureY - imgH - 2, imgW, imgH, undefined, 'FAST');
          }
        } catch (e) {
          console.warn('Signature embed failed', e);
        }

        // 🆕 Watermark (School Logo) - Rendered last to ensure it stays on top of table backgrounds
        if (deanProfileData?.schoolLogoBase64) {
            try {
                const imgProps = deanProfileData.logoProps || doc.getImageProperties(deanProfileData.schoolLogoBase64);
                const format = deanProfileData.logoFormat || "PNG";
                const width = 100; // Size of watermark
                const height = (imgProps.height * width) / imgProps.width;

                doc.saveGraphicsState();
                doc.setGState(new doc.GState({ opacity: 0.08 })); // Subtle 8% opacity
                doc.addImage(deanProfileData.schoolLogoBase64, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
                doc.restoreGraphicsState();
            } catch (e) {
                console.warn("Bulk Report Watermark rendering error:", e);
            }
        }

        // Footer branding on every report page
        doc.setFontSize(8); // Set font size for footer
        doc.setTextColor(120);
        const printedTimestamp = formatDate(new Date(), { withTime: true });
        doc.text(`Printed: ${printedTimestamp}, CompetenceHub Analytics`, pageWidth / 2, pageHeight - 10, { align: "center" });
    }

    const streamSuffix = selectedStream !== "all" ? `_${selectedStream.replace(/\s+/g, '_')}` : "";
    const fileName = `Reports_${filterGradeEl.value.replace(/\s+/g, '_')}${streamSuffix}_T${termVal}_${year}.pdf`;
    doc.save(fileName);

    if (progressBar) progressBar.style.width = "100%";
    if (progressPercent) progressPercent.textContent = "100%";
    if (progressText) progressText.textContent = "Report pack ready";
    if (progressWrap) {
      setTimeout(() => {
        progressWrap.style.display = "none";
      }, 1400);
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
    updateReportsActionState();
    cbcUtils.showToast("Reports generated successfully!", "success");
}

/**
 * 🆕 Updates the SMS balance display in the SMS tab
 */
async function updateDeanSmsBalance() {
  if (!deanSmsBalanceEl) return;
  try {
    const data = await fetchWithAuth(`${API_BASE}/users/my-school?includeLogo=false&fields=smsCredits&refresh=true`);
    const credits = Number(data?.smsCredits ?? 0);

    if (Number.isFinite(credits)) {
      deanSmsBalanceEl.textContent = `${credits} SMS`;
    } else {
      deanSmsBalanceEl.textContent = 'Unavailable';
    }
  } catch (e) {
    console.error('Failed to update SMS balance:', e);
    deanSmsBalanceEl.textContent = 'Unavailable';
  }
}

/**
 * 🆕 Fetches and renders the SMS summary (Counts + Failures)
 */
async function fetchSmsHistorySummary(forceReload = false) {
  const statsGrid = document.getElementById("smsStatsGrid");
  const logWrap = document.getElementById("smsFailureLogWrap");
  if (!statsGrid || !logWrap) return;
  
  const CACHE_KEY = "dean_sms_summary_cache";
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  if (!forceReload) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { timestamp, data } = JSON.parse(cached); // Parse cached data
        if (Date.now() - timestamp < CACHE_DURATION) {
          renderSmsSummary(data, statsGrid, logWrap);
          return;
        }
      } catch (e) { console.warn("SMS Summary cache read error:", e); }
    }
  }

  try {
    const data = await fetchWithAuth(`${API_BASE}/marks/sms-summary`);
    if (!data) return; // If no data, return

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    renderSmsSummary(data, statsGrid, logWrap);
  } catch (e) {
    console.error("Failed to fetch SMS history:", e);
  }
}

function renderSmsSummary(data, statsGrid, logWrap) {
    // Render Stats
    statsGrid.innerHTML = `
      <div style="background: #f0fdf4; border: 1px solid #bcf0da; padding: 12px; border-radius: 10px; text-align: center;">
        <div style="font-size: 1.2rem; font-weight: 800; color: #166534;">${data.summary.sent}</div>
        <div style="font-size: 0.65rem; color: #15803d; font-weight: 700; text-transform: uppercase;">Successful</div>
      </div>
      <div style="background: #fff1f2; border: 1px solid #fecaca; padding: 12px; border-radius: 10px; text-align: center;">
        <div style="font-size: 1.2rem; font-weight: 800; color: #991b1b;">${data.summary.failed}</div>
        <div style="font-size: 0.65rem; color: #991b1b; font-weight: 700; text-transform: uppercase;">Failed</div> 
        ${data.summary.failed > 0 ? `<button id="retryFailedSmsBtn" class="btn primary-btn" style="margin-top:8px; width:100%; font-size:0.65rem; padding:4px; background:#991b1b; font-weight:700;">Retry All</button>` : ''}
      </div>
    `;

    // Attach Retry Handler
    const retryBtn = document.getElementById("retryFailedSmsBtn");
    if (retryBtn) {
        retryBtn.addEventListener("click", async () => {
            const confirmed = await cbcUtils.showConfirmToast(`Attempt to resend ${data.summary.failed} failed messages? This will consume SMS credits.`);
            if (!confirmed) return; // If not confirmed, return

           
            window.spinner?.show(retryBtn, "Retrying...");

            try {
                const res = await fetchWithAuth(`${API_BASE}/announcements/retry-failed`, { method: 'POST' });
                cbcUtils.showToast(res?.message || "SMS retry successfully initiated", "success");
                fetchSmsHistorySummary(true);
                updateDeanSmsBalance();
            } catch (err) { // Catch error
                cbcUtils.showToast(err.message || "Failed to retry SMS broadcast", "error");
               
                window.spinner?.hide(retryBtn);
            }
        });
    }

    // Render Failures List (if any)
    if (data.recentFailures && data.recentFailures.length > 0) { // Render failures list
      let html = `
        <div style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; padding: 12px;">
          <p style="font-size: 0.75rem; font-weight: 700; color: #ef4444; margin-bottom: 10px;"><i class="fas fa-exclamation-circle"></i> DELIVERY FAILURES TO CHECK:</p>
          <table style="width: 100%; font-size: 0.75rem; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid #e2e8f0; text-align: left; color: #64748b;">
                <th style="padding-bottom: 5px;">Learner</th>
                <th style="padding-bottom: 5px;">Recipient</th>
                <th style="padding-bottom: 5px;">Date</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      data.recentFailures.forEach(log => {
        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 6px 0;"><strong>${log.studentName}</strong></td>
            <td>${log.recipient}</td>
            <td style="color: #94a3b8;">${formatDate(log.createdAt)}</td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      logWrap.innerHTML = html;
    } else {
      logWrap.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 10px; color: #94a3b8; font-size: 0.8rem;">
          <i class="fas fa-check-circle" style="color: #10b981; margin-bottom: 5px; display: block; font-size: 1.2rem;"></i>
          No recent delivery failures found.
        </div>
      `;
    }
}

/**
 * 🆕 Initiates a bulk SMS results broadcast for the filtered grade/assessment
 */
async function startSmsBroadcast() {
  const grade = filterGradeEl.value;
  const term = filterTermEl.value;
  const assessment = filterAssessmentEl.value;
  const year = filterYearEl.value;
  
  if (!grade || !term || !assessment || !year) {
    return cbcUtils.showToast("Please ensure all filters are selected.", "error");
  }

  const mapping = window.ASSESSMENT_MAPPING || {};
  const assessLabel = mapping[assessment] || `Assessment ${assessment}`;

  const confirmed = await cbcUtils.showConfirmToast( // Confirm broadcast
    `Are you sure you want to broadcast ${assessLabel} results for ${grade} to all parents via SMS? This will consume school SMS credits.`
  );

  if (!confirmed) return;

  
  window.spinner?.show(broadcastSmsBtn, "Initiating Broadcast...");
  smsBroadcastAbortController = new AbortController();

  // 🆕 Initialize Progress Bar
  if (smsBroadcastProgressWrap) smsBroadcastProgressWrap.style.display = "block";
  if (smsBroadcastProgressBar) smsBroadcastProgressBar.style.width = "5%";
  if (smsBroadcastProgressText) smsBroadcastProgressText.textContent = "Connecting to SMS Gateway...";

  let progressInterval = setInterval(() => {
    const currentWidth = parseFloat(smsBroadcastProgressBar.style.width);
    if (currentWidth < 90) {
      const nextWidth = currentWidth + (90 - currentWidth) * 0.1;
      smsBroadcastProgressBar.style.width = `${nextWidth}%`;
      smsBroadcastProgressText.textContent = `Broadcasting results... ${Math.round(nextWidth)}%`;
    }
  }, 1000);

  try {
    const res = await fetchWithAuth(`${API_BASE}/marks/broadcast-sms`, {
      method: 'POST',
      body: JSON.stringify({ grade, term, year, assessment }),
      signal: smsBroadcastAbortController.signal
    });

    clearInterval(progressInterval);
    if (smsBroadcastProgressBar) smsBroadcastProgressBar.style.width = "100%"; // Set progress to 100%
    if (smsBroadcastProgressText) smsBroadcastProgressText.textContent = "Broadcast Complete!";

    cbcUtils.showToast(res.message || "SMS Broadcast successfully initiated!", "success");
    
    // Hide progress bar after success
    setTimeout(() => {
      if (smsBroadcastProgressWrap) smsBroadcastProgressWrap.style.display = "none";
    }, 4000);

    // Refresh balance and history after broadcast
    setTimeout(() => {
      fetchSmsHistorySummary(true);
      updateDeanSmsBalance();
    }, 2500);
  } catch (err) { // Catch error
    clearInterval(progressInterval);
     // 🆕 Cleanup UI on error or cancellation
    if (smsBroadcastProgressWrap) {
      if (smsBroadcastProgressBar) smsBroadcastProgressBar.style.width = "0%";
      smsBroadcastProgressWrap.style.display = "none";
    }
    if (err.name === 'AbortError') return; // 🆕 Silence error toast if cancelled by user
    console.error("SMS Broadcast Error:", err);
    cbcUtils.showToast(err.message || "Failed to initiate SMS broadcast.", "error");
  } finally {
   
    window.spinner?.hide(broadcastSmsBtn);
  }
}

if (filterStreamEl) {
  filterStreamEl.addEventListener("change", () => {
    if (currentAnalysisRawData) { // Check if raw data exists
      // 🆕 Retrieve cached roster to ensure "Ungraded" logic continues to work on stream change
      const grade = filterGradeEl.value;
      const term = filterTermEl.value;
      const year = filterYearEl.value;
      const assessment = filterAssessmentEl.value;
      const cacheKey = `${grade}_${term}_${year}_${assessment}_${filterStreamEl?.value || "all"}`;
      const cached = getAnalyticsCache(cacheKey);
      processAnalysisData(currentAnalysisRawData, currentIsSenior, assessment, currentPrevRawData, cached?.roster || currentRoster, currentElectiveAssignments);
    }
  }); // Update analysis on stream change
}
if (filterPathwayEl) {
  filterPathwayEl.addEventListener('change', () => {
    if (currentAnalysisRawData) {
      const grade = filterGradeEl.value;
      const term = filterTermEl.value;
      const year = filterYearEl.value;
      const assessment = filterAssessmentEl.value;
      const cacheKey = `${grade}_${term}_${year}_${assessment}_${filterStreamEl?.value || "all"}`;
      const cached = getAnalyticsCache(cacheKey);
      processAnalysisData(currentAnalysisRawData, currentIsSenior, assessment, currentPrevRawData, cached?.roster || currentRoster, currentElectiveAssignments);
    }
  });
}

// 🆕 Centralized event listeners for buttons
function attachDeanEventListeners() {
  applyFiltersBtn?.addEventListener("click", generateReport);
  printReportBtn?.addEventListener("click", downloadRankingAsPDF);
  printSubjectReportBtn?.addEventListener("click", downloadSubjectPerformanceAsPDF);
  printMissingReportBtn?.addEventListener("click", downloadMissingExamsAsPDF); // Download missing exams PDF
  configureGradingBtn?.addEventListener("click", openGradingConfigModal);
  generateSchoolRankingsBtn?.addEventListener("click", generateSchoolWideReport);
  document.getElementById("generateBulkReportsBtn")?.addEventListener("click", generateBulkReportCards);
  broadcastSmsBtn?.addEventListener("click", startSmsBroadcast);
  cancelSmsBroadcastBtn?.addEventListener("click", async () => {
    if (smsBroadcastAbortController) {
      const confirmed = await cbcUtils.showConfirmToast("Are you sure you want to stop the current SMS broadcast?");
      if (confirmed) {
        smsBroadcastAbortController.abort();
      }
    }
  }); // Cancel SMS broadcast

  // Logout button is now in the sidebar-actions, handled by authService.initLogout()
  // The old DOMContentLoaded listener for logout is removed.
  authService.initLogout();
}

// 🆕 Clean URL Enforcement (Moved to global ui.js or auth-service.js if applicable)
// This logic should ideally be handled once globally, not per dashboard.
// Assuming it's handled elsewhere or will be moved.

// Initialize the dashboard
(async function initDeanDashboard() {
  // 🆕 Attach all event listeners before loading profile
  attachDeanEventListeners();
  await loadDeanProfile();
})();


//
