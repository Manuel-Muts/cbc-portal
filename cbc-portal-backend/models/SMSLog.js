import mongoose from "mongoose";

const smsLogSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    recipient: {
      type: String,
      required: true
    },
    studentName: {
      type: String
    },
    content: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["Sent", "Failed", "Delivered"],
      default: "Sent"
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: "30d" // 🆕 Auto-delete logs after 30 days to save space
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient history browsing
smsLogSchema.index({ schoolId: 1, createdAt: -1 });
smsLogSchema.index({ recipient: 1 });

export default mongoose.model("SMSLog", smsLogSchema);