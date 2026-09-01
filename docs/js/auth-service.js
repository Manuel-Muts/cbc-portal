
const authService = {
    /**
     * Retrieves current JWT token
     */
    getToken: () => {
        const key = window.config?.auth?.tokenKey || "token";
        const token = localStorage.getItem(key);

        if (!token || token === "null" || token === "undefined" || token === "") {
            return null;
        }

        return token;
    },

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
    logout: () => authService.redirectToLogin(),

    /**
     * Fetches user profile with caching and role authorization
     */
    getUserProfile: async (allowedRoles = []) => {
        const token = authService.getToken();

        if (!token) {
            return authService.redirectToLogin();
        }

        const CACHE_KEY = "user_profile_cache";
        const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

        // Check cache first
        const cached = localStorage.getItem(CACHE_KEY);

        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);

                if (Date.now() - timestamp < CACHE_DURATION) {
                    const isSuspended =
                        data.schoolStatus === "Suspended" &&
                        data.role !== "super_admin";

                    if (isSuspended) {
                        alert(
                            "This school account has been suspended. Please contact MUTS_TECH."
                        );
                        return authService.logout();
                    }

                    if (authService._validateRoles(data, allowedRoles)) {
                        return data;
                    }
                }
            } catch (e) {
                console.warn("Invalid cached profile. Clearing cache.");
                localStorage.removeItem(CACHE_KEY);
            }
        }

        const API_BASE = window.config?.api?.baseURL;

        if (!API_BASE) {
            console.error("API base URL not configured.");
            return null;
        }

        const MAX_RETRIES = 1;
        let retries = 0;

        while (retries <= MAX_RETRIES) {
            try {
                const res = await fetch(`${API_BASE}/users/user`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (!res.ok) {
                    if (res.status === 401 && retries < MAX_RETRIES) {
                        console.warn(
                            "User profile request returned 401. Retrying..."
                        );

                        retries++;
                        await new Promise(resolve =>
                            setTimeout(resolve, 200)
                        );

                        continue;
                    }

                    throw new Error("Unauthorized Session or API Error");
                }

                const user = await res.json();

                // School suspension check
                if (
                    user.schoolStatus === "Suspended" &&
                    user.role !== "super_admin"
                ) {
                    alert(
                        "This school account has been suspended. Please contact the School Admin."
                    );

                    return authService.logout();
                }

                if (
                    !authService._validateRoles(
                        user,
                        allowedRoles
                    )
                ) {
                    throw new Error("Unauthorized Role");
                }

                localStorage.setItem(
                    CACHE_KEY,
                    JSON.stringify({
                        timestamp: Date.now(),
                        data: user
                    })
                );

                return user;
            } catch (err) {
                console.error(
                    "Authentication check failed:",
                    err
                );

                const isNetworkError =
                    err instanceof TypeError ||
                    err.message?.includes("fetch");

                if (isNetworkError) {
                    console.warn(
                        "API connection failed. Check network or backend."
                    );

                    return null;
                }

                if (
                    err.message === "Unauthorized Session or API Error" ||
                    err.message === "Unauthorized Role"
                ) {
                    return authService.redirectToLogin();
                }

                retries++;

                if (retries > MAX_RETRIES) {
                    return authService.redirectToLogin();
                }
            }
        }

        return null;
    },

    /**
     * Role validation
     */
    _validateRoles: (user, allowedRoles) => {
        if (!allowedRoles || allowedRoles.length === 0) {
            return true;
        }

        const rolesArray = Array.isArray(user.roles)
            ? user.roles
            : user.role
            ? [user.role]
            : [];

        // Super admins and admins bypass role restrictions
        if (
            rolesArray.includes("super_admin") ||
            rolesArray.includes("admin")
        ) {
            return true;
        }

        return allowedRoles.some(role =>
            rolesArray.includes(role)
        );
    },

    /**
     * Logout button initializer
     */
    initLogout: () => {
        document
            .getElementById("logoutBtn")
            ?.addEventListener("click", () => {
                authService.logout();
            });
    }
};

/**
 * INACTIVITY TIMEOUT HANDLER
 * Automatically logs out user if inactive for 30 minutes
 */
(function initInactivityTimeout() {
    let lastActivityTime = Date.now();
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const CHECK_INTERVAL = 60000; // Check every minute

    // Track user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, () => {
            lastActivityTime = Date.now();
        }, { passive: true });
    });

    // Periodic inactivity check
    setInterval(() => {
        if (Date.now() - lastActivityTime > INACTIVITY_TIMEOUT) {
            console.warn('[Inactivity] Session inactive for 30 minutes. Logging out...');
            authService.logout();
        }
    }, CHECK_INTERVAL);
})();

window.authService = authService;
