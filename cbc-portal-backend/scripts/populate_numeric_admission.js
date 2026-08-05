import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User.js';

dotenv.config();

// Resolve Mongo connection string from common env vars used by this project.
// Prefer explicit MONGO_URI/MONGO_URL, then MONGO_ATLAS, then MONGO_LOCAL.
const MONGO = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGO_ATLAS || process.env.MONGO_LOCAL;
if (!MONGO) {
  console.error('Please set a Mongo connection string in MONGO_URI, MONGO_URL, MONGO_ATLAS or MONGO_LOCAL in your environment or .env file.');
  process.exit(1);
}

async function parseNumeric(admission) {
  if (!admission) return null;
  const m = String(admission).trim().match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB');

  const cursor = User.find({ role: 'student' }).select('admission').cursor();
  let updated = 0;
  let total = 0;

  for await (const doc of cursor) {
    total++;
    const num = await parseNumeric(doc.admission);
    if (doc.numericAdmission !== num) {
      await User.updateOne({ _id: doc._id }, { $set: { numericAdmission: num } });
      updated++;
    }
    if (total % 500 === 0) console.log(`Processed ${total} students, updated ${updated}`);
  }

  console.log(`Done. Processed ${total} students, updated ${updated}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
