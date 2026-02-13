document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const token = localStorage.getItem("token");

  if (!user || !token) {
    alert("Please log in again.");
    window.location.href = "login.html";
    return;
  }

// -----------------------------
// Fetch School Info
// -----------------------------
// Set backend URL dynamically (adjust for production via env variable if needed)
const BACKEND_URL = window.BACKEND_URL || "http://localhost:5000";

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

       // normalize logo path
        if (logoPath.startsWith("http")) {
          schoolLogoElem.src = logoPath;
       } else {
         if (!logoPath.startsWith("/")) logoPath = "/" + logoPath;
         if (!logoPath.startsWith("/uploads")) logoPath = "/uploads" + logoPath;
         schoolLogoElem.src = `${BACKEND_URL}${logoPath}`;
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
  const getPerformanceLevel = score => score >= 80 ? "Exceeding Expectation (EE)" : score >= 60 ? "Meeting Expectation (ME)" : score >= 40 ? "Approaching Expectation (AE)" : "Below Expectation (BE)";
  const getSubjectRemark = score => score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Average" : "Needs Improvement";
  const getTeacherComment = mean => mean >= 80 ? "Great progress this term!" : mean >= 60 ? "Good effort, stay focused." : mean >= 40 ? "You can do better with more effort." : "Work harder next term.";
  const getHeadteacherComment = mean => mean >= 80 ? "Keep up the outstanding work." : mean >= 60 ? "A commendable performance." : mean >= 40 ? "Needs improvement in some areas." : "Put in more effort to improve.";

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
        <th>Course</th>
        <th>Continuous Assessment (30%)</th>
        <th>Project Work (20%)</th>
        <th>End-Term Exam (50%)</th>
        <th>Final Score</th>
        <th>Performance Level</th>
      `;
    }

    const tbody = document.querySelector("#marksTable tbody");
    tbody.innerHTML = "";

    studentMarks.forEach(m => {
      const finalScore = calculateSeniorSchoolFinalScore(m);
      const ca = m.continuousAssessment !== null && m.continuousAssessment !== undefined ? m.continuousAssessment : "-";
      const pw = m.projectWork !== null && m.projectWork !== undefined ? m.projectWork : "-";
      const et = m.endTermExam !== null && m.endTermExam !== undefined ? m.endTermExam : "-";
      const fs = finalScore !== null ? finalScore : "-";
      const perfLevel = finalScore !== null ? getPerformanceLevel(finalScore) : "N/A";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.course || "").replace(/-/g, " "))}</td>
        <td>${ca}${ca !== "-" ? "%" : ""}</td>
        <td>${pw}${pw !== "-" ? "%" : ""}</td>
        <td>${et}${et !== "-" ? "%" : ""}</td>
        <td><strong>${fs}${fs !== "-" ? "%" : ""}</strong></td>
        <td>${perfLevel}</td>
      `;
      tbody.appendChild(tr);

      if (finalScore !== null) {
        let totalFinalScore = 0;
        let validScoreCount = 0;
        studentMarks.forEach(mark => {
          const fs = calculateSeniorSchoolFinalScore(mark);
          if (fs !== null) {
            totalFinalScore += fs;
            validScoreCount++;
          }
        });
        const meanFinalScore = validScoreCount > 0 ? (totalFinalScore / validScoreCount).toFixed(1) : 0;
        setText("performanceLevel", getPerformanceLevel(meanFinalScore));
        setText("teacherComment", getTeacherComment(meanFinalScore));
        setText("headComment", getHeadteacherComment(meanFinalScore));
      }
    });
  }
  // ===== JUNIOR SCHOOL (1-9): Subject-Based Report =====
  else {
    const tbody = document.querySelector("#marksTable tbody");
    tbody.innerHTML = "";
    let total = 0;

    studentMarks.forEach(m => {
      const score = Number(m.score || 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.subject || "").replace(/-/g, " "))}</td>
        <td>${score}</td>
        <td>${getPerformanceLevel(score)}</td>
        <td>${getSubjectRemark(score)}</td>
      `;
      tbody.appendChild(tr);
      total += score;
    });

    const mean = studentMarks.length ? (total / studentMarks.length).toFixed(1) : 0;

    setText("performanceLevel", getPerformanceLevel(mean));
    setText("teacherComment", getTeacherComment(mean));
    setText("headComment", getHeadteacherComment(mean));
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
