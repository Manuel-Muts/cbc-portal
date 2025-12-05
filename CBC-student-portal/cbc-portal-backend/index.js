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
import refreshRoutes from './routes/refresh.js';

dotenv.config();

// ---------------------------
// Resolve __dirname in ES module
// ---------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---------------------------
// Middleware
// ---------------------------
app.use(express.json());
app.use(cors({
  origin: true, // reflect request origin
  methods: ['GET','POST','PUT','DELETE'],
  credentials: true
}));
app.use(cookieParser());
app.use(helmet());

// Limit repeated requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});
app.use('/api', limiter);

// ---------------------------
// Static files
// ---------------------------
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------
// API Routes
// ---------------------------
app.use('/api/users', userRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api/refresh', refreshRoutes);

// ---------------------------
// Serve FRONTEND SPA
// ---------------------------
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath, {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000');
  }
}));

// Catch-all for SPA routing
app.get('', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------------------------
// Connect to MongoDB + Start Server
// ---------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch(err => console.error('MongoDB connection error:', err));