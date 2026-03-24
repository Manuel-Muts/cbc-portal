// cbc-portal-backend/index.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
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
import accountsRoutes from "./routes/accountsRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";


dotenv.config();

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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:*", "http://127.0.0.1:*"],
      connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"]
    }
  }
}));

// -------------------------
// CORS
// -------------------------
const FRONTEND_ORIGINS = [
  process.env.FRONTEND_URL,         // Production frontend (Netlify)
  "http://localhost:5000",          // Local testing - Express
  "http://localhost:3000",          // Local testing - React/common
  "http://localhost:8000",          // Local testing - Python/other
  "http://localhost:8080",          // Local testing - Vue/other
  "http://127.0.0.1:5000",          // Localhost IPv4
  "http://127.0.0.1:3000",          // Localhost IPv4
  "http://127.0.0.1:8000",          // Localhost IPv4
  "http://127.0.0.1:8080",          // Localhost IPv4
  "http://127.0.0.1:5500",          // VS Code Live Server (default)
  "http://127.0.0.1:5501",          // VS Code Live Server (alternate)
  "http://localhost:5500",          // VS Code Live Server
  "http://localhost:5501",          // VS Code Live Server alternate
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow tools like Postman (no origin)
    if (!origin) return callback(null, true);

    if (FRONTEND_ORIGINS.includes(origin)) {
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
app.use('/api/users', userRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api', superAdminRoutes);
app.use("/api", schoolRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/reports", reportsRoutes);
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
  '/teacher': 'teacher-dashboard.html',
  '/teacher-dashboard': 'teacher-dashboard.html',
  '/student': 'student-dashboard.html',
  '/student-dashboard': 'student-dashboard.html',

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
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }

  // Ignore real file requests (.js, .css, .png, etc.)
  if (req.path.includes('.')) {
    return res.status(404).send('File not found');
  }

  // Normalize path
  let requestedPath = req.path.split('?')[0].toLowerCase();

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
// Serve static files (CSS, JS, images, etc.) - AFTER SPA routes
app.use(express.static(frontendPath));

// -------------------------
// DATABASE CONNECTION
// -------------------------
const mongoURI = process.env.NODE_ENV === "production" ? process.env.MONGO_ATLAS : process.env.MONGO_LOCAL;

console.log(`\n🌍 Environment: ${process.env.NODE_ENV}`);
console.log(`📦 Using database: ${mongoURI.includes("mongodb+srv") ? "MongoDB Atlas" : "Local MongoDB"}`);

mongoose.connect(mongoURI)
  .then(() => {
    console.log("✅ MongoDB connected successfully!");
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
