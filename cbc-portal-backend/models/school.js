// models/school.js
import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  adminEmail: { type: String, required: true, unique: true },
  status: { type: String, enum: ["Active", "Suspended"], default: "Active" },
  logo: { type: String, default: "" }, // Cloudinary URL or base64 image string
  logoMimeType: { type: String, default: "image/png" }, // MIME type of logo
  logoPublicId: { type: String, default: "" }, // Cloudinary public_id for logo deletion/management
  address: { type: String, default: "" },
  smsCredits: { type: Number, default: 0 },
  // Add this field:
  headteacherSignatureUrl: {
    type: String,
    default: ""
  },
  registrationOpen: { type: Boolean, default: true },
  allowSignatureUpload: { type: Boolean, default: true },
  schoolType: {
    type: String,
    enum: ["full", "primary_junior", "senior"],
    default: "full"
  },
  gradingConfig: {
    primary: [{
      min: { type: Number },
      max: { type: Number },
      label: { type: String },
      points: { type: Number }
    }],
    secondary: [{
      min: { type: Number },
      max: { type: Number },
      label: { type: String },
      points: { type: Number }
    }]
  },
  termConfig: {
    term1: { type: Boolean, default: true },
    term2: { type: Boolean, default: true },
    term3: { type: Boolean, default: true },
    activeTerm: { type: String, enum: ['Term 1', 'Term 2', 'Term 3'], default: 'Term 1' }
  },
  version: { type: Number, default: 1 },       // <-- version increments on suspension
  paybill: { type: String, default: "" },      // M-Pesa paybill number (for C2B manual payments)
  createdAt: { type: Date, default: Date.now }

});

schoolSchema.index({ name: 1 });
schoolSchema.index({ status: 1 });
schoolSchema.index({ schoolType: 1 });
schoolSchema.index({ registrationOpen: 1 });
schoolSchema.index({ allowSignatureUpload: 1 });
schoolSchema.index({ 'termConfig.activeTerm': 1 });
schoolSchema.index({ createdAt: -1 });

export const School = mongoose.model('School', schoolSchema);
