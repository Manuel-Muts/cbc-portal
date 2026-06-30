// models/LearnerElective.js

import mongoose from "mongoose";

const LearnerElectiveSchema = new mongoose.Schema({

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },

  learnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "student",
    required: true
  },

  electiveSetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ElectiveSet"
  },

  grade: String,

  subjects: [{
    type: String
  }],

  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }

}, { timestamps: true });

// Add compound unique index
LearnerElectiveSchema.index(
  { learnerId: 1, electiveSetId: 1, schoolId: 1 },
  { unique: true }
);

export default mongoose.model("LearnerElective", LearnerElectiveSchema);
