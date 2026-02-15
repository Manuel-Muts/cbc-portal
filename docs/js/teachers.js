(() => {
  // ---------------------------
  // CONFIG + GLOBALS
  // ---------------------------
  const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000/api"
    : "https://competence-hub.onrender.com/api";

  const token = localStorage.getItem("token");
  let submittedMarks = []; // in-memory marks list
  let editingMarkId = null;
  let teacher = null;
  let teacherSchoolId = null; // ✅ declared globally
  let selectedStudentStream = null; // 🆕 Store the student's stream when selected

  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const subjectSelect = document.getElementById("subject");
  const pathwaySelect = document.getElementById("pathway");
  const courseSelect = document.getElementById("course");
  const assessmentSelect = document.getElementById("assessmentSelect");
  const admissionInput = document.getElementById("admissionNo");
  const studentNameInput = document.getElementById("studentName");
  const currentGradeInput = document.getElementById("currentGrade");
  const logoutBtn = document.getElementById("logoutBtn");
  const marksForm = document.getElementById("marks-form");
  const submittedMarksContainer = document.getElementById("submittedMarksContainer");
  const yearInput = document.getElementById("year");
  const scoreInput = document.getElementById("score");
  
  // Senior School Components (Grade 10-12)
  const continuousAssessmentInput = document.getElementById("continuousAssessment");
  const projectWorkInput = document.getElementById("projectWork");
  const endTermExamInput = document.getElementById("endTermExam");

  // Study materials
  const materialGrade = document.getElementById("materialGrade");
  const materialSubject = document.getElementById("materialSubject");
  const materialPathway = document.getElementById("materialPathway");
  const materialCourse = document.getElementById("materialCourse");
  const materialTitle = document.getElementById("materialTitle");
  const materialDescription = document.getElementById("materialDescription");
  const materialsForm = document.getElementById("materials-form");
  const materialsListEl = document.getElementById("materialsList");

  // Smart refresh & toast elements
  const smartRefreshBtn = document.getElementById("smartRefreshBtn");

  // ---------------------------
  // SET DEFAULT YEAR TO CURRENT YEAR
  // ---------------------------
  const currentYear = new Date().getFullYear();
  if (yearInput) {
    yearInput.value = currentYear;
  }

  // ---------------------------
  // AUTHENTICATION
  // ---------------------------
  async function loadTeacherProfile() {
    if (!token) return redirectToLogin();
    try {
      const res = await fetch(`${API_BASE}/users/user`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      teacher = data;
      teacherSchoolId = teacher.schoolId; // ✅ assign here
      if (!teacherSchoolId) {
        console.error("Teacher profile missing schoolId:", teacher);
        return redirectToLogin();
      }
      const rolesArray = Array.isArray(teacher.roles) ? teacher.roles : [teacher.role];
      if (!rolesArray.includes("teacher") && !rolesArray.includes("classteacher"))
        throw new Error("Unauthorized");
      document.getElementById("teacherName").textContent = teacher.name || "";
      window.currentTeacher = teacher;
    } catch (err) {
      console.error("Dashboard auth error:", err);
      redirectToLogin();
    }
  }

  // ---------------------------
  // FETCH SCHOOL NAME
  // ---------------------------
  async function loadSchoolName() {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/my-school`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to fetch school");
      const school = await res.json();
      const schoolNameEl = document.getElementById("schoolName");
      if (schoolNameEl) {
        schoolNameEl.textContent = (school.name || "").toUpperCase();
      }
      // Optional: expose globally if needed elsewhere
      window.currentSchool = school;
    } catch (err) {
      console.error("Load school error:", err);
    }
  }

  // ---------------------------
  // LOAD TEACHER ALLOCATIONS (🆕)
  // ---------------------------
  async function loadTeacherAllocations() {
    try {
      const res = await fetch(`${API_BASE}/users/subjects/my-allocations`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to fetch allocations");
      const data = await res.json();
      renderAllocations(data);
    } catch (err) {
      console.error("Load allocations error:", err);
      const container = document.getElementById("allocationsContainer");
      if (container) {
        container.innerHTML = '<p style="color: red;">Failed to load allocations</p>';
      }
    }
  }

  // ---------------------------
  // RENDER ALLOCATIONS (🆕)
  // ---------------------------
  function renderAllocations(data) {
    const container = document.getElementById("allocationsContainer");
    if (!container) return;

    let html = '<div style="margin-top: 10px;">';

    // Subject Allocations
    if (data.subjectAllocations && data.subjectAllocations.length > 0) {
      html += '<h4>📖 Subject Allocations:</h4>';
      html += '<ul style="list-style: none; padding: 0;">';
      data.subjectAllocations.forEach(alloc => {
        html += `
          <li style="padding: 8px; background: white; margin: 5px 0; border-left: 4px solid #4CAF50; border-radius: 4px;">
            <strong>${alloc.classLabel}</strong>: ${alloc.subjects.join(", ")}
          </li>
        `;
      });
      html += '</ul>';
    } else {
      html += '<p><strong>📖 Subject Allocations:</strong> None</p>';
    }

    // Class Teacher Assignment
    if (data.classTeacherAssignment) {
      html += `
        <h4>🏫 Class Teacher Assignment:</h4>
        <div style="padding: 10px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 4px;">
          <strong>${data.classTeacherAssignment.classLabel}</strong>
        </div>
      `;
    } else {
      html += '<p><strong>🏫 Class Teacher Assignment:</strong> None</p>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function redirectToLogin() {
    localStorage.clear();
    window.location.href = "login.html";
  }

  // ---------------------------
  // LOGOUT
  // ---------------------------
  logoutBtn?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  // ---------------------------
  // ASSESSMENT SELECT POPULATE
  // ---------------------------
  (function populateAssessments() {
    for (let i = 1; i <= 4; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `Assessment ${i}`;
      assessmentSelect.appendChild(opt);
    }
    const endTerm = document.createElement("option");
    endTerm.value = 5;
    endTerm.textContent = "End Term";
    assessmentSelect.appendChild(endTerm);
  })();

  // ---------------------------
  // GRADE & SUBJECTS DATA
  // ---------------------------
  const gradeSubjects = {
    "1-3": [
      "Mathematics",
      "Kiswahili",
      "English",
      "Environmental Activities",
      "Social Studies",
      "Christian Religious Studies (CRE)",
      "Creative Arts and Sports"
    ],
    "4-6": [
      "Mathematics",
      "English",
      "Kiswahili",
      "Integrated Science",
      "Social Studies",
      "Christian Religious Studies (CRE)",
      "Creative Arts",
      "Physical Health Education"
    ],
    "7-9": [
      "Mathematics",
      "English",
      "Kiswahili",
      "Integrated Science",
      "Business Studies",
      "Agriculture",
      "Social Studies",
      "Christian Religious Studies (CRE)",
      "Health Education",
      "Pre-Technical Studies",
      "Sports and Physical Education"
    ],
    "10-12": [
      "Mathematics",
      "English",
      "Kiswahili",
      "Physics",
      "Chemistry",
      "Biology",
      "Agriculture",
      "History and Citizenship",
      "Geography",
      "Christian Religious Studies (CRE)",
      "Business Studies",
      "Computer Studies",
      "Home Science",
      "Electricity",
      "Aviation",
      "Marine and Fisheries",
      "Building and Construction",
      "Woodwork",
      "Metalwork",
      "Power Mechanics",
      "General Science",
      "Media Technology",
      "Kenya Sign Language",
      "Literature in English",
      "Fasihi ya Kiswahili",
      "Indigenous Language",
      "French",
      "German",
      "Islamic Religious Education",
      "Hindu Religious Education",
      "Music and Dance",
      "Theatre and Film",
      "Sports and Recreation"
    ]
  };

  // ---------------------------
  // SENIOR SCHOOL PATHWAYS & COURSES
  // ---------------------------
  const seniorSchoolPathways = {
    STEM: [
      "Mathematics",
      "Biology",
      "Chemistry",
      "Physics",
      "Business Studies",
      "Computer Studies",
      "Environmental Science",
      "Engineering Technology",
      "Applied Sciences",
      "Electricity",
      "Aviation",
      "Agriculture",
      "Marine and Fisheries",
      "Building and Construction",
      "Woodwork",
      "Metalwork",
      "Power Mechanics",
      "General Science",
      "Home Science",
      "Media Technology"
    ],
    "Social Sciences": [
      "History & Citizenship",
      "Geography",
      "Mathematics",
      "Business Studies",
      "Political Studies",
      "Christian Religious Studies (CRE)",
      "Kenya Sign Language",
      "Literature in English",
      "Fasihi ya Kiswahili",
      "Indigenous Language",
      "Hindu Religious Education",
      "French",
      "German",
      "Islamic Religious Education",
    ],
    "Arts & Sports Science": [
      "French",
      "Hindu Religious Education",
      "Mathematics",
      "Computer Studies",
      "Literature in English",
      "Islamic Religious Education",
      "German",
      "Fasihi ya Kiswahili",
      "Kiswahili",
      "History & Citizenship",
      "Geography",
      "Biology",
      "General Science",
      "Fine Art",
      "Film & Media Studies",
      "Fashion & Design",
      "Fasihi ya Kiswahili",
       "Music and Dance",
      "Theatre and Film",
      "Sports and Recreation"
    ]
  };

  // ---------------------------
  // MARKS FORM - Helper function to populate grades and subjects/courses
  // ---------------------------
  function populateGradeFields(Grade) {
    if (!Grade) return;
    const isSeniorSchool = Grade >= 10 && Grade <= 12;
    const seniorFields = document.querySelectorAll('.senior-school-fields');
    const juniorFields = document.querySelectorAll('.junior-school-fields');
    
    if (isSeniorSchool) {
      // Show senior school fields, hide subject and junior score
      seniorFields.forEach(field => field.style.display = 'block');
      juniorFields.forEach(field => field.style.display = 'none');
      subjectSelect.style.display = 'none';
      subjectSelect.required = false;
      scoreInput.required = false;
      scoreInput.style.display = 'none';
      
      // Make senior school components optional (filled based on what user enters)
      continuousAssessmentInput.required = false;
      projectWorkInput.required = false;
      endTermExamInput.required = false;
      
      // Reset pathway and course
      pathwaySelect.innerHTML = '<option value="">-- Select Pathway --</option>';
      courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
      // Populate pathways
      Object.keys(seniorSchoolPathways).forEach(pathway => {
        const opt = document.createElement("option");
        opt.value = pathway;
        opt.textContent = pathway;
        pathwaySelect.appendChild(opt);
      });
    } else {
      // Hide senior school fields, show subject and junior score
      seniorFields.forEach(field => field.style.display = 'none');
      juniorFields.forEach(field => field.style.display = 'block');
      subjectSelect.style.display = 'block';
      subjectSelect.required = true;
      scoreInput.required = true;
      scoreInput.style.display = 'block';
      
      // Make senior school components not required
      continuousAssessmentInput.required = false;
      projectWorkInput.required = false;
      endTermExamInput.required = false;
      
      // Reset senior school selects
      pathwaySelect.value = '';
      courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
      // Populate subjects for junior school based on actual grade (not range)
      subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
      let range = "";
      if (Grade >= 1 && Grade <= 3) range = "1-3";
      else if (Grade >= 4 && Grade <= 6) range = "4-6";
      else if (Grade >= 7 && Grade <= 9) range = "7-9";
      (gradeSubjects[range] || []).forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub.toLowerCase().replace(/\s+/g, "-");
        opt.textContent = sub;
        subjectSelect.appendChild(opt);
      });
    }
  }

  // ---------------------------
  // PATHWAY SELECTION - Populate courses
  // ---------------------------
  pathwaySelect?.addEventListener("change", () => {
    const pathway = pathwaySelect.value;
    courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
    if (pathway && seniorSchoolPathways[pathway]) {
      seniorSchoolPathways[pathway].forEach(course => {
        const opt = document.createElement("option");
        opt.value = course.toLowerCase().replace(/\s+/g, "-");
        opt.textContent = course;
        courseSelect.appendChild(opt);
      });
    }
  });

  // Helper function to populate material grade fields
  function populateMaterialGradeFields(grade) {
    if (!grade) return;
    const isSeniorSchool = grade >= 10 && grade <= 12;
    const seniorMaterialFields = document.querySelectorAll('.senior-material-fields');
    
    if (isSeniorSchool) {
      // Show pathway and course fields
      seniorMaterialFields.forEach(field => field.style.display = 'block');
      materialSubject.style.display = 'none';
      materialSubject.required = false;
      materialSubject.innerHTML = '<option value="">-- Select Subject --</option>';
      
      // Reset pathway and course
      materialPathway.innerHTML = '<option value="">-- Select Pathway --</option>';
      materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
      
      // Populate pathways
      Object.keys(seniorSchoolPathways).forEach(pathway => {
        const opt = document.createElement("option");
        opt.value = pathway;
        opt.textContent = pathway;
        materialPathway.appendChild(opt);
      });
    } else {
      // Hide pathway and course fields
      seniorMaterialFields.forEach(field => field.style.display = 'none');
      materialSubject.style.display = 'block';
      materialSubject.required = true;
      materialPathway.value = '';
      materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
      
      // Populate subjects for junior school
      let range = "";
      if (grade >= 1 && grade <= 3) range = "1-3";
      else if (grade >= 4 && grade <= 6) range = "4-6";
      else if (grade >= 7 && grade <= 9) range = "7-9";
      materialSubject.innerHTML = '<option value="">-- Select Subject --</option>';
      (gradeSubjects[range] || []).forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub.toLowerCase().replace(/\s+/g, "-");
        opt.textContent = sub;
        materialSubject.appendChild(opt);
      });
    }
  }

  // ---------------------------
  // STUDY MATERIALS - Populate subjects dynamically
  // ---------------------------
  materialGrade?.addEventListener("change", () => {
    const grade = Number(materialGrade.value);
    populateMaterialGradeFields(grade);
  });

  // ---------------------------
  // MATERIALS PATHWAY SELECTION - Populate courses
  // ---------------------------
  materialPathway?.addEventListener("change", () => {
    const pathway = materialPathway.value;
    materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
    if (pathway && seniorSchoolPathways[pathway]) {
      seniorSchoolPathways[pathway].forEach(course => {
        const opt = document.createElement("option");
        opt.value = course.toLowerCase().replace(/\s+/g, "-");
        opt.textContent = course;
        materialCourse.appendChild(opt);
      });
    }
  });

  // ---------------------------
  // BACKEND INTERACTIONS
  // ---------------------------
  async function saveMarkBackend(mark) {
    try {
      console.log("[TeachersDashboard] Submitting mark payload:", mark);  // 🆕 Log what's being sent
      const res = await fetch(`${API_BASE}/marks/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(mark)
      });
      if (res.status === 403) throw new Error("Forbidden");
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save mark");
      const result = await res.json();
      console.log("[TeachersDashboard] Mark saved successfully:", result);  // 🆕 Log the response
      return result;
    } catch (err) {
      console.error("Save mark error:", err);
      alert("Failed to save mark. See console for details.");
      throw err;
    }
  }

  async function loadSubmittedMarks() {
    try {
      console.log("Fetching marks from:", `${API_BASE}/marks/teacher`);
      const res = await fetch(`${API_BASE}/marks/teacher`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log("Response status:", res.status);
      
      if (res.status === 403) {
        alert("You are not authorized to view marks.");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch marks");
      
      submittedMarks = await res.json();
      console.log("Loaded marks:", submittedMarks);
      console.log("Marks array type:", Array.isArray(submittedMarks));
      console.log("Marks count:", submittedMarks.length);
      
      window.currentMarks = submittedMarks;
      displayMarks(submittedMarks);
      
      // Ensure all details are visible after loading
      submittedMarksContainer.querySelectorAll("details").forEach(d => {
        d.style.display = "";
      });
    } catch (err) {
      console.error("Load marks error:", err);
      console.error("Error stack:", err.stack);
    }
  }

  // ---------------------------
  // DISPLAY FUNCTIONS
  // ---------------------------
  function sanitize(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function displayMarks(marks) {
    console.log("Displaying marks:", marks); // DEBUG
    console.log("Marks count:", marks ? marks.length : 0); // DEBUG
    
    const grouped = {};
    (marks || []).forEach(m => {
      const key = `${m.assessment}_${m.term}_${m.year}_${m.grade}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    
    console.log("Grouped marks:", grouped); // DEBUG
    console.log("Grouped keys:", Object.keys(grouped)); // DEBUG
    
    submittedMarksContainer.innerHTML = '';
    if (!Object.keys(grouped).length) {
      console.log("No marks to display"); // DEBUG
      submittedMarksContainer.innerHTML = '<p style="text-align:center;color:#777;">No marks submitted yet.</p>';
      return;
    }
    Object.keys(grouped).forEach(key => {
      try {
        const groupMarks = grouped[key];
        const headerInfo = groupMarks[0];
        const details = document.createElement('details');
        details.className = 'marks-accordion';
        const assessmentLabel = headerInfo.assessment === 5 ? 'End Term' : 'Assessment ' + headerInfo.assessment;
        const summaryText = `Grade: ${sanitize(headerInfo.grade)} • Term: ${sanitize(headerInfo.term)} • Year: ${sanitize(headerInfo.year)} • ${assessmentLabel} — ${groupMarks.length} record${groupMarks.length > 1 ? 's' : ''}`;
        const summary = document.createElement('summary');
        summary.className = 'marks-accordion-summary';
        summary.innerHTML = `<strong>${summaryText}</strong>`;
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'pdf-btn';
        pdfBtn.textContent = '📄 Download PDF';
        pdfBtn.dataset.key = key;
        pdfBtn.style.margin = '8px 0';
        pdfBtn.style.padding = '4px 8px';
        pdfBtn.style.cursor = 'pointer';
        
        // Determine if senior school to show appropriate table headers
        const gradeMatch = headerInfo.grade.toString().match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
        
        const table = document.createElement('table');
        table.classList.add('marks-table');
        
        // Different headers for senior vs junior school
        let thead = `<thead>
              <tr>
                  <th>Admission</th>
                  <th>Name</th>
                  <th>Subject/Course</th>`;
        
        if (isSeniorSchool) {
          thead += `<th>Continuous Assessment (30%)</th>
                  <th>Project Work (20%)</th>
                  <th>End-Term Exam (50%)</th>
                  <th>Final Score</th>
                  <th>Grade</th>`;
        } else {
          thead += `<th>Score (%)</th>`;
        }
        
        thead += `<th>Actions</th>
              </tr>
          </thead>`;
        
        let tbody = `<tbody>
              ${groupMarks.map(m => {
          const gradeMatch = m.grade.toString().match(/\d+/);
          const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
          const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
          const subjectDisplay = isSeniorSchool ? `${m.pathway || 'N/A'} - ${m.course || 'N/A'}` : (m.subject || '').replace(/-/g, ' ');
          
          let scoreCell = '';
          if (isSeniorSchool) {
            const ca = m.continuousAssessment !== null && m.continuousAssessment !== undefined ? sanitize(m.continuousAssessment) : '-';
            const pw = m.projectWork !== null && m.projectWork !== undefined ? sanitize(m.projectWork) : '-';
            const et = m.endTermExam !== null && m.endTermExam !== undefined ? sanitize(m.endTermExam) : '-';
            const finalScore = m.finalScore !== null && m.finalScore !== undefined ? sanitize(m.finalScore) : '-';
            const perfLevel = m.performanceLevel || '-';
            scoreCell = `<td>${ca}</td><td>${pw}</td><td>${et}</td><td><strong>${finalScore}</strong></td><td>${perfLevel}</td>`;
          } else {
            scoreCell = `<td>${sanitize(m.score ?? '-')}</td>`;
          }
          
          return `<tr data-id="${m._id || ''}">
                      <td>${sanitize(m.admissionNo ?? m.admission ?? '')}</td>
                      <td>${sanitize(m.studentName)}</td>
                      <td>${sanitize(subjectDisplay)}</td>
                      ${scoreCell}
                      <td>
                          <button class="btn-edit" data-action="edit">✏️</button>
                          <button class="btn-delete" data-action="delete">🗑️</button>
                      </td>
                  </tr>`;
        }).join('')}
          </tbody>
        `;
        
        table.innerHTML = `<caption class="sr-only">${summaryText}</caption>${thead}${tbody}`;
        details.appendChild(summary);
        details.appendChild(pdfBtn);
        details.appendChild(table);
        submittedMarksContainer.appendChild(details);
      } catch (err) {
        console.error("Error rendering marks group:", err, key);
      }
    });
  }

  // ---------------------------
  // EDIT / DELETE HANDLERS
  // ---------------------------
  submittedMarksContainer.addEventListener("click", async e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = row?.dataset.id;
    if (btn.dataset.action === "edit") {
      const mark = submittedMarks.find(m => m._id === id);
      if (!mark) return alert("Error: mark not found");
      admissionInput.value = mark.admissionNo || mark.admission;
      studentNameInput.value = mark.studentName;
      
      // Set grade - it's stored as "Grade 5" format
      currentGradeInput.value = mark.grade || '';
      
      // Extract grade number and trigger field population
      const gradeMatch = mark.grade.toString().match(/\d+/);
      const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
      populateGradeFields(gradeNum);
      
      document.getElementById("term").value = mark.term;
      yearInput.value = mark.year;
      assessmentSelect.value = mark.assessment;
      
      // Set subject/pathway/course based on school level
      const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
      if (isSeniorSchool) {
        pathwaySelect.value = mark.pathway || '';
        if (mark.pathway) {
          // Trigger pathway change to populate courses
          const evt = new Event('change', { bubbles: true });
          pathwaySelect.dispatchEvent(evt);
          // Now set the course value
          setTimeout(() => {
            courseSelect.value = mark.course || '';
          }, 50);
        }
        // Set component scores
        continuousAssessmentInput.value = mark.continuousAssessment || '';
        projectWorkInput.value = mark.projectWork || '';
        endTermExamInput.value = mark.endTermExam || '';
      } else {
        subjectSelect.value = mark.subject || '';
        scoreInput.value = mark.score || '';
      }
      
      editingMarkId = id;
      showToast("Editing mode activated - scroll to form", "info");
      marksForm.scrollIntoView({ behavior: 'smooth' });
    }
    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this mark?")) return;
      try {
        const res = await fetch(`${API_BASE}/marks/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (res.status === 403) return showToast("Unauthorized", "error");
        if (!res.ok) throw new Error("Delete failed");
        showToast("Deleted successfully", "success");
        await loadSubmittedMarks();
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Failed to delete mark", "error");
      }
    }
  });

  // ---------------------------
  // PDF DOWNLOAD
  // ---------------------------
  async function downloadTableAsPDF(table, title) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const headers = Array.from(table.querySelectorAll("thead th"))
      .map(th => th.innerText)
      .filter(h => h.toLowerCase() !== "actions");
    const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td"))
        .map(td => td.innerText)
        .filter((_, idx) => headers[idx] !== "Actions")
    );
    doc.text(title, 14, 15);
    doc.autoTable({
      startY: 20,
      head: [headers],
      body: rows,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [22, 160, 133] }
    });
    doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
  }

  submittedMarksContainer.addEventListener("click", e => {
    const btn = e.target.closest(".pdf-btn");
    if (!btn) return;
    const details = btn.closest("details");
    const table = details.querySelector("table");
    const title = btn.previousElementSibling?.innerText || "Marks_Report";
    downloadTableAsPDF(table, title);
  });

  // ---------------------------
  // SEARCH FILTER
  // ---------------------------
  document.getElementById("marksSearchBox")?.addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    submittedMarksContainer.querySelectorAll("details").forEach(d => {
      const text = d.innerText.toLowerCase();
      d.style.display = text.includes(term) ? "" : "none";
    });
  });

  // ---------------------------
  // FORM SUBMISSION
  // ---------------------------
  marksForm?.addEventListener('submit', async e => {
    e.preventDefault();
    
    // Get grade number from currentGradeInput
    const gradeMatch = currentGradeInput.value.match(/\d+/);
    if (!gradeMatch) {
      alert("Please select a student first");
      return;
    }
    const grade = Number(gradeMatch[0]);
    const isSeniorSchool = grade >= 10 && grade <= 12;
    
    const markPayload = {
      admissionNo: admissionInput.value.trim(),
      studentName: studentNameInput.value.trim(),
      grade: grade,
      stream: selectedStudentStream || null,  // 🆕 Include student's stream (from their enrollment), not teacher's stream
      term: Number(document.getElementById('term').value),
      year: Number(yearInput.value),
      assessment: Number(assessmentSelect.value)
    };

    // Basic validation - all fields must be present
    if (!markPayload.admissionNo || !markPayload.studentName || !markPayload.grade || 
        isNaN(markPayload.term) || isNaN(markPayload.year) || isNaN(markPayload.assessment)) {
      alert("Please fill all required fields.");
      return;
    }

    // ===== JUNIOR SCHOOL (1-9): Simple score =====
    if (!isSeniorSchool) {
      markPayload.subject = subjectSelect.value;
      markPayload.score = Number(scoreInput.value);
      
      if (!markPayload.subject || isNaN(markPayload.score)) {
        alert("Please fill Subject and Score.");
        return;
      }
      if (markPayload.score < 0 || markPayload.score > 100) {
        alert("Score must be between 0-100.");
        return;
      }
    } 
    // ===== SENIOR SCHOOL (10-12): Component scores =====
    else {
      markPayload.pathway = pathwaySelect.value;
      markPayload.course = courseSelect.value;
      
      if (!markPayload.pathway || !markPayload.course) {
        alert("Please select Pathway and Course.");
        return;
      }
      
      const ca = continuousAssessmentInput.value ? Number(continuousAssessmentInput.value) : null;
      const pw = projectWorkInput.value ? Number(projectWorkInput.value) : null;
      const et = endTermExamInput.value ? Number(endTermExamInput.value) : null;
      
      // At least one component must be provided
      if ((ca === null || isNaN(ca)) && (pw === null || isNaN(pw)) && (et === null || isNaN(et))) {
        alert("Please enter at least one component score.");
        return;
      }

      // Validate component scores if provided
      if (ca !== null && (isNaN(ca) || ca < 0 || ca > 100)) {
        alert("Continuous Assessment must be between 0-100.");
        return;
      }
      if (pw !== null && (isNaN(pw) || pw < 0 || pw > 100)) {
        alert("Project Work must be between 0-100.");
        return;
      }
      if (et !== null && (isNaN(et) || et < 0 || et > 100)) {
        alert("End-Term Exam must be between 0-100.");
        return;
      }

      markPayload.continuousAssessment = ca;
      markPayload.projectWork = pw;
      markPayload.endTermExam = et;
    }

    try {
      if (editingMarkId) {
        const res = await fetch(`${API_BASE}/marks/${editingMarkId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(markPayload)
        });
        if (!res.ok) throw new Error("Update failed");
        editingMarkId = null;
      } else {
        await saveMarkBackend(markPayload);
      }
      
      marksForm.reset();
      admissionInput.value = '';
      studentNameInput.value = '';
      currentGradeInput.value = '';
      if (continuousAssessmentInput) continuousAssessmentInput.value = '';
      if (projectWorkInput) projectWorkInput.value = '';
      if (endTermExamInput) endTermExamInput.value = '';
      
      const searchBox = document.getElementById("marksSearchBox");
      if (searchBox) {
        searchBox.value = '';
      }
      
      await loadSubmittedMarks();
      showToast("✅ Mark submitted successfully!");
    } catch (err) {
      console.error('Mark submission error:', err);
      showToast("⚠️ Error submitting mark. Please try again.");
    }
  });

  // ---------------------------
  // AUTO-FILL STUDENT NAME AND GRADE WITH SCHOOL CHECK
  // ---------------------------
  admissionInput?.addEventListener('blur', async () => {
    const admission = admissionInput.value.trim();
    if (!admission) {
      studentNameInput.value = '';
      currentGradeInput.value = '';
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/users/student/${admission}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        studentNameInput.value = '';
        currentGradeInput.value = '';
        showToast("Student not found. Please check the admission number.", "error");
        return;
      }
      const student = await res.json();
      // Only autofill if student is in the same school as the teacher
      if (student.schoolId !== teacherSchoolId) {
        studentNameInput.value = '';
        currentGradeInput.value = '';
        admissionInput.value = '';
        showToast("The student not found in your school.", "error");
        return;
      }
      studentNameInput.value = student.name || '';
      currentGradeInput.value = student.grade || ''; // Display full grade with stream (e.g., "Grade 5W")
      
      // 🆕 Extract and store the student's stream from their grade
      // Grade format: "Grade 5" (no stream) or "Grade 5W" (with stream "W")
      selectedStudentStream = null;
      if (student.grade) {
        const gradeStr = String(student.grade).trim();
        // Try to extract stream: "Grade 5W" → stream is "W" (last char if not a digit)
        const lastChar = gradeStr[gradeStr.length - 1];
        if (lastChar && isNaN(lastChar)) {
          selectedStudentStream = lastChar;
        }
        
        const gradeMatch = gradeStr.match(/\d+/);
        if (gradeMatch) {
          const gradeNum = Number(gradeMatch[0]);
          // Automatically populate grade fields based on the fetched grade
          populateGradeFields(gradeNum);
        }
      }
    } catch (err) {
      console.error('Student lookup error:', err);
      studentNameInput.value = '';
      currentGradeInput.value = '';
      showToast("Error looking up student. Please try again.", "error");
    }
  });

  // ---------------------------
  // STUDY MATERIALS - Fetch materials for display
  // ---------------------------
  async function loadMaterials() {
    try {
      if (!token) {
        console.error("No token found");
        showToast("Authentication required", "error");
        return;
      }

      const res = await fetch(`${API_BASE}/materials`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (res.status === 401 || res.status === 403) {
        showToast("Unauthorized to fetch materials", "error");
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Fetch error:", errData);
        showToast(`Error fetching materials: ${errData.message || res.statusText}`, "error");
        return;
      }

      const materials = await res.json();
      materialsListEl.innerHTML = "";
      
      if (!materials || materials.length === 0) {
        materialsListEl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#999;">No materials uploaded yet</td></tr>';
        return;
      }

      // Determine if we have senior school materials
      const hasSeniorSchool = materials.some(m => parseInt(m.grade) >= 10);
      const hasJuniorSchool = materials.some(m => parseInt(m.grade) < 10);

      // Update table header based on materials
      const tableHeader = document.getElementById("materialsTableHeader");
      if (tableHeader) {
        if (hasSeniorSchool && !hasJuniorSchool) {
          tableHeader.innerHTML = `
            <th>Grade</th>
            <th>Pathway</th>
            <th>Course</th>
            <th>Title</th>
            <th>Description</th>
            <th>File</th>
            <th>Actions</th>
          `;
        } else {
          tableHeader.innerHTML = `
            <th>Grade</th>
            <th>Subject</th>
            <th>Title</th>
            <th>Description</th>
            <th>File</th>
            <th>Actions</th>
          `;
        }
      }

      materials.forEach(mat => {
        const row = document.createElement("tr");
        const gradeNum = parseInt(mat.grade);
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
        
        // Use secure download route so server can enforce schoolId on download
        const fileCellContent = mat._id && mat.file ? 
          `<a href="${API_BASE}/materials/download/${mat._id}" target="_blank" class="file-link" style="color:#007bff;text-decoration:none;">📥 ${sanitize(mat.fileName)}</a>` : 
          '<span class="no-file" style="color:#999;">No file</span>';

        // ===== JUNIOR SCHOOL (1-9) =====
        if (!isSeniorSchool) {
          row.innerHTML = `
            <td>${sanitize(mat.grade)}</td>
            <td><strong>${sanitize((mat.subject || '').replace(/-/g, ' '))}</strong></td>
            <td>${sanitize(mat.title)}</td>
            <td>${sanitize(mat.description.substring(0, 50))}${mat.description.length > 50 ? '...' : ''}</td>
            <td>${fileCellContent}</td>
            <td><button data-action="delete-material" data-id="${mat._id}" class="btn-delete" style="background:none;border:none;cursor:pointer;font-size:1.2em;">🗑️</button></td>
          `;
        }
        // ===== SENIOR SCHOOL (10-12) =====
        else {
          row.innerHTML = `
            <td>${sanitize(mat.grade)}</td>
            <td><strong>${sanitize(mat.pathway || '')}</strong></td>
            <td><strong>${sanitize((mat.course || '').replace(/-/g, ' '))}</strong></td>
            <td>${sanitize(mat.title)}</td>
            <td>${sanitize(mat.description.substring(0, 40))}${mat.description.length > 40 ? '...' : ''}</td>
            <td>${fileCellContent}</td>
            <td><button data-action="delete-material" data-id="${mat._id}" class="btn-delete" style="background:none;border:none;cursor:pointer;font-size:1.2em;">🗑️</button></td>
          `;
        }
        
        materialsListEl.appendChild(row);
      });
    } catch (err) {
      console.error("Load materials error:", err);
      showToast("Error loading materials: " + err.message, "error");
      materialsListEl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#999;">Error loading materials</td></tr>';
    }
  }

  materialsForm?.addEventListener('submit', async e => {
    e.preventDefault();
    
    const grade = Number(materialGrade.value);
    const isSeniorSchool = grade >= 10 && grade <= 12;
    const fileInput = materialsForm.querySelector('input[type="file"]');

    // Validation
    if (!materialGrade.value) {
      showToast("Please select a grade", "error");
      return;
    }
    if (!materialTitle.value.trim()) {
      showToast("Please enter a title", "error");
      return;
    }
    if (!materialDescription.value.trim()) {
      showToast("Please enter a description", "error");
      return;
    }
    if (!fileInput || !fileInput.files[0]) {
      showToast("Please select a file to upload", "error");
      return;
    }

    // Check file size (max 10MB)
    if (fileInput.files[0].size > 10 * 1024 * 1024) {
      showToast("File size must be less than 10MB", "error");
      return;
    }

    // ===== JUNIOR SCHOOL (1-9) =====
    if (!isSeniorSchool) {
      if (!materialSubject.value) {
        showToast("Please select a subject", "error");
        return;
      }

      const formData = new FormData();
      formData.append("grade", materialGrade.value);
      formData.append("subject", materialSubject.value);
      formData.append("title", materialTitle.value.trim());
      formData.append("description", materialDescription.value.trim());
      formData.append("file", fileInput.files[0]);

      try {
        const res = await fetch(`${API_BASE}/materials/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        if (res.status === 403) throw new Error("Forbidden");
        if (!res.ok) throw new Error((await res.json()).message || "Failed to upload material");
        materialsForm.reset();
        await loadMaterials();
        showToast("✅ Study material uploaded successfully!", "success");
      } catch (err) {
        console.error("Upload error:", err);
        showToast("⚠️ Upload failed: " + err.message, "error");
      }
    }
    // ===== SENIOR SCHOOL (10-12) =====
    else {
      if (!materialPathway.value) {
        showToast("Please select a pathway", "error");
        return;
      }
      if (!materialCourse.value) {
        showToast("Please select a course", "error");
        return;
      }

      const formData = new FormData();
      formData.append("grade", materialGrade.value);
      formData.append("pathway", materialPathway.value);
      formData.append("course", materialCourse.value);
      formData.append("title", materialTitle.value.trim());
      formData.append("description", materialDescription.value.trim());
      formData.append("file", fileInput.files[0]);

      try {
        const res = await fetch(`${API_BASE}/materials/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        if (res.status === 403) throw new Error("Forbidden");
        if (!res.ok) throw new Error((await res.json()).message || "Failed to upload material");
        materialsForm.reset();
        await loadMaterials();
        showToast("✅ Study material uploaded successfully!", "success");
      } catch (err) {
        console.error("Upload error:", err);
        showToast("⚠️ Upload failed: " + err.message, "error");
      }
    }
  });

  // Handle delete-material clicks
  materialsListEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='delete-material']");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm("Delete this material?")) return;
    try {
      const res = await fetch(`${API_BASE}/materials/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.status === 403) return showToast("Unauthorized", "error");
      if (!res.ok) throw new Error("Delete failed");
      await loadMaterials();
      showToast("Material deleted", "success");
    } catch (err) {
      console.error("Delete material error:", err);
      showToast("Failed to delete material", "error");
    }
  });

  // ---------------------------
  // SMART REFRESH
  // ---------------------------
  smartRefreshBtn?.addEventListener("click", () => {
    window.location.reload();
  });

  // ---------------------------
  // TOAST
  // ---------------------------
  function showToast(msg, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ---------------------------
  // INITIAL LOAD
  // ---------------------------
  (async function init() {
    await loadTeacherProfile();
    await loadSchoolName(); // ✅ ADD THIS
    await loadTeacherAllocations(); // 🆕 Load allocations
    await loadSubmittedMarks();
    await loadMaterials();
  })();
})();
