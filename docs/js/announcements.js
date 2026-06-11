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
            <div class="announcement-modal glass-card">
                <header class="ann-header">
                    <div class="ann-icon-badge"><i class="fas fa-bullhorn"></i></div>
                    <h3 class="ann-gradient-title">${ann.title}</h3>
                </header>
                <div class="ann-body">
                    <p>${ann.message}</p>
                </div>
                <div class="ann-footer">
                    <button class="ann-dismiss-btn" data-id="${ann._id}">Got it, thanks!</button>
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