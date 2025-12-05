// models/School.js
import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  adminEmail: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

export const School = mongoose.model('School', schoolSchema);
