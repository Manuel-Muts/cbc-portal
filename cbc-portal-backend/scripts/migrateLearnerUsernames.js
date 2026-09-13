import crypto from "crypto";
import mongoose from "mongoose";
import { loadEnvironmentFiles } from "../utils/envConfig.js";
import { School } from "../models/school.js";
import { User } from "../models/User.js";
import { generateLearnerUsername } from "../utils/authHelpers.js";

loadEnvironmentFiles({ env: process.env.NODE_ENV || "development" });
const { default: config } = await import("../config.js");
const applyChanges = process.argv.includes("--apply");

const createSchoolCode = async () => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let schoolCode;
  do {
    const randomBytes = crypto.randomBytes(4);
    const codeCharacters = Array.from(randomBytes, (byte) => characters[byte % characters.length]);
    codeCharacters[randomBytes[0] % codeCharacters.length] = letters[randomBytes[1] % letters.length];
    schoolCode = codeCharacters.join("");
  } while (await School.exists({ schoolCode }));
  return schoolCode;
};

const migrate = async () => {
  if (!config.database.uri) {
    throw new Error("No MongoDB connection string is configured.");
  }

  await mongoose.connect(config.database.uri, config.database.options);

  const schools = await School.find({
    $or: [
      { schoolCode: { $exists: false } },
      { schoolCode: null },
      { schoolCode: "" },
      { schoolCode: { $not: /[A-Z]/ } }
    ]
  }).select("_id name schoolCode").lean();

  const schoolCodes = new Map();
  for (const school of schools) {
    const schoolCode = await createSchoolCode();
    schoolCodes.set(String(school._id), schoolCode);
    console.log(`${applyChanges ? "Assigning" : "Would assign"} school code ${schoolCode} to ${school.name}`);
    if (applyChanges) {
      await School.updateOne({ _id: school._id }, { $set: { schoolCode } });
    }
  }

  const schoolsWithCodes = await School.find({ schoolCode: { $type: "string", $ne: "" } })
    .select("_id name schoolCode")
    .lean();
  for (const school of schoolsWithCodes) {
    if (!schoolCodes.has(String(school._id))) {
      schoolCodes.set(String(school._id), school.schoolCode);
    }
  }

  const learners = await User.find({
    role: "student",
    admission: { $type: "string", $ne: "" }
  }).select("_id name admission schoolId username").lean();

  let assigned = 0;
  let skipped = 0;
  for (const learner of learners) {
    const schoolCode = schoolCodes.get(String(learner.schoolId));
    if (!schoolCode) {
      console.warn(`Skipping ${learner.name || learner._id}: school has no code.`);
      skipped += 1;
      continue;
    }

    const username = generateLearnerUsername(learner.admission, schoolCode).toLowerCase();
    if (learner.username && learner.username.toLowerCase() === username) {
      continue;
    }

    const existing = await User.findOne({ username, _id: { $ne: learner._id } }).select("_id").lean();
    if (existing) {
      console.warn(`Skipping ${learner.name || learner._id}: username ${username} already exists.`);
      skipped += 1;
      continue;
    }

    console.log(`${applyChanges ? "Assigning" : "Would assign"} ${username} to ${learner.name || learner._id}`);
    if (applyChanges) {
      await User.updateOne({ _id: learner._id }, { $set: { username } });
    }
    assigned += 1;
  }

  console.log(`Migration ${applyChanges ? "complete" : "dry run complete"}. Schools: ${schools.length}; learners assigned: ${assigned}; skipped: ${skipped}.`);
  if (!applyChanges) {
    console.log("No database records were changed. Run again with --apply to write these values.");
  }
};

try {
  await migrate();
} catch (error) {
  console.error("Learner username migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
