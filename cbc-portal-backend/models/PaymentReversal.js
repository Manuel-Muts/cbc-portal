// models/PaymentReversal.js
import mongoose from "mongoose";

const paymentReversalSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true
    },

    reason: {
      type: String,
      required: true
    },

    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    reversedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
paymentReversalSchema.index({ paymentId: 1 });
paymentReversalSchema.index({ reversedBy: 1 });
paymentReversalSchema.index({ reversedAt: -1 });

export default mongoose.model("PaymentReversal", paymentReversalSchema);
