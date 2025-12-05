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
  function getCbcLevel(mean) {
    if (mean >= 80) return "EE";
    if (mean >= 60) return "ME";
    if (mean >= 40) return "AE";
    return "BE";
  }

  function generateAIFeedback(mean) {
    if (mean >= 85) return "🚀 Outstanding performance! Encourage advanced tasks and peer mentoring.";
    if (mean >= 70) return "👍 Good performance. Reinforce collaborative learning and creative thinking.";
    if (mean >= 50) return "⚠️ Average performance. Focus on targeted interventions for weaker areas.";
    return "🔴 Below average. Plan personalized learning and extra support sessions.";
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

    } catch (err) {
      console.error("Error loading profile:", err);
      localStorage.clear();
      showNotAllowed();
    }
  };

  fetchUserAndAllocations();

  // ===== FETCH MARKS =====
  async function getFilteredMarks() {
    if (!user?.classGrade) return [];

    const term = (termFilter?.value || "").trim();
    const year = (yearFilter?.value || "").trim();
    const assessment = assessmentFilter?.value === "all" ? "" : (assessmentFilter?.value || "").trim();

    const params = new URLSearchParams({ grade: user.classGrade, term, year, assessment });

    try {
      const res = await fetch(`http://localhost:5000/api/marks/by-grade?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch marks");
      const data = await res.json();

      const normalized = Array.isArray(data) ? data.map(m => ({
        admissionNo: m.admissionNo,
        studentName: m.studentName || "Unnamed",
        grade: m.grade || user.classGrade,
        term: Number(m.term) || 0,
        year: Number(m.year) || 0,
        assessment: String(m.assessment),
        subjects: Array.isArray(m.subjects) ? m.subjects.map(s => ({ subject: String(s.subject), score: Number(s.score) || 0 })) : []
      })) : [];

      if (onlyMySubjects?.value === "yes" && user.subjects?.length) {
        normalized.forEach(student => {
          student.subjects = student.subjects.filter(s => user.subjects.includes(s.subject));
        });
      }

      return normalized;
    } catch (err) {
      console.error("Error fetching marks:", err);
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
      html += `<th>Total Marks</th><th>CBC Level</th></tr></thead><tbody>`;
      arr.forEach(s => {
        const assessLabelRow = s.assessment === "5" ? "End Term" : s.assessment;
        html += `<tr><td>${s.rank}</td><td>${s.name}</td><td>${assessLabelRow}</td>`;
        stats.subjects.forEach(sub => html += `<td>${s.subjects[sub] ?? '-'}</td>`);
        html += `<td>${s.total}</td><td>${getCbcLevel(s.mean)}</td></tr>`;
      });
      html += "</tbody></table>";

      const topStudent = arr[0];
      const lowStudent = arr[arr.length - 1];
      const classMean = arr.reduce((a, s) => a + s.mean, 0) / arr.length;
      const aiFeedback = generateAIFeedback(classMean);

      html += `<div class="ai-feedback">
        🏆 Top Student: ${topStudent.name} — ${topStudent.total} marks (Avg: ${topStudent.mean.toFixed(1)}%)<br>
        ⚠️ Lowest Student: ${lowStudent.name} — ${lowStudent.total} marks (Avg: ${lowStudent.mean.toFixed(1)}%)<br><br>
        ${aiFeedback}
      </div>`;
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
    generateBtn.textContent = "Generating...";
    generateBtn.disabled = true;

    const filtered = await getFilteredMarks();
    if (!filtered.length) {
      alert("No marks found for the selected filters.");
      rankingTableWrap.innerHTML = "<div class='small'>No ranking data found.</div>";
      subjectTableWrap.innerHTML = "<div class='small'>No subject means found.</div>";
      classMeanEl.textContent = "-"; topMeanEl.textContent = "-"; lowMeanEl.textContent = "-";
      topSubjectEl.textContent = "-"; lowSubjectEl.textContent = "-"; recordsCountEl.textContent = "0";
      if (window.trendChart) window.trendChart.destroy();
      generateBtn.textContent = "Generate Report";
      generateBtn.disabled = false;
      return;
    }

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

    generateBtn.textContent = "Generate Report";
    generateBtn.disabled = false;
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
    ["Rank", "Student", ...subjects.map(s => s.charAt(0).toUpperCase() + s.slice(1)), "Total Marks", "Mean"].forEach(h => {
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
          student.mean?.toFixed(2) ?? "0.00"
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

    // AI FEEDBACK (no emojis)
    const aiDiv = document.createElement("div");
    aiDiv.style.marginTop = "15px";
    aiDiv.style.padding = "10px";
    aiDiv.style.border = "1px solid #000";
    aiDiv.style.background = "#fffbcc";

    const topStudent = stats.studentArray[0] || { name: "-", total: 0, mean: 0 };
    const lowStudent = stats.studentArray[stats.studentArray.length - 1] || { name: "-", total: 0, mean: 0 };

    function generatePdfAIFeedback(mean) {
      if (mean >= 85) return "Outstanding performance! Encourage advanced tasks and peer mentoring.";
      if (mean >= 70) return "Good performance. Reinforce collaborative learning and creative thinking.";
      if (mean >= 50) return "Average performance. Focus on targeted interventions for weaker areas.";
      return "Below average. Plan personalized learning and extra support sessions.";
    }

    aiDiv.innerHTML = `
      <strong>Top Student:</strong> ${topStudent.name} — ${topStudent.total} marks (Avg: ${topStudent.mean.toFixed(1)}%) |
      <strong>Lowest Student:</strong> ${lowStudent.name} — ${lowStudent.total} marks (Avg: ${lowStudent.mean.toFixed(1)}%)<br><br>
      ${generatePdfAIFeedback(stats.classMean)}
    `;
    pdfContainer.appendChild(aiDiv);

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
