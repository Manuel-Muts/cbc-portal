(() => {
  // ---------------------------
  // CONFIG + GLOBALS
  // ---------------------------
  console.log("📚 Teacher Materials Dashboard loading...");
  
  const API_BASE = config.api.baseURL;
  const token = localStorage.getItem("token");
  
  if (!token) {
    window.location.href = "/login";
    return;
  }

  // ---------------------------
  // DOM ELEMENTS
  // ---------------------------
  const materialGrade = document.getElementById("materialGrade");
  const materialSubject = document.getElementById("materialSubject");
  const materialPathway = document.getElementById("materialPathway");
  const materialCourse = document.getElementById("materialCourse");
  const materialTitle = document.getElementById("materialTitle");
  const materialDescription = document.getElementById("materialDescription");
  const materialsForm = document.getElementById("materials-form");
  const materialsListEl = document.getElementById("materialsList");
  const smartRefreshBtn = document.getElementById("smartRefreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // ---------------------------
  // HELPER FUNCTIONS (Logic Consolidation)
  // ---------------------------
  const SCHOOL_TYPES_GRADES = {
    full: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    primary_junior: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    senior: ["10", "11", "12"]
  };

  async function loadSchoolInfoAndPopulateGrades() {
    try {
      const res = await fetch(`${API_BASE}/my-school`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch school info");
      const school = await res.json();
      
      const type = school.schoolType || 'full';
      const grades = SCHOOL_TYPES_GRADES[type] || SCHOOL_TYPES_GRADES.full;
      
      if (materialGrade) {
        materialGrade.innerHTML = '<option value="">-- Select Grade --</option>';
        grades.forEach(g => {
          const opt = document.createElement("option");
          opt.value = g;
          opt.textContent = `Grade ${g}`;
          materialGrade.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Error fetching school info for grade population:", err);
    }
  }

  const getGradeNum = (grade) => {
    const match = (grade || "").toString().match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  };

  const isSeniorGrade = (grade) => {
    const num = getGradeNum(grade);
    return num >= 10 && num <= 12;
  };

  // ---------------------------
  // TAB LOGIC
  // ---------------------------
  function setupTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;

        tabBtns.forEach(b => b.classList.remove("active"));
        tabPanes.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const activePane = document.getElementById(target);
        if (activePane) activePane.classList.add("active");
      });
    });
  }

  // ---------------------------
  // CONSTANTS
  // ---------------------------
  // Pagination State
  let currentPage = 1;
  let totalPages = 1;
  const itemsPerPage = 10;

  const gradeSubjects = SUBJECT_DATA.gradeSubjects;
  const seniorSchoolPathways = SUBJECT_DATA.seniorSchoolPathways;

  // ---------------------------
  // HELPERS
  // ---------------------------
  function sanitize(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function populateMaterialGradeFields(grade) {
    if (!grade) return;
    const isSeniorSchool = isSeniorGrade(grade);
    const seniorMaterialFields = document.querySelectorAll('.senior-material-fields');
    
    if (isSeniorSchool) {
      seniorMaterialFields.forEach(field => field.style.display = 'block');
      if (materialSubject) {
        materialSubject.style.display = 'none';
        materialSubject.required = false;
        materialSubject.innerHTML = '<option value="">-- Select Subject --</option>';
      }
      
      if (materialPathway) materialPathway.innerHTML = '<option value="">-- Select Pathway --</option>';
      if (materialCourse) materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
      
      Object.keys(seniorSchoolPathways).forEach(pathway => {
        const opt = document.createElement("option");
        opt.value = pathway;
        opt.textContent = pathway;
        if (materialPathway) materialPathway.appendChild(opt);
      });
    } else {
      seniorMaterialFields.forEach(field => field.style.display = 'none');
      if (materialSubject) {
        materialSubject.style.display = 'block';
        materialSubject.required = true;
      }
      if (materialPathway) materialPathway.value = '';
      if (materialCourse) materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
      
      let range = "";
      if (grade >= 1 && grade <= 3) range = "1-3";
      else if (grade >= 4 && grade <= 6) range = "4-6";
      else if (grade >= 7 && grade <= 9) range = "7-9";
      
      if (materialSubject) {
        materialSubject.innerHTML = '<option value="">-- Select Subject --</option>';
        (gradeSubjects[range] || []).forEach(sub => {
          const opt = document.createElement("option");
          opt.value = sub.toLowerCase().replace(/\s+/g, "-");
          opt.textContent = sub;
          materialSubject.appendChild(opt);
        });
      }
    }
  }

  // ---------------------------
  // EVENT LISTENERS
  // ---------------------------
  materialGrade?.addEventListener("change", () => {
    populateMaterialGradeFields(materialGrade.value);
  });

  materialPathway?.addEventListener("change", () => {
    const pathway = materialPathway.value;
    if (materialCourse) {
      materialCourse.innerHTML = '<option value="">-- Select Course --</option>';
      if (pathway && seniorSchoolPathways[pathway]) {
        seniorSchoolPathways[pathway].forEach(course => {
          const opt = document.createElement("option");
          opt.value = course.toLowerCase().replace(/\s+/g, "-");
          opt.textContent = course;
          materialCourse.appendChild(opt);
        });
      }
    }
  });

  // ---------------------------
  // LOAD MATERIALS
  // ---------------------------
  async function loadMaterials(page = 1, forceRefresh = false) {
    const CACHE_KEY = "teacher_materials_cache";
    const CACHE_DURATION = 15 * 60 * 1000;
    const queryKey = `p${page}`;

    if (!forceRefresh) {
      try {
        const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        const cached = store[queryKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
          console.log(`✅ Using cached materials for page ${page}`);
          const data = cached.data;
          currentPage = data.currentPage || 1;
          totalPages = data.totalPages || 1;
          renderMaterials(data.materials || []);
          return;
        }
      } catch (e) { }
    }

    try {
      const res = await fetch(`${API_BASE}/materials/teacher?page=${page}&limit=${itemsPerPage}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) throw new Error("Failed to fetch materials");

      const data = await res.json();
      
      // Handle server-side pagination response
      const materials = data.materials || [];
      currentPage = data.currentPage || 1;
      totalPages = data.totalPages || 1;

      // Update Cache
      try {
        const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        store[queryKey] = { timestamp: Date.now(), data: data };
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      } catch (e) { }

      renderMaterials(materials);
      
    } catch (err) {
      console.error("Load materials error:", err);
      if (materialsListEl) materialsListEl.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">Error loading materials</td></tr>';
    }
  }

  // ---------------------------
  // RENDER MATERIALS (PAGINATED)
  // ---------------------------
  function renderMaterials(materials) {
    if (!materialsListEl) return;
    materialsListEl.innerHTML = "";
    
    if (!materials || materials.length === 0) {
      materialsListEl.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">No materials uploaded yet</td></tr>';
      updatePaginationControls();
      return;
    }

    // Ensure header is correct
    const tableHeader = document.getElementById("materialsTableHeader");
    if (tableHeader) {
      tableHeader.innerHTML = `
        <th>Grade</th>
        <th>Subject / Pathway</th>
        <th>Course</th>
        <th>Title</th>
        <th>Description</th>
        <th>File</th>
        <th>Downloads</th>
        <th>Actions</th>
      `;
    }

    materials.forEach(mat => {
      const row = document.createElement("tr");
      const isSeniorSchool = isSeniorGrade(mat.grade);
      
      const fileCellContent = mat._id && mat.file ? 
        `<a href="${mat.file}" target="_blank" class="file-link" style="color:#007bff;text-decoration:none;">📥 ${sanitize(mat.fileName)}</a>` : 
        '<span class="no-file" style="color:#999;">No file</span>';

      let col2 = ""; // Subject or Pathway
      let col3 = ""; // Course or -

      if (isSeniorSchool) {
          col2 = `<strong>${sanitize(mat.pathway || '')}</strong>`;
          col3 = `<strong>${sanitize((mat.course || '').replace(/-/g, ' '))}</strong>`;
      } else {
          col2 = `<strong>${sanitize((mat.subject || '').replace(/-/g, ' '))}</strong>`;
          col3 = `<span style="color:#ccc;">-</span>`;
      }

      row.innerHTML = `
        <td style="text-align:center; font-weight:600;">${sanitize(mat.grade)}</td>
        <td>${col2}</td>
        <td>${col3}</td>
        <td style="font-weight:500; color:#2d3748;">${sanitize(mat.title)}</td>
        <td title="${sanitize(mat.description)}">${sanitize(mat.description.substring(0, 35))}${mat.description.length > 35 ? '...' : ''}</td>
        <td style="white-space:nowrap;">${fileCellContent}</td>
        <td style="text-align: center;">${mat.downloadCount || 0}</td>
        <td style="text-align: center;"><button data-action="delete-material" data-id="${mat._id}" class="btn-delete" title="Delete">🗑️</button></td>
      `;
      materialsListEl.appendChild(row);
    });

    updatePaginationControls();
  }

  function updatePaginationControls() {
    let paginationEl = document.getElementById("materialsPagination");
    if (!paginationEl) {
      const table = materialsListEl.closest("table");
      if (table && table.parentElement) {
        paginationEl = document.createElement("div");
        paginationEl.id = "materialsPagination";
        paginationEl.style.cssText = "display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px;";
        table.parentElement.appendChild(paginationEl);
      }
    }

    if (!paginationEl) return;
    
    paginationEl.innerHTML = `
      <button id="prevMatBtn" class="btn secondary-btn" ${currentPage === 1 ? "disabled" : ""} style="padding: 5px 10px; font-size: 0.9em;">Previous</button>
      <span style="font-weight: bold; color: #555;">Page ${currentPage} of ${totalPages}</span>
      <button id="nextMatBtn" class="btn secondary-btn" ${currentPage === totalPages ? "disabled" : ""} style="padding: 5px 10px; font-size: 0.9em;">Next</button>
    `;

    document.getElementById("prevMatBtn")?.addEventListener("click", () => {
      if (currentPage > 1) {
        loadMaterials(currentPage - 1);
      }
    });

    document.getElementById("nextMatBtn")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        loadMaterials(currentPage + 1);
      }
    });
  }

  // ---------------------------
  // UPLOAD HANDLER
  // ---------------------------
  materialsForm?.addEventListener('submit', async e => {
    e.preventDefault();
    
    const isSeniorSchool = isSeniorGrade(materialGrade.value);
    const fileInput = materialsForm.querySelector('input[type="file"]');

    if (!materialGrade.value || !materialTitle.value.trim() || !materialDescription.value.trim() || !fileInput?.files[0]) {
      showToast("Please fill all required fields", "error");
      return;
    }

    if (fileInput.files[0].size > 10 * 1024 * 1024) {
      showToast("File size must be less than 10MB", "error");
      return;
    }

    const uploadBtn = materialsForm.querySelector('button[type="submit"]');
    const originalUploadBtnHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span>Uploading...';

    const formData = new FormData();
    formData.append("grade", materialGrade.value);
    formData.append("title", materialTitle.value.trim());
    formData.append("description", materialDescription.value.trim());
    formData.append("file", fileInput.files[0]);

    if (!isSeniorSchool) {
      if (!materialSubject.value) {
        showToast("Please select a subject", "error");
        uploadBtn.disabled = false; uploadBtn.innerHTML = originalUploadBtnHTML;
        return;
      }
      formData.append("subject", materialSubject.value);
    } else {
      if (!materialPathway.value || !materialCourse.value) {
        showToast("Please select a pathway and course", "error");
        uploadBtn.disabled = false; uploadBtn.innerHTML = originalUploadBtnHTML;
        return;
      }
      formData.append("pathway", materialPathway.value);
      formData.append("course", materialCourse.value);
    }

    // Create progress UI if it doesn't exist
    let progressContainer = document.getElementById("uploadProgressContainer");
    if (!progressContainer) {
      progressContainer = document.createElement("div");
      progressContainer.id = "uploadProgressContainer";
      progressContainer.style.cssText = "margin-bottom: 15px; width: 100%; background: #e9ecef; border-radius: 4px; overflow: hidden; display: none; box-shadow: inset 0 1px 2px rgba(0,0,0,.1);";
      progressContainer.innerHTML = `
        <div id="uploadProgressBar" style="width: 0%; height: 20px; background: #28a745; transition: width 0.3s ease; text-align: center; color: white; font-size: 12px; line-height: 20px;">0%</div>
      `;
      // Insert before submit button if possible
      if (uploadBtn.parentNode) {
        uploadBtn.parentNode.insertBefore(progressContainer, uploadBtn);
      } else {
        materialsForm.appendChild(progressContainer);
      }
    }
    
    const progressBar = document.getElementById("uploadProgressBar");
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressBar.textContent = "0%";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/materials/add`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    // Track upload progress
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${percentComplete}%`;
        progressBar.textContent = `${percentComplete}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        materialsForm.reset();

        // Clear cache on new upload
        localStorage.removeItem("teacher_materials_cache");

        const listTabBtn = document.querySelector('[data-tab="listTab"]');
        showToast("Study material uploaded successfully!", "success");
        // Ensure toast is visible before potentially disruptive UI updates
        setTimeout(() => {
          if (listTabBtn) listTabBtn.click();
          loadMaterials(1, true); // Force refresh and reset to page 1
        }, 100); // Small delay to allow toast to render
        // Reset UI
        setTimeout(() => {
          progressContainer.style.display = "none";
          progressBar.style.width = "0%";
        }, 1500);
      } else {
        let message = "Upload failed";
        try {
          const res = JSON.parse(xhr.responseText);
          message = res.message || message;
        } catch(e) {}
        showToast(`⚠️ Upload failed: ${message}`, "error");
        progressContainer.style.display = "none";
      }
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalUploadBtnHTML;
    };

    xhr.onerror = () => {
      showToast("⚠️ Network error occurred during upload", "error");
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalUploadBtnHTML;
      progressContainer.style.display = "none";
    };

    xhr.send(formData);
  });

  // ---------------------------
  // DELETE HANDLER
  // ---------------------------
  materialsListEl?.addEventListener("click", async (e) => {
    const target = e.target instanceof Element ? e.target : e.target.parentElement;
    const btn = target?.closest("button[data-action='delete-material']");
    if (!btn) return;
    if (!(await showConfirm("Are you sure you want to delete this study material?"))) return;
    
    try {
      const id = btn.dataset.id;
      const res = await fetch(`${API_BASE}/materials/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error("Delete failed");

      // Clear cache on delete
      localStorage.removeItem("teacher_materials_cache");

      showToast("Study material deleted successfully", "success");
      // Ensure toast is visible before re-rendering the list
      setTimeout(() => {
        loadMaterials(currentPage, true);
      }, 100); // Small delay to allow toast to render
    } catch (err) {
      showToast("Failed to delete: " + err.message, "error");
    }
  });

  // ---------------------------
  // CONTROLS
  // ---------------------------
  smartRefreshBtn?.addEventListener("click", () => {
    localStorage.removeItem("teacher_materials_cache");
    window.location.reload();
  });

  logoutBtn?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "/login";
  });

  // ---------------------------
  // INITIALIZE
  // ---------------------------
  (async function init() {
    setupTabs();
    await loadSchoolInfoAndPopulateGrades();
    await loadMaterials();
  })();

})();
