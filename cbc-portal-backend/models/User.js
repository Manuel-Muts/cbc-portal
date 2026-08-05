// models/User.js
import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema({
  grade: { type: String, required: true },
  stream: { 
    type: String, 
    default: null,
    trim: true,
    uppercase: true,
    validate: {
      validator: v => !v || /^[A-Z]+$/.test(v),
      message: "Stream must contain letters only."
    }
  },
  subjects: { type: [String], default: [] }
});

const normalizeClassGradeValue = (grade) => {
  if (!grade) return null;
  let str = String(grade).trim();
  if (!str) return null;

  const upper = str.toUpperCase();
  if (upper.startsWith("GRADE")) {
    str = str.replace(/^GRADE\s+/i, "").trim();
  }

  const cleaned = str.trim();
  if (!cleaned) return null;

  const upperCleaned = cleaned.toUpperCase();
  if (upperCleaned === "PG" || upperCleaned === "PP1" || upperCleaned === "PP2") {
    return upperCleaned;
  }

  if (upperCleaned.startsWith("PP") || upperCleaned.startsWith("PG")) {
    return upperCleaned;
  }

  const match = cleaned.match(/\d+/);
  return match ? match[0] : cleaned;
};

const userSchema = new mongoose.Schema({
  // ------------------------------------
  // BASIC ACCOUNT DETAILS
  // ------------------------------------
  name: { type: String, required: true },

  role: {
    type: String,
    enum: ["student", "teacher", "accounts", "classteacher", "admin", "super_admin"],
    required: true
  },

  // Each non-super admin user MUST belong to a school.
  schoolId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "School", 
    default: null,
    required: function() { return this.role !== "super_admin"; } // 🔒 Enforce school assignment
  },
 

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
    sparse: true
  },
  // Numeric suffix extracted from `admission` for fast max lookups
  numericAdmission: {
    type: Number,
    default: null,
    index: true
  },

  contact: {
    type: String,
    default: null
  },

  gender: {
    type: String,
    default: null,
    trim: true
  },

  dateOfBirth: {
    type: Date,
    default: null
  },

  // ------------------------------------
  // PASSWORDS
  // ------------------------------------
  password: { type: String, required: true },
  classTeacherPassword: { type: String, default: null },
  grade: { type: String, default: null }, // Current grade for students
  passwordMustChange: { type: Boolean, default: false },
  pathway: {
    type: String,
    enum: ['STEM', 'Social Sciences', 'Arts & Sports Science', 'N/A'],
    default: null,  // 🆕 Allow null for non-senior school students
    trim: true
  },

  // ------------------------------------
  // CLASS / SUBJECT ALLOCATION
  // ------------------------------------
  allocations: { type: [allocationSchema], default: [] },
  assignedClass: {
    type: String,
    default: null,
    set: (value) => normalizeClassGradeValue(value)
  },
  assignedStream: { 
    type: String, 
    default: null,
    trim: true,
    uppercase: true,
    validate: {
      validator: v => !v || /^[A-Z]+$/.test(v),
      message: "Stream must contain letters only."
    }
  },
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
  createdAt: { type: Date, default: Date.now },
}, {
  discriminatorKey: 'role', // 🚀 This tells Mongoose to use your existing 'role' field
  timestamps: true
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
userSchema.index({ pathway: 1 }); // Optimize pathway-based lookups
userSchema.index({ grade: 1 }); // Optimize grade-based lookups
userSchema.index({ schoolId: 1, role: 1 }); // Optimize filtering users by role within a school

// 🚀 Supporting bulk lookups in MarkController (find all students in a class by admission list)
userSchema.index({ schoolId: 1, role: 1, name: 1 }); // Optimize for searching users by name within a role and school
userSchema.index(
  { schoolId: 1, admission: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: 'student',
      admission: { $type: 'string' }
    }
  }
); // 🛡️ Unique for students only, avoiding collisions for staff accounts with no admission

// Index to quickly find highest numeric admission per school
userSchema.index({ schoolId: 1, numericAdmission: -1 });

// Pre-save hook to compute numericAdmission from admission string
userSchema.pre('save', function (next) {
  try {
    if (this.role === 'student' && this.admission) {
      const m = String(this.admission).trim().match(/(\d+)(?!.*\d)/);
      this.numericAdmission = m ? Number(m[1]) : null;
    } else {
      this.numericAdmission = null;
    }
  } catch (err) {
    this.numericAdmission = null;
  }
  next();
});

userSchema.index({ name: "text", admission: "text", email: "text" }); // Enable fast text search

export const User = mongoose.model("User", userSchema);
