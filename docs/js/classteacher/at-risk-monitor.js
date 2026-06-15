/**
 * At-Risk Monitor Module
 * Identifies learners requiring intervention based on performance trends and absolute scores.
 */
window.AtRiskMonitor = (function() {
    const SEVERE_DROP = -15; // Critical drop threshold
    const WARNING_DROP = -7;  // Warning drop threshold
    const FAIL_THRESHOLD = 40; // Absolute mean failure threshold

    /**
     * Analyzes student data for risk factors.
     * Handles both Junior (subject-based) and Senior (course-based) structures.
     */
    function analyze(students, subjects, grade) {
        const insights = {
            critical: [], // High priority drops or very low means
            warning: [],  // Moderate drops or single subject issues
            count: 0
        };

        if (!students || students.length === 0) return insights;

        students.forEach(s => {
            const isSenior = window.cbcUtils.isSeniorGrade(grade);
            
            // 1. Performance Drop Check (Longitudinal Risk)
            if (s.progress !== null) {
                if (s.progress <= SEVERE_DROP) {
                    insights.critical.push({ 
                        name: s.name, adm: s.admissionNo, 
                        reason: `Severe Decline: ${s.progress.toFixed(1)}% drop since last milestone.`,
                        type: 'drop' 
                    });
                } else if (s.progress <= WARNING_DROP) {
                    insights.warning.push({ 
                        name: s.name, adm: s.admissionNo, 
                        reason: `Performance Dip: ${s.progress.toFixed(1)}% lower than previous average.`,
                        type: 'drop'
                    });
                }
            }

            // 2. Absolute Failure Check (Immediate Risk)
            if (s.mean < FAIL_THRESHOLD) {
                insights.critical.push({ 
                    name: s.name, adm: s.admissionNo, 
                    reason: `Critical Average: Currently at ${s.mean.toFixed(1)}% (Below threshold).`,
                    type: 'failure'
                });
            }

            // 3. Core Subject Struggle (Foundational Risk)
            const coreSubjects = ["Mathematics", "English", "Kiswahili"];
            coreSubjects.forEach(core => {
                const score = s.subjects[core];
                if (score !== undefined && score !== null && score !== "X" && score < 40) {
                    insights.warning.push({ 
                        name: s.name, adm: s.admissionNo, 
                        reason: `Foundation Risk: Struggling with ${core} (${score}%).`,
                        type: 'subject'
                    });
                }
            });
        });

        insights.count = insights.critical.length + insights.warning.length;
        return insights;
    }

    function render(containerId, insights) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (insights.count === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:#64748b; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e0;">
                    <i class="fas fa-check-circle" style="font-size:2.5rem; color:#10b981; margin-bottom:15px; display:block;"></i>
                    <h4 style="margin:0; color:#1e293b;">Clean Bill of Progress</h4>
                    <p style="font-size:0.9rem; margin-top:5px;">All analyzed learners are currently maintaining stable or improving trends.</p>
                </div>`;
            return;
        }

        let html = `<div class="at-risk-list">`;

        const renderGroup = (items, severity) => {
            if (!items.length) return '';
            const color = severity === 'critical' ? '#dc2626' : '#d97706';
            const icon = severity === 'critical' ? 'fa-exclamation-triangle' : 'fa-info-circle';
            return `
                <div class="insight-group ${severity}" style="margin-bottom:20px;">
                    <h5 style="color:${color}; display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:12px; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em;">
                        <i class="fas ${icon}"></i> ${severity === 'critical' ? 'Critical Interventions' : 'Monitoring Required'} (${items.length})
                    </h5>
                    ${items.map(i => `
                        <div class="insight-item" style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px 15px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <div style="flex-grow:1;">
                                <div style="font-weight:700; color:#1e293b; font-size:0.88rem;">${i.name} <span style="font-weight:500; color:#64748b; font-size:0.75rem;">(ADM: ${i.adm})</span></div>
                                <div style="font-size:0.78rem; color:#475569; margin-top:2px;">${i.reason}</div>
                            </div>
                            <button class="btn secondary-btn view-journey-btn" data-adm="${i.adm}" data-name="${i.name}" style="padding:4px 10px; font-size:0.7rem; font-weight:700;">
                                <i class="fas fa-chart-line"></i> JOURNEY
                            </button>
                        </div>
                    `).join('')}
                </div>`;
        };

        html += renderGroup(insights.critical, 'critical');
        html += renderGroup(insights.warning, 'warning');
        html += `</div>`;
        
        container.innerHTML = html;
        
        // Re-attach journey listeners
        container.querySelectorAll('.view-journey-btn').forEach(btn => {
            btn.onclick = () => window.showLearnerJourney(btn.dataset.adm, btn.dataset.name);
        });
    }

    return { analyze, render };
})();