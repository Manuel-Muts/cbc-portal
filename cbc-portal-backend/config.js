/**
 * Backend Configuration File
 * Centralized configuration for the CBC Portal Backend
 * Environment variables are loaded from .env file via dotenv.config() in index.js
 */

const config = {
  // ===========================
  // ENVIRONMENT & SERVER
  // ===========================
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  appName: 'CBC Portal Backend',

  // ===========================
  // DATABASE
  // ===========================
  database: {
    // Uses MongoDB Atlas for production, local MongoDB for development
    uri:
      process.env.NODE_ENV === 'production'
        ? process.env.MONGO_ATLAS
        : process.env.MONGO_LOCAL,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // ===========================
  // FRONTEND ORIGINS (CORS)
  // ===========================
  frontend: {
    origins: [
      process.env.FRONTEND_URL, // Production frontend (Netlify)
      'http://localhost:5000', // Local testing
      'http://localhost:3000', // Alternative local port
    ].filter(Boolean), // Remove undefined values
  },

  // ===========================
  // JWT & SECURITY
  // ===========================
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // ===========================
  // EMAIL SERVICE
  // ===========================
  email: {
    service: process.env.EMAIL_SERVICE,
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : undefined,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    from: process.env.EMAIL_FROM || 'noreply@cbcportal.com',
    logger: true,
    debug: true,
  },

  // ===========================
  // EXTERNAL SERVICES
  // ===========================
  externalServices: {
    // M-Pesa or other payment gateways configuration
    mpesa: {
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      shortCode: process.env.MPESA_SHORT_CODE,
      passkey: process.env.MPESA_PASSKEY,
    },
  },

  // ===========================
  // FILE UPLOAD
  // ===========================
  upload: {
    // Maximum file size in MB
    maxFileSize: process.env.MAX_FILE_SIZE || 50,
    // Upload directory
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    // Allowed file types
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword'],
  },

  // ===========================
  // RATE LIMITING
  // ===========================
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // limit each IP to 100 requests per windowMs
  },

  // ===========================
  // LOGGING & DEBUG
  // ===========================
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    debug: process.env.DEBUG === 'true',
  },
};

export default config;
