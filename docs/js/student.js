document.addEventListener("DOMContentLoaded", async () => {
  // ---------------------------
  // AUTHENTICATION WITH TOKEN
  // ---------------------------
  const token = localStorage.getItem("token");
  if (!token) {
    console.warn("No token found in localStorage, redirecting to login.");
    window.location.href = "login.html";
    return;
  }

  let user;
try {
  console.log("Token found:", token);
  const res = await fetch("http://localhost:5000/api/users/user", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      console.warn("Token invalid or expired. Logging out...");
      localStorage.removeItem("token");
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
      return;
    } else {
      console.warn("Fetch error, keeping token. Status:", res.status);
    }
  }

const data = await res.json();
 user = data; // <-- this is the fix

  if (!user || user.role !== "student") {
    console.warn("User not a student or not found. Logging out...");
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
    return;
  }

  window.currentUser = user;
  console.log("Student logged in:", user.name);
  localStorage.setItem("loggedInUser", JSON.stringify(user));
} catch (err) {
  console.error("Auth error fetching /user:", err);
  alert("Could not verify session. Please try refreshing the page or log in again.");
  return;
}

  // ---------------------------
  // PERSONALIZED GREETING
  // ---------------------------
  const welcomeNameEl = document.getElementById("welcomeName");
  if (welcomeNameEl && user.name) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    welcomeNameEl.textContent = `${greeting}, ${user.name}`;
  }

  // ---------------------------
  // TOAST MESSAGE
  // ---------------------------
  const showToast = (message) => {
    const toast = document.getElementById("toastMessage");
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = "block";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => (toast.style.display = "none"), 600);
    }, 4000);
  };

  // ---------------------------
  // YEAR FILTER POPULATION
  // ---------------------------
  const yearFilter = document.getElementById("yearFilter");
  if (yearFilter) {
    for (let yr = 2025; yr <= 2090; yr++) {
      const option = document.createElement("option");
      option.value = yr;
      option.textContent = yr;
      yearFilter.appendChild(option);
    }
  }

  // ---------------------------
  // UTILITY FUNCTIONS
  // ---------------------------
  const getCBCLevel = (score) => (score >= 80 ? "EE" : score >= 60 ? "ME" : score >= 40 ? "AE" : "BE");

  const getSubjectAverages = (list) => {
    const subjects = {};
    list.forEach((m) => {
      const s = m.subject || "unknown";
      subjects[s] = subjects[s] || { total: 0, count: 0 };
      subjects[s].total += Number(m.score || 0);
      subjects[s].count++;
    });
    return Object.entries(subjects)
      .map(([s, v]) => ({ subject: s.replace(/-/g, " "), avg: v.total / v.count }))
      .sort((a, b) => b.avg - a.avg);
  };

  const generateTopStrengths = (list) =>
    getSubjectAverages(list)
      .slice(0, 3)
      .map((s) => `${s.subject} (${s.avg.toFixed(0)})`)
      .join(", ") || "N/A";

  const generateAreasToImprove = (list) =>
    getSubjectAverages(list)
      .slice(-3)
      .reverse()
      .map((s) => `${s.subject} (${s.avg.toFixed(0)})`)
      .join(", ") || "N/A";

  const generateWiseFeedback = (list) => {
    if (!list.length) return "No marks yet to generate feedback.";
    const avg = list.reduce((s, m) => s + Number(m.score || 0), 0) / list.length;
    const level = getCBCLevel(avg);
    let advice = "";
    if (avg >= 85)
      advice = "Excellent performance! Keep challenging yourself and consider helping classmates.";
    else if (avg >= 70)
      advice = "Good work! Focus on subjects needing improvement and maintain consistent study habits.";
    else if (avg >= 50)
      advice = "Fair performance. Prioritize weaker areas, practice regularly, and seek guidance.";
    else advice = "Performance below expectations. Seek extra support, focus on fundamentals, and stay disciplined.";
    return `CBC Level: ${level}. Advice: ${advice}`;
  };

  const getComment = (score, type) => {
    if (score >= 85) return type === "teacher" ? "Excellent performance. Keep it up!" : "Outstanding achievement. Proud of your effort!";
    if (score >= 70) return type === "teacher" ? "Good work, but room for improvement." : "Satisfactory performance. Encourage consistency.";
    if (score >= 50) return type === "teacher" ? "Needs improvement. Focus on weak areas." : "Performance below expectations. Monitor progress closely.";
    return type === "teacher" ? "Poor performance. Extra support recommended." : "Critical performance. Immediate attention required.";
  };

  const getAssessmentLabel = (value) => (value == 5 ? "End Term" : `Assessment ${value}`);

  const calculateRank = (list, allMarks) => {
    if (!list.length) return "N/A";
    const { grade, term, year, assessment } = list[0];
    const sameGroup = allMarks.filter((m) => m.grade === grade && m.term === term && m.year === year && m.assessment === assessment);
    const totals = {};
    sameGroup.forEach((m) => {
      if (!totals[m.admissionNo]) totals[m.admissionNo] = 0;
      totals[m.admissionNo] += Number(m.score || 0);
    });
    const sorted = Object.entries(totals).map(([adm, total]) => ({ adm, total })).sort((a, b) => b.total - a.total);
    const pos = sorted.findIndex((s) => s.adm === user.admission);
    return pos >= 0 ? `${pos + 1} / ${sorted.length}` : "N/A";
  };

  // ---------------------------
  // DISPLAY STUDENT MARKS
  // ---------------------------
  const displayStudentTables = async () => {
  const marksContainer = document.getElementById("studentMarks");
  const spinner = document.getElementById("loadingSpinner");

  const showSpinner = () => spinner && (spinner.style.display = "block");
  const hideSpinner = () => spinner && (spinner.style.display = "none");

  showSpinner();
  marksContainer.innerHTML = "";

  try {
    // ---------------------------
    // Get filter elements
    // ---------------------------
    const termEl = document.getElementById("termFilter");
    const yearEl = document.getElementById("yearFilter");
    const assessEl = document.getElementById("assessmentFilter");

    // Trim and get values
    let termValue = termEl ? termEl.value.trim() : "all";
    let yearValue = yearEl ? yearEl.value.trim() : "all";
    let assessValue = assessEl ? assessEl.value.trim() : "all";

    // Build query parameters
    const query = new URLSearchParams();
    if (termValue !== "all" && !isNaN(termValue)) query.set("term", Number(termValue));
    if (yearValue !== "all" && !isNaN(yearValue)) query.set("year", Number(yearValue));
    if (assessValue !== "all" && !isNaN(assessValue)) query.set("assessment", Number(assessValue));

    // ---------------------------
    // Fetch marks from backend
    // ---------------------------
    const res = await fetch(`http://localhost:5000/api/marks/student?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const allMarks = await res.json();

    if (!allMarks.length) {
      marksContainer.textContent = "No marks found for the selected filters.";
      hideSpinner();
      return;
    }

    // ---------------------------
    // Automatically set default filter values to latest record
    // ---------------------------
    const latest = allMarks.sort((a, b) => b.year - a.year || b.term - a.term || b.assessment - a.assessment)[0];
    if (termValue === "all" && termEl) termEl.value = latest.term;
    if (yearValue === "all" && yearEl) yearEl.value = latest.year;
    if (assessValue === "all" && assessEl) assessEl.value = latest.assessment;

    showToast(`📊 Latest: Term ${latest.term}, ${latest.year} (${latest.assessment == 5 ? "End Term" : "Assessment " + latest.assessment})`);

    // ---------------------------
    // Group marks by grade-term-year-assessment
    // ---------------------------
    const grouped = {};
    allMarks.forEach((m) => {
      const key = `${m.grade}_${m.term}_${m.year}_${m.assessment}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    Object.entries(grouped).forEach(([key, list]) => {
      const [grade, term, year, assess] = key.split("_");

      const wrapper = document.createElement("div");
      wrapper.classList.add("marks-group");

      wrapper.innerHTML = `
        <div class="marks-header">
          <p><strong>Full Name:</strong> ${user.name}</p>
          <p><strong>Admission No:</strong> ${user.admission}</p>
          <p><strong>Grade/Class:</strong> ${grade}</p>
          <p><strong>Term:</strong> ${term}</p>
          <p><strong>Year:</strong> ${year}</p>
          <p><strong>Assessment:</strong> ${getAssessmentLabel(assess)}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
      `;

      const syncBtn = document.createElement("button");
      syncBtn.textContent = "🔄 Sync This Report";
      syncBtn.classList.add("sync-btn");
      syncBtn.addEventListener("click", () => {
        localStorage.setItem("studentReportMarks", JSON.stringify(list));
        alert(`✅ Synced ${grade} ${term} (${year}) - ${getAssessmentLabel(assess)} to report form!`);
      });
      wrapper.appendChild(syncBtn);

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      thead.innerHTML = `<tr><th>Subject</th><th>Score</th><th>CBC Level</th></tr>`;
      const tbody = document.createElement("tbody");
      list.forEach((m) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${(m.subject || "").replace(/-/g, " ")}</td><td>${m.score}</td><td>${getCBCLevel(m.score)}</td>`;
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      wrapper.appendChild(table);

      const allScores = list.map((m) => Number(m.score || 0));
      const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;

      const summary = document.createElement("div");
      summary.classList.add("marks-summary");
      summary.innerHTML = `<p><strong>Average Score:</strong> ${avg.toFixed(2)}</p><p><strong>Overall Level:</strong> ${getCBCLevel(avg)}</p><p><strong>Class Rank:</strong> ${calculateRank(list, allMarks)}</p>`;
      wrapper.appendChild(summary);

      const bottom = document.createElement("div");
      bottom.classList.add("marks-bottom-summary");
      bottom.innerHTML = `
        <div class="highlights">
          <h4>Highlights</h4>
          <p><strong>Top Strengths:</strong> ${generateTopStrengths(list)}</p>
          <p><strong>Areas to Improve:</strong> ${generateAreasToImprove(list)}</p>
        </div>
        <div class="remarks">
          <h4>Teacher & Headteacher Remarks</h4>
          <p><strong>Class Teacher’s Remarks:</strong> ${getComment(avg, "teacher")}</p>
          <p><strong>Headteacher’s Remarks:</strong> ${getComment(avg, "headteacher")}</p>
        </div>
        <div class="ai-summary">
          <h4>AI Feedback Summary</h4>
          <p>${generateWiseFeedback(list)}</p>
        </div>
      `;
      wrapper.appendChild(bottom);

      marksContainer.appendChild(wrapper);
    });
  } catch (err) {
    console.error("Error fetching marks:", err);
    marksContainer.textContent = "Error fetching marks. Please try again later.";
  }

  hideSpinner();
};

  // ---------------------------
  // FILTER & REFRESH BUTTONS
  // ---------------------------
  document.getElementById("applyFiltersBtn")?.addEventListener("click", displayStudentTables);
  const refreshBtnEl = document.getElementById("refreshBtn");
  refreshBtnEl?.addEventListener("click", () => {
    refreshBtnEl.disabled = true;
    refreshBtnEl.classList.add("spinning");
    setTimeout(() => {
      displayStudentTables();
      refreshBtnEl.disabled = false;
      refreshBtnEl.classList.remove("spinning");
    }, 1000);
  });

  // ---------------------------
  // LOGOUT
  // ---------------------------
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    window.location.href = "index.html";
  });

  // ---------------------------
  // INITIAL DISPLAY
  // ---------------------------
  displayStudentTables();
});
