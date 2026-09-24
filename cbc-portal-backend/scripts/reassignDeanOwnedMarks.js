import mongoose from 'mongoose';
import { loadEnvironmentFiles } from '../utils/envConfig.js';
import Mark from '../models/mark.js';
import { User } from '../models/User.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'production' });

const normalizeValue = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^grade\s*/i, '')
  .replace(/\s+/g, ' ');

const matchesAllocation = (allocation, mark) => {
  const allocationGrade = normalizeValue(allocation.grade);
  const markGrade = normalizeValue(mark.grade);
  const allocationStream = String(allocation.stream || '').trim().toUpperCase();
  const markStream = String(mark.stream || '').trim().toUpperCase();
  const subject = normalizeValue(mark.course || mark.subject);

  return allocationGrade === markGrade
    && (!allocationStream || allocationStream === markStream)
    && (allocation.subjects || []).some(item => normalizeValue(item) === subject);
};

const shouldApply = process.argv.includes('--apply');
const resolveMongoUri = () => process.env.MONGO_URI || process.env.MONGO_URL
  || (String(process.env.DB_SOURCE || '').toLowerCase() === 'local' ? process.env.MONGO_LOCAL : process.env.MONGO_ATLAS || process.env.MONGO_LOCAL);

const mongoUri = resolveMongoUri();
if (!mongoUri) throw new Error('MongoDB connection string is not configured.');
const mongoTargetWithoutScheme = mongoUri.replace(/^[^:]+:\/\//, '');
const mongoAuthority = mongoTargetWithoutScheme.split('/')[0];
const mongoHost = mongoAuthority.split('@').pop().split(',')[0].split(':')[0];
const mongoDatabase = mongoTargetWithoutScheme.split('/')[1]?.split('?')[0] || 'default database';
const mongoSource = process.env.MONGO_URI || process.env.MONGO_URL
  ? 'MONGO_URI/MONGO_URL'
  : String(process.env.DB_SOURCE || '').toLowerCase() === 'local'
    ? 'MONGO_LOCAL'
    : process.env.MONGO_ATLAS
      ? 'MONGO_ATLAS'
      : 'MONGO_LOCAL';
    console.log(`Mongo target: ${mongoSource} | ${mongoHost} | ${mongoDatabase}`);

try {
  await mongoose.connect(mongoUri);

  const deanUsers = await User.find({
    schoolId: { $ne: null },
    $or: [{ role: 'dean' }, { isDean: true }]
  }).select('_id name schoolId allocations').lean();
  const deanIds = new Set(deanUsers.map(user => String(user._id)));
    const teachers = await User.find({ role: 'teacher', schoolId: { $ne: null }, isDean: { $ne: true } })
    .select('_id name schoolId allocations')
    .lean();
  const deanOwnedMarks = await Mark.find({ teacherId: { $in: [...deanIds] } }).lean();

  for (const dean of deanUsers) {
    const ownedCount = deanOwnedMarks.filter(mark => String(mark.teacherId) === String(dean._id)).length;
     console.log(`Dean account: ${dean.name || dean._id} (${dean._id}) owns ${ownedCount} marks`);
    console.log(`  allocations: ${(dean.allocations || []).map(allocation => `${allocation.grade} ${allocation.stream || ''}: ${(allocation.subjects || []).join(', ')}`).join(' | ') || 'none'}`);
  }

  const updates = [];
  const legitimate = [];
  const unmatched = [];
  const ambiguous = [];

  for (const mark of deanOwnedMarks) {
    const owner = deanUsers.find(dean => String(dean._id) === String(mark.teacherId));
    if (owner && (owner.allocations || []).some(allocation => matchesAllocation(allocation, mark))) {
      legitimate.push(mark);
      continue;
    }

    const candidates = teachers.filter(teacher =>
      String(teacher.schoolId) === String(mark.schoolId)
      && (teacher.allocations || []).some(allocation => matchesAllocation(allocation, mark))
    );

    if (candidates.length === 1) {
      updates.push({ mark, teacher: candidates[0] });
    } else if (candidates.length === 0) {
      unmatched.push(mark);
    } else {
      ambiguous.push({ mark, candidates });
    }
  }

  console.log(`Dean-owned marks found: ${deanOwnedMarks.length}`);
  console.log(`Legitimate Dean-teacher marks: ${legitimate.length}`);
  console.log(`Uniquely matched: ${updates.length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Ambiguous: ${ambiguous.length}`);

  if (shouldApply && updates.length > 0) {
    const result = await Mark.bulkWrite(updates.map(({ mark, teacher }) => ({
      updateOne: {
        filter: { _id: mark._id, teacherId: mark.teacherId },
        update: { $set: { teacherId: teacher._id } }
      }
    })));
    console.log(`Reassigned: ${result.modifiedCount || 0}`);
  } else if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to reassign uniquely matched marks.');
  }
} finally {
  await mongoose.disconnect().catch(() => {});
}