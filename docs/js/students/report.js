document.addEventListener("DOMContentLoaded", async () => {
  console.log("📄 Report generator initializing...");

  // 1. Resolve Authentication - Use the stored session token
  const user = await window.authService?.getUserProfile(["student", "learner", "admin", "teacher", "classteacher"]); 
  if (!user) {
    console.error("User session not found.");
    return;
  }

  const token = window.authService?.getToken();
  if (!token) { 
    alert("Authentication token missing. Please log in again.");
    window.location.href = "/login";
    return;
  }

  // -----------------------------
  // API Configuration
  // -----------------------------
  const API_BASE = window.config?.api?.baseURL || "http://localhost:5000/api";
  const BACKEND_URL = API_BASE.replace('/api', '');

  // -----------------------------
  // Helper Functions (Moved up to prevent 'before initialization' errors)
  // -----------------------------
  const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  const capitalizeWords = str => str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  const getGradeNum = (g) => {
    const match = String(g || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

// Helper to convert image URL to base64 for reliable PDF embedding
async function getImageBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  try {
    const absoluteUrl = (url.startsWith('http') || url.startsWith('data:')) 
      ? url 
      : `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;

    const response = await fetch(absoluteUrl, { mode: 'cors' });
    if (!response.ok) {
        console.warn(`Failed to fetch image ${absoluteUrl}: ${response.statusText}`);
        return null;
    }
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
  let reportGrade = user.grade || "N/A";
  let reportStream = "";
  let reportPathway = null;
  if (window.cbcUtils?.normalizePathway) {
    reportPathway = window.cbcUtils.normalizePathway(user.pathway || null);
  }

  // 1. Load Local Marks (synced from the student dashboard)
  let marks = JSON.parse(localStorage.getItem("studentReportMarks") || "[]");
  if (!marks.length) marks = JSON.parse(localStorage.getItem("submittedMarks") || "[]");

  // 🆕 Robust Filtering: If staff is viewing, or if we have a small set of marks from sync, don't over-filter.
  const isStaff = ["admin", "teacher", "classteacher"].includes(user.role);
  const studentAdmission = String(user.admission || user.admissionNo || "").trim();
  
  const studentMarks = isStaff ? marks : marks.filter(m => {
    const mAdm = String(m.admissionNo || m.admission || "").trim();
    // If admission numbers exist, match them. Otherwise, accept the marks if the set is small (already filtered by student sync).
    return (mAdm === studentAdmission && studentAdmission !== "") || marks.length < 20;
  });

  console.log(`📊 Processing ${studentMarks.length} mark records.`);

  if (!studentMarks.length) {
    alert("No report data found for this student. Please sync from the dashboard again.");
    return;
  }

  // Set baseline from marks (especially important for non-student users viewing reports)
  const latestMarkRecord = studentMarks[0];
  if (latestMarkRecord.grade) reportGrade = latestMarkRecord.grade;
  if (latestMarkRecord.stream) reportStream = latestMarkRecord.stream;

  // 2. Fetch School and Enrollment info in parallel
  try {
    const [schoolRes, enrollmentRes] = await Promise.all([
       // Request only necessary school info fields for report generation
      fetch(`${API_BASE}/users/my-school?includeLogo=true&fields=name,logo,logoMimeType,headteacherSignatureUrl,gradingConfig`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/enrollments/my-enrollment`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
    ]);

    if (!schoolRes.ok) {
      console.warn(`Failed to fetch school info: ${schoolRes.status} ${schoolRes.statusText}`);
    }

    // Process School Info & Headteacher Signature
    if (schoolRes && schoolRes.ok) {
      const school = await schoolRes.json();
      
      // Logic to match Bulk Report: Split name if >= 3 words
      const schoolNameText = school.name.toUpperCase();
      const nameWords = schoolNameText.split(' ');
      let schoolLogoElem = document.getElementById("schoolLogo");
      const schoolNameEl = document.getElementById("schoolName");

      if (nameWords.length >= 3 && schoolNameEl) {
        const mid = Math.ceil(nameWords.length / 2);
        const part1 = nameWords.slice(0, mid).join(' ');
        const part2 = nameWords.slice(mid).join(' ');
        
        // Restructure header DOM for split layout
        const headerRow = schoolNameEl.parentElement;
        headerRow.classList.add("school-title-row");
        headerRow.innerHTML = `<h2>${part1}</h2><img id="schoolLogo" alt="logo"><h2>${part2}</h2>`;
        // Re-fetch the newly created logo element
        schoolLogoElem = document.getElementById("schoolLogo");
      } else {
        setText("schoolName", schoolNameText);
      }

      // 🆕 Activate custom school grading logic if defined
      if (school.gradingConfig) {
        if (window.cbcUtils) window.cbcUtils.customGradingConfig = school.gradingConfig;
      }

      if (schoolLogoElem && school.logo) {
        let logoPath = school.logo.trim();
        
        if (logoPath.includes('uploads/')) {
          const cleanPath = logoPath.replace(/^\/+/, ""); 
          const finalUrl = `${BACKEND_URL}/${cleanPath}`;
          schoolLogoElem.src = finalUrl;
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
      const normalizedEnrollmentPathway = window.cbcUtils?.normalizePathway?.(enrollment.pathway);
      if (normalizedEnrollmentPathway && normalizedEnrollmentPathway !== "Core") {
        reportPathway = normalizedEnrollmentPathway;
      }
      
      const streamEl = document.getElementById("studentStream");
      if (streamEl) streamEl.textContent = reportStream || "N/A";
    }

    // Sync user grade if it changed
    if (reportGrade !== user.grade && reportGrade !== "N/A") {
      user.grade = reportGrade;
      localStorage.setItem("loggedInUser", JSON.stringify(user));
    }

    // 🆕 Debug log to verify level identification
    console.log(`[DEBUG] Grading Scale Identification: Grade="${reportGrade}" => ${window.cbcUtils.isPrimaryGrade(reportGrade) ? 'PRIMARY (4-point)' : 'SECONDARY (8-point)'}`);

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
  const updateReportSummary = (mean, points) => {
    // 1. Update numerical summary
    const summaryEl = document.querySelector(".summary");
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div style="text-align:center;">
          <p style="font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 3px; font-weight: 700;">PERFORMANCE LEVEL</p>
          <p style="font-size: 14px; font-weight: 800; color: #1a237e; margin: 0;">${window.cbcUtils.getSubdivision(mean, reportGrade)}</p>
        </div>
        <div style="border-left: 1px solid #e2e8f0; margin: 0 10px;"></div>
        <div style="text-align:center;">
          <p style="font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 3px; font-weight: 700;">TOTAL POINTS</p>
          <p style="font-size: 14px; font-weight: 800; color: #1a237e; margin: 0;">${points}</p>
        </div>
      `;
    }

    // 2. Update Remarks with consistent styling
    const remarksContainer = document.querySelector(".remarks-container");
    if (remarksContainer) {
      const isSenior = parseInt(reportGrade) >= 10;
      remarksContainer.innerHTML = `
        <div class="remark-item">
          <strong>Class Teacher's Comment</strong>
          <p>${window.cbcUtils.getTeacherComment(mean)}</p>
        </div>
        <div class="remark-item">
          <strong>${isSenior ? "Principal's" : "Headteacher's"} Comment</strong>
          <p>${window.cbcUtils.getHeadteacherComment(mean)}</p>
        </div>
      `;
    }
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

  // ===== Show pathway for Grade 10-12 students =====
  try {
    const gradeNum = getGradeNum(reportGrade);
    if (gradeNum >= 10 && gradeNum <= 12) {
      const pathwayMark = studentMarks.find(m => m.pathway && String(m.pathway).trim());
      const normalizedMarkPathway = window.cbcUtils?.normalizePathway?.(pathwayMark?.pathway);
      const resolvedPathway = [reportPathway, normalizedMarkPathway]
        .map(p => p && String(p).trim())
        .filter(p => p && p !== "Core")
        [0] || null;

      const studentGradeEl = document.getElementById("studentGrade");
      if (studentGradeEl) {
        let pathwayLineEl = document.getElementById("studentPathwayLine");
        if (!pathwayLineEl) {
          pathwayLineEl = document.createElement("p");
          pathwayLineEl.id = "studentPathwayLine";
          studentGradeEl.closest("p").insertAdjacentElement("afterend", pathwayLineEl);
        }

        if (resolvedPathway) {
          pathwayLineEl.innerHTML = `<strong>Pathway:</strong> <span style="font-weight: bold; text-transform: uppercase; color: #111;">${String(resolvedPathway).toUpperCase()}</span>`;
          pathwayLineEl.style.display = "block";
        } else {
          pathwayLineEl.style.display = "none";
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
  const assessMapping = window.ASSESSMENT_MAPPING || {
    1: "Opener", 2: "Assessment 2", 3: "Assessment 3", 4: "Assessment 4",
    5: "Midterm", 6: "Assessment 6", 7: "Assessment 7", 8: "Endterm"
  };
  const assessLabel = assessMapping[latestMark.assessment] || `Assessment ${latestMark.assessment}`;

  if (!latestMark.term && document.getElementById("studentTerm")) document.getElementById("studentTerm").closest("p")?.remove();
  else setText("studentTerm", latestMark.term || "");
  if (!latestMark.year && document.getElementById("studentYear")) document.getElementById("studentYear").closest("p")?.remove();
  else setText("studentYear", currentYear);

  // 🆕 Add Bulk-style sub-headers dynamically
  const existingHeader = document.querySelector(".report-title-area");
  if (existingHeader) existingHeader.remove(); // Prevent duplicates

  const titleArea = document.createElement("div");
  titleArea.className = "report-title-area";
  titleArea.style.textAlign = "center";
  titleArea.style.marginBottom = "10px";
  
  titleArea.innerHTML = `
    <h3 class="report-main-title" style="margin: 8px 0 2px 0; font-weight: 800; color: #1a237e;">LEARNER'S PROGRESS REPORT</h3>
    <p class="report-sub-title" style="margin: 0; font-weight: 700; color: #4b5563; font-size: 13px;">${assessLabel.toUpperCase()} — TERM ${latestMark.term || "-"}, ${currentYear}</p>
  `;

  const nameEl = document.getElementById("schoolName") || document.querySelector(".school-title-row");
  if (nameEl) nameEl.insertAdjacentElement("afterend", titleArea);

  // ===== Determine if Senior School (Grade 10-12) =====
  const gradeNum = getGradeNum(reportGrade);
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

  // ===== SENIOR SCHOOL (10-12): Single-Score Report =====
  if (isSeniorSchool) {
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
      const rawScore = m.score ?? m.finalScore ?? m.continuousAssessment ?? m.projectWork ?? m.endTermExam ?? null;
      const isAbs = rawScore === null || rawScore === undefined || String(rawScore).trim() === "" || String(rawScore).toUpperCase() === "X";
      const finalScore = isAbs ? null : Number(rawScore);
      const fs = finalScore !== null ? finalScore : "-";
      const points = finalScore !== null ? window.cbcUtils.getPoints(finalScore, reportGrade) : "-";
      const perfLevel = finalScore !== null ? window.cbcUtils.getSubdivision(finalScore, reportGrade) : "N/A";
      const remark = isAbs ? "ABSENT" : (finalScore !== null ? window.cbcUtils.getSubjectRemark(finalScore, m.course) : "-");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.course || "").replace(/-/g, " "))}</td>
        <td><strong>${isAbs ? "ABS" : fs + "%"}</strong></td>
        <td>${points}</td>
        <td>${perfLevel}</td>
        <td>${remark}</td>
      `;
      tbody.appendChild(tr);

      if (finalScore !== null) {
        totalFinalScore += Number(finalScore);
        totalPoints += cbcUtils.getPoints(finalScore, reportGrade);
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
    let validScoreCount = 0;
    let totalPoints = 0;

    studentMarks.forEach(m => {
      const isAbs = m.score === null || m.score === undefined || String(m.score).toUpperCase() === "X";
      const score = isAbs ? "X" : Number(m.score || 0);
      const points = window.cbcUtils.getPoints(score, reportGrade);
      const remark = isAbs ? "ABSENT" : window.cbcUtils.getSubjectRemark(score, m.subject);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${capitalizeWords((m.subject || "").replace(/-/g, " "))}</td>
        <td>${isAbs ? "ABS" : score + "%"}</td>
        <td>${points}</td>
        <td>${window.cbcUtils.getSubdivision(score, reportGrade)}</td>
        <td>${remark}</td>
      `;
      tbody.appendChild(tr);
      if (!isAbs) {
        total += score;
        validScoreCount++;
      }
      totalPoints += points;
    });

    const mean = validScoreCount > 0 ? (total / validScoreCount).toFixed(1) : 0;
    
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
    window.cbcUtils.getPerformanceKey(reportGrade).forEach(item => {
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
  const backBtn = document.getElementById("backBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  if (backBtn) backBtn.addEventListener("click", () => {
    window.location.href = "/student";
  });

  if (refreshBtn) refreshBtn.addEventListener("click", () => window.location.reload());

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      document.querySelector(".report-controls").style.display = "none";
      const filename = `Report_${user.grade || "Grade"}_${latestMark.term || "Term"}_${currentYear}.pdf`;

      const opt = {
        margin: [8, 10, 12, 10], // Tightened margins to prevent unnecessary page breaks
        filename,
        image: { type: "png", quality: 1 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0, logging: false, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] } // Removed avoid-all to prevent pushing the entire container to page 2
      };

      // Use worker-based approach to inject CompetenceHub Analytics branding and page numbering into the PDF footer
      html2pdf().set(opt).from(reportElement).toPdf().get('pdf').then((pdf) => {
        const totalPages = pdf.internal.getNumberOfPages();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const marginX = 10;

        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          pdf.setFontSize(8);
          pdf.setTextColor(150); // Subtle gray color for footer text
          const dateStr = `Printed: ${new Date().toLocaleString()} | CompetenceHub Analytics | ${reportGrade}`;
          pdf.text(dateStr, marginX, pageHeight - 8);
          pdf.text(`Page ${i} of ${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
        }
      }).save().then(() => {
        document.querySelector(".report-controls").style.display = "block";
      });
    });
  }
});
