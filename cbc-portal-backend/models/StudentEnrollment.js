// models/StudentEnrollment.js
import mongoose from "mongoose";

const studentEnrollmentSchema = new mongoose.Schema({
  // ------------------------------------
  // RELATIONSHIPS
  // ------------------------------------
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true,
    index: true
  },

  // ------------------------------------
  // ACADEMIC CONTEXT
  // ------------------------------------
  academicYear: {
    type: Number, // e.g. 2026
    required: true,
    index: true
  },

  grade: {
    type: String, // e.g. "Grade 3"
    required: true
  },

  stream: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow null/empty
        return /^[A-Z]+$/.test(v); // Strictly letters only
      },
      message: props => `${props.value} is not a valid stream. Streams must contain letters only (e.g., A, B, BLUE, WEST).`
    }
  },

  pathway: {
    type: String,
    enum: ['STEM', 'Social Sciences', 'Arts & Sports Science', 'N/A'],
    default: null,  // 🆕 Allow null for non-senior school students
    trim: true
  },
  term: {
    type: String,
    enum: ["Term 1", "Term 2", "Term 3"],
    default: "Term 1"
  },

  // ------------------------------------
  // PROMOTION TRACKING
  // ------------------------------------
  promotedFrom: {
    type: String,
    default: null
  },

  // ------------------------------------
  // STATUS
  // ------------------------------------
  status: {
    type: String,
    enum: ["active", "completed", "transferred"],
    default: "active",
    index: true
  },

  // ------------------------------------
  // AUDIT
  // ------------------------------------
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ------------------------------------
// IMPORTANT COMPOUND INDEX
// ------------------------------------
studentEnrollmentSchema.index(
  { studentId: 1, academicYear: 1 },
  { unique: true }
);
studentEnrollmentSchema.index({ grade: 1, pathway: 1 }); // 🆕 Compound index for grade and pathway
studentEnrollmentSchema.index({ pathway: 1 }); // Optimize pathway-based lookups

// 🚀 Optimized Index for Promotion Preview & Class Roster lookups
studentEnrollmentSchema.index({ schoolId: 1, academicYear: 1, grade: 1, stream: 1, status: 1 });
studentEnrollmentSchema.index({ studentId: 1, schoolId: 1 }); // For efficient lookups of a student's enrollments within a school

const StudentEnrollment = mongoose.model(
  "StudentEnrollment",
  studentEnrollmentSchema
);

export default StudentEnrollment;
