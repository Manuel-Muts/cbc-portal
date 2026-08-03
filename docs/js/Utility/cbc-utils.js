/**
 * Centralized logic for grading, performance levels, and score calculations.
 * This utility object is designed to be flexible and extensible, allowing for school-specific grading configurations while providing sensible defaults. It also includes helper functions for consistent performance level labeling and point calculations across the application.
 */
window.cbcUtils = {
    WEIGHTS: {
        ca: 0.30,
        pw: 0.20,
        exam: 0.50
    },

    /**
     * Store for school-specific grading overrides
     */
    customGradingConfig: null,

    /**
     * Shared defaults for the grading scale modal and report calculations.
     */
    DEFAULT_GRADING_CONFIG: {
        primary: [
            { min: 75, max: 100, label: "EE", points: 4 },
            { min: 41, max: 74, label: "ME", points: 3 },
            { min: 21, max: 40, label: "AE", points: 2 },
            { min: 0, max: 20, label: "BE", points: 1 }
        ],
        secondary: [
            { min: 90, max: 100, label: "EE1", points: 8 },
            { min: 75, max: 89, label: "EE2", points: 7 },
            { min: 58, max: 74, label: "ME1", points: 6 },
            { min: 41, max: 57, label: "ME2", points: 5 },
            { min: 31, max: 40, label: "AE1", points: 4 },
            { min: 21, max: 30, label: "AE2", points: 3 },
            { min: 11, max: 20, label: "BE1", points: 2 },
            { min: 0, max: 10, label: "BE2", points: 1 }
        ]
    },

    getDefaultGradingConfig: function(type) {
        const config = this.DEFAULT_GRADING_CONFIG?.[type];
        return config ? JSON.parse(JSON.stringify(config)) : [];
    },

    /**
     * Standards for subdivisions
     */
    LEVEL_LABELS: {
        EE: "Exceeding Expectations",
        ME: "Meeting Expectations",
        AE: "Approaching Expectations",
        BE: "Below Expectations"
    },

    /**
     * Full performance key data for reports and dashboards
     */
    get PERFORMANCE_KEY() {
        // Prioritize custom secondary scale for general report legends
        const custom = window.cbcUtils.customGradingConfig?.secondary;
        const config = (custom && custom.length > 0) ? custom : window.cbcUtils.getDefaultGradingConfig('secondary');
        return [...config].sort((a, b) => b.min - a.min).map(c => ({
            subdivision: c.label,
            range: `${c.min}-${c.max}`,
            points: c.points
        }));
    },

    /**
     * 🆕 Returns the performance key data for a specific grade
     */
    getPerformanceKey: function(grade) {
        const isPrimary = window.cbcUtils.isPrimaryGrade(grade);
        const custom = isPrimary ? window.cbcUtils.customGradingConfig?.primary : window.cbcUtils.customGradingConfig?.secondary;

        const config = (custom && custom.length > 0) ? custom : window.cbcUtils.getDefaultGradingConfig(isPrimary ? 'primary' : 'secondary');
        return [...config].sort((a, b) => b.min - a.min).map(c => ({
            subdivision: c.label,
            range: `${c.min}-${c.max}`,
            points: c.points
        }));
    },

    /**
     * Official Grade Progression
     */
    GRADE_ORDER: ["PG", "PP1", "PP2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],

    /**
     * Ensures grades are always in the format "Grade X"
     */
    normalizeGrade: (g) => {
        if (!g) return "";
        let str = String(g).trim();

        // 🆕 Remove "Grade " prefix if present before checking for PP
        if (str.toUpperCase().startsWith("GRADE ")) {
            str = str.replace(/^GRADE\s+/i, "").trim();
        }
        if (str.toUpperCase().startsWith("PP") || str.toUpperCase() === "PG") return str.toUpperCase();
        const match = str.match(/\d+/);
        if (match) {
            return `Grade ${match[0]}`;
        }
        return str;
    },

    /**
     * Returns the grade options for the current school type.
     * @returns {string[]} An array of grade strings (e.g., ["Grade 1", "Grade 2"]).
     */
    getGradeOptionsForSchool: function() {
        const schoolType = this.getSchoolTypeKey();
        return this.SCHOOL_TYPES[schoolType].gradeOptions.map(g => 
            (String(g).toUpperCase().startsWith("PP") || String(g).toUpperCase() === "PG") ? g : `Grade ${g}`
        );
    },

    /**
     * Determines the school type key based on the global schoolInfo object.
     * @returns {string} The school type key (e.g., 'full', 'primary_junior', 'senior').
     */
    getSchoolTypeKey: function() {
        // Assuming window.schoolInfo is populated globally
        const schoolInfo = window.schoolInfo || {};
        return (schoolInfo.schoolType && this.SCHOOL_TYPES[schoolInfo.schoolType]) ? schoolInfo.schoolType : 'full';
    },


    /**
     * Helper to convert image URL to base64 for reliable PDF embedding
     */
    getImageBase64: async function(url) {
      if (!url) return null;
      // If it's already a data URI, return it immediately to avoid CSP issues with fetch
      if (url.startsWith('data:')) return url;

      try {
        // Prepend backend URL if the path is relative (e.g., /uploads/...)
        const BACKEND_URL = config.api.baseURL.replace('/api', '');
        const absoluteUrl = (url.startsWith('http') || url.startsWith('data:')) 
          ? url 
          : `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
        const response = await fetch(absoluteUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Image conversion error:", e);
        return null;
      }
    },

    /**
     * Helper to extract image format from base64 data URI
     */
    getImageFormat: function(base64String) {
      if (!base64String) return 'PNG';
      const match = base64String.match(/^data:image\/([a-zA-Z+]+);base64,/);
      if (match && match[1]) {
        const format = match[1].toUpperCase();
        return format === 'JPG' ? 'JPEG' : format;
      }
      return 'PNG';
    },

    /**
     * Extracts the numeric part of a grade string.
     * @param {string} grade - The grade string (e.g., "Grade 5", "5").
     * @returns {number} The numeric grade, or 0 if not found.
     */
    getGradeNum: (grade) => {
        const match = String(grade || "").match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
    },

    /**
     * Normalize pathway names to a canonical form used across the app.
     * Examples: 'stem' -> 'STEM', 'social-sciences' -> 'Social Sciences'
     */
    normalizePathway: (p) => {
        if (!p && p !== 0) return "";
        const raw = String(p).trim();
        if (!raw) return "";

        const normalizedInput = raw.toLowerCase();
        const map = {
              stem: 'STEM',
             STEM: 'STEM',
            'social sciences': 'Social Sciences',
            'SOCIAL SCIENCES': 'Social Sciences',
            socialsciences: 'Social Sciences',
            ARTS: 'Arts & Sports Science',
            'ARTS': 'Arts & Sports Science',
            'arts & sports science': 'Arts & Sports Science',
            'arts and sports science': 'Arts & Sports Science',
            artsandsportsscience: 'Arts & Sports Science',
            artsandsportscience: 'Arts & Sports Science',
            artssportsscience: 'Arts & Sports Science',
            na: 'N/A',
            none: 'N/A'
        };

        if (map[normalizedInput]) return map[normalizedInput];

        const key = normalizedInput.replace(/[^a-z0-9]+/g, "");
        if (map[key]) return map[key];

        // Fallback: Title-case common words but preserve & and spacing
        return raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    },


    /**
     * Checks if a given grade falls within the Primary school range (PP1 - Grade 6).
     * @param {string} grade - The grade label (e.g., "PP1", "Grade 3", "6").
     * @returns {boolean} True if it's a primary grade, false otherwise.
     */
    isPrimaryGrade: (grade) => {
        if (!grade) return false;
        const normalized = window.cbcUtils.normalizeGrade(grade);
        if (normalized === "PG" || normalized === "PP1" || normalized === "PP2") return true;
        const match = normalized.match(/\d+/);
        if (match) {
            const num = parseInt(match[0]);
            return num >= 1 && num <= 6;
        }
        return false;
    },

    /**
     * Checks if a given grade falls within the Junior Secondary range (Grade 7 - 9).
     * @param {string} grade - The grade label (e.g., "Grade 7", "9").
     * @returns {boolean} True if it's a junior secondary grade, false otherwise.
     */
    isJuniorGrade: (grade) => {
        const num = window.cbcUtils.getGradeNum(grade);
        return num >= 7 && num <= 9;
    },
    /**
     * Calculates weighted final score for Senior School (Grade 10-12)
     */
    calculateFinalScore: (ca, pw, exam) => {
        const isAbsent = [ca, pw, exam].some(v => v === null || String(v).trim().toUpperCase() === 'X');
        if (isAbsent) return "X";

        const caVal = parseFloat(ca) || 0;
        const pwVal = parseFloat(pw) || 0;
        const examVal = parseFloat(exam) || 0;
        const total = (caVal * 0.30) + (pwVal * 0.20) + (examVal * 0.50);
        // Ensure score is between 0 and 100
        const clampedTotal = Math.max(0, Math.min(100, total));
        return Math.round(clampedTotal * 10) / 10; 
    },

    getPerformanceLevel: (score, grade) => { 
        const isPrimary = window.cbcUtils.isPrimaryGrade(grade);
        const config = window.cbcUtils.customGradingConfig?.[isPrimary ? 'primary' : 'secondary'];
        
        if (config && Array.isArray(config)) {
            const range = config.find(r => Number(score) >= r.min && Number(score) <= r.max);
            if (range) return range.label.substring(0, 2);
        }
        const s = Number(score);
        if (s >= 75) return "EE";
        if (s >= 41) return "ME";
        if (s >= 21) return "AE";
        return "BE";
    },

    getPerformanceLabel: (level) => {
        return window.cbcUtils.LEVEL_LABELS[level] || "Unknown";
    },

    getPoints: function(score, grade) {
        if (score === null || score === undefined || score === "" || isNaN(score) || String(score).toUpperCase() === "X") return 0;
        const s = Number(score);
        const isPrimary = window.cbcUtils.isPrimaryGrade(grade);
        const config = window.cbcUtils.customGradingConfig?.[isPrimary ? 'primary' : 'secondary'];
        
        if (config && Array.isArray(config) && config.length > 0) {
            const range = config.find(r => s >= r.min && s <= r.max);
            if (range) return range.points;
        }

        if (isPrimary) {
            if (s >= 75) return 4; if (s >= 41) return 3; if (s >= 21) return 2; return 1;
        } else {
            if (s >= 90) return 8; if (s >= 75) return 7; if (s >= 58) return 6; if (s >= 41) return 5;
            if (s >= 31) return 4; if (s >= 21) return 3; if (s >= 11) return 2; return 1;
        }
    },

    getSubdivision: function(score, grade) {
        if (score === null || score === undefined || score === "" || isNaN(score) || String(score).toUpperCase() === "X") return "ABS";
        const s = Number(score);
        const isPrimary = window.cbcUtils.isPrimaryGrade(grade);
        const config = window.cbcUtils.customGradingConfig?.[isPrimary ? 'primary' : 'secondary'];
        
        if (config && Array.isArray(config) && config.length > 0) {
            const range = config.find(r => s >= r.min && s <= r.max);
            if (range) return range.label;
        }

        if (isPrimary) {
            if (s >= 75) return "EE"; if (s >= 41) return "ME"; if (s >= 21) return "AE"; return "BE";
        } else {
            if (s >= 90) return "EE1"; if (s >= 75) return "EE2"; if (s >= 58) return "ME1"; if (s >= 41) return "ME2";
            if (s >= 31) return "AE1"; if (s >= 21) return "AE2"; if (s >= 11) return "BE1"; return "BE2";
        }
    },

    getTeacherComment: (score) => {
        if (score >= 75) return "An outstanding performance. Keep it up!";
        if (score >= 58) return "Very good progress shown this term.";
        if (score >= 41) return "Attained basic competencies. Can do better.";
        return "More effort is required in all learning areas.";
    },

    getHeadteacherComment: (score) => {
        if (score >= 75) return "Excellent result. Consistently high standards.";
        if (score >= 58) return "A commendable performance. Aim higher next term.";
        if (score >= 41) return "Satisfactory progress. Room for improvement.";
        return "Please see me regarding this learner's performance.";
    },

    isSeniorGrade: (grade) => {
        const num = window.cbcUtils.getGradeNum(grade);
        return num >= 10 && num <= 12;
    },

    /**
     * Returns an abbreviated subject name for display in compact contexts like PDFs.
     * @param {string} subject - The full subject name.
     * @returns {string} The abbreviated name, or the original if no abbreviation is found.
     */
    getAbbreviatedSubjectName: (subject) => {
        const abbreviations = {
            "Physics": "PHY",
            "Literacy": "LIT",
            "ICT": "ICT",
            "Chemistry": "CHEM",
            "Biology": "BIO",
            "Science and Technology": "SCI/T", // Added for junior school
            "History": "HIST",
            "Geography": "GEO",
            "Psychomotor":"PSYC",
            "Numberwork":"NUMB",
            "Language":"LANG",
            "English": "ENG",
            "Kiswahili": "KISW",
            "Social Studies": "S/S",
            "Mathematics": "MATHS",
            "Agriculture": "AGR",
            "Christian Religious Education": "CRE", // Added for robustness
            "Creative Arts": "C/A",
            "Sports C/A(s)": "C/A(s)",
            "Creative Arts and Sports": "C/A",
            "Visual Arts C/A(v)": "C/A(v)",
            "Performing Arts C/A(p)": "C/A(p)",
            "Pre-Technical Studies": "P/TECH",
            "Integrated Science": "I/SCI",
            "Environmental Activities": "ENV",
            "Health Education": "H/EDU",
            "Physical Health Education": "PHE",
            "Business Studies": "BS",
            "Home Science": "H/S",
            "Computer Science": "C/SCI",
            "Computer Studies": "CS",
            "History & Citizenship": "H&C",
            "Political Studies": "PS",
            "Kenya Sign Language": "KSL",
            "Indigenous Language": "IL",
            "Hindu Religious Education": "HRE",
            "Islamic Religious Education": "IRE",
            "Environmental Science": "ES",
            "Engineering Technology": "ET",
            "Applied Sciences": "AS",
            "Marine and Fisheries": "M&F",
            "Building and Construction": "B&C",
            "Woodwork": "WW",
            "Metalwork": "MW",
            "Power Mechanics": "PM",
            "General Science": "GS",
            "Media Technology": "MT",
            "Film & Media Studies": "F&MS",
            "Fashion & Design": "F&D",
            "Music and Dance": "M&D",
            "Theatre and Film": "T&F",
            "Sports and Recreation": "S&R",
            "PPI": "PPI",
            "PP1": "PP1",
            "PP2": "PP2",
            "PG": "PG",
            "PE": "PE",
           
        };

        const normalizedSubject = (subject || "").trim().toLowerCase();
        for (const key in abbreviations) {
            if (key.trim().toLowerCase() === normalizedSubject) {
                return abbreviations[key];
            }
        }
        return subject; // Return original if no abbreviation found
    },

    /**
     * Centralized Toast Notification
     */
    showToast: (msg, type = "success") => {
        // Delegate to the global showToast function defined in ui.js
        // This ensures all toasts use the same centralized logic and styling.
        if (window.showToast) {
            window.showToast(msg, type);
        } else {
            console.warn("window.showToast is not defined. Toast message not shown:", msg);
        }
    },

    /**
     * Centralized Confirmation Toast
     * Returns a promise that resolves to true (Confirm) or false (Cancel)
     */
    showConfirmToast: (msg, options = {}) => {
        const { confirmText = "Confirm", cancelText = "Cancel" } = options;

        return new Promise((resolve) => {
            const confirmToast = document.createElement("div");
            confirmToast.className = "toast confirm-toast"; // Ensure both classes are applied for styling and positioning
            confirmToast.innerHTML = `
                <p>${msg}</p>
                <div class="confirm-actions">
                    <button class="btn btn-primary confirm-btn">${confirmText}</button>
                    <button class="btn secondary-btn cancel-btn">${cancelText}</button>
                </div>
            `;
            document.body.appendChild(confirmToast);

            confirmToast.querySelector(".confirm-btn").onclick = () => { confirmToast.remove(); resolve(true); };
            confirmToast.querySelector(".cancel-btn").onclick = () => { confirmToast.remove(); resolve(false); };
        });
    },

    /**
     * Centralized logout
     */
    logout: () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/login";
    },

    //.........................
    //Subjects remarks
    //......................
    getSubjectRemark: (score, subject) => {
      const normalizedSubject = String(subject || "").trim().toLowerCase();
      // Handle absences or missing marks
      if (score === null || score === undefined || score === "" || isNaN(score) || String(score).toUpperCase() === "X") {
        return "ABSENT";
      }
      const numScore = Number(score);

      // Kiswahili specific remarks
      if (normalizedSubject.includes("kiswahili")) {
        if (numScore >= 90) return "Hongera";
        if (numScore >= 75) return "Vizuri Sana";
        if (numScore >= 58) return "Vizuri";
        if (numScore >= 41) return"Wastani";
        if (numScore >= 31) return "Tia bidii Zaidi";
        return "Jitahidi";
      }

 // Default English remarks
       if (numScore >= 90) return "Excellent";
        if (numScore >= 75) return "Very Good";
        if (numScore >= 58) return "Good";
        if (numScore >= 41) return"Fair";
        if (numScore >= 31) return "Can Do Better";
        return "Needs Improvement";
    
    }
};

/**
 * 🆕 School Types configuration (moved from dean.js for centralization)
 */
window.cbcUtils.SCHOOL_TYPES = {
    full: {
        label: "Full School (Grades PG-12)",
        gradeOptions: ["PG", "PP1", "PP2","1","2","3","4","5","6","7","8","9","10","11","12"]
    },
    primary_junior: {
        label: "Primary + Junior (Grades PG-9)",
        gradeOptions: ["PG", "PP1", "PP2","1","2","3","4","5","6","7","8","9"]
    },
    senior: {
        label: "Senior School (Grades 10-12)",
        gradeOptions: ["10","11","12"]
    },
    early_years: {
        label: "Early Years (Grades PG-PP2)",
        gradeOptions: ["PG", "PP1", "PP2"]
    }
};
