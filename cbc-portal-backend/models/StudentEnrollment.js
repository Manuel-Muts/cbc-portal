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
    type: String, // e.g. "W", "E", "A" for Grade 5W, Grade 5E, Grade 5A
    default: null
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

const StudentEnrollment = mongoose.model(
  "StudentEnrollment",
  studentEnrollmentSchema
);

export default StudentEnrollment;
