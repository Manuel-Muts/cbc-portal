import DashboardSummary from '../models/DashboardSummary.js';
import { School } from '../models/school.js';
import { User } from '../models/User.js';
import Payment from '../models/Payment.js';
import { Expense } from '../models/Expense.js';
import Announcement from '../models/Announcement.js';

export const buildDashboardSummaryPayload = ({
  schoolId,
  totalStudents = 0,
  activeStudents = 0,
  feesCollected = 0,
  termFeesCollected = 0,
  feesPending = 0,
  monthlyExpenses = 0,
  termExpenses = 0,
  activeTerm = 'Term 1',
  smsCredits = 0,
  unreadAnnouncements = 0,
  updatedAt = new Date()
} = {}) => ({
  schoolId,
  totalStudents,
  activeStudents,
  feesCollected,
  termFeesCollected,
  feesPending,
  monthlyExpenses,
  termExpenses,
  activeTerm,
  smsCredits,
  unreadAnnouncements,
  updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt).toISOString()
});

const getDayStart = () => new Date(new Date().setHours(0, 0, 0, 0));

export const getDashboardSummaryRetentionCutoffDate = (daysToKeep = 7) => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  return cutoff;
};

export const pruneOldDashboardSummaries = async ({ daysToKeep = 7 } = {}) => {
  const cutoffDate = getDashboardSummaryRetentionCutoffDate(daysToKeep);

  const result = await DashboardSummary.deleteMany({
    summaryDate: { $lt: cutoffDate }
  });

  return {
    deletedCount: result.deletedCount || 0,
    cutoffDate
  };
};

export const computeDashboardSummaryForSchool = async (schoolId) => {
  const school = await School.findById(schoolId).select('smsCredits termConfig.activeTerm').lean();
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const activeTerm = school?.termConfig?.activeTerm || 'Term 1';

  const [
    totalStudents,
    feesCollectedResult,
    termFeesCollectedResult,
    monthlyExpensesResult,
    termExpensesResult,
    unreadAnnouncements
  ] = await Promise.all([
    User.countDocuments({ schoolId, role: 'student' }),
    Payment.aggregate([
      {
        $match: {
          schoolId,
          academicYear: currentYear,
          isReversed: { $ne: true }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          schoolId,
          academicYear: currentYear,
          term: activeTerm,
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
    Expense.aggregate([
      {
        $match: {
          schoolId,
          academicYear: currentYear,
          term: activeTerm
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Announcement.countDocuments({
      schoolId,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    })
  ]);

  const feesCollected = Number(feesCollectedResult[0]?.total || 0);
  const termFeesCollected = Number(termFeesCollectedResult[0]?.total || 0);
  const monthlyExpenses = Number(monthlyExpensesResult[0]?.total || 0);
  const termExpenses = Number(termExpensesResult[0]?.total || 0);
  const summary = buildDashboardSummaryPayload({
    schoolId: String(schoolId),
    totalStudents,
    activeStudents: totalStudents,
    feesCollected,
    termFeesCollected,
    feesPending: 0,
    monthlyExpenses,
    termExpenses,
    activeTerm,
    smsCredits: Number(school?.smsCredits || 0),
    unreadAnnouncements,
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
  const school = await School.findById(schoolId).select('termConfig.activeTerm').lean();
  const activeTerm = school?.termConfig?.activeTerm || 'Term 1';

  if (summary && summary.activeTerm === activeTerm) {
    return summary;
  }

  return computeDashboardSummaryForSchool(schoolId);
};
