/**
 * CBC Portal Announcement System
 * Handles fetching, filtering, and displaying targeted popups.
 */
const AnnouncementSystem = (() => {
    const STORAGE_KEY = 'cbc_dismissed_announcements';

    async function init() {
        const token = window.authService?.getToken();
        if (!token) return;
        if (!token || token === "null" || token === "undefined") return;

        // 🆕 Optimization: Learners receive info via parent SMS; skip dashboard fetching.
        try {
            const user = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
            if (user.role === 'student' || user.role === 'learner') {
                return;
            }
        } catch (e) {
            console.warn("Announcement System: Error determining user role.");
        }

        try {
            const response = await fetch(`${window.config.api.baseURL}/announcements/active`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) return;
            const announcements = await response.json();
            
            const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            
            // Get only the filename from the path (e.g., "admin.html")
            const fullPath = window.location.pathname.toLowerCase();
            const fileName = fullPath.split('/').pop() || 'index.html';
            // Normalize for clean URLs (e.g., "/dean" becomes "dean")
            const cleanPath = fileName.replace(/\.html$/, '');

            console.log(`📢 Route Check: Path is "${cleanPath}"`);

            announcements.forEach(ann => {
                console.log(`🔍 Checking announcement "${ann.title}" against target: ${ann.targetPage}`);
                const target = ann.targetPage.toLowerCase().replace(/\.html$/, '');
                
                // Stricter matching to avoid admin/super-admin collision
                const isExactMatch = (cleanPath === target);
                const isPartialMatch = (cleanPath.includes(target) && target !== 'admin'); // Allow partials except for 'admin'
                const isTargetPage = ann.targetPage === 'all' || isExactMatch || isPartialMatch;
                
                if (!isTargetPage) console.log(`⏭️ Skipping: Path "${cleanPath}" does not match target "${target}"`);
                
                if (!dismissed.includes(ann._id) && isTargetPage) {
                    console.log(`✨ Showing announcement: ${ann.title}`);
                    showPopup(ann);
                }
            });
        } catch (err) {
            console.error('Announcement System Error:', err);
        }
    }

    function showPopup(ann) {
        const overlay = document.createElement('div');
        overlay.className = 'announcement-overlay';
        
        overlay.innerHTML = `
            <div class="announcement-modal glass-card" style="max-width: 1000px; width: 95%; display: flex; flex-direction: column; padding: 0; overflow: hidden; border: none; max-height: 85vh;">
                <!-- 🆕 Specific class to avoid conflict with dashboard headers -->
                <div class="ann-modal-header" style="position: relative; width: 100%; margin: 0; display: flex; flex-direction: row; align-items: center; gap: 20px; padding: 25px 40px; background: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0), linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); background-size: 20px 20px, 100% 100%; color: white; border-radius: 0; overflow: hidden;">
                    <i class="fas fa-bullhorn" style="position: absolute; right: -20px; bottom: -30px; font-size: 150px; opacity: 0.1; transform: rotate(-15deg); color: white; pointer-events: none;"></i>
                    <div class="ann-icon-badge" style="position: relative; z-index: 1; width: 50px; height: 50px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.2); border-radius: 12px; font-size: 1.4rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <i class="fas fa-bullhorn"></i>
                    </div>
                    <h3 style="position: relative; z-index: 1; margin: 0; color: white; font-size: 1.6rem; text-align: left; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.1); font-weight: 700; flex-grow: 1;">${ann.title}</h3>
                </div>

                <!-- Landscape Body: Wide Content Area -->
                <div style="width: 100%; display: flex; flex-direction: column; background: white; padding: 40px; min-height: 250px;">
                    <div class="ann-body" style="overflow-y: auto; margin-bottom: 25px; color: #1e293b; line-height: 1.8; font-size: 1.15rem; padding-right: 10px;">
                        <p style="white-space: pre-wrap; margin: 0;">${ann.message}</p>
                    </div>
                    <div class="ann-footer" style="margin-top: auto; padding-top: 25px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end;">
                        <button class="ann-dismiss-btn" data-id="${ann._id}" style="padding: 14px 45px; border-radius: 12px; font-weight: 700; font-size: 1.1rem; cursor: pointer; border: none; background: #4f46e5; color: white; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.4); transition: all 0.2s;">Dismiss Announcement</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Animate in
        setTimeout(() => overlay.classList.add('visible'), 100);

        overlay.querySelector('.ann-dismiss-btn').onclick = () => {
            dismiss(ann._id, overlay);
        };
    }

    function dismiss(id, element) {
        const dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!dismissed.includes(id)) {
            dismissed.push(id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
        }
        
        element.classList.remove('visible');
        setTimeout(() => element.remove(), 400);
    }

    return { init };
})();

// Initialize if the document is ready
if (document.readyState === 'complete') {
    AnnouncementSystem.init();
} else {
    window.addEventListener('load', AnnouncementSystem.init);
}