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

dotenv.config();

// Resolve __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','DELETE'],
  credentials: true
}));
app.use(cookieParser());
app.use(helmet());

// Rate limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

// Static
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/marks', markRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api', superAdminRoutes);

// Frontend SPA
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
app.get('', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------------------------
// CONNECT TO MONGODB (Full shard-based URI)
// ---------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected successfully!");

    // Optional test write
    try {
      const testSchema = new mongoose.Schema({ name: String });
      const Test = mongoose.model('Test', testSchema);
      const doc = await Test.create({ name: "Connection Test" });
      console.log("Document inserted:", doc);
    } catch (err) {
      console.error("Insert test document error:", err);
    }

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);

    if (err.message.includes('IP')) {
      console.log('\n💡 Hint: Make sure your current IP is added to MongoDB Atlas IP Access List.');
    }

    process.exit(1);
  });
