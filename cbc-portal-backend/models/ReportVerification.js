import mongoose from 'mongoose';

const reportVerificationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  schoolName: { type: String, required: true },
  schoolCode: { type: String, default: '' },
  learnerName: { type: String, required: true },
  grade: { type: String, required: true },
  stream: { type: String, default: '' },
  term: { type: String, required: true },
  academicYear: { type: Number, required: true },
  assessment: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true });

reportVerificationSchema.index({ schoolId: 1, issuedAt: -1 });

export default mongoose.model('ReportVerification', reportVerificationSchema);
