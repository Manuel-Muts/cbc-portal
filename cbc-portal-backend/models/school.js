// models/school.js
import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  adminEmail: { type: String, required: true, unique: true },
  status: { type: String, enum: ["Active", "Suspended"], default: "Active" },
  logo: { type: String, default: "" },
  address: { type: String, default: "" },
  version: { type: Number, default: 1 },       // <-- version increments on suspension
  paybill: { type: String, default: "" },      // M-Pesa paybill number (for C2B manual payments)
  createdAt: { type: Date, default: Date.now }

});

export const School = mongoose.model('School', schoolSchema);
