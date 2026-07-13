import mongoose from "mongoose";

const balanceSummarySchema = new mongoose.Schema(
  {
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
    academicYear: {
      type: Number,
      required: true,
      index: true
    },
    grade: {
      type: String,
      default: null
    },
    totalFee: {
      type: Number,
      default: 0
    },
    totalPaid: {
      type: Number,
      default: 0
    },
    balance: {
      type: Number,
      default: 0
    },
    term1Fee: {
      type: Number,
      default: 0
    },
    term1Paid: {
      type: Number,
      default: 0
    },
    term1Balance: {
      type: Number,
      default: 0
    },
    term2Fee: {
      type: Number,
      default: 0
    },
    term2Paid: {
      type: Number,
      default: 0
    },
    term2Balance: {
      type: Number,
      default: 0
    },
    term3Fee: {
      type: Number,
      default: 0
    },
    term3Paid: {
      type: Number,
      default: 0
    },
    term3Balance: {
      type: Number,
      default: 0
    },
    broughtForwardAmount: {
      type: Number,
      default: 0
    },
    lastRecomputedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

balanceSummarySchema.index({ schoolId: 1, academicYear: 1, studentId: 1 }, { unique: true });

export default mongoose.model("BalanceSummary", balanceSummarySchema);
