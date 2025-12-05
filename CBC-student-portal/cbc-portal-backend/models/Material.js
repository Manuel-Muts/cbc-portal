import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  subject: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  fileName: { type: String },        // original filename
  file: { type: String },            // full URL to access the file
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// ------------------------------------
// INDEXES FOR OPTIMIZATION
// ------------------------------------
materialSchema.index({ grade: 1, subject: 1 }); // compound index for queries by grade+subject
materialSchema.index({ teacherId: 1 });
materialSchema.index({ title: 1 });
materialSchema.index({ createdAt: -1 });

export const Material = mongoose.model('Material', materialSchema);