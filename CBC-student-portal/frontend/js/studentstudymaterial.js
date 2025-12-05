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
    "7-9": ["Mathematics", "English", "Kiswahili", "Integrated Science", "Social Studies", "Pre-Technical Studies", "Agriculture", "Religious Studies (CRE)", "Creative Arts and Sports"]
  };

  const slugify = (s = "") => s.toLowerCase().replace(/\s+/g, "-");

  // -------------------------------
  // FILTERS
  // -------------------------------
  gradeFilter.addEventListener("change", () => {
    const grade = parseInt(gradeFilter.value, 10);
    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    if (!grade) return loadMaterials();

    const range = grade <= 3 ? "1-3" : grade <= 6 ? "4-6" : "7-9";
    gradeSubjects[range].forEach(subj => {
      const o = document.createElement("option");
      o.value = slugify(subj);
      o.textContent = subj;
      subjectFilter.appendChild(o);
    });
    loadMaterials();
  });

  subjectFilter.addEventListener("change", loadMaterials);

  // -------------------------------
  // FETCH MATERIALS
  // -------------------------------
  async function fetchMaterials() {
    if (!token) return [];
    try {
      const res = await fetch(`${API_BASE}/materials/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch materials");
      return await res.json();
    } catch (err) {
      console.error("Error fetching materials:", err);
      return [];
    }
  }

  const matchesFilter = (m, grade, subj) => {
    const g = !grade || String(m.grade) === String(grade);
    const s = !subj || slugify(m.subject || "") === subj;
    return g && s;
  };

  // -------------------------------
  // LOAD MATERIALS INTO TABLE
  // -------------------------------
  async function loadMaterials(forceUpdate = false) {
    const grade = gradeFilter.value;
    const subject = subjectFilter.value;

    const allMaterials = await fetchMaterials();

    if (!allMaterials.length) {
      materialsList.innerHTML = `<p style="text-align:center;color:#777;">No materials available.</p>`;
      return;
    }

    if (!forceUpdate && JSON.stringify(allMaterials) === JSON.stringify(cachedMaterials)) return;

    cachedMaterials = allMaterials;

    const filtered = allMaterials.filter(m => matchesFilter(m, grade, subject));

    if (!filtered.length) {
      materialsList.innerHTML = `<p style="text-align:center;color:#777;">No study materials found for this selection.</p>`;
      return;
    }

    // Build table
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
          <td>${m.title}</td>
          <td>${m.grade}</td>
          <td>${m.subject}</td>
          <td>${m.description || ""}</td>
          <td>
            ${m.file ? `
              <div class="file-actions">
                <a href="${m.file}" target="_blank" class="file-name">${m.fileName || "Download"}</a><br/>
                <button class="download-btn" data-link="${m.file}" data-name="${m.fileName}">⬇️ Download</button>
              </div>
            ` : `<span style="color:#888;">No file</span>`}
          </td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table></div>`;
    materialsList.innerHTML = tableHtml;

    attachButtonHandlers();
  }

  // -------------------------------
  // BUTTON HANDLERS
  // -------------------------------
  function attachButtonHandlers() {
    materialsList.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        const link = btn.dataset.link;
        const name = btn.dataset.name || "material.pdf";
        if (!link) return;

        if (btn.classList.contains("download-btn")) {
          fetch(link)
            .then(res => res.blob())
            .then(blob => {
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
            })
            .catch(err => {
              console.error("Download error:", err);
              alert("Failed to download file.");
            });
        }

        
      };
    });
  }

  // Initial load
  loadMaterials();

  // Optional: refresh every 15s
  setInterval(() => loadMaterials(true), 15000);
});