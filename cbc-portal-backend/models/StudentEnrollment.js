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
      validator: function (v) {
        if (!v) return true;
        return /^[A-Z]+$/.test(v);
      },
      message: props =>
        `${props.value} is not a valid stream. Streams must contain letters only (e.g., A, B, BLUE, WEST).`
    }
  },

  pathway: {
    type: String,
    enum: ["STEM", "Social Sciences", "Arts & Sports Science", "N/A"],
    default: null,
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
// UNIQUE ENROLLMENT PER YEAR
// ------------------------------------
studentEnrollmentSchema.index(
  { studentId: 1, academicYear: 1 },
  { unique: true }
);

// ------------------------------------
// EXISTING PERFORMANCE INDEXES
// ------------------------------------
studentEnrollmentSchema.index({ grade: 1, pathway: 1 });
studentEnrollmentSchema.index({ pathway: 1 });

studentEnrollmentSchema.index({
  schoolId: 1,
  academicYear: 1,
  grade: 1,
  stream: 1,
  status: 1
});

studentEnrollmentSchema.index({
  studentId: 1,
  schoolId: 1
});

// ------------------------------------
// NEW REPORTING & PAYMENT INDEXES
// ------------------------------------

// Reports, enrollment summaries, payment queries
studentEnrollmentSchema.index({
  schoolId: 1,
  academicYear: 1,
  status: 1,
  grade: 1
});

// Student balance lookups
studentEnrollmentSchema.index({
  studentId: 1,
  academicYear: 1,
  status: 1
});

const StudentEnrollment = mongoose.model(
  "StudentEnrollment",
  studentEnrollmentSchema
);

export default StudentEnrollment;