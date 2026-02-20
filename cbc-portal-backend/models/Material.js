import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  
  // ===== JUNIOR SCHOOL (1-9) =====
  subject: { type: String, default: null },
  
  // ===== SENIOR SCHOOL (10-12) =====
  pathway: { type: String, enum: ["STEM", "Social Sciences", "Arts & Sports Science"], default: null },
  course: { type: String, default: null },
  
  title: { type: String, required: true },
  description: { type: String },
  fileName: { type: String }, 
  schoolId: { type: String, required: true },   
  file: { type: String },            // full URL to access the file
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// ------------------------------------
// INDEXES FOR OPTIMIZATION
// ------------------------------------
materialSchema.index({ grade: 1, subject: 1 }); // compound index for queries by grade+subject
materialSchema.index({ grade: 1, pathway: 1, course: 1 }); // for senior school queries
materialSchema.index({ teacherId: 1 });
materialSchema.index({ title: 1 });
materialSchema.index({ createdAt: -1 });

export const Material = mongoose.model('Material', materialSchema);