// docs/js/dean/submittedSubjectsModule.js

const SubmittedSubjectsModule = (function() {
    let isInitialized = false;
    let currentSchoolGrades = []; // To store grades available in the school
    let currentSchoolStreams = new Set(); // To store streams available in the school

    // DOM Element References (defined but not assigned until init)
    let ssGradeFilter;
    let ssTermFilter;
    let ssAssessmentFilter;
    let ssStreamFilter;
    let ssYearFilter;
    let loadSubmittedSubjectsBtn;
    let submittedSubjectsTableWrap;

    const API_BASE = config.api.baseURL;

    /**
     * Initializes the Submitted Subjects Module.
     * Populates filters and attaches event listeners.
     */
    function init() {
        if (isInitialized) return;
        console.log("📊 Submitted Subjects Module Initialized.");

        ssTermFilter = document.getElementById("ssTermFilter");
        ssAssessmentFilter = document.getElementById("ssAssessmentFilter");
        ssYearFilter = document.getElementById("ssYearFilter");
        loadSubmittedSubjectsBtn = document.getElementById("loadSubmittedSubjectsBtn");
        submittedSubjectsTableWrap = document.getElementById("submittedSubjectsTableWrap");
        populateFilters();
        attachEventListeners();
        isInitialized = true;
    }
    /**
     * Populates the grade, term, assessment, and stream filters.
     */
    function populateFilters() {
        console.log("DEBUG: populateFilters() called.");

        // 2. Populate Terms
        if (ssTermFilter) {
            ssTermFilter.innerHTML = `
                <option value="">-- Select Term --</option>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
            `;
            // Set default to current term
            const month = new Date().getMonth() + 1;
            let currentTerm = "1";
            if (month >= 5 && month <= 8) currentTerm = "2";
            else if (month >= 9) currentTerm = "3";
            ssTermFilter.value = currentTerm;
            console.log("DEBUG: ssTermFilter populated. Default:", ssTermFilter.value);
        } else {
            console.error("DEBUG: ssTermFilter element NOT FOUND (check ID 'ssTermFilter' in HTML)");
        }

        // 3. Populate Assessments
        if (ssAssessmentFilter && window.ASSESSMENT_MAPPING) { // Check if mapping is available
            ssAssessmentFilter.innerHTML = '<option value="">-- Select Assessment --</option>';
            Object.entries(window.ASSESSMENT_MAPPING).forEach(([value, label]) => {
                const opt = document.createElement("option");
                opt.value = value;
                opt.textContent = label;
                ssAssessmentFilter.appendChild(opt);
            });
            console.log("DEBUG: ssAssessmentFilter populated.");
            ssAssessmentFilter.value = "";
        }
        // 5. Populate Years
        if (ssYearFilter) {
            const currentYear = new Date().getFullYear();
            ssYearFilter.innerHTML = "";
            
            // Prepend a prompt option
            const promptOpt = document.createElement("option");
            promptOpt.value = "";
            promptOpt.textContent = "-- Select Year --";
            ssYearFilter.appendChild(promptOpt);

            for (let y = 2024; y <= 2126; y++) {
                const opt = document.createElement("option");
                opt.value = y;
                opt.textContent = y;
                if (y === currentYear) opt.selected = true;
                ssYearFilter.appendChild(opt);
            }
        }
    }
    /**
     * Attaches event listeners to filter elements and the load button.
     */
    function attachEventListeners() {
        if (loadSubmittedSubjectsBtn) {
            loadSubmittedSubjectsBtn.addEventListener("click", loadSubmittedSubjectCounts);
        }
    }
    /**
     * Fetches marks data and aggregates subject counts.
     */
    async function loadSubmittedSubjectCounts() {
        const term = ssTermFilter.value;
        const assessment = ssAssessmentFilter.value;
        const year = ssYearFilter ? ssYearFilter.value : new Date().getFullYear();

        if (!term || !assessment || !year) {
            window.cbcUtils.showToast("Please select Term, Assessment, and Year.", "error");
            return;
        }
        window.spinner?.show(loadSubmittedSubjectsBtn, "Auditing School...");
        submittedSubjectsTableWrap.innerHTML = ''; // Clear previous results
        try {
            const token = authService.getToken();
            const params = new URLSearchParams({ term, year, assessment, scope: 'school' }); // Add scope=school
            
            const res = await fetch(`${API_BASE}/marks/submission-stats-all?${params}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || "Failed to fetch school submission data.");
            }
            const data = await res.json();
            if (!data || data.length === 0) {
                submittedSubjectsTableWrap.innerHTML = '<div class="empty-state">No submitted marks found for the selected period.</div>';
                window.cbcUtils.showToast("No submitted marks found.", "info");
                return;
            }
            renderGroupedSubjectCounts(data, term, assessment);
            window.cbcUtils.showToast(`School-wide audit complete.`, "success");
        } catch (error) {
            console.error("Error loading submitted subject counts:", error);
            window.cbcUtils.showToast(error.message, "error");
        } finally {
            window.spinner?.hide(loadSubmittedSubjectsBtn);
        }
    }

  function renderGroupedSubjectCounts(data, term, assessment) {
    const categories = {
        primary: { title: "Primary School (PG - Grade 6)", rows: [] },
        junior: { title: "Junior School (Grade 7 - 9)", rows: [] },
        senior: { title: "Senior School (Grade 10 - 12)", rows: [] }
    };

    const grouped = {};
    data.forEach(item => {
        const grade = item.grade;
        const stream = item.stream || "-";
        const key = `${grade}_${stream}`;

        if (!grouped[key]) {
            grouped[key] = {
                grade,
                stream,
                subjects: [],
            };
        }

        grouped[key].subjects.push({
            name: item.subject,
            count: item.count
        });
    });

    Object.values(grouped).forEach(row => {
        const gNum = window.cbcUtils.getGradeNum(row.grade);
        if (gNum >= 10) categories.senior.rows.push(row);
        else if (gNum >= 7) categories.junior.rows.push(row);
        else categories.primary.rows.push(row);
    });

    const sortFn = (a, b) => window.cbcUtils.getGradeNum(a.grade) - window.cbcUtils.getGradeNum(b.grade);
    categories.primary.rows.sort(sortFn);
    categories.junior.rows.sort(sortFn);
    categories.senior.rows.sort(sortFn);

    let html = `
    <div class="audit-card">
        <div class="audit-header">
            <h3>Academic Submission Audit</h3>
            <button
                id="downloadFullAuditPdfBtn"
                class="btn secondary-btn">
                <i class="fas fa-file-pdf"></i>
                Download Audit
            </button>
        </div>
    `;

    Object.values(categories).forEach(cat => {
        if (cat.rows.length === 0) return;

        html += `
            <div class="audit-section" style="margin-top: 25px;">
                <h4 style="color: #2d3748; border-left: 4px solid #3182ce; padding-left: 10px; margin-bottom: 15px;">${cat.title}</h4>
                <div class="table-responsive">
                    <table class="marks-table">
                        <thead>
                            <tr>
                                <th>Grade</th>
                                <th>Stream</th>
                                <th>Submitted Subjects</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        cat.rows.forEach(row => {
            const subjectsHtml = row.subjects
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(subject => `<span class="subject-chip">${subject.name}</span>`)
                .join("");

            html += `
                <tr>
                    <td><strong>${row.grade}</strong></td>
                    <td>${row.stream}</td>
                    <td><div class="subjects-container">${subjectsHtml}</div></td>
                    <td><strong>${row.subjects.length}</strong></td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div>`;
    });

    html += `</div>`;

    submittedSubjectsTableWrap.innerHTML = html;

    document
        .getElementById("downloadFullAuditPdfBtn")
        ?.addEventListener("click", () =>
                downloadSubjectCountsPDF(
                    categories,
                "School-Wide",
                term,
                    assessment,
                "all"
            )
        );
}
    /**
     * Generates and downloads a PDF of the subject counts table.
     */
    async function downloadSubjectCountsPDF(data, grade, term, assessment, stream) {
        const btn = document.getElementById("downloadFullAuditPdfBtn");
        window.spinner?.show(btn, "Generating PDF...");

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // deanProfileData is assumed to be available globally from dean.js
            const schoolName = window.deanProfileData?.schoolName || "SCHOOL NAME"; 
            const mapping = window.ASSESSMENT_MAPPING || {};
            const assessLabel = assessment === "all" ? "All Assessments" : (mapping[assessment] || `Assessment ${assessment}`);
            const streamLabel = stream === "all" ? "All Streams" : `Stream ${stream}`;
            const year = ssYearFilter ? ssYearFilter.value : new Date().getFullYear();
            let yPos = 15;

            // Header
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text(schoolName, pageWidth / 2, yPos, { align: "center" });
            yPos += 7;

            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.text("SUBJECT SUBMISSION COUNTS REPORT", pageWidth / 2, yPos, { align: "center" });
            yPos += 5;

            doc.setFontSize(10);
            doc.text(`Grade: ${grade} | Year: ${year} | Term: ${term} | Assessment: ${assessLabel} | Stream: ${streamLabel}`, pageWidth / 2, yPos, { align: "center" });
            yPos += 10;

            // Render tables category by category to match the UI preview
            const categories = data; // This is the categories object passed from renderGroupedSubjectCounts
            const tableHeaders = [["Grade", "Stream", "Submitted Subjects", "Total"]];

            Object.values(categories).forEach(cat => {
                if (cat.rows.length === 0) return;

                // Check for page overflow before adding section title
                if (yPos > pageHeight - 40) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(45, 55, 72);
                doc.text(cat.title, 14, yPos);
                yPos += 5;

                const tableBody = cat.rows.map(row => [
                    row.grade,
                    row.stream,
                    row.subjects.map(s => s.name).sort().join(", "),
                    row.subjects.length.toString()
                ]);

                doc.autoTable({
                    startY: yPos,
                    head: tableHeaders,
                    body: tableBody,
                    theme: 'grid',
                    headStyles: { fillColor: [43, 108, 176] },
                theme: 'grid',
                headStyles: { fillColor: [43, 108, 176] }, // Blue header
                styles: { fontSize: 9, lineWidth: 0.1, lineColor: [0, 0, 0] },
                    margin: { left: 14, right: 14 },
                    columnStyles: {
                        2: { cellWidth: 'auto' }, // Allow subjects list to wrap
                        3: { halign: 'center', fontStyle: 'bold' }
                    }
                });

                yPos = doc.lastAutoTable.finalY + 15;
            });

            // Footer
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${totalPages}`, 14, pageHeight - 10);
                doc.text(`Printed: ${new Date().toLocaleString()} | CompetenceHub Analytics`, pageWidth - 14, pageHeight - 10, { align: "right" });
            }

            doc.save(`Subject_Counts_${grade}_T${term}_${assessment}_${stream}.pdf`);
        } catch (error) {
            console.error("PDF generation error:", error);
            window.cbcUtils.showToast("Failed to generate PDF.", "error");
        } finally {
            window.spinner?.hide(btn);
        }
    }

    return {
        init: init
    };
})();

window.SubmittedSubjectsModule = SubmittedSubjectsModule;