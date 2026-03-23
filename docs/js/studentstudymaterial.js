document.addEventListener("DOMContentLoaded", () => {
  const gradeFilter = document.getElementById("materialGradeFilter");
  const subjectFilter = document.getElementById("materialSubjectFilter");
  const materialsList = document.getElementById("studyMaterialsList");

  // API_BASE is now loaded from config.js
  // To change the API endpoint, update config.js
  const API_BASE = config.api.baseURL;
  const token = localStorage.getItem("token");

  let currentPage = 1;
  let totalPages = 1;

  let cachedDataString = "";
  
  // -------------------------------
  // CACHE UTILITIES
  // -------------------------------
  const CACHE_KEY_PREFIX = "materials_cache_";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const getCached = (key) => {
    try {
      const item = JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + key));
      if (item && (Date.now() - item.timestamp < CACHE_TTL)) return item.data;
    } catch (e) { return null; }
    return null;
  };

  const setCached = (key, data) => {
    try {
      localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (e) {}
  };

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
  const initializeGradeFilter = async () => {
    // If student has a classGrade stored in localStorage
    let loggedInUser = JSON.parse(localStorage.getItem("loggedInUser")) || {};
    let studentGrade = loggedInUser.grade || loggedInUser.classGrade || "all";

    // Verify enrollment to get current grade
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/enrollments/my-enrollment`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const enrollment = await res.json();
          if (enrollment.grade) {
            studentGrade = enrollment.grade;
            // numeric check? "Grade 5" -> 5
            const match = String(studentGrade).match(/\d+/);
            if (match) studentGrade = parseInt(match[0]);
          }
        }
      } catch (e) { console.error("Error fetching enrollment for materials", e); }
    }

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
      // Lock to current grade
      gradeFilter.disabled = true;
      if (gradeFilter.querySelector('option[value="all"]')) gradeFilter.querySelector('option[value="all"]').remove();
    }

    populateSubjectFilter(studentGrade);
  };

  const populateSubjectFilter = (grade) => {
    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    const gradeNum = grade === "all" ? 0 : parseInt(grade);
    
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

  // -------------------------------
  // FETCH MATERIALS
  // -------------------------------
  async function fetchMaterials(page = 1, bypassCache = false) {
    if (!token) return [];
    try {
      let subject = subjectFilter.value;
      if (!subject || subject.toLowerCase() === "all" || subject === "") {
        subject = "all";
      }

      let grade = gradeFilter.value || "all";

      // Generate cache key based on filters
      const cacheKey = `g${grade}_s${subject}_p${page}`;
      
      if (!bypassCache) {
        const cached = getCached(cacheKey);
        if (cached) return cached;
      }

      const query = `?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}&page=${page}`;
      const res = await fetch(`${API_BASE}/materials/student${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error(`Failed to fetch materials: ${res.status}`);
      const data = await res.json();
      setCached(cacheKey, data);
      return data;
    } catch (err) {
      console.error("Error fetching materials:", err);
      return [];
    }
  }

  // -------------------------------
  // LOAD MATERIALS
  // -------------------------------
  async function loadMaterials(forceUpdate = false) {
    // If forceUpdate is true, bypass cache. Otherwise use cache if available.
    const response = await fetchMaterials(currentPage, forceUpdate);
    
    let materialsArray = [];
    
    // Handle both old array format and new pagination object format
    if (Array.isArray(response)) {
        materialsArray = response;
    } else if (response && response.materials) {
        materialsArray = response.materials;
        totalPages = response.totalPages || 1;
        currentPage = response.currentPage || 1;
    }

    // Efficient cache check using string comparison
    const dataString = JSON.stringify(materialsArray);
    if (!forceUpdate && dataString === cachedDataString) return;
    cachedDataString = dataString;

    if (!materialsArray.length) {
      materialsList.innerHTML =
        `<p style="text-align:center;color:#777;">No materials available.</p>`;
      // Render pagination even if empty to show "Page 1 of 1" or handle empty states gracefully
      renderPaginationControls(); 
      return;
    }

    // Determine display mode based on the selected grade
    let grade = parseInt(gradeFilter.value) || 0;
    
    // If "All Grades" is selected (grade=0), we can try to guess from the first item
    if (grade === 0 && materialsArray.length > 0) {
       const firstGrade = parseInt(materialsArray[0].grade);
       if (!isNaN(firstGrade)) grade = firstGrade;
    }

    // ===== JUNIOR SCHOOL (1-9): Subject-based table =====
    // If grade is unknown (0) or < 10, default to Junior table
    // If grade >= 10, use Senior table
    const isSeniorSchool = grade >= 10 && grade <= 12;

    if (!isSeniorSchool) {
      let tableHtml = `
        <div class="materials-table-container">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Grade</th>
              <th>Subject</th>
              <th>Description</th>
              <th>Date</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
      `;

      materialsArray.forEach(m => {
        const date = new Date(m.createdAt).toLocaleDateString();
        
        // Check if material is new (uploaded within last 7 days)
        const uploadDate = new Date(m.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - uploadDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const newBadge = diffDays <= 7 ? '<span style="background-color:#28a745;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;">NEW</span>' : '';
        
        // Read status styling
        const isRead = m.isRead;
        const readBadge = isRead ? '<span style="background-color:#6c757d;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;">Read</span>' : '';
        const rowStyle = isRead ? 'style="background-color:#f8f9fa; color:#666;"' : '';
        
        tableHtml += `
          <tr ${rowStyle}>
            <td><strong>${m.title}</strong> ${newBadge} ${readBadge}</td>
            <td>${m.grade}</td>
            <td>${m.subject ? m.subject.replace(/-/g, ' ') : '-'}</td>
            <td>${m.description ? m.description.substring(0, 50) : ''}${m.description && m.description.length > 50 ? '...' : ''}</td>
            <td>${date}</td>
            <td>
              ${m.file ? `
                <div class="file-actions">
                  <a href="${m.file}" target="_blank" class="file-name mark-read-link" data-id="${m._id}" style="color:${isRead ? '#666' : '#007bff'};text-decoration:none;">📄 ${m.fileName || "Download"}</a><br/>
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
              <th>Date</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
      `;

      materialsArray.forEach(m => {
        const date = new Date(m.createdAt).toLocaleDateString();
        
        // Check if material is new (uploaded within last 7 days)
        const uploadDate = new Date(m.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - uploadDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const newBadge = diffDays <= 7 ? '<span style="background-color:#28a745;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;">NEW</span>' : '';
        
        // Read status styling
        const isRead = m.isRead;
        const readBadge = isRead ? '<span style="background-color:#6c757d;color:white;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:5px;vertical-align:middle;">Read</span>' : '';
        const rowStyle = isRead ? 'style="background-color:#f8f9fa; color:#666;"' : '';
        
        tableHtml += `
          <tr ${rowStyle}>
            <td><strong>${m.title}</strong> ${newBadge} ${readBadge}</td>
            <td>${m.grade}</td>
            <td>${m.pathway ? m.pathway : '-'}</td>
            <td><strong>${m.course ? m.course.replace(/-/g, ' ') : (m.subject || '-')}</strong></td>
            <td>${m.description ? m.description.substring(0, 40) : ''}${m.description && m.description.length > 40 ? '...' : ''}</td>
            <td>${date}</td>
            <td>
              ${m.file ? `
                <div class="file-actions">
                  <a href="${m.file}" target="_blank" class="file-name mark-read-link" data-id="${m._id}" style="color:${isRead ? '#666' : '#007bff'};text-decoration:none;">📄 ${m.fileName || "Download"}</a><br/>
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

    renderPaginationControls();
    attachButtonHandlers();
  }

  // -------------------------------
  // PAGINATION CONTROLS
  // -------------------------------
  function renderPaginationControls() {
    let controls = document.getElementById("materialsPagination");
    if (!controls) {
        controls = document.createElement("div");
        controls.id = "materialsPagination";
        controls.style.display = "flex";
        controls.style.justifyContent = "center";
        controls.style.gap = "10px";
        controls.style.marginTop = "15px";
        controls.style.alignItems = "center";
        materialsList.after(controls);
    }

    controls.innerHTML = `
        <button id="matPrevBtn" class="pagination-btn" ${currentPage <= 1 ? "disabled" : ""} style="padding:5px 10px;cursor:pointer;">Previous</button>
        <span style="font-size:14px;font-weight:bold;">Page ${currentPage} of ${totalPages}</span>
        <button id="matNextBtn" class="pagination-btn" ${currentPage >= totalPages ? "disabled" : ""} style="padding:5px 10px;cursor:pointer;">Next</button>
    `;

    document.getElementById("matPrevBtn").onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadMaterials(true);
        }
    };

    document.getElementById("matNextBtn").onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadMaterials(true);
        }
    };
  }

  // -------------------------------
  // DOWNLOAD BUTTONS
  // -------------------------------
  function attachButtonHandlers() {
    materialsList.querySelectorAll(".download-btn").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!id) return;

        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Downloading...';

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
            a.download = btn.closest('tr')?.querySelector('strong')?.innerText.trim() || "material";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
          })
          .catch(err => {
            console.error("Download error:", err);
            alert("Failed to download file.");
          })
          .finally(() => {
            btn.disabled = false;
            btn.innerHTML = originalContent;
          });
      };
    });

    // Attach Mark Read Handlers to File Links
    materialsList.querySelectorAll(".mark-read-link").forEach(link => {
      link.addEventListener("click", (e) => {
        const id = link.dataset.id;
        if (!id) return;
        
        // Mark UI as read immediately
        const row = link.closest("tr");
        if (row) {
            row.style.backgroundColor = "#f8f9fa";
            row.style.color = "#666";
        }

        // Send request to backend
        fetch(`${API_BASE}/materials/${id}/read`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
        }).catch(err => console.error("Error marking read:", err));
      });
    });
  }

  // -------------------------------
  // INITIAL LOAD
  // -------------------------------
  // Reset page when filters change
  gradeFilter.addEventListener("change", () => {
    const grade = gradeFilter.value;
    populateSubjectFilter(grade);
    currentPage = 1; // Reset to page 1
    loadMaterials(true);
  });

  subjectFilter.addEventListener("change", () => { 
    currentPage = 1; 
    loadMaterials(true); 
  });

  initializeGradeFilter().then(() => {
    loadMaterials();
  });
  setInterval(() => loadMaterials(false), 15000); // Polling (false = use cache if data hasn't changed)
});
