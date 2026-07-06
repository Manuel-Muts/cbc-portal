// docs/js/timetables.js
const TimetableModule = (function() {
    let isInitialized = false;
    
    // Default Academic Structure (Can be moved to Backend later)
    const CLASSES_PER_PAGE = 30; // Number of classes to display per page/section in block view (mon-fri fit)

    let schoolAllocations = []; // To store all teacher assignments for clash detection
    let allSavedTimetables =[]; // To store schedules for other grades
    let currentTimetableData = null; // 🆕 To store the generated snapshot for saving
    let teacherListPage = 1; // 🆕 Pagination state for teacher dropdown
    let teacherListTotalPages = 1;
    let teacherSearchTerm = "";
    const TEACHER_LIMIT = 10;
    let selectedSwapSlot = null; // 🆕 Tracks { day, lesson, element } for manual swapping
    let sharedActivityOrder = null; // 🆕 Shared activities order across grades
    let activeEditSlot = null; // 🆕 Tracks { dayIdx, lessonIdx } during manual edits
    let subjectPlacements = {}; // 🆕 Tracks placement preferences [grade][subject]

    /**
     * 🆕 Categorizes subjects for intelligent placement
     */
    function getSubjectType(sub) {
        return SUBJECT_DATA.getSubjectType(sub);
    }

    function isMorningPreferredSubject(sub) {
        const name = String(sub || "").trim().toLowerCase();
        return ["pe", "physical education", "sports and physical education", "physical health education", "sports", "sports and recreation"].some(alias => name === alias || name.includes(alias));
    }

    function isSubjectAllowedForPathway(sub, grade, pathway = "") {
        const subject = String(sub || "").trim();
        if (!subject || subject === "PPI") return true;
        if (!window.cbcUtils?.isSeniorGrade?.(grade)) return true;

        const selectedPathway = window.cbcUtils?.normalizePathway?.(pathway) || (String(pathway || "").trim());
        if (!selectedPathway) return true;

        const normalizedSubject = window.SUBJECT_DATA?.normalizeSeniorSubjectName?.(subject) || subject;
        const pathwayForSubject = window.SUBJECT_DATA?.getSeniorPathway?.(normalizedSubject) || "";
        const pathwayForSubjectNorm = window.cbcUtils?.normalizePathway?.(pathwayForSubject) || String(pathwayForSubject || "").trim();

        if (!pathwayForSubjectNorm) {
            return false;
        }

        return pathwayForSubjectNorm === "Core" || pathwayForSubjectNorm === selectedPathway;
    }

    function getDoubleLessonBlockCount(subName) {
        const counts = placementRules?.doubleLessons?.counts || {};
        if (counts[subName] !== undefined) return counts[subName];
        return placementRules?.doubleLessons?.subjects?.includes(subName) ? 1 : 0;
    }

    function sanitizeGridForPathway(gridData, grade, pathway = "") {
        if (!Array.isArray(gridData)) return [];
        return gridData.map(row => {
            if (!Array.isArray(row)) return [];
            return row.map(cell => {
                const subject = String(cell || "").trim();
                return subject && !isSubjectAllowedForPathway(subject, grade, pathway) ? "" : subject;
            });
        });
    }

    /**
     * 🆕 Provides default weekly frequencies for subjects
     */
    function getDefaultFrequency(sub, grade) {
        return SUBJECT_DATA.getDefaultFrequency(sub, grade);
    }

    const DEFAULT_ACTIVITY_PERIODS = SUBJECT_DATA.defaultActivityPeriods;

    function loadSharedActivityOrder() {
        try {
            const stored = localStorage.getItem('tt_shared_activity_order');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length === DEFAULT_ACTIVITY_PERIODS.length) {
                    sharedActivityOrder = parsed;
                    return;
                }
            }
        } catch (err) {
            console.warn('Unable to load shared activity order from storage:', err);
        }
        sharedActivityOrder = [...DEFAULT_ACTIVITY_PERIODS].sort(() => Math.random() - 0.5);
        try {
            localStorage.setItem('tt_shared_activity_order', JSON.stringify(sharedActivityOrder));
        } catch (_) {}
    }

    function getSharedActivityOrder() {
        if (!sharedActivityOrder) loadSharedActivityOrder();
        return [...sharedActivityOrder];
    }

    /**
     * 🆕 Helper to initialize or refresh frequencies for a grade/stream context
     */
    function ensureFrequenciesInitialized(grade, stream, pathway = "") {
        if (!grade) return;
        const allocated = getAllocatedSubjectsForGrade(grade, stream, pathway);
        if (!lessonFrequencies[grade]) lessonFrequencies[grade] = {};

        Object.keys(lessonFrequencies[grade]).forEach(sub => {
            if (!allocated.includes(sub) && sub !== "PPI") {
                delete lessonFrequencies[grade][sub];
            }
        });

        allocated.forEach(sub => {
            if (lessonFrequencies[grade][sub] === undefined) {
                lessonFrequencies[grade][sub] = getDefaultFrequency(sub, grade);
            }
        });
    }

    function reshuffleSharedActivities() {
        sharedActivityOrder = [...DEFAULT_ACTIVITY_PERIODS].sort(() => Math.random() - 0.5);
        try {
            localStorage.setItem('tt_shared_activity_order', JSON.stringify(sharedActivityOrder));
        } catch (err) {
            console.warn('Unable to persist shared activity order:', err);
        }
        return [...sharedActivityOrder];
    }

    // Default Weekly Frequencies
    let lessonFrequencies = {
        // Populated dynamically from school allocations
    };

    // Timetable Constraints/Settings
    let settings = {
        startTime: "08:20",
        lessonDuration: 40,
        lessonsPerDay: 9,
        breaks: [
            { name: "BREAK", afterLesson: 2, duration: 15 },
            { name: "BREAK", afterLesson: 4, duration: 20 },
            { name: "LUNCH", afterLesson: 6, duration: 70 }
        ],
        schoolDayEnd: "17:05" // Standard CBE end time
    };

    // 🆕 Placement Rules Configuration for intelligent subject scheduling
    let placementRules = {
        // Core Subjects (Math, English, Kiswahili) - prefer before Longbreak
        coreSubjectsPreference: {
            enabled: true,
            beforeLesson4Only: true,
            subjects: ["Mathematics", "English", "Kiswahili", "Math", "Eng", "Kisw"]
        },
        // Technical subjects - reduce afternoon placement
        technicalSubjectsPreference: {
            enabled: true,
            preferMorning: true,
            allowAfternoon: false // If true, allows afternoon placement; if false, minimizes it
        },
        // PPI - Friday mornings only
        ppiPreference: {
            enabled: true,
            fridayMorningOnly: true
        },
        // Creative subjects - afternoon only
        creativePreference: {
            enabled: true,
            afternoonOnly: true
        },
        // 🆕 Specific priorities for Junior/Primary skills
        sportsPreference: {
            enabled: true,
            preferBreaks: true // Logic handles Lesson 3-4
        },
        visualArtsPreference: {
            enabled: true,
            preferBreaks: true // Logic handles Lesson 4 or 6
        },
        doubleLessons: {
            enabled: true,
            subjects: ["Mathematics", "Biology", "Chemistry", "Physics", "Computer Studies", "Computer Science", "Electricity", "Integrated Science", "Agriculture", "Pre-Technical Studies", "Performing Arts C/A(p)"],
            counts: {
                Mathematics: 1,
                Biology: 2,
                Chemistry: 2,
                Physics: 2,
                "Computer Studies": 2,
                "Computer Science": 2,
                Electricity: 2
            }
        },
        strictFrequencyMode: {
            enabled: false
        }
    };

    // 🆕 School Info for grade population and branding
    let schoolInfo = null;
    const SCHOOL_TYPES = {
        full: {
            label: "Full School (Grades PG-12)",
            gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9","10","11","12"]
        },
        primary_junior: {
            label: "Primary + Junior (Grades PG-9)",
            gradeOptions: ["PG","PP1", "PP2", "1","2","3","4","5","6","7","8","9"]
        },
        senior: {
            label: "Senior School (Grades 10-12)",
            gradeOptions: ["10","11","12"]
        }
    };

    function getSchoolTypeKey() {
        if (!schoolInfo || !schoolInfo.schoolType) return 'full';
        const rawType = String(schoolInfo.schoolType).toLowerCase().replace(/[^a-z]/g, '_');
        if (rawType.includes('primary') || rawType.includes('junior')) return 'primary_junior';
        if (rawType.includes('senior')) return 'senior';
        return 'full';
    }

    function getGradeOptionsForSchool() {
        const schoolType = getSchoolTypeKey();
        return SCHOOL_TYPES[schoolType].gradeOptions.map(g => (g.startsWith('PP') || g.toUpperCase() === 'PG') ? g : `Grade ${g}`);
    }

    function isGradeSupportedBySchoolType(grade) {
        const schoolType = getSchoolTypeKey();
        if (schoolType === 'primary_junior') {
            return !window.cbcUtils?.isSeniorGrade(grade);
        }
        return true;
    }

    /**
     * 🆕 Updates the global settings object with default schedule values
     * based on the selected grade level (Primary, Junior, or Senior).
     * Populate modal defaults depending on grade selected.
     */
    function updateScheduleSettingsForGrade(grade) {
        const gradeMatch = (grade || "").match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        
        const isEarlyYears = grade && (grade.toUpperCase().includes('PP') || grade.toUpperCase() === 'PG');
        const isPrimary = (gradeNum >= 1 && gradeNum <= 6) || isEarlyYears;
        const isJunior = gradeNum >= 7 && gradeNum <= 9;
        const isSenior = gradeNum >= 10 && gradeNum <= 12;

        if (isPrimary) {
            const gUpper = (grade || "").toUpperCase();
            if (gUpper === 'PG' || gUpper === 'PP1') {
                // 🆕 Playgroup & PP1: 5 lessons, 30 mins each, 30 min break
                settings.startTime = "08:20";
                settings.lessonDuration = 30;
                settings.lessonsPerDay = 5;
                settings.schoolDayEnd = "11:40";
                settings.breaks = [
                    { name: "SHORT BREAK", afterLesson: 2, duration: 30 },
                    { name: "LONG BREAK", afterLesson: 4, duration: 30 }
                ];
            } else if (gUpper === 'PP2') {
                // 🆕 PP2: 6 lessons, 35 mins each
                settings.startTime = "08:20";
                settings.lessonDuration = 35;
                settings.lessonsPerDay = 6;
                settings.schoolDayEnd = "12:40";
                settings.breaks = [
                    { name: "SHORT BREAK", afterLesson: 2, duration: 30 },
                    { name: "LONG BREAK", afterLesson: 4, duration: 30 }
                ];
            } else {
                // Standard Primary (Grade 1-6)
                settings.startTime = "08:20";
                settings.lessonDuration = 35;
                settings.lessonsPerDay = 8;
                settings.schoolDayEnd = "15:30";
                settings.breaks = [
                    { name: "SHORT BREAK", afterLesson: 2, duration: 20 },
                    { name: "LONG BREAK", afterLesson: 4, duration: 30 },
                    { name: "LUNCH", afterLesson: 6, duration: 80 },
                    { name: "WRAP UP", afterLesson: 8, duration: 5 }
                ];
            }
        } else if (isJunior) {
            settings.startTime = "08:20";
            settings.lessonDuration = 40;
            settings.lessonsPerDay = 8;
            settings.schoolDayEnd = "15:30";
            settings.breaks = [
                { name: "SHORT BREAK", afterLesson: 2, duration: 10 },
                { name: "LONG BREAK", afterLesson: 4, duration: 20 },
                { name: "LUNCH", afterLesson: 6, duration: 70 },
                { name: "WRAP UP", afterLesson: 8, duration: 5 }
            ];
        } else if (isSenior) {
            settings.startTime = "08:20";
            settings.lessonDuration = 40;
            settings.lessonsPerDay = 9;
            settings.schoolDayEnd = "17:05";
            settings.breaks = [
                { name: "BREAK", afterLesson: 2, duration: 30 },
                { name: "BREAK", afterLesson: 4, duration: 10 },
                { name: "LUNCH", afterLesson: 6, duration: 60 }
            ];
        }
    }

    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (Optimized for better data freshness)
    const SCHOOL_INFO_CACHE_KEY = "timetable_school_info_cache";
    const ALLOCATIONS_CACHE_KEY = "timetable_allocations_cache";
    const TIMETABLES_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
    const SAVED_TIMETABLES_CACHE_KEY = "timetable_saved_cache";

    function init() {
        if (isInitialized) return;
        console.log("📅 Timetable Module Initialized");
        
        // 🆕 Load shared activity order and saved placement rules from localStorage
        loadSharedActivityOrder();
        loadPlacementRules();

        // 🆕 Show Initialization Overlay (similar to dean.js)
        const overlay = document.createElement('div');
        overlay.id = 'ttInitOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(255, 255, 255, 0.96); 
            z-index: 20000; display: flex; align-items: center; justify-content: center; 
            backdrop-filter: blur(6px); transition: opacity 0.4s ease;
        `;
        overlay.innerHTML = `
            <div style="text-align: center; padding: 45px; background: white; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; max-width: 420px; width: 92%;">
                <div class="spinner" style="width: 50px; height: 50px; border-width: 5px; border-top-color: #2b6cb0; border-right-color: #2b6cb0; display: inline-block; margin-right: 0;"></div>
                <h2 style="margin: 25px 0 10px 0; color: #1e293b; font-size: 1.6rem; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase;">Timetable Module</h2>
                <p style="color: #64748b; font-size: 1rem; font-weight: 500; line-height: 1.6; margin: 0;">Loading school data and preparing scheduling tools...</p>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Ensure timetableTab is empty before setupUIStructure
        const container = document.getElementById('timetableTab');
        if (container) {
            container.innerHTML = ''; // Clear any previous content
        }
        
        // 🆕 Create UI structure immediately so DOM elements exist for populateDropdowns calls
        setupUIStructure();

        fetchSchoolInfoAndCache().then(async () => {
            // setupUIStructure(); // Moved out of promise to ensure immediate availability
            populateDropdowns(); 
            
            // Dashboard is built but covered by the #ttInitOverlay
            await fetchSchedulingContext();
            
            // 🆕 Populate initial stream and teacher options now that context is loaded
            const gradeSelect = document.getElementById('ttGradeSelect');
            if (gradeSelect && gradeSelect.value) {
                updateStreamOptions(gradeSelect.value);
                updateScheduleSettingsForGrade(gradeSelect.value);
            }
            updateTeacherOptions();
            initTeacherDropdownPagination();
            loadTeacherDropdownData(1);
            attachEventListeners();
            
            // 🆕 Remove the global overlay gracefully once fully ready
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 400);
            
            isInitialized = true;
        }).catch(err => {
            console.error("Error during timetable initialization:", err);
            if (overlay) overlay.remove(); // Ensure overlay is removed even on error
        });
    }

    function setupUIStructure() {
        // 🆕 Inject modal error toast animations if not already present
        if (!document.getElementById('ttModalErrorStyles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'ttModalErrorStyles';
            styleEl.textContent = `
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes slideUp {
                    from {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                }
                /* 🆕 Added spinner definition for visual feedback in controls */
                .spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(0, 0, 0, 0.1);
                    border-top-color: #2b6cb0;
                    border-radius: 50%;
                    animation: tt-spin 0.8s linear infinite;
                    display: inline-block;
                    vertical-align: middle;
                }
                @keyframes tt-spin { to { transform: rotate(360deg); } }

                .tt-swap-selected {
                    outline: 3px solid #2563eb !important;
                    outline-offset: -3px;
                    z-index: 10;
                    background-color: #eff6ff !important;
                    position: relative;
                }

                /* 🆕 Thin scrollbar for sidebar */
                .tt-sidebar {
                    scrollbar-width: thin;
                    scrollbar-color: #cbd5e1 #f1f5f9;
                }
                .tt-sidebar::-webkit-scrollbar {
                    width: 6px;
                }
                .tt-sidebar::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                .tt-sidebar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                }

                    border-radius: 10px;

            `;
            
            document.head.appendChild(styleEl);
        }

        const container = document.getElementById('timetableTab');
        if (!container) return;

        container.style.position = 'relative'; // Required for absolute overlay

        container.innerHTML = `
            <div class="timetable-dashboard">
                <aside class="tt-sidebar">
                    <h4><i class="fas fa-cogs"></i> Timetable Controls</h4>
                    <div id="ttLastSync">Last synced: Loading...</div>
                    
                    <div class="filter-group">
                        <label>VIEW MODE</label>
                        <select id="ttViewMode" class="form-control">
                            <option value="class">Class Timetable</option>
                            <option value="teacher">Individual Teacher</option>
                            <option value="block">School Block Timetable</option>
                        </select>
                    </div>

                    <div class="filter-group">
                        <label>SELECT TERM</label>
                        <select id="ttTermSelect" class="form-control">
                            <option value="Term 1">Term 1</option>
                            <option value="Term 2">Term 2</option>
                            <option value="Term 3">Term 3</option>
                        </select>
                    </div>

                    <div id="ttClassFiltersGroup" class="tt-filter-group-section">
                        <div class="filter-group">
                            <label>SELECT GRADE</label>
                            <select id="ttGradeSelect" class="form-control"></select>
                        </div>

                        <div class="filter-group" id="ttStreamGroup" style="display: none;">
                            <label>SELECT STREAM</label>
                            <select id="ttStreamSelect" class="form-control"></select>
                        </div>

                        <div id="ttPathwayGroup" class="filter-group" style="display: none;">
                            <label>SELECT PATHWAY</label>
                            <select id="ttPathwaySelect" class="form-control">
                                <option value="STEM">STEM</option>
                                <option value="Social Sciences">Social Sciences</option>
                                <option value="Arts & Sports Science">Arts & Sports Science</option>
                            </select>
                        </div>
                    </div>

                    <div id="ttTeacherFiltersGroup" style="display:none;" class="tt-filter-group-section">
                        <div class="filter-group">
                            <label>SELECT TEACHER</label>
                            <select id="ttTeacherSelect" class="form-control"></select>
                        </div>
                    </div>

                    <div id="ttBlockInfoGroup" style="display:none;">
                        <strong>School block timetable:</strong> displays saved class schedules across the school in a class-style PDF layout, with each class showing lesson-by-lesson subject and teacher details.
                    </div>

                    <div class="filter-group">
                        <label>ACADEMIC YEAR</label>
                        <select id="ttYearSelect" class="form-control"></select>
                    </div>

                    <div class="tt-sidebar-actions">
                        <button id="configureFrequenciesBtn" class="btn secondary-btn tt-class-only">
                            <i class="fas fa-list-ol"></i> Lesson Frequencies
                        </button>
                        <button id="configureSettingsBtn" class="btn secondary-btn">
                            <i class="fas fa-clock"></i> Day Schedule
                        </button>
                        <button id="ttRefreshBtn" class="btn secondary-btn">
                            <i class="fas fa-sync-alt"></i> Refresh Filters
                        </button>
                        <button id="configurePlacementRulesBtn" class="btn secondary-btn tt-class-only">
                            <i class="fas fa-sliders-h"></i> Placement Rules
                        </button>
                        <button id="runHealthCheckBtn" class="btn secondary-btn tt-class-only">
                            <i class="fas fa-heartbeat"></i> Timetable Health Check
                        </button>
                        <!-- <button id="downloadPdfTimetableBtn" class="btn secondary-btn" style="width:100%; text-align:left;">
                            <i class="fas fa-file-pdf"></i> Download PDF Timetable
                        </button> -->

                        <hr>
                        <button id="generateTimetableBtn" class="btn primary-btn">
                            <i class="fas fa-magic"></i> <span id="ttBtnText">Generate Timetable</span>
                        </button>
                        <button id="backToAnalyticsBtn" class="btn secondary-btn" style="display:none;">
                            <i class="fas fa-arrow-left"></i> Back to Analytics
                        </button>
                    </div>
                </aside>

                <main class="tt-content">
                    <div id="ttWorkspace" class="dashboard-card">
                        <div id="ttPlaceholder">
                            <i class="far fa-calendar-alt"></i>
                            <h3>Ready to schedule?</h3>
                            <p>Select a grade and configure lesson counts to generate an optimized timetable.</p>
                        </div>
                        <div id="timetableOutput" style="display:none;"></div>
                    </div>
                </main>
            </div>

            <!-- Modal for Frequencies (Initially hidden by 'hidden' class) -->
            <div id="frequencyModal" class="modal hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; align-items:center; justify-content:center;">
                <div class="modal-content">
                    <h3 id="freqModalTitle"><i class="fas fa-list-ol"></i> Subject Frequencies</h3>
                    <p>Define how many lessons per week each subject should have.</p>
                    <div id="subjectFreqInputs"></div>
                    <div class="modal-footer">
                        <button id="cancelFrequencyBtn" class="btn secondary-btn">Cancel</button>
                        <button id="saveFrequenciesBtn" class="btn primary-btn" style="background:#2b6cb0; color:white;">Save Frequencies</button>
                    </div>
                </div>
            </div>

            <!-- Modal for Day Schedule (Initially hidden by 'hidden' class) -->
            <div id="dayScheduleModal" class="modal hidden">
                <div class="modal-content">
                    <h3>🕒 Day Schedule Configuration</h3>
                    <p>Configure school hours, lesson lengths, and intervals for standard CBE structure.</p>
                    
                    <div class="tt-form-grid">
                        <div><label>START TIME (HH:MM)</label><input type="time" id="setStartTime" class="form-control"></div>
                        <div><label>LESSON DURATION (MINS)</label><input type="number" id="setDuration" class="form-control" min="20" max="90"></div>
                        <div><label>LESSONS PER DAY</label><input type="number" id="setLessonsCount" class="form-control" min="1" max="12"></div>
                        <div><label>SCHOOL DAY END (HH:MM)</label><input type="time" id="setSchoolDayEnd" class="form-control"></div>
                    </div>

                    <h4>Breaks & Intervals</h4>
                    <div id="breaksContainer"></div>

                    <div class="modal-footer">
                        <button id="cancelScheduleBtn" class="btn secondary-btn">Cancel</button>
                        <button id="saveScheduleBtn" class="btn primary-btn" style="background:#2b6cb0; color:white;">Apply Schedule</button>
                    </div>
                </div>
            </div>

            <!-- Modal for Manual Slot Edit (Initially hidden by 'hidden' class) -->
            <div id="editSlotModal" class="modal hidden">
                <div class="modal-content">
                    <h3><i class="fas fa-edit"></i> Adjust Lesson Slot</h3>
                    <p id="editSlotDetails"></p>
                    
                    <div class="filter-group">
                        <label>CHANGE SUBJECT TO:</label>
                        <select id="editSlotSubjectSelect" class="form-control"></select>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <button id="cancelEditSlotBtn" class="btn secondary-btn" style="padding:10px;">Cancel</button>
                        <button id="saveSlotBtn" class="btn primary-btn" style="background:#334155; color:white; padding:10px; font-weight:700;">
                            <i class="fas fa-check-circle"></i> Update Slot
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal for Placement Rules Configuration (Initially hidden by 'hidden' class) -->
            <div id="placementRulesModal" class="modal hidden">
                <div class="modal-content">
                    <h3>⚙️ Placement Rules & Scheduling Preferences</h3>
                    <p>Configure how subjects are placed in the timetable to reflect your teaching preferences.</p>
                    
                    <div class="tt-modal-scroll-content">
                        <!-- Core Subjects -->
                        <div class="tt-rule-card tt-rule-core">
                            <label>
                                <input type="checkbox" id="coreSubs_enabled">
                                <span>Core Subjects (Math, English, Kiswahili)</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="coreSubs_beforeLunch">
                                    <span>Schedule before lesson 4 only</span>
                                </label>
                            </div>
                        </div>

                        <!-- Technical Subjects -->
                        <div class="tt-rule-card tt-rule-technical">
                            <label>
                                <input type="checkbox" id="technical_enabled">
                                <span>Technical Subjects</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="technical_preferMorning">
                                    <span>Prioritize Morning (1-4) for Core & Technical; avoid Mid-day (5-6) (pushes overflow to afternoon)</span>
                                </label>
                            </div>
                        </div>

                        <!-- PPI -->
                        <div class="tt-rule-card tt-rule-ppi">
                            <label>
                                <input type="checkbox" id="ppi_enabled">
                                <span>PPI</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="ppi_friday">
                                    <span>Schedule on Friday mornings only</span>
                                </label>
                            </div>
                        </div>

                        <!-- Creative Subjects -->
                        <div class="tt-rule-card tt-rule-creative">
                            <label>
                                <input type="checkbox" id="creative_enabled">
                                <span>Creative Subjects</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="creative_afternoon">
                                    <span>Schedule in afternoon only</span>
                                </label>
                            </div>
                        </div>

                        <!-- Sports & Arts -->
                        <div class="tt-rule-card tt-rule-sports">
                            <label>
                                <input type="checkbox" id="sports_enabled">
                                <span>Physical Education / Sports</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="sports_breaks">
                                    <span>Prioritize placement towards long breaks (Lesson 3-4)</span>
                                </label>
                            </div>
                        </div>

                        <div class="tt-rule-card tt-rule-visual-arts">
                            <label>
                                <input type="checkbox" id="visualArts_enabled">
                                <span>Visual Arts</span>
                            </label>
                            <div>
                                <label>
                                    <input type="checkbox" id="visualArts_breaks">
                                    <span>Prioritize placement towards long break (4) or lunch (6)</span>
                                </label>
                            </div>
                        </div>

                        <!-- Strict Mode -->
                        <div class="tt-rule-card tt-rule-strict-mode">
                            <label>
                                <input type="checkbox" id="strictFreq_enabled">
                                <span>Strict Frequency Enforcement</span>
                            </label>
                            <div>
                                If enabled, the system will automatically prompt for a full reshuffle if subject frequencies cannot be met by simply filling empty slots.
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button id="resetPlacementRulesBtn" class="btn secondary-btn" style="margin-right:10px;">Reset to Defaults</button>
                        <button id="cancelPlacementRulesBtn" class="btn secondary-btn">Cancel</button>
                        <button id="savePlacementRulesBtn" class="btn primary-btn" style="background:#2b6cb0; color:white;">Save Rules</button>
                    </div>
                </div>
            </div>
        `;
    }

    function populateDropdowns() {
        const gradeSelect = document.getElementById('ttGradeSelect');
        const yearSelect = document.getElementById('ttYearSelect');
        const termSelect = document.getElementById('ttTermSelect');
    
        if (gradeSelect) {
            // Clear existing options first
            gradeSelect.innerHTML = '';
            getGradeOptionsForSchool().forEach(g => {
                const opt = document.createElement('option');
                opt.value = g; opt.textContent = g;
                gradeSelect.appendChild(opt);
            });
        }
    
        if (yearSelect) {
            // Clear existing options first
            yearSelect.innerHTML = '';
            const currentYear = new Date().getFullYear();
            for (let y = currentYear - 2; y <= currentYear + 10; y++) { // Show a range of years
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                if (y === currentYear) opt.selected = true;
                yearSelect.appendChild(opt);
            }
        }

        if (termSelect) {
            const month = new Date().getMonth() + 1;
            if (month <= 4) termSelect.value = "Term 1";
            else if (month >= 5 && month <= 8) termSelect.value = "Term 2";
            else termSelect.value = "Term 3";
        }
    }

    /**
     * 🆕 Populates the stream dropdown based on actual database allocations
     */
    function updateStreamOptions(grade) {
        const streamSelect = document.getElementById('ttStreamSelect');
        const streamGroup = document.getElementById('ttStreamGroup');
        if (!streamSelect || !streamGroup) return; // 🆕 Safety guard

        const currentSelection = streamSelect?.value; // 🆕 Capture active selection before clearing

        const normGrade = window.cbcUtils?.normalizeGrade(grade).toLowerCase().trim();
        
        const streams = new Set();
        schoolAllocations.forEach(t => {
            (t.allocations || []).forEach(a => {
                const aGrade = window.cbcUtils?.normalizeGrade(a.grade).toLowerCase().trim();
                if (aGrade === normGrade && a.stream) streams.add(a.stream);
            });
        });

        const sortedStreams = Array.from(streams).sort();
        
        // 🆕 If multiple streams exist, add a prompt to make selection mandatory
        if (sortedStreams.length > 1) {
            streamSelect.innerHTML = '<option value="">-- Select Stream --</option>' + 
                sortedStreams.map(s => `<option value="${s}">Stream ${s}</option>`).join('');
        } else {
            streamSelect.innerHTML = sortedStreams.length > 0 
                ? sortedStreams.map(s => `<option value="${s}">Stream ${s}</option>`).join('')
                : '<option value="">No Stream</option>';
        }

        // 🆕 Restore previous selection if it's still a valid option in the new list
        if (currentSelection && Array.from(streamSelect.options).some(o => o.value === currentSelection)) {
            streamSelect.value = currentSelection;
        }

        streamGroup.style.display = sortedStreams.length > 0 ? 'block' : 'none';
    }

    /**
     * 🆕 Fetches paginated teacher list for the dropdown
     */
    async function loadTeacherDropdownData(page = 1, force = false) {
        const API_BASE = window.config.api.baseURL;
        const token = authService.getToken();
        
        const CACHE_KEY = "timetable_teachers_dropdown_cache";
        const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
        const queryKey = `p${page}`;

        if (!force) {
            try {
                const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
                const cached = store[queryKey];
                if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
                    console.log(`✅ Using cached teacher list for ${queryKey}`);
                    teacherListPage = cached.data.page || page;
                    teacherListTotalPages = cached.data.pages || 1;
                    updateTeacherDropdownUI(cached.data.users || []);
                    return;
                }
            } catch (e) { }
        } else {
            localStorage.removeItem(CACHE_KEY);
        }

        try {
            const res = await fetch(`${API_BASE}/users?role=teacher&page=${page}&limit=${TEACHER_LIMIT}&search=${encodeURIComponent(teacherSearchTerm)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
                throw new Error(errorData.message || `Failed to load teachers: ${res.status}`);
            }
            const data = await res.json();

            teacherListPage = data.page || page;
            teacherListTotalPages = data.pages || 1;

            // Update Cache (page-specific storage)
            try {
                const store = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
                store[queryKey] = { timestamp: Date.now(), data: data };
                localStorage.setItem(CACHE_KEY, JSON.stringify(store));
            } catch (e) { }

            updateTeacherDropdownUI(data.users || []);
        } catch (err) {
            window.cbcUtils.showToast(err.message || "Failed to load teacher list.", "error");
            console.error("Load teachers error:", err);
        }
    }

    /**
     * 🆕 Renders the teacher options into the select element
     */
    function updateTeacherDropdownUI(users) {
        const select = document.getElementById('ttTeacherSelect');
        if (!select) return;

        const group = document.getElementById('ttTeacherFiltersGroup');
        const spinner = group?.querySelector('.tt-teacher-spinner');
        if (spinner) spinner.style.display = 'none';

        select.innerHTML = '<option value="">-- Select Teacher --</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u._id;
            opt.textContent = u.name;
            select.appendChild(opt);
        });

        // Update pagination info
        const info = document.querySelector("#ttTeacherFiltersGroup .page-info");
        const prev = document.querySelector("#ttTeacherFiltersGroup .prev-btn");
        const next = document.querySelector("#ttTeacherFiltersGroup .next-btn");

        if (info) info.textContent = `Page ${teacherListPage} of ${teacherListTotalPages}`;
        if (prev) prev.disabled = teacherListPage <= 1;
        if (next) next.disabled = teacherListPage >= teacherListTotalPages;
    }

    /**
     * 🆕 Injects search and pagination controls for the teacher dropdown
     */
    function initTeacherDropdownPagination() {
        const group = document.getElementById('ttTeacherFiltersGroup');
        const select = document.getElementById('ttTeacherSelect');
        if (!group || !select) return;

        // Add spinner for visual feedback during pagination/search
        const spinner = document.createElement("div");
        spinner.className = "tt-teacher-spinner";
        spinner.style.cssText = "display:none; text-align:center; margin-bottom:8px;";
        spinner.innerHTML = '<div class="spinner-border spinner-border-sm text-primary" role="status"></div>';

        // Add search input
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "🔍 Search teachers...";
        searchInput.className = "form-control";
        searchInput.style.cssText = "margin-bottom: 8px; padding: 6px; font-size: 0.8rem; border-radius: 6px;";
        
        let debounceTimer;
        searchInput.addEventListener("input", (e) => {
            if (spinner) spinner.style.display = 'block';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                teacherSearchTerm = e.target.value.trim();
                loadTeacherDropdownData(1, true);
            }, 400);
        });

        // Add pagination controls
        const controls = document.createElement("div");
        controls.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-top: 5px;";
        controls.innerHTML = `
            <button type="button" class="btn secondary-btn prev-btn" style="padding: 2px 8px; font-size: 0.65rem;">&laquo; Prev</button>
            <span class="page-info" style="font-size: 0.65rem; color: #64748b; font-weight: 700;">Page 1</span>
            <button type="button" class="btn secondary-btn next-btn" style="padding: 2px 8px; font-size: 0.65rem;">Next &raquo;</button>
        `;

        select.parentNode.insertBefore(spinner, select);
        select.parentNode.insertBefore(searchInput, select);
        select.parentNode.appendChild(controls);

        controls.querySelector(".prev-btn").onclick = () => {
            if (spinner) spinner.style.display = 'block';
            if (teacherListPage > 1) loadTeacherDropdownData(teacherListPage - 1);
        };
        controls.querySelector(".next-btn").onclick = () => {
            if (spinner) spinner.style.display = 'block';
            if (teacherListPage < teacherListTotalPages) loadTeacherDropdownData(teacherListPage + 1);
        };
    }

    /**
     * Legacy wrapper to maintain compatibility with existing switch logic
     */
    function updateTeacherOptions() {
        // When view mode switches, reset search and load page 1
        teacherSearchTerm = "";
        const searchInput = document.querySelector("#ttTeacherFiltersGroup input");
        if (searchInput) searchInput.value = "";
        loadTeacherDropdownData(1, true);
    }

    async function fetchSchoolInfoAndCache() {
        try {
            const API_BASE = window.config.api.baseURL;
            const token = authService.getToken();
            const headers = { "Authorization": `Bearer ${token}` };

            // Attempt to load basic info from cache first for quick dropdown population
            let shouldFetchFromServer = true;
            const cachedInfoStr = localStorage.getItem(SCHOOL_INFO_CACHE_KEY);
            if (cachedInfoStr) {
                try {
                    const { timestamp, data: cachedData } = JSON.parse(cachedInfoStr);
                    // Ensure cached data has schoolType and is not expired
                    if (cachedData && cachedData.schoolType && (Date.now() - timestamp < CACHE_TTL)) {
                        schoolInfo = { ...cachedData, logo: null, logoMimeType: null }; // Set schoolInfo from cache
                        populateDropdowns(); // Populate with cached data
                        shouldFetchFromServer = false; // No need to fetch from server
                    } else {
                        localStorage.removeItem(SCHOOL_INFO_CACHE_KEY); // Stale or incomplete cache
                    }
                } catch (e) {
                    console.warn("Error parsing basic school info cache, clearing it.", e);
                    localStorage.removeItem(SCHOOL_INFO_CACHE_KEY);
                }
            }

            if (shouldFetchFromServer) {
                // Fetch school name and type (excluding logo as requested)
                // 🚀 Optimization: Request only name and schoolType.
                const schoolRes = await fetch(`${API_BASE}/users/my-school?includeLogo=false&fields=name,schoolType`, { headers });
                if (schoolRes.ok) {
                    const fullSchoolData = await schoolRes.json();
                    schoolInfo = fullSchoolData; // Store full data in module-level variable

                    // Create a lightweight version for localStorage caching (without the potentially large logo)
                    const basicSchoolInfoToCache = { name: fullSchoolData.name, schoolType: fullSchoolData.schoolType };
                    localStorage.setItem(SCHOOL_INFO_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: basicSchoolInfoToCache }));
                    
                    // Update global module settings based on detected school type
                    if (fullSchoolData.schoolType === 'primary_junior') {
                        settings.lessonsPerDay = 8;
                        settings.schoolDayEnd = "15:30";
                        if (!settings.breaks.some(b => b.name === "WRAP UP")) {
                            settings.breaks.push({ name: "WRAP UP", afterLesson: 8, duration: 5 });
                        }
                    } else {
                        settings.lessonsPerDay = 9;
                    }

                    populateDropdowns(); // Re-populate dropdowns with fresh info (using the now updated schoolInfo)
                } else {
                    // Fallback if server fetch fails
                    console.warn("Failed to fetch school info from server, falling back to default 'full' school type.");
                    schoolInfo = { schoolType: 'full' };
                    populateDropdowns();
                }
            }
        } catch (err) {
            console.error("Failed to fetch school info for timetable module:", err);
            // Fallback to default grade options if school info can't be fetched
            schoolInfo = { schoolType: 'full' };
            populateDropdowns();
        }
    }

    /**
     * Refresh the timetable dashboard only (without reloading the entire page)
     */
    async function refreshTimetableDashboard() {
        const btn = document.getElementById('ttRefreshBtn');
        const originalHTML = btn ? btn.innerHTML : null;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner" style="width:12px; height:12px; border-width:2px; margin-right:5px;"></span> Refreshing...`;
        }

        try {
            // Clear the current timetable output
            document.getElementById('timetableOutput').style.display = 'none';
            document.getElementById('timetableOutput').innerHTML = '';
            
            // Show the placeholder
            document.getElementById('ttPlaceholder').style.display = 'block';
            
            // Reset the main data variable
            currentTimetableData = null;
            
            // Refresh dropdown data
            await fetchSchoolInfoAndCache();
            await fetchSchedulingContext(true);
            
            // Reset view mode to default
            const viewModeSelect = document.getElementById('ttViewMode');
            if (viewModeSelect) {
                viewModeSelect.value = 'class';
                document.getElementById('ttClassFiltersGroup').style.display = 'block';
                document.getElementById('ttTeacherFiltersGroup').style.display = 'none';
                document.getElementById('ttBtnText').textContent = 'Generate Timetable';
            }
            
            // Reset grade and stream selections
            const gradeSelect = document.getElementById('ttGradeSelect');
            const streamSelect = document.getElementById('ttStreamSelect');
            if (gradeSelect) gradeSelect.value = gradeSelect.options[0]?.value || '';
            if (streamSelect) streamSelect.value = '';
            if (gradeSelect && gradeSelect.value) updateScheduleSettingsForGrade(gradeSelect.value);
            
            cbcUtils.showToast("Timetable dashboard refreshed.", "success");
        } catch (err) {
            console.error("Error refreshing timetable dashboard:", err);
            cbcUtils.showToast("Error refreshing dashboard. Try again.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    }

    function attachEventListeners() {
        // Utility to safely attach listeners
        const listen = (id, evt, fn, useCapture = false) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(evt, fn, useCapture);
        };

        listen('generateTimetableBtn', 'click', () => generateTimetable());

        const ttViewMode = document.getElementById('ttViewMode');
        if (ttViewMode) {
            ttViewMode.addEventListener('change', async (e) => {
            // 🆕 Optimization: Refresh scheduling context (allocations & saved TTs) 
            // when switching views to ensure data is current.
            await fetchSchedulingContext();

            const mode = e.target.value;
            const isTeacherMode = mode === 'teacher';
            const isBlockMode = mode === 'block';

            selectedSwapSlot = null; // 🆕 Reset swap selection when mode changes

            document.getElementById('ttClassFiltersGroup').style.display = (isTeacherMode || isBlockMode) ? 'none' : 'block';
            document.getElementById('ttTeacherFiltersGroup').style.display = isTeacherMode ? 'block' : 'none';
            document.getElementById('ttBlockInfoGroup').style.display = isBlockMode ? 'block' : 'none';
            document.getElementById('ttBtnText').textContent = isTeacherMode ? 'View Teacher Schedule' : (isBlockMode ? 'View Block Timetable' : 'Generate Timetable');

            // Hide class-only controls for teacher/block views
            document.querySelectorAll('.tt-class-only').forEach(el => {
                el.style.display = (isTeacherMode || isBlockMode) ? 'none' : 'block';
            });

            if (isTeacherMode) updateTeacherOptions();
            
            // Reset view
            document.getElementById('ttPlaceholder').style.display = 'block';
            document.getElementById('timetableOutput').style.display = 'none';
            currentTimetableData = null;
            });
        } else {
            console.warn("Timetable Module: ttViewMode not found.");
        }

        const timetableOutput = document.getElementById('timetableOutput');
        if (timetableOutput) { // Use event delegation for dynamically added buttons
            timetableOutput.addEventListener('click', (e) => { // Use event delegation for dynamically added buttons
            const saveBtn = e.target.closest('#saveTimetableToPortalBtn');
            if (saveBtn) saveTimetableToPortal(); // Handles button inside the generated grid

            const downloadPdfBtn = e.target.closest('#downloadTimetablePDFBtn');
            if (downloadPdfBtn) downloadTimetablePDF(); // Handles button inside the generated grid

            const reshuffleActivitiesBtn = e.target.closest('#reshuffleActivitiesBtn');
            if (reshuffleActivitiesBtn) {
                selectedSwapSlot = null;
                reshuffleSharedActivities();
                if (currentTimetableData) {
                    renderGrid(currentTimetableData.grade, currentTimetableData.stream, false);
                }
                cbcUtils.showToast('Activities order reshuffled across grades.', 'success');
                return;
            }
            
            const autoFixBtn = e.target.closest('#autoFixClashesBtn');
            if (autoFixBtn) {
                const originalHTML = autoFixBtn.innerHTML;
                autoFixBtn.disabled = true; // Prevent double-click
                autoFixBtn.innerHTML = '<span class="spinner"></span> Fixing...';
                selectedSwapSlot = null;
                
                // Await the process and reset the button if the grid wasn't re-rendered
                autoFixClashes().finally(() => {
                    const currentBtn = document.getElementById('autoFixClashesBtn');
                    // If the button still exists and is still spinning, restore it
                    if (currentBtn && currentBtn.innerHTML.includes('spinner')) {
                        currentBtn.disabled = false;
                        currentBtn.innerHTML = originalHTML;
                    }
                });
            }

            // 🆕 Manual Slot Edit / Swap Trigger
            const slot = e.target.closest('.tt-editable-slot');
            if (slot) {
                if (!currentTimetableData || !currentTimetableData.grid) return;

                const day = parseInt(slot.dataset.day);
                const lesson = parseInt(slot.dataset.lesson);

                if (selectedSwapSlot === null) {
                    // First click: select for swap
                    selectedSwapSlot = { day, lesson, element: slot };
                    slot.classList.add('tt-swap-selected');
                } else if (selectedSwapSlot.day === day && selectedSwapSlot.lesson === lesson) {
                    // Clicked same slot: Open Edit Modal and deselect
                    selectedSwapSlot.element.classList.remove('tt-swap-selected');
                    selectedSwapSlot = null;
                    openEditSlotModal(day, lesson);
                } else {
                    // Second click on different slot: perform swap
                    const { grid, grade, stream } = currentTimetableData;
                    const days = ["MON", "TUE", "WED", "THU", "FRI"];

                    const dayA = selectedSwapSlot.day;
                    const lessonA = selectedSwapSlot.lesson;
                    const subA = grid[lessonA][dayA];

                    const dayB = day;
                    const lessonB = lesson;
                    const subB = grid[lessonB][dayB];

                    // 🆕 Validation: Prevent swap if it causes subject duplicates in the same day (intra-day duplication)
                    const freqs = currentTimetableData.lessonFrequencies;
                    const gradeMatch = (grade || "").match(/\d+/);
                    const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
                    const isPrimary = gradeNum >= 1 && gradeNum <= 6;

                    if (dayA !== dayB) {
                        if (subA && (freqs[subA] || 0) <= 5 && grid.some((row, lIdx) => lIdx !== lessonB && row[dayB] === subA)) {
                            cbcUtils.showToast(`Swap blocked: ${subA} already appears on ${days[dayB]}. Standard subjects should only appear once daily.`, "error");
                            return;
                        }
                        if (subB && (freqs[subB] || 0) <= 5 && grid.some((row, lIdx) => lIdx !== lessonA && row[dayA] === subB)) {
                            cbcUtils.showToast(`Swap blocked: ${subB} already appears on ${days[dayA]}. Standard subjects should only appear once daily.`, "error");
                            return;
                        }
                    }

                    // 🆕 Validation: Prevent consecutive identical subjects in Primary schools
                    if (isPrimary) {
                        const checkConsecutive = (sub, l, d, otherSub, otherL, otherD) => {
                            if (!sub) return false;
                            const prev = (l > 0) ? (l - 1 === otherL && d === otherD ? otherSub : grid[l - 1][d]) : null;
                            const next = (l < grid.length - 1) ? (l + 1 === otherL && d === otherD ? otherSub : grid[l + 1][d]) : null;
                            return sub === prev || sub === next;
                        };
                        if (checkConsecutive(subA, lessonB, dayB, subB, lessonA, dayA) || checkConsecutive(subB, lessonA, dayA, subA, lessonB, dayB)) {
                            cbcUtils.showToast("Action blocked: Consecutive identical subjects are not allowed in Primary schools.", "error");
                            return;
                        }
                    }

                    // 🆕 Validation: Prevent swap if it causes teacher clashes in other classes
                    const teacherA = getTeacherForSubject(grade, stream, subA);
                    if (teacherA && isTeacherBusy(teacherA.id, dayB, lessonB, grade, stream)) {
                        cbcUtils.showToast(`Swap blocked: ${teacherA.name} is already teaching on ${days[dayB]} Lesson ${lessonB + 1}.`, "error");
                        return;
                    }

                    const teacherB = getTeacherForSubject(grade, stream, subB);
                    if (teacherB && isTeacherBusy(teacherB.id, dayA, lessonA, grade, stream)) {
                        cbcUtils.showToast(`Swap blocked: ${teacherB.name} is already teaching on ${days[dayA]} Lesson ${lessonA + 1}.`, "error");
                        return;
                    }

                    // Perform swap
                    grid[lessonA][dayA] = subB;
                    grid[lessonB][dayB] = subA;
                    
                    selectedSwapSlot.element.classList.remove('tt-swap-selected');
                    selectedSwapSlot = null;
                    
                    renderGrid(grade, stream, false);
                    cbcUtils.showToast("Lessons swapped successfully.", "success");
                }
                return;
            }

            // 🆕 Reset Specific Day Trigger
            const resetBtn = e.target.closest('.tt-reset-day-btn');
            if (resetBtn) {
                selectedSwapSlot = null;
                resetDay(parseInt(resetBtn.dataset.day));
            }
        });
        } else {
            console.warn("Timetable Module: timetableOutput container not found.");
        }

        // Sidebar Config Buttons
        listen('runHealthCheckBtn', 'click', () => runHealthCheck());
        listen('configureSettingsBtn', 'click', () => openDayScheduleModal());

        document.getElementById('saveSlotBtn')?.addEventListener('click', () => saveSlotEdit());
        document.getElementById('cancelEditSlotBtn')?.addEventListener('click', () => {
            document.getElementById('editSlotModal').style.display = 'none';
        });

        const ttGradeSelect = document.getElementById('ttGradeSelect');
        if (ttGradeSelect) {
            ttGradeSelect.addEventListener('change', (e) => {
            const grade = e.target.value;
            const pathwayGroup = document.getElementById('ttPathwayGroup'); 
            if (grade && window.cbcUtils && window.cbcUtils.isSeniorGrade(grade)) {
                pathwayGroup.style.display = 'block';
            } else {
                pathwayGroup.style.display = 'none';
            }

            // 🆕 Refresh streams when grade changes if allocations are loaded
            if (schoolAllocations.length > 0) {
                updateStreamOptions(grade);
            }

            // 🆕 Initialize frequencies for the grade
            const streamVal = document.getElementById('ttStreamSelect')?.value || "";
            const pathwayRawVal = document.getElementById('ttPathwaySelect')?.value || "";
            const pathwayVal = window.cbcUtils?.normalizePathway?.(pathwayRawVal) || (String(pathwayRawVal || "").trim());
            ensureFrequenciesInitialized(
                grade,
                streamVal,
                pathwayVal
            );

            // 🆕 Populate schedule defaults based on grade level
            updateScheduleSettingsForGrade(grade);
        });

        const ttPathwaySelect = document.getElementById('ttPathwaySelect');
        if (ttPathwaySelect) {
            ttPathwaySelect.addEventListener('change', () => {
                const grade = document.getElementById('ttGradeSelect')?.value;
                const stream = document.getElementById('ttStreamSelect')?.value || "";
                if (grade && window.cbcUtils?.isSeniorGrade(grade)) {
                    const pathwayVal = window.cbcUtils?.normalizePathway?.(ttPathwaySelect.value || "") || (String(ttPathwaySelect.value || "").trim());
                    ensureFrequenciesInitialized(grade, stream, pathwayVal);
                    if (currentTimetableData?.grid) {
                        renderGrid(grade, stream, false, pathwayVal);
                    }
                }
            });
        }
        }
        
        const configureFrequenciesBtn = document.getElementById('configureFrequenciesBtn');
        if (configureFrequenciesBtn) {
            configureFrequenciesBtn.addEventListener('click', async () => {
            const grade = document.getElementById('ttGradeSelect')?.value;
            if (!grade) return cbcUtils.showToast("Please select a grade first.", "error");
            
            // 🆕 Mandatory stream validation
            const stream = document.getElementById('ttStreamSelect')?.value || "";
            const streamGroup = document.getElementById('ttStreamGroup');
            if (streamGroup && streamGroup.style.display === 'block' && !stream) {
                return cbcUtils.showToast("Please select a specific stream first.", "error");
            }

            const btn = document.getElementById('configureFrequenciesBtn');
            btn.disabled = true;
            await fetchSchedulingContext(); // 🆕 Refresh allocations to get current subjects
            btn.disabled = false;
            
            openFrequencyModal(grade);
            });
        }

        listen('ttRefreshBtn', 'click', () => refreshTimetableDashboard());

        const saveFrequenciesBtn = document.getElementById('saveFrequenciesBtn');
        if (saveFrequenciesBtn) {
            saveFrequenciesBtn.addEventListener('click', () => {
                saveCurrentFrequencies();
                document.getElementById('frequencyModal').classList.remove('visible');
                document.getElementById('frequencyModal').classList.add('hidden');
                cbcUtils.showToast("Frequencies updated locally.", "success");
            });

            document.getElementById('cancelFrequencyBtn')?.addEventListener('click', () => {
                document.getElementById('frequencyModal').classList.remove('visible');
                document.getElementById('frequencyModal').classList.add('hidden');
        });
        }

        listen('saveScheduleBtn', 'click', () => {
            if (saveDayScheduleSettings()) {
                document.getElementById('dayScheduleModal').classList.remove('visible');
                document.getElementById('dayScheduleModal').classList.add('hidden');
                cbcUtils.showToast("Day schedule updated.", "success");
            }
        });

        listen('cancelScheduleBtn', 'click', () => {
            document.getElementById('dayScheduleModal').classList.remove('visible');
            document.getElementById('dayScheduleModal').classList.add('hidden');
        });

        listen('configurePlacementRulesBtn', 'click', () => openPlacementRulesModal());

        listen('savePlacementRulesBtn', 'click', () => {
            savePlacementRules(); // Save rules to localStorage
            // document.getElementById('placementRulesModal').style.display = 'none'; // Removed: Redundant with class-based display
            document.getElementById('placementRulesModal').classList.remove('visible');
            document.getElementById('placementRulesModal').classList.add('hidden');
            cbcUtils.showToast("Placement rules updated.", "success");
        });

        listen('cancelPlacementRulesBtn', 'click', () => {
            document.getElementById('placementRulesModal').classList.remove('visible');
            document.getElementById('placementRulesModal').classList.add('hidden');
        });

        listen('resetPlacementRulesBtn', 'click', () => {
            resetPlacementRulesToDefaults();
            openPlacementRulesModal(); // Refresh the modal to show reset values
        });
    }

    // 🆕 Add event listener for "Back to Analytics" button
    const backBtn = document.getElementById('backToAnalyticsBtn');
    if (backBtn) {
        if (document.body.classList.contains('standalone-view')) {
            backBtn.style.display = 'block'; // Make it visible
            backBtn.addEventListener('click', () => {
                window.close(); // Close the current standalone window
            });
        }
    }

    /**
     * 🆕 Fetch all school-wide data required for clash detection
     */
    async function fetchSchedulingContext(forceRefresh = false) {
        try {
            const API_BASE = window.config.api.baseURL;
            const token = authService.getToken(); // Use authService for consistency
            if (!token) return authService.redirectToLogin();
            const headers = { "Authorization": `Bearer ${token}` };

            // 1. Fetch all subject allocations for the school with caching
            let shouldFetchAllocations = true;
            if (!forceRefresh) {
                const cached = localStorage.getItem(ALLOCATIONS_CACHE_KEY);
                if (cached) {
                    try {
                        const { timestamp, data } = JSON.parse(cached);
                        if (Date.now() - timestamp < CACHE_TTL) {
                            schoolAllocations = data;
                            console.log(`📡 Loaded ${schoolAllocations.length} teacher allocations from cache.`);
                            shouldFetchAllocations = false;
                        }
                    } catch (e) {
                        localStorage.removeItem(ALLOCATIONS_CACHE_KEY);
                    }
                }
            }

            if (shouldFetchAllocations) {
                const allocRes = await fetch(`${API_BASE}/users/subjects/allocations?limit=1000`, { headers });
                if (allocRes.ok) {
                    const allocData = await allocRes.json();
                    schoolAllocations = Array.isArray(allocData) ? allocData : allocData.data || [];
                    localStorage.setItem(ALLOCATIONS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: schoolAllocations }));
                    console.log(`📡 Fetched ${schoolAllocations.length} teacher allocations from server.`);
                }
            }

            // 🆕 Always refresh stream and teacher options as they depend on the allocations
            const currentGrade = document.getElementById('ttGradeSelect')?.value;
            if (currentGrade) {
                updateStreamOptions(currentGrade);
            }
            updateTeacherOptions();

            // 2. Fetch all currently saved timetables for this academic year
            const yearEl = document.getElementById('ttYearSelect');
            const year = yearEl ? yearEl.value : new Date().getFullYear();
            const termEl = document.getElementById('ttTermSelect');
            const term = termEl ? termEl.value : "Term 1";

            const ttCacheKey = `${SAVED_TIMETABLES_CACHE_KEY}_${year}_${term}`;
            let shouldFetchTimetables = true;

            if (!forceRefresh) {
                const cachedTT = localStorage.getItem(ttCacheKey);
                if (cachedTT) {
                    try {
                        const { timestamp, data } = JSON.parse(cachedTT);
                        if (Date.now() - timestamp < TIMETABLES_CACHE_TTL) {
                            allSavedTimetables = data;
                            console.log(`📡 Loaded ${allSavedTimetables.length} saved timetables from cache for ${term} ${year}.`);
                            shouldFetchTimetables = false;
                        }
                    } catch (e) {
                        localStorage.removeItem(ttCacheKey);
                    }
                }
            }

            if (shouldFetchTimetables) {
                // 🆕 Use both 'year' and 'academicYear' to ensure compatibility with backend controllers
                const ttRes = await fetch(`${API_BASE}/timetables/all?academicYear=${year}&year=${year}&term=${term}`, { headers });
                if (ttRes.ok) {
                    const ttData = await ttRes.json();
                    allSavedTimetables = Array.isArray(ttData) ? ttData : (ttData.timetables || ttData.data || []);
                    localStorage.setItem(ttCacheKey, JSON.stringify({ timestamp: Date.now(), data: allSavedTimetables }));
                    console.log(`📡 Fetched ${allSavedTimetables.length} saved class timetables from server.`);
                }
            }
        } catch (err) {
            console.error("Failed to fetch scheduling context:", err);
        } finally {
            // 🆕 Update Sync Timestamp in UI
            const syncEl = document.getElementById('ttLastSync');
            if (syncEl) {
                syncEl.textContent = `Last synced: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            }
        }
    }

    /**
     * 🆕 Extracts unique subjects allocated to a grade from the backend data
     */
    function getAllocatedSubjectsForGrade(grade, stream = "", pathway = "") {
        const subjects = new Set();
        const normalizedTarget = (window.cbcUtils?.normalizeGrade(grade) || grade).toLowerCase().trim();
        const streamTarget = (stream || "").toLowerCase().trim();
        const selectedPathway = window.cbcUtils?.normalizePathway?.(pathway) || (String(pathway || "").trim());
        const isSenior = window.cbcUtils?.isSeniorGrade(grade);

        schoolAllocations.forEach(teacher => {
            (teacher.allocations || []).forEach(alloc => {
                const allocGrade = (window.cbcUtils?.normalizeGrade(alloc.grade) || alloc.grade).toLowerCase().trim();
                const allocStream = (alloc.stream || "").toLowerCase().trim();

                if (allocGrade !== normalizedTarget || allocStream !== streamTarget) {
                    return;
                }

                (alloc.subjects || []).forEach(sub => {
                    const normalizedSubject = window.SUBJECT_DATA?.normalizeSeniorSubjectName?.(sub) || sub;
                    if (!normalizedSubject) {
                        return;
                    }

                    if (!isSenior) {
                        subjects.add(normalizedSubject);
                        return;
                    }

                    if (!selectedPathway) {
                        subjects.add(normalizedSubject);
                        return;
                    }

                    const pathwayForSubject = window.SUBJECT_DATA?.getSeniorPathway?.(normalizedSubject) || "";
                    const pathwayForSubjectNorm = window.cbcUtils?.normalizePathway?.(pathwayForSubject) || String(pathwayForSubject || "").trim();
                    if (pathwayForSubjectNorm === "Core" || pathwayForSubjectNorm === selectedPathway) {
                        subjects.add(normalizedSubject);
                    }
                });
            });
        });

        if (grade) {
            subjects.add("PPI");
        }

        return Array.from(subjects).sort();
    }

    function openFrequencyModal(grade) {
        const modal = document.getElementById('frequencyModal');
        const container = document.getElementById('subjectFreqInputs');
        document.getElementById('freqModalTitle').textContent = `Frequencies for ${grade}`;
        
        const stream = document.getElementById('ttStreamSelect')?.value || "";
        const rawPathway = window.cbcUtils?.isSeniorGrade(grade) ? document.getElementById('ttPathwaySelect')?.value || "" : "";
        const pathway = window.cbcUtils?.normalizePathway?.(rawPathway) || (String(rawPathway || "").trim());

        const subjects = getAllocatedSubjectsForGrade(grade, stream, pathway);

        if (subjects.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:20px; color:#ef4444; font-weight:700;">
                    ⚠️ NO SUBJECTS ALLOCATED<br>
                    <small style="font-weight:400; color:#64748b;">Please assign subjects to teachers for ${grade} in the Admin Panel first.</small>
                </div>`;
            modal.style.display = 'flex';
            return;
        }

        const currentFreqs = lessonFrequencies[grade] || {};
        const currentPlacements = subjectPlacements[grade] || {};

        container.innerHTML = subjects.map(sub => {
            const pref = currentPlacements[sub] || 'any';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9; gap:10px;">
                <span style="font-weight:600; color:#475569; flex:1;">${sub}</span>
                <select data-subject="${sub}" class="placement-input" style="width:110px; padding:5px; border:1px solid #cbd5e0; border-radius:4px; font-size:0.75rem;">
                    <option value="any">Anytime</option>
                    <option value="before4" ${pref === 'before4' ? 'selected' : ''}>Before L4</option>
                    <option value="before6" ${pref === 'before6' ? 'selected' : ''}>Before L6</option>
                    <option value="after6" ${pref === 'after6' ? 'selected' : ''}>After L6</option>
                </select>
                <input type="number" data-subject="${sub}" class="freq-input" value="${currentFreqs[sub] !== undefined ? currentFreqs[sub] : getDefaultFrequency(sub, grade)}" min="0" max="15" 
                       style="width:60px; padding:5px; border:1px solid #cbd5e0; border-radius:4px; text-align:center;">
            </div>`;
        }).join('');

        modal.classList.remove('hidden');
        modal.classList.add('visible');
    }

    function saveCurrentFrequencies() {
        const grade = document.getElementById('ttGradeSelect').value;
        const inputs = document.querySelectorAll('.freq-input');
        // 🆕 Ensure subjectPlacements[grade] is initialized before accessing
        const placementInputs = document.querySelectorAll('.placement-input');
        
        if (!lessonFrequencies[grade]) lessonFrequencies[grade] = {};
        if (!subjectPlacements[grade]) subjectPlacements[grade] = {};
        
        inputs.forEach(input => {
            lessonFrequencies[grade][input.dataset.subject] = parseInt(input.value);
        });

        placementInputs.forEach(input => {
            subjectPlacements[grade][input.dataset.subject] = input.value;
        });
    }

    function openDayScheduleModal() {
        const modal = document.getElementById('dayScheduleModal');
        document.getElementById('setStartTime').value = settings.startTime;
        document.getElementById('setDuration').value = settings.lessonDuration;
        document.getElementById('setLessonsCount').value = settings.lessonsPerDay;
        document.getElementById('setSchoolDayEnd').value = settings.schoolDayEnd;

        const container = document.getElementById('breaksContainer');
        container.innerHTML = settings.breaks.map((b, idx) => `
            <div class="break-row" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; background:#f8fafc; padding:10px; border-radius:8px;">
                <input type="text" value="${b.name}" data-idx="${idx}" class="break-name" placeholder="Break Name" style="flex:2; padding:5px;">
                <div style="flex:1;">
                    <small style="display:block; font-size:0.6rem;">DURATION</small>
                    <input type="number" value="${b.duration}" data-idx="${idx}" class="break-dur" style="width:100%; padding:5px;">
                </div>
                <div style="flex:1;">
                    <small style="display:block; font-size:0.6rem;">AFTER LESSON</small>
                    <input type="number" value="${b.afterLesson}" data-idx="${idx}" class="break-after" style="width:100%; padding:5px;">
                </div>
            </div>
        `).join('');

        modal.classList.remove('hidden');
        modal.classList.add('visible');
    }

    /**
     * 🆕 Open the Placement Rules configuration modal
     */
    function openPlacementRulesModal() {
        const modal = document.getElementById('placementRulesModal');
        
        // Load current settings into form
        document.getElementById('coreSubs_enabled').checked = placementRules.coreSubjectsPreference.enabled;
        document.getElementById('coreSubs_beforeLunch').checked = placementRules.coreSubjectsPreference.beforeLesson4Only;
        document.getElementById('coreSubs_beforeLunch').disabled = !placementRules.coreSubjectsPreference.enabled;

        // Strict Mode
        const strictEl = document.getElementById('strictFreq_enabled');
        if (strictEl) strictEl.checked = placementRules.strictFrequencyMode?.enabled || false;

        document.getElementById('technical_enabled').checked = placementRules.technicalSubjectsPreference.enabled;
        document.getElementById('technical_preferMorning').checked = placementRules.technicalSubjectsPreference.preferMorning;
        document.getElementById('technical_preferMorning').disabled = !placementRules.technicalSubjectsPreference.enabled;

        document.getElementById('ppi_enabled').checked = placementRules.ppiPreference.enabled;
        document.getElementById('ppi_friday').checked = placementRules.ppiPreference.fridayMorningOnly;
        document.getElementById('ppi_friday').disabled = !placementRules.ppiPreference.enabled;

        document.getElementById('creative_enabled').checked = placementRules.creativePreference.enabled;
        document.getElementById('creative_afternoon').checked = placementRules.creativePreference.afternoonOnly;
        document.getElementById('creative_afternoon').disabled = !placementRules.creativePreference.enabled;

        document.getElementById('sports_enabled').checked = placementRules.sportsPreference.enabled;
        document.getElementById('sports_breaks').checked = placementRules.sportsPreference.preferBreaks;
        document.getElementById('sports_breaks').disabled = !placementRules.sportsPreference.enabled;

        document.getElementById('visualArts_enabled').checked = placementRules.visualArtsPreference.enabled;
        document.getElementById('visualArts_breaks').checked = placementRules.visualArtsPreference.preferBreaks;
        document.getElementById('visualArts_breaks').disabled = !placementRules.visualArtsPreference.enabled;

        // Add event listeners to enable/disable dependent checkboxes
        const attachToggle = (parentId, dependentIds) => {
            document.getElementById(parentId)?.addEventListener('change', (e) => {
                dependentIds.forEach(id => {
                    const elem = document.getElementById(id);
                    if (elem) elem.disabled = !e.target.checked;
                });
            });
        };

        // 🆕 Corrected to use the actual IDs for core subjects
        attachToggle('coreSubs_enabled', ['coreSubs_beforeLunch']); 
        attachToggle('technical_enabled', ['technical_preferMorning']);
        attachToggle('ppi_enabled', ['ppi_friday']);
        attachToggle('creative_enabled', ['creative_afternoon']);
        attachToggle('sports_enabled', ['sports_breaks']);
        attachToggle('visualArts_enabled', ['visualArts_breaks']);

            // modal.style.display = 'flex'; // Removed: Redundant with class-based display
        modal.classList.remove('hidden');
        modal.classList.add('visible');
    }

    /**
     * 🆕 Save Placement Rules from modal
     */
    function savePlacementRules() {
        placementRules.coreSubjectsPreference.enabled = document.getElementById('coreSubs_enabled').checked;
        placementRules.coreSubjectsPreference.beforeLesson4Only = document.getElementById('coreSubs_beforeLunch').checked;

        placementRules.strictFrequencyMode.enabled = document.getElementById('strictFreq_enabled')?.checked || false;

        placementRules.technicalSubjectsPreference.enabled = document.getElementById('technical_enabled').checked;
        placementRules.technicalSubjectsPreference.preferMorning = document.getElementById('technical_preferMorning').checked;
        placementRules.technicalSubjectsPreference.allowAfternoon = !document.getElementById('technical_preferMorning').checked;

        placementRules.ppiPreference.enabled = document.getElementById('ppi_enabled').checked;
        placementRules.ppiPreference.fridayMorningOnly = document.getElementById('ppi_friday').checked;

        placementRules.creativePreference.enabled = document.getElementById('creative_enabled').checked;
        placementRules.creativePreference.afternoonOnly = document.getElementById('creative_afternoon').checked;

        placementRules.sportsPreference.enabled = document.getElementById('sports_enabled').checked;
        placementRules.sportsPreference.preferBreaks = document.getElementById('sports_breaks').checked;

        placementRules.visualArtsPreference.enabled = document.getElementById('visualArts_enabled').checked;
        placementRules.visualArtsPreference.preferBreaks = document.getElementById('visualArts_breaks').checked;

        // Save to localStorage for persistence
        localStorage.setItem('timetable_placement_rules', JSON.stringify(placementRules));
    }

    /**
     * 🆕 Reset Placement Rules to defaults
     */
    function resetPlacementRulesToDefaults() {
        placementRules = {
            coreSubjectsPreference: {
                enabled: true,
                beforeLesson4Only: true,
                subjects: ["Mathematics", "English", "Kiswahili"]
            },
            technicalSubjectsPreference: {
                enabled: true,
                preferMorning: true,
                allowAfternoon: false
            },
            ppiPreference: {
                enabled: true,
                fridayMorningOnly: true
            },
            creativePreference: {
                enabled: true,
                afternoonOnly: true
            },
            sportsPreference: {
                enabled: true,
                preferBreaks: true
            },
            visualArtsPreference: {
                enabled: true,
                preferBreaks: true
            },
            doubleLessons: {
                enabled: true,
                subjects: ["Integrated Science", "Agriculture", "Pre-Technical Studies", "Performing Arts C/A(p)"]
            },
            strictFrequencyMode: {
                enabled: false
            }
        };
        localStorage.removeItem('timetable_placement_rules');
        cbcUtils.showToast("Placement rules reset to defaults.", "success");
    }

    /**
     * 🆕 Load Placement Rules from localStorage if available
     */
    function loadPlacementRules() {
        const saved = localStorage.getItem('timetable_placement_rules');
        if (saved) {
            try {
                placementRules = JSON.parse(saved);
            } catch (e) {
                console.warn("Could not parse saved placement rules, using defaults.", e);
            }
        }
    }
    function showModalError(message) {
        let modalErrorContainer = document.getElementById("modalErrorContainer");
        if (!modalErrorContainer) {
            modalErrorContainer = document.createElement("div");
            modalErrorContainer.id = "modalErrorContainer";
            modalErrorContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 100000;
                max-width: 400px;
                pointer-events: auto;
            `;
            document.body.appendChild(modalErrorContainer);
        }

        const errorToast = document.createElement("div");
        errorToast.style.cssText = `
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
            font-weight: 500;
            animation: slideDown 0.3s ease-out;
        `;
        errorToast.textContent = message;
        modalErrorContainer.appendChild(errorToast);

        setTimeout(() => {
            errorToast.style.animation = "slideUp 0.3s ease-out";
            setTimeout(() => errorToast.remove(), 300);
        }, 3500);
    }

    function saveDayScheduleSettings() {
        const startTime = document.getElementById('setStartTime').value;
        const lessonDuration = parseInt(document.getElementById('setDuration').value);
        const lessonsPerDay = parseInt(document.getElementById('setLessonsCount').value);
        const newSchoolDayEnd = document.getElementById('setSchoolDayEnd').value;

        const breakRows = document.querySelectorAll('.break-row');
        const newBreaks = [];
        breakRows.forEach(row => {
            newBreaks.push({
                name: row.querySelector('.break-name').value.toUpperCase(),
                duration: parseInt(row.querySelector('.break-dur').value) || 0,
                afterLesson: parseInt(row.querySelector('.break-after').value) || 0
            });
        });

        // 🆕 Perform validation
        const calculatedEndTime = calculateScheduledEndTime(
            startTime,
            lessonsPerDay,
            lessonDuration,
            newBreaks
        );

        if (timeToMinutes(calculatedEndTime) > timeToMinutes(newSchoolDayEnd)) {
            showModalError(`Scheduled end time (${calculatedEndTime}) exceeds school day end (${newSchoolDayEnd}). Please adjust.`);
            return false; // Prevent saving invalid settings
        }

        // If valid, update settings
        settings.startTime = startTime;
        settings.lessonDuration = lessonDuration;
        settings.lessonsPerDay = lessonsPerDay;
        settings.breaks = newBreaks;
        settings.schoolDayEnd = newSchoolDayEnd;
        return true; // Settings saved successfully
    }

    /**
     * 🆕 Helper to calculate the actual end time of the scheduled day.
     * Iterates through all lessons and breaks to determine total duration.
     */
    function calculateScheduledEndTime(startTime, lessonsPerDay, lessonDuration, breaks) {
        let currentMinutes = timeToMinutes(startTime);

        // Include any breaks occurring before lesson 1 (afterLesson: 0)
        breaks.filter(b => b.afterLesson === 0).forEach(b => {
            currentMinutes += b.duration;
        });

        for (let lesson = 1; lesson <= lessonsPerDay; lesson++) {
            currentMinutes += lessonDuration; // Add lesson duration

            // Check for breaks after this lesson
            const breaksAfterThisLesson = breaks.filter(b => b.afterLesson === lesson);
            breaksAfterThisLesson.forEach(b => {
                currentMinutes += b.duration;
            });
        }
        return minutesToTime(currentMinutes);
    }

    // 🆕 Helper to convert "HH:MM" to total minutes from midnight
    function timeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return (h * 60) + m;
    }

    // 🆕 Helper to convert total minutes from midnight to "HH:MM"
    function minutesToTime(totalMinutes) {
        let mins = Math.max(0, Math.round(totalMinutes));
        const h = Math.floor(mins / 60) % 24; // Ensure wrap around midnight
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * 🆕 Automatically attempts to place missing lessons into empty slots
     */
    async function autoFixFrequencies() {
        if (!currentTimetableData) return;
        const { grid, lessonFrequencies: targetFreqs, grade, stream } = currentTimetableData;

        // 1. Calculate current counts
        const actualFreqs = {};
        grid.forEach(row => row.forEach(sub => { if (sub) actualFreqs[sub] = (actualFreqs[sub] || 0) + 1; }));

        // 2. Identify missing instances
        const pending = [];
        Object.entries(targetFreqs).forEach(([sub, target]) => {
            const missing = target - (actualFreqs[sub] || 0);
            for (let i = 0; i < missing; i++) pending.push(sub);
        });

        if (pending.length === 0) {
            cbcUtils.showToast("All subject frequencies are currently met.", "info");
            return;
        }

        // 3. Prioritize pending: Core subjects first
        const coreSubjects = placementRules.coreSubjectsPreference.subjects;
        pending.sort((a, b) => {
            const isACore = coreSubjects.some(c => a.toLowerCase().includes(c.toLowerCase()));
            const isBCore = coreSubjects.some(c => b.toLowerCase().includes(c.toLowerCase()));
            if (isACore && !isBCore) return -1;
            if (!isACore && isBCore) return 1;
            return 0;
        });

        // 4. Identify empty slots
        const emptySlots = [];
        grid.forEach((row, lIdx) => {
            row.forEach((sub, dIdx) => {
                if (!sub) emptySlots.push({ lIdx, dIdx });
            });
        });

        // Shuffle empty slots to avoid filling bias
        emptySlots.sort(() => Math.random() - 0.5);

        let fixedCount = 0;
        const subjectsScheduledToday = [new Set(), new Set(), new Set(), new Set(), new Set()];
        grid.forEach((row, lIdx) => row.forEach((sub, dIdx) => { if (sub) subjectsScheduledToday[dIdx].add(sub); }));

        // 5. Attempt placement
        for (const slot of emptySlots) {
            if (pending.length === 0) break;

            const { lIdx, dIdx } = slot;
            const lesson = lIdx + 1;

            const fitIdx = pending.findIndex(sub => {
                const teacherInfo = getTeacherForSubject(grade, stream, sub);
                if (isTeacherBusy(teacherInfo?.id, dIdx, lIdx, grade, stream)) return false;
                if (subjectsScheduledToday[dIdx].has(sub) && (targetFreqs[sub] || 0) <= 5) return false;

                // Primary school constraints
                const gradeMatch = (grade || "").match(/\d+/);
                const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
                if (gradeNum >= 1 && gradeNum <= 6) {
                    if (lIdx > 0 && grid[lIdx - 1][dIdx] === sub) return false;
                    if (lIdx < grid.length - 1 && grid[lIdx + 1][dIdx] === sub) return false;
                }

                // Placement rules
                const isCore = coreSubjects.some(c => sub.toLowerCase().includes(c.toLowerCase()));
                if (placementRules.coreSubjectsPreference.enabled && isCore && lesson >= 4) return false;

                return true;
            });

            if (fitIdx !== -1) {
                const subToPlace = pending.splice(fitIdx, 1)[0];
                grid[lIdx][dIdx] = subToPlace;
                subjectsScheduledToday[dIdx].add(subToPlace);
                fixedCount++;
            }
        }

        if (fixedCount > 0) {
            renderGrid(grade, stream, false);
        }

        // Strict Mode logic: if pending lessons remain, offer full reshuffle
        if (pending.length > 0) {
            if (placementRules.strictFrequencyMode?.enabled) {
                const proceed = await window.cbcUtils.showConfirmToast(
                    `Strict Mode: Frequencies still unmet (${pending.length} missing). A full reshuffle is required to satisfy all constraints. Proceed?`,
                    { confirmText: "Yes, Reshuffle All", cancelText: "Cancel" }
                );
                if (proceed) {
                    renderGrid(grade, stream, true); // Full regeneration
                    return;
                }
            }
            cbcUtils.showToast(`Placed ${fixedCount} lessons. ${pending.length} still missing due to clashes.`, "warning");
        } else if (fixedCount > 0) {
            cbcUtils.showToast(`Placed ${fixedCount} missing lessons.`, "success");
        } else {
            cbcUtils.showToast("Could not place missing lessons. Check teacher availability.", "error");
        }
    }

    /**
     * 🆕 Automatically attempts to resolve teacher clashes by swapping slots
     */
    async function autoFixClashes() {
        if (!currentTimetableData) return;
        const { grid, grade, stream } = currentTimetableData;

        const clashes = [];
        for (let l = 0; l < grid.length; l++) {
            for (let d = 0; d < 5; d++) {
                const sub = grid[l][d];
                if (!sub) continue;
                const t = getTeacherForSubject(grade, stream, sub);
                if (isTeacherBusy(t?.id, d, l, grade, stream)) {
                    clashes.push({ l, d, sub, tId: t.id });
                }
            }
        }

        if (clashes.length === 0) {
            cbcUtils.showToast("No teacher clashes detected.", "info");
            return;
        }

        let fixedCount = 0;
        const totalToFix = clashes.length;

        // Strategy: Try to swap the clashing subject with any other non-clashing slot
        for (const clash of clashes) {
            let fixed = false;
            
            for (let l2 = 0; l2 < grid.length; l2++) {
                for (let d2 = 0; d2 < 5; d2++) {
                    const sub2 = grid[l2][d2];
                    if (!sub2 || (clash.l === l2 && clash.d === d2)) continue;

                    const t2 = getTeacherForSubject(grade, stream, sub2);
                    if (!t2) continue;

                    // Check if current subject (clash.sub) can move to new slot (l2, d2)
                    if (isTeacherBusy(clash.tId, d2, l2, grade, stream)) continue;
                    
                    // Check if swap subject (sub2) can move to old slot (clash.l, clash.d)
                    if (isTeacherBusy(t2.id, clash.d, clash.l, grade, stream)) continue;

                    // Check placement preferences (L4/L6 rules) if they exist
                    const pref1 = (subjectPlacements[grade] || {})[clash.sub] || "any";
                    const pref2 = (subjectPlacements[grade] || {})[sub2] || "any";
                    
                    if (pref1 === "before4" && l2 > 3) continue;
                    if (pref2 === "before4" && clash.l > 3) continue;

                    // Perform the swap
                    grid[clash.l][clash.d] = sub2;
                    grid[l2][d2] = clash.sub;
                    fixedCount++;
                    fixed = true;
                    break;
                }
                if (fixed) break;
            }
        }

        if (fixedCount > 0) {
            cbcUtils.showToast(`Fixed ${fixedCount} of ${totalToFix} clashes via reshuffling.`, fixedCount === totalToFix ? "success" : "warning");
            renderGrid(grade, stream, false);
        } else {
            cbcUtils.showToast("Could not auto-fix clashes. Teachers may be fully booked across all available slots.", "error");
        }
    }

    /**
     * 🆕 Performs a comprehensive check on the current timetable to ensure all lessons 
     * are assigned and subject frequencies match the targets.
     */
    function runHealthCheck() {
        if (!currentTimetableData || !currentTimetableData.grid) {
            cbcUtils.showToast("Generate a timetable first to run a health check.", "error");
            return;
        }

        const { grid, lessonFrequencies: targetFreqs, grade, stream } = currentTimetableData;
        const actualFreqs = {};
        let emptySlots = 0;
        let clashCount = 0;

        // 1. Calculate actual counts and identify empty slots
        grid.forEach((row, lIdx) => {
            row.forEach((slot, dIdx) => {
                if (slot) {
                    actualFreqs[slot] = (actualFreqs[slot] || 0) + 1;
                    
                    // While we are here, check for teacher clashes
                    const t = getTeacherForSubject(grade, stream, slot);
                    if (isTeacherBusy(t?.id, dIdx, lIdx, grade, stream)) {
                        clashCount++;
                    }
                } else {
                    emptySlots++;
                }
            });
        });

        // 2. Build frequency discrepancy report
        const frequencyIssues = [];
        Object.entries(targetFreqs).forEach(([sub, target]) => {
            const actual = actualFreqs[sub] || 0;
            if (actual < target) {
                frequencyIssues.push(`<li style="margin-bottom:8px;"><strong>${sub}:</strong> Missing ${target - actual} lesson(s) (Allocated: ${target}, Placed: ${actual})</li>`);
            } else if (actual > target) {
                frequencyIssues.push(`<li style="margin-bottom:8px;"><strong>${sub}:</strong> Extra ${actual - target} lesson(s) (Allocated: ${target}, Placed: ${actual})</li>`);
            }
        });

        // 3. Render and Display Modal
        const modal = document.createElement('div');
        modal.id = 'ttHealthCheckModal';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:10005; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';
        
        const hasIssues = frequencyIssues.length > 0 || emptySlots > 0 || clashCount > 0;
        
        modal.innerHTML = `
            <div style="background:white; padding:30px; border-radius:20px; width:92%; max-width:500px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
                    <div>
                        <h3 style="margin:0; color:#1e293b; display:flex; align-items:center; gap:12px;">
                            <i class="fas fa-heartbeat" style="color:${hasIssues ? '#ef4444' : '#10b981'};"></i> 
                            Timetable Health Diagnostics
                        </h3>
                        <p style="margin:5px 0 0; color:#64748b; font-size:0.85rem;">Analysis for ${grade} ${stream || ''}</p>
                    </div>
                    <button id="ttHealthCloseTop" style="background:none; border:none; font-size:1.5rem; color:#94a3b8; cursor:pointer;">&times;</button>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:25px;">
                    <div style="text-align:center; padding:12px; background:${clashCount > 0 ? '#fff1f2' : '#f0fdf4'}; border-radius:12px; border:1px solid ${clashCount > 0 ? '#fecaca' : '#bcf0da'};">
                        <div style="font-size:1.25rem; font-weight:900; color:${clashCount > 0 ? '#dc2626' : '#16a34a'};">${clashCount}</div>
                        <div style="font-size:0.65rem; color:${clashCount > 0 ? '#991b1b' : '#15803d'}; font-weight:700; text-transform:uppercase;">Clashes</div>
                    </div>
                    <div style="text-align:center; padding:12px; background:${emptySlots > 0 ? '#fff7ed' : '#f0fdf4'}; border-radius:12px; border:1px solid ${emptySlots > 0 ? '#fed7aa' : '#bcf0da'};">
                        <div style="font-size:1.25rem; font-weight:900; color:${emptySlots > 0 ? '#ea580c' : '#16a34a'};">${emptySlots}</div>
                        <div style="font-size:0.65rem; color:${emptySlots > 0 ? '#9a3412' : '#15803d'}; font-weight:700; text-transform:uppercase;">Empty</div>
                    </div>
                    <div style="text-align:center; padding:12px; background:${frequencyIssues.length > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius:12px; border:1px solid ${frequencyIssues.length > 0 ? '#fee2e2' : '#bcf0da'};">
                        <div style="font-size:1.25rem; font-weight:900; color:${frequencyIssues.length > 0 ? '#ef4444' : '#16a34a'};">${frequencyIssues.length}</div>
                        <div style="font-size:0.65rem; color:${frequencyIssues.length > 0 ? '#991b1b' : '#15803d'}; font-weight:700; text-transform:uppercase;">Freq. Gaps</div>
                    </div>
                </div>

                <div style="max-height:220px; overflow-y:auto; padding-right:5px;">
                    ${frequencyIssues.length > 0 ? `
                        <h4 style="font-size:0.8rem; color:#475569; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.025em;">Discrepancy Details:</h4>
                        <ul style="color:#64748b; font-size:0.85rem; padding-left:18px; margin:0;">
                            ${frequencyIssues.join('')}
                        </ul>
                    ` : `
                        <div style="text-align:center; padding:20px; background:#f0fdf4; border-radius:12px; color:#166534; font-weight:600; font-size:0.9rem;">
                            <i class="fas fa-check-circle" style="font-size:1.5rem; display:block; margin-bottom:8px;"></i>
                            Timetable meets all frequency requirements.
                        </div>
                    `}
                </div>

                <div style="margin-top:30px; display:flex; gap:12px; flex-wrap: wrap;">
                    ${clashCount > 0 ? `<button id="ttHealthAutoFixBtn" class="btn primary-btn" style="flex:1; background:#c2410c;">Auto-Fix Clashes</button>` : ''}
                    ${frequencyIssues.length > 0 && emptySlots > 0 ? `<button id="ttHealthFixFreqBtn" class="btn primary-btn" style="flex:1; background:#166534;">Fix Frequencies</button>` : ''}
                    <button id="ttHealthDismissBtn" class="btn secondary-btn" style="flex:1; border: 2px solid #e2e8f0;">Dismiss</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 🆕 Attach Event Listeners (Replacing problematic inline onclicks)
        document.getElementById('ttHealthCloseTop')?.addEventListener('click', () => modal.remove());
        document.getElementById('ttHealthDismissBtn')?.addEventListener('click', () => modal.remove());

        document.getElementById('ttHealthFixFreqBtn')?.addEventListener('click', () => {
            const btn = document.getElementById('ttHealthFixFreqBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Fixing...';
            autoFixFrequencies().then(() => modal.remove());
        });

        const autoFixBtn = document.getElementById('ttHealthAutoFixBtn');
        if (autoFixBtn) {
            autoFixBtn.addEventListener('click', () => {
                // Re-use the existing Auto-Fix logic from the main grid
                document.getElementById('autoFixClashesBtn')?.click();
                modal.remove();
            });
        }
    }

    async function generateTimetable() {
        const viewMode = document.getElementById('ttViewMode')?.value || 'class';

        // 🆕 Guard: Prevent accidental data loss if a preview is currently active
        if (viewMode === 'class' && currentTimetableData && currentTimetableData.grid) {
            const confirmed = await window.cbcUtils.showConfirmToast(
                "A timetable is currently in preview. Generating a new one will overwrite it. Proceed?",
                { confirmText: "Yes, Re-generate", cancelText: "Cancel" }
            );
            if (!confirmed) return;
        }

        const btn = document.getElementById('generateTimetableBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> Processing...`;

        try {
            // 🆕 Refresh global context first to ensure teacher mode sees all saved class schedules
            await fetchSchedulingContext();

            if (viewMode === 'teacher') {
                const teacherId = document.getElementById('ttTeacherSelect').value;
                if (!teacherId) {
                    window.showToast("Please select a teacher first.", "error");
                    return;
                }
                await renderTeacherGrid(teacherId);
                return;
            }

            const grade = document.getElementById('ttGradeSelect')?.value;
            const stream = document.getElementById('ttStreamSelect')?.value || "";
            const pathwayRaw = window.cbcUtils?.isSeniorGrade(grade) ? document.getElementById('ttPathwaySelect')?.value || "" : "";
            const pathway = window.cbcUtils?.normalizePathway?.(pathwayRaw) || (String(pathwayRaw || "").trim());
            const output = document.getElementById('timetableOutput');
            const placeholder = document.getElementById('ttPlaceholder');

            if (viewMode === 'block') {
                placeholder.style.display = 'none';
                output.style.display = 'block';
                await renderSchoolBlockTimetable();
                return;
            }
            
            if (!grade) {
                window.showToast("Please select a grade.", "error");
                return;
            }

            // 🆕 Mandatory stream validation
            const streamGroup = document.getElementById('ttStreamGroup');
            if (streamGroup && streamGroup.style.display === 'block' && !stream) {
                window.showToast("Please select a specific stream before generating.", "error");
                return;
            }

            placeholder.style.display = 'none';
            output.style.display = 'block';
            output.innerHTML = `
                <div style="text-align:center; padding:50px;">
                    <div class="spinner" style="width:40px; height:40px; border-width:4px; border-top-color:#334155; display:inline-block;"></div>
                    <p style="margin-top:20px; font-weight:700; color:#334155;">Executing intelligent scheduling for ${grade}...</p>
                    <p style="font-size:0.8rem; color:#94a3b8;">Distributing subjects and checking teacher availability...</p>
                </div>`;

            // 🆕 Initialize frequencies for any newly discovered subjects
            ensureFrequenciesInitialized(grade, stream, pathway);

            // Simulation of Engine Logic (using Promise to allow await)
            await new Promise(resolve => {
                setTimeout(() => {
                    renderGrid(grade, stream, true, pathway);
                    window.showToast(`Timetable for ${grade} generated successfully!`, "success");
                    resolve();
                }, 2000);
            });
        } catch (err) {
            console.error("Timetable generation failed:", err);
            cbcUtils.showToast("An error occurred during timetable generation.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    }

    /**
     * 🆕 Generates and downloads the timetable as a PDF file.
     */
    async function downloadTimetablePDF() {
        if (!currentTimetableData) {
            window.showToast("No timetable generated yet.", "error");
            return;
        }

        const pdfBtn = document.getElementById('downloadTimetablePDFBtn');
            // 🆕 The sidebar download button is removed, so only check for the one in the grid
            const downloadBtn = null; 
        const origPdf = pdfBtn ? pdfBtn.innerHTML : null;
        const origDownload = downloadBtn ? downloadBtn.innerHTML : null;

        if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.innerHTML = '<span class="spinner"></span> Generating...'; }
        if (downloadBtn) { downloadBtn.disabled = true; downloadBtn.innerHTML = '<span class="spinner"></span> Generating...'; }

        try {
            // Give UI thread time to update buttons
            await new Promise(r => setTimeout(r, 100));

            const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
            if (!jsPDFClass) {
                window.showToast("PDF library not detected.", "error");
                return;
            }

            const doc = new jsPDFClass({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const schoolName = (schoolInfo?.name || "SCHOOL NAME").toUpperCase();
        const term = currentTimetableData.term || "Term 1";
        const academicYear = currentTimetableData.academicYear || new Date().getFullYear();
        const viewMode = currentTimetableData.viewMode || 'class';
        const isBlock = viewMode === 'block';
        const isTeacher = viewMode === 'teacher';

        const streamSuffix = (!isBlock && !isTeacher && currentTimetableData.stream) ? ` ${currentTimetableData.stream}` : "";
        const pathwaySuffix = (!isBlock && !isTeacher && currentTimetableData.pathway) ? ` (${currentTimetableData.pathway})` : "";
        const title = isBlock ? "MASTER BLOCK TIMETABLE" : (viewMode === 'teacher' ? `${currentTimetableData.grade} SCHEDULE` : `${currentTimetableData.grade}${streamSuffix} WEEKLY TIMETABLE${pathwaySuffix}`);
        const filename = `${title.replace(/\s+/g, '_')}_${term.replace(/\s+/g, '')}_${academicYear}.pdf`;

        // Shared Header Drawing logic
        const drawDocHeader = (pageTitle) => {
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text(schoolName, pageWidth / 2, 40, { align: "center" });
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.text(`${pageTitle} - ${term} ${academicYear}`, pageWidth / 2, 58, { align: "center" });
        };

        if (isBlock) {
                const schoolType = getSchoolTypeKey();
                // Re-calculating column structure for PDF
                 const getBlockColsForPDF = (duration, lessonCount, customBreaks = null) => {
                    const cols = [];
                    let cur = currentTimetableData.settings?.startTime || settings.startTime;
                    const usedBreaks = customBreaks || (currentTimetableData.settings?.breaks || settings.breaks);
                    for (let l = 1; l <= lessonCount; l++) {
                        const end = addMinutes(cur, duration);
                        cols.push({ type: 'LESSON', lesson: l, startTime: cur, endTime: end });
                        cur = end;
                        usedBreaks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                            cols.push({ type: 'BREAK', name: b.name, startTime: cur, endTime: addMinutes(cur, b.duration) });
                            cur = addMinutes(cur, b.duration);
                        });
                    }
                    return cols;
                };

        const sorted = currentTimetableData.timetables.sort((a, b) => {
            const orderA = window.cbcUtils.GRADE_ORDER.indexOf(window.cbcUtils.normalizeGrade(a.grade));
            const orderB = window.cbcUtils.GRADE_ORDER.indexOf(window.cbcUtils.normalizeGrade(b.grade));
            if (orderA !== -1 && orderB !== -1 && orderA !== orderB) return orderA - orderB;
            return (a.stream || '').localeCompare(b.stream || '');
        });

                const chunks = [];
                for (let i = 0; i < sorted.length; i += CLASSES_PER_PAGE) chunks.push(sorted.slice(i, i + CLASSES_PER_PAGE));

                chunks.forEach((chunk, cIdx) => {
                    if (cIdx > 0) doc.addPage();
                    drawDocHeader(`MASTER BLOCK TIMETABLE (PART ${cIdx + 1}/${chunks.length})`);
const eyBreaks = [
                        { name: "SHORT BREAK", afterLesson: 2, duration: 30 },
                        { name: "LONG BREAK", afterLesson: 4, duration: 30 }
                    ];
                    const eyCols = getBlockColsForPDF(30, 5, eyBreaks);
                    const pCols = getBlockColsForPDF(35, 8);
                    const hasSeniorClasses = currentTimetableData.timetables.some(tt => window.cbcUtils?.isSeniorGrade(tt.grade));
                    const jCols = getBlockColsForPDF(40, (schoolType === 'primary_junior' || !hasSeniorClasses) ? 8 : 9);
                    const maxCols = Math.max(eyCols.length, pCols.length, jCols.length);
                    const headers = Array.from({ length: maxCols }, (_, i) => ({ ey: eyCols[i], p: pCols[i], j: jCols[i] }));

                    const head = [["DAY", ...headers.map(h => {
                        const eyT = h.ey?.startTime || '--';
                        const pT = h.p?.startTime || '--';
                        const jT = h.j?.startTime || '--';
                        if (h.ey?.type === 'BREAK' || h.p?.type === 'BREAK' || h.j?.type === 'BREAK') {
                            return `${eyT}\n${pT}\n${jT}`; 
                        }
                        const lNum = h.ey?.lesson || h.p?.lesson || h.j?.lesson;
                        return `Lesson ${lNum}\n${eyT} (EY)\n${pT} (P)\n${jT} (J)`;
                    }), "ACTIVITIES"]];

                    const columnStyles = { 0: { fontStyle: 'bold', width: 60, fillColor: [248, 250, 252] } };
                    headers.forEach((h, hIdx) => {
                         const lessonNum = h.ey?.lesson || h.p?.lesson || h.j?.lesson;
                        if (lessonNum === 1 || lessonNum === 2) {
                            columnStyles[hIdx + 1] = { width: 100 }; // 🆕 Wider for first two lessons in PDF
                        }
                    });

                    const body = ["MON", "TUE", "WED", "THU", "FRI"].map((dayName, dIdx) => {
                        const rowData = [dayName];
                        headers.forEach((h) => {
                            if (h.ey?.type === 'BREAK' || h.p?.type === 'BREAK' || h.j?.type === 'BREAK') { 
                                rowData.push(h.ey?.name || h.p?.name || h.j?.name || "BREAK"); 
                                return; 
                            }
                            const lNum = h.ey?.lesson || h.p?.lesson || h.j?.lesson;
                            const entries = [];
                            chunk.forEach(tt => {
                                const subject = tt.grid[lNum - 1]?.[dIdx];
                                    if (subject) { // Abbreviate subject for PDF display
                                    const teacher = getTeacherForSubject(tt.grade, tt.stream, subject);
                                    const gLabel = (tt.grade || '').toUpperCase().startsWith('PP') ? tt.grade : ((tt.grade || '').match(/\d+/)?.[0] || tt.grade);
                                    const subAbbr = window.cbcUtils.getAbbreviatedSubjectName(subject);
                                    const isSpecial = subject.toUpperCase() === "PE" || subject.toUpperCase() === "PPI";
                                    
                                    const line = `${gLabel}${tt.stream || ''}: ${subAbbr}`;
                                    entries.push(isSpecial ? line : `${line}\n(${teacher?.name || 'Unassigned'})`);
                                }
                            });
                            rowData.push(entries.join("\n") || "-");
                        });
                        const shared = getSharedActivityOrder();
                        rowData.push(dIdx === 4 ? "GENERAL CLEANING" : (shared[dIdx] || "SPORTS"));
                        return rowData;
                    });

                    doc.autoTable({
                        startY: 70,
                        head,
                        body,
                        theme: 'grid',
                        styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak', valign: 'middle', lineWidth: 0.5, lineColor: [40, 40, 40] },
                        headStyles: { fillColor: [51, 65, 85], textColor: 255, halign: 'center', fontSize: 6.5 },
                        showHead: 'everyPage', // Repeat time/lesson headers on every page
                        rowPageBreak: 'avoid', // 🆕 Ensures a single day (e.g. Friday) is never split across pages
                        columnStyles: columnStyles,
                        didParseCell: (data) => { 
                            const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                            if(data.section === 'body' && isBreak) {
                                data.cell.styles.fillColor = [241, 245, 249];
                                data.cell.styles.textColor = [15, 23, 42]; // slate-900 (Darker)
                                data.cell.styles.halign = 'center';
                                data.cell.styles.valign = 'middle';
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fontSize = 6.5;
                                const rawTxt = String(data.cell.text[0] || "").toUpperCase();
                                data.cell.text = [rawTxt.includes("LUNCH") ? "LUNCH" : "BREAK"];
                            }
                            // Apply custom text styling markers
                            if(data.section === 'body' && data.column.index > 0 && !isBreak && data.cell.text[0] !== '-') {
                                data.cell.styles.textColor = [255, 255, 255]; // Hidden default text
                            }
                        },
                        didDrawCell: (data) => {
                            const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                            if(data.section === 'body' && data.column.index > 0 && !isBreak && data.cell.text[0] !== '-') {
                                const doc = data.doc;
                                const cell = data.cell;
                                // Robust padding detection to avoid NaN in text coordinates
                                const p = cell.styles.cellPadding;
                                const pTop = (typeof p === 'number' ? p : (p.top || 0));
                                const pLeft = (typeof p === 'number' ? p : (p.left || 0));
                                
                                let y = cell.y + pTop + 6;
                                const x = cell.x + pLeft;

                                let inTeacherName = false; // 🆕 Track if currently drawing wrapped teacher name

                                data.cell.text.forEach(line => {
                                    const trimmed = line.trim();
                                    if (trimmed.startsWith('(')) inTeacherName = true;
                                    
                                    const isTeacher = inTeacherName;
                                    doc.setFont("helvetica", isTeacher ? "normal" : "bold");
                                    doc.setFontSize(isTeacher ? 5.5 : 7); // Reduced font for block grid
                                    doc.setTextColor(isTeacher ? 100 : 15, isTeacher ? 116 : 23, isTeacher ? 139 : 42);
                                    // 🆕 Robust Wrapping: Handle long lines by splitting and incrementing Y accordingly
                                    const wrappedLines = doc.splitTextToSize(line, cell.width - 6);
                                    wrappedLines.forEach(l => {
                                        doc.text(l, x, y);
                                        y += (isTeacher ? 6.5 : 7.5);
                                    });

                                    if (trimmed.endsWith(')')) inTeacherName = false;
                                });
                            }
                        }
                    });
                });

                // 🆕 Multi-Column Teacher Workload Summary Page
                const globalWorkload = {};
                currentTimetableData.timetables.forEach(tt => {
                    (tt.grid || []).forEach(row => {
                        (row || []).forEach(subject => {
                            if (subject) {
                                const teacherInfo = getTeacherForSubject(tt.grade, tt.stream, subject);
                                // 🆕 Consistently skip PPI if unassigned, but track others as 'Unassigned' for gaps
                                if (subject === "PPI" && !teacherInfo) return;
                                
                                const tName = teacherInfo ? teacherInfo.name : 'Unassigned';
                                globalWorkload[tName] = (globalWorkload[tName] || 0) + 1;
                            }
                        });
                    });
                });

                const workloadPairs = Object.entries(globalWorkload)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([name, count]) => {
                        // 🆕 Pedagogical Alert: Flag teachers with > 30 lessons (approx 20 hrs/week)
                        const isHigh = count > 30;
                        return [name, `${count} lessons${isHigh ? ' ⚠️' : ''}`];
                    });

                if (workloadPairs.length > 0) {
                    doc.addPage();
                    drawDocHeader("TEACHER WORKLOAD SUMMARY PER WEEK");

                    const colWidth = 240;
                    const gap = 20;
                    const startY = 80;
                    const maxRowsPerCol = 22; // Fits comfortably on landscape A4
                    const colsPerPage = 3;
                    const itemsPerPage = maxRowsPerCol * colsPerPage;

                    for (let i = 0; i < workloadPairs.length; i += itemsPerPage) {
                        if (i > 0) {
                            doc.addPage();
                            drawDocHeader("TEACHER WORKLOAD SUMMARY PER WEEK (CONT.)");
                        }

                        const pageBatch = workloadPairs.slice(i, i + itemsPerPage);
                        
                        // Render up to 3 tables side-by-side
                        for (let colIdx = 0; colIdx < colsPerPage; colIdx++) {
                            const startIdx = colIdx * maxRowsPerCol;
                            const colItems = pageBatch.slice(startIdx, startIdx + maxRowsPerCol);
                            
                            if (colItems.length > 0) {
                                doc.autoTable({
                                    startY: startY,
                                    head: [['Teacher Name', 'Workload']],
                                    body: colItems,
                                    theme: 'grid',
                                    styles: { fontSize: 8, cellPadding: 5, halign: 'center', lineWidth: 0.5, lineColor: [40, 40, 40] },
                                    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
                                    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', width: 175 }, 1: { width: 65 } },
                                    tableWidth: colWidth,
                                    margin: { left: 40 + (colIdx * (colWidth + gap)) }
                                });
                            }
                        }
                    }
                }
            } else if (isTeacher) { // Individual Teacher Timetable PDF Generation
                drawDocHeader(`${currentTimetableData.grade} PERSONAL SCHEDULE`);
                const tSettings = currentTimetableData.settings || settings;
                const teacherGrid = currentTimetableData.grid; // This now contains structured objects
                const columns = currentTimetableData.columns; // Use the columns generated in renderTeacherGrid

                const head = [["DAY / TIME", ...columns.map(col => {
                    if (col.type === 'ACTIVITY') return col.name.toUpperCase();
                    if (col.type === 'BREAK') return `${col.pStart} / ${col.jStart}`; 
                    return `Lesson ${col.index + 1}\n${col.pStart}-${col.pEnd}\n${col.jStart}-${col.jEnd}`;
                })]];

                const body = ["MON", "TUE", "WED", "THU", "FRI"].map((dayName, dIdx) => {
                    const row = [dayName];
                    columns.forEach(col => {
                        if (col.type === 'ACTIVITY') {
                            row.push("ACTIVITIES"); // Simple label for PDF
                        } else if (col.type === 'BREAK') {
                            row.push(col.name || "BREAK"); 
                        } else if (col.type === 'LESSON') {
                            const content = teacherGrid[col.index]?.[dIdx]; // Structured object
                            if (content && content.subject) {
                                row.push(`${window.cbcUtils.getAbbreviatedSubjectName(content.subject)}\n${content.classLabel}`); // Abbreviate subject in Teacher PDF
                            } else {
                                row.push("-");
                            }
                        }
                    });
                    return row;
                });

                doc.autoTable({
                    startY: 80,
                    head,
                    body,
                    theme: 'grid',
                    styles: { 
                        fontSize: 7.5, 
                        cellPadding: 5, 
                        halign: 'center', 
                        valign: 'middle', 
                        overflow: 'linebreak',
                        lineWidth: 0.5,
                        lineColor: [40, 40, 40]
                    },
                    headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 8.5 },
                    showHead: 'everyPage',
                    rowPageBreak: 'avoid',
                    columnStyles: { 0: { fontStyle: 'bold', halign: 'left', width: 85, fillColor: [248, 250, 252] } },
                    didParseCell: (data) => {
                        const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                        if (data.section === 'body' && (isBreak || data.cell.text[0] === 'ACTIVITIES')) {
                            data.cell.styles.fillColor = [241, 245, 249];
                            if (isBreak) {
                                data.cell.styles.textColor = [15, 23, 42]; // slate-900 (Darker)
                                data.cell.styles.halign = 'center';
                                data.cell.styles.valign = 'middle';
                                const rawTxt = String(data.cell.text[0] || "").toUpperCase();
                                data.cell.text = [rawTxt.includes("LUNCH") ? "LUNCH" : "BREAK"];
                            }
                        }
                        if (data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && data.cell.text[0] !== 'ACTIVITIES') {
                            data.cell.styles.textColor = [255, 255, 255]; // Hide default text for custom drawing
                        }
                    },
                    didDrawCell: (data) => {
                        const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                        if (data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && data.cell.text[0] !== 'ACTIVITIES') {
                            const doc = data.doc;
                            const cell = data.cell;
                            const p = cell.styles.cellPadding;
                            const pTop = (typeof p === 'number' ? p : (p.top || 0));
                            const pLeft = (typeof p === 'number' ? p : (p.left || 0));
                            const pRight = (typeof p === 'number' ? p : (p.right || 0));
                            const centerX = cell.x + pLeft + (cell.width - pLeft - pRight) / 2;
                            let y = cell.y + pTop + 10;
                            
                            data.cell.text.forEach((line, idx) => {
                                const isSecondary = idx > 0;
                                doc.setFont("helvetica", isSecondary ? "normal" : "bold");
                                doc.setFontSize(isSecondary ? 6.5 : 8); 
                                doc.setTextColor(isSecondary ? 37 : 15, isSecondary ? 99 : 23, isSecondary ? 235 : 42);
                                
                                // Robust Wrapping: Handle long lines by splitting and incrementing Y accordingly
                                const wrappedLines = doc.splitTextToSize(line, cell.width - 6);
                                wrappedLines.forEach(l => {
                                    doc.text(l, centerX, y, { align: 'center' });
                                    y += (isSecondary ? 7.5 : 9);
                                });

                                if (!isSecondary) y += 2; // Extra spacer after subject
                            });
                        }
                    }
                });

                // 🆕 Add Workload Summary below the main table for Teachers
                const workloadCounts = {};
                currentTimetableData.grid.forEach(row => {
                    row.forEach(slot => {
                        if (slot && slot.subject) {
                            const key = `${slot.subject} (${slot.classLabel})`;
                            workloadCounts[key] = (workloadCounts[key] || 0) + 1;
                        }
                    });
                });

                const workloadRows = Object.entries(workloadCounts).map(([label, count]) => [label, `${count} lessons`]);
                const totalLessons = Object.values(workloadCounts).reduce((a, b) => a + b, 0);
                
                if (workloadRows.length > 0) {
                    workloadRows.push([{ content: 'TOTAL WEEKLY WORKLOAD', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, { content: `${totalLessons} lessons`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }]);

                    doc.autoTable({
                        startY: doc.lastAutoTable.finalY + 20,
                        head: [['Subject (Grade)', 'Lessons per Week']],
                        body: workloadRows,
                        theme: 'grid',
                        styles: { fontSize: 8, cellPadding: 4, lineWidth: 0.5, lineColor: [40, 40, 40] },
                        headStyles: { fillColor: [71, 85, 105] },
                        tableWidth: 250,
                        margin: { left: 85 } // Align with the start of the schedule columns
                    });
                }
            } else { // Individual Class Timetable PDF Generation
                // Individual Class or Teacher View
                // 🆕 Use the 'title' variable already correctly constructed at the top of the function
                // This ensures stream and pathway are included in the header.
                drawDocHeader(title);
                const tSettings = currentTimetableData.settings || settings;
                const isSenior = window.cbcUtils.isSeniorGrade(currentTimetableData.grade);
                const duration = tSettings.lessonDuration;
                const lessonCount = tSettings.lessonsPerDay;
                
                const colDefs = [];
                let curTime = tSettings.startTime || "08:20";
                for(let l=1; l<=lessonCount; l++) {
                    const endTime = addMinutes(curTime, duration);
                    colDefs.push({ type: 'L', lNum: l, label: `Lesson ${l}\n${curTime}-${endTime}` });
                    curTime = endTime;
                    tSettings.breaks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                        colDefs.push({ type: 'B', label: curTime, breakName: b.name }); // Only show time in label (header)
                        curTime = addMinutes(curTime, b.duration);
                    });
                }
                if (!isSenior) colDefs.push({ type: 'A', label: "ACTIVITIES" });

                const head = [["DAY / TIME", ...colDefs.map(c => c.label)]];
                const body = ["MON", "TUE", "WED", "THU", "FRI"].map((dayName, dIdx) => {
                    const row = [dayName];
                    colDefs.forEach(col => {
                        if (col.type === 'B') row.push(col.breakName || "BREAK"); // 🆕 Use actual breakName
                        else if (col.type === 'A') {
                            const act = currentTimetableData.extraActivities || getSharedActivityOrder();
                            row.push(dIdx === 4 ? "GENERAL CLEANING" : (act[dIdx] || "SPORTS"));
                        } else {
                            const sub = currentTimetableData.grid[col.lNum - 1]?.[dIdx];
                            if (!sub) row.push("-");
                            else if (viewMode === 'teacher') row.push(window.cbcUtils.getAbbreviatedSubjectName(sub).replace(/<br>/g, "\n"));
                            else {
                                const t = getTeacherForSubject(currentTimetableData.grade, currentTimetableData.stream, sub);
                                row.push(sub === "PE" || sub === "PPI" ? window.cbcUtils.getAbbreviatedSubjectName(sub) : `${window.cbcUtils.getAbbreviatedSubjectName(sub)}\n(${t?.name || 'Unassigned'})`);
                            }
                        }
                    });
                    return row;
                });

                doc.autoTable({
                    startY: 80,
                    head,
                    body,
                    theme: 'grid',
                    styles: {
                        fontSize: 7, 
                        cellPadding: 6, 
                        minCellHeight: 65, 
                        halign: 'center', 
                        valign: 'top', 
                        overflow: 'linebreak',
                        lineWidth: 0.5,
                        lineColor: [40, 40, 40]
                    },
                    headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 8, minCellHeight: 25 },
                    showHead: 'everyPage',
                    rowPageBreak: 'auto',
                    columnStyles: { 0: { fontStyle: 'bold', halign: 'left', width: 85, fillColor: [248, 250, 252] } },
                    didParseCell: (data) => { 
                        const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                        if(data.section === 'body' && isBreak) { 
                            data.cell.styles.fillColor = [241, 245, 249]; 
                            data.cell.styles.textColor = [148, 163, 184]; // gray-400
                            data.cell.styles.halign = 'center';
                            data.cell.styles.valign = 'middle';
                            const rawTxt = String(data.cell.text[0] || "").toUpperCase();
                            data.cell.text = [rawTxt.includes("LUNCH") ? "LUNCH" : "BREAK"];
                        } 
                        if(data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && !data.cell.text.join(' ').toUpperCase().match(/CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER|ACTIVITIES/)) {
                            data.cell.styles.textColor = [255, 255, 255]; // Invisible for manual drawing
                        }
                    },
                    didDrawCell: (data) => {
                        const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                        if(data.section === 'body' && data.column.index > 0 && data.cell.text.length > 1 && !isBreak && !data.cell.text.join(' ').toUpperCase().match(/CLEANING|SPORTS|GUIDANCE|CLUBS|CAREER|ACTIVITIES/)) {
                            const doc = data.doc;
                            const cell = data.cell;
                            const p = cell.styles.cellPadding;
                            const pTop = (typeof p === 'number' ? p : (p.top || 0));
                            const centerX = cell.x + cell.width / 2;
                            let y = cell.y + pTop + 12; 

                            let inTeacherName = false;
                            data.cell.text.forEach(line => {
                                const trimmed = line.trim();
                                if (trimmed.startsWith('(')) inTeacherName = true;
                                
                                const isTeacher = inTeacherName;
                                doc.setFont("helvetica", isTeacher ? "normal" : "bold");
                                doc.setFontSize(isTeacher ? 5.5 : 7); 
                                doc.setTextColor(isTeacher ? 37 : 15, isTeacher ? 99 : 23, isTeacher ? 235 : 42);
                                
                                // Robust Wrapping: Handle long lines by splitting and incrementing Y accordingly
                                const wrappedLines = doc.splitTextToSize(line, cell.width - 6);
                                wrappedLines.forEach(l => {
                                    doc.text(l, centerX, y, { align: 'center' });
                                    y += (isTeacher ? 6.5 : 8);
                                });

                                if (trimmed.endsWith(')')) inTeacherName = false;
                                if (!inTeacherName) y += 2; // Extra spacer after subject
                            });
                        }
                    }
                });

                // 🆕 Add Class Teacher at the bottom of the individual class timetable
                const classTeacherName = getClassTeacherForGrade(currentTimetableData.grade, currentTimetableData.stream);
                if (classTeacherName) {
                    const finalY = doc.lastAutoTable.finalY + 25;
                    doc.setFontSize(10);
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(15, 23, 42); // slate-900
                    doc.text(`CLASS TEACHER: ${classTeacherName.toUpperCase()}`, 40, finalY); 
                }
            }

            // 🆕 Add Footer to every page (Printed date/time + Branding)
            const totalPagesCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPagesCount; i++) {
                doc.setPage(i);
                const pageHeightForFooter = doc.internal.pageSize.getHeight();
                doc.setFontSize(8);
                doc.setTextColor(120, 120, 120); // Professional subtle gray

                const printedStr = `Printed: ${new Date().toLocaleString()}`;
                const brandStr = "CompetenceHub Timetables";

                doc.text(printedStr, 40, pageHeightForFooter - 20);
                doc.text(brandStr, pageWidth / 2, pageHeightForFooter - 20, { align: "center" });
                doc.text(`Page ${i} of ${totalPagesCount}`, pageWidth - 40, pageHeightForFooter - 20, { align: "right" });
            }

            doc.save(filename);
            window.showToast("PDF generated successfully.", "success");
        } catch (err) {
            console.error("PDF Export Error:", err);
            window.showToast("Failed to generate PDF.", "error");
        } finally {
            if (pdfBtn) { pdfBtn.disabled = false; pdfBtn.innerHTML = origPdf; }
            if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.innerHTML = origDownload; }
        }
    }

    /**
     * 🆕 Sends the generated timetable to the backend
     */
    async function saveTimetableToPortal() {
        if (!currentTimetableData) return;
        
        const saveBtn = document.getElementById('saveTimetableToPortalBtn');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

        try {
            const API_BASE = window.config.api.baseURL;
            const token = authService.getToken(); // Use authService for consistency
            
            // 🆕 Construct a clean payload that explicitly maps to the backend Timetable model
            const streamVal = currentTimetableData.stream || "";
            const termVal = document.getElementById('ttTermSelect')?.value || "Term 1";

            // 🆕 Use deep clone for settings to prevent state leakage
            const payload = {
                term: termVal,
                academicYear: Number(currentTimetableData.academicYear),
                grade: currentTimetableData.grade,
                stream: streamVal.toString().trim(),
                pathway: currentTimetableData.pathway || null,
                lessonFrequencies: currentTimetableData.lessonFrequencies,
                settings: JSON.parse(JSON.stringify(currentTimetableData.settings)),
                grid: currentTimetableData.grid,
                extraActivities: currentTimetableData.extraActivities
            };

            console.log("🚀 Saving Timetable Payload:", payload);

            const res = await fetch(`${API_BASE}/timetables/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                window.showToast("Timetable saved successfully to the portal!", "success");
                // 🆕 Invalidate the saved timetables cache so it picks up the change for clash detection
                const year = Number(currentTimetableData.academicYear);
                const term = document.getElementById('ttTermSelect')?.value || "Term 1";
                localStorage.removeItem(`${SAVED_TIMETABLES_CACHE_KEY}_${year}_${term}`);
            } else {
                const err = await res.json();
                window.showToast(err.message || "Failed to save timetable.", "error");
            }
        } catch (err) {
            console.error("Save error:", err);
            window.showToast("Network error while saving.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHTML;
        }
    }

    /**
     * 🆕 Finds which teacher is assigned to a subject in a specific grade
     */
    function getTeacherForSubject(grade, stream, subject) {
        if (!grade || !subject) return null;
        const normalizedTarget = (window.cbcUtils?.normalizeGrade(grade) || grade).toLowerCase().trim();
        const streamTarget = (stream || "").toLowerCase().trim();

        const teacher = schoolAllocations.find(t => 
            (t.allocations || []).some(a => {
                const allocGrade = (window.cbcUtils?.normalizeGrade(a.grade) || a.grade).toLowerCase().trim();
                const allocStream = (a.stream || "").toLowerCase().trim();
                 // 🆕 Case-insensitive subject match for robustness
                const subjects = Array.isArray(a.subjects) ? a.subjects : [];
                return allocGrade === normalizedTarget && 
                       allocStream === streamTarget && 
                       subjects.some(s => s.toLowerCase().trim() === subject.toLowerCase().trim());
            })
        );
        return teacher ? { id: teacher._id, name: teacher.name } : null;
    }

    /**
     * 🆕 Finds the class teacher for a specific grade and stream
     */
    function getClassTeacherForGrade(grade, stream) {
        if (!grade) return null;
        const normalizedTarget = (window.cbcUtils?.normalizeGrade(grade) || grade).toLowerCase().trim();
        const streamTarget = (stream || "").toLowerCase().trim();

        // Search through schoolAllocations which now includes assignedClass/Stream
        const teacher = schoolAllocations.find(t => {
            if (!t.assignedClass) return false;
            const assignedGrade = (window.cbcUtils?.normalizeGrade(t.assignedClass) || t.assignedClass).toLowerCase().trim();
            const assignedStream = (t.assignedStream || "").toLowerCase().trim();
            return assignedGrade === normalizedTarget && assignedStream === streamTarget;
        });
        return teacher ? teacher.name : null;
    }

    /**
     * 🆕 Opens the manual override modal for a specific timetable slot
     */
    function openEditSlotModal(dayIdx, lessonIdx) {
        if (!currentTimetableData) return;
        
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        const currentSub = currentTimetableData.grid[lessonIdx][dayIdx];
        const stream = currentTimetableData.stream;
        activeEditSlot = { dayIdx, lessonIdx };

        const detailsEl = document.getElementById('editSlotDetails');
        const selectEl = document.getElementById('editSlotSubjectSelect');
        const modal = document.getElementById('editSlotModal');

        detailsEl.innerHTML = `
            <strong>${days[dayIdx]}</strong><br>
            Lesson ${lessonIdx + 1}<br>
            Current: <em>${currentSub || 'Unassigned'}</em>
        `;

        // Populate dropdown with all allocated subjects for this grade
        const currentPathway = currentTimetableData.pathway || "";
        const subjects = getAllocatedSubjectsForGrade(currentTimetableData.grade, stream, currentPathway);
        selectEl.innerHTML = '<option value="">-- Remove Subject (Empty) --</option>';
        subjects.forEach(sub => {
            const teacherInfo = getTeacherForSubject(currentTimetableData.grade, stream, sub);
            const isBusy = teacherInfo ? isTeacherBusy(teacherInfo.id, dayIdx, lessonIdx, currentTimetableData.grade, stream) : false;

            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = teacherInfo ? `${sub} (${teacherInfo.name}${isBusy ? ' - BUSY' : ''})` : sub;
            if (isBusy) opt.style.color = "#ef4444";
            if (sub === currentSub) opt.selected = true;
            selectEl.appendChild(opt);
        });

        modal.classList.remove('hidden');
        modal.classList.add('visible');
    }

    /**
     * 🆕 Updates the local state and re-renders the grid without re-shuffling everything
     */
    async function saveSlotEdit() {
        if (!activeEditSlot || !currentTimetableData) return;

        const newSubject = document.getElementById('editSlotSubjectSelect').value;
        const { dayIdx, lessonIdx } = activeEditSlot;
        const grade = currentTimetableData.grade;
        const stream = currentTimetableData.stream;
        const grid = currentTimetableData.grid;

        // 🆕 Duplicate Check: Prevent manual selection from creating duplicates on the same day
        const freqs = currentTimetableData.lessonFrequencies;
        if (newSubject && (freqs[newSubject] || 0) <= 5) {
            const alreadyExistsOnDay = grid.some((row, lIdx) => lIdx !== lessonIdx && row[dayIdx] === newSubject);
            if (alreadyExistsOnDay) {
                cbcUtils.showToast(`Action blocked: ${newSubject} already exists on this day. Subjects with frequency <= 5 should only appear once daily.`, "error");
                return;
            }
        }

        // 🆕 Consecutive Check: Prevent consecutive identical subjects in Primary schools
        const gradeMatch = (grade || "").match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const isPrimary = gradeNum >= 1 && gradeNum <= 6;
        if (isPrimary && newSubject) {
            const isConsecutive = (lessonIdx > 0 && grid[lessonIdx - 1][dayIdx] === newSubject) || (lessonIdx < grid.length - 1 && grid[lessonIdx + 1][dayIdx] === newSubject);
            if (isConsecutive) {
                cbcUtils.showToast("Action blocked: Consecutive identical subjects are not allowed in Primary schools.", "error");
                return;
            }
        }

        // 🆕 Teacher Availability Verification
        if (newSubject) {
            const teacherInfo = getTeacherForSubject(grade, stream, newSubject);
            if (teacherInfo && isTeacherBusy(teacherInfo.id, dayIdx, lessonIdx, grade, stream)) {
                const proceed = await window.cbcUtils.showConfirmToast(
                    `Teacher ${teacherInfo.name} is already scheduled in another class during this lesson. Do you want to save anyway?`,
                    { confirmText: "Yes, Clash it", cancelText: "Cancel" }
                );
                if (!proceed) return;
            }
        }

        // Update the grid state directly
        currentTimetableData.grid[lessonIdx][dayIdx] = newSubject;

        // Re-render using the updated state
        renderGrid(grade, stream, false);

        document.getElementById('editSlotModal').classList.remove('visible');
        document.getElementById('editSlotModal').classList.add('hidden');
        cbcUtils.showToast("Slot updated manually.", "info");
        activeEditSlot = null;
    }

    /**
     * 🆕 Resets only the column for a specific day while maintaining frequency integrity
     */
    async function resetDay(dayIdx) {
        if (!currentTimetableData) return;
        const { grid, grade, stream } = currentTimetableData;
        const days = ["MON", "TUE", "WED", "THU", "FRI"];

        const confirmed = await window.cbcUtils.showConfirmToast(`Reset all lessons for ${days[dayIdx]}? Other days will remain unchanged.`);
        if (!confirmed) return;

        const gradeMatch = (grade || "").match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const isEarlyYears = grade && (grade.toUpperCase().includes('PP') || grade.toUpperCase() === 'PG');
        const isPrimary = (gradeNum >= 1 && gradeNum <= 6) || isEarlyYears;

        // 1. Calculate how many lessons of each subject are used on OTHER days
        const usedOnOtherDays = {};
        currentTimetableData.grid.forEach((row, lIdx) => {
            row.forEach((sub, dIdx) => {
                if (dIdx !== dayIdx && sub) {
                    usedOnOtherDays[sub] = (usedOnOtherDays[sub] || 0) + 1;
                }
            });
        });

        // 2. Build the pool for this specific day based on remaining frequency
        const dayPool = [];
        Object.entries(currentTimetableData.lessonFrequencies).forEach(([sub, totalCount]) => {
            const remaining = totalCount - (usedOnOtherDays[sub] || 0);
            for (let i = 0; i < remaining; i++) dayPool.push(sub);
        });

        // Shuffle the pool for this day
        dayPool.sort(() => Math.random() - 0.5);

        // 3. 🆕 Re-fill the day while respecting Double Lesson constraints
        const dayColumn = Array(settings.lessonsPerDay).fill("");
        const subjectsScheduledThisDay = new Set();

        // 3a. Pre-place double lessons if any double-eligible subjects have 2+ lessons today
        if (placementRules.doubleLessons.enabled) {
            const doublesCandidates = placementRules.doubleLessons.subjects;
            let doublePlacedToday = false;

            for (const subName of doublesCandidates) {
                if (doublePlacedToday) break; // Inhibit multiple doubles per day
                const countInDay = dayPool.filter(s => s === subName).length;
                const requiredBlocks = getDoubleLessonBlockCount(subName);
                if (requiredBlocks <= 0 || countInDay < 2) continue;

                // 🆕 Ensure we only place the configured number of doubles per week for this subject
                let existingDoubleBlocksThisWeek = 0;
                for (let d = 0; d < 5; d++) {
                    if (d === dayIdx) continue;
                    for (let l = 0; l < grid.length - 1; l++) {
                        if (grid[l][d] === subName && grid[l + 1][d] === subName) {
                            existingDoubleBlocksThisWeek += 1;
                            break;
                        }
                    }
                }

                if (existingDoubleBlocksThisWeek < requiredBlocks) {
                    // 🆕 Refined Double Lesson Constraints:
                    // Avoid early morning (L1-L4).
                    // Allow slots from Lesson 5 onwards (L5-L6, L7-L8, L8-L9).
                    const validPairs = [[4, 5], [6, 7], [7, 8]];
                    validPairs.sort(() => Math.random() - 0.5);
                    for (const [l1, l2] of validPairs) {
                        if (l2 >= settings.lessonsPerDay) continue;
                        const t = getTeacherForSubject(grade, stream, subName);
                        if (!isTeacherBusy(t?.id, dayIdx, l1, grade, stream) && !isTeacherBusy(t?.id, dayIdx, l2, grade, stream)) {
                            dayColumn[l1] = subName;
                            dayColumn[l2] = subName;
                            subjectsScheduledThisDay.add(subName);
                            // Remove exactly 2 instances from dayPool
                            let removed = 0;
                            for (let i = dayPool.length - 1; i >= 0 && removed < 2; i--) {
                                if (dayPool[i] === subName) { dayPool.splice(i, 1); removed++; }
                            }
                            doublePlacedToday = true;
                            break;
                        }
                    }
                }
            }
        }

        // 3b. Fill remaining single slots

        // Step 3.1: PPI Priority for Friday Morning
        if (dayIdx === 4 && placementRules.ppiPreference.enabled && placementRules.ppiPreference.fridayMorningOnly) {
            const ppiIdx = dayPool.findIndex(p => p === "PPI");
            if (ppiIdx !== -1) {
                const t = getTeacherForSubject(grade, stream, "PPI");
                const morningSlots = [0, 1, 2, 3].filter(l => l < settings.lessonsPerDay && !dayColumn[l]);
                for (const l of morningSlots) {
                    if (!isTeacherBusy(t?.id, dayIdx, l, grade, stream)) {
                        dayColumn[l] = "PPI";
                        subjectsScheduledThisDay.add("PPI");
                        dayPool.splice(ppiIdx, 1);
                        break;
                    }
                }
            }
        }

        // Step 3.2: Core Priority for Morning Slots (L1-L3)
        if (placementRules.coreSubjectsPreference.enabled) {
            const coreSubjects = placementRules.coreSubjectsPreference.subjects;
            const morningSlots = [0, 1, 2].filter(l => l < settings.lessonsPerDay && !dayColumn[l]);
            
            morningSlots.forEach(lIdx => {
                const coreIdx = dayPool.findIndex(p => 
                    coreSubjects.some(c => p.toLowerCase().includes(c.toLowerCase())) &&
                    !subjectsScheduledThisDay.has(p)
                );
                
                if (coreIdx !== -1) {
                    const cand = dayPool[coreIdx];
                    const t = getTeacherForSubject(grade, stream, cand);
                    if (!isTeacherBusy(t?.id, dayIdx, lIdx, grade, stream)) {
                        dayColumn[lIdx] = cand;
                        subjectsScheduledThisDay.add(cand);
                        dayPool.splice(coreIdx, 1);
                    }
                }
            });
        }

        // 3c. Main filling loop for remaining slots
        for (let lIdx = 0; lIdx < settings.lessonsPerDay; lIdx++) {
            if (dayColumn[lIdx]) continue;

            const lesson = lIdx + 1;
            let subject = "";

            if (!subject) {
                for (let i = 0; i < dayPool.length; i++) {
                    const candidate = dayPool[i];
                    if (candidate === "PPI") continue; // Handled in priority phase

                    // 🆕 Primary School Constraint: Prevent double lessons (no consecutive same subjects)
                    if (isPrimary && lIdx > 0 && dayColumn[lIdx - 1] === candidate) continue;

                    const cType = getSubjectType(candidate);
                    if (placementRules.creativePreference.enabled && placementRules.creativePreference.afternoonOnly && cType === "ACTIVITY" && lesson <= 4) continue;
                    
                    // Inhibit repeating a subject already placed today if its frequency is standard
                    if (subjectsScheduledThisDay.has(candidate) && (currentTimetableData.lessonFrequencies[candidate] || 0) <= 5) continue;

                    const teacherInfo = getTeacherForSubject(grade, stream, candidate);
                    if (isTeacherBusy(teacherInfo?.id, dayIdx, lIdx, grade, stream)) continue;

                    // 🆕 Integrity Rule: No Technical subjects immediately after Sports/PE (Cool-down)
                    if (lIdx > 0 && cType === "TECHNICAL") {
                        const prevSub = dayColumn[lIdx - 1];
                        if (prevSub) {
                            const isPrevSports = prevSub.toLowerCase().includes("sports") || 
                                                 prevSub.toLowerCase().includes("physical education") ||
                                                 prevSub === "Physical Health Education";
                            if (isPrevSports) continue;
                        }
                    }

                    // 🆕 Technical Subjects Preference: Morning Priority & Mid-day Avoidance
                    if (placementRules.technicalSubjectsPreference.enabled) {
                        const isMorning = lesson <= 4;
                        if (placementRules.technicalSubjectsPreference.preferMorning && isMorning && cType !== "TECHNICAL" && cType !== "CORE") {
                            if (dayPool.some(p => getSubjectType(p) === "TECHNICAL" || getSubjectType(p) === "CORE")) continue;
                        }
                        if ((lesson === 5 || lesson === 6) && cType === "TECHNICAL") {
                            if (dayPool.some(p => getSubjectType(p) !== "TECHNICAL")) continue;
                        }
                    }

                    // 🆕 Constraint: Core subjects never after Lesson 3
                    const isCore = placementRules.coreSubjectsPreference.subjects.some(c => candidate.toLowerCase().includes(c.toLowerCase()));
                    if (placementRules.coreSubjectsPreference.enabled && isCore && lesson >= 4) continue;

                    // 🆕 Constraint: No Technical subjects immediately after Sports/PE
                    if (lIdx > 0 && cType === "TECHNICAL") {
                        const prevSub = dayColumn[lIdx - 1];
                        if (prevSub) {
                            const isPrevSports = prevSub.toLowerCase().includes("sports") || 
                                                 prevSub.toLowerCase().includes("physical education") ||
                                                 prevSub === "Physical Health Education";
                            if (isPrevSports) continue;
                        }
                    }

                    subject = candidate;
                    dayPool.splice(i, 1);
                    break;
                }
            }
            if (!subject && dayPool.length > 0) {
                // 🆕 Enhanced Fallback: Attempt to avoid repetition even in the emergency shift
                const nonRepeatIdx = dayPool.findIndex(p => {
                    if (subjectsScheduledThisDay.has(p) && (currentTimetableData.lessonFrequencies[p] || 0) <= 5) return false;
                    if (isPrimary && lIdx > 0 && dayColumn[lIdx - 1] === p) return false;
                    const t = getTeacherForSubject(grade, stream, p);
                    return !isTeacherBusy(t?.id, dayIdx, lIdx, grade, stream);
                });
                if (nonRepeatIdx !== -1) {
                    subject = dayPool.splice(nonRepeatIdx, 1)[0];
                } else {
                    subject = dayPool.shift();
                }
            }
            dayColumn[lIdx] = subject;
            if (subject) subjectsScheduledThisDay.add(subject);
        }

        // 4. Update the actual grid data from our reconstructed column
        for (let l = 0; l < settings.lessonsPerDay; l++) {
            grid[l][dayIdx] = dayColumn[l];
        }

        // 4. Refresh UI
        renderGrid(grade, stream, false);
        window.cbcUtils.showToast(`${days[dayIdx]} has been reshuffled.`, "info");
    }

    /**
     * 🆕 Checks if a teacher is already busy in another grade at this time
     */
    function isTeacherBusy(teacherId, dayIndex, lessonIndex, currentGrade, currentStream) {
        if (!teacherId) return false;
        
        return allSavedTimetables.some(tt => {
            let savedGrade = tt.grade;
            let savedStream = tt.stream || "";

            // Use normalized comparison to skip the current class being generated
            const isSelf = window.cbcUtils?.normalizeGrade(savedGrade) === window.cbcUtils?.normalizeGrade(currentGrade) && 
                           String(savedStream).trim().toUpperCase() === String(currentStream).trim().toUpperCase();
            
            if (isSelf) return false;
            
            // Check the specific slot in the saved grid
            const subjectAtSlot = tt.grid[lessonIndex]?.[dayIndex];
            if (!subjectAtSlot) return false;

            // Lookup who teaches THIS subject in THAT class
            const teacherAtSlot = getTeacherForSubject(tt.grade, tt.stream, subjectAtSlot);
            return teacherAtSlot && teacherAtSlot.id === teacherId;
        });
    }

    /**
     * 🆕 Aggregates and renders a schedule for a single teacher across all classes
     */
    async function renderTeacherGrid(teacherId) {
        const output = document.getElementById('timetableOutput');
        const placeholder = document.getElementById('ttPlaceholder');
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        const academicYear = document.getElementById('ttYearSelect').value;
        const term = document.getElementById('ttTermSelect')?.value || "Term 1";

        placeholder.style.display = 'none';
        output.style.display = 'block';
        output.innerHTML = `<div style="text-align:center; padding:50px;"><div class="spinner"></div><p>Searching all class timetables for this teacher...</p></div>`;

        selectedSwapSlot = null;

        // Ensure context is fresh
        await fetchSchedulingContext();
        const teacher = schoolAllocations.find(t => t._id === teacherId);

        // 🆕 Determine correct lesson count based on school type for teacher view
        const schoolType = getSchoolTypeKey();
        const effectiveLessonsPerDay = (schoolType === 'primary_junior') ? 8 : 9;

        // 1. Build a personal occupancy grid
        // 🆕 Robustness fix: Always initialize for maximum possible lessons (12) to prevent
        // crashes when aggregating data from different school levels (Junior vs Senior)
        const maxPossibleLessons = 12;
        const personalGrid = Array.from({ length: maxPossibleLessons }, () => Array(5).fill(""));

        allSavedTimetables.forEach(tt => {
            // Only process timetables for the selected year
            const ttYear = tt.academicYear || tt.year;
            if (ttYear && academicYear && Number(ttYear) !== Number(academicYear)) return;

            // 🆕 Only process timetables for the selected term
            if (tt.term && term && tt.term !== term) return;

            if (!tt.grid || !Array.isArray(tt.grid)) return;

            let displayGrade = tt.grade;
            let displayStream = tt.stream ? tt.stream.trim() : "";

            const gradeShort = (displayGrade.toUpperCase().startsWith('PP') || displayGrade.toUpperCase() === 'PG') ? displayGrade : (displayGrade.match(/\d+/)?.[0] || displayGrade);
            const classLabel = `${gradeShort}${displayStream}`;

            tt.grid.forEach((row, lIdx) => {
                row.forEach((subject, dIdx) => {
                    if (!subject) return;
                    // Check if selected teacher is teaching this subject in this class
                    const teacherAtSlot = getTeacherForSubject(tt.grade, tt.stream, subject);
                    
                    // 🆕 Added boundary check for lIdx to prevent TypeErrors if 
                    // saved grids have more lessons than initialized rows.
                    if (teacherAtSlot && teacherAtSlot.id === teacherId && personalGrid[lIdx]) {
                        personalGrid[lIdx][dIdx] = { subject: subject, classLabel: classLabel };
                    }
                });
            });
        });

        // 2. Map Columns (Time slots and breaks) with Dual Time Logic (Primary vs Junior/Senior)
        const getTimeline = (start, dur, count, bks) => {
            const list = [];
            let cur = start;
            for (let l = 1; l <= count; l++) {
                const end = addMinutes(cur, dur);
                list.push({ type: 'LESSON', lesson: l, start: cur, end: end });
                cur = end;
                bks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                    list.push({ type: 'BREAK', name: b.name, start: cur, end: addMinutes(cur, b.duration) });
                    cur = addMinutes(cur, b.duration);
                });
            }
            return list;
        };

        const startTime = settings.startTime || "08:20";
        const pTime = getTimeline(startTime, 35, 8, [
            { name: "SHORT BREAK", afterLesson: 2, duration: 20 },
            { name: "LONG BREAK", afterLesson: 4, duration: 30 },
            { name: "LUNCH", afterLesson: 6, duration: 80 }
        ]);
        const jTime = getTimeline(startTime, 40, settings.lessonsPerDay, [
            { name: "SHORT BREAK", afterLesson: 2, duration: 10 },
            { name: "LONG BREAK", afterLesson: 4, duration: 20 },
            { name: "LUNCH", afterLesson: 6, duration: 70 }
        ]);

        const columns = [];
        const maxLen = Math.max(pTime.length, jTime.length);
        for(let i=0; i<maxLen; i++) {
            const p = pTime[i]; const j = jTime[i];
            columns.push({
                type: p?.type || j?.type, name: p?.name || j?.name, index: (p?.lesson || j?.lesson) - 1,
                pStart: p?.start || '--', pEnd: p?.end || '--',
                jStart: j?.start || '--', jEnd: j?.end || '--',
                startTime: p?.start === j?.start ? p?.start : `${p?.start || '--'} / ${j?.start || '--'}`,
                endTime: p?.end === j?.end ? p?.end : `${p?.end || '--'} / ${j?.end || '--'}`
            });
        }
        columns.push({ type: 'ACTIVITY', name: 'ACTIVITIES', pStart: '15:30', jStart: '15:30', startTime: '15:30' });

        // Update metadata for PDF download
        currentTimetableData = { 
            viewMode: 'teacher',
            grade: teacher?.name || 'Teacher', 
            term,
            grid: personalGrid, // Now contains structured objects
            academicYear: Number(academicYear),
            // 🆕 Use deep clone for settings to prevent state leakage
            settings: JSON.parse(JSON.stringify(settings)),
            columns: columns // Pass column definitions for PDF generation
        };

        // 3. Render HTML for on-screen display (using the structured personalGrid)
        let html = `
            <div class="tt-print-page">
                <div style="text-align: center; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                    <h2 style="margin: 0; text-transform: uppercase; font-weight: 900; color: #0f172a; font-size: 1.3rem;">${(schoolInfo?.name || 'School Name').toUpperCase()}</h2>
                </div>
                <div class="no-print" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom: 10px;">
                    <button class="btn secondary-btn" id="downloadTimetablePDFBtn"><i class="fas fa-file-pdf"></i> Download PDF</button>
                </div>
                <div class="tt-grid-container" style="overflow-x:auto;">
                    <table class="marks-table" style="width:100%; border-collapse: collapse; border: 1px solid #cbd5e1; table-layout: auto;">

                    <thead style="background: #ffffff; font-size: 0.75rem;">
                        <tr style="background: #ffffff;">
                            <th colspan="${columns.length + 1}" style="padding: 15px; border-bottom: 1px solid #94a3b8; text-align: center;">
                                <h3 style="margin:0; text-transform: uppercase; font-weight: 900; font-size: 1.15rem; color: #0f172a;">${teacher?.name.toUpperCase() || 'TEACHER'} PERSONAL SCHEDULE - ${term} ${academicYear}</h3>
                            </th>
                        </tr>
                        <tr>
                            <th style="width:100px; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 800; background: #f8fafc;">DAY / TIME</th>
                            ${columns.map(col => {
                                if (col.type === 'ACTIVITY') return `<th style="background:#e8f4f8; color:#1e5f7a; font-size:0.75rem; font-weight: 800; border: 1px solid #cbd5e1; text-transform: uppercase;">${col.name}</th>`;
                                if (col.type === 'BREAK') return `<th style="background:#f8fafc; color:#0f172a; font-size:0.65rem; width: 65px; font-weight: 800;">${col.pStart}<br>${col.jStart}</th>`;
                                return `<th style="text-align:center; color: #1e293b; font-weight: 800;"><div style="line-height:1.2;">Lesson ${col.index + 1}<br><span style="font-size:0.65rem; color:#0f172a; font-weight:700;">${col.pStart}-${col.pEnd} (P)<br>${col.jStart}-${col.jEnd} (J)</span></div></th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>`;

        days.forEach((dayName, dayIdx) => {
            html += `<tr style="height: 60px;"><td style="font-size:0.75rem; color:#1e293b; font-weight:800; background:#f8fafc; border-right:1px solid #cbd5e1; width:100px; padding: 0 8px;">${dayName}</td>`;
            columns.forEach(col => {
                if (col.type === 'ACTIVITY') {
                    if (dayIdx === 0) html += `<td rowspan="5" style="background: #e8f4f8; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; min-width: 90px; font-size: 0.75rem; font-weight: 900; color: #1e5f7a; text-transform: uppercase;">🎨<br>Activities</td>`;
                } else if (col.type === 'BREAK') {
                    if (dayIdx === 0) html += `<td rowspan="5" style="background: #f1f5f9; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; width: 65px; min-width: 65px; font-size: 0.7rem; font-weight: 900; color: #334155; text-transform: uppercase;">${col.name.split(' ').join('<br>')}</td>`;
                } else if (col.type === 'LESSON') {
                    const content = personalGrid[col.index][dayIdx]; // This is now an object {subject, classLabel}
                    const subject = content?.subject || '-';
                    const classLabel = content?.classLabel || '';
                    html += `<td style="padding:4px 2px; text-align:center; border: 1px solid #e2e8f0; background: ${content ? '#ffffff' : '#fcfcfc'}; min-width: 80px; vertical-align: middle;">
                        <div style="font-weight:700; font-size:0.7rem; color:#1e293b;">${subject}</div>
                        ${classLabel ? `<div style="font-size:0.65rem; color:#0f172a; font-weight:700; margin-top:2px;">${classLabel}</div>` : ''}
                    </td>`;
                }
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div></div>`;

        output.innerHTML = html;
    }

    function getBlockTimeHeaders(startTime, duration, lessonCount) {
        const headers = [];
        let currentTime = startTime || settings.startTime;
        for (let lesson = 1; lesson <= lessonCount; lesson++) {
            const endTime = addMinutes(currentTime, duration);
            headers.push({ lesson, startTime: currentTime, endTime });
            currentTime = endTime;
        }
        return headers;
    }

    function renderClassScheduleCard(tt) {
        const isSeniorClass = window.cbcUtils && window.cbcUtils.isSeniorGrade(tt.grade);
        const duration = isSeniorClass ? 40 : 35;
        const lessonCount = (tt.settings?.lessonsPerDay) || (isSeniorClass ? 9 : 8);
        const startTime = tt.settings?.startTime || settings.startTime;
        const headers = getBlockTimeHeaders(startTime, duration, lessonCount);
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        const displayStream = tt.stream ? ` ${tt.stream}` : '';
        const classLabel = `${tt.grade}${displayStream}`;

        let cardHtml = `
            <div class="tt-block-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; box-shadow:0 10px 25px rgba(15,23,42,0.04); min-width:320px; flex:1 1 320px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:10px;">
                    <div>
                        <div style="font-size:0.95rem; font-weight:800; color:#0f172a;">${classLabel}</div>
                        <div style="font-size:0.78rem; color:#475569; margin-top:4px;">${isSeniorClass ? 'Junior / Senior schedule' : 'Primary schedule'} • ${duration}-minute lessons</div>
                    </div>
                    <div style="font-size:0.75rem; color:#475569; background:#f8fafc; padding:4px 8px; border-radius:8px;">${tt.term || ''}</div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="marks-table" style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding:8px 10px; border-bottom:1px solid #e2e8f0; color:#334155; background:#f8fafc; min-width:130px;">DAY</th>
                                ${headers.map(header => `<th style="padding:8px 6px; border-bottom:1px solid #e2e8f0; text-align:center; color:#1e293b; font-weight:700; min-width:80px;">L${header.lesson}<br><span style="font-size:0.65rem; color:#475569;">${header.startTime}-${header.endTime}</span></th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${days.map((dayName, dayIdx) => {
                                const cells = headers.map((header, lessonIdx) => {
                                    const subject = tt.grid?.[lessonIdx]?.[dayIdx] || '';
                                    const teacherInfo = subject ? getTeacherForSubject(tt.grade, tt.stream, subject) : null;
                                    return `<td style="padding:8px 6px; border-bottom:1px solid #f1f5f9; border-right:1px solid #f1f5f9; min-width:80px; vertical-align:top; background:${subject ? '#f8fafc' : '#ffffff'};">
                                                <div style="font-weight:700; color:#0f172a;">${subject || '-'}</div>
                                                ${teacherInfo ? `<div style="margin-top:4px; font-size:0.65rem; color:#475569;">${teacherInfo.name}</div>` : ''}
                                            </td>`;
                                }).join('');
                                return `<tr><td style="padding:8px 10px; font-weight:800; color:#1e293b; background:#f8fafc; border-right:1px solid #e2e8f0;">${dayName}</td>${cells}</tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        return cardHtml;
    }

    async function renderSchoolBlockTimetable() {
        const output = document.getElementById('timetableOutput');
        const academicYear = document.getElementById('ttYearSelect').value;
        const term = document.getElementById('ttTermSelect')?.value || "Term 1";

        output.innerHTML = `<div style="text-align:center; padding:50px;"><div class="spinner"></div><p>Loading school block timetable...</p></div>`;

        selectedSwapSlot = null;

        await fetchSchedulingContext();
        const schoolType = getSchoolTypeKey();
        const schoolTimetables = allSavedTimetables.filter(tt => {
            const ttYear = tt.academicYear || tt.year;
            const matchesYear = ttYear ? Number(ttYear) === Number(academicYear) : true;
            const matchesTerm = tt.term ? tt.term === term : true;
            return matchesYear && matchesTerm && Array.isArray(tt.grid) && isGradeSupportedBySchoolType(tt.grade);
        });

        if (!schoolTimetables.length) {
            let message = `There are no saved timetables for ${term} ${academicYear}. Create and save class schedules first.`;
            if (schoolType === 'primary_junior') {
                message = `No saved class schedules found for grades 1-9 in this Primary + Junior school. Senior schedules are not available for this school type.`;
            }
            output.innerHTML = `<div style="padding:50px; text-align:center; color:#475569;"><h3 style="margin-bottom:10px; color:#0f172a;">No saved school timetables found</h3><p>${message}</p></div>`;
            currentTimetableData = { viewMode: 'block', term, academicYear, timetables: [] };
            return;
        }

        const sortedTimetables = schoolTimetables.sort((a, b) => {
            const orderA = window.cbcUtils.GRADE_ORDER.indexOf(window.cbcUtils.normalizeGrade(a.grade));
            const orderB = window.cbcUtils.GRADE_ORDER.indexOf(window.cbcUtils.normalizeGrade(b.grade));
            if (orderA !== -1 && orderB !== -1 && orderA !== orderB) return orderA - orderB;
            return (a.stream || '').localeCompare(b.stream || '');
        });

        const ttChunks = [];
        for (let i = 0; i < sortedTimetables.length; i += CLASSES_PER_PAGE) {
            ttChunks.push(sortedTimetables.slice(i, i + CLASSES_PER_PAGE));
        }

        // 🆕 Define column sequence including breaks for block alignment
        function getBlockCols(duration, lessonCount, customBreaks = null) {
            const cols = [];
            let cur = settings.startTime;
            const usedBreaks = customBreaks || settings.breaks;
            for (let l = 1; l <= lessonCount; l++) {
                const end = addMinutes(cur, duration);
                cols.push({ type: 'LESSON', lesson: l, startTime: cur, endTime: end });
                cur = end;
                usedBreaks.filter(b => b.afterLesson === l).forEach(b => {
                    cols.push({ type: 'BREAK', name: b.name, startTime: cur, endTime: addMinutes(cur, b.duration) });
                    cur = addMinutes(cur, b.duration);
                });
            }
            return cols;
        }

        const eyBreaks = [
            { name: "SHORT BREAK", afterLesson: 2, duration: 30 },
            { name: "LONG BREAK", afterLesson: 4, duration: 30 }
        ];
        const hasSeniorClasses = schoolTimetables.some(tt => window.cbcUtils?.isSeniorGrade(tt.grade));
        const eyCols = getBlockCols(30, 5, eyBreaks);
        const primaryCols = getBlockCols(35, 8);
        const juniorCols = getBlockCols(40, (schoolType === 'primary_junior' || !hasSeniorClasses) ? 8 : 9);
        const totalCols = Math.max(eyCols.length, primaryCols.length, juniorCols.length);

        const allColumnHeaders = Array.from({ length: totalCols }, (_, idx) => ({
            ey: eyCols[idx] || null,
            primary: primaryCols[idx] || null,
            junior: juniorCols[idx] || null
        }));

        const dayNames = ["MON", "TUE", "WED", "THU", "FRI"];
        const extraActivities = getSharedActivityOrder();

        let overallHtml = `
            <div class="no-print" style="margin-bottom:16px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; align-items:flex-start;">
                <button class="btn secondary-btn" id="downloadTimetablePDFBtn"><i class="fas fa-file-pdf"></i> Download Master PDF</button>
            </div>
        `;

        ttChunks.forEach((chunk, chunkIdx) => {
            const lessonCells = Array.from({ length: 5 }, () => Array.from({ length: totalCols }, () => []));
            
            chunk.forEach(tt => {
                    // 🆕 Use normalized grade label
                    const normalizedGrade = window.cbcUtils?.normalizeGrade(tt.grade) || tt.grade;
                    const gradeMatch = normalizedGrade.match(/\d+/);
                    const gradeLabel = (normalizedGrade.toUpperCase().startsWith('PP') || normalizedGrade.toUpperCase() === 'PG') ? normalizedGrade : (gradeMatch ? gradeMatch[0] : normalizedGrade);
                    const classLabel = `${gradeLabel}${tt.stream || ''}`.trim();

                    const subjectGrid = tt.grid || [];
                    subjectGrid.forEach((row, lessonIdx) => {
                        const lessonNum = lessonIdx + 1;
                        const colIdx = allColumnHeaders.findIndex(h => 
                            (h.ey?.type === 'LESSON' && h.ey?.lesson === lessonNum) ||
                            (h.primary?.type === 'LESSON' && h.primary?.lesson === lessonNum) ||
                            (h.junior?.type === 'LESSON' && h.junior?.lesson === lessonNum)
                        );

                        if (colIdx !== -1) {
                            row.forEach((subject, dayIdx) => {
                                if (!subject) return;
                                const teacherInfo = getTeacherForSubject(tt.grade, tt.stream, subject);
                                if (lessonCells[dayIdx] && lessonCells[dayIdx][colIdx]) {
                                    lessonCells[dayIdx][colIdx].push({
                                        classLabel,
                                        subject,
                                        teacherName: teacherInfo?.name || 'Unassigned'
                                    });
                                }
                            });
                        }
                    });
                });

            const rowsHtml = dayNames.map((dayName, dayIdx) => {
                let cellsHtml = lessonCells[dayIdx].map((entries, colIdx) => {
                    const h = allColumnHeaders[colIdx];
                    const isBreak = (h.ey?.type === 'BREAK' || h.primary?.type === 'BREAK' || h.junior?.type === 'BREAK');

                    if (isBreak) {
                        return `<td style="vertical-align:middle; text-align:center; padding:10px; border:1px solid #e2e8f0; background:#f8fafc; color:#94a3b8; font-weight:800; font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; min-width:80px;">BREAK</td>`;
                    }

                    const lNum = h.ey?.lesson || h.primary?.lesson || h.junior?.lesson;
                    const width = (lNum === 1 || lNum === 2) ? '230px' : '180px';

                    if (!entries.length) return `<td style="vertical-align:top; padding:10px; border:1px solid #e2e8f0; min-width:${width}; background:#ffffff;">-</td>`;
                    return `<td style="vertical-align:top; padding:10px; border:1px solid #e2e8f0; min-width:${width}; background:#f9fafb;">
                        ${entries.map(entry => `
                            <div style="border:1px solid #e2e8f0; border-radius:10px; padding:8px; margin-bottom:8px; background:#ffffff;">
                                <div style="font-size:0.72rem; font-weight:700; color:#0f172a;">${entry.classLabel}</div>
                                <div style="font-size:0.68rem; color:#475569; margin-top:4px; font-weight:700;">${entry.subject}</div>
                                <div style="font-size:0.65rem; color:#64748b; margin-top:2px; line-height:1.3;">${entry.teacherName}</div>
                            </div>
                        `).join('')}
                    </td>`;
                }).join('');

                const isFriday = dayIdx === 4;
                const activityName = isFriday ? "GENERAL CLEANING" : (extraActivities[dayIdx] || "GAMES & SPORTS");
                cellsHtml += `<td style="vertical-align:top; padding:10px; border:1px solid #e2e8f0; min-width:180px; background:#f1f5f9;">
                    <div style="border:1px solid #e2e8f0; border-radius:10px; padding:8px; margin-bottom:8px; background:#ffffff;">
                        <div style="font-size:0.72rem; font-weight:700; color:#0f172a;">SCHOOL ACTIVITIES</div>
                        <div style="font-size:0.68rem; color:#475569; margin-top:4px; font-weight:700;">${activityName}</div>
                        <div style="font-size:0.65rem; color:#64748b; margin-top:2px; line-height:1.3;">School-wide</div>
                    </div>
                </td>`;

                return `<tr><td style="padding:10px; border:1px solid #e2e8f0; background:#f8fafc; font-weight:800; color:#1e293b; text-transform:uppercase;">${dayName}</td>${cellsHtml}</tr>`;
            }).join('');

            let tableHeaders = allColumnHeaders.map((header, index) => {
                const ey = header.ey;
                const p = header.primary;
                const j = header.junior;
                const isBreak = (ey?.type === 'BREAK' || p?.type === 'BREAK' || j?.type === 'BREAK');
                const title = isBreak ? "" : `Lesson ${ey?.lesson || p?.lesson || j?.lesson}`; // Hide "BREAK/LUNCH" in on-screen header too
                const eyTime = ey ? `${ey.startTime}-${ey.endTime}` : '--';
                const pTime = p ? `${p.startTime}-${p.endTime}` : '--';
                const jTime = j ? `${j.startTime}-${j.endTime}` : '--';
                const bgColor = isBreak ? '#f1f5f9' : '#eef2ff';
                const textColor = isBreak ? '#475569' : '#0f172a';
                let colWidth = isBreak ? '80px' : '180px';
                
                // 🆕 Increase width for first two lessons to accommodate teacher names
                const lNum = ey?.lesson || p?.lesson || j?.lesson;
                if (!isBreak && (lNum === 1 || lNum === 2)) {
                    colWidth = '230px'; 
                }
                const displayTitle = isBreak ? title.split(' ').join('<br>') : title;

                return `<th style="padding:10px; border:1px solid #e2e8f0; background:${bgColor}; min-width:${colWidth}; text-align:center;">
                            <div style="font-weight:700; color:${textColor}; line-height: 1.2;">${displayTitle}</div>
                            <div style="font-size:0.72rem; color:#0f172a; font-weight:800; margin-top:4px; line-height:1.2;">
                                <div>${eyTime} (EY)</div>
                                <div>${pTime} (P)</div>
                                <div>${jTime} (J)</div>
                            </div>
                        </th>`;
            }).join('');

            tableHeaders += `<th style="padding:10px; border:1px solid #e2e8f0; background:#e8f4f8; min-width:180px; text-align:center;">
                            <div style="font-weight:700; color:#1e5f7a;">ACTIVITIES</div>
                        </th>`;

            overallHtml += `
                <div class="tt-print-page" style="margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px dashed #e2e8f0;">
                    <div style="text-align: center; margin-bottom: 10px;">
                        <h2 style="margin: 0; font-size: 1.35rem; text-transform: uppercase; color: #0f172a;">${(schoolInfo?.name || 'School Name').toUpperCase()}</h2>
                        <h3 style="margin: 5px 0 0; font-size: 1.1rem; color: #334155;">MASTER BLOCK TIMETABLE (PART ${chunkIdx + 1} OF ${ttChunks.length}) - ${term} ${academicYear}</h3>
                    </div>
                    <div class="tt-grid-container" style="overflow-x:auto;">
                        <table class="marks-table" style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="padding:10px; border:1px solid #e2e8f0; background:#f8fafc; min-width:160px;">DAY / LESSON</th>
                                    ${tableHeaders}
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        output.innerHTML = overallHtml;

        currentTimetableData = {
            viewMode: 'block',
            term,
            academicYear: Number(academicYear),
            timetables: schoolTimetables
        };
    }

    function renderGrid(grade, stream = "", generateNew = true, pathway = "") {
        const output = document.getElementById('timetableOutput');
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        const isSenior = window.cbcUtils && window.cbcUtils.isSeniorGrade(grade);
        const pathwayFromUI = window.cbcUtils?.normalizePathway?.(document.getElementById('ttPathwaySelect')?.value || "") || (document.getElementById('ttPathwaySelect')?.value || "");
        const pathwayValue = isSenior ? (window.cbcUtils?.normalizePathway?.(pathway) || pathwayFromUI || window.cbcUtils?.normalizePathway?.(currentTimetableData?.pathway || "") || (currentTimetableData?.pathway || "")) : "";
        const academicYear = document.getElementById('ttYearSelect').value;
        const term = document.getElementById('ttTermSelect')?.value || "Term 1";
        const selectedStream = stream || document.getElementById('ttStreamSelect')?.value || "";
        
        const gradeMatch = (grade || "").match(/\d+/);
        const gradeNum = gradeMatch ? parseInt(gradeMatch[0]) : 0;
        const isEarlyYears = grade && (grade.toUpperCase().includes('PP') || grade.toUpperCase() === 'PG');
        const isPrimary = (gradeNum >= 1 && gradeNum <= 6) || isEarlyYears;
        const isJunior = gradeNum >= 7 && gradeNum <= 9;

        // Get frequencies for this grade and strictly filter them to the selected pathway
        const freqs = Object.fromEntries(
            Object.entries(lessonFrequencies[grade] || {}).filter(([sub]) => isSubjectAllowedForPathway(sub, grade, pathwayValue))
        );

        // 1. GENERATE ASSIGNMENTS (Skip if just refreshing for a manual edit)
        if (generateNew) selectedSwapSlot = null; // 🆕 Clear swap selection on fresh generation

        let grid = generateNew ? [] : (currentTimetableData?.grid || []);
        if (isSenior && pathwayValue) {
            grid = sanitizeGridForPathway(grid, grade, pathwayValue);
        }
        if (generateNew) {
            // 🆕 Initialize empty 2D grid and local frequency tracker
            grid = Array.from({ length: settings.lessonsPerDay }, () => Array(5).fill(""));
            const freqsCopy = { ...freqs };
            const subjectsScheduledToday = [new Set(), new Set(), new Set(), new Set(), new Set()];
            const daysWithDoubles = new Set(); // Track days that already received a double lesson

            // 🆕 Strict Double Lesson Rule: Only ONE double block per subject per week
            if (placementRules.doubleLessons.enabled) {
                const subjectsWithDoubles = placementRules.doubleLessons.subjects;

                subjectsWithDoubles.forEach(subName => {
                    const blockCount = getDoubleLessonBlockCount(subName);
                    if (!blockCount || freqsCopy[subName] < 2) return;

                    let placedBlocks = 0;
                    const requiredLessons = blockCount * 2;
                    if (freqsCopy[subName] < requiredLessons) return;

                    // 🆕 Specialized day ordering: Prioritize early week for lab/practical subjects
                    const earlyWeekPriority = ["Integrated Science", "Agriculture"];
                    let dayOrder = [0, 1, 2, 3, 4];
                    if (!earlyWeekPriority.includes(subName)) {
                        dayOrder.sort(() => Math.random() - 0.5);
                    }
                    // 🆕 Refined Double Lesson Constraints:
                    // Avoid early morning (L1-L4).
                    // Allow L5-L6 (Mid-day) or Lesson 7 and beyond.
                    let validPairs = [ [4, 5], [6, 7], [7, 8] ];
                    validPairs.sort(() => Math.random() - 0.5);

                    for (const d of dayOrder) {
                        if (daysWithDoubles.has(d)) continue; // Inhibit multiple doubles per day

                        for (const [l1, l2] of validPairs) {
                            if (l1 >= settings.lessonsPerDay || l2 >= settings.lessonsPerDay) continue;
                            if (grid[l1][d] || grid[l2][d]) continue; // Ensure slots are empty

                            const t = getTeacherForSubject(grade, stream, subName);
                            if (!isTeacherBusy(t?.id, d, l1, grade, stream) && !isTeacherBusy(t?.id, d, l2, grade, stream)) {
                                grid[l1][d] = subName;
                                grid[l2][d] = subName;
                                subjectsScheduledToday[d].add(subName);
                                freqsCopy[subName] -= 2; // Ensure remaining lessons are single
                                placedBlocks += 1;
                                daysWithDoubles.add(d);
                                break;
                            }
                        }
                        if (placedBlocks >= blockCount) break;
                    }
                });
            }

            // 🆕 Step 2.1: Pre-place PPI on Friday Morning (Highly restricted)
            if (placementRules.ppiPreference.enabled && freqsCopy["PPI"] > 0) {
                const t = getTeacherForSubject(grade, stream, "PPI");
                const possible = [{l:0, d:4}, {l:1, d:4}, {l:2, d:4}, {l:3, d:4}]; // Friday L1-L4
                for(const slot of possible) {
                    if (slot.l >= settings.lessonsPerDay) continue;
                    if (!isTeacherBusy(t?.id, slot.d, slot.l, grade, stream)) {
                        grid[slot.l][slot.d] = "PPI";
                        subjectsScheduledToday[slot.d].add("PPI");
                        freqsCopy["PPI"]--;
                        break;
                    }
                }
            }

            // 🆕 Step 2.2: Priority placement for PE / Sports in morning slots
            if (placementRules.sportsPreference.enabled) {
                const preferredMorningSubjects = Object.keys(freqsCopy)
                    .filter(sub => isMorningPreferredSubject(sub))
                    .sort((a, b) => freqsCopy[b] - freqsCopy[a]);

                preferredMorningSubjects.forEach(subName => {
                    if (freqsCopy[subName] <= 0) return;
                    const morningSlots = [];
                    for (let l = 0; l < 4; l++) {
                        for (let d = 0; d < 5; d++) {
                            if (!grid[l][d]) morningSlots.push({ l, d });
                        }
                    }
                    morningSlots.sort(() => Math.random() - 0.5);

                    const teacherInfo = getTeacherForSubject(grade, stream, subName);
                    for (const slot of morningSlots) {
                        if (freqsCopy[subName] <= 0) break;
                        if (subjectsScheduledToday[slot.d].has(subName) && freqs[subName] <= 5) continue;
                        if (isTeacherBusy(teacherInfo?.id, slot.d, slot.l, grade, stream)) continue;

                        grid[slot.l][slot.d] = subName;
                        subjectsScheduledToday[slot.d].add(subName);
                        freqsCopy[subName]--;
                    }
                });
            }

            // 🆕 Step 2.3: Priority placement for Core Subjects (Guarantees frequencies)
            if (placementRules.coreSubjectsPreference.enabled) {
                const coreSubjects = placementRules.coreSubjectsPreference.subjects;
                // Identify core subjects in the remaining frequencies
                const coreSubList = Object.keys(freqsCopy).filter(sub => 
                    coreSubjects.some(c => sub.toLowerCase().includes(c.toLowerCase()))
                ).sort((a, b) => freqsCopy[b] - freqsCopy[a]); // Prioritize higher frequency

                coreSubList.forEach(subName => {
                    const teacherInfo = getTeacherForSubject(grade, stream, subName);
                    
                    // Priority slots: Morning (L1-L3)
                    let morningSlots = [];
                    for(let l=0; l<3; l++) {
                        for(let d=0; d<5; d++) {
                            if (grid[l][d]) continue;
                            morningSlots.push({l, d});
                        }
                    }
                    morningSlots.sort(() => Math.random() - 0.5);

                    for (const slot of morningSlots) {
                        if (freqsCopy[subName] <= 0) break;
                        if (grid[slot.l][slot.d]) continue;
                        if (subjectsScheduledToday[slot.d].has(subName) && freqs[subName] <= 5) continue;
                        if (isTeacherBusy(teacherInfo?.id, slot.d, slot.l, grade, stream)) continue;
                        
                        grid[slot.l][slot.d] = subName;
                        subjectsScheduledToday[slot.d].add(subName);
                        freqsCopy[subName]--;
                    }

                    // Secondary slots for overflow if allowed (L4+)
                    if (freqsCopy[subName] > 0) {
                        let otherSlots = [];
                        for(let l=3; l<settings.lessonsPerDay; l++) {
                            if (placementRules.coreSubjectsPreference.beforeLesson4Only && l >= 4) continue;
                            for(let d=0; d<5; d++) {
                                if (grid[l][d]) continue;
                                otherSlots.push({l, d});
                            }
                        }
                        otherSlots.sort(() => Math.random() - 0.5);
                        for (const slot of otherSlots) {
                            if (freqsCopy[subName] <= 0) break;
                            if (grid[slot.l][slot.d]) continue;
                            if (isTeacherBusy(teacherInfo?.id, slot.d, slot.l, grade, stream)) continue;
                            
                            grid[slot.l][slot.d] = subName;
                            subjectsScheduledToday[slot.d].add(subName);
                            freqsCopy[subName]--;
                        }
                    }
                });
            }

            const subjectPool = [];
            Object.entries(freqsCopy).forEach(([sub, count]) => {
                for(let i=0; i<count; i++) subjectPool.push(sub);
            });
            
        // Shuffle pool
        let pool = [...subjectPool].sort(() => Math.random() - 0.5);

        for (let lesson = 1; lesson <= settings.lessonsPerDay; lesson++) {
            const lIdx = lesson - 1;
            const isMorning = lesson <= 4; 
            const isBeforeLesson4 = lesson < 4;

            for (let day = 0; day < 5; day++) {
                if (grid[lIdx][day]) continue; // Skip slots already filled by pre-scheduled doubles
                let subject = "";
                const isFridayMorning = (day === 4 && lesson <= 4); // Friday is day index 4, morning lessons are 1-4

                if (!subject) {
                for (let i = 0; i < pool.length; i++) {
                    const candidate = pool[i];

                    // 🆕 Primary School Constraint: Prevent double lessons (no consecutive same subjects)
                    if (isPrimary && lIdx > 0 && grid[lIdx - 1][day] === candidate) continue;

                    const cType = getSubjectType(candidate);
                    const freq = freqs[candidate] || 0;

                    // 🆕 Constraint: No Technical subjects immediately after Sports/PE
                    if (lIdx > 0 && cType === "TECHNICAL") {
                        const prevSub = grid[lIdx - 1][day];
                        if (prevSub) {
                            const isPrevSports = prevSub.toLowerCase().includes("sports") || 
                                                 prevSub.toLowerCase().includes("physical education") ||
                                                 prevSub === "Physical Health Education";
                            if (isPrevSports) continue;
                        }
                    }

                    if (placementRules.ppiPreference.enabled && candidate === "PPI") {
                        if (placementRules.ppiPreference.fridayMorningOnly && !isFridayMorning) continue;
                    }

                    if (placementRules.creativePreference.enabled && cType === "ACTIVITY") {
                        if (placementRules.creativePreference.afternoonOnly && isMorning) continue;
                        if (subjectsScheduledToday[day].has(candidate)) continue;
                    }
                    
                    // 🆕 STRICT Core subjects constraint (Never after Lesson 3) - case insensitive
                    const isCoreSubject = placementRules.coreSubjectsPreference.subjects.some(c => candidate.toLowerCase().includes(c.toLowerCase()));
                    if (placementRules.coreSubjectsPreference.enabled && isCoreSubject && lesson >= 4) continue;

                    if (freq <= 5 && subjectsScheduledToday[day].has(candidate)) continue;

                    // 🆕 Strict once-per-day rule for single-frequency subjects
                    if (freq <= 5 && subjectsScheduledToday[day].has(candidate)) continue;

                    // 🆕 Placement Preference Check
                    const pref = (subjectPlacements[grade] || {})[candidate] || "any";
                    if (pref === "before4" && lesson > 4) continue;
                    if (pref === "before6" && lesson > 6) continue;
                    if (pref === "after6" && lesson <= 6) continue;

                    const teacherInfo = getTeacherForSubject(grade, stream, candidate);
                    if (isTeacherBusy(teacherInfo?.id, day, lesson - 1, grade, stream)) continue;

                    // 🆕 Refined Core & Technical Subjects Logic:
                    if (placementRules.technicalSubjectsPreference.enabled) {
                        // 1. Morning Priority (L1-4): Prioritize "High Focus" (Core & Technical) subjects.
                        // Skip Standard/Creative types if these are still available in the pool.
                        if (placementRules.technicalSubjectsPreference.preferMorning && isMorning && cType !== "TECHNICAL" && cType !== "CORE") {
                            if (pool.some(p => getSubjectType(p) === "TECHNICAL" || getSubjectType(p) === "CORE")) continue;
                        }
                        // 2. Mid-day Avoidance (L5-6): These slots are "Full" with Creative/Sports. 
                        // Push Technical subjects to afternoon (L7+) instead.
                        if ((lesson === 5 || lesson === 6) && cType === "TECHNICAL") {
                            if (pool.some(p => getSubjectType(p) !== "TECHNICAL")) continue;
                        }
                    }

                    subject = candidate;
                    subjectsScheduledToday[day].add(subject);
                    pool.splice(i, 1);
                    break;
                }
                }
                
                // 🆕 Final check for strict placement
                if (subject) {
                    grid[lIdx][day] = subject;
                } else if (pool.length > 0) {
                    // 🆕 Refined Fallback: Check for duplicates, core rules, and teacher availability
                    const isAfterLesson3 = lesson >= 4;
                    const fallbackIdx = pool.findIndex(p => {
                        // 1. Prevent non-essential repeats (The "Once a day" logic)
                        const freq = freqs[p] || 0;
                        if (freq <= 5 && subjectsScheduledToday[day].has(p)) return false;
                        if (freq <= 5 && subjectsScheduledToday[day].has(p)) return false;

                        // 2. Respect Core Subject placement rules (No core subjects in the afternoon)
                        const isCore = placementRules.coreSubjectsPreference.subjects.some(c => p.toLowerCase().includes(c.toLowerCase()));
                        if (placementRules.coreSubjectsPreference.enabled && isCore && isAfterLesson3) return false;

                        // 3. Prevent teacher clashes in fallback
                        const teacherInfo = getTeacherForSubject(grade, stream, p);
                        if (isTeacherBusy(teacherInfo?.id, day, lIdx, grade, stream)) return false;

                        return true;
                    });

                    if (fallbackIdx !== -1) {
                        const finalSub = pool.splice(fallbackIdx, 1)[0];
                        grid[lIdx][day] = finalSub;
                        subjectsScheduledToday[day].add(finalSub);
                    }
                    // If fallbackIdx is -1, it means it's after lunch and ONLY core subjects are left.
                    // We leave the slot empty to respect the strict pedagogical rule.
                }
            }
        }
        }

        // 2. DEFINE COLUMNS (Time slots and breaks)
        const columns = [];
        let currentTime = settings.startTime;

        settings.breaks.filter(b => b.afterLesson === 0 && b.name !== 'WRAP UP').forEach(b => {
            columns.push({ type: 'BREAK', name: b.name, startTime: currentTime, duration: b.duration });
            currentTime = addMinutes(currentTime, b.duration);
        });

        for (let l = 1; l <= settings.lessonsPerDay; l++) {
            const nextTime = addMinutes(currentTime, settings.lessonDuration);
            columns.push({ type: 'LESSON', index: l - 1, startTime: currentTime, endTime: nextTime });
            currentTime = nextTime;
            
            settings.breaks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                columns.push({ type: 'BREAK', name: b.name, startTime: currentTime, duration: b.duration });
                currentTime = addMinutes(currentTime, b.duration);
            });
        }

        // 🆕 Activities Period after 3:30 PM for Junior
        // Use the shared activity order across all generated timetables
        const extraActivities = getSharedActivityOrder();

        if (!isSenior) columns.push({ type: 'EXTRA_ACTIVITY', startTime: '15:30', endTime: '16:30' });

        // 3. RENDER HTML (Days as Rows, Time as Columns)
        const totalCols = columns.length + 1;
        let html = `
            <div class="tt-print-page">
                <div style="text-align: center; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                    <h2 style="margin: 0; text-transform: uppercase; font-weight: 900; letter-spacing: 1px; color: #0f172a; font-size: 1.3rem;">${(schoolInfo?.name || 'School Name').toUpperCase()}</h2>
                </div>
                <div class="no-print" style="display:flex; justify-content:flex-end; gap:10px; margin-bottom: 10px; flex-wrap: wrap;">
                    <button class="btn secondary-btn" id="downloadTimetablePDFBtn"><i class="fas fa-file-pdf"></i> Download PDF</button>
                    <button class="btn secondary-btn" id="reshuffleActivitiesBtn"><i class="fas fa-random"></i> Reshuffle Activities</button>
                    <button class="btn secondary-btn" id="autoFixClashesBtn" style="background:#fff7ed; color:#c2410c; border-color:#fed7aa;"><i class="fas fa-magic"></i> Auto-Fix Clashes</button>
                    <button class="btn primary-btn" id="saveTimetableToPortalBtn" style="background:#166534;"><i class="fas fa-save"></i> Save to Portal</button>
                </div>
                <div class="tt-grid-container" style="overflow-x:auto;">
                    <table class="marks-table" style="width:100%; border-collapse: collapse; border: 1px solid #cbd5e1; table-layout: auto;">

                    <thead style="background: #ffffff; font-size: 0.75rem;">
                        <tr style="background: #ffffff;">
                            <th colspan="${totalCols}" style="padding: 15px; border-bottom: 1px solid #94a3b8; text-align: center;">
                                <h3 style="margin:0; text-transform: uppercase; font-weight: 900; font-size: 1.15rem; color: #0f172a;">${grade}${stream ? ` ${stream}` : ''} WEEKLY TIMETABLE ${pathwayValue ? `(${pathwayValue})` : ''} - ${term} ${academicYear}</h3>
                            </th>
                        </tr>
                        <tr>
                            <th style="width:100px; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 800; background: #f8fafc;">DAY / TIME</th>
                            ${columns.map(col => {
                                if (col.type === 'BREAK') return `<th style="background:#f8fafc; color:#0f172a; font-size:0.75rem; width: 65px; font-weight: 900;">${col.startTime}</th>`;
                                if (col.type === 'EXTRA_ACTIVITY') return `<th style="text-align:center; background:#f1f5f9; color: #1e293b; font-weight: 800; font-size:0.65rem;">ACTIVITIES</th>`;
                                return `<th style="text-align:center; color: #1e293b; font-weight: 700;"><div style="line-height:1.2;">Lesson ${col.index + 1}<br><span style="font-size:0.75rem; color:#0f172a; font-weight:600;">${col.startTime} to ${col.endTime}</span></div></th>`;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>`;

        days.forEach((dayName, dayIdx) => {
            html += `<tr style="height: 60px;">
                <td style="font-size:0.75rem; color:#1e293b; font-weight:800; background:#f8fafc; border-right:1px solid #cbd5e1; width:100px; padding: 0 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${dayName}</span>
                        <button class="tt-reset-day-btn no-print" data-day="${dayIdx}" title="Reset/Reshuffle this day" 
                                style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:0.7rem; padding:2px; transition:color 0.2s;">
                            <i class="fas fa-undo-alt"></i>
                        </button>
                    </div>
                </td>`;
            
            columns.forEach(col => {
                if (col.type === 'BREAK') {
                    if (dayIdx === 0) {
                        html += `
                            <td rowspan="5" style="background: #f1f5f9; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; width: 65px; min-width: 65px; padding: 10px 2px;">
                                <div style="font-size: 0.7rem; font-weight: 900; color: #334155; letter-spacing: 1px; text-transform: uppercase; line-height: 1.4;">
                                    ${col.name.split(' ').join('<br>')}
                                </div>
                            </td>`;
                    }
                } else if (col.type === 'EXTRA_ACTIVITY') {
                    const isFriday = dayIdx === 4;
                    const act = isFriday ? "GENERAL CLEANING" : (extraActivities[dayIdx] || "GAMES & SPORTS");
                    html += `
                        <td style="padding:4px 2px; text-align:center; border: 1px solid #cbd5e1; background: #f1f5f9; min-width: 90px; vertical-align: middle;">
                            <div style="font-weight:900; font-size:0.65rem; color:#334155; letter-spacing:0.5px; text-transform:uppercase;">${act}</div>
                        </td>`;
                } else if (col.type === 'LESSON') {
                    const subject = grid[col.index][dayIdx];
                    const teacherInfo = getTeacherForSubject(grade, stream, subject);
                    const isClash = isTeacherBusy(teacherInfo?.id, dayIdx, col.index, grade, stream);
                    const bgColor = getSubjectColor(subject);
                    const clashStyle = isClash ? "border: 2px solid #ef4444; background: #fff1f2; box-shadow: inset 0 0 5px rgba(239, 68, 68, 0.2);" : "";

                    const isSpecialSubject = subject === "PPI";

                    html += `
                        <td class="tt-editable-slot" 
                            data-day="${dayIdx}" data-lesson="${col.index}"
                            title="Click to manually adjust this slot"
                            style="padding:4px 2px; text-align:center; border: 1px solid #e2e8f0; background: ${bgColor}; ${clashStyle}; min-width: 80px; cursor: pointer; transition: all 0.15s ease;">
                            <div style="font-weight:700; font-size:0.7rem; color:#1e293b; pointer-events:none;">${subject || '-'}</div>
                            <div style="font-size:0.6rem; color:#64748b; margin-top:2px; pointer-events:none;">
                                ${isSpecialSubject ? '' : (teacherInfo ? teacherInfo.name : (subject ? '<em>Unassigned</em>' : ''))}
                                ${(!isSpecialSubject && isClash) ? '<br><span style="color:#ef4444; font-weight:bold;">⚠️ CLASH</span>' : ''}
                            </div>
                        </td>`;
                }
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;

        // 🆕 Embed placement rules into the settings snapshot for saving
        const settingsToSave = JSON.parse(JSON.stringify(settings));
        settingsToSave.subjectPlacements = subjectPlacements[grade] || {};

        const sanitizedGrid = isSenior && pathwayValue ? sanitizeGridForPathway(grid, grade, pathwayValue) : grid;
        currentTimetableData = {
            viewMode: 'class',
            grade,
            stream: selectedStream,
            term,
            pathway: pathwayValue || null,
            academicYear: Number(academicYear),
            lessonFrequencies: freqs,
            extraActivities, // 🆕 Store persisted activities order
            settings: settingsToSave,
            grid: sanitizedGrid
        };

        output.innerHTML = html + `</div>`;
    }

    // Helper functions for logic
    function addMinutes(time, mins) {
        return minutesToTime(timeToMinutes(time) + mins);
    }

    function getSubjectColor(sub) {
        if (!sub) return "transparent";
        const colors = {
            "Mathematics": "#eff6ff", // Blue
            "English": "#f0fdf4",     // Green
            "Kiswahili": "#fff7ed",   // Orange
            "Integrated Science": "#f5f3ff", // Purple
            "Creative Arts": "#fff1f2", // Rose
            "Sports C/A(s)": "#fff1f2",
            "Visual Arts C/A(v)": "#fff1f2",
            "Performing Arts C/A(p)": "#fff1f2",
            "Christian Religious Education": "#fffbeb", // Amber
            "Physics": "#ecfeff",     // Cyan
            "Chemistry": "#f0fdfa",   // Teal
            "Biology": "#fdf2f8",     // Pink
            "History & Citizenship": "#fff7ed",
            "Geography": "#f0fdf4",
            "Business Studies": "#faf5ff",
            "Agriculture": "#f7fee7",  // Lime
            "Pre-Technical Studies": "#f8fafc", // Slate
            "PPI": "#fffbeb",
            "Social Studies": "#f0fdf4"
        };
        return colors[sub] || "#f9fafb";
    }

    return { init };
})();
window.TimetableModule = TimetableModule;