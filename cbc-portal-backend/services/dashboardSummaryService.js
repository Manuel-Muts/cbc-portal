import DashboardSummary from '../models/DashboardSummary.js';
import { School } from '../models/school.js';
import { User } from '../models/User.js';
import Payment from '../models/Payment.js';
import { Expense } from '../models/Expense.js';
import Announcement from '../models/Announcement.js';
import Mark from '../models/mark.js';

export const buildDashboardSummaryPayload = ({
  schoolId,
  totalStudents = 0,
  activeStudents = 0,
  feesCollected = 0,
  feesPending = 0,
  monthlyExpenses = 0,
  smsCredits = 0,
  unreadAnnouncements = 0,
  pendingMarks = 0,
  updatedAt = new Date()
} = {}) => ({
  schoolId,
  totalStudents,
  activeStudents,
  feesCollected,
  feesPending,
  monthlyExpenses,
  smsCredits,
  unreadAnnouncements,
  pendingMarks,
  updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString()
});

const getDayStart = () => new Date(new Date().setHours(0, 0, 0, 0));

export const computeDashboardSummaryForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).select('smsCredits').lean();
  const currentYear = new Date().getFullYear();

  const [
    totalStudents,
    feesCollectedResult,
    monthlyExpensesResult,
    unreadAnnouncements,
    pendingMarks
  ] = await Promise.all([
    User.countDocuments({ schoolId, role: 'student' }),
    Payment.aggregate([
      {
        $match: {
          schoolId,
          isReversed: { $ne: true }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Expense.aggregate([
      {
        $match: {
          schoolId,
          academicYear: currentYear
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Announcement.countDocuments({
      $or: [
        { schoolId, isActive: true },
        { schoolId: null, isActive: true }
      ]
    }),
    Mark.countDocuments({ schoolId, year: currentYear })
  ]);

  const feesCollected = Number(feesCollectedResult[0]?.total || 0);
  const monthlyExpenses = Number(monthlyExpensesResult[0]?.total || 0);
  const summary = buildDashboardSummaryPayload({
    schoolId: String(schoolId),
    totalStudents,
    activeStudents: totalStudents,
    feesCollected,
    feesPending: 0,
    monthlyExpenses,
    smsCredits: Number(school?.smsCredits || 0),
    unreadAnnouncements,
    pendingMarks,
    updatedAt: new Date()
  });

  const today = getDayStart();
  const stored = await DashboardSummary.findOneAndUpdate(
    { schoolId, summaryDate: today },
    { $set: { ...summary, summaryDate: today, updatedAt: new Date() } },
    { upsert: true, new: true }
  );

  return stored?.toObject ? stored.toObject() : stored;
};

export const refreshDashboardSummaryForSchool = async (schoolId) => {
  return computeDashboardSummaryForSchool(schoolId);
};

export const refreshAllDashboardSummaries = async () => {
  const schools = await School.find().select('_id');
  const results = [];

  for (const school of schools) {
    const result = await computeDashboardSummaryForSchool(school._id);
    results.push(result);
  }

  return results;
};

export const getCurrentDashboardSummaryForSchool = async (schoolId) => {
  const today = getDayStart();
  const summary = await DashboardSummary.findOne({ schoolId, summaryDate: today }).lean();

  if (summary) {
    return summary;
  }

  return computeDashboardSummaryForSchool(schoolId);
};
