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
        const userKey = window.config?.auth?.userKey || 'user';
        try {
            const user = JSON.parse(localStorage.getItem(userKey) || '{}');
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
            // Normalize for clean URLs (e.g., "/dean-dashboard.html" becomes "dean-dashboard")
            // We strip both leading/trailing slashes and the extension
            const cleanPath = fullPath.replace(/^\/|\/$/g, '').replace(/\.html$/, '') || 'index';

            console.log(`📢 Route Check: Path is "${cleanPath}"`);

            announcements.forEach(ann => {
                const expiresAt = ann.expiresAt ? new Date(ann.expiresAt) : null;
                const isExpired = expiresAt && expiresAt <= new Date();
                if (isExpired) {
                    console.log(`⏰ Skipping expired announcement: ${ann.title}`);
                    return;
                }

                // Normalize the target page from the DB for comparison
                const target = ann.targetPage.toLowerCase().replace(/^\/|\/$/g, '').replace(/\.html$/, '');
                console.log(`🔍 Checking announcement "${ann.title}" against target: "${target}" (Original: "${ann.targetPage}")`);
                
                // Stricter matching to avoid admin/super-admin collision
                const isExactMatch = (cleanPath === target);
                // Bidirectional check allows "dean" to match "dean-dashboard" and vice versa
                const isPartialMatch = (target !== '' && target !== 'all' && (cleanPath.includes(target) || target.includes(cleanPath)) && target !== 'admin' && cleanPath !== 'admin'); 
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
            <div class="announcement-modal">
                <!-- 🆕 Specific class to avoid conflict with dashboard headers -->
                <div class="ann-modal-header">
                    <i class="fas fa-bullhorn ann-header-watermark" aria-hidden="true"></i>
                    <div class="ann-icon-badge">
                        <i class="fas fa-bullhorn"></i>
                    </div>
                    <div class="ann-heading-copy"><span>School notice</span><h3>${ann.title}</h3></div>
                </div>

                <!-- Landscape Body: Wide Content Area -->
                <div class="ann-modal-body">
                    <div class="ann-body">
                        <p>${ann.message}</p>
                    </div>
                    <div class="ann-footer">
                        <button class="ann-dismiss-btn" data-id="${ann._id}">Dismiss announcement</button>
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