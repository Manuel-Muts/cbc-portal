import mongoose from 'mongoose';

const dashboardSummarySchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  summaryDate: {
    type: Date,
    required: true,
    index: true
  },
  totalStudents: { type: Number, default: 0 },
  activeStudents: { type: Number, default: 0 },
  feesCollected: { type: Number, default: 0 },
  feesPending: { type: Number, default: 0 },
  monthlyExpenses: { type: Number, default: 0 },
  smsCredits: { type: Number, default: 0 },
  unreadAnnouncements: { type: Number, default: 0 },
  pendingMarks: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

dashboardSummarySchema.index({ schoolId: 1, summaryDate: -1 }, { unique: true });

export default mongoose.model('DashboardSummary', dashboardSummarySchema);
