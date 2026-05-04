/**
 * CBC Portal Shared Utilities
 * Centralized logic for grading, performance levels, and score calculations.
 */
window.cbcUtils = {
    WEIGHTS: {
        ca: 0.30,
        pw: 0.20,
        exam: 0.50
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
    PERFORMANCE_KEY: [
        { subdivision: 'EE1', range: '90-100', points: 8 },
        { subdivision: 'EE2', range: '75-89', points: 7 },
        { subdivision: 'ME1', range: '58-74', points: 6 },
        { subdivision: 'ME2', range: '41-57', points: 5 },
        { subdivision: 'AE1', range: '31-40', points: 4 },
        { subdivision: 'AE2', range: '21-30', points: 3 },
        { subdivision: 'BE1', range: '11-20', points: 2 },
        { subdivision: 'BE2', range: '0-10', points: 1 },
    ],

    /**
     * Calculates weighted final score for Senior School (Grade 10-12)
     */
    calculateFinalScore: (ca, pw, exam) => {
        const caVal = Number(ca || 0);
        const pwVal = Number(pw || 0);
        const examVal = Number(exam || 0);
        const total = (caVal * 0.30) + (pwVal * 0.20) + (examVal * 0.50);
        return total > 0 ? parseFloat(total.toFixed(2)) : 0;
    },

    getPerformanceLevel: (score) => {
        if (score >= 75) return "EE";
        if (score >= 41) return "ME";
        if (score >= 21) return "AE";
        return "BE";
    },

    getPerformanceLabel: (level) => {
        return window.cbcUtils.LEVEL_LABELS[level] || "Unknown";
    },

    getPoints: (score) => {
        if (score >= 90) return 8;
        if (score >= 75) return 7;
        if (score >= 58) return 6;
        if (score >= 41) return 5;
        if (score >= 31) return 4;
        if (score >= 21) return 3;
        if (score >= 11) return 2;
        return 1;
    },

    getSubdivision: (score) => {
        if (score >= 90) return "EE1";
        if (score >= 75) return "EE2";
        if (score >= 58) return "ME1";
        if (score >= 41) return "ME2";
        if (score >= 31) return "AE1";
        if (score >= 21) return "AE2";
        if (score >= 11) return "BE1";
        return "BE2";
    },

    getTeacherComment: (mean) => {
        return mean >= 75 ? "Great progress this term!" : mean >= 41 ? "Good effort, stay focused." : mean >= 21 ? "You can do better with more effort." : "Work harder next term.";
    },

    getHeadteacherComment: (mean) => {
        return mean >= 75 ? "Keep up the outstanding work." : mean >= 41 ? "A commendable performance." : mean >= 21 ? "Needs improvement in some areas." : "Put in more effort to improve.";
    },

    isSeniorGrade: (grade) => {
        const match = (grade || "").toString().match(/\d+/);
        const num = match ? parseInt(match[0]) : 0;
        return num >= 10 && num <= 12;
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
    }
};