import mongoose from 'mongoose';

const timetableSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  academicYear: { type: Number, required: true },
  term: { type: String, enum: ["Term 1", "Term 2", "Term 3"], required: true },
  grade: { type: String, required: true },
  stream: { type: String, default: "" },
  pathway: { type: String, default: null },
  // Store the lesson counts per week used for generation
  lessonFrequencies: {
    type: Map,
    of: Number
  },
  // Store the configuration snapshot (times, breaks)
  settings: { type: Object },
  // The actual generated grid: grid[row][dayIndex]
  // Stores subject names as strings
  grid: [[{ type: String }]],
  extraActivities: [{ type: String }],
  payloadHash: { type: String },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

/**
 * 🚀 INDEXING FOR PERFORMANCE & INTEGRITY
 */

// 1. Compound Unique Index
timetableSchema.index(
    { schoolId: 1, academicYear: 1, term: 1, grade: 1, stream: 1 }, 
    { unique: true }
);

// 2. Individual Index for schoolId
timetableSchema.index({ schoolId: 1 });

// 3. Individual Index for academicYear
timetableSchema.index({ academicYear: 1 });

export default mongoose.model('Timetable', timetableSchema);