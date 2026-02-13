// ===== CBC GRADING HELPERS (For both Junior & Senior School) =====
const CBC_WEIGHTS = {
  continuousAssessment: 0.30,
  projectWork: 0.20,
  endTermExam: 0.50
};

function scoreToPerformanceLevel(score) {
  if (score >= 80) return "EE";
  if (score >= 65) return "ME";
  if (score >= 50) return "AE";
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

function calculateSeniorSchoolFinalScore(mark) {
  if (!mark || mark.grade < 10 || mark.grade > 12) return null;
  
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
    const res = await fetch("http://localhost:5000/api/users/user", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localStorage.removeItem("token");
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
      return;
    }

    user = await res.json();

    if (!user || (user.role !== "student" && user.role !== "learner")) {
      localStorage.removeItem("token");
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
      return;
    }

    window.currentUser = user;
    localStorage.setItem("loggedInUser", JSON.stringify(user));
    console.log("✅ User authenticated:", user);
  } catch (err) {
    console.error("Auth error:", err);
    alert("Could not verify session. Please refresh or log in again.");
    return;
  }

  // ---------------------------
  // GREETING
  // ---------------------------
  const welcomeNameEl = document.getElementById("welcomeName");
  if (welcomeNameEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    welcomeNameEl.textContent = `${greeting}, ${user.name}`;
  }

  // ---------------------------
  // FETCH STUDENT ENROLLMENT (Grade & Stream)
  // ---------------------------
  let studentEnrollment = null;
  try {
    const enrollmentRes = await fetch("http://localhost:5000/api/enrollments/my-enrollment", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (enrollmentRes.ok) {
      studentEnrollment = await enrollmentRes.json();
      console.log("✅ Enrollment fetched:", studentEnrollment);
      
      // Update user grade if available
      if (studentEnrollment.grade && !user.grade) {
        user.grade = studentEnrollment.grade;
        localStorage.setItem("loggedInUser", JSON.stringify(user));
      }
      
      // Display grade and stream in learner info box
      const gradeDisplay = document.getElementById("learnerGradeDisplay");
      const streamDisplay = document.getElementById("learnerStreamDisplay");
      
      if (gradeDisplay) {
        gradeDisplay.textContent = studentEnrollment.grade || user.grade || "N/A";
      }
      if (streamDisplay) {
        streamDisplay.textContent = studentEnrollment.stream ? studentEnrollment.stream : "N/A";
      }
    } else {
      console.warn("Failed to fetch enrollment:", enrollmentRes.status);
    }
  } catch (err) {
    console.error("Enrollment fetch error:", err);
  }

  // ---------------------------
  // TOAST FUNCTION
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
// FETCH SCHOOL INFO
// ---------------------------
const schoolNameEl = document.createElement("p"); // create element to show school name
schoolNameEl.id = "schoolNameDashboard";
schoolNameEl.style.fontWeight = "bold";
schoolNameEl.style.fontSize = "1.2rem";
schoolNameEl.style.marginBottom = "10px";

// Fee info element
const feeInfoEl = document.createElement('p');
feeInfoEl.id = 'feeInfoDashboard';
feeInfoEl.style.marginBottom = '10px';

// Insert at top of dashboard main
const dashboardMain = document.querySelector(".dashboard-main");
if (dashboardMain) dashboardMain.prepend(schoolNameEl);
if (dashboardMain) dashboardMain.prepend(feeInfoEl);

try {
  const schoolRes = await fetch("http://localhost:5000/api/users/my-school", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (schoolRes.ok) {
    const school = await schoolRes.json();
    schoolNameEl.textContent = school.name.toUpperCase();
    console.log("✅ School info fetched:", school);
  } else {
    schoolNameEl.textContent = "School Name N/A";
    console.error("Failed to fetch school info:", schoolRes.status, schoolRes.statusText);
  }
} catch (err) {
  schoolNameEl.textContent = "School Name N/A";
  console.error("Error fetching school info:", err);
}

// ---------------------------
// Fetch fee structure for current student
// ---------------------------
try {
  const feesRes = await fetch('http://localhost:5000/api/users/my-fees', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (feesRes.ok) {
    const f = await feesRes.json();
    feeInfoEl.textContent = `Total Annual Fees (${f.grade}, ${f.academicYear}): KES ${f.totalFee}`;
    console.log("✅ Fee info fetched:", f);
  } else if (feesRes.status === 404) {
    feeInfoEl.textContent = 'Fee structure not available';
  } else {
    console.error('Failed to fetch fee info', feesRes.status);
    feeInfoEl.textContent = '';
  }
} catch (err) {
  console.error('Error fetching fees:', err);
  feeInfoEl.textContent = '';
}

// View fee button handler (opens modal with more details)
const viewFeeBtn = document.getElementById('viewFeeBtn');

// Function to load fee data
const loadFeeData = async (selectedYear) => {
  const body = document.getElementById('feeModalBody');
  body.textContent = 'Loading...';

  try {
    const [feesRes, balanceRes, paymentsRes] = await Promise.all([
      fetch(`http://localhost:5000/api/users/my-fees?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`http://localhost:5000/api/users/my-balance?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`http://localhost:5000/api/users/my-payments?academicYear=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    if (!feesRes.ok) {
      if (feesRes.status === 404) { body.textContent = 'Fee structure not available'; return; }
      body.textContent = 'Failed to load fee structure';
      return;
    }

    const feesData = await feesRes.json();
    let balanceData, paymentsData;

    if (!balanceRes.ok) {
      console.warn('Failed to load balance information, using defaults');
      balanceData = {
        termBalances: {
          term1: { paid: 0, balance: feesData.term1Fee || 0 },
          term2: { paid: 0, balance: feesData.term2Fee || 0 },
          term3: { paid: 0, balance: feesData.term3Fee || 0 }
        },
        totalPaid: 0,
        balance: feesData.totalFee || 0
      };
    } else {
      balanceData = await balanceRes.json();
    }
    if (!paymentsRes.ok) {
      console.warn('Failed to load payment history, using empty list');
      paymentsData = { payments: [] };
    } else {
      paymentsData = await paymentsRes.json();
    }

    // Calculate paid per term from payments
    let term1Paid = 0, term2Paid = 0, term3Paid = 0;
    paymentsData.payments.forEach(payment => {
      if (payment.term === 'Term 1') term1Paid += payment.amount;
      else if (payment.term === 'Term 2') term2Paid += payment.amount;
      else if (payment.term === 'Term 3') term3Paid += payment.amount;
    });
    const totalPaid = term1Paid + term2Paid + term3Paid;

    let paymentsTable = '<h4>Fee Statement:</h4><table style="width:100%; border-collapse:collapse;"><tr style="border-bottom:1px solid #ddd;"><th style="text-align:left; padding:8px;">Date</th><th style="text-align:left; padding:8px;">Term</th><th style="text-align:left; padding:8px;">Method</th><th style="text-align:left; padding:8px;">Reference</th><th style="text-align:right; padding:8px;">Amount</th></tr>';
    if (paymentsData.payments.length === 0) {
      paymentsTable += '<tr><td colspan="5" style="text-align:center; padding:8px;">No payments recorded</td></tr>';
    } else {
      paymentsData.payments.forEach(payment => {
        const date = new Date(payment.createdAt).toLocaleDateString();
        paymentsTable += `<tr><td style="padding:8px;">${date}</td><td style="padding:8px;">${payment.term}</td><td style="padding:8px;">${payment.method}</td><td style="padding:8px;">${payment.reference}</td><td style="text-align:right; padding:8px;">KES ${payment.amount}</td></tr>`;
      });
    }
    paymentsTable += '</table>';

    const schoolName = schoolNameEl.textContent || 'SCHOOL NAME';

    body.innerHTML = `<div id="feeStructureContent">
                      <h2 style="text-align:center; margin-bottom:20px;">${schoolName}</h2>
                      <p><strong>Grade:</strong> ${feesData.grade}</p>
                      <p><strong>Academic Year:</strong> ${feesData.academicYear}</p>
                      <h4>Term Breakdown:</h4>
                      <table style="width:100%; border-collapse:collapse;">
                        <tr style="border-bottom:1px solid #ddd;">
                          <th style="text-align:left; padding:8px;">Term</th>
                          <th style="text-align:right; padding:8px;">Fee</th>
                          <th style="text-align:right; padding:8px;">Paid</th>
                          <th style="text-align:right; padding:8px;">Balance</th>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 1</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term1Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term1Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term1Fee || 0) - term1Paid}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 2</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term2Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term2Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term2Fee || 0) - term2Paid}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px;">Term 3</td>
                          <td style="text-align:right; padding:8px;">KES ${feesData.term3Fee || 0}</td>
                          <td style="text-align:right; padding:8px;">KES ${term3Paid}</td>
                          <td style="text-align:right; padding:8px;">KES ${(feesData.term3Fee || 0) - term3Paid}</td>
                        </tr>
                      </table>
                      <p><strong>Total Fee:</strong> KES ${feesData.totalFee}</p>
                      <p><strong>Total Paid:</strong> KES ${totalPaid}</p>
                      <p><strong>Outstanding Balance:</strong> KES ${feesData.totalFee - totalPaid}</p>
                      </div>
                      <div id="feeStatementContent">
                      <h2 style="text-align:center; margin-bottom:20px;">${schoolName}</h2>
                      ${paymentsTable}
                      </div>`;
  } catch (err) {
    console.error(err);
    body.textContent = 'Error loading fee structure';
  }
};

  // Fee year filter population
  const feeYearFilter = document.getElementById("feeYearFilter");
  if (feeYearFilter) {
    const currentYear = new Date().getFullYear();
    for (let yr = 2025; yr <= 2126; yr++) {
      const option = document.createElement("option");
      option.value = yr;
      option.textContent = yr;
      if (yr === currentYear) option.selected = true;
      feeYearFilter.appendChild(option);
    }

    // Auto-filter on year change
    feeYearFilter.addEventListener('change', async () => {
      const selectedYear = feeYearFilter.value;
      await loadFeeData(selectedYear);
    });
  }

  // Marks year filter population
  const yearFilter = document.getElementById("yearFilter");
  if (yearFilter) {
    const currentYear = new Date().getFullYear();
    for (let yr = 2025; yr <= currentYear + 100; yr++) {
      const option = document.createElement("option");
      option.value = yr;
      option.textContent = yr;
      yearFilter.appendChild(option);
    }
  }

if (viewFeeBtn) {
  viewFeeBtn.addEventListener('click', async () => {
    const modal = document.getElementById('feeModal');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    
    modal.classList.remove('hidden');
    await loadFeeData(selectedYear);
  });
}

// Fee year filter button handler
const feeFilterBtn = document.getElementById('feeFilterBtn');
if (feeFilterBtn) {
  feeFilterBtn.addEventListener('click', async () => {
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    await loadFeeData(selectedYear);
  });
}

// Download Fee Structure PDF
const downloadFeeStructurePDF = document.getElementById('downloadFeeStructurePDF');
if (downloadFeeStructurePDF) {
  downloadFeeStructurePDF.addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const element = document.getElementById('feeStructureContent');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    if (element) {
      const canvas = await html2canvas(element);
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`fee_structure_${user.name}_${selectedYear}.pdf`);
    }
  });
}

// Download Fee Statement PDF
const downloadFeeStatementPDF = document.getElementById('downloadFeeStatementPDF');
if (downloadFeeStatementPDF) {
  downloadFeeStatementPDF.addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const element = document.getElementById('feeStatementContent');
    const selectedYear = feeYearFilter ? feeYearFilter.value : new Date().getFullYear();
    if (element) {
      const canvas = await html2canvas(element);
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`fee_statement_${user.name}_${selectedYear}.pdf`);
    }
  });
}

  // ---------------------------
  // UTILITY FUNCTIONS
  // ---------------------------
  const getPerformanceLevel = (score) =>
    score >= 80 ? "EE" : score >= 60 ? "ME" : score >= 40 ? "AE" : "BE";

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
  

  const getAssessmentLabel = (value) =>
    value == 5 ? "End Term" : `Assessment ${value}`;

 // ---------------------------


const displayStudentTables = async () => {
  const marksContainer = document.getElementById("learnerMarks");
  const spinner = document.getElementById("loadingSpinner");

  const showSpinner = () => spinner && (spinner.style.display = "block");
  const hideSpinner = () => spinner && (spinner.style.display = "none");

  showSpinner();
  marksContainer.innerHTML = "";

  try {
    // Get filter values
    const termEl = document.getElementById("termFilter");
    const yearEl = document.getElementById("yearFilter");
    const assessEl = document.getElementById("assessmentFilter");

    let termValue = termEl ? termEl.value.trim() : "all";
    let yearValue = yearEl ? yearEl.value.trim() : "all";
    let assessValue = assessEl ? assessEl.value.trim() : "all";

    const query = new URLSearchParams();
    if (termValue !== "all" && !isNaN(termValue)) query.set("term", Number(termValue));
    if (yearValue !== "all" && !isNaN(yearValue)) query.set("year", Number(yearValue));
    if (assessValue !== "all" && !isNaN(assessValue)) query.set("assessment", Number(assessValue));

    // Build URL
    let url = "http://localhost:5000/api/marks/student";
    const queryString = query.toString();
    if (queryString) url += `?${queryString}`;

    // Fetch marks
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 404) {
        marksContainer.textContent = "No marks found for the selected filters.";
        hideSpinner();
        return;
      } else {
        throw new Error(`Error fetching marks: ${res.status}`);
      }
    }

    const data = await res.json();
    const studentMarks = data.studentMarks || [];
    const allClassMarks = data.allClassMarks || [];
    console.log("✅ Marks fetched:", { studentMarks, allClassMarks });

    if (!studentMarks.length) {
      marksContainer.textContent = "No marks found for the selected filters.";
      hideSpinner();
      return;
    }

    const latest = studentMarks[0];

    // Update filter defaults
    if (termValue === "all" && termEl) termEl.value = latest.term;
    if (yearValue === "all" && yearEl) yearEl.value = latest.year;
    if (assessValue === "all" && assessEl) assessEl.value = latest.assessment;

    // Show latest info
    showToast(
      `📊 Latest: Term ${latest.term}, ${latest.year} (${latest.assessment == 5 ? "End Term" : "Assessment " + latest.assessment})`
    );

    // ===== Show pathway for Grade 10-12 students =====
    try {
      const welcomeNameEl = document.getElementById("welcomeName");
      if (welcomeNameEl) {
        let pathwayEl = document.getElementById("learnerPathway");
        if (!pathwayEl) {
          pathwayEl = document.createElement("span");
          pathwayEl.id = "learnerPathway";
          pathwayEl.style.marginLeft = "12px";
          pathwayEl.style.fontWeight = "700";
          pathwayEl.style.textTransform = "uppercase";
          pathwayEl.style.color = "#111";
          pathwayEl.style.fontSize = "0.95rem";
          welcomeNameEl.parentNode.insertBefore(pathwayEl, welcomeNameEl.nextSibling);
        }

        const dashboardGrade = Number(user.grade || latest.grade || 0);
        if (dashboardGrade >= 10 && dashboardGrade <= 12) {
          // Pick the first submitted mark that contains a pathway
          const pathwayMark = studentMarks.find(m => m.pathway && String(m.pathway).trim());
          if (pathwayMark && pathwayMark.pathway) {
            pathwayEl.textContent = String(pathwayMark.pathway).toUpperCase();
            pathwayEl.style.display = "inline-block";
            console.log('Pathway found for grade', dashboardGrade, ':', pathwayMark.pathway);
          } else {
            pathwayEl.textContent = "PATHWAY: N/A";
            pathwayEl.style.display = "inline-block";
            console.log('No pathway found in marks for grade', dashboardGrade);
          }
        } else {
          pathwayEl.textContent = "";
          pathwayEl.style.display = "none";
        }
      }
    } catch (err) {
      console.error('Pathway display error:', err);
    }

    // Group student marks by assessment (optional)
    const grouped = {};
    studentMarks.forEach((m) => {
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

  // ===========================
  // SYNC BUTTON
  // ===========================
  const syncBtn = document.createElement("button");
  syncBtn.textContent = "📄 Sync Button";
  syncBtn.classList.add("sync-btn");
  syncBtn.addEventListener("click", () => {
    // Save this assessment's marks to localStorage
    localStorage.setItem("studentReportMarks", JSON.stringify(list));

    // Optionally show toast
    showToast("✅ Marks synced to report form.");

    // Open report.html in a new tab
    window.open("report.html", "_blank");
  });

  wrapper.appendChild(syncBtn);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const gradeNum = parseInt(grade);
  const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

  // ===== JUNIOR SCHOOL (1-9): Simple Score Display =====
  if (!isSeniorSchool) {
    thead.innerHTML = `<tr><th>Subject</th><th>Score</th><th>Performance Level</th></tr>`;
    
    list.forEach((m) => {
      const tr = document.createElement("tr");
      const perfLevel = getPerformanceLevel(m.score);
      tr.innerHTML = `
        <td>${(m.subject || "").replace(/-/g, " ")}</td>
        <td><strong>${m.score}%</strong></td>
        <td>${perfLevel} (${getPerformanceLevelLabel(perfLevel)})</td>
      `;
      tbody.appendChild(tr);
    });
  }
  // ===== SENIOR SCHOOL (10-12): Component Breakdown =====
  else {
    thead.innerHTML = `
      <tr>
        <th>Course</th>
        <th>Continuous Assessment</th>
        <th>Project Work</th>
        <th>End-Term Exam</th>
        <th>Final Score</th>
        <th>Performance Level</th>
      </tr>
    `;
    
    list.forEach((m) => {
      const tr = document.createElement("tr");
      const finalScore = calculateSeniorSchoolFinalScore(m);
      const perfLevel = finalScore ? scoreToPerformanceLevel(finalScore) : "N/A";
      
      const ca = m.continuousAssessment !== null && m.continuousAssessment !== undefined ? `${m.continuousAssessment}%` : "-";
      const pw = m.projectWork !== null && m.projectWork !== undefined ? `${m.projectWork}%` : "-";
      const et = m.endTermExam !== null && m.endTermExam !== undefined ? `${m.endTermExam}%` : "-";
      const fs = finalScore ? `${finalScore}%` : "-";
      
      tr.innerHTML = `
        <td><strong>${(m.course || "").replace(/-/g, " ")}</strong></td>
        <td>${ca}</td>
        <td>${pw}</td>
        <td>${et}</td>
        <td><strong>${fs}</strong></td>
        <td>${perfLevel}${finalScore ? ` (${getPerformanceLevelLabel(perfLevel)})` : ''}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  table.append(thead, tbody);
  wrapper.appendChild(table);

  // ==========================
  // ANALYSIS SUMMARY - DIFFERENT FOR JUNIOR vs SENIOR SCHOOL
  // ==========================
 
  const summary = document.createElement("div");
  summary.classList.add("marks-summary");

  // Helper function to create a progress bar
  const createProgressBar = (score, color) => `
    <div style="background:#eee;border-radius:6px;overflow:hidden;width:150px;height:14px;display:inline-block;margin-left:5px;vertical-align:middle;">
      <div style="width:${Math.min(score, 100)}%;background:${color};height:100%;"></div>
    </div>
  `;

  // ===== JUNIOR SCHOOL (1-9): Subject-Based Analysis =====
  if (!isSeniorSchool) {
    const allScores = list.map((m) => Number(m.score || 0));
    const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;

    // Get subject averages
    const subjectAvgs = getSubjectAverages(list);
    const topStrengths = subjectAvgs.slice(0, 3);         // top 3
    const areasToImprove = subjectAvgs.slice(-3).reverse(); // bottom 3

    // Build HTML for strengths
    let strengthsHtml = topStrengths.length
      ? topStrengths.map(s => `
          <span style="color:green;font-weight:bold;">
            ${s.subject} (${s.avg.toFixed(0)}%)
            ${createProgressBar(s.avg, "green")}
          </span>
        `).join("<br>")
      : "N/A";

    // Build HTML for areas to improve
    let improveHtml = areasToImprove.length
      ? areasToImprove.map(s => `
          <span style="color:red;font-weight:bold;">
            ${s.subject} (${s.avg.toFixed(0)}%)
            ${createProgressBar(s.avg, "red")}
          </span>
        `).join("<br>")
      : "N/A";

    summary.innerHTML = `
      <hr>
      <h4 style="text-align:center;">📊 RESULTS OVERVIEW</h4>
      <p><strong>Average Score:</strong> ${avg.toFixed(2)}%</p>
      <p><strong>Overall Performance Level:</strong> ${getPerformanceLevel(avg)} (${getPerformanceLevelLabel(getPerformanceLevel(avg))})</p>
      <br>
      <p><strong>✅ TOP STRENGTHS (Top 3 Subjects):</strong><br>${strengthsHtml}</p>
      <br>
      <p><strong>⚠️ AREAS TO IMPROVE (Bottom 3 Subjects):</strong><br>${improveHtml}</p>
    `;
  }
  // ===== SENIOR SCHOOL (10-12): Component-Based Analysis =====
  else {
    // Calculate component averages across all courses
    let caSum = 0, pwSum = 0, etSum = 0, fsSum = 0;
    let caCount = 0, pwCount = 0, etCount = 0, fsCount = 0;

    list.forEach(m => {
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
      const fs = calculateSeniorSchoolFinalScore(m);
      if (fs !== null) {
        fsSum += fs;
        fsCount++;
      }
    });

    const caAvg = caCount > 0 ? (caSum / caCount).toFixed(1) : 0;
    const pwAvg = pwCount > 0 ? (pwSum / pwCount).toFixed(1) : 0;
    const etAvg = etCount > 0 ? (etSum / etCount).toFixed(1) : 0;
    const fsAvg = fsCount > 0 ? (fsSum / fsCount).toFixed(2) : 0;
    const overallLevel = scoreToPerformanceLevel(fsAvg);

    // Identify strongest and weakest components
    const componentAvgs = { "Continuous Assessment": caAvg, "Project Work": pwAvg, "End-Term Exam": etAvg };
    const strongest = Object.entries(componentAvgs).reduce((max, [k, v]) => v > max.val ? { name: k, val: v } : max, { name: "N/A", val: 0 });
    const weakest = Object.entries(componentAvgs).reduce((min, [k, v]) => v < min.val && v > 0 ? { name: k, val: v } : min, { name: "N/A", val: 100 });

    summary.innerHTML = `
      <hr>
      <h4 style="text-align:center;">📊 COMPONENT ANALYSIS (Weighted Assessment)</h4>
      <p><strong>Overall Final Score:</strong> ${fsAvg}%</p>
      <p><strong>Overall Performance Level:</strong> ${overallLevel} (${getPerformanceLevelLabel(overallLevel)})</p>
      <br>
      <table style="width:100%;border-collapse:collapse;margin:10px 0;">
        <tr style="background:#f5f5f5;">
          <th style="border:1px solid #ddd;padding:8px;text-align:left;">Component</th>
          <th style="border:1px solid #ddd;padding:8px;text-align:center;">Your Average</th>
          <th style="border:1px solid #ddd;padding:8px;text-align:center;">Weight</th>
        </tr>
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">Continuous Assessment (CATs, Quizzes)</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;"><strong>${caAvg}%</strong> ${createProgressBar(caAvg, caAvg >= 65 ? "green" : "orange")}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">30%</td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">Project Work / Performance Tasks</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;"><strong>${pwAvg}%</strong> ${createProgressBar(pwAvg, pwAvg >= 65 ? "green" : "orange")}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">20%</td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">End-Term Examination</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;"><strong>${etAvg}%</strong> ${createProgressBar(etAvg, etAvg >= 65 ? "green" : "orange")}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">50%</td>
        </tr>
      </table>
      <br>
      <p><strong>✅ Strongest Component:</strong> ${strongest.name} (${strongest.val}%)</p>
      <p><strong>⚠️ Area Needing Attention:</strong> ${weakest.name} (${weakest.val}%)</p>
    `;
  }

  wrapper.appendChild(summary);

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
  console.log("📊 Dashboard Initialization Complete!");
  console.log("Data Loaded:", {
    user: user?.name,
    enrollment: studentEnrollment?.grade,
    school: schoolNameEl?.textContent,
    fees: feeInfoEl?.textContent
  });
  displayStudentTables();
});
