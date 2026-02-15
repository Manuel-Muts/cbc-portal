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

// -------------------------
// MIDDLEWARE
// -------------------------
app.use(express.json());
app.use(cookieParser());
app.use(helmet());

// -------------------------
// CORS
// -------------------------
const FRONTEND_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://competence-hub.onrender.com",
  process.env.FRONTEND_URL
];


// General CORS for API
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like Postman)
    if (!origin) return callback(null, true);
    if (FRONTEND_ORIGINS.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
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
// FRONTEND SPA
// -------------------------
const frontendPath = path.join(__dirname, '../docs');
app.use(express.static(frontendPath));
app.get('', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

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
      console.log(`🚀 Server running at http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    if (err.message.includes('IP')) {
      console.log('\n💡 Hint: Add your current IP to MongoDB Atlas Access List.');
    }
  });

export default app; // Optional if you need to import app elsewhere
