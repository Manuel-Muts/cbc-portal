// models/User.js
import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema({
  grade: { type: String, required: true },
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
    enum: ["student", "teacher", "classteacher", "admin", "super_admin"],
    required: true
  },

  // Each non-super admin user can belong to a school.
  // super_admin can have null schoolId.
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
  // Add schoolName for convenience
  schoolName: { type: String, default: null },


  email: {
    type: String,
    required: function () { return this.role !== "student"; },
    unique: true,
    sparse: true
  },

  admission: {
    type: String,
    required: function () { return this.role === "student"; },
    unique: true,
    sparse: true
  },

  // ------------------------------------
  // PASSWORDS
  // ------------------------------------
  password: { type: String, required: true },

  classTeacherPassword: { type: String, default: null },
  admissionNumber: { type: String },
  passwordMustChange: { type: Boolean, default: false },

  // ------------------------------------
  // CLASS / SUBJECT ALLOCATION
  // ------------------------------------
  allocations: { type: [allocationSchema], default: [] },
  assignedClass: { type: String, default: null },
  isClassTeacher: { type: Boolean, default: false },

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

export const User = mongoose.model("User", userSchema);
