/**
 * Frontend Configuration File
 * Centralized configuration for the CBC Portal Frontend
 * Supports both DEVELOPMENT and PRODUCTION environments
 * 
 * DEVELOPMENT: http://localhost:5000
 * PRODUCTION: set via window.__CBC_PORTAL_API_URL__ or update the NovaHost URL below
 */

// ===========================
// ENVIRONMENT DETECTION
// ===========================
function getEnvironmentOverride() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search || '');
  const queryEnv = params.get('env');
  if (queryEnv === 'development' || queryEnv === 'production') {
    return queryEnv;
  }

  try {
    const storedEnv = window.localStorage.getItem('cbcPortalEnvironmentOverride');
    if (storedEnv === 'development' || storedEnv === 'production') {
      return storedEnv;
    }
  } catch (error) {
    console.warn('[CONFIG] Unable to read environment override from storage:', error);
  }

  if (window.__CBC_PORTAL_ENV__ === 'development' || window.__CBC_PORTAL_ENV__ === 'production') {
    return window.__CBC_PORTAL_ENV__;
  }

  return null;
}

// Automatically detect environment based on URL and hostname
function detectEnvironment() {
  const override = getEnvironmentOverride();
  if (override) {
    return override;
  }

  const hostname = window.location.hostname;
  const hostnameLower = hostname.toLowerCase();

  if (hostnameLower === 'localhost' || hostnameLower === '127.0.0.1' || hostnameLower.startsWith('192.168') || hostnameLower === '0.0.0.0') {
    return 'development';
  }

  if (hostnameLower.includes('netlify') || hostnameLower.includes('vercel') || hostnameLower.includes('ngrok')) {
    return 'development';
  }

  return 'production';
}

const CURRENT_ENV = detectEnvironment();
const LOCAL_API_BASE_URL = 'http://localhost:5000/api';
const PROD_API_BASE_URL = (
  typeof window !== 'undefined' && window.__CBC_PORTAL_API_URL__
    ? window.__CBC_PORTAL_API_URL__
    : 'https://api.competencehub.co.ke/api'
);

// ===========================
// ENVIRONMENT-SPECIFIC CONFIGS
// ===========================
const environmentConfigs = {
  development: {
    api: {
      baseURL: LOCAL_API_BASE_URL,
      timeout: 30000,
      version: 'v1',
      announcements: '/announcements/active'
    },
    app: {
      name: 'CBC Student Portal',
      version: '2.1.0',
      environment: 'development',
      debug: true,
    },
    features: {
      enableMPesa: true,
      enableMaterialUpload: true,
      enableAnalytics: true,
    },
  },
  
  production: {
    api: {
      baseURL: PROD_API_BASE_URL,
      timeout: 30000,
      version: 'v1',
      announcements: '/announcements/active'
    },
    app: {
      name: 'CBC Student Portal',
      version: '2.1.0',
      environment: 'production',
      debug: false,
    },
    features: {
      enableMPesa: true,
      enableMaterialUpload: true,
      enableAnalytics: true,
    },
  },
};

// ===========================
// SHARED CONFIGURATION (Both Environments)
// ===========================
const sharedConfig = {
  // ===========================
  // AUTHENTICATION
  // ===========================
  auth: {
    tokenKey: 'authToken',
    userKey: 'user',
    expiresIn: 24,  // Default token expiration in hours (e.g., 24 hours)
    expiresInLong: 7 * 24   // Extended token expiration for "Keep me logged in" (e.g., 7 days)
  },

  // ===========================
  // PAGE REDIRECTS AFTER LOGIN
  // ===========================
  redirects: {
    student: '/student',
    learner: '/student',
    teacher: '/teacher',
    dean: '/dean',
    classteacher: '/analysis',
    accounts: '/accounts',
    admin: '/admin',
    users: '/users',
    superAdmin: '/super-admin',
    super_admin: '/super-admin',
    founder: '/founder',
  },

  // ===========================
  // PAGINATION
  // ===========================
  pagination: {
    itemsPerPage: 10,
    pageSizeOptions: [5, 10, 20, 50],
  },
};

// ===========================
// MERGE CONFIGS
// ===========================
const config = {
  ...sharedConfig,
  ...environmentConfigs[CURRENT_ENV],
  currentEnvironment: CURRENT_ENV,

  // ===========================
  // HELPER FUNCTION: Get Full API URL
  // ===========================
  getApiUrl(endpoint = '') {
    const baseURL = this.api.baseURL;
    if (endpoint.startsWith('http')) {
      return endpoint; // Return full URL as-is
    }
    return endpoint ? `${baseURL}${endpoint}` : baseURL;
  },

  // ===========================
  // HELPER FUNCTION: Update Base URL (Runtime)
  // ===========================
  setBaseURL(newURL) {
    this.api.baseURL = newURL;
    if (this.app.debug) {
      console.log(`[CONFIG] API Base URL updated to: ${newURL}`);
    }
  },

  // ===========================
  // HELPER FUNCTION: Switch Environment
  // ===========================
  switchEnvironment(env) {
    if (env !== 'development' && env !== 'production') {
      console.error(`[CONFIG] Invalid environment: ${env}`);
      return;
    }
    const envConfig = environmentConfigs[env];
    this.api = { ...envConfig.api };
    this.app = { ...envConfig.app };
    this.features = { ...envConfig.features };
    this.currentEnvironment = env;

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('cbcPortalEnvironmentOverride', env);
      } catch (error) {
        console.warn('[CONFIG] Unable to persist environment override:', error);
      }
      window.__CBC_PORTAL_ENV__ = env;
    }

    if (this.app.debug) {
      console.log(`[CONFIG] Environment switched to: ${env}`);
      console.log(`[CONFIG] API URL: ${this.api.baseURL}`);
    }
  },

  // ===========================
  // HELPER FUNCTION: Log Configuration
  // ===========================
  logConfig() {
    console.group('📋 CBC Portal Configuration');
    console.log(`Environment: ${this.currentEnvironment.toUpperCase()}`);
    console.log(`API URL: ${this.api.baseURL}`);
    console.log(`App Name: ${this.app.name} v${this.app.version}`);
    console.log(`Debug Mode: ${this.app.debug}`);
    console.log('Features:', this.features);
    console.groupEnd();
  },
};

// ===========================
// STARTUP SETUP
// ===========================
// Log configuration on page load (in development only)
if (config.app.debug) {
  console.log(`[CONFIG] CBC Portal loaded in ${CURRENT_ENV.toUpperCase()} mode`);
  console.log(`[CONFIG] Hostname: ${window.location.hostname}`);
  console.log(`[CONFIG] API Base URL: ${config.api.baseURL}`);
}

// ===========================
// CLEAN URL ENFORCEMENT
// ===========================
// Automatically redirect .html requests to clean URLs (e.g., /founder.html -> /founder)
(function enforceCleanURLs() {
  const currentPath = window.location.pathname;
  if (currentPath.endsWith('.html')) {
    const cleanPath = currentPath.replace(/\.html$/, '');
    const pathMappings = {
      '/teacher-dashboard': '/teacher',
      '/student-dashboard': '/student',
      '/dean-dashboard': '/dean',
    };
    const finalPath = pathMappings[cleanPath] || cleanPath;
    window.location.replace(finalPath + window.location.search + window.location.hash);
  }
})();

// Make config globally available for browser environment
window.config = config;
window.setAppEnvironment = (env) => config.switchEnvironment(env);

// Export for use in other files (Node.js environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}
