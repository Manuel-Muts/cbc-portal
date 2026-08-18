// cbc-portal-backend/index.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import userRoutes from './routes/userRoutes.js';
import markRoutes from './routes/markRoutes.js';
import materialRoutes from './routes/materialRoutes.js';
import resetRoutes from './routes/resetRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import schoolRoutes from "./routes/schoolRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js"; // Import paymentRoutes
import accountsRoutes from "./routes/accountsRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import { mpesaCallback } from './controllers/mpesaController.js';
import { startCronJobs } from './services/cronService.js';
import expenseRoutes from './routes/expenseRoutes.js'; // 🆕
import settingsRoutes from './routes/settingsRoutes.js'; // New import
import timetableRoutes from './routes/timetableRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js'; 
import electiveRoutes from "./routes/electiveRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import { User } from './models/User.js';
import { loadEnvironmentFiles } from './utils/envConfig.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'development' });

// Resolve __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// When running behind a proxy (Render, Heroku, etc.) Express needs to
// know to trust the proxy so that `req.ip` and `X-Forwarded-*` headers
// are interpreted correctly. express-rate-limit depends on this when the
// `X-Forwarded-For` header is present.
// For Render, trusting the first proxy is sufficient.
app.set('trust proxy', 1);

// -------------------------
// MIDDLEWARE
// -------------------------
app.use(express.json());
app.use(cookieParser());
app.use(helmet({
  crossOriginEmbedderPolicy: false, // 🔓 Disable COEP to allow external CDNs like FontAwesome/cdnjs
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // 💳 Essential for payment gateway popups (IntaSend/3D Secure)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:*", "http://127.0.0.1:*"],
      connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "https:"],
      fontSrc: ["'self'", "data:", "https:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https:"] // 🔒 Allow external frames for payment authorization and security checks
    }
  }
}));

// -------------------------
// CORS
// -------------------------
const parseAllowedOrigins = () => {
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const defaults = [
    "http://localhost:5000",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://localhost:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501",
    "https://competence-hub.onrender.com",
    "https://www.competence-hub.onrender.com",
  ];

  return [...new Set([...defaults, ...configuredOrigins])];
};

const FRONTEND_ORIGINS = parseAllowedOrigins();

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  try {
    const { hostname } = new URL(origin);
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1' || normalizedHostname === '0.0.0.0' || normalizedHostname.startsWith('192.168.')) {
      return true;
    }

    if (
      normalizedHostname.endsWith('.netlify.app') ||
      normalizedHostname.endsWith('.vercel.app') ||
      normalizedHostname.endsWith('.github.dev') ||
      normalizedHostname.endsWith('.pages.dev') ||
      normalizedHostname.endsWith('.ngrok-free.app') ||
      normalizedHostname.endsWith('.ngrok.app')
    ) {
      return true;
    }

    return FRONTEND_ORIGINS.includes(origin);
  } catch (error) {
    return false;
  }
};

app.use(cors({
  origin: function(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(
      new Error(`CORS blocked for origin: ${origin}`),
      false
    );
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  credentials: true
}));

// -------------------------
// RATE LIMIT
// -------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

// -------------------------
// STATIC FILES
// -------------------------
// Redirect legacy Netlify frontend hostnames to the configured FRONTEND_URL (custom domain)
app.use((req, res, next) => {
  const hostHeader = (req.hostname || req.headers.host || '').toString().toLowerCase();
  const legacyHosts = [
    'competencehub.netlify.app',
    'www.competencehub.netlify.app',
    'competencehub.app.netlify',
  ];

  const target = process.env.FRONTEND_URL || 'https://competencehub.co.ke';

  if (legacyHosts.includes(hostHeader)) {
    const redirectTo = `${target}${req.originalUrl || req.url}`;
    return res.redirect(301, redirectTo);
  }

  return next();
});

app.use(express.static('public'));

// Serve uploads with proper CORS headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');  // allow any origin
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  }
}));

// -------------------------
// API ROUTES
// -------------------------
app.post('/api/mpesa/callback', mpesaCallback);
app.use('/api/users', userRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/reset', resetRoutes);
app.use("/api", schoolRoutes);
app.use('/api', superAdminRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/payments", paymentRoutes); // Use paymentRoutes
app.use("/api/reports", reportsRoutes); 
app.use('/api/expenses', expenseRoutes); // 🆕
app.use('/api/settings', settingsRoutes); // New route
app.use('/api/timetables', timetableRoutes); 
app.use('/api/announcements', announcementRoutes);
app.use("/api/electives", electiveRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/learners", studentRoutes);
// app.use("/api/payments", paymentsRoutes); // Removed: payments handled in userRoutes



// -------------------------
// SPA ROUTING (PRODUCTION-PROOF)
// -------------------------
const frontendPath = path.join(__dirname, '../docs');

// Central route map (ONLY define once, clean names)
const pathMap = {
  '/': 'index.html',
  '/home': 'index.html',
  '/login': 'login.html',
  '/admin': 'admin.html',
  '/super-admin': 'super-admin.html',
  '/dean': 'dean-dashboard.html',
  '/users': 'users.html',
  '/teacher': 'teacher-dashboard.html',
  '/student': 'student-dashboard.html',
  '/performance': 'performance.html',
  '/student-accounts': 'student-accounts.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/founder': 'founder.html', // ✅ New route for founder page
  '/timetable-downloads': 'timetable-downloads.html',

  // ✅ STANDARDIZED ROUTE (IMPORTANT)
  '/study-materials': 'studentstudymaterial.html',

  '/teacher-materials': 'teacher-materials.html',
  '/analysis': 'analysis.html',
  '/report': 'report.html',
  '/reset': 'reset.html',
  '/contact': 'contact.html',
  '/accounts': 'accounts.html'
};

// Serve static frontend files FIRST (important)
app.use(express.static(frontendPath));

// SPA fallback handler
app.use((req, res) => {
  // Ignore API routes
  if (req.path.startsWith('/api/')) {
    console.warn(`❌ Missing API Route: ${req.method} ${req.path}`);
    return res.status(404).json({ message: `API endpoint not found: ${req.method} ${req.path}` });
  }

  if (req.path.includes('.')) {
    return res.status(404).send('File not found');
  }

  // Normalize path
  let requestedPath = req.path.toLowerCase();

  // Remove trailing slash
  if (requestedPath.length > 1 && requestedPath.endsWith('/')) {
    requestedPath = requestedPath.slice(0, -1);
  }

  // Match route
  let htmlFile = pathMap[requestedPath];

  // Fallback logic
  if (!htmlFile) {
    console.warn(`⚠️ Unknown route: ${requestedPath} → serving index.html`);
    htmlFile = 'index.html';
  } else {
    console.log(`📄 Serving: ${requestedPath} → ${htmlFile}`);
  }

  const filePath = path.join(frontendPath, htmlFile);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`❌ Error serving ${htmlFile}:`, err.message);
      res.status(500).send('Server error');
    }
  });
});

// -------------------------
// DATABASE CONNECTION
// -------------------------
const rawNodeEnv = process.env.NODE_ENV;
const normalizedNodeEnv = rawNodeEnv ? String(rawNodeEnv).trim().toLowerCase() : 'development';
const isProduction = normalizedNodeEnv === 'production';
const rawDatabaseSource = String(process.env.DB_SOURCE || process.env.MONGO_SOURCE || (isProduction ? 'atlas' : 'local')).trim().toLowerCase();

const resolveDatabaseTarget = () => {
  const explicitMongoUri = (process.env.MONGO_URI || process.env.MONGO_URL || '').trim();
  if (explicitMongoUri) {
    return { source: 'explicit', uri: explicitMongoUri, sourceEnvVar: 'MONGO_URI' };
  }

  const mode = rawDatabaseSource;

  if (mode === 'atlas') {
    const uri = process.env.MONGO_ATLAS;
    if (!uri) {
      throw new Error('DB_SOURCE=atlas was requested but MONGO_ATLAS is not defined.');
    }
    return { source: 'atlas', uri, sourceEnvVar: 'MONGO_ATLAS' };
  }

  if (mode === 'local') {
    const uri = process.env.MONGO_LOCAL;
    if (!uri) {
      throw new Error('DB_SOURCE=local was requested but MONGO_LOCAL is not defined.');
    }
    return { source: 'local', uri, sourceEnvVar: 'MONGO_LOCAL' };
  }

  if (mode === 'auto') {
    if (isProduction) {
      const uri = process.env.MONGO_ATLAS || process.env.MONGO_LOCAL;
      if (!uri) {
        throw new Error('AUTO database selection is production-mode, but neither MONGO_ATLAS nor MONGO_LOCAL is defined.');
      }
      return {
        source: 'atlas',
        uri,
        sourceEnvVar: process.env.MONGO_ATLAS ? 'MONGO_ATLAS' : 'MONGO_LOCAL'
      };
    }

    const uri = process.env.MONGO_LOCAL || process.env.MONGO_ATLAS;
    if (!uri) {
      throw new Error('AUTO database selection is development-mode, but neither MONGO_LOCAL nor MONGO_ATLAS is defined.');
    }
    return {
      source: 'local',
      uri,
      sourceEnvVar: process.env.MONGO_LOCAL ? 'MONGO_LOCAL' : 'MONGO_ATLAS'
    };
  }

  throw new Error(`Unsupported DB_SOURCE value: ${mode}. Use atlas, local, or auto.`);
};

let databaseTarget;
try {
  databaseTarget = resolveDatabaseTarget();
} catch (error) {
  console.error('\n❌ Database source selection failed:');
  console.error(error.message);
  console.error('Set DB_SOURCE=atlas|local|auto and make sure the matching MONGO_* variable is present.');
  process.exit(1);
}

const mongoURI = databaseTarget.uri;

console.log(`\n🌍 Environment (raw): ${rawNodeEnv}`);
console.log(`🌍 Environment (normalized): ${normalizedNodeEnv}`);
console.log(`🧭 Database source override: ${rawDatabaseSource}`);
console.log(`📦 Resolved database source: ${databaseTarget.source}`);
console.log(`📦 Using database URI from: ${databaseTarget.sourceEnvVar}`);

// Optional: force Node to use public DNS servers if local DNS/TXT lookups are blocked
if (process.env.FORCE_PUBLIC_DNS === 'true') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('🔁 Using public DNS servers: 8.8.8.8, 1.1.1.1');
  } catch (e) {
    console.warn('⚠️ Could not set DNS servers:', e.message || e);
  }
}

const mongooseOptions = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000
};

mongoose.connect(mongoURI, mongooseOptions)
  .then(async () => {
    console.log("✅ MongoDB connected successfully!");

    try {
      await User.collection.dropIndex('schoolId_1_admission_1').catch(() => {});
    } catch (err) {
      // Ignore cleanup errors; they are non-critical at startup.
    }

    try {
      await User.syncIndexes();
    } catch (err) {
      // Ignore index sync issues during startup.
    }
    
    // 🚀 Start scheduled background tasks (Materials cleanup & Payment backups)
    startCronJobs();

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)

    );
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    if (err.message.includes('IP')) {
      console.log('\n💡 Hint: Add your current IP to MongoDB Atlas Access List.');
    }
  });

export default app; // Optional if you need to import app elsewhere
