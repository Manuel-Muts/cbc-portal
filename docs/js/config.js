/**
 * Frontend Configuration File
 * Centralized configuration for the CBC Portal Frontend
 * Supports both DEVELOPMENT and PRODUCTION environments
 * 
 * DEVELOPMENT: http://localhost:5000
 * PRODUCTION: https://competence-hub.onrender.com
 */

// ===========================
// ENVIRONMENT DETECTION
// ===========================
// Automatically detect environment based on URL and hostname
function detectEnvironment() {
  const hostname = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol;
  
  // Development: localhost or 127.0.0.1
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168')) {
    return 'development';
  }
  
  // Default to production for any other hostname
  return 'production';
}

const CURRENT_ENV = detectEnvironment();

// ===========================
// ENVIRONMENT-SPECIFIC CONFIGS
// ===========================
const environmentConfigs = {
  development: {
    api: {
      baseURL: 'http://localhost:5000/api',
      timeout: 30000,
      version: 'v1',
    },
    app: {
      name: 'CBC Student Portal',
      version: '1.0.0',
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
      baseURL: 'https://competence-hub.onrender.com/api',
      timeout: 30000,
      version: 'v1',
    },
    app: {
      name: 'CBC Student Portal',
      version: '1.0.0',
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
    expiresIn: 24, // hours
  },

  // ===========================
  // PAGE REDIRECTS AFTER LOGIN
  // ===========================
  redirects: {
    student: 'student-dashboard.html',
    learner: 'student-dashboard.html',
    teacher: 'teacher-dashboard.html',
    dean: 'dean-dashboard.html',
    classteacher: 'analysis.html',
    accounts: 'accounts.html',
    admin: 'admin.html',
    superAdmin: 'super-admin.html',
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
    this.api = envConfig.api;
    this.app = envConfig.app;
    this.features = envConfig.features;
    this.currentEnvironment = env;
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

// Make config globally available for browser environment
window.config = config;

// Export for use in other files (Node.js environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}
