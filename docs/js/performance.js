document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE = config.api.baseURL;

  const user = await authService.getUserProfile(["student", "learner"]);
  if (!user) return;

  const token = window.authService?.getToken();
  authService.initLogout();

  const welcomeNameEl = document.getElementById("welcomeName");
  if (welcomeNameEl) welcomeNameEl.textContent = `Performance Analysis - ${user.name}`;

  // ---------------------------
  // CACHE UTILITIES
  // ---------------------------
  const CACHE_KEY = "student_performance_cache";
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  const getCached = (key) => {
    try {
      const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      if (store[key] && (Date.now() - store[key].timestamp < CACHE_TTL)) return store[key].data;
    } catch (e) { }
    return null;
  };

  const setCached = (key, data) => {
    try {
      const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      store[key] = { timestamp: Date.now(), data };
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch (e) { }
  };

  // Populate Year Filter (matches dashboard logic)
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

  let perfChartInstance = null;

  // Helper to ensure canvas exists and error messages are cleared
  function prepareContainer() {
    const container = document.getElementById("chartContainer");
    if (!container) return null;
    
    // Clear any "No marks" messages and ensure canvas is there
    container.innerHTML = '<canvas id="performanceChart"></canvas>';
    return document.getElementById("performanceChart");
  }

  async function loadPerformanceData() {
    const spinner = document.getElementById("loadingSpinner");
    if (spinner) spinner.style.display = "block";

    const term = document.getElementById("termFilter")?.value || "";
    const year = document.getElementById("yearFilter")?.value || "";
    const assess = "all";

    // Reuses the exact query logic from the dashboard
    const query = new URLSearchParams();
    if (term && term !== "all") query.set("term", term);
    if (year && year !== "all") query.set("year", year);
    if (assess && assess !== "all") query.set("assessment", assess);

    try {
      const queryString = query.toString();
      const cacheKey = `perf_data_${queryString || 'all'}`;
      let data = getCached(cacheKey);

      if (!data) {
        const url = `${API_BASE}/marks/student${queryString ? '?' + queryString : ''}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to fetch marks");
        data = await res.json();
        setCached(cacheKey, data);
      }

      const studentMarks = data.studentMarks || [];
      
      const canvas = prepareContainer();

      if (!studentMarks.length) {
        if (canvas.parentElement) canvas.parentElement.innerHTML = "<p style='text-align:center; padding:20px; color:#64748b;'>No marks found for the selected filters.</p>";
        return;
      }

      renderChart(studentMarks, canvas);
    } catch (err) {
      console.error(err);
    } finally {
      if (spinner) spinner.style.display = "none";
    }
  }

  function renderChart(studentMarks, canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const selectedYear = document.getElementById("yearFilter")?.value || "all";
    const selectedTerm = document.getElementById("termFilter")?.value || "all";

    if (perfChartInstance) perfChartInstance.destroy();

    // 1. COMPARATIVE VIEW (When a specific year is selected)
    // This allows comparing assessments across different terms side-by-side
    if (selectedYear !== "all") {
      // Use Centralized Mapping for labels
      const mapping = window.ASSESSMENT_MAPPING || {
        1: "Opener",
        2: "Assessment 2",
        3: "Assessment 3",
        4: "Assessment 4",
        5: "Midterm",
        6: "Assessment 6",
        7: "Assessment 7",
        8: "Endterm"
      };
      const labels = Object.values(mapping);
      const mappingKeys = Object.keys(mapping);
      
      const datasets = [];
      const termsToShow = selectedTerm !== "all" ? [Number(selectedTerm)] : [1, 2, 3];
      
      const termColors = {
        1: { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },
        2: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
        3: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }
      };

      termsToShow.forEach(tNum => {
        const termData = new Array(labels.length).fill(null);
        const termMarks = studentMarks.filter(m => m.term == tNum && m.year == selectedYear);
        
        if (termMarks.length > 0) {
          const assessTotals = {};
          termMarks.forEach(m => {
            let sc = Number(m.score ?? 0);
            if (!assessTotals[m.assessment]) assessTotals[m.assessment] = { sum: 0, count: 0 };
            assessTotals[m.assessment].sum += sc;
            assessTotals[m.assessment].count++;
          });

          Object.keys(assessTotals).forEach(a => {
            const label = mapping[a];
            const idx = labels.indexOf(label);
            if (idx !== -1) {
              termData[idx] = (assessTotals[a].sum / assessTotals[a].count).toFixed(1);
            }
          });

          datasets.push({
            label: `Term ${tNum}`,
            data: termData,
            borderColor: termColors[tNum].border,
            backgroundColor: termColors[tNum].bg,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 6,
            pointBackgroundColor: (ctx) => ctx.raw >= 41 ? '#10b981' : '#ef4444',
            spanGaps: true
          });
        }
      });

      perfChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, max: 100, title: { display: true, text: 'Score (%)' } },
            x: { title: { display: true, text: `Assessments for Year ${selectedYear}` } }
          },
          plugins: {
            legend: { display: selectedTerm === "all" },
            tooltip: {
              callbacks: {
                title: (items) => `${selectedYear} - ${items[0].dataset.label}, ${items[0].label}`
              }
            }
          }
        }
      });
    } 
    // 2. TIMELINE VIEW (When "All Years" is selected)
    // Displays a continuous trend over time
    else {
      const mapping = window.ASSESSMENT_MAPPING || {};
      const totals = {};
      studentMarks.forEach(m => {
        const key = `${m.year}-${String(m.term).padStart(2, '0')}-${String(m.assessment).padStart(2, '0')}`;
        let score = Number(m.score ?? 0);
        
        if (!totals[key]) {
          totals[key] = { sum: 0, count: 0, year: m.year, term: m.term, assessment: m.assessment };
        }
        totals[key].sum += score;
        totals[key].count += 1;
      });

      const sortedKeys = Object.keys(totals).sort();
      const dataPoints = sortedKeys.map(k => (totals[k].sum / totals[k].count).toFixed(1));
      const labels = sortedKeys.map(k => {
        const d = totals[k];
        const aName = mapping[d.assessment] || `A${d.assessment}`;
        return `${d.year} T${d.term} ${aName}`;
      });

      perfChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
          label: 'Avg. Performance (%)',
          data: dataPoints,
          backgroundColor: 'rgba(148, 163, 184, 0.1)',
          borderColor: '#94a3b8',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 6,
          pointBackgroundColor: (context) => context.raw >= 41 ? '#10b981' : '#ef4444',
          segment: {
            borderColor: (ctx) => ctx.p1.parsed.y >= 41 ? '#10b981' : '#ef4444',
          }
        }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, max: 100, title: { display: true, text: 'Avg. Score (%)' } },
            x: { title: { display: true, text: 'Academic Timeline' } }
          },
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Key: T = Term | Assessment labels are shown on the timeline',
              position: 'bottom',
              padding: { top: 20 },
              color: '#64748b',
              font: { size: 12, weight: 'normal' }
            },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const key = sortedKeys[items[0].dataIndex];
                  const d = totals[key];
                  const assessName = mapping[d.assessment] || `Assessment ${d.assessment}`;
                  return `${d.year} - Term ${d.term}, ${assessName}`;
                }
              }
            }
          }
        }
      });
    }
  }

  document.getElementById("applyFiltersBtn")?.addEventListener("click", loadPerformanceData);

  // Initial chart load using the default term-wide view
  loadPerformanceData();

  const container = document.getElementById("chartContainer");
  if (container && !container.innerHTML.trim()) {
    container.innerHTML = '<p style="text-align:center; padding:20px; color:#64748b;">Please select an assessment and click "Filter Analysis" to view your progress.</p>';
  }
});