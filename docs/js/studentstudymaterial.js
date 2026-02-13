document.addEventListener("DOMContentLoaded", () => {
  const gradeFilter = document.getElementById("materialGradeFilter");
  const subjectFilter = document.getElementById("materialSubjectFilter");
  const materialsList = document.getElementById("studyMaterialsList");

  const API_BASE = "http://localhost:5000/api";
  const token = localStorage.getItem("token");

  let cachedMaterials = [];

  const gradeSubjects = {
    "1-3": ["Mathematics", "Kiswahili", "English", "Environmental Activities", "Social Studies", "Religious Studies (CRE)", "Creative Arts and Sports"],
    "4-6": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Religious Education (CRE)", "Creative Arts and Sports"],
    "7-9": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Pre-Technical Studies", "Agriculture", "Religious Studies (CRE)", "Creative Arts and Sports"],
    "10-12": ["Mathematics", "English", "Kiswahili", "Physics", "Chemistry", "Biology", "History", "Geography", "Religious Studies (CRE)", "Business Studies", "Computer Science", "Home Science"]
  };

  const slugify = (s = "") => s.toLowerCase().replace(/\s+/g, "-");

  // -------------------------------
  // SETUP GRADE FILTER
  // -------------------------------
  const initializeGradeFilter = () => {
    // If student has a classGrade stored in localStorage
    let loggedInUser = JSON.parse(localStorage.getItem("loggedInUser")) || {};
    let studentGrade = loggedInUser.classGrade || "all";

    // Add grade options dynamically
    gradeFilter.innerHTML = '<option value="all">All Grades</option>';
    for (let g = 1; g <= 12; g++) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = `Grade ${g}`;
      if (studentGrade !== "all" && Number(studentGrade) === g) {
        o.selected = true;
      }
      gradeFilter.appendChild(o);
    }

    // Set to student's own grade by default
    if (studentGrade !== "all") {
      gradeFilter.value = studentGrade;
    }

    populateSubjectFilter(studentGrade);
  };

  const populateSubjectFilter = (grade) => {
    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    const gradeNum = parseInt(grade);
    
    // ===== JUNIOR SCHOOL (1-9): Show subjects =====
    if (gradeNum > 0 && gradeNum < 10) {
      const range = gradeNum <= 3 ? "1-3" : gradeNum <= 6 ? "4-6" : "7-9";
      gradeSubjects[range].forEach(subj => {
        const o = document.createElement("option");
        o.value = slugify(subj);
        o.textContent = subj;
        subjectFilter.appendChild(o);
      });
    }
    // ===== SENIOR SCHOOL (10-12): Show pathways =====
    else if (gradeNum >= 10 && gradeNum <= 12) {
      const pathways = ["STEM", "Social Sciences", "Arts & Sports Science"];
      pathways.forEach(pathway => {
        const o = document.createElement("option");
        o.value = slugify(pathway);
        o.textContent = pathway;
        subjectFilter.appendChild(o);
      });
    }
  };

  gradeFilter.addEventListener("change", () => {
    const grade = gradeFilter.value === "all" ? "all" : parseInt(gradeFilter.value, 10);
    populateSubjectFilter(grade);
    loadMaterials();
  });

  subjectFilter.addEventListener("change", loadMaterials);

  // -------------------------------
  // FETCH MATERIALS
  // -------------------------------
  async function fetchMaterials() {
    if (!token) return [];
    try {
      let subject = subjectFilter.value;
      if (!subject || subject.toLowerCase().includes("all")) {
        subject = "all";
      }

      let grade = gradeFilter.value || "all";

      const query = `?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}`;
      const res = await fetch(`${API_BASE}/materials/student${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error(`Failed to fetch materials: ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("Error fetching materials:", err);
      return [];
    }
  }

  // -------------------------------
  // LOAD MATERIALS
  // -------------------------------
  async function loadMaterials(forceUpdate = false) {
    const allMaterials = await fetchMaterials();

    if (!allMaterials.length) {
      materialsList.innerHTML =
        `<p style="text-align:center;color:#777;">No materials available.</p>`;
      return;
    }

    if (!forceUpdate && JSON.stringify(allMaterials) === JSON.stringify(cachedMaterials)) return;

    cachedMaterials = allMaterials;

    let subject = subjectFilter.value || "all";
    let grade = parseInt(gradeFilter.value) || 0;
    const isSeniorSchool = grade >= 10 && grade <= 12;

    const filtered = allMaterials.filter(m => {
      // For Junior school
      if (!isSeniorSchool) {
        return subject === "all" ||
               (m.subject && m.subject.toLowerCase() === subject.toLowerCase());
      }
      // For Senior school
      else {
        return true; // Show all senior school materials for the grade
      }
    });

    if (!filtered.length) {
      materialsList.innerHTML =
        `<p style="text-align:center;color:#777;">No study materials found for this selection.</p>`;
      return;
    }

    // ===== JUNIOR SCHOOL (1-9): Subject-based table =====
    if (grade < 10 || grade === 0) {
      let tableHtml = `
        <div class="materials-table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Grade</th>
              <th>Subject</th>
              <th>Description</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
      `;

      filtered.forEach(m => {
        tableHtml += `
          <tr>
            <td><strong>${m.title}</strong></td>
            <td>${m.grade}</td>
            <td>${m.subject ? m.subject.replace(/-/g, ' ') : '-'}</td>
            <td>${m.description ? m.description.substring(0, 50) : ''}${m.description && m.description.length > 50 ? '...' : ''}</td>
            <td>
              ${m.file ? `
                <div class="file-actions">
                  <a href="${m.file}" target="_blank" class="file-name" style="color:#007bff;text-decoration:none;">📄 ${m.fileName || "Download"}</a><br/>
                  <button class="download-btn" data-id="${m._id}" style="background:#007bff;color:white;border:none;padding:5px 10px;cursor:pointer;border-radius:4px;">⬇️ Download</button>
                </div>
              ` : `<span style="color:#888;">No file</span>`}
            </td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table></div>`;
      materialsList.innerHTML = tableHtml;
    }
    // ===== SENIOR SCHOOL (10-12): Pathway/Course-based table =====
    else {
      let tableHtml = `
        <div class="materials-table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Grade</th>
              <th>Pathway</th>
              <th>Course</th>
              <th>Description</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
      `;

      filtered.forEach(m => {
        tableHtml += `
          <tr>
            <td><strong>${m.title}</strong></td>
            <td>${m.grade}</td>
            <td>${m.pathway ? m.pathway : '-'}</td>
            <td><strong>${m.course ? m.course.replace(/-/g, ' ') : '-'}</strong></td>
            <td>${m.description ? m.description.substring(0, 40) : ''}${m.description && m.description.length > 40 ? '...' : ''}</td>
            <td>
              ${m.file ? `
                <div class="file-actions">
                  <a href="${m.file}" target="_blank" class="file-name" style="color:#007bff;text-decoration:none;">📄 ${m.fileName || "Download"}</a><br/>
                  <button class="download-btn" data-id="${m._id}" style="background:#007bff;color:white;border:none;padding:5px 10px;cursor:pointer;border-radius:4px;">⬇️ Download</button>
                </div>
              ` : `<span style="color:#888;">No file</span>`}
            </td>
          </tr>
        `;
      });

      tableHtml += `</tbody></table></div>`;
      materialsList.innerHTML = tableHtml;
    }

    attachButtonHandlers();
  }

  // -------------------------------
  // DOWNLOAD BUTTONS
  // -------------------------------
  function attachButtonHandlers() {
    materialsList.querySelectorAll(".download-btn").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!id) return;

        fetch(`${API_BASE}/materials/download/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => {
            if (!res.ok) throw new Error("Download failed");
            return res.blob();
          })
          .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "material";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
          })
          .catch(err => {
            console.error("Download error:", err);
            alert("Failed to download file.");
          });
      };
    });
  }

  // -------------------------------
  // INITIAL LOAD
  // -------------------------------
  initializeGradeFilter();
  loadMaterials();
  setInterval(() => loadMaterials(true), 15000);
});
