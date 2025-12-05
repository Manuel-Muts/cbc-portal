import mongoose from "mongoose";

const markSchema = new mongoose.Schema({
  admissionNo: { type: String, required: true },
  studentName: { type: String, required: true },
  grade: { type: String, required: true },
  term: { type: Number, required: true },
  year: { type: Number, required: true },
  subject: { type: String, required: true },
  score: { type: Number, required: true },
  assessment: { type: Number, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

// ------------------------------------
// INDEXES FOR OPTIMIZATION
// ------------------------------------
markSchema.index({ admissionNo: 1 });
markSchema.index({ grade: 1, year: 1, term: 1 }); // compound index for reports
markSchema.index({ subject: 1 });
markSchema.index({ teacherId: 1 });
markSchema.index({ createdAt: -1 });

export const Mark = mongoose.model("Mark", markSchema);