// models/ElectiveSet.js

import mongoose from "mongoose";

const ElectiveSetSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  grade: {
    type: String,
    required: true
  },

  subjects: [{
    type: String
  }],

  maxSubjects: {
    type: Number,
    default: 3
  },

  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

export default mongoose.model("ElectiveSet", ElectiveSetSchema);