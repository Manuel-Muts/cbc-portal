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
    enum: ["student", "teacher", "classteacher", "admin"],
    required: true
  },

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

  // For class teachers (separate login)
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
  resetCode: { type: String, default: null },          // hashed OTP
  resetCodeExpires: { type: Date, default: null },     // expiry
  resetAttempts: { type: Number, default: 0 },         // brute-force prevention
  resetVerified: { type: Boolean, default: false },    // true after successful verify

  // ------------------------------------
  // TIMESTAMPS
  // ------------------------------------
  createdAt: { type: Date, default: Date.now }
});

// ------------------------------------
// INDEXES FOR OPTIMIZATION
// ------------------------------------
userSchema.index({ role: 1 });
userSchema.index({ resetCode: 1 });
userSchema.index({ resetCodeExpires: 1 });
userSchema.index({ createdAt: -1 });

export const User = mongoose.model("User", userSchema);