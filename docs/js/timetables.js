// docs/js/timetables.js
const TimetableModule = (function() {
    let isInitialized = false;
    
    // Default Academic Structure (Can be moved to Backend later)
    const CLASSES_PER_PAGE = 30; // Number of classes to display per page/section in block view (mon-fri fit)

    let schoolAllocations = []; // To store all teacher assignments for clash detection
    let allSavedTimetables = []; // To store schedules for other grades
    let currentTimetableData = null; // 🆕 To store the generated snapshot for saving
    let sharedActivityOrder = null; // 🆕 Shared activities order across grades
    let activeEditSlot = null; // 🆕 Tracks { dayIdx, lessonIdx } during manual edits

    /**
     * 🆕 Categorizes subjects for intelligent placement
     */
    function getSubjectType(sub) {
        return SUBJECT_DATA.getSubjectType(sub);
    }

    /**
     * 🆕 Provides default weekly frequencies for subjects
     */
    function getDefaultFrequency(sub) {
        return SUBJECT_DATA.getDefaultFrequency(sub);
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
            { name: "BREAK", afterLesson: 4, duration: 30 },
            { name: "LUNCH", afterLesson: 6, duration: 60 }
        ],
        schoolDayEnd: "17:05" // Standard CBE end time
    };

    // 🆕 Placement Rules Configuration for intelligent subject scheduling
    let placementRules = {
        // Core Subjects (Math, English, Kiswahili) - prefer before lunch
        coreSubjectsPreference: {
            enabled: true,
            beforeLunchOnly: true,
            subjects: ["Mathematics", "English", "Kiswahili"]
        },
        // Technical subjects - reduce afternoon placement
        technicalSubjectsPreference: {
            enabled: true,
            preferMorning: true,
            allowAfternoon: false // If true, allows afternoon placement; if false, minimizes it
        },
        // PE - only after lunch
        pePreference: {
            enabled: true,
            onlyAfterLunch: true,
            avoidConsecutiveDays: true
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
        }
    };

    // 🆕 School Info for grade population and branding
    let schoolInfo = null;
    const SCHOOL_TYPES = {
        full: {
            label: "Full School (Grades 1-12)",
            gradeOptions: ["1","2","3","4","5","6","7","8","9","10","11","12"]
        },
        primary_junior: {
            label: "Primary + Junior (Grades 1-9)",
            gradeOptions: ["1","2","3","4","5","6","7","8","9"]
        },
        senior: {
            label: "Senior School (Grades 10-12)",
            gradeOptions: ["10","11","12"]
        }
    };

    function getSchoolTypeKey() {
        return (schoolInfo && schoolInfo.schoolType && SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
    }

    function getGradeOptionsForSchool() {
        const schoolType = getSchoolTypeKey();
        return SCHOOL_TYPES[schoolType].gradeOptions.map(g => `Grade ${g}`);
    }

    function isGradeSupportedBySchoolType(grade) {
        const schoolType = getSchoolTypeKey();
        if (schoolType === 'primary_junior') {
            return !window.cbcUtils.isSeniorGrade(grade);
        }
        return true;
    }

    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
    const SCHOOL_INFO_CACHE_KEY = "timetable_school_info_cache";

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
        
        fetchSchoolInfoAndCache().then(async () => {
            setupUIStructure(); // 🆕 Prepend overlay inside this call
            populateDropdowns(); 
            
            // Dashboard is built but covered by the #ttInitOverlay
            await fetchSchedulingContext();
            
            // 🆕 Populate initial stream and teacher options now that context is loaded
            const gradeSelect = document.getElementById('ttGradeSelect');
            if (gradeSelect && gradeSelect.value) {
                updateStreamOptions(gradeSelect.value);
            }
            updateTeacherOptions();
            attachEventListeners();
            
            // 🆕 Remove the global overlay gracefully once fully ready
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 400);
            
            isInitialized = true;
        }).catch(err => {
            console.error("Error during timetable initialization:", err);
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
            `;
            document.head.appendChild(styleEl);
        }

        const container = document.getElementById('timetableTab');
        if (!container) return;

        container.style.position = 'relative'; // Required for absolute overlay

        container.innerHTML = `
            <div class="timetable-dashboard" style="display: grid; grid-template-columns: 280px 1fr; gap: 20px;">
                <aside class="tt-sidebar" style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <h4 style="margin-top:0; color: #1e293b;"><i class="fas fa-cogs"></i> Timetable Controls</h4>
                    
                    <div class="filter-group" style="margin-bottom: 15px;">
                        <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">VIEW MODE</label>
                        <select id="ttViewMode" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;">
                            <option value="class">Class Timetable</option>
                            <option value="teacher">Individual Teacher</option>
                            <option value="block">School Block Timetable</option>
                        </select>
                    </div>

                    <div class="filter-group" style="margin-bottom: 15px;">
                        <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">SELECT TERM</label>
                        <select id="ttTermSelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;">
                            <option value="Term 1">Term 1</option>
                            <option value="Term 2">Term 2</option>
                            <option value="Term 3">Term 3</option>
                        </select>
                    </div>

                    <div id="ttClassFiltersGroup">
                        <div class="filter-group" style="margin-bottom: 15px;">
                            <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">SELECT GRADE</label>
                            <select id="ttGradeSelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;"></select>
                        </div>

                        <div class="filter-group" id="ttStreamGroup" style="margin-bottom: 15px; display: none;">
                            <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">SELECT STREAM</label>
                            <select id="ttStreamSelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;"></select>
                        </div>

                        <div id="ttPathwayGroup" class="filter-group" style="margin-bottom: 20px; display: none;">
                            <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">SELECT PATHWAY</label>
                            <select id="ttPathwaySelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;">
                                <option value="STEM">STEM</option>
                                <option value="Social Sciences">Social Sciences</option>
                                <option value="Arts & Sports Science">Arts & Sports Science</option>
                            </select>
                        </div>
                    </div>

                    <div id="ttTeacherFiltersGroup" style="display:none;">
                        <div class="filter-group" style="margin-bottom: 15px;">
                            <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">SELECT TEACHER</label>
                            <select id="ttTeacherSelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;"></select>
                        </div>
                    </div>

                    <div id="ttBlockInfoGroup" style="display:none; margin-bottom: 20px; padding: 12px 14px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; color: #3730a3; font-size: 0.85rem; line-height: 1.5;">
                        <strong>School block timetable:</strong> displays saved class schedules across the school in a class-style PDF layout, with each class showing lesson-by-lesson subject and teacher details.
                    </div>

                    <div class="filter-group" style="margin-bottom: 20px;">
                        <label style="display:block; font-size: 0.8rem; font-weight:700; margin-bottom: 5px;">ACADEMIC YEAR</label>
                        <select id="ttYearSelect" class="form-control" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e0;"></select>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <button id="configureFrequenciesBtn" class="btn secondary-btn tt-class-only" style="width:100%; text-align:left;">
                            <i class="fas fa-list-ol"></i> Lesson Frequencies
                        </button>
                        <button id="configureSettingsBtn" class="btn secondary-btn" style="width:100%; text-align:left;">
                            <i class="fas fa-clock"></i> Day Schedule
                        </button>
                        <button id="ttRefreshBtn" class="btn secondary-btn" style="width:100%; text-align:left;">
                            <i class="fas fa-sync-alt"></i> Refresh Filters
                        </button>
                        <button id="configurePlacementRulesBtn" class="btn secondary-btn tt-class-only" style="width:100%; text-align:left;">
                            <i class="fas fa-sliders-h"></i> Placement Rules
                        </button>
                        <hr style="border:0; border-top:1px solid #e2e8f0; margin: 10px 0;">
                        <button id="generateTimetableBtn" class="btn primary-btn" style="width:100%; background:#334155; color:white; font-weight:700;">
                            <i class="fas fa-magic"></i> <span id="ttBtnText">Generate Timetable</span>
                        </button>
                    </div>
                </aside>

                <main class="tt-content">
                    <div id="ttWorkspace" class="dashboard-card" style="min-height: 500px; background:white; padding:20px; border-radius:12px; border: 1px solid #e2e8f0;">
                        <div id="ttPlaceholder" style="text-align:center; padding:100px 20px; color: #94a3b8;">
                            <i class="far fa-calendar-alt" style="font-size: 4rem; margin-bottom: 20px; display:block; opacity:0.5;"></i>
                            <h3>Ready to schedule?</h3>
                            <p>Select a grade and configure lesson counts to generate an optimized timetable.</p>
                        </div>
                        <div id="timetableOutput" style="display:none;"></div>
                    </div>
                </main>
            </div>

            <!-- Modal for Frequencies -->
            <div id="frequencyModal" class="modal hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; display:none; align-items:center; justify-content:center;">
                <div class="modal-content" style="background:white; padding:25px; border-radius:12px; width:90%; max-width:500px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
                    <h3 id="freqModalTitle">Subject Frequencies</h3>
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:20px;">Define how many lessons per week each subject should have.</p>
                    <div id="subjectFreqInputs" style="max-height: 400px; overflow-y:auto; margin-bottom:20px;"></div>
                    <div style="text-align:right;">
                        <button id="cancelFrequencyBtn" class="btn secondary-btn">Cancel</button>
                        <button id="saveFrequenciesBtn" class="btn primary-btn" style="background:#2b6cb0; color:white;">Save Frequencies</button>
                    </div>
                </div>
            </div>

            <!-- Modal for Day Schedule -->
            <div id="dayScheduleModal" class="modal hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:10000; display:none; align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div class="modal-content" style="background:white; padding:25px; border-radius:12px; width:90%; max-width:550px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
                    <h3>🕒 Day Schedule Configuration</h3>
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:20px;">Configure school hours, lesson lengths, and intervals for standard CBE structure.</p>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div><label style="display:block; font-size:0.75rem; font-weight:700;">START TIME (HH:MM)</label><input type="time" id="setStartTime" class="form-control" style="width:100%;"></div>
                        <div><label style="display:block; font-size:0.75rem; font-weight:700;">LESSON DURATION (MINS)</label><input type="number" id="setDuration" class="form-control" style="width:100%;" min="20" max="90"></div>
                        <div><label style="display:block; font-size:0.75rem; font-weight:700;">LESSONS PER DAY</label><input type="number" id="setLessonsCount" class="form-control" style="width:100%;" min="1" max="12"></div>
                        <div><label style="display:block; font-size:0.75rem; font-weight:700;">SCHOOL DAY END (HH:MM)</label><input type="time" id="setSchoolDayEnd" class="form-control" style="width:100%;"></div>
                    </div>

                    <h4 style="border-top:1px solid #e2e8f0; padding-top:15px;">Breaks & Intervals</h4>
                    <div id="breaksContainer" style="max-height: 180px; overflow-y:auto; margin-bottom:20px;"></div>

                    <div style="text-align:right;">
                        <button id="cancelScheduleBtn" class="btn secondary-btn">Cancel</button>
                        <button id="saveScheduleBtn" class="btn primary-btn" style="background:#2b6cb0; color:white;">Apply Schedule</button>
                    </div>
                </div>
            </div>

            <!-- Modal for Manual Slot Edit -->
            <div id="editSlotModal" class="modal hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10001; display:none; align-items:center; justify-content:center; backdrop-filter: blur(2px);">
                <div class="modal-content" style="background:white; padding:25px; border-radius:12px; width:90%; max-width:400px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                    <h3 style="margin-top:0;"><i class="fas fa-edit"></i> Adjust Lesson Slot</h3>
                    <p id="editSlotDetails" style="font-size:0.85rem; color:#64748b; margin-bottom:20px; padding:10px; background:#f8fafc; border-radius:8px; border-left:4px solid #334155;"></p>
                    
                    <div class="filter-group" style="margin-bottom: 25px;">
                        <label style="display:block; font-size: 0.75rem; font-weight:800; color:#475569; margin-bottom: 8px; text-transform:uppercase;">CHANGE SUBJECT TO:</label>
                        <select id="editSlotSubjectSelect" class="form-control" style="width:100%; padding:10px; border-radius:8px; border:2px solid #e2e8f0; font-weight:600; color:#1e293b;"></select>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <button id="cancelEditSlotBtn" class="btn secondary-btn" style="padding:10px;">Cancel</button>
                        <button id="saveSlotBtn" class="btn primary-btn" style="background:#334155; color:white; padding:10px; font-weight:700;">
                            <i class="fas fa-check-circle"></i> Update Slot
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal for Placement Rules Configuration -->
            <div id="placementRulesModal" class="modal hidden" style="position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:10000; display:none; align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div class="modal-content" style="background:white; padding:25px; border-radius:12px; width:90%; max-width:600px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
                    <h3>⚙️ Placement Rules & Scheduling Preferences</h3>
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:20px;">Configure how subjects are placed in the timetable to reflect your teaching preferences.</p>
                    
                    <div style="max-height: 400px; overflow-y:auto; margin-bottom:20px;">
                        <!-- Core Subjects -->
                        <div style="padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; border-left:4px solid #2563eb;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;">
                                <input type="checkbox" id="coreSubs_enabled" style="width:18px; height:18px; cursor:pointer;">
                                <span style="font-weight:700; color:#1e293b;">Core Subjects (Math, English, Kiswahili)</span>
                            </label>
                            <div style="margin-left:28px; color:#64748b; font-size:0.85rem;">
                                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                    <input type="checkbox" id="coreSubs_beforeLunch" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Schedule before lunch only (morning lessons)</span>
                                </label>
                            </div>
                        </div>

                        <!-- Technical Subjects -->
                        <div style="padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; border-left:4px solid #dc2626;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;">
                                <input type="checkbox" id="technical_enabled" style="width:18px; height:18px; cursor:pointer;">
                                <span style="font-weight:700; color:#1e293b;">Technical Subjects</span>
                            </label>
                            <div style="margin-left:28px; color:#64748b; font-size:0.85rem;">
                                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                    <input type="checkbox" id="technical_preferMorning" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Prefer morning lessons (reduces afternoon placement)</span>
                                </label>
                            </div>
                        </div>

                        <!-- PE -->
                        <div style="padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; border-left:4px solid #16a34a;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;">
                                <input type="checkbox" id="pe_enabled" style="width:18px; height:18px; cursor:pointer;">
                                <span style="font-weight:700; color:#1e293b;">Physical Education (PE)</span>
                            </label>
                            <div style="margin-left:28px; color:#64748b; font-size:0.85rem;">
                                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                    <input type="checkbox" id="pe_afterLunch" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Schedule only after lunch</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px;">
                                    <input type="checkbox" id="pe_noDays" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Avoid consecutive days</span>
                                </label>
                            </div>
                        </div>

                        <!-- PPI -->
                        <div style="padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; border-left:4px solid #7c3aed;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;">
                                <input type="checkbox" id="ppi_enabled" style="width:18px; height:18px; cursor:pointer;">
                                <span style="font-weight:700; color:#1e293b;">PPI</span>
                            </label>
                            <div style="margin-left:28px; color:#64748b; font-size:0.85rem;">
                                <label style="display:flex; align-items:center; gap:8px;">
                                    <input type="checkbox" id="ppi_friday" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Schedule on Friday mornings only</span>
                                </label>
                            </div>
                        </div>

                        <!-- Creative Subjects -->
                        <div style="padding:15px; background:#f8fafc; border-radius:8px; margin-bottom:15px; border-left:4px solid #ea580c;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;">
                                <input type="checkbox" id="creative_enabled" style="width:18px; height:18px; cursor:pointer;">
                                <span style="font-weight:700; color:#1e293b;">Creative Subjects</span>
                            </label>
                            <div style="margin-left:28px; color:#64748b; font-size:0.85rem;">
                                <label style="display:flex; align-items:center; gap:8px;">
                                    <input type="checkbox" id="creative_afternoon" style="width:16px; height:16px; cursor:pointer;">
                                    <span>Schedule in afternoon only</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div style="text-align:right; border-top:1px solid #e2e8f0; padding-top:15px;">
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
     * 🆕 Populates the teacher dropdown based on school allocations
     */
    function updateTeacherOptions() {
        const teacherSelect = document.getElementById('ttTeacherSelect');
        if (!teacherSelect) return;

        const currentSelection = teacherSelect.value;

        teacherSelect.innerHTML = '<option value="">-- Select Teacher --</option>';
        
        // 🆕 Filter unique teachers from allocations to ensure the list is clean and scoped
        const uniqueTeachers = [];
        const seenIds = new Set();
        
        schoolAllocations.forEach(t => {
            if (t._id && !seenIds.has(t._id)) {
                uniqueTeachers.push(t);
                seenIds.add(t._id);
            }
        });

        uniqueTeachers.sort((a, b) => a.name.localeCompare(b.name)).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t._id;
            opt.textContent = t.name;
            teacherSelect.appendChild(opt);
        });

        if (currentSelection && Array.from(teacherSelect.options).some(o => o.value === currentSelection)) {
            teacherSelect.value = currentSelection;
        }
    }

    async function fetchSchoolInfoAndCache() {
        try {
            const API_BASE = window.config.api.baseURL;
            const token = localStorage.getItem("token");
            const headers = { "Authorization": `Bearer ${token}` };

            // Attempt to load basic info from cache first for quick dropdown population
            const cachedBasicInfoStr = localStorage.getItem(SCHOOL_INFO_CACHE_KEY);
            if (cachedBasicInfoStr) {
                try {
                    const { timestamp, data: cachedBasicData } = JSON.parse(cachedBasicInfoStr);
                    if (Date.now() - timestamp < CACHE_TTL) {
                        // Set schoolInfo with basic data (no logo) for immediate dropdown use
                        schoolInfo = { ...cachedBasicData, logo: null, logoMimeType: null };
                        populateDropdowns();
                    }
                } catch (e) {
                    console.warn("Error parsing basic school info cache, clearing it.", e);
                    localStorage.removeItem(SCHOOL_INFO_CACHE_KEY);
                }
            }

            // Fetch school name and type (excluding logo as requested)
            const schoolRes = await fetch(`${API_BASE}/users/my-school?includeLogo=false`, { headers });
            if (schoolRes.ok) {
                const fullSchoolData = await schoolRes.json();
                schoolInfo = fullSchoolData; // Store full data in module-level variable

                // Create a lightweight version for localStorage caching (without the potentially large logo)
                const basicSchoolInfoToCache = { name: fullSchoolData.name, schoolType: fullSchoolData.schoolType };
                localStorage.setItem(SCHOOL_INFO_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: basicSchoolInfoToCache }));
                
                // 🆕 Update global module settings based on detected school type
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
        if (btn) btn.disabled = true;

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
            await fetchSchedulingContext();
            
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
            
            cbcUtils.showToast("Timetable dashboard refreshed.", "success");
        } catch (err) {
            console.error("Error refreshing timetable dashboard:", err);
            cbcUtils.showToast("Error refreshing dashboard. Try again.", "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function attachEventListeners() {
        document.getElementById('generateTimetableBtn')?.addEventListener('click', () => generateTimetable());
        // Handle the static "Save PDF" button in the dashboard header
        document.getElementById('printTimetableBtn')?.addEventListener('click', () => downloadTimetablePDF());

        document.getElementById('ttViewMode')?.addEventListener('change', (e) => {
            const mode = e.target.value;
            const isTeacherMode = mode === 'teacher';
            const isBlockMode = mode === 'block';

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

        document.getElementById('timetableOutput')?.addEventListener('click', (e) => {
            const saveBtn = e.target.closest('#saveTimetableToPortalBtn');
            if (saveBtn) saveTimetableToPortal();

            const downloadPdfBtn = e.target.closest('#downloadTimetablePDFBtn');
            if (downloadPdfBtn) downloadTimetablePDF(); // Handles button inside the generated grid

            const reshuffleActivitiesBtn = e.target.closest('#reshuffleActivitiesBtn');
            if (reshuffleActivitiesBtn) {
                reshuffleSharedActivities();
                if (currentTimetableData) {
                    renderGrid(currentTimetableData.grade, currentTimetableData.stream, false);
                }
                cbcUtils.showToast('Activities order reshuffled across grades.', 'success');
                return;
            }

            // 🆕 Manual Slot Edit Trigger
            const slot = e.target.closest('.tt-editable-slot');
            if (slot) {
                const day = parseInt(slot.dataset.day);
                const lesson = parseInt(slot.dataset.lesson);
                openEditSlotModal(day, lesson);
            }

            // 🆕 Reset Specific Day Trigger
            const resetBtn = e.target.closest('.tt-reset-day-btn');
            if (resetBtn) {
                resetDay(parseInt(resetBtn.dataset.day));
            }
        });

        document.getElementById('saveSlotBtn')?.addEventListener('click', () => saveSlotEdit());
        document.getElementById('cancelEditSlotBtn')?.addEventListener('click', () => {
            document.getElementById('editSlotModal').style.display = 'none';
        });

        document.getElementById('ttGradeSelect')?.addEventListener('change', (e) => {
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
        });
        
        document.getElementById('configureFrequenciesBtn')?.addEventListener('click', async () => {
            const grade = document.getElementById('ttGradeSelect').value;
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

        document.getElementById('saveFrequenciesBtn')?.addEventListener('click', () => {
            saveCurrentFrequencies();
            document.getElementById('frequencyModal').style.display = 'none';
            cbcUtils.showToast("Frequencies updated locally.", "success");
        });

        document.getElementById('cancelFrequencyBtn')?.addEventListener('click', () => {
            document.getElementById('frequencyModal').style.display = 'none';
        });

        document.getElementById('configureSettingsBtn')?.addEventListener('click', () => openDayScheduleModal());
        
        document.getElementById('ttRefreshBtn')?.addEventListener('click', () => {
            refreshTimetableDashboard();
        });

        document.getElementById('saveScheduleBtn')?.addEventListener('click', () => {
            if (saveDayScheduleSettings()) {
                document.getElementById('dayScheduleModal').style.display = 'none';
                cbcUtils.showToast("Day schedule updated.", "success");
            }
        });

        document.getElementById('cancelScheduleBtn')?.addEventListener('click', () => {
            document.getElementById('dayScheduleModal').style.display = 'none';
        });

        // 🆕 Placement Rules Event Listeners
        document.getElementById('configurePlacementRulesBtn')?.addEventListener('click', () => {
            openPlacementRulesModal();
        });

        document.getElementById('savePlacementRulesBtn')?.addEventListener('click', () => {
            savePlacementRules();
            document.getElementById('placementRulesModal').style.display = 'none';
            cbcUtils.showToast("Placement rules updated.", "success");
        });

        document.getElementById('cancelPlacementRulesBtn')?.addEventListener('click', () => {
            document.getElementById('placementRulesModal').style.display = 'none';
        });

        document.getElementById('resetPlacementRulesBtn')?.addEventListener('click', () => {
            resetPlacementRulesToDefaults();
            openPlacementRulesModal(); // Refresh the modal to show reset values
        });
    }

    /**
     * 🆕 Fetch all school-wide data required for clash detection
     */
    async function fetchSchedulingContext() {
        try {
            const API_BASE = window.config.api.baseURL;
            const token = localStorage.getItem("token");
            const headers = { "Authorization": `Bearer ${token}` };

            // 1. Fetch all subject allocations for the school
            const allocRes = await fetch(`${API_BASE}/users/subjects/allocations?limit=1000`, { headers });
            if (allocRes.ok) {
                const allocData = await allocRes.json();
                schoolAllocations = Array.isArray(allocData) ? allocData : allocData.data || [];
                console.log(`📡 Loaded ${schoolAllocations.length} teacher allocations for scheduling.`);
                
                // 🆕 After loading context, if a grade is already selected, update its streams
                const currentGrade = document.getElementById('ttGradeSelect')?.value;
                if (currentGrade) {
                    updateStreamOptions(currentGrade);
                }
                
                // 🆕 Always update teacher list so it's ready when switching modes
                updateTeacherOptions();
            }

            // 2. Fetch all currently saved timetables for this academic year
            const yearEl = document.getElementById('ttYearSelect');
            const year = yearEl ? yearEl.value : new Date().getFullYear();
            const termEl = document.getElementById('ttTermSelect');
            const term = termEl ? termEl.value : "Term 1";

            // 🆕 Ensure header is present for every scheduling request
            if (!token) return authService.redirectToLogin();

            // 🆕 Use both 'year' and 'academicYear' to ensure compatibility with backend controllers
            const ttRes = await fetch(`${API_BASE}/timetables/all?academicYear=${year}&year=${year}&term=${term}`, { headers });
            if (ttRes.ok) {
                const ttData = await ttRes.json();
                allSavedTimetables = Array.isArray(ttData) ? ttData : (ttData.timetables || ttData.data || []);
                console.log(`📡 Loaded ${allSavedTimetables.length} saved class timetables.`);
            }
        } catch (err) {
            console.error("Failed to fetch scheduling context:", err);
        }
    }

    /**
     * 🆕 Extracts unique subjects allocated to a grade from the backend data
     */
    function getAllocatedSubjectsForGrade(grade, stream = "") {
        const subjects = new Set();
        // Use centralized normalization for consistent matching between UI and DB
        const normalizedTarget = (window.cbcUtils?.normalizeGrade(grade) || grade).toLowerCase().trim();
        const streamTarget = (stream || "").toLowerCase().trim();

        schoolAllocations.forEach(teacher => {
            (teacher.allocations || []).forEach(alloc => {
                const allocGrade = (window.cbcUtils?.normalizeGrade(alloc.grade) || alloc.grade).toLowerCase().trim();
                const allocStream = (alloc.stream || "").toLowerCase().trim();
                
                if (allocGrade === normalizedTarget && allocStream === streamTarget) {
                    (alloc.subjects || []).forEach(sub => subjects.add(sub));
                }
            });
        });

        // 🆕 Inject mandatory junior/primary subjects if not present
        if (grade && !window.cbcUtils.isSeniorGrade(grade)) {
            subjects.add("PPI");
            subjects.add("PE");
        }

        return Array.from(subjects).sort();
    }

    function openFrequencyModal(grade) {
        const modal = document.getElementById('frequencyModal');
        const container = document.getElementById('subjectFreqInputs');
        document.getElementById('freqModalTitle').textContent = `Frequencies for ${grade}`;
        
        const stream = document.getElementById('ttStreamSelect')?.value || "";

        const subjects = getAllocatedSubjectsForGrade(grade, stream);

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

        container.innerHTML = subjects.map(sub => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #f1f5f9;">
                <span style="font-weight:600; color:#475569;">${sub}</span>
                <input type="number" data-subject="${sub}" class="freq-input" value="${currentFreqs[sub] !== undefined ? currentFreqs[sub] : getDefaultFrequency(sub)}" min="0" max="15" 
                       style="width:60px; padding:5px; border:1px solid #cbd5e0; border-radius:4px; text-align:center;">
            </div>
        `).join('');

        modal.style.display = 'flex';
    }

    function saveCurrentFrequencies() {
        const grade = document.getElementById('ttGradeSelect').value;
        const inputs = document.querySelectorAll('.freq-input');
        if (!lessonFrequencies[grade]) lessonFrequencies[grade] = {};
        
        inputs.forEach(input => {
            lessonFrequencies[grade][input.dataset.subject] = parseInt(input.value);
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

        modal.style.display = 'flex';
    }

    /**
     * 🆕 Open the Placement Rules configuration modal
     */
    function openPlacementRulesModal() {
        const modal = document.getElementById('placementRulesModal');
        
        // Load current settings into form
        document.getElementById('coreSubs_enabled').checked = placementRules.coreSubjectsPreference.enabled;
        document.getElementById('coreSubs_beforeLunch').checked = placementRules.coreSubjectsPreference.beforeLunchOnly;
        document.getElementById('coreSubs_beforeLunch').disabled = !placementRules.coreSubjectsPreference.enabled;

        document.getElementById('technical_enabled').checked = placementRules.technicalSubjectsPreference.enabled;
        document.getElementById('technical_preferMorning').checked = placementRules.technicalSubjectsPreference.preferMorning;
        document.getElementById('technical_preferMorning').disabled = !placementRules.technicalSubjectsPreference.enabled;

        document.getElementById('pe_enabled').checked = placementRules.pePreference.enabled;
        document.getElementById('pe_afterLunch').checked = placementRules.pePreference.onlyAfterLunch;
        document.getElementById('pe_noDays').checked = placementRules.pePreference.avoidConsecutiveDays;
        document.getElementById('pe_afterLunch').disabled = !placementRules.pePreference.enabled;
        document.getElementById('pe_noDays').disabled = !placementRules.pePreference.enabled;

        document.getElementById('ppi_enabled').checked = placementRules.ppiPreference.enabled;
        document.getElementById('ppi_friday').checked = placementRules.ppiPreference.fridayMorningOnly;
        document.getElementById('ppi_friday').disabled = !placementRules.ppiPreference.enabled;

        document.getElementById('creative_enabled').checked = placementRules.creativePreference.enabled;
        document.getElementById('creative_afternoon').checked = placementRules.creativePreference.afternoonOnly;
        document.getElementById('creative_afternoon').disabled = !placementRules.creativePreference.enabled;

        // Add event listeners to enable/disable dependent checkboxes
        const attachToggle = (parentId, dependentIds) => {
            document.getElementById(parentId)?.addEventListener('change', (e) => {
                dependentIds.forEach(id => {
                    const elem = document.getElementById(id);
                    if (elem) elem.disabled = !e.target.checked;
                });
            });
        };

        attachToggle('coreSubs_enabled', ['coreSubs_beforeLunch']);
        attachToggle('technical_enabled', ['technical_preferMorning']);
        attachToggle('pe_enabled', ['pe_afterLunch', 'pe_noDays']);
        attachToggle('ppi_enabled', ['ppi_friday']);
        attachToggle('creative_enabled', ['creative_afternoon']);

        modal.style.display = 'flex';
    }

    /**
     * 🆕 Save Placement Rules from modal
     */
    function savePlacementRules() {
        placementRules.coreSubjectsPreference.enabled = document.getElementById('coreSubs_enabled').checked;
        placementRules.coreSubjectsPreference.beforeLunchOnly = document.getElementById('coreSubs_beforeLunch').checked;

        placementRules.technicalSubjectsPreference.enabled = document.getElementById('technical_enabled').checked;
        placementRules.technicalSubjectsPreference.preferMorning = document.getElementById('technical_preferMorning').checked;
        placementRules.technicalSubjectsPreference.allowAfternoon = !document.getElementById('technical_preferMorning').checked;

        placementRules.pePreference.enabled = document.getElementById('pe_enabled').checked;
        placementRules.pePreference.onlyAfterLunch = document.getElementById('pe_afterLunch').checked;
        placementRules.pePreference.avoidConsecutiveDays = document.getElementById('pe_noDays').checked;

        placementRules.ppiPreference.enabled = document.getElementById('ppi_enabled').checked;
        placementRules.ppiPreference.fridayMorningOnly = document.getElementById('ppi_friday').checked;

        placementRules.creativePreference.enabled = document.getElementById('creative_enabled').checked;
        placementRules.creativePreference.afternoonOnly = document.getElementById('creative_afternoon').checked;

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
                beforeLunchOnly: true,
                subjects: ["Mathematics", "English", "Kiswahili"]
            },
            technicalSubjectsPreference: {
                enabled: true,
                preferMorning: true,
                allowAfternoon: false
            },
            pePreference: {
                enabled: true,
                onlyAfterLunch: true,
                avoidConsecutiveDays: true
            },
            ppiPreference: {
                enabled: true,
                fridayMorningOnly: true
            },
            creativePreference: {
                enabled: true,
                afternoonOnly: true
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
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    // 🆕 Helper to convert total minutes from midnight to "HH:MM"
    function minutesToTime(totalMinutes) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    async function generateTimetable() {
        const btn = document.getElementById('generateTimetableBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> Processing...`;

        try {
            const viewMode = document.getElementById('ttViewMode')?.value || 'class';
            
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

            // 🆕 Adjust settings for Junior/Primary to ensure day ends at 3:30 PM for activities
            const isSenior = window.cbcUtils && window.cbcUtils.isSeniorGrade(grade);
            if (!isSenior) {
                settings.lessonsPerDay = 8;
                settings.schoolDayEnd = "15:30"; 
                // Add a gap to hit exactly 3:30 PM start for activities (40m lessons + breaks = 15:25 end with 8:20 start)
                const wrapUpIdx = settings.breaks.findIndex(b => b.name === "WRAP UP");
                if (wrapUpIdx === -1) {
                    settings.breaks.push({ name: "WRAP UP", afterLesson: 8, duration: 5 });
                } else {
                    settings.breaks[wrapUpIdx].duration = 5;
                }
            } else {
                // 🆕 Reset to Senior School defaults if previously adjusted for Junior
                settings.lessonsPerDay = 9;
                settings.schoolDayEnd = "17:05";
                settings.breaks = settings.breaks.filter(b => b.name !== "WRAP UP");
            }

            // 🆕 Initialize frequencies for any newly discovered subjects
            const allocated = getAllocatedSubjectsForGrade(grade, stream);
            if (!lessonFrequencies[grade]) lessonFrequencies[grade] = {};
            allocated.forEach(sub => {
                if (lessonFrequencies[grade][sub] === undefined) {
                    lessonFrequencies[grade][sub] = getDefaultFrequency(sub);
                }
            });

            // Simulation of Engine Logic (using Promise to allow await)
            await new Promise(resolve => {
                setTimeout(() => {
                    renderGrid(grade, stream);
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
        const printBtn = document.getElementById('printTimetableBtn');
        const origPdf = pdfBtn ? pdfBtn.innerHTML : null;
        const origPrint = printBtn ? printBtn.innerHTML : null;

        if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.innerHTML = '<span class="spinner"></span> Generating...'; }
        if (printBtn) { printBtn.disabled = true; printBtn.innerHTML = '<span class="spinner"></span> Generating...'; }

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
                const getBlockColsForPDF = (duration, lessonCount) => {
                    const cols = [];
                    let cur = currentTimetableData.settings?.startTime || settings.startTime;
                    for (let l = 1; l <= lessonCount; l++) {
                        const end = addMinutes(cur, duration);
                        cols.push({ type: 'LESSON', lesson: l, startTime: cur, endTime: end });
                        cur = end;
                        (currentTimetableData.settings?.breaks || settings.breaks).filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                            cols.push({ type: 'BREAK', name: b.name, startTime: cur, endTime: addMinutes(cur, b.duration) });
                            cur = addMinutes(cur, b.duration);
                        });
                    }
                    return cols;
                };

                const sorted = currentTimetableData.timetables.sort((a, b) => {
                    const ga = Number((a.grade || '').match(/\d+/)?.[0] || 0);
                    const gb = Number((b.grade || '').match(/\d+/)?.[0] || 0);
                    if (ga !== gb) return ga - gb;
                    return (a.stream || '').localeCompare(b.stream || '');
                });

                const chunks = [];
                for (let i = 0; i < sorted.length; i += CLASSES_PER_PAGE) chunks.push(sorted.slice(i, i + CLASSES_PER_PAGE));

                chunks.forEach((chunk, cIdx) => {
                    if (cIdx > 0) doc.addPage();
                    drawDocHeader(`MASTER BLOCK TIMETABLE (PART ${cIdx + 1}/${chunks.length})`);

                    const pCols = getBlockColsForPDF(35, 8);
                    const jCols = getBlockColsForPDF(40, schoolType === 'primary_junior' ? 8 : 9);
                    const maxCols = Math.max(pCols.length, jCols.length);
                    const headers = Array.from({ length: maxCols }, (_, i) => ({ p: pCols[i], j: jCols[i] }));

                    const head = [["DAY", ...headers.map(h => {
                        if (h.p?.type === 'BREAK' || h.j?.type === 'BREAK') {
                            const pTime = h.p?.startTime || '--';
                            const jTime = h.j?.startTime || '--';
                            return `${pTime} / ${jTime}`; // Just show times in break headers
                        }
                        return `Lesson ${h.p?.lesson || h.j?.lesson}\n${h.p?.startTime || '--'} / ${h.j?.startTime || '--'}`;
                    }), "ACTIVITIES"]];

                    const columnStyles = { 0: { fontStyle: 'bold', width: 60, fillColor: [248, 250, 252] } };
                    headers.forEach((h, hIdx) => {
                        const lessonNum = h.p?.lesson || h.j?.lesson;
                        if (lessonNum === 1 || lessonNum === 2) {
                            columnStyles[hIdx + 1] = { width: 100 }; // 🆕 Wider for first two lessons in PDF
                        }
                    });

                    const body = ["MON", "TUE", "WED", "THU", "FRI"].map((dayName, dIdx) => {
                        const rowData = [dayName];
                        headers.forEach((h) => {
                            if (h.p?.type === 'BREAK' || h.j?.type === 'BREAK') { rowData.push(h.p?.name || h.j?.name || "BREAK"); return; }
                            const lNum = h.p?.lesson || h.j?.lesson;
                            const entries = [];
                            chunk.forEach(tt => {
                                const subject = tt.grid[lNum - 1]?.[dIdx];
                                    if (subject) { // Abbreviate subject for PDF display
                                    const teacher = getTeacherForSubject(tt.grade, tt.stream, subject);
                                    const gMatch = (tt.grade || '').match(/\d+/);
                                    const subAbbr = window.cbcUtils.getAbbreviatedSubjectName(subject);
                                    const isSpecial = subject.toUpperCase() === "PE" || subject.toUpperCase() === "PPI";
                                    
                                    const line = `${gMatch ? gMatch[0] : tt.grade}${tt.stream || ''}: ${subAbbr}`;
                                    entries.push(isSpecial ? line : `${line}\n(${teacher?.name || '?'})`);
                                }
                            });
                            rowData.push(entries.join("\n") || "-");
                        });
                        const shared = getSharedActivityOrder();
                        rowData.push(dIdx === 4 ? "GENERAL CLEANING" : (shared[dIdx] || "SPORTS"));
                        return rowData;
                    });

                    doc.autoTable({
                        startY: 75,
                        head,
                        body,
                        theme: 'grid',
                        styles: { fontSize: 7, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
                        headStyles: { fillColor: [51, 65, 85], textColor: 255, halign: 'center', fontSize: 6.5 },
                        showHead: 'everyPage', // Repeat time/lesson headers on every page
                        rowPageBreak: 'avoid', // 🆕 Ensures a single day (e.g. Friday) is never split across pages
                        columnStyles: columnStyles,
                        didParseCell: (data) => { 
                            const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                            if(data.section === 'body' && isBreak) {
                                data.cell.styles.fillColor = [241, 245, 249];
                                data.cell.styles.textColor = [148, 163, 184]; // gray-400
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
                                    doc.text(line, x, y, { maxWidth: cell.width - 6 });
                                    y += (isTeacher ? 6.5 : 7.5); // Tighter line height

                                    if (trimmed.endsWith(')')) inTeacherName = false;
                                });
                            }
                        }
                    });
                });
            } else if (isTeacher) { // Individual Teacher Timetable PDF Generation
                drawDocHeader(`${currentTimetableData.grade} PERSONAL SCHEDULE`);
                const tSettings = currentTimetableData.settings || settings;
                const teacherGrid = currentTimetableData.grid; // This now contains structured objects
                const columns = currentTimetableData.columns; // Use the columns generated in renderTeacherGrid

                const head = [["DAY / TIME", ...columns.map(col => {
                    if (col.type === 'ACTIVITY') return col.name.toUpperCase();
                    if (col.type === 'BREAK') return col.startTime; // Only show time in break headers
                    return `Lesson ${col.index + 1}\n${col.startTime}-${col.endTime}`;
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
                    styles: { fontSize: 8, cellPadding: 6, halign: 'center', valign: 'middle', overflow: 'linebreak' },
                    headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 8.5 },
                    showHead: 'everyPage',
                    rowPageBreak: 'avoid',
                    columnStyles: { 0: { fontStyle: 'bold', halign: 'left', width: 85, fillColor: [248, 250, 252] } },
                    didParseCell: (data) => {
                        const isBreak = data.cell.text[0] && (data.cell.text[0].toUpperCase().includes("BREAK") || data.cell.text[0].toUpperCase().includes("LUNCH"));
                        if (data.section === 'body' && (isBreak || data.cell.text[0] === 'ACTIVITIES')) {
                            data.cell.styles.fillColor = [241, 245, 249];
                            if (isBreak) {
                                data.cell.styles.textColor = [148, 163, 184]; // gray-400
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
                            const x = cell.x + pLeft + (cell.width - pLeft - pRight) / 2;
                            let y = cell.y + pTop + 10;

                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(9); // Reduced font for subject
                            doc.setTextColor(15, 23, 42); // slate-900
                            doc.text(data.cell.text[0], x, y, { align: 'center', maxWidth: cell.width - 6 }); // Subject

                            doc.setFont("helvetica", "normal");
                            doc.setFontSize(7); // Reduced font for class label
                            doc.setTextColor(37, 99, 235); // blue-600
                            doc.text(data.cell.text[1], x, y + 11, { align: 'center', maxWidth: cell.width - 6 }); // Class Label
                        }
                    }
                });
            } else { // Individual Class Timetable PDF Generation
                // Individual Class or Teacher View
                // 🆕 Use the 'title' variable already correctly constructed at the top of the function
                // This ensures stream and pathway are included in the header.
                drawDocHeader(title);
                const isSenior = window.cbcUtils.isSeniorGrade(currentTimetableData.grade);
                const duration = isSenior ? 40 : 35;
                const lessonCount = isSenior ? 9 : 8;
                const tSettings = currentTimetableData.settings || settings;
                
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
                                row.push(sub === "PE" || sub === "PPI" ? window.cbcUtils.getAbbreviatedSubjectName(sub) : `${window.cbcUtils.getAbbreviatedSubjectName(sub)}\n${t?.name || 'Unassigned'}`);
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
                        fontSize: 9, 
                        cellPadding: 8, 
                        minCellHeight: 80, // 🆕 Significantly taller rows to utilize PDF height
                        halign: 'center', 
                        valign: 'middle', 
                        overflow: 'linebreak' 
                    },
                    headStyles: { fillColor: [51, 65, 85], halign: 'center', fontSize: 9, minCellHeight: 40 },
                    showHead: 'everyPage',
                    rowPageBreak: 'avoid',
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

                            // 🆕 Center coordinates for vertical centering in larger cells
                            const centerX = cell.x + cell.width / 2;
                            const centerY = cell.y + cell.height / 2;

                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(9); // Reduced for better fit
                            doc.setTextColor(15, 23, 42); // slate-900 // Abbreviate subject before rendering
                            // Draw subject slightly above center
                            doc.text(window.cbcUtils.getAbbreviatedSubjectName(data.cell.text[0]), centerX, centerY - 4, { align: 'center', maxWidth: cell.width - 10 }); 

                            doc.setFont("helvetica", "normal");
                            doc.setFontSize(7.5); // Reduced for better fit
                            doc.setTextColor(37, 99, 235); // blue-600
                            // Draw teacher name slightly below center
                            doc.text(data.cell.text[1], centerX, centerY + 10, { align: 'center', maxWidth: cell.width - 10 }); 
                        }
                    }
                });
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
            if (printBtn) { printBtn.disabled = false; printBtn.innerHTML = origPrint; }
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
            const token = localStorage.getItem("token");
            
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
                return allocGrade === normalizedTarget && allocStream === streamTarget && (a.subjects || []).includes(subject);
            })
        );
        return teacher ? { id: teacher._id, name: teacher.name } : null;
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
        const subjects = getAllocatedSubjectsForGrade(currentTimetableData.grade, stream);
        selectEl.innerHTML = '<option value="">-- Remove Subject (Empty) --</option>';
        subjects.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            if (sub === currentSub) opt.selected = true;
            selectEl.appendChild(opt);
        });

        modal.style.display = 'flex';
    }

    /**
     * 🆕 Updates the local state and re-renders the grid without re-shuffling everything
     */
    function saveSlotEdit() {
        if (!activeEditSlot || !currentTimetableData) return;

        const newSubject = document.getElementById('editSlotSubjectSelect').value;
        const { dayIdx, lessonIdx } = activeEditSlot;

        // Update the grid state directly
        currentTimetableData.grid[lessonIdx][dayIdx] = newSubject;

        // Re-render using the updated state
        renderGrid(currentTimetableData.grade, currentTimetableData.stream, false);

        document.getElementById('editSlotModal').style.display = 'none';
        cbcUtils.showToast("Slot updated manually.", "info");
        activeEditSlot = null;
    }

    /**
     * 🆕 Resets only the column for a specific day while maintaining frequency integrity
     */
    async function resetDay(dayIdx) {
        if (!currentTimetableData) return;
        const grade = currentTimetableData.grade;
        const stream = currentTimetableData.stream;
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        
        const confirmed = await window.cbcUtils.showConfirmToast(`Reset all lessons for ${days[dayIdx]}? Other days will remain unchanged.`);
        if (!confirmed) return;

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

        // 3. Re-fill the column for dayIdx
        const subjectsScheduledThisDay = new Set();
        for (let lesson = 1; lesson <= settings.lessonsPerDay; lesson++) {
            const lIdx = lesson - 1;
            const isFridayMorning = (dayIdx === 4 && lesson <= 4);
            const isAfterLunch = lesson > 6;
            let subject = "";

            // Priorities
            if (isFridayMorning) {
                const ppiIdx = dayPool.findIndex(p => p.includes("PPI"));
                if (ppiIdx !== -1) {
                    subject = dayPool[ppiIdx];
                    dayPool.splice(ppiIdx, 1);
                }
            }
            if (isAfterLunch && !subject) {
                const peIdx = dayPool.findIndex(p => p === "PE");
                if (peIdx !== -1) {
                    // 🆕 Consecutive Day Check for PE
                    const peYesterday = dayIdx > 0 && currentTimetableData.grid.some(row => row[dayIdx-1] === "PE");
                    const peTomorrow = dayIdx < 4 && currentTimetableData.grid.some(row => row[dayIdx+1] === "PE");
                    
                    if (!peYesterday && !peTomorrow) {
                        subject = dayPool[peIdx];
                        dayPool.splice(peIdx, 1);
                    }
                }
            }

            if (!subject) {
                for (let i = 0; i < dayPool.length; i++) {
                    const candidate = dayPool[i];
                    const cType = getSubjectType(candidate);
                    
                    if (candidate === "PE") {
                        if (!isAfterLunch) continue;
                        const peYesterday = dayIdx > 0 && currentTimetableData.grid.some(row => row[dayIdx-1] === "PE");
                        const peTomorrow = dayIdx < 4 && currentTimetableData.grid.some(row => row[dayIdx+1] === "PE");
                        if (peYesterday || peTomorrow) continue;
                    }

                    if (candidate === "P.P.I" && !isFridayMorning) continue;
                    if (cType === "ACTIVITY" && lesson <= 4) continue;
                    if (subjectsScheduledThisDay.has(candidate) && (currentTimetableData.lessonFrequencies[candidate] || 0) <= 5) continue;

                    const teacherInfo = getTeacherForSubject(grade, stream, candidate);
                    if (isTeacherBusy(teacherInfo?.id, dayIdx, lIdx, grade, stream)) continue;

                    subject = candidate;
                    dayPool.splice(i, 1);
                    break;
                }
            }

            // Final fallback
            if (!subject && dayPool.length > 0) subject = dayPool.shift();

            currentTimetableData.grid[lIdx][dayIdx] = subject;
            if (subject) subjectsScheduledThisDay.add(subject);
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

            const gradeMatch = displayGrade.match(/\d+/);
            const gradeShort = gradeMatch ? gradeMatch[0] : displayGrade;
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

        // 2. Map Columns (Time slots and breaks) - excluding WRAP UP for teacher view
        const columns = [];
        let currentTime = settings.startTime;
        settings.breaks.filter(b => b.afterLesson === 0 && b.name !== 'WRAP UP').forEach(b => {
            columns.push({ type: 'BREAK', name: b.name, startTime: currentTime, duration: b.duration, label: `${b.name}\n${currentTime}` });
            currentTime = addMinutes(currentTime, b.duration);
        });
        for (let l = 1; l <= effectiveLessonsPerDay; l++) {
            const nextTime = addMinutes(currentTime, settings.lessonDuration);
            columns.push({ type: 'LESSON', index: l - 1, startTime: currentTime, endTime: nextTime });
            currentTime = nextTime;
            settings.breaks.filter(b => b.afterLesson === l && b.name !== 'WRAP UP').forEach(b => {
                columns.push({ type: 'BREAK', name: b.name, startTime: currentTime, duration: b.duration, label: `${b.name}\n${currentTime}` });
                currentTime = addMinutes(currentTime, b.duration);
            });
        }
        // 🆕 Add ACTIVITIES column at the end (replaces WRAP UP)
        const wrapUpBreak = settings.breaks.find(b => b.name === 'WRAP UP');
        if (wrapUpBreak) {
            columns.push({ type: 'ACTIVITY', name: 'ACTIVITIES', startTime: currentTime, duration: wrapUpBreak.duration });
        }
        
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
                                if (col.type === 'BREAK') return `<th style="background:#f8fafc; color:#475569; font-size:0.65rem; width: 65px; font-weight: 700;">${col.startTime}</th>`;
                                return `<th style="text-align:center; color: #1e293b; font-weight: 700;"><div style="line-height:1.2;">Lesson ${col.index + 1}<br><span style="font-size:0.75rem; color:#0f172a; font-weight:600;">${col.startTime} to ${col.endTime}</span></div></th>`;
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
                        ${classLabel ? `<div style="font-size:0.6rem; color:#64748b; margin-top:2px;">${classLabel}</div>` : ''}
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
            const ga = Number((a.grade || '').match(/\d+/)?.[0] || 0);
            const gb = Number((b.grade || '').match(/\d+/)?.[0] || 0);
            if (ga !== gb) return ga - gb;
            return (a.stream || '').localeCompare(b.stream || '');
        });

        const ttChunks = [];
        for (let i = 0; i < sortedTimetables.length; i += CLASSES_PER_PAGE) {
            ttChunks.push(sortedTimetables.slice(i, i + CLASSES_PER_PAGE));
        }

        // 🆕 Define column sequence including breaks for block alignment
        function getBlockCols(duration, lessonCount) {
            const cols = [];
            let cur = settings.startTime;
            for (let l = 1; l <= lessonCount; l++) {
                const end = addMinutes(cur, duration);
                cols.push({ type: 'LESSON', lesson: l, startTime: cur, endTime: end });
                cur = end;
                settings.breaks.filter(b => b.afterLesson === l).forEach(b => {
                    cols.push({ type: 'BREAK', name: b.name, startTime: cur, endTime: addMinutes(cur, b.duration) });
                    cur = addMinutes(cur, b.duration);
                });
            }
            return cols;
        }

        const primaryCols = getBlockCols(35, 8);
        const juniorCols = getBlockCols(40, schoolType === 'primary_junior' ? 8 : 9);
        const totalCols = Math.max(primaryCols.length, juniorCols.length);

        const allColumnHeaders = Array.from({ length: totalCols }, (_, idx) => ({
            primary: primaryCols[idx] || null,
            junior: juniorCols[idx] || null
        }));

        const dayNames = ["MON", "TUE", "WED", "THU", "FRI"];
        const extraActivities = getSharedActivityOrder();

        let overallHtml = `
            <div class="no-print" style="margin-bottom:16px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; align-items:flex-start;">
                <div>
                    <h2 style="margin:0; font-size:1.25rem; text-transform:uppercase; color:#0f172a;">${(schoolInfo?.name || 'School Name').toUpperCase()}</h2>
                    <p style="margin:8px 0 0; color:#475569; font-size:0.95rem; max-width:720px;">Master block timetable for ${term} ${academicYear}. Content split across ${ttChunks.length} pages for readability.</p>
                </div>
                <button class="btn secondary-btn" id="downloadTimetablePDFBtn"><i class="fas fa-file-pdf"></i> Download Master PDF</button>
            </div>
        `;

        ttChunks.forEach((chunk, chunkIdx) => {
            const lessonCells = Array.from({ length: 5 }, () => Array.from({ length: totalCols }, () => []));
            
            chunk.forEach(tt => {
                    const gradeMatch = (tt.grade || '').match(/\d+/);
                    const gradeNum = gradeMatch ? gradeMatch[0] : tt.grade;
                    const classLabel = `${gradeNum}${tt.stream || ''}`.trim();

                    const subjectGrid = tt.grid || [];
                    subjectGrid.forEach((row, lessonIdx) => {
                        const lessonNum = lessonIdx + 1;
                        const colIdx = allColumnHeaders.findIndex(h => 
                            (h.junior?.type === 'LESSON' && h.junior?.lesson === lessonNum) || 
                            (h.primary?.type === 'LESSON' && h.primary?.lesson === lessonNum)
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
                    const isBreak = (h.primary?.type === 'BREAK' || h.junior?.type === 'BREAK');

                    if (isBreak) {
                        return `<td style="vertical-align:middle; text-align:center; padding:10px; border:1px solid #e2e8f0; background:#f8fafc; color:#94a3b8; font-weight:800; font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; min-width:80px;">BREAK</td>`;
                    }

                    const lNum = h.primary?.lesson || h.junior?.lesson;
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
                const p = header.primary;
                const j = header.junior;
                const isBreak = (p?.type === 'BREAK' || j?.type === 'BREAK');
                const title = isBreak ? "" : `Lesson ${p?.lesson || j?.lesson}`; // Hide "BREAK/LUNCH" in on-screen header too
                const pTime = p ? `${p.startTime}-${p.endTime}` : '--';
                const jTime = j ? `${j.startTime}-${j.endTime}` : '--';
                const bgColor = isBreak ? '#f1f5f9' : '#eef2ff';
                const textColor = isBreak ? '#475569' : '#0f172a';
                let colWidth = isBreak ? '80px' : '180px';
                
                // 🆕 Increase width for first two lessons to accommodate teacher names
                const lNum = p?.lesson || j?.lesson;
                if (!isBreak && (lNum === 1 || lNum === 2)) {
                    colWidth = '230px'; 
                }
                const displayTitle = isBreak ? title.split(' ').join('<br>') : title;

                return `<th style="padding:10px; border:1px solid #e2e8f0; background:${bgColor}; min-width:${colWidth}; text-align:center;">
                            <div style="font-weight:700; color:${textColor}; line-height: 1.2;">${displayTitle}</div>
                            <div style="font-size:0.72rem; color:#475569; margin-top:4px; line-height:1.2;">
                                <div>${pTime}</div>
                                <div>${jTime}</div>
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

    function renderGrid(grade, stream = "", generateNew = true) {
        const output = document.getElementById('timetableOutput');
        const days = ["MON", "TUE", "WED", "THU", "FRI"];
        const isSenior = window.cbcUtils && window.cbcUtils.isSeniorGrade(grade);
        const pathway = isSenior ? document.getElementById('ttPathwaySelect').value : "";
        const academicYear = document.getElementById('ttYearSelect').value;
        const term = document.getElementById('ttTermSelect')?.value || "Term 1";
        const selectedStream = stream || document.getElementById('ttStreamSelect')?.value || "";
        
        // Get frequencies for this grade
        const freqs = lessonFrequencies[grade] || {};

        // 1. GENERATE ASSIGNMENTS (Skip if just refreshing for a manual edit)
        let grid = generateNew ? [] : (currentTimetableData?.grid || []);
        if (generateNew) {
            const subjectPool = [];
            Object.entries(freqs).forEach(([sub, count]) => {
                for(let i=0; i<count; i++) subjectPool.push(sub);
            });
            
        // Shuffle pool
        let pool = [...subjectPool].sort(() => Math.random() - 0.5);

        const subjectsScheduledToday = [new Set(), new Set(), new Set(), new Set(), new Set()];

        for (let lesson = 1; lesson <= settings.lessonsPerDay; lesson++) {
            const isMorning = lesson <= 4; 
            const isAfterLunch = lesson > 6;
            const isBeforeLunch = lesson <= 6; // Lessons 1-6 are before lunch (lunch is after lesson 6)
            const rowData = [];

            for (let day = 0; day < 5; day++) {
                let subject = "";
                const isFridayMorning = (day === 4 && lesson <= 4); // Friday is day index 4, morning lessons are 1-4

                // 🆕 Prioritize P.P.I on Friday mornings (if enabled)
                if (placementRules.ppiPreference.enabled && isFridayMorning) {
                    const ppiCandidateIndex = pool.findIndex(p => p.includes("PPI"));
                    if (ppiCandidateIndex !== -1) {
                        const ppiCandidate = pool[ppiCandidateIndex];
                        const cType = getSubjectType(ppiCandidate);
                        const freq = freqs[ppiCandidate] || 0;

                        // Apply existing constraints for P.P.I
                        if (!(freq <= 5 && subjectsScheduledToday[day].has(ppiCandidate))) {
                            const teacherInfo = getTeacherForSubject(grade, stream, ppiCandidate);
                            if (!isTeacherBusy(teacherInfo?.id, day, lesson - 1, grade, stream)) {
                                subject = ppiCandidate;
                                subjectsScheduledToday[day].add(subject);
                                pool.splice(ppiCandidateIndex, 1);
                            }
                        }
                    }
                }

                // 🆕 Prioritize PE after lunch (if enabled)
                if (placementRules.pePreference.enabled && isAfterLunch && !subject) {
                    const peIdx = pool.findIndex(p => p === "PE");
                    if (peIdx !== -1) {
                        const peCandidate = pool[peIdx];
                        // Check consecutive day constraint if enabled
                        const peYesterday = placementRules.pePreference.avoidConsecutiveDays && day > 0 && subjectsScheduledToday[day-1].has("PE");
                        if (!subjectsScheduledToday[day].has(peCandidate) && !peYesterday) {
                            const teacherInfo = getTeacherForSubject(grade, stream, peCandidate);
                            if (!isTeacherBusy(teacherInfo?.id, day, lesson - 1, grade, stream)) {
                                subject = peCandidate;
                                subjectsScheduledToday[day].add(subject);
                                pool.splice(peIdx, 1);
                            }
                        }
                    }
                }

                // 🆕 Prioritize Core Subjects (Math, English, Kiswahili) before lunch if enabled
                if (placementRules.coreSubjectsPreference.enabled && isBeforeLunch && !subject) {
                    const coreSubjects = placementRules.coreSubjectsPreference.subjects;
                    const coreIdx = pool.findIndex(p => coreSubjects.some(c => p.includes(c)));
                    if (coreIdx !== -1) {
                        const coreCandidate = pool[coreIdx];
                        if (!subjectsScheduledToday[day].has(coreCandidate)) {
                            const teacherInfo = getTeacherForSubject(grade, stream, coreCandidate);
                            if (!isTeacherBusy(teacherInfo?.id, day, lesson - 1, grade, stream)) {
                                subject = coreCandidate;
                                subjectsScheduledToday[day].add(subject);
                                pool.splice(coreIdx, 1);
                            }
                        }
                    }
                }

                // If special placements weren't scheduled, proceed with general subject selection
                if (!subject) {
                for (let i = 0; i < pool.length; i++) {
                    const candidate = pool[i];
                    const cType = getSubjectType(candidate);
                    const freq = freqs[candidate] || 0;

                    // 🆕 Apply rule-based constraints
                    
                    // PE constraint
                    if (placementRules.pePreference.enabled && candidate === "PE") {
                        if (!isAfterLunch) continue;
                        if (placementRules.pePreference.avoidConsecutiveDays && day > 0 && subjectsScheduledToday[day-1].has("PE")) continue;
                    }
                    
                    // PPI constraint
                    if (placementRules.ppiPreference.enabled && candidate === "PPI") {
                        if (placementRules.ppiPreference.fridayMorningOnly && !isFridayMorning) continue;
                    }

                    // Creative subjects constraint
                    if (placementRules.creativePreference.enabled && cType === "ACTIVITY") {
                        if (placementRules.creativePreference.afternoonOnly && isMorning) continue;
                        if (subjectsScheduledToday[day].has(candidate)) continue;
                    }
                    
                    // Core subjects constraint
                    if (placementRules.coreSubjectsPreference.enabled && placementRules.coreSubjectsPreference.beforeLunchOnly) {
                        const isCoreSubject = placementRules.coreSubjectsPreference.subjects.some(c => candidate.includes(c));
                        if (isCoreSubject && isAfterLunch) continue;
                    }

                    if (freq <= 5 && subjectsScheduledToday[day].has(candidate)) continue;

                    const teacherInfo = getTeacherForSubject(grade, stream, candidate);
                    if (isTeacherBusy(teacherInfo?.id, day, lesson - 1, grade, stream)) continue;

                    // Technical subjects preference
                    if (placementRules.technicalSubjectsPreference.enabled && placementRules.technicalSubjectsPreference.preferMorning) {
                        if (isMorning && cType !== "TECHNICAL") {
                            if (pool.some(p => getSubjectType(p) === "TECHNICAL")) continue;
                        }
                        if (!placementRules.technicalSubjectsPreference.allowAfternoon && isAfterLunch && cType === "TECHNICAL") {
                            if (pool.some(p => getSubjectType(p) !== "TECHNICAL")) continue;
                        }
                    }

                    subject = candidate;
                    subjectsScheduledToday[day].add(subject);
                    pool.splice(i, 1);
                    break;
                }
                }

                if (!subject && pool.length > 0) {
                    subject = pool.shift();
                    subjectsScheduledToday[day].add(subject);
                }
                rowData.push(subject);
            }
            grid.push(rowData);
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
                    <button class="btn primary-btn" id="saveTimetableToPortalBtn" style="background:#166534;"><i class="fas fa-save"></i> Save to Portal</button>
                </div>
                <div class="tt-grid-container" style="overflow-x:auto;">
                    <table class="marks-table" style="width:100%; border-collapse: collapse; border: 1px solid #cbd5e1; table-layout: auto;">

                    <thead style="background: #ffffff; font-size: 0.75rem;">
                        <tr style="background: #ffffff;">
                            <th colspan="${totalCols}" style="padding: 15px; border-bottom: 1px solid #94a3b8; text-align: center;">
                                <h3 style="margin:0; text-transform: uppercase; font-weight: 900; font-size: 1.15rem; color: #0f172a;">${grade}${stream ? ` ${stream}` : ''} WEEKLY TIMETABLE ${pathway ? `(${pathway})` : ''} - ${term} ${academicYear}</h3>
                            </th>
                        </tr>
                        <tr>
                            <th style="width:100px; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 800; background: #f8fafc;">DAY / TIME</th>
                            ${columns.map(col => {
                                if (col.type === 'BREAK') return `<th style="background:#f8fafc; color:#475569; font-size:0.7rem; width: 65px; font-weight: 700;">${col.startTime}</th>`;
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

                    const isSpecialSubject = subject === "PE" || subject === "PPI";

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

        currentTimetableData = {
            viewMode: 'class',
            grade,
            stream: selectedStream,
            term,
            pathway: pathway || null,
            academicYear: Number(academicYear),
            lessonFrequencies: freqs,
            extraActivities, // 🆕 Store persisted activities order
            // 🆕 Use deep clone for settings to prevent state leakage
            settings: JSON.parse(JSON.stringify(settings)),
            grid
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
            "PE": "#fef2f2",          // Red
            "Integrated Science": "#f5f3ff", // Purple
            "Creative Arts and Sports": "#fff1f2", // Rose
            "Christian Religious Education": "#fffbeb", // Amber
            "Physics": "#ecfeff",     // Cyan
            "Chemistry": "#f0fdfa",   // Teal
            "Biology": "#fdf2f8",     // Pink
            "History & Citizenship": "#fff7ed",
            "Geography": "#f0fdf4",
            "Business Studies": "#faf5ff",
            "Agriculture": "#f7fee7",  // Lime
            "Pre-Technical Studies": "#f8fafc", // Slate
            "PPI": "#fffbeb"
        };
        return colors[sub] || "#f9fafb";
    }

    return { init };
})();
window.TimetableModule = TimetableModule;