document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const token = localStorage.getItem("token");

  if (!user || !token) {
    alert("Please log in again.");
    window.location.href = "/login";
    return;
  }

// -----------------------------
// Fetch School Info
// -----------------------------
// Set backend URL dynamically (adjust for production via env variable if needed)
// Using API_BASE from config.js instead of BACKEND_URL
const BACKEND_URL = config.api.baseURL.replace('/api', ''); // Remove /api suffix to get base URL

if (token) {
  try {
    const schoolRes = await fetch(`${BACKEND_URL}/api/users/my-school`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (schoolRes.ok) {
      const school = await schoolRes.json();

      const schoolNameElem = document.getElementById("schoolName");
      const schoolLogoElem = document.getElementById("schoolLogo");
      const schoolAddressElem = document.getElementById("schoolAddress");

      // Display school name
      if (schoolNameElem) {
        schoolNameElem.textContent = school.name.toUpperCase();
      }

      // Display school logo
      if (schoolLogoElem) {
       schoolLogoElem.crossOrigin = "anonymous";
         let logoPath = school.logo || "";

       // Detect logo format: file path (legacy), HTTP URL, or base64 (new)
        if (logoPath.startsWith('/') || logoPath.includes('uploads/')) {
          // Legacy file path
          if (!logoPath.startsWith("/")) logoPath = "/" + logoPath;
          if (!logoPath.startsWith("/uploads")) logoPath = "/uploads" + logoPath;
          schoolLogoElem.src = `${BACKEND_URL}${logoPath}?t=${Date.now()}`;
        } else if (logoPath.startsWith("http")) {
          // Absolute URL
          schoolLogoElem.src = logoPath;
        } else if (logoPath) {
          // New base64 format - convert to data URL
          const mimeType = school.logoMimeType || 'image/png';
          schoolLogoElem.src = `data:${mimeType};base64,${logoPath}`;
        }

        schoolLogoElem.alt = school.name;
      }


      // Display school address
      if (schoolAddressElem) {
        schoolAddressElem.textContent = school.address || "";
      }

    } else {
      console.error("Failed to fetch school info:", schoolRes.status, schoolRes.statusText);
    }
  } catch (err) {
    console.error("Error fetching school info:", err);
  }
}

  // ---------------------------
  // FETCH STUDENT ENROLLMENT (Grade & Stream)
  // ---------------------------
  let studentEnrollment = null;
  try {
    const enrollmentRes = await fetch(`${BACKEND_URL}/api/enrollments/my-enrollment`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (enrollmentRes.ok) {
      studentEnrollment = await enrollmentRes.json();
      
      // Update user grade if available
      if (studentEnrollment.grade && !user.grade) {
        user.grade = studentEnrollment.grade;
        localStorage.setItem("loggedInUser", JSON.stringify(user));
      }
      
      // Display stream in student info if element exists
      const streamEl = document.getElementById("studentStream");
      if (streamEl) {
        streamEl.textContent = studentEnrollment.stream || "N/A";
      }
    } else {
      console.warn("Failed to fetch enrollment:", enrollmentRes.status);
    }
  } catch (err) {
    console.error("Enrollment fetch error:", err);
  }

  // ---------------------------
  // FETCH STUDENT MARKS
  // ---------------------------
  let marks = JSON.parse(localStorage.getItem("studentReportMarks") || "[]");
  if (!marks.length) marks = JSON.parse(localStorage.getItem("submittedMarks") || "[]");

  const studentMarks = marks.filter(m => m.admissionNo === user.admission);
  if (!studentMarks.length) {
    alert("No report data found for this student yet.");
    return;
  }

  // -----------------------------
  // Helper Functions
  // -----------------------------
  const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  const capitalizeWords = str => str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  
  const getPerformanceSubdivision = score => {
    if (score >= 90) return "EE1";
    if (score >= 75) return "EE2";
    if (score >= 58) return "ME1";
    if (score >= 41) return "ME2";
    if (score >= 31) return "AE1";
    if (score >= 21) return "AE2";
    if (score >= 11) return "BE1";
    return "BE2";
  };
  const getScorePoints = score => {
    if (score >= 90) return 8;
    if (score >= 75) return 7;
    if (score >= 58) return 6;
    if (score >= 41) return 5;
    if (score >= 31) return 4;
    if (score >= 21) return 3;
    if (score >= 11) return 2;
    return 1;
  };
  const getPerformanceLevel = score => {
    const sub = getPerformanceSubdivision(score);
    const label = score >= 75 ? "Exceeding Expectation" : score >= 41 ? "Meeting Expectation" : score >= 21 ? "Approaching Expectation" : "Below Expectation";
    return `${label} (${sub})`;
  };

  const getSubjectRemark = score => score >= 75 ? "Excellent" : score >= 41 ? "Good" : score >= 21 ? "Average" : "Needs Improvement";
  const getTeacherComment = mean => mean >= 75 ? "Great progress this term!" : mean >= 41 ? "Good effort, stay focused." : mean >= 21 ? "You can do better with more effort." : "Work harder next term.";
  const getHeadteacherComment = mean => mean >= 75 ? "Keep up the outstanding work." : mean >= 41 ? "A commendable performance." : mean >= 21 ? "Needs improvement in some areas." : "Put in more effort to improve.";
  
  const updateReportSummary = (mean, points) => {
    const summaryEl = document.querySelector(".summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="text-align:center;">
          <p style="font-size: 12px; color: #555; text-transform: uppercase; margin-bottom: 5px;">PERFORMANCE LEVEL</p>
          <p style="font-size: 14px; font-weight: bold; color: #1a237e; margin: 0;">${getPerformanceLevel(mean)}</p>
        </div>
        <div style="border-left: 1px solid #ccc; margin: 0 15px;"></div>
        <div style="text-align:center;">
          <p style="font-size: 12px; color: #555; text-transform: uppercase; margin-bottom: 5px;">TOTAL POINTS</p>
          <p style="font-size: 14px; font-weight: bold; color: #1a237e; margin: 0;">${points}</p>
        </div>
      `;
    }
    setText("teacherComment", getTeacherComment(mean));
    setText("headComment", getHeadteacherComment(mean));
  };

  // -----------------------------
  // AUTO-UPDATE GRADE FROM MARKS
  // -----------------------------
  const latestGradeRecord = studentMarks.find(m => m.grade);
  if (latestGradeRecord && latestGradeRecord.grade !== user.grade) {
    user.grade = latestGradeRecord.grade;
    localStorage.setItem("loggedInUser", JSON.stringify(user));
  }

  // -----------------------------
  // Student Info
  // -----------------------------
  setText("studentName", capitalizeWords(user.name || "Student Name"));
  setText("admissionNo", user.admission);
  setText("studentGrade", user.grade || "N/A");
  setText("reportDate", new Date().toLocaleDateString());

  // ===== Show pathway for Grade 10-11 students =====
  try {
    const gradeNum = parseInt(user.grade);
    if (gradeNum === 10 || gradeNum === 11) {
      // Find pathway from submitted marks
      const pathwayMark = studentMarks.find(m => m.pathway && String(m.pathway).trim());
      if (pathwayMark && pathwayMark.pathway) {
        // Create pathway element after student grade
        const studentGradeEl = document.getElementById("studentGrade");
        if (studentGradeEl) {
          let pathwayLineEl = document.getElementById("studentPathwayLine");
          if (!pathwayLineEl) {
            pathwayLineEl = document.createElement("p");
            pathwayLineEl.id = "studentPathwayLine";
            studentGradeEl.closest("p").insertAdjacentElement("afterend", pathwayLineEl);
          }
          pathwayLineEl.innerHTML = `<strong>Pathway:</strong> <span style="font-weight: bold; text-transform: uppercase; color: #111;">${String(pathwayMark.pathway).toUpperCase()}</span>`;
        }
      }
    }
  } catch (err) {
    console.error('Report pathway display error:', err);
  }

  // -----------------------------
  // Latest Term & Year
  // -----------------------------
  const termOrder = { "Term 1": 1, "Term 2": 2, "Term 3": 3 };
  const sortedMarks = [...studentMarks].sort(
    (a, b) => (b.year - a.year) || ((termOrder[b.term] || 0) - (termOrder[a.term] || 0))
  );

  const latestMark = sortedMarks[0];
  const currentYear = latestMark.year || new Date().getFullYear();

  if (!latestMark.term && document.getElementById("studentTerm")) document.getElementById("studentTerm").closest("p")?.remove();
  else setText("studentTerm", latestMark.term || "");
  if (!latestMark.year && document.getElementById("studentYear")) document.getElementById("studentYear").closest("p")?.remove();
  else setText("studentYear", currentYear);

  // ===== Determine if Senior School (Grade 10-12) =====
  const gradeNum = parseInt(user.grade);
  const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

  // Update report titles based on level (Head Teacher vs Principal)
  if (isSeniorSchool) {
    const sigLines = document.querySelectorAll(".signatures .signature-line p");
    if (sigLines.length > 1) sigLines[1].textContent = "Principal";

    const headCommentEl = document.getElementById("headComment");
    if (headCommentEl && headCommentEl.parentElement) {
      const labelStrong = headCommentEl.parentElement.querySelector("strong");
      if (labelStrong) labelStrong.textContent = "Principal's Comment:";
    }
  }

  // CBC Weights for senior school calculation
  const CBC_WEIGHTS = {
    continuousAssessment: 0.30,
    projectWork: 0.20,
    endTermExam: 0.50
  };

  function calculateSeniorSchoolFinalScore(mark) {
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

  // ===== SENIOR SCHOOL (10-12): Component-Based Report =====
  if (isSeniorSchool) {
    // Update table headers for senior school
    const thead = document.querySelector("#marksTable thead tr");
    if (thead) {
      thead.innerHTML = `
        <th>Subject</th>
        <th>Marks</th>
        <th>Points</th>
        <th>Performance Level</th>
        <th>Remarks</th>
      `;
    }

    const tbody = document.querySelector("#marksTable tbody");
    tbody.innerHTML = "";

    let totalFinalScore = 0;
    let validScoreCount = 0;
    let totalPoints = 0;

    studentMarks.forEach(m => {
      const finalScore = calculateSeniorSchoolFinalScore(m);
      const fs = finalScore !== null ? finalScore : "-";
      const points = finalScore !== null ? getScorePoints(finalScore) : "-";
      const perfLevel = finalScore !== null ? getPerformanceSubdivision(finalScore) : "N/A";
      const remark = finalScore !== null ? getSubjectRemark(finalScore) : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.course || "").replace(/-/g, " "))}</td>
        <td><strong>${fs}${fs !== "-" ? "%" : ""}</strong></td>
        <td>${points}</td>
        <td>${perfLevel}</td>
        <td>${remark}</td>
      `;
      tbody.appendChild(tr);

      if (finalScore !== null) {
        totalFinalScore += finalScore;
        totalPoints += getScorePoints(finalScore);
        validScoreCount++;
      }
    });
    
    const meanFinalScore = validScoreCount > 0 ? (totalFinalScore / validScoreCount).toFixed(1) : 0;
    updateReportSummary(meanFinalScore, totalPoints);
  }
  // ===== JUNIOR SCHOOL (1-9): Subject-Based Report =====
  else {
    const thead = document.querySelector("#marksTable thead tr");
    if (thead) {
      thead.innerHTML = `
        <th>Subject</th>
        <th>Marks</th>
        <th>Points</th>
        <th>Performance Level</th>
        <th>Remarks</th>
      `;
    }
    const tbody = document.querySelector("#marksTable tbody");
    tbody.innerHTML = "";
    let total = 0;
    let totalPoints = 0;

    studentMarks.forEach(m => {
      const score = Number(m.score || 0);
      const points = getScorePoints(score);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.subject || "").replace(/-/g, " "))}</td>
        <td>${score}%</td>
        <td>${points}</td>
        <td>${getPerformanceSubdivision(score)}</td>
        <td>${getSubjectRemark(score)}</td>
      `;
      tbody.appendChild(tr);
      total += score;
      totalPoints += points;
    });

    const mean = studentMarks.length ? (total / studentMarks.length).toFixed(1) : 0;
    
    updateReportSummary(mean, totalPoints);
  }

  // -----------------------------
  // SIDE-BY-SIDE LAYOUT: KEY + MARKS TABLE
  // -----------------------------
  const marksTable = document.getElementById("marksTable");
  const marksSection = marksTable ? marksTable.closest('section') : null;
  const remarksSection = document.querySelector('.remarks-section');

  if (marksSection && remarksSection) {
    const layoutContainer = document.createElement('div');
    layoutContainer.className = 'report-layout-container';

    const performanceKeyData = [
        { subdivision: 'EE1', range: '90-100', points: 8 },
        { subdivision: 'EE2', range: '75-89', points: 7 },
        { subdivision: 'ME1', range: '58-74', points: 6 },
        { subdivision: 'ME2', range: '41-57', points: 5 },
        { subdivision: 'AE1', range: '31-40', points: 4 },
        { subdivision: 'AE2', range: '21-30', points: 3 },
        { subdivision: 'BE1', range: '11-20', points: 2 },
        { subdivision: 'BE2', range: '0-10', points: 1 },
    ];

    const keyPanel = document.createElement('div');
    keyPanel.id = 'performanceKeySide';
    let keyTableHTML = `
        <h4>PERFORMANCE KEY</h4>
        <table>
            <thead><tr><th>Level</th><th>Range</th><th>Pts</th></tr></thead>
            <tbody>
    `;
    performanceKeyData.forEach(item => {
        keyTableHTML += `<tr><td>${item.subdivision}</td><td>${item.range}</td><td>${item.points}</td></tr>`;
    });
    keyTableHTML += `</tbody></table>`;
    keyPanel.innerHTML = keyTableHTML;

    layoutContainer.appendChild(keyPanel);
    layoutContainer.appendChild(marksSection);

    remarksSection.parentNode.insertBefore(layoutContainer, remarksSection);

    const oldKey = document.querySelector('.performance-key-section');
    if (oldKey) oldKey.remove();

  }

  // -----------------------------
  // Buttons
  // -----------------------------
  const reportElement = document.querySelector(".report-container");
  const downloadBtn = document.getElementById("downloadBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  if (refreshBtn) refreshBtn.addEventListener("click", () => window.location.reload());

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      document.querySelector(".report-controls").style.display = "none";
      const filename = `Report_${user.grade || "Grade"}_${latestMark.term || "Term"}_${currentYear}.pdf`;

      html2pdf()
        .set({
          margin: [0.3, 0.3, 0.3, 0.3],
          filename,
          image: { type: "jpeg", quality: 1 },
          html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(reportElement)
        .save()
        .then(() => document.querySelector(".report-controls").style.display = "block");
    });
  }
});
