document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const token = localStorage.getItem("token");

  if (!user || !token) {
    alert("Please log in again.");
    window.location.href = "/login";
    return;
  }

  // Inject CSS to ensure signatures are visible and properly sized for embedding
  const sigStyle = document.createElement('style');
  sigStyle.textContent = `
    .report-container {
      padding: 10px 20px !important;
    }
    h2 { margin: 10px 0 5px 0 !important; font-size: 16px !important; }
    .student-info { margin-bottom: 10px !important; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .student-info p { margin: 2px 0 !important; font-size: 13px !important; }
    
    .signatures {
      margin-top: 15px !important;
      gap: 10px !important;
    }
    .signature-line {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-end !important;
      min-height: 50px !important;
      text-align: center !important;
      border-top: none !important; /* Remove the CSS border-top to use the span line instead */
    }
    .signature-line img {
      max-height: 40px !important;
      max-width: 150px !important;
      display: block !important;
      margin: 0 auto 2px auto !important;
      opacity: 1 !important;
      visibility: visible !important;
      object-fit: contain;
    }
    .signature-line span {
      display: block !important;
      margin: 0 !important;
      line-height: 0.8 !important;
    }
    .signature-line p {
      margin: 2px 0 0 0 !important;
      font-size: 12px !important;
      font-weight: 500 !important;
    }

    /* side-by-side Marks & Key Layout */
    .report-layout-container {
      display: flex !important;
      gap: 15px !important;
      align-items: flex-start !important;
      margin-bottom: 10px !important;
    }
    #performanceKeySide {
      flex: 0 0 140px !important;
      font-size: 10px !important;
    }
    #performanceKeySide table { width: 100%; border-collapse: collapse; }
    #performanceKeySide th, #performanceKeySide td { border: 1px solid #ccc; padding: 2px; text-align: center; }
    
    .marks-section { flex: 1 !important; margin: 0 !important; }
    #marksTable { font-size: 12px !important; text-align: center !important; }
    #marksTable th, #marksTable td { padding: 4px 8px !important; }
    #marksTable td:first-child, #marksTable th:first-child { text-align: left !important; }

    .remarks-container {
      display: flex !important;
      gap: 10px !important;
      margin-top: 5px !important;
      align-items: stretch !important;
    }
    .remark-item {
      flex: 1 !important;
      font-size: 12px !important;
      padding: 8px !important;
      background: #f9f9f9 !important;
      border-radius: 6px !important;
      border-left: 3px solid #1a237e !important;
    }
    .remark-item strong {
      display: block !important;
      margin-bottom: 3px !important;
      color: #1a237e !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
    }
    .remark-item p {
      margin: 0 !important;
      line-height: 1.4 !important;
      border-left: none !important; /* Override external styles */
      padding-left: 0 !important;
    }
  `;
  document.head.appendChild(sigStyle);

  // -----------------------------
  // Helper Functions (Moved up to prevent 'before initialization' errors)
  // -----------------------------
  const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  const capitalizeWords = str => str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

// Helper to convert image URL to base64 for reliable PDF embedding
async function getImageBase64(url) {
  if (!url) return null;
  try {
    // Prepend backend URL if the path is relative (e.g., /uploads/...)
    const absoluteUrl = (url.startsWith('http') || url.startsWith('data:')) 
      ? url 
      : `${config.api.baseURL.replace('/api', '')}${url.startsWith('/') ? '' : '/'}${url}`;

    const response = await fetch(absoluteUrl, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error converting image to Base64:", e);
    return null;
  }
}
  // -----------------------------
  // Data Resolution (Marks, Enrollment, School)
  // -----------------------------
  const BACKEND_URL = config.api.baseURL.replace('/api', '');
  let reportGrade = user.grade || "N/A";
  let reportStream = "";

  // 1. Fetch Local Marks (baseline data)
  let marks = JSON.parse(localStorage.getItem("studentReportMarks") || "[]");
  if (!marks.length) marks = JSON.parse(localStorage.getItem("submittedMarks") || "[]");

  const studentMarks = marks.filter(m => m.admissionNo === user.admission);
  if (!studentMarks.length) {
    alert("No report data found for this student yet.");
    return;
  }

  // Set baseline from marks (especially important for non-student users viewing reports)
  const latestMarkRecord = studentMarks[0];
  if (latestMarkRecord.grade) reportGrade = latestMarkRecord.grade;
  if (latestMarkRecord.stream) reportStream = latestMarkRecord.stream;

  // 2. Fetch School and Enrollment info in parallel for better performance
  try {
    const [schoolRes, enrollmentRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/users/my-school`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${BACKEND_URL}/api/enrollments/my-enrollment`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
    ]);

    // Process School Info & Headteacher Signature
    if (schoolRes && schoolRes.ok) {
      const school = await schoolRes.json();
      setText("schoolName", school.name.toUpperCase());
      setText("schoolAddress", school.address || "");

      const schoolLogoElem = document.getElementById("schoolLogo");
      if (schoolLogoElem && school.logo) {
        schoolLogoElem.crossOrigin = "anonymous";
        let logoPath = school.logo;
        if (logoPath.startsWith('/') || logoPath.includes('uploads/')) {
          logoPath = logoPath.startsWith("/uploads") ? logoPath : `/uploads${logoPath.startsWith("/") ? "" : "/"}${logoPath}`;
          schoolLogoElem.src = `${BACKEND_URL}${logoPath}`;
        } else if (logoPath.startsWith("http")) {
          schoolLogoElem.src = logoPath;
        } else {
          const mimeType = school.logoMimeType || 'image/png';
          schoolLogoElem.src = `data:${mimeType};base64,${logoPath}`;
        }
      }

      // Display Headteacher/Principal Signature
      const headSigElem = document.getElementById("headteacherSig");
      if (headSigElem && school.headteacherSignatureUrl) {
        const base64 = await getImageBase64(school.headteacherSignatureUrl);
        if (base64) {
          headSigElem.src = base64;
          headSigElem.style.display = "block";
        } else {
          headSigElem.src = school.headteacherSignatureUrl.startsWith('http') ? school.headteacherSignatureUrl : `${BACKEND_URL}${school.headteacherSignatureUrl.startsWith('/') ? '' : '/'}${school.headteacherSignatureUrl}`;
          headSigElem.style.display = "block";
        }
      }
    }

    // Process Enrollment (Refines grade/stream from official record)
    if (enrollmentRes && enrollmentRes.ok) {
      const enrollment = await enrollmentRes.json();
      if (enrollment.grade) reportGrade = enrollment.grade;
      if (enrollment.stream) reportStream = enrollment.stream;
      
      const streamEl = document.getElementById("studentStream");
      if (streamEl) streamEl.textContent = reportStream || "N/A";
    }

    // Sync user grade if it changed
    if (reportGrade !== user.grade && reportGrade !== "N/A") {
      user.grade = reportGrade;
      localStorage.setItem("loggedInUser", JSON.stringify(user));
    }

    // 3. Fetch Class Teacher Signature using determined grade/stream
    // The backend endpoint handles variant formats (e.g. "Grade 2W" or "2")
    if (reportGrade && reportGrade !== "N/A") {
      const teacherRes = await fetch(`${BACKEND_URL}/api/users/class-teacher?grade=${encodeURIComponent(reportGrade)}&stream=${encodeURIComponent(reportStream)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (teacherRes.ok) {
        const teacher = await teacherRes.json();
        const teacherSigElem = document.getElementById("classTeacherSig");
        if (teacherSigElem && teacher.signatureUrl) {
          const base64 = await getImageBase64(teacher.signatureUrl);
          if (base64) {
            teacherSigElem.src = base64;
            teacherSigElem.style.display = "block";
          } else {
            teacherSigElem.src = teacher.signatureUrl.startsWith('http') ? teacher.signatureUrl : `${BACKEND_URL}${teacher.signatureUrl.startsWith('/') ? '' : '/'}${teacher.signatureUrl}`;
            teacherSigElem.style.display = "block";
          }
        }
        setText("classTeacherNameLabel", teacher.name);
      }
    }
  } catch (err) {
    console.error("Error fetching report context data:", err);
  }

  // -----------------------------
  // Helper Functions
  // -----------------------------
  const getSubjectRemark = score => score >= 75 ? "Excellent" : score >= 41 ? "Good" : score >= 21 ? "Average" : "Needs Improvement";
  const getTeacherComment = mean => mean >= 75 ? "Great progress this term!" : mean >= 41 ? "Good effort, stay focused." : mean >= 21 ? "You can do better with more effort." : "Work harder next term.";
  const getHeadteacherComment = mean => mean >= 75 ? "Keep up the outstanding work." : mean >= 41 ? "A commendable performance." : mean >= 21 ? "Needs improvement in some areas." : "Put in more effort to improve.";
  
  const updateReportSummary = (mean, points) => {
    const summaryEl = document.querySelector(".summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="text-align:center;">
          <p style="font-size: 12px; color: #555; text-transform: uppercase; margin-bottom: 5px;">PERFORMANCE LEVEL</p>
          <p style="font-size: 14px; font-weight: bold; color: #1a237e; margin: 0;">${cbcUtils.getPerformanceLabel(cbcUtils.getPerformanceLevel(mean))} (${cbcUtils.getSubdivision(mean)})</p>
        </div>
        <div style="border-left: 1px solid #ccc; margin: 0 15px;"></div>
        <div style="text-align:center;">
          <p style="font-size: 12px; color: #555; text-transform: uppercase; margin-bottom: 5px;">TOTAL POINTS</p>
          <p style="font-size: 14px; font-weight: bold; color: #1a237e; margin: 0;">${points}</p>
        </div>
      `;
    }
    setText("teacherComment", cbcUtils.getTeacherComment(mean));
    setText("headComment", cbcUtils.getHeadteacherComment(mean));
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
    (a, b) => (b.year - a.year) || ((termOrder[b.term] || 0) - (termOrder[a.term] || 0)) ||
              (a.subject || a.course || "").localeCompare(b.subject || b.course || "")
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
    if (sigLines.length > 1) sigLines[1].textContent = "Principal's Signature";

    const headteacherRoleLabel = document.getElementById("headteacherRoleLabel");
    if (headteacherRoleLabel) {
      headteacherRoleLabel.textContent = "Principal";
    }

    const headCommentLabel = document.getElementById("headCommentLabel");
    if (headCommentLabel) {
      headCommentLabel.textContent = "Principal's Comment";
    }
    
    // Fallback: Search for the label by text if the specific ID is missing in report.html
    const possibleLabels = document.querySelectorAll('h3, h4, h5, strong, p');
    possibleLabels.forEach(el => {
      const text = el.textContent.trim();
      if (text.includes("Headteacher's Comment") || text.includes("Head Teacher's Comment")) {
        el.textContent = "Principal's Comment";
      }
    });
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
      const finalScore = cbcUtils.calculateFinalScore(m.continuousAssessment, m.projectWork, m.endTermExam);
      const fs = finalScore !== null ? finalScore : "-";
      const points = finalScore !== null ? cbcUtils.getPoints(finalScore) : "-";
      const perfLevel = finalScore !== null ? cbcUtils.getSubdivision(finalScore) : "N/A";
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
        totalPoints += cbcUtils.getPoints(finalScore);
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
      const points = cbcUtils.getPoints(score);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.subject || "").replace(/-/g, " "))}</td>
        <td>${score}%</td>
        <td>${points}</td>
        <td>${cbcUtils.getSubdivision(score)}</td>
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

    const keyPanel = document.createElement('div');
    keyPanel.id = 'performanceKeySide';
    let keyTableHTML = `
        <h4>PERFORMANCE KEY</h4>
        <table>
            <thead><tr><th>Level</th><th>Range</th><th>Pts</th></tr></thead>
            <tbody>
    `;
    cbcUtils.PERFORMANCE_KEY.forEach(item => {
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

      const opt = {
        margin: [0.3, 0.3, 0.3, 0.3],
        filename,
        image: { type: "png", quality: 1 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0, logging: false, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      // Use worker-based approach to ensure images are ready
      const worker = html2pdf().set(opt).from(reportElement).toPdf();
      worker.save().then(() => {
        document.querySelector(".report-controls").style.display = "block";
      });
    });
  }
});
