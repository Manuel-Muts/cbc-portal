// docs/js/admin/learner-demographics.js
(function () {
  const API_BASE = config.api.baseURL;

  // DOM Elements
  const demographicsContainer = document.getElementById("demographicsContainer");
  const gradeFilterSelect = document.getElementById("gradeFilter");
  const streamFilterSelect = document.getElementById("streamFilter");
  const refreshDemographicsBtn = document.getElementById("refreshDemographicsBtn");
  const exportDemographicsBtn = document.getElementById("exportDemographicsBtn");

  let currentDemographicsData = null;
  const currentAcademicYear = new Date().getFullYear();

  // ==========================================
  // SMART CACHING SYSTEM
  // ==========================================
  const CACHE_PREFIX = "demographics_cache_";
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds
  let forceRefresh = false; // Flag to bypass cache

  const cacheManager = {
    /**
     * Generate cache key from parameters
     */
    generateKey: (grade, stream, academicYear) => {
      return `${CACHE_PREFIX}${academicYear}_${grade || "all"}_${stream || "all"}`;
    },

    /**
     * Get cached data if valid
     */
    get: (key) => {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        const age = now - timestamp;

        // Check if cache is still valid
        if (age > CACHE_TTL) {
          console.log(`[DEMOGRAPHICS CACHE] ⏰ Cache expired (${Math.round(age / 1000)}s old)`);
          localStorage.removeItem(key);
          return null;
        }

        console.log(`[DEMOGRAPHICS CACHE] ✅ Cache hit (${Math.round(age / 1000)}s old)`);
        return data;
      } catch (error) {
        console.error("[DEMOGRAPHICS CACHE] Error reading cache:", error);
        return null;
      }
    },

    /**
     * Set cache data with timestamp
     */
    set: (key, data) => {
      try {
        const cacheData = {
          data,
          timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
        console.log(`[DEMOGRAPHICS CACHE] 💾 Data cached (TTL: ${CACHE_TTL / 60000} minutes)`);
      } catch (error) {
        console.error("[DEMOGRAPHICS CACHE] Error writing cache:", error);
        // Silently fail - app will still work without cache
      }
    },

    /**
     * Clear all demographics cache
     */
    clearAll: () => {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
          }
        });
        console.log(`[DEMOGRAPHICS CACHE] 🗑️ Cache cleared`);
      } catch (error) {
        console.error("[DEMOGRAPHICS CACHE] Error clearing cache:", error);
      }
    },

    /**
     * Get cache stats (for debugging)
     */
    getStats: () => {
      try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
        return {
          cachedItems: cacheKeys.length,
          keys: cacheKeys
        };
      } catch (error) {
        return { cachedItems: 0, keys: [] };
      }
    }
  };

  // Initialize
  function init() {
    loadDemographicsData();
    attachEventListeners();
  }

  function attachEventListeners() {
    if (gradeFilterSelect) gradeFilterSelect.addEventListener("change", loadDemographicsData);
    if (streamFilterSelect) streamFilterSelect.addEventListener("change", loadDemographicsData);
    if (refreshDemographicsBtn) {
      refreshDemographicsBtn.addEventListener("click", () => {
        forceRefresh = true;
        console.log("[DEMOGRAPHICS] 🔄 Manual refresh triggered - cache bypass enabled");
        loadDemographicsData();
      });
    }
    if (exportDemographicsBtn) exportDemographicsBtn.addEventListener("click", exportToCSV);
  }

  // Load demographics data from API or cache
  async function loadDemographicsData() {
    try {
      const selectedGrade = gradeFilterSelect?.value || "";
      const selectedStream = streamFilterSelect?.value || "";
      const token = authService?.getToken() || localStorage.getItem("token");

      if (!token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      // ==========================================
      // CHECK CACHE FIRST (unless force refresh)
      // ==========================================
      const cacheKey = cacheManager.generateKey(selectedGrade, selectedStream, currentAcademicYear);
      
      if (!forceRefresh) {
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
          currentDemographicsData = cachedData;
          populateFilterOptions(currentDemographicsData.filterOptions);
          renderDashboard(currentDemographicsData);
          return; // Use cached data, skip API call
        }
      } else {
        forceRefresh = false; // Reset flag after use
      }

      console.log("[DEMOGRAPHICS] 🌐 Fetching from API...");

      const queryParams = new URLSearchParams({
        academicYear: currentAcademicYear,
        ...(selectedGrade && { grade: selectedGrade }),
        ...(selectedStream && { stream: selectedStream })
      });

      const response = await fetch(`${API_BASE}/reports/learner-demographics?${queryParams}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized. Please log in again.");
        }
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText || response.statusText}`);
      }

      currentDemographicsData = await response.json();

      // ==========================================
      // CACHE THE RESPONSE
      // ==========================================
      cacheManager.set(cacheKey, currentDemographicsData);

      populateFilterOptions(currentDemographicsData.filterOptions);
      renderDashboard(currentDemographicsData);
    } catch (error) {
      console.error("Error loading demographics:", error);
      if (demographicsContainer) {
        demographicsContainer.innerHTML = `<div class="error-message">❌ Error loading demographics: ${error.message}</div>`;
      }
    }
  }

  // Populate filter dropdowns
  function populateFilterOptions(filterOptions) {
    if (!filterOptions) return;

    // Populate Grade filter
    if (gradeFilterSelect && filterOptions.availableGrades) {
      const currentValue = gradeFilterSelect.value;
      gradeFilterSelect.innerHTML = '<option value="">-- All Grades --</option>';
      filterOptions.availableGrades.forEach(grade => {
        const option = document.createElement("option");
        option.value = grade;
        option.textContent = grade;
        gradeFilterSelect.appendChild(option);
      });
      if (currentValue) gradeFilterSelect.value = currentValue;
    }

    // Populate Stream filter
    if (streamFilterSelect && filterOptions.availableStreams) {
      const currentValue = streamFilterSelect.value;
      streamFilterSelect.innerHTML = '<option value="">-- All Streams --</option>';
      filterOptions.availableStreams.forEach(stream => {
        const option = document.createElement("option");
        option.value = stream;
        option.textContent = stream;
        streamFilterSelect.appendChild(option);
      });
      if (currentValue) streamFilterSelect.value = currentValue;
    }
  }

  // Render complete dashboard
  function renderDashboard(data) {
    if (!demographicsContainer) return;

    let html = `
      <div class="demographics-dashboard">
        <!-- Summary Cards -->
        <div class="summary-cards-grid">
          ${renderSummaryCards(data.summary, data.genderBreakdown)}
        </div>

        <!-- Gender Breakdown Section -->
        <div class="section-card">
          <h3>📊 Gender Breakdown</h3>
          <div class="gender-cards">
            ${renderGenderCards(data.genderBreakdown)}
          </div>
        </div>

        <!-- Combined Class Breakdown Section -->
        <div class="section-card">
          <h3>📚 Breakdown by Grade / Stream</h3>
          <div class="table-responsive">
            ${renderClassTable(data.classBreakdown || data.gradeBreakdown || [])}
          </div>
        </div>

        <!-- Age Statistics Section -->
        <div class="section-card">
          <h3>🎂 Age Statistics</h3>
          ${renderAgeStatistics(data.ageStatistics)}
        </div>
      </div>
    `;

    demographicsContainer.innerHTML = html;
  }

  // Render summary cards
  function renderSummaryCards(summary, genderBreakdown) {
    const malePercentage = Math.round(genderBreakdown.malePercentage);
    const femalePercentage = Math.round(genderBreakdown.femalePercentage);

    return `
      <div class="card stats-card">
        <div class="stats-icon">👥</div>
        <div class="stats-content">
          <div class="stats-label">Total Learners</div>
          <div class="stats-value">${summary.totalLearners}</div>
          <div class="stats-year">AY ${summary.academicYear}</div>
        </div>
      </div>

      <div class="card stats-card">
        <div class="stats-icon">👦</div>
        <div class="stats-content">
          <div class="stats-label">Boys / Male Learners</div>
          <div class="stats-value">${genderBreakdown.male}</div>
          <div class="stats-percentage">${malePercentage}%</div>
        </div>
      </div>

      <div class="card stats-card">
        <div class="stats-icon">👧</div>
        <div class="stats-content">
          <div class="stats-label">Girls / Female Learners</div>
          <div class="stats-value">${genderBreakdown.female}</div>
          <div class="stats-percentage">${femalePercentage}%</div>
        </div>
      </div>

      ${genderBreakdown.other > 0 || genderBreakdown.notSpecified > 0 ? `
        <div class="card stats-card">
          <div class="stats-icon">❓</div>
          <div class="stats-content">
            <div class="stats-label">Other/Not Specified</div>
            <div class="stats-value">${genderBreakdown.other + genderBreakdown.notSpecified}</div>
          </div>
        </div>
      ` : ''}
    `;
  }

  // Render gender breakdown cards with visual representation
  function renderGenderCards(genderBreakdown) {
    const malePercentage = Math.round(genderBreakdown.malePercentage);
    const femalePercentage = Math.round(genderBreakdown.femalePercentage);

    return `
      <div class="card gender-card male-card">
        <h4>👦 Male / Boys</h4>
        <div class="gender-count">${genderBreakdown.male}</div>
        <div class="gender-percentage">${malePercentage}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${malePercentage}%; background-color: #3498db;"></div>
        </div>
      </div>

      <div class="card gender-card female-card">
        <h4>👧 Female / Girls</h4>
        <div class="gender-count">${genderBreakdown.female}</div>
        <div class="gender-percentage">${femalePercentage}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${femalePercentage}%; background-color: #e74c3c;"></div>
        </div>
      </div>

      ${genderBreakdown.other > 0 ? `
        <div class="card gender-card other-card">
          <h4>🏳️ Other</h4>
          <div class="gender-count">${genderBreakdown.other}</div>
          <div class="gender-percentage">${Math.round(genderBreakdown.other / genderBreakdown.total * 100)}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.round(genderBreakdown.other / genderBreakdown.total * 100)}%; background-color: #95a5a6;"></div>
          </div>
        </div>
      ` : ''}

      ${genderBreakdown.notSpecified > 0 ? `
        <div class="card gender-card not-specified-card">
          <h4>❓ Not Specified</h4>
          <div class="gender-count">${genderBreakdown.notSpecified}</div>
          <div class="gender-percentage">${Math.round(genderBreakdown.notSpecified / genderBreakdown.total * 100)}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.round(genderBreakdown.notSpecified / genderBreakdown.total * 100)}%; background-color: #f39c12;"></div>
          </div>
        </div>
      ` : ''}
    `;
  }

  // Render combined class breakdown table
  function renderClassTable(classBreakdown) {
    if (!classBreakdown || classBreakdown.length === 0) {
      return '<p style="text-align: center; color: #999;">No class data available</p>';
    }

    return `
      <table class="demographics-table">
        <thead>
          <tr>
            <th>Class</th>
            <th>Total</th>
            <th>👦 Boys / Male</th>
            <th>Boys %</th>
            <th>👧 Girls / Female</th>
            <th>Girls %</th>
            <th>Other</th>
          </tr>
        </thead>
        <tbody>
          ${classBreakdown.map(entry => `
            <tr>
              <td><strong>${entry.label || entry.grade || entry.stream || "Class"}</strong></td>
              <td>${entry.total}</td>
              <td>${entry.male}</td>
              <td><span class="badge badge-blue">${entry.malePercentage}%</span></td>
              <td>${entry.female}</td>
              <td><span class="badge badge-red">${entry.femalePercentage}%</span></td>
              <td>${entry.other + (entry.notSpecified || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // Render age statistics
  function renderAgeStatistics(ageStats) {
    return `
      <div class="age-stats-grid">
        <div class="card age-stat-card">
          <div class="age-stat-icon">📊</div>
          <div class="age-stat-content">
            <div class="age-stat-label">Average Age</div>
            <div class="age-stat-value">${ageStats.averageAge} years</div>
          </div>
        </div>
        <div class="card age-stat-card">
          <div class="age-stat-icon">📉</div>
          <div class="age-stat-content">
            <div class="age-stat-label">Minimum Age</div>
            <div class="age-stat-value">${ageStats.minAge} years</div>
          </div>
        </div>
        <div class="card age-stat-card">
          <div class="age-stat-icon">📈</div>
          <div class="age-stat-content">
            <div class="age-stat-label">Maximum Age</div>
            <div class="age-stat-value">${ageStats.maxAge} years</div>
          </div>
        </div>
        <div class="card age-stat-card">
          <div class="age-stat-icon">👥</div>
          <div class="age-stat-content">
            <div class="age-stat-label">With DOB</div>
            <div class="age-stat-value">${ageStats.learnersWithDOB}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Export to CSV
  function exportToCSV() {
    if (!currentDemographicsData) {
      alert("No data available to export");
      return;
    }

    const data = currentDemographicsData;
    const selectedGrade = gradeFilterSelect?.value || "All Grades";
    const selectedStream = streamFilterSelect?.value || "All Streams";

    let csv = `Learner Demographics Report\n`;
    csv += `Academic Year: ${data.summary.academicYear}\n`;
    csv += `Grade Filter: ${selectedGrade}\n`;
    csv += `Stream Filter: ${selectedStream}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;

    // Overall Summary
    csv += `OVERALL SUMMARY\n`;
    csv += `Total Learners,${data.summary.totalLearners}\n`;
    csv += `Male,${data.genderBreakdown.male},${data.genderBreakdown.malePercentage}%\n`;
    csv += `Female,${data.genderBreakdown.female},${data.genderBreakdown.femalePercentage}%\n`;
    csv += `Other/Not Specified,${data.genderBreakdown.other + data.genderBreakdown.notSpecified}\n\n`;

    // Combined Class Breakdown
    const classBreakdown = data.classBreakdown || data.gradeBreakdown || [];
    if (classBreakdown && classBreakdown.length > 0) {
      csv += `BREAKDOWN BY CLASS / STREAM\n`;
      csv += `Class,Total,Male,Male %,Female,Female %,Other\n`;
      classBreakdown.forEach(entry => {
        csv += `${entry.label || entry.grade || entry.stream || "Class"},${entry.total},${entry.male},${entry.malePercentage}%,${entry.female},${entry.femalePercentage}%,${entry.other + (entry.notSpecified || 0)}\n`;
      });
      csv += `\n`;
    }

    // Age Statistics
    csv += `AGE STATISTICS\n`;
    csv += `Average Age,${data.ageStatistics.averageAge} years\n`;
    csv += `Minimum Age,${data.ageStatistics.minAge} years\n`;
    csv += `Maximum Age,${data.ageStatistics.maxAge} years\n`;
    csv += `Learners with DOB,${data.ageStatistics.learnersWithDOB}\n`;

    // Trigger download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `learner_demographics_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export module
  window.LearnerDemographicsModule = {
    init,
    cache: {
      clear: () => cacheManager.clearAll(),
      stats: () => cacheManager.getStats(),
      TTL: CACHE_TTL / 60000 // in minutes
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
