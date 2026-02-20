// models/LoginAttempt.js
import mongoose from 'mongoose';

const loginAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  identifier: { type: String, default: null }, // e.g., admission or email used
  roleAttempted: { type: String, default: null },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  success: { type: Boolean, default: false },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null }
}, { timestamps: true });

// ------------------------------------
// AUTO-CLEANUP: TTL INDEX
// ------------------------------------
// Automatically delete login attempts older than 7 days
// MongoDB runs cleanup on its own schedule (usually within 60 seconds of expiration)
// This helps optimize storage on M0 cluster and maintains performance
loginAttemptSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 604800 } // 7 days in seconds
);

export default mongoose.model('LoginAttempt', loginAttemptSchema);
