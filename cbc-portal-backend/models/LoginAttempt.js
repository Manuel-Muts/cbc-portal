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

export default mongoose.model('LoginAttempt', loginAttemptSchema);
