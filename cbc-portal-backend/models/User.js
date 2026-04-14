// models/User.js
import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  stream: { type: String, default: null }, // e.g., "W", "E", "A" for Grade 5W, Grade 5E, Grade 5A
  subjects: { type: [String], default: [] }
});

const userSchema = new mongoose.Schema({
  // ------------------------------------
  // BASIC ACCOUNT DETAILS
  // ------------------------------------
  name: { type: String, required: true },

  firstname: {
    type: String,
    default: null, // used by password reset workflow
  },

  role: {
    type: String,
    enum: ["student", "teacher", "accounts", "classteacher", "admin", "super_admin"],
    required: true
  },

  // Each non-super admin user can belong to a school.
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
  schoolName: { type: String, default: null },

 email: {
  type: String,
  lowercase: true,
  trim: true,
  required: function () {
    return ["teacher", "classteacher", "accounts", "admin", "super_admin"].includes(this.role);
  },
  unique: true,
  sparse: true
},


  admission: {
    type: String,
    required: function () { return this.role === "student"; },
    unique: true,
    sparse: true
  },

  contact: {
    type: String,
    default: null
  },

  // ------------------------------------
  // PASSWORDS
  // ------------------------------------
  password: { type: String, required: true },
  classTeacherPassword: { type: String, default: null },
  grade: { type: String, default: null }, // Current grade for students
  passwordMustChange: { type: Boolean, default: false },

  // ------------------------------------
  // CLASS / SUBJECT ALLOCATION
  // ------------------------------------
  allocations: { type: [allocationSchema], default: [] },
  assignedClass: { type: String, default: null },
  assignedStream: { type: String, default: null }, // e.g., "W", "E", "A" for class stream
  isClassTeacher: { type: Boolean, default: false },
  isDean: { type: Boolean, default: false },

  signatureUrl: { type: String, default: "" },          // Cloudinary URL for digital signature
  signaturePublicId: { type: String, default: "" },     // Cloudinary public ID for deletion

  // ------------------------------------
  // STUDENT ENROLLMENT REFERENCE
  // ------------------------------------
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrollment", default: null },

  // ------------------------------------
  // PASSWORD RESET SYSTEM
  // ------------------------------------
  resetCode: { type: String, default: null },          
  resetCodeExpires: { type: Date, default: null },     
  resetAttempts: { type: Number, default: 0 },         
  resetVerified: { type: Boolean, default: false },    

  // ------------------------------------
  // TIMESTAMPS
  // ------------------------------------
  createdAt: { type: Date, default: Date.now }
});

// ------------------------------------
// INSTANCE METHODS FOR ROLE CHECKS
// ------------------------------------
userSchema.methods.isSuperAdmin = function () {
  return this.role === "super_admin";
};

userSchema.methods.isSchoolAdmin = function () {
  return this.role === "admin" && !!this.schoolId;
};

// ------------------------------------
// INDEXES FOR OPTIMIZATION
// ------------------------------------
userSchema.index({ role: 1 });
userSchema.index({ resetCode: 1 });
userSchema.index({ resetCodeExpires: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ schoolId: 1 });
userSchema.index({ grade: 1 }); // Optimize grade-based lookups
userSchema.index({ schoolId: 1, role: 1 }); // Optimize filtering users by role within a school
userSchema.index({ name: "text", admission: "text", email: "text" }); // Enable fast text search

export const User = mongoose.model("User", userSchema);
