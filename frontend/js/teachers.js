(() => {
  // ---------------------------
  // CONFIG + GLOBALS
  // ---------------------------
  const API_BASE = "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  let submittedMarks = []; // in-memory marks list
  let editingMarkId = null;
  let teacher = null;

  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const gradeRangeSelect = document.getElementById("gradeRange");
  const actualGradeSelect = document.getElementById("actualGrade");
  const subjectSelect = document.getElementById("subject");
  const assessmentSelect = document.getElementById("assessmentSelect");
  const admissionInput = document.getElementById("admissionNo");
  const studentNameInput = document.getElementById("studentName");
  const logoutBtn = document.getElementById("logoutBtn");
  const marksForm = document.getElementById("marks-form");
  const submittedMarksContainer = document.getElementById("submittedMarksContainer");
  const yearInput = document.getElementById("year");
  const scoreInput = document.getElementById("score");

  // Study materials
  const materialGrade = document.getElementById("materialGrade");
  const materialSubject = document.getElementById("materialSubject");
  const materialTitle = document.getElementById("materialTitle");
  const materialDescription = document.getElementById("materialDescription");
  const materialsForm = document.getElementById("materials-form");
  const materialsListEl = document.getElementById("materialsList");

  // Smart refresh & toast elements
  const smartRefreshBtn = document.getElementById("smartRefreshBtn");

  // ---------------------------
  // AUTHENTICATION
  // ---------------------------
  async function loadTeacherProfile() {
    if (!token) return redirectToLogin();
    try {
      const res = await fetch(`${API_BASE}/users/user`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      teacher = data;

      // Normalize roles to array
      const rolesArray = Array.isArray(teacher.roles) ? teacher.roles : [teacher.role];
      if (!rolesArray.includes("teacher") && !rolesArray.includes("classteacher")) throw new Error("Unauthorized");

      document.getElementById("teacherName").textContent = teacher.name || "";
      window.currentTeacher = teacher;
    } catch (err) {
      console.error("Dashboard auth error:", err);
      redirectToLogin();
    }
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
    "1-3": ["Mathematics","Kiswahili","English","Environmental Activities","Social Studies","Religious Studies (CRE)","Creative Arts and Sports"],
    "4-6": ["Mathematics","English","Kiswahili","Integrated Science","Social Studies","Religious Studies (CRE)","Creative Arts","Physical Health Education"],
    "7-9": ["Mathematics","English","Kiswahili","Integrated Science","Business Studies","Agriculture","Social Studies","Religious Studies (CRE)","Health Education","Pre-Technical Studies","Sports and Physical Education"]
  };

  // ---------------------------
  // MARKS FORM - Populate grades and subjects
  // ---------------------------
  gradeRangeSelect?.addEventListener("change", () => {
    const range = gradeRangeSelect.value;
    actualGradeSelect.innerHTML = '<option value="">-- Select Grade --</option>';
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    const grades = range === "1-3" ? [1,2,3] : range === "4-6" ? [4,5,6] : range === "7-9" ? [7,8,9] : [];
    grades.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = `Grade ${g}`;
      actualGradeSelect.appendChild(opt);
    });
  });

  actualGradeSelect?.addEventListener("change", () => {
    const grade = Number(actualGradeSelect.value);
    if (!grade) return;

    let range = "";
    if (grade >= 1 && grade <= 3) range = "1-3";
    else if (grade >= 4 && grade <= 6) range = "4-6";
    else if (grade >= 7 && grade <= 9) range = "7-9";

    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    (gradeSubjects[range] || []).forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub.toLowerCase().replace(/\s+/g, "-");
      opt.textContent = sub;
      subjectSelect.appendChild(opt);
    });
  });

  // ---------------------------
  // STUDY MATERIALS - Populate subjects dynamically
  // ---------------------------
  materialGrade?.addEventListener("change", () => {
    const grade = Number(materialGrade.value);
    if (!grade) return;
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
  });

  // ---------------------------
  // BACKEND INTERACTIONS
  // ---------------------------
  async function saveMarkBackend(mark) {
    try {
      const res = await fetch(`${API_BASE}/marks/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(mark)
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save mark");
      return await res.json();
    } catch (err) {
      console.error("Save mark error:", err);
      alert("Failed to save mark. See console for details.");
      throw err;
    }
  }

 async function loadSubmittedMarks() {
  try {
    const res = await fetch(`${API_BASE}/marks/teacher`, { // <-- lowercase "marks"
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to fetch marks");
    submittedMarks = await res.json();
    window.currentMarks = submittedMarks;
    displayMarks(submittedMarks);
  } catch (err) {
    console.error("Load marks error:", err);
  }
}


  // ---------------------------
  // DISPLAY FUNCTIONS
  // ---------------------------
  function sanitize(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" }[c]));
  }

  function displayMarks(marks) {
    const grouped = {};
    (marks || []).forEach(m => {
      const key = `${m.assessment}_${m.term}_${m.year}_${m.grade}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    submittedMarksContainer.innerHTML = '';
    if (!Object.keys(grouped).length) {
      submittedMarksContainer.innerHTML = `<p style="text-align:center;color:#777;">No marks submitted yet.</p>`;
      return;
    }

    Object.keys(grouped).forEach(key => {
      const groupMarks = grouped[key];
      const headerInfo = groupMarks[0];
      const details = document.createElement('details');
      details.className = 'marks-accordion';
      const assessmentLabel = headerInfo.assessment === 5 ? 'End Term' : 'Assessment ' + headerInfo.assessment;
      const summaryText = `Grade: ${sanitize(headerInfo.grade)} • Term: ${sanitize(headerInfo.term)} • Year: ${sanitize(headerInfo.year)} • ${assessmentLabel} — ${groupMarks.length} record${groupMarks.length > 1 ? 's' : ''}`;
      const summary = document.createElement('summary');
      summary.className = 'marks-accordion-summary';
      summary.innerHTML = `<strong>${summaryText}</strong>`;

      // PDF button above table
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'pdf-btn';
      pdfBtn.textContent = '📄 Download PDF';
      pdfBtn.dataset.key = key;
      pdfBtn.style.margin = '8px 0';
      pdfBtn.style.padding = '4px 8px';
      pdfBtn.style.cursor = 'pointer';

      const table = document.createElement('table');
      table.classList.add('marks-table');
      table.innerHTML = `
        <caption class="sr-only">${summaryText}</caption>
        <thead>
          <tr>
            <th>Admission</th>
            <th>Name</th>
            <th>Subject</th>
            <th>Score (%)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${groupMarks.map(m => `
            <tr data-id="${m._id || ''}">
              <td>${sanitize(m.admissionNo ?? m.admission ?? '')}</td>
              <td>${sanitize(m.studentName)}</td>
              <td>${sanitize((m.subject || '').replace(/-/g, ' '))}</td>
              <td>${sanitize(m.score ?? '-')}</td>
              <td>
                <button class="btn-edit" data-action="edit">✏️</button>
                <button class="btn-delete" data-action="delete">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      `;

      details.appendChild(summary);
      details.appendChild(pdfBtn);
      details.appendChild(table);
      submittedMarksContainer.appendChild(details);
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
      actualGradeSelect.value = mark.grade;
      document.getElementById("term").value = mark.term;
      yearInput.value = mark.year;
      subjectSelect.value = mark.subject;
      assessmentSelect.value = mark.assessment;
      scoreInput.value = mark.score;
      editingMarkId = id;
      showToast("Editing mode activated", "info");
    }

    if (btn.dataset.action === "delete") {
      if (!confirm("Delete this mark?")) return;
      try {
        const res = await fetch(`${API_BASE}/marks/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
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

    const markPayload = {
      admissionNo: admissionInput.value.trim(),
      studentName: studentNameInput.value.trim(),
      grade: actualGradeSelect.value,
      term: Number(document.getElementById('term').value),
      year: Number(yearInput.value),
      subject: subjectSelect.value,
      assessment: Number(assessmentSelect.value),
      score: Number(scoreInput.value)
    };

    if (!markPayload.admissionNo || !markPayload.studentName || !markPayload.grade ||
        isNaN(markPayload.term) || isNaN(markPayload.year) || !markPayload.subject ||
        isNaN(markPayload.assessment) || isNaN(markPayload.score)) {
      alert("Please fill all fields correctly. Term, Year, Assessment, and Score must be valid numbers.");
      return;
    }

    try {
      if (editingMarkId) {
        await fetch(`${API_BASE}/marks/${editingMarkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(markPayload)
        });
        editingMarkId = null;
      } else {
        await saveMarkBackend(markPayload);
      }

      marksForm.reset();
      admissionInput.value = '';
      studentNameInput.value = '';
      await loadSubmittedMarks();
      showToast("✅ Mark submitted successfully!");
    } catch (err) {
      console.error('Mark submission error:', err);
      showToast("⚠️ Error submitting mark. Please try again.");
    }
  });

  // ---------------------------
  // AUTO-FILL STUDENT NAME
  // ---------------------------
  admissionInput?.addEventListener('blur', async () => {
    const admission = admissionInput.value.trim();
    if (!admission) return;
    try {
      const res = await fetch(`${API_BASE}/users/student/${admission}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const student = await res.json();
      studentNameInput.value = student.name || '';
    } catch (err) { console.error('Student lookup error:', err); }
  });

  // ---------------------------
  // STUDY MATERIALS
  // ---------------------------
  async function loadMaterials() {
    try {
      const res = await fetch(`${API_BASE}/materials`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch materials");
      const materials = await res.json();
      materialsListEl.innerHTML = "";

      materials.forEach(mat => {
        const row = document.createElement("tr");
        const fileCellContent = mat.file
          ? `<a href="${mat.file}" target="_blank" class="file-link">${sanitize(mat.fileName)}</a>`
          : `<span class="no-file">No file attached</span>`;
        row.innerHTML = `
          <td>${sanitize(mat.grade)}</td>
          <td>${sanitize((mat.subject || '').replace(/-/g,' '))}</td>
          <td>${sanitize(mat.title)}</td>
          <td>${sanitize(mat.description)}</td>
          <td>${fileCellContent}</td>
          <td><button data-action="delete-material" data-id="${mat._id}">🗑️</button></td>
        `;
        materialsListEl.appendChild(row);
      });
    } catch (err) { console.error("Load materials error:", err); }
  }

  materialsForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("grade", materialGrade.value);
    formData.append("subject", materialSubject.value);
    formData.append("title", materialTitle.value);
    formData.append("description", materialDescription.value);

    const fileInput = materialsForm.querySelector('input[type="file"]');
    if (fileInput && fileInput.files[0]) formData.append("file", fileInput.files[0]);

    try {
      const res = await fetch(`${API_BASE}/materials/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to upload material");
      materialsForm.reset();
      await loadMaterials();
      showToast("Material uploaded successfully", "success");
    } catch (err) { console.error("Upload error:", err); showToast("Upload failed", "error"); }
  });

  // ---------------------------
  // SMART REFRESH
  // ---------------------------
  smartRefreshBtn?.addEventListener("click", async () => {
    await loadSubmittedMarks();
    await loadMaterials();
    showToast("Dashboard refreshed!", "info");
  });

  // ---------------------------
  // TOAST
  // ---------------------------
  function showToast(msg, type="success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ---------------------------
  // INITIAL LOAD
  // ---------------------------
  (async function init() {
    await loadTeacherProfile();
    await loadSubmittedMarks();
    await loadMaterials();
  })();

})();
