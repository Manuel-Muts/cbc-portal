// ===== ANALYSIS.JS(CLASSTEACHERS) =====

// ===== CBC GRADING HELPERS =====
const CBC_WEIGHTS = {
  continuousAssessment: 0.30,
  projectWork: 0.20,
  endTermExam: 0.50
};

function scoreToPerformanceLevel(score) {
  if (score >= 70) return "EE";
  if (score >= 60) return "ME";
  if (score >= 40) return "AE";
  return "BE";
}

function getPerformanceLevelLabel(level) {
  const labels = {
    EE: "Exceeding Expectations",
    ME: "Meeting Expectations",
    AE: "Approaching Expectations",
    BE: "Below Expectations"
  };
  return labels[level] || "Unknown";
}

//JUNIOR SCHOOL
function calculateSeniorSchoolFinalScore(mark) {
  if (!mark) return null;
  
  const ca = mark.continuousAssessment;
  const pw = mark.projectWork;
  const et = mark.endTermExam;

  if ((ca === null || ca === undefined) && (pw === null || pw === undefined) && (et === null || et === undefined)) {
    return null;
  }

  const caVal = ca !== null && ca !== undefined ? Number(ca) : 0;
  const pwVal = pw !== null && pw !== undefined ? Number(pw) : 0;
  const etVal = et !== null && et !== undefined ? Number(et) : 0;

  const finalScore = (caVal * CBC_WEIGHTS.continuousAssessment) +
                     (pwVal * CBC_WEIGHTS.projectWork) +
                     (etVal * CBC_WEIGHTS.endTermExam);

  return Math.round(finalScore * 10) / 10;
}

document.addEventListener("DOMContentLoaded", () => {
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
  const onlyMySubjects = document.getElementById("onlyMySubjects");
  const assessmentFilter = document.getElementById("assessmentFilter");

  const rankingTableWrap = document.getElementById("rankingTableWrap");
  const subjectTableWrap = document.getElementById("subjectTableWrap");
  const classMeanEl = document.getElementById("classMean");
  const topMeanEl = document.getElementById("topMean");
  const lowMeanEl = document.getElementById("lowMean");
  const topSubjectEl = document.getElementById("topSubject");
  const lowSubjectEl = document.getElementById("lowSubject");
  const recordsCountEl = document.getElementById("recordsCount");

  const token = localStorage.getItem("token");
  let user = null;

  // ===== AUTH CHECK =====
  try {
    const stored = localStorage.getItem("loggedInUser");
    if (!stored || !token) return showNotAllowed();
    user = JSON.parse(stored);
  } catch {
    localStorage.removeItem("loggedInUser");
    return showNotAllowed();
  }

  const roles = user.roles || [];
  if (!user?.isClassTeacher && !roles.includes("classteacher")) return showNotAllowed();
  user.subjects = Array.isArray(user.subjects) ? user.subjects : [];

  function showNotAllowed() {
    notAllowedEl?.classList.remove("hidden");
    analysisWrap?.classList.add("hidden");
  }

  function showAnalysis() {
    notAllowedEl?.classList.add("hidden");
    analysisWrap?.classList.remove("hidden");
  }

  // ===== HELPERS =====
  function getPerformanceLevel(mean) {
    if (mean >= 80) return "EE";
    if (mean >= 60) return "ME";
    if (mean >= 40) return "AE";
    return "BE";
  }

  function generateAIFeedback(mean) {
    if (mean >= 80) return "🚀 Outstanding performance! Encourage advanced tasks and peer mentoring.";
    if (mean >= 60) return "👍 Good performance. Reinforce collaborative learning and creative thinking.";
    if (mean >= 40) return "⚠️ Average performance. Focus on targeted interventions for weaker areas.";
    return "🔴 Below average. Plan personalized learning and extra support sessions.";
  }

  
  // ===== FETCH SCHOOL =====
  async function fetchSchoolInfo() {
    try {
      const res = await fetch("http://localhost:5000/api/my-school", {
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
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("token");
    window.location.href = "index.html";
  });
  exportPdfBtn?.addEventListener("click", exportPdf);

  // ===== FETCH USER PROFILE =====
  const fetchUserAndAllocations = async () => {
    try {
      const userRes = await fetch("http://localhost:5000/api/users/user", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!userRes.ok) throw new Error("Unauthorized");
      const profile = await userRes.json();

      // Require schoolId for class-teacher flows
      if (!profile?.schoolId) {
        console.error("Profile missing schoolId:", profile);
        return showNotAllowed();
      }

      let classGrade = profile.classGrade;

      if (!classGrade) {
        const allocRes = await fetch("http://localhost:5000/api/users/allocations", {
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
     
      
      // ===== LOAD SCHOOL HEADER =====
      const school = await fetchSchoolInfo();
      if (!school) return;

      const nameEl = document.getElementById("schoolName");
      const logoEl = document.getElementById("schoolLogo");
      const addressEl = document.getElementById("schoolAddress");

      if (nameEl) nameEl.textContent = `${school.name} — Class Analysis`;
      if (addressEl && school.address) addressEl.textContent = school.address;

      // ===== LOGO RESOLUTION (FIXED) =====
      if (logoEl && school.logo) {
        const BACKEND_URL = "http://localhost:5000";
        let logoPath = school.logo.trim();

        logoEl.crossOrigin = "anonymous";

        if (/^https?:\/\//i.test(logoPath)) {
          logoEl.src = logoPath;
        } else {
          logoPath = logoPath.replace(/^\/+/, "");
          if (!logoPath.startsWith("uploads/")) {
            logoPath = `uploads/${logoPath}`;
          }
          logoEl.src = `${BACKEND_URL}/${logoPath}`;
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

  async function getFilteredMarks() {
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
    if (streamFilterSelect?.value === "assigned" && user.assignedStream) {
      // "My Stream Only" - filter by the teacher's assigned stream
      params.append("stream", user.assignedStream);
    } else {
      // "All Leaners (Whole Class)" - fetch all students in the grade regardless of stream
      params.append("stream", "");
    }

    console.log("[Analysis] Fetching marks with params:", Object.fromEntries(params.entries()));

    try {
      const res = await fetch(`http://localhost:5000/api/marks/by-grade?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        showNotAllowed();
        return [];
      }
      if (!res.ok) throw new Error("Failed to fetch marks");

      const data = await res.json();

      console.log("[Analysis] Received data:", data.length, "records");

      const normalized = Array.isArray(data) ? data.map(m => ({
        admissionNo: m.admissionNo,
        studentName: m.studentName || "Unnamed",
        grade: m.grade || user.classGrade,
        stream: m.stream || null,
        term: Number(m.term) || 0,
        year: Number(m.year) || 0,
        assessment: String(m.assessment),
        subjects: Array.isArray(m.subjects) ? m.subjects.map(s => ({ subject: String(s.subject), score: Number(s.score) || 0 })) : [],
        course: m.course || null,
        continuousAssessment: m.continuousAssessment || null,
        projectWork: m.projectWork || null,
        endTermExam: m.endTermExam || null,
        finalScore: m.finalScore || null
      })) : [];

      console.log("[Analysis] Normalized to:", normalized.length, "records");
      return normalized;
    } catch (err) {
      console.error("[Analysis] Error fetching marks:", err);
      return [];
    }
  }

  // ===== CALCULATE STATS =====
  function calculateStats(filtered) {
    if (!filtered.length) return { studentArray: [], subjects: [], subjectMeans: {}, classMean: 0, topMean: 0, lowMean: 0, topSubject: "-", lowSubject: "-", records: 0, groupedByAssessment: {} };

    const subjectsSet = new Set();
    const students = {};
    filtered.forEach(m => {
      const key = `${m.admissionNo}_${m.assessment}_${m.term}_${m.year}`;
      m.subjects.forEach(s => subjectsSet.add(s.subject));

      if (!students[key]) students[key] = { admissionNo: m.admissionNo, name: m.studentName || "Unnamed", grade: m.grade, assessment: m.assessment, term: m.term, year: m.year, subjects: {} };
      m.subjects.forEach(s => { students[key].subjects[s.subject] = Number(s.score) || 0; });
    });

    const studentArray = Object.values(students).map(s => {
      const scores = Object.values(s.subjects);
      const total = scores.reduce((a, b) => a + b, 0);
      const mean = scores.length ? total / scores.length : 0;
      return { ...s, total, mean };
    });

    const groupedByAssessment = {};
    studentArray.forEach(s => {
      if (!groupedByAssessment[s.assessment]) groupedByAssessment[s.assessment] = [];
      groupedByAssessment[s.assessment].push(s);
    });

    Object.values(groupedByAssessment).forEach(arr => {
      arr.sort((a, b) => b.total - a.total);
      let prevTotal = null, prevRank = 0, currentRank = 0;
      arr.forEach(stu => {
        currentRank++;
        if (stu.total === prevTotal) stu.rank = prevRank;
        else { stu.rank = currentRank; prevRank = currentRank; prevTotal = stu.total; }
      });
    });

    const subjectTotals = {}, subjectCounts = {};
    filtered.forEach(m => m.subjects.forEach(s => {
      subjectTotals[s.subject] = (subjectTotals[s.subject] || 0) + Number(s.score);
      subjectCounts[s.subject] = (subjectCounts[s.subject] || 0) + 1;
    }));

    const subjects = Array.from(subjectsSet);
    const subjectMeans = {};
    subjects.forEach(sub => { subjectMeans[sub] = (subjectTotals[sub] || 0) / (subjectCounts[sub] || 1); });

    const classMean = studentArray.length ? studentArray.reduce((a, s) => a + s.mean, 0) / studentArray.length : 0;
    const topMean = studentArray[0]?.mean ?? 0;
    const lowMean = studentArray[studentArray.length - 1]?.mean ?? 0;

    let topSubject = "-", lowSubject = "-";
    let topVal = -Infinity, lowVal = Infinity;
    subjects.forEach(sub => {
      const v = subjectMeans[sub];
      if (v > topVal) { topVal = v; topSubject = sub; }
      if (v < lowVal) { lowVal = v; lowSubject = sub; }
    });

    return { studentArray, subjects, subjectMeans, classMean, topMean, lowMean, topSubject, lowSubject, records: studentArray.length, groupedByAssessment };
  }

  // ===== CALCULATE SENIOR SCHOOL STATS (Component-Based) =====
  function calculateSeniorSchoolStats(filtered) {
    if (!filtered.length) return { students: [], courseMeans: {}, componentAverages: {}, performanceDistribution: {}, classMean: 0, records: 0 };

    const coursesSet = new Set();
    const students = {};
    let caSum = 0, pwSum = 0, etSum = 0, caCount = 0, pwCount = 0, etCount = 0;

    filtered.forEach(m => {
      const key = `${m.admissionNo}_${m.assessment}_${m.term}_${m.year}`;
      
      if (m.course) coursesSet.add(m.course);

      if (!students[key]) {
        students[key] = {
          admissionNo: m.admissionNo,
          name: m.studentName || "Unnamed",
          grade: m.grade,
          assessment: m.assessment,
          term: m.term,
          year: m.year,
          courses: {}
        };
      }

      // Store component scores per course
      if (!students[key].courses[m.course]) {
        students[key].courses[m.course] = {
          course: m.course,
          continuousAssessment: m.continuousAssessment,
          projectWork: m.projectWork,
          endTermExam: m.endTermExam,
          finalScore: calculateSeniorSchoolFinalScore(m),
          performanceLevel: scoreToPerformanceLevel(calculateSeniorSchoolFinalScore(m))
        };
      }

      // Aggregate components
      if (m.continuousAssessment !== null && m.continuousAssessment !== undefined) {
        caSum += Number(m.continuousAssessment);
        caCount++;
      }
      if (m.projectWork !== null && m.projectWork !== undefined) {
        pwSum += Number(m.projectWork);
        pwCount++;
      }
      if (m.endTermExam !== null && m.endTermExam !== undefined) {
        etSum += Number(m.endTermExam);
        etCount++;
      }
    });

    // Calculate student overall performance
    const studentArray = Object.values(students).map(s => {
      const courseScores = Object.values(s.courses).map(c => c.finalScore || 0).filter(v => v > 0);
      const mean = courseScores.length ? courseScores.reduce((a, b) => a + b) / courseScores.length : 0;
      return { ...s, mean, totalScore: courseScores.reduce((a, b) => a + b, 0) };
    });

    // Rank students
    studentArray.sort((a, b) => b.mean - a.mean);
    let prevMean = null, prevRank = 0, currentRank = 0;
    studentArray.forEach(stu => {
      currentRank++;
      if (stu.mean === prevMean) stu.rank = prevRank;
      else { stu.rank = currentRank; prevRank = currentRank; prevMean = stu.mean; }
    });

    // Course means
    const courseMeans = {};
    const courseData = {};
    filtered.forEach(m => {
      if (!courseData[m.course]) courseData[m.course] = { ca: 0, pw: 0, et: 0, caCount: 0, pwCount: 0, etCount: 0, scores: [] };
      if (m.continuousAssessment !== null) { courseData[m.course].ca += Number(m.continuousAssessment); courseData[m.course].caCount++; }
      if (m.projectWork !== null) { courseData[m.course].pw += Number(m.projectWork); courseData[m.course].pwCount++; }
      if (m.endTermExam !== null) { courseData[m.course].et += Number(m.endTermExam); courseData[m.course].etCount++; }
      const fs = calculateSeniorSchoolFinalScore(m);
      if (fs) courseData[m.course].scores.push(fs);
    });

    Object.entries(courseData).forEach(([course, data]) => {
      courseMeans[course] = {
        ca: data.caCount > 0 ? (data.ca / data.caCount).toFixed(1) : 0,
        pw: data.pwCount > 0 ? (data.pw / data.pwCount).toFixed(1) : 0,
        et: data.etCount > 0 ? (data.et / data.etCount).toFixed(1) : 0,
        mean: data.scores.length > 0 ? (data.scores.reduce((a, b) => a + b) / data.scores.length).toFixed(2) : 0
      };
    });

    const componentAverages = {
      continuousAssessment: caCount > 0 ? (caSum / caCount).toFixed(1) : 0,
      projectWork: pwCount > 0 ? (pwSum / pwCount).toFixed(1) : 0,
      endTermExam: etCount > 0 ? (etSum / etCount).toFixed(1) : 0
    };

    // Performance distribution
    const performanceDistribution = { EE: 0, ME: 0, AE: 0, BE: 0 };
    studentArray.forEach(s => {
      const level = scoreToPerformanceLevel(s.mean);
      if (performanceDistribution[level] !== undefined) performanceDistribution[level]++;
    });

    const classMean = studentArray.length ? studentArray.reduce((a, s) => a + s.mean, 0) / studentArray.length : 0;

    return { studentArray, courseMeans, componentAverages, performanceDistribution, classMean, records: studentArray.length };
  }


  // ===== RENDER TABLES =====
  function renderRankingTable(stats) {
    if (!stats.studentArray.length) { rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>"; return; }
    let html = "";
    Object.keys(stats.groupedByAssessment).forEach(assessmentKey => {
      const arr = stats.groupedByAssessment[assessmentKey];
      if (!arr.length) return;
      const assessLabel = assessmentKey === "5" ? "End Term" : assessmentKey;

      html += `<h4>Assessment ${assessLabel}</h4>`;
      html += `<table style="border-collapse: collapse; width: 100%; border:1px solid #000; margin-bottom: 15px;">
        <thead><tr><th>Rank</th><th>Name</th><th>Assessment</th>`;
      stats.subjects.forEach(sub => html += `<th>${sub}</th>`);
      html += `<th>Total Marks</th><th>Performance Level</th></tr></thead><tbody>`;
      arr.forEach(s => {
        const assessLabelRow = s.assessment === "5" ? "End Term" : s.assessment;
        html += `<tr><td>${s.rank}</td><td>${s.name}</td><td>${assessLabelRow}</td>`;
        stats.subjects.forEach(sub => html += `<td>${s.subjects[sub] ?? '-'}</td>`);
        html += `<td>${s.total}</td><td>${getPerformanceLevel(s.mean)}</td></tr>`;
      });
      html += "</tbody></table>";

// ===== TIE-AWARE TOP & LOW STUDENTS =====
const highestTotal = arr.length ? arr[0].total : 0;
const lowestTotal = arr.length ? arr[arr.length - 1].total : 0;

const tiedTop = arr.filter(s => s.total === highestTotal);
const tiedLow = arr.filter(s => s.total === lowestTotal);

// Format names
const topNames = tiedTop.map(s => `${s.name} (${s.total} marks, Avg: ${s.mean.toFixed(1)}%)`).join("; ");
const lowNames = tiedLow.map(s => `${s.name} (${s.total} marks, Avg: ${s.mean.toFixed(1)}%)`).join("; ");

// Class mean for AI
const classMean = arr.reduce((a, s) => a + s.mean, 0) / arr.length;
const aiFeedback = generateAIFeedback(classMean);

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

  // ===== GENERATE REPORT =====
  async function generateReport() {
    console.log("[Analysis] Generate Report clicked");
    generateBtn.textContent = "Generating...";
    generateBtn.disabled = true;

    try {
      const filtered = await getFilteredMarks();
      console.log("[Analysis] Filtered marks count:", filtered.length);
      
      if (!filtered.length) {
        console.warn("[Analysis] No marks found for the selected filters");
        alert("No marks found for the selected filters. Please check your grade, term, year, and assessment selections.");
        rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>";
        subjectTableWrap.innerHTML = "<div class='small'>No subject means found.</div>";
        classMeanEl.textContent = "-"; topMeanEl.textContent = "-"; lowMeanEl.textContent = "-";
        topSubjectEl.textContent = "-"; lowSubjectEl.textContent = "-"; recordsCountEl.textContent = "0";
        if (window.trendChart) window.trendChart.destroy();
        generateBtn.textContent = "Generate Report";
        generateBtn.disabled = false;
        return;
      }

    // Check if senior school (Grade 10-12)
    const gradeNum = parseInt(gradeFilter?.value) || 0;
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    // ===== JUNIOR SCHOOL (1-9) REPORT =====
    if (!isSeniorSchool) {
      const stats = calculateStats(filtered);

      // Render tables
      renderRankingTable(stats);
      renderSubjectMeansTable(stats);

      // Update summary stats
      classMeanEl.textContent = stats.classMean.toFixed(2);
      topMeanEl.textContent = stats.topMean.toFixed(2);
      lowMeanEl.textContent = stats.lowMean.toFixed(2);
      topSubjectEl.textContent = stats.topSubject;
      lowSubjectEl.textContent = stats.lowSubject;
      recordsCountEl.textContent = stats.records;

      // Render chart
      renderTrendChartWithData(filtered);
    }
    // ===== SENIOR SCHOOL (10-12) REPORT =====
    else {
      const stats = calculateSeniorSchoolStats(filtered);

      // Render senior school tables
      renderSeniorSchoolAnalysis(stats);

      // Update summary stats
      classMeanEl.textContent = stats.classMean.toFixed(2);
      topMeanEl.textContent = stats.records > 0 ? Math.max(...stats.studentArray.map(s => s.mean)).toFixed(2) : "-";
      lowMeanEl.textContent = stats.records > 0 ? Math.min(...stats.studentArray.map(s => s.mean)).toFixed(2) : "-";
      
      // Top and low components
      topSubjectEl.textContent = Object.entries(stats.componentAverages).reduce((max, [k, v]) => v > max.val ? { name: k, val: v } : max, { name: "N/A", val: 0 }).name;
      lowSubjectEl.textContent = Object.entries(stats.componentAverages).reduce((min, [k, v]) => v > 0 && v < min.val ? { name: k, val: v } : min, { name: "N/A", val: 100 }).name;
      recordsCountEl.textContent = stats.records;

      if (window.trendChart) window.trendChart.destroy();
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
    // Ranking table with final scores
    let html = "<h3>📊 CLASS RANKING (By Final Weighted Score)</h3>";
    html += "<table style='border-collapse: collapse; width: 100%; border:1px solid #ddd;'>";
    html += "<thead><tr style='background:#4CAF50;color:white;'><th style='border:1px solid #ddd;padding:8px;'>Rank</th><th style='border:1px solid #ddd;padding:8px;'>Student Name</th><th style='border:1px solid #ddd;padding:8px;'>Avg Final Score</th><th style='border:1px solid #ddd;padding:8px;'>Performance Level</th></tr></thead><tbody>";
    
    stats.studentArray.forEach(s => {
      const level = scoreToPerformanceLevel(s.mean);
      const bg = s.rank % 2 === 0 ? "#f9f9f9" : "#fff";
      html += `<tr style='background:${bg};'><td style='border:1px solid #ddd;padding:8px;'>${s.rank}</td><td style='border:1px solid #ddd;padding:8px;'>${s.name}</td><td style='border:1px solid #ddd;padding:8px;text-align:center;'><strong>${s.mean.toFixed(2)}%</strong></td><td style='border:1px solid #ddd;padding:8px;'>${level} (${getPerformanceLevelLabel(level)})</td></tr>`;
    });
    html += "</tbody></table>";
    rankingTableWrap.innerHTML = html;

    // Component analysis table
    let compHtml = "<h3>📈 COMPONENT PERFORMANCE ANALYSIS</h3>";
    compHtml += "<table style='border-collapse: collapse; width: 100%; border:1px solid #ddd;'>";
    compHtml += "<thead><tr style='background:#2196F3;color:white;'><th style='border:1px solid #ddd;padding:8px;'>Component</th><th style='border:1px solid #ddd;padding:8px;'>Class Average</th><th style='border:1px solid #ddd;padding:8px;'>Weight</th><th style='border:1px solid #ddd;padding:8px;'>Status</th></tr></thead><tbody>";
    
    const components = [
      { name: "Continuous Assessment (CATs, Quizzes, Practicals)", key: "continuousAssessment", weight: "30%" },
      { name: "Project Work / Performance Tasks", key: "projectWork", weight: "20%" },
      { name: "End-Term Examination", key: "endTermExam", weight: "50%" }
    ];

    components.forEach((comp, idx) => {
      const avg = Number(stats.componentAverages[comp.key]);
      const status = avg >= 65 ? "✅ Good" : avg >= 50 ? "⚠️ Average" : "❌ Needs Attention";
      const bg = idx % 2 === 0 ? "#f9f9f9" : "#fff";
      compHtml += `<tr style='background:${bg};'><td style='border:1px solid #ddd;padding:8px;'>${comp.name}</td><td style='border:1px solid #ddd;padding:8px;text-align:center;'><strong>${avg}%</strong></td><td style='border:1px solid #ddd;padding:8px;text-align:center;'>${comp.weight}</td><td style='border:1px solid #ddd;padding:8px;'>${status}</td></tr>`;
    });
    compHtml += "</tbody></table>";
    subjectTableWrap.innerHTML = compHtml;
  }

  // ===== EXPORT PDF =====
async function exportPdf() {
  try {
    const filtered = await getFilteredMarks();
    if (!filtered.length) return alert("No data to export.");

    const stats = calculateStats(filtered);
    const subjects = stats.subjects || [];

    const pdfContainer = document.createElement("div");
    pdfContainer.id = "pdf-temp-container";
    pdfContainer.style.padding = "20px";
    pdfContainer.style.fontFamily = "Arial, sans-serif";
    pdfContainer.style.fontSize = "10px";
    pdfContainer.style.width = "100%";
    pdfContainer.style.background = "#fff";
    document.body.appendChild(pdfContainer);

    // HEADER
    const header = document.createElement("div");
    header.style.textAlign = "center";
    header.style.marginBottom = "15px";
    header.innerHTML = `
      <h1 style="margin:0;font-size:18px;">CLASS REPORT</h1>
      <p style="margin:5px 0 0 0;">
        Grade: ${user.classGrade || "-"} |
        Term: ${termFilter.value || "-"} |
        Year: ${yearFilter.value || "-"} |
        Assessment: ${
          assessmentFilter.value === "5" ? "End Term" :
          assessmentFilter.value === "all" ? "All" : assessmentFilter.value
        }
      </p>
    `;
    pdfContainer.appendChild(header);

    // RANKING TABLE
    const rankingTable = document.createElement("table");
    rankingTable.style.width = "100%";
    rankingTable.style.borderCollapse = "collapse";
    rankingTable.style.marginBottom = "20px";

    // HEADER ROW - capitalize all
    let headHTML = "<tr>";
    ["Rank", "Student", ...subjects.map(s => s.charAt(0).toUpperCase() + s.slice(1)), "Total Marks", "Performance Level"].forEach(h => {
      headHTML += `<th style="border:1px solid #000;padding:5px;background:#4CAF50;color:#fff;font-weight:bold;text-align:center;">${h}</th>`;
    });
    headHTML += "</tr>";
    rankingTable.innerHTML = headHTML;

    const grouped = stats.groupedByAssessment || {};
    Object.keys(grouped).forEach(assessmentKey => {
      const arr = grouped[assessmentKey];
      if (!arr.length) return;
      arr.forEach((student, idx) => {
        const bg = idx % 2 === 0 ? "#f9f9f9" : "#fff"; // alternating rows
        const row = document.createElement("tr");
        row.style.background = bg;
        const rowData = [
            student.rank ?? "-",
            student.name || "Unnamed",
            ...subjects.map(sub => student.subjects[sub] ?? "-"),
            student.total ?? 0,
            getPerformanceLevel(student.mean)   

        ];
        rowData.forEach(val => {
          const td = document.createElement("td");
          td.style.border = "1px solid #000";
          td.style.padding = "5px";
          td.style.textAlign = "center";
          td.textContent = val;
          row.appendChild(td);
        });
        rankingTable.appendChild(row);
      });
    });
    pdfContainer.appendChild(rankingTable);

    // SUBJECT MEANS TABLE - capitalize subject names
    const subjectTable = document.createElement("table");
    subjectTable.style.width = "50%";
    subjectTable.style.borderCollapse = "collapse";
    subjectTable.style.marginBottom = "20px";
    subjectTable.innerHTML = `
      <tr>
        <th style="border:1px solid #000;padding:5px;background:#2196F3;color:#fff;font-weight:bold;text-align:center;">Subject</th>
        <th style="border:1px solid #000;padding:5px;background:#2196F3;color:#fff;font-weight:bold;text-align:center;">Mean</th>
      </tr>
    `;
    subjects.forEach((sub, idx) => {
      const bg = idx % 2 === 0 ? "#f1f1f1" : "#fff";
      subjectTable.innerHTML += `
        <tr style="background:${bg}">
          <td style="border:1px solid #000;padding:5px;text-align:center;">${sub.charAt(0).toUpperCase() + sub.slice(1)}</td>
          <td style="border:1px solid #000;padding:5px;text-align:center;">${stats.subjectMeans[sub].toFixed(2)}</td>
        </tr>
      `;
    });
    pdfContainer.appendChild(subjectTable);

    // QUICK STATS
    const statsDiv = document.createElement("div");
    statsDiv.style.marginBottom = "15px";
    statsDiv.style.padding = "10px";
    statsDiv.style.border = "1px solid #000";
    statsDiv.style.background = "#f0f0f0";
    statsDiv.innerHTML = `
      <strong>Class Mean:</strong> ${stats.classMean.toFixed(2)} <br><br>
      <strong>Top Mean:</strong> ${stats.topMean.toFixed(2)} |
      <strong>Low Mean:</strong> ${stats.lowMean.toFixed(2)} <br><br>
      <strong>Top Subject:</strong> ${stats.topSubject.charAt(0).toUpperCase() + stats.topSubject.slice(1)} |
      <strong>Low Subject:</strong> ${stats.lowSubject.charAt(0).toUpperCase() + stats.lowSubject.slice(1)} <br><br>
      <strong>Records:</strong> ${stats.records}
    `;
    pdfContainer.appendChild(statsDiv);

    // FOOTER
    const teacherName = localStorage.getItem("teacherName") || user?.name || "Teacher";
    const dateGenerated = new Date().toLocaleString();
    const footer = document.createElement("div");
    footer.style.textAlign = "center";
    footer.style.marginTop = "25px";
    footer.style.fontSize = "9px";
    footer.textContent = `Generated by: ${teacherName} | Date: ${dateGenerated}`;
    pdfContainer.appendChild(footer);

    // GENERATE PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "pt", "a4");
    await doc.html(pdfContainer, {
      callback: function(doc) {
        doc.save(`Class_Report_Grade_${user.classGrade || "-"}.pdf`);
        document.body.removeChild(pdfContainer);
      },
      x: 10,
      y: 10,
      width: 780,
      windowWidth: pdfContainer.scrollWidth
    });

  } catch (err) {
    console.error("PDF export error:", err);
    alert("Failed to generate PDF");
  }
}

  // ===== TREND CHART =====
  function renderTrendChartWithData(filtered) {
    const ctx = document.getElementById("classTrendChart")?.getContext("2d");
    if (!ctx || !filtered.length) return;

    const assessmentsSet = new Set(filtered.map(s => s.assessment));
    const assessments = Array.from(assessmentsSet).sort((a, b) => Number(a) - Number(b));

    const classMeans = assessments.map(a => {
      const subset = filtered.filter(s => s.assessment === a);
      const means = subset.map(stu => {
        const total = stu.subjects.reduce((sum, subj) => sum + (Number(subj.score) || 0), 0);
        return stu.subjects.length ? total / stu.subjects.length : 0;
      });
      return means.length ? (means.reduce((x, y) => x + y, 0) / means.length) : 0;
    });

    if (window.trendChart) window.trendChart.destroy();
    window.trendChart = new Chart(ctx, {
      type: "line",
      data: { labels: assessments.map(a => a === "5" ? "End Term" : a), datasets: [{ label: "Class Mean", data: classMeans, borderColor: "blue", fill: false, tension: 0.2 }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, title: { display: true, text: "Class Mean (%)" } }, x: { title: { display: true, text: "Assessment" } } } }
    });
  }
});
