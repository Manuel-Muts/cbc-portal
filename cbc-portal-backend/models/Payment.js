// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true
    },

    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function (v) {
          // Allow negative amounts only for reversal entries
          if (this.method === 'reversal') return v < 0;
          return v >= 0;
        },
        message: function (props) {
          if (this.method === 'reversal') return `Reversal payments must be negative`; 
          return `Amount must be non-negative`;
        }
      }
    },

    method: {
      type: String,
      enum: ["cash", "mpesa", "bank", "cheque", "reversal"],
      required: true
    },

    reference: {
      type: String, // mpesa receipt / bank ref
      required: true,
      unique: true
    },

    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    recordedByRole: {
      type: String,
      enum: ["accounts"],
      required: true
    },

    academicYear: {
      type: Number,
      required: true
    },

    term: {
      type: String,
      enum: ["Term 1", "Term 2", "Term 3"],
      required: true
    }
  },
  { timestamps: true }
);

// 🔒 IMMUTABLE LEDGER
paymentSchema.pre("findOneAndUpdate", function () {
  throw new Error("Payments cannot be edited. Create a reversal instead.");
});

paymentSchema.pre("deleteOne", function () {
  throw new Error("Payments cannot be deleted.");
});

export default mongoose.model("Payment", paymentSchema);
