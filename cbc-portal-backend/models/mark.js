import mongoose from "mongoose";
const markSchema = new mongoose.Schema({
  admissionNo: { type: String, required: true },
  studentName: { type: String, required: true },

  // 🔴 keep grade for now (reports & UI)
  grade: { type: String, required: true },

  // 🆕 Optional stream field to support Grade 5W, Grade 5E, etc.
  stream: { type: String, default: null }, // e.g., "W", "E", "A"

  term: { type: Number, required: true },
  year: { type: Number, required: true },

  // For Senior School (Grades 10-12): pathway + course instead of subject
  pathway: { type: String, enum: ["STEM", "Social Sciences", "Arts & Sports Science"], default: null },
  course: { type: String, default: null }, // Learning area within pathway

  // For Junior School (Grades 1-9): traditional subject
  subject: { type: String, default: null },

  // ===== JUNIOR SCHOOL (Grades 1-9): Simple Score =====
  score: { type: Number, required: false, default: null }, // Single score for junior school

  // ===== SENIOR SCHOOL (Grades 10-12): Component Scores =====
  // When grade >= 10, use component scores instead
  continuousAssessment: { type: Number, default: null }, // 0-100 (30% weight)
  projectWork: { type: Number, default: null },          // 0-100 (20% weight)
  endTermExam: { type: Number, default: null },          // 0-100 (50% weight)
  
  // Calculated final weighted score for senior school (auto-calculated)
  finalScore: { type: Number, default: null },           // Weighted average 0-100
  performanceLevel: { type: String, default: null },     // EE, ME, AE, BE

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },

  // 🆕 Link directly to User ID for robust relations
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // ✅ NEW (strong lock)
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StudentEnrollment",
    default: null,
    index: true
  },

  assessment: { type: Number, required: true },

  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });

// 🚀 Optimized Indexes

// For Duplication Checks & Controller uniqueness logic
// Optimized for batching: narrows down to context (school/year/term/subject) first, then students.
markSchema.index({
  schoolId: 1, year: 1, term: 1, assessment: 1, subject: 1, pathway: 1, course: 1, admissionNo: 1
}, { name: "idx_uniqueness_check", unique: true });

// For Teacher Dashboard queries (getMarks)
markSchema.index({ 
  teacherId: 1, schoolId: 1, year: -1, term: -1, assessment: -1 
});

// For Student & Class Performance queries
markSchema.index({ schoolId: 1, grade: 1, stream: 1, year: 1, term: 1, assessment: 1 });

// 🆕 For Dean/Admin analytics queries that filter by performance level
markSchema.index({ schoolId: 1, year: 1, term: 1, assessment: 1, performanceLevel: 1 });


const Mark = mongoose.model("Mark", markSchema);
export default Mark;