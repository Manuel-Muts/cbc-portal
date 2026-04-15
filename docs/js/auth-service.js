/**
 * auth-service.js
 * Centralized Authentication Service for CBC Portal.
 */
window.authService = {
    /**
     * Retrieves current JWT token
     */
    getToken: () => localStorage.getItem("token"),

    /**
     * Redirects to login and clears state
     */
    redirectToLogin: () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/login";
    },

    /**
     * Logs user out
     */
    logout: () => window.authService.redirectToLogin(),

    /**
     * Fetches user profile with built-in caching and role authorization.
     * @param {string[]} allowedRoles - Roles allowed to access the current page.
     * @returns {Promise<Object|null>} User object or null (triggers redirect).
     */
    getUserProfile: async (allowedRoles = []) => {
        const token = window.authService.getToken();
        if (!token) return window.authService.redirectToLogin();

        const CACHE_KEY = "user_profile_cache";
        const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    if (window.authService._validateRoles(data, allowedRoles)) {
                        return data;
                    }
                }
            } catch (e) { localStorage.removeItem(CACHE_KEY); }
        }

        try {
            const API_BASE = window.config.api.baseURL;
            const res = await fetch(`${API_BASE}/users/user`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Unauthorized Session");

            const user = await res.json();
            if (!window.authService._validateRoles(user, allowedRoles)) {
                throw new Error("Unauthorized Role");
            }

            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: user }));
            return user;
        } catch (err) {
            console.error("Authentication check failed:", err);
            return window.authService.redirectToLogin();
        }
    },

    _validateRoles: (user, allowedRoles) => {
        if (!allowedRoles || allowedRoles.length === 0) return true;
        const rolesArray = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
        return allowedRoles.some(r => rolesArray.includes(r));
    },

    initLogout: () => {
        document.getElementById("logoutBtn")?.addEventListener("click", () => window.authService.logout());
    }
};