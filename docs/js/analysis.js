// ===== ANALYSIS.JS(CLASSTEACHERS) =====

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const notAllowedEl = document.getElementById("notAllowed");
  const analysisWrap = document.getElementById("analysisWrap");
  const logoutBtn = document.getElementById("logoutBtn");
  const exportPdfBtn = document.getElementById("exportPdf");
  const refreshBtn = document.getElementById("refreshBtn");
  const generateBtn = document.getElementById("generateReport");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");

  const gradeFilter = document.getElementById("gradeFilter");
  const termFilter = document.getElementById("termFilter");
  const yearFilter = document.getElementById("yearFilter");
  const streamFilterSelect = document.getElementById("streamFilterSelect"); // 🆕 Stream filter
  const assessmentFilter = document.getElementById("assessmentFilter");

  const rankingTableWrap = document.getElementById("rankingTableWrap");
  const subjectTableWrap = document.getElementById("subjectTableWrap");
  const classMeanEl = document.getElementById("classMean");
  const topMeanEl = document.getElementById("topMean");
  const lowMeanEl = document.getElementById("lowMean");
  const topSubjectEl = document.getElementById("topSubject");
  const lowSubjectEl = document.getElementById("lowSubject");
  const recordsCountEl = document.getElementById("recordsCount");

  let missingExamsTableWrap = document.getElementById("missingExamsTableWrap");
  // ===== API CONFIG =====
  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL;
  let user = null;

  // ===== AUTH CHECK USING CENTRALIZED SERVICE =====
  user = await window.authService?.getUserProfile(["teacher", "classteacher"]);
  if (!user) return; // authService handles redirect to login if session is invalid

  if (!user.isClassTeacher && !user.roles?.includes("classteacher")) {
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

  // ===== FETCH SCHOOL =====
  async function fetchSchoolInfo() {
    try {
      const token = window.authService?.getToken();
      const res = await fetch(`${API_BASE}/my-school`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("School fetch failed");
      return await res.json();
    } catch (err) {
      console.error("School fetch error:", err);
      return null;
    }
  }

  // ===== BUTTONS =====
  refreshBtn?.addEventListener("click", () => window.location.reload());
  generateBtn?.addEventListener("click", generateReport);
  applyFiltersBtn?.addEventListener("click", generateReport);
  window.authService?.initLogout();
  exportPdfBtn?.addEventListener("click", exportPdf);

  // ===== LOAD LEARNERS (EDIT MODE) BUTTON =====
  /*if (generateBtn) {
    const loadLearnersBtn = document.createElement("button");
    loadLearnersBtn.textContent = "Load Learners (Edit)";
    loadLearnersBtn.className = "primary-btn"; 
    loadLearnersBtn.style.marginLeft = "10px";
    loadLearnersBtn.style.backgroundColor = "#ff9800"; // Orange color
    loadLearnersBtn.style.color = "#fff";
    loadLearnersBtn.style.border = "none";
    loadLearnersBtn.style.padding = "8px 16px";
    loadLearnersBtn.style.cursor = "pointer";
    loadLearnersBtn.style.borderRadius = "4px";
    
    // Insert after Generate Report button
    generateBtn.parentNode.insertBefore(loadLearnersBtn, generateBtn.nextSibling);
    
    loadLearnersBtn.addEventListener("click", loadLearnersForEditing);
  } */

  // Create Container for Edit Table
  const editContainer = document.createElement("div");
  editContainer.id = "editContainer";
  editContainer.style.display = "none";
  editContainer.style.marginTop = "20px";
  editContainer.className = "card";
  if (rankingTableWrap && rankingTableWrap.parentNode) {
    rankingTableWrap.parentNode.insertBefore(editContainer, rankingTableWrap);
  }

  // ===== FETCH USER PROFILE =====
  const fetchUserAndAllocations = async () => {
    try {
      const token = window.authService?.getToken();
      const userRes = await fetch(`${API_BASE}/users/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!userRes.ok) throw new Error("Unauthorized");
      const profile = await userRes.json();

      // Require schoolId for class-teacher flows
      if (!profile || !profile.schoolId) {
        console.error("Profile missing schoolId:", profile);
        return showNotAllowed();
      }

      let classGrade = profile.classGrade;

      if (!classGrade) {
        const token = window.authService?.getToken();
        const allocRes = await fetch(`${API_BASE}/users/allocations`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const allocations = allocRes.ok ? await allocRes.json() : [];
        const myAllocation = allocations.find(a => a.teacherAdmission === profile.admission);

        if (myAllocation && myAllocation.assignedClass) {
          classGrade = myAllocation.assignedClass;
        }
      }

      if (!classGrade) return showNotAllowed();

      profile.classGrade = classGrade;
      showAnalysis();

      if (gradeFilter) {
        gradeFilter.innerHTML = `<option value="${classGrade}">${classGrade}</option>`;
        gradeFilter.disabled = true;
      }

      const teacherInfoEl = document.getElementById("teacherInfo");
      if (teacherInfoEl) {
        teacherInfoEl.innerHTML = `Class Teacher: <strong>${profile.name || "—"}</strong> | Grade: <strong>${classGrade}</strong>`;
      }

      // 🆕 Display class stream if available
      const streamDisplay = document.getElementById("streamDisplay");
      if (streamDisplay) {
        const classStream = profile.assignedStream || "No Stream";
        streamDisplay.textContent = classStream;
      }

      // 🆕 Hide stream filter if no stream is assigned
      if (streamFilterSelect) {
        if (profile.assignedStream) {
          streamFilterSelect.style.display = "block";
        } else {
          streamFilterSelect.style.display = "none";
        }
      }

      user = profile; // update user globally
      populateAssessmentFilter(); // Populate assessment filter after user is loaded
     
      
      // ===== LOAD SCHOOL HEADER =====
      const school = await fetchSchoolInfo();
      if (!school) return;

      const nameEl = document.getElementById("schoolName");
      const logoEl = document.getElementById("schoolLogo");
      const addressEl = document.getElementById("schoolAddress");

      // 🆕 Activate custom school grading logic if defined
      if (school.gradingConfig) {
        if (window.cbcUtils) window.cbcUtils.customGradingConfig = school.gradingConfig;
      }

      if (nameEl) nameEl.textContent = `${school.name} — Class Analysis`;
      if (addressEl && school.address) addressEl.textContent = school.address;

      // ===== LOGO RESOLUTION (FIXED) =====
      if (logoEl && school.logo) {
        logoEl.crossOrigin = "anonymous";
        const BACKEND_URL = config.api.baseURL.replace('/api', '');

        // Detect logo format: file path (legacy), HTTP URL, or base64 (new)
        if (school.logo.startsWith('/') || school.logo.includes('uploads/')) {
          // Legacy file path - use with backend URL
          let logoPath = school.logo.trim();
          logoPath = logoPath.replace(/^\/+/, "");
          if (!logoPath.startsWith("uploads/")) {
            logoPath = `uploads/${logoPath}`;
          }
          logoEl.src = `${BACKEND_URL}/${logoPath}?t=${Date.now()}`;
        } else if (school.logo.startsWith('http')) {
          // Absolute HTTP URL
          logoEl.src = school.logo;
        } else {
          // New base64 format - convert to data URL
          const mimeType = school.logoMimeType || 'image/png';
          logoEl.src = `data:${mimeType};base64,${school.logo}`;
        }

        logoEl.alt = "School Logo";
        logoEl.classList.remove("hidden");
      }

    } catch (err) {
      console.error("Profile load error:", err);
      localStorage.clear();
      showNotAllowed();
    }
  }

  // ✅ CALL ONCE
  fetchUserAndAllocations();

  // ===== INITIALIZE FILTERS =====
  // Set year filter to current year
  const currentYear = new Date().getFullYear();
  if (yearFilter) {
    yearFilter.value = currentYear.toString();
  }

   async function getFilteredMarks(page = null, limit = null, search = "", streamOverride = null) {
    if (!user?.classGrade) return [];

    // Build filter values - always send term and assessment (use "all" if not selected)
    const termValue = termFilter?.value || "all";
    const yearValue = yearFilter?.value ? Number(yearFilter.value) : currentYear;
    const assessmentValue = assessmentFilter?.value || "all";

    const params = new URLSearchParams({ 
      grade: user.classGrade,
      term: termValue,
      year: yearValue,
      assessment: assessmentValue
    });

    // 🆕 Handle stream filter based on selection
    const streamMode = streamOverride || streamFilterSelect?.value;
    if (streamMode === "assigned" && user.assignedStream) {
      // "My Stream Only" - filter by the teacher's assigned stream
      params.append("stream", user.assignedStream);
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
      if (res.status === 403) {
        showNotAllowed();
        return [];
      }
      if (!res.ok) throw new Error("Failed to fetch marks");

      const data = await res.json();

      console.log("[Analysis] Received data:", Array.isArray(data) ? data.length : (data.total || 0), "records");

      const rawData = (page && limit && data.data) ? data.data : data;

      const normalized = Array.isArray(rawData) ? rawData.map(m => ({
        admissionNo: m.admissionNo,
        studentName: m.studentName || "Unnamed",
        grade: m.grade || user.classGrade,
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
    if (!filtered.length && !roster.length) return { studentArray: [], subjects: [], subjectMeans: {}, classMean: 0, topMean: 0, lowMean: 0, topSubject: "-", lowSubject: "-", records: 0, groupedByAssessment: {}, missingExamsList: [], streamDiscrepancies: [] };

    const assessment = assessmentFilter?.value || "all";
    const isAllAssessments = assessment === "all";

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
    const assessment = assessmentFilter?.value || "all";
    const isAllAssessments = assessment === "all";

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
    const targetStream = (selectedStreamMode === "assigned") ? user.assignedStream : null;
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
      const avgPoints = scores.length ? totalPoints / scores.length : 0;
      
      const pMean = prevStudentMeans[s.admissionNo];
      const progress = (pMean !== undefined && pMean > 0) ? (mean - pMean) : null;
      
      return { ...s, total, mean, totalPoints, avgPoints, progress };
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

    // Fix: Calculate actual min/max means from the student array
    // This ensures topMean and lowMean reflect the actual student performance, not just subject averages
    let topMean = 0;
    let lowMean = 0;
    if (studentArray.length > 0) {
      const means = studentArray.map(s => s.mean);
      topMean = Math.max(...means);
      lowMean = Math.min(...means);
    }

    let topSubject = "-", lowSubject = "-";
    let topVal = -Infinity, lowVal = Infinity;
    subjects.forEach(sub => {
      const v = subjectMeans[sub];
      if (v > topVal) { topVal = v; topSubject = sub; }
      if (v < lowVal) { lowVal = v; lowSubject = sub; }
    });

    return { studentArray, subjects: sortedSubjects, subjectMeans, classMean, topMean, lowMean, topSubject, lowSubject, records: studentArray.length, groupedByAssessment, missingExamsList: Object.values(missingExamsMap).sort((a,b) => a.name.localeCompare(b.name)), streamDiscrepancies };
  }

  // ===== CALCULATE SENIOR SCHOOL STATS (Component-Based) =====
  function calculateSeniorSchoolStats(filtered, roster = [], selectedStreamMode = "all") {
    if (!filtered.length && !roster.length) {
      return { studentArray: [], groupedByAssessment: {}, subjects: [], classMean: 0, records: 0, topSubject: '-', lowSubject: '-', subjectMeans: {}, missingExamsList: [], streamDiscrepancies: [] };
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
          if (subName && subName !== 'null') {
            streamExpectedSubjectsMap[stream].add(subName);
            allSubjectsInGrade.add(subName);
            subjectsSet.add(subName);
          }
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
        if (!subjectName || subjectName === 'null') return; // Skip if no name found or is the string 'null'
        
        subjectsSet.add(subjectName);
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
    const assessment = assessmentFilter?.value || "all";
    const isAllAssessments = assessment === "all";

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
    const targetStream = (selectedStreamMode === "assigned") ? user.assignedStream : null;
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
      const avgPoints = scores.length ? totalPoints / scores.length : 0;
      
      return { ...s, total, mean, totalPoints, avgPoints };
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

    let topSubject = "-", lowSubject = "-";
    let topVal = -Infinity, lowVal = Infinity;
    allSubjects.forEach(sub => {
      const v = subjectMeans[sub];
      if (v > topVal) { topVal = v; topSubject = sub; }
      if (v < lowVal) { lowVal = v; lowSubject = sub; }
    });
  
    return {
      studentArray,
      groupedByAssessment,
      subjects: allSubjects,
      classMean,
      records: studentArray.length,
      subjectMeans,
      topSubject,
      lowSubject,
      missingExamsList: Object.values(missingExamsMap).sort((a,b) => a.name.localeCompare(b.name)),
      streamDiscrepancies
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
  function renderRankingTable(stats) {
    if (!stats.studentArray.length) { rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>"; return; }
    let html = "";
    Object.keys(stats.groupedByAssessment).forEach(assessmentKey => {
      const arr = stats.groupedByAssessment[assessmentKey];
      if (!arr.length) return;
      let assessLabel = getAssessmentLabel(assessmentKey);

      html += `<h4>Assessment ${assessLabel}</h4>`;
      html += `<table style="border-collapse: collapse; width: 100%; border:1px solid #000; margin-bottom: 15px;">
        <thead><tr><th>Rank</th><th>Name</th><th>Assessment</th>`;
      stats.subjects.forEach(sub => html += `<th>${sub}</th>`);
      html += `<th>Total Marks</th><th>Progress</th><th>Total Points</th><th>Avg Points</th><th>Performance Level</th></tr></thead><tbody>`;
      arr.forEach(s => { // Use getAssessmentLabel for row as well
        let assessLabelRow = getAssessmentLabel(s.assessment);

        let progressHtml = '<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>';
        if (s.progress !== null) {
            const diff = s.progress;
            if (diff > 0.1) progressHtml = `<span style="color:#10b981; font-weight:700;">+${diff.toFixed(1)}</span>`;
            else if (diff < -0.1) progressHtml = `<span style="color:#ef4444; font-weight:700;">${diff.toFixed(1)}</span>`;
            else progressHtml = `<span style="color:#3498db; font-size:0.8rem;">-</span>`;
        }

        html += `<tr><td>${s.rank}</td><td>${s.name}</td><td>${assessLabelRow}</td>`;
        stats.subjects.forEach(sub => {
          const score = s.subjects[sub];
          const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
          const display = isAbs ? '<span style="color:#ef4444; font-weight:700;">ABS</span>' : score;
          html += `<td>${display}</td>`;
        });
        html += `<td>${s.total}</td><td style="text-align:center;">${progressHtml}</td><td><strong>${s.totalPoints}</strong></td><td>${s.avgPoints.toFixed(2)}</td><td>${window.cbcUtils.getSubdivision(s.mean, s.grade)}</td></tr>`;
      });

      // Calculate Totals and Means for Footer
      const groupTotalMarks = arr.reduce((acc, s) => acc + s.total, 0);
      const groupTotalPoints = arr.reduce((acc, s) => acc + s.totalPoints, 0);
      const groupAvgPointsSum = arr.reduce((acc, s) => acc + s.avgPoints, 0);
      const groupMeanSum = arr.reduce((acc, s) => acc + s.mean, 0);
      const groupCount = arr.length || 1;

      html += `</tbody><tfoot style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #000;">`;
      
      // TOTAL Row
      html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">TOTAL:</td>`;
      stats.subjects.forEach(sub => {
        const subSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        html += `<td style="text-align: center; padding: 8px;">${subSum.toFixed(0)}</td>`;
      });
      html += `<td style="text-align: center; padding: 8px;">${groupTotalMarks.toFixed(0)}</td>`;
      html += `<td style="text-align: center; padding: 8px;">${groupTotalPoints}</td>`;
      html += `<td style="text-align: center; padding: 8px;">${groupAvgPointsSum.toFixed(1)}</td>`;
      html += `<td></td></tr>`;

      // MEAN Row
      html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">MEAN:</td>`;
      stats.subjects.forEach(sub => {
        const subSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        const subCount = arr.filter(s => s.subjects[sub] !== undefined).length || 1;
        html += `<td style="text-align: center; padding: 8px;">${(subSum / subCount).toFixed(1)}</td>`;
      });
      html += `<td style="text-align: center; padding: 8px;">${(groupTotalMarks / groupCount).toFixed(1)}</td>`;
      html += `<td style="text-align: center; padding: 8px;">${(groupTotalPoints / groupCount).toFixed(1)}</td>`;
      html += `<td style="text-align: center; padding: 8px;">${(groupAvgPointsSum / groupCount).toFixed(2)}</td>`;
      html += `<td style="text-align: center; padding: 8px; color: #1a237e;">${window.cbcUtils.getSubdivision(groupMeanSum / groupCount, arr[0]?.grade)}</td>`;
      html += `</tr></tfoot></table>`;

// ===== TIE-AWARE TOP & LOW STUDENTS =====
const highestPoints = arr.length ? arr[0].totalPoints : 0;
const lowestPoints = arr.length ? arr[arr.length - 1].totalPoints : 0;

const tiedTop = arr.filter(s => s.totalPoints === highestPoints);
const tiedLow = arr.filter(s => s.totalPoints === lowestPoints);

// Format names
const topNames = tiedTop.map(s => `${s.name} (${s.total} marks, Avg: ${s.mean.toFixed(1)}%)`).join("; ");
const lowNames = tiedLow.map(s => `${s.name} (${s.total} marks, Avg: ${s.mean.toFixed(1)}%)`).join("; ");

// Class mean for AI
const classAvgPoints = arr.reduce((a, s) => a + s.avgPoints, 0) / arr.length;
const aiFeedback = generateAIFeedback(classAvgPoints);

// ===== OUTPUT =====
html += `
  <div class="ai-feedback">
    🏆 <strong>Top ${tiedTop.length > 1 ? "Students (Tied)" : "Student"}:</strong><br>
    ${topNames}<br><br>

    ⚠️ <strong>Lowest ${tiedLow.length > 1 ? "Students (Tied)" : "Student"}:</strong><br>
    ${lowNames}<br><br>

    <strong>AI Feedback:</strong><br>
    ${aiFeedback}
  </div>
`;
    });
    rankingTableWrap.innerHTML = html;
  }

  function renderSubjectMeansTable(stats) {
    if (!stats.subjects.length) { subjectTableWrap.innerHTML = "<div class='small'>No subject means found.</div>"; return; }
    let html = `<table style="border-collapse: collapse; width: 100%; border:1px solid #000;">
      <thead><tr>`;
    stats.subjects.forEach(sub => html += `<th>${sub}</th>`);
    html += `</tr></thead><tbody><tr>`;
    stats.subjects.forEach(sub => html += `<td>${Number(stats.subjectMeans[sub]).toFixed(2)}</td>`);
    html += `</tr></tbody></table>`;
    subjectTableWrap.innerHTML = html;
  }

  // ===== LOAD LEARNERS FOR EDITING =====
  async function loadLearnersForEditing() {
    const btn = document.querySelector("#editContainer").previousElementSibling?.querySelector("button[class*='primary-btn']") || generateBtn.nextElementSibling;
    
    if (assessmentFilter && assessmentFilter.value === "") {
      alert("Please select an assessment before loading learners for editing.");
      return;
    }

    if(btn) { btn.disabled = true; btn.textContent = "Loading..."; }
    
    try {
      // Hide analysis view, show edit view
      rankingTableWrap.style.display = 'none';
      subjectTableWrap.style.display = 'none';
      const chartEl = document.getElementById("classTrendChart");
      if (chartEl && chartEl.parentElement) chartEl.parentElement.style.display = 'none'; // Hide chart container
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
        document.getElementById('editContainer').style.display='none';
        document.getElementById('editContainer').innerHTML = ""; // Clear content to free memory
        document.getElementById('rankingTableWrap').style.display='block';
        document.getElementById('subjectTableWrap').style.display='block';
        // Show chart again
        const chartEl = document.getElementById("classTrendChart");
        if (chartEl && chartEl.parentElement) chartEl.parentElement.style.display = 'block'; 
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
      if(btn) { btn.disabled = false; btn.textContent = "Load Learners (Edit)"; }
    }
  }

  // ===== GENERATE REPORT =====
  async function generateReport() {
    if (assessmentFilter && assessmentFilter.value === "") {
      alert("Please select an assessment first.");
      return;
    }

    console.log("[Analysis] Generate Report clicked");
    generateBtn.textContent = "Generating...";
    generateBtn.disabled = true;

    try {
      const [filtered, rosterResponse] = await Promise.all([
        getFilteredMarks(),
        fetch(`${API_BASE}/enrollments/class/${user.classGrade}?limit=1000`, { headers: { Authorization: `Bearer ${window.authService?.getToken()}` } }).then(r => r.json())
      ]);
      
      const roster = rosterResponse.students || (Array.isArray(rosterResponse) ? rosterResponse : []);
      console.log("[Analysis] Filtered marks count:", filtered.length);

      if (filtered.length === 0) {
        console.warn("[Analysis] No marks found for the selected filters");
        rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>";
        subjectTableWrap.innerHTML = "<div class='small'>No subject means found.</div>";
        classMeanEl.textContent = "-";
        topMeanEl.textContent = "-";
        lowMeanEl.textContent = "-";
        topSubjectEl.textContent = "-";
        lowSubjectEl.textContent = "-";
        recordsCountEl.textContent = "0";
        renderTrendChartWithData([]); // Pass empty array to hide and destroy
      } else {
        const gradeNum = parseInt(gradeFilter?.value) || 0;
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

        if (!isSeniorSchool) {
          const stats = calculateStats(filtered, roster, streamFilterSelect?.value);
          renderRankingTable(stats);
          renderSubjectMeansTable(stats);
          classMeanEl.textContent = stats.classMean.toFixed(2);
          topMeanEl.textContent = stats.topMean.toFixed(2);
          lowMeanEl.textContent = stats.lowMean.toFixed(2);
          topSubjectEl.textContent = stats.topSubject;
          lowSubjectEl.textContent = stats.lowSubject;
          recordsCountEl.textContent = stats.records;
          renderTrendChartWithData(filtered, false);
          renderMissingExamsTable(stats.missingExamsList, stats.streamDiscrepancies);
        } else {
          const stats = calculateSeniorSchoolStats(filtered, roster, streamFilterSelect?.value);
          renderSeniorSchoolAnalysis(stats);
          renderSubjectMeansTable(stats);
          classMeanEl.textContent = stats.classMean.toFixed(2);
          topMeanEl.textContent = stats.records > 0 ? Math.max(...stats.studentArray.map(s => s.mean)).toFixed(2) : "-";
          lowMeanEl.textContent = stats.records > 0 ? Math.min(...stats.studentArray.map(s => s.mean)).toFixed(2) : "-";
          
          topSubjectEl.textContent = stats.topSubject;
          lowSubjectEl.textContent = stats.lowSubject;
          recordsCountEl.textContent = stats.records;
          renderTrendChartWithData(filtered, true);
          renderMissingExamsTable(stats.missingExamsList, stats.streamDiscrepancies);
        }
      }
    } catch (err) {
      console.error("[Analysis] Error in generateReport:", err);
      alert("Error generating report: " + err.message);
    } finally {
      generateBtn.textContent = "Generate Report";
      generateBtn.disabled = false;
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
      html += `<h3>📊 CLASS RANKING - ${assessLabel} (By Final Weighted Score)</h3>`;
      html += "<table style='border-collapse: collapse; width: 100%; border:1px solid #ddd; margin-bottom: 30px;'>";
      
      // Render headers
      html += "<thead><tr style='background:#337ab7;color:black;font-weight:bold;'>";
      html += "<th style='border:1px solid #ddd;padding:8px;'>Rank</th>";
      html += "<th style='border:1px solid #ddd;padding:8px;'>Admission No</th>";
      html += "<th style='border:1px solid #ddd;padding:8px;'>Student Name</th>";
      currentSubjects.forEach(sub => {
        html += `<th style='border:1px solid #ddd;padding:8px;'>${sub}</th>`;
      });
      html += "<th style='border:1px solid #ddd;padding:8px;'>Total Points</th>";
      html += "<th style='border:1px solid #ddd;padding:8px;'>Performance Level</th>";
      html += "</tr></thead>";
      
      // Render body
      html += "<tbody>";
      group.forEach(s => {
        const subLevel = window.cbcUtils.getSubdivision(s.mean, s.grade);
        const mainLevel = window.cbcUtils.getPerformanceLevel(s.mean, s.grade);
        const bg = s.rank % 2 === 0 ? "#f9f9f9" : "#fff";
        
        html += `<tr style='background:${bg};'>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.rank}</td>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.admissionNo}</td>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${s.name}</td>`;
        
        currentSubjects.forEach(sub => {
          const score = s.subjects[sub];
          const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
          const display = isAbs ? '<span style="color:#ef4444; font-weight:700;">ABS</span>' : score.toFixed(1);
          html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'>${display}</td>`;
        });
        
        html += `<td style='border:1px solid #ddd;padding:8px;text-align:center;'><strong>${s.totalPoints}</strong></td>`;
        html += `<td style='border:1px solid #ddd;padding:8px;'>${subLevel} (${window.cbcUtils.getPerformanceLabel(mainLevel)})</td>`;
        html += "</tr>";
      });

      // Calculate Totals and Means for Senior Footer
      const groupTotalPoints = group.reduce((acc, s) => acc + s.totalPoints, 0);
      const groupMeanSum = group.reduce((acc, s) => acc + s.mean, 0);
      const groupCount = group.length || 1;

      html += `</tbody><tfoot style="background-color: #f2f2f2; font-weight: bold; border-top: 2px solid #337ab7;">`;
      
      // TOTAL Row
      html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">TOTAL:</td>`;
      currentSubjects.forEach(sub => {
        const subSum = group.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        html += `<td style="border:1px solid #ddd;padding:8px;text-align:center;">${subSum.toFixed(0)}</td>`;
      });
      html += `<td style="border:1px solid #ddd;padding:8px;text-align:center;">${groupTotalPoints}</td>`;
      html += `<td></td></tr>`;

      // MEAN Row
      html += `<tr><td colspan="3" style="text-align: right; padding: 8px;">MEAN:</td>`;
      currentSubjects.forEach(sub => {
        const subSum = group.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
        const subCount = group.filter(s => s.subjects[sub] !== undefined).length || 1;
        html += `<td style="border:1px solid #ddd;padding:8px;text-align:center;">${(subSum / subCount).toFixed(1)}</td>`;
      });
      html += `<td style="border:1px solid #ddd;padding:8px;text-align:center;">${(groupTotalPoints / groupCount).toFixed(1)}</td>`;
      html += `<td style="border:1px solid #ddd;padding:8px;text-align:center; color: #1a237e;">${window.cbcUtils.getSubdivision(groupMeanSum / groupCount, group[0]?.grade)}</td>`;
      html += `</tr></tfoot></table>`;
    });
    
    rankingTableWrap.innerHTML = html;
  
  }
 // subjectTableWrap is now populated by renderSubjectMeansTable
  function renderMissingExamsTable(missingList, streamDiscrepancies = []) {
    if (!missingExamsTableWrap) {
      missingExamsTableWrap = document.createElement("div");
      missingExamsTableWrap.id = "missingExamsTableWrap";
      missingExamsTableWrap.className = "card";
      subjectTableWrap.parentNode.insertBefore(missingExamsTableWrap, subjectTableWrap.nextSibling);
    }

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
    const subheader = `Grade: ${user.classGrade || "-"} | Term: ${termFilter.value || "-"} | Year: ${yearFilter.value || "-"} | Assessment: ${assessmentLabel}`;
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
        head = [["Rank", "Name", ...currentSubjects, "Points", "Level"]];
        body = arr.map(s => [
          s.rank ?? "-",
          s.name,
          ...currentSubjects.map(sub => {
            const score = s.subjects[sub];
            const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
            return isAbs ? "ABS" : score.toFixed(1);
          }),
          s.totalPoints ?? "-",
          window.cbcUtils.getSubdivision(s.mean, s.grade)
        ]);
        
        const totalRow = ["", "TOTAL:"];
        const meanRow = ["", "MEAN:"];
        currentSubjects.forEach(sub => {
          const sSum = arr.reduce((acc, s) => acc + (s.subjects[sub] || 0), 0);
          const sCnt = arr.filter(s => s.subjects[sub] !== undefined).length || 1;
          totalRow.push(sSum.toFixed(0));
          meanRow.push((sSum / sCnt).toFixed(1));
        });
        const gPoints = arr.reduce((acc, s) => acc + (s.totalPoints || 0), 0);
        const gMean = arr.reduce((acc, s) => acc + (s.mean || 0), 0) / (arr.length || 1);
        totalRow.push(gPoints.toFixed(0), "");
        meanRow.push((gPoints / (arr.length || 1)).toFixed(1), window.cbcUtils.getSubdivision(gMean, arr[0]?.grade));
        foot = [totalRow, meanRow];
    } else {
        head = [["Rank", "Student", ...subjects, "Total Marks", "Total Points", "Avg Points", "Performance Level"]];
        body = arr.map(s => [
          s.rank ?? "-",
          s.name || "Unnamed",
          ...subjects.map(sub => {
            const score = s.subjects[sub];
            const isAbs = score === undefined || score === null || String(score).trim().toUpperCase() === "X";
            return isAbs ? "ABS" : score;
          }),
          s.total ?? 0,
          s.totalPoints ?? 0,
          s.avgPoints.toFixed(2),
          window.cbcUtils.getSubdivision(s.mean, s.grade)
        ]);

        const fTotalMarks = arr.reduce((acc, s) => acc + s.total, 0);
        const fTotalPoints = arr.reduce((acc, s) => acc + s.totalPoints, 0);
        const fAvgPoints = arr.reduce((acc, s) => acc + s.avgPoints, 0);
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
        totalRow.push(fTotalMarks.toFixed(0), fTotalPoints, fAvgPoints.toFixed(1), "");
        meanRow.push((fTotalMarks / fCount).toFixed(1), (fTotalPoints / fCount).toFixed(1), (fAvgPoints / fCount).toFixed(2), window.cbcUtils.getSubdivision(fMeanSum / fCount, arr[0]?.grade));
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
    doc.autoTable({
       startY: yPos + 10,
       head: [["Subject", "Mean Score"]],
       body: subjects.map(sub => [sub.charAt(0).toUpperCase() + sub.slice(1), stats.subjectMeans[sub]?.toFixed(2) || "0.00"]),
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
        const teacherName = localStorage.getItem("teacherName") || user?.name || "Teacher";
        const dateGenerated = new Date().toLocaleString();
        doc.text(`${teacherName} | Date: ${dateGenerated}`, 40, pageHeight - 20);
      }
    }

    doc.save(`Class_Report_Grade_${user.classGrade || "-"}.pdf`);

  } catch (err) {
    console.error("PDF export error:", err);
    alert("Failed to generate PDF");
  }
}

  // ===== TREND CHART =====
  function renderTrendChartWithData(filtered, isSeniorSchool = false) {
    const chartCanvas = document.getElementById("classTrendChart");
    const chartContainer = chartCanvas?.parentElement;

    if (typeof Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => renderTrendChartWithData(filtered, isSeniorSchool);
      document.head.appendChild(script);
      return;
    }

    // If no data or canvas, hide container and destroy old chart
    if (!chartCanvas || !filtered.length) {
      if (chartContainer) chartContainer.style.display = 'none';
      if (window.trendChart) window.trendChart.destroy();
      return;
    }

    // If we have data, ensure container is visible before rendering
    if (chartContainer) chartContainer.style.display = 'block';
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
      const studentAverages = group.students.map(stu => {
        if (isSeniorSchool) {
          const finalScores = stu.subjects.map(s => s.finalScore).filter(score => score !== null && score !== undefined);
          return finalScores.length ? finalScores.reduce((sum, score) => sum + score, 0) / finalScores.length : 0;
        } else {
          const scores = stu.subjects.map(s => (s.score === null || s.score === "X") ? 0 : Number(s.score));
          return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
        }
      });
      return studentAverages.length ? (studentAverages.reduce((x, y) => x + y, 0) / studentAverages.length) : 0;
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
});
