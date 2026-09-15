import mongoose from "mongoose";
import { loadEnvironmentFiles } from "../utils/envConfig.js";
import Mark from "../models/mark.js";

loadEnvironmentFiles({ env: process.env.NODE_ENV || "development" });
const { default: config } = await import("../config.js");
const applyChanges = process.argv.includes("--apply");

const migrate = async () => {
  if (!config.database.uri) throw new Error("No MongoDB connection string is configured.");

  await mongoose.connect(config.database.uri, config.database.options);

  const legacyFilter = {
    $or: [
      { paper: { $exists: false } },
      { paper: null },
      { outOf: { $exists: false } },
      { outOf: null }
    ]
  };
  const legacyCount = await Mark.countDocuments(legacyFilter);
  console.log(`${applyChanges ? "Updating" : "Would update"} ${legacyCount} legacy mark records to combined / 100.`);

  if (applyChanges && legacyCount > 0) {
    await Mark.updateMany(legacyFilter, { $set: { paper: "combined", outOf: 100 } });
  }

  const indexes = await Mark.collection.indexes();
  const legacyIndex = indexes.find(index => index.name === "idx_uniqueness_check");
  if (legacyIndex) {
    console.log(`${applyChanges ? "Dropping" : "Would drop"} legacy unique index idx_uniqueness_check.`);
    if (applyChanges) await Mark.collection.dropIndex("idx_uniqueness_check");
  }

  if (applyChanges) {
    await Mark.collection.createIndex(
      { schoolId: 1, year: 1, term: 1, assessment: 1, subject: 1, paper: 1, pathway: 1, course: 1, admissionNo: 1 },
      { name: "idx_uniqueness_check_v2", unique: true }
    ).catch(error => {
      if (error.codeName !== "IndexOptionsConflict" && error.code !== 85) throw error;
    });
  } else {
    console.log("No database records or indexes were changed. Run with --apply to perform the migration.");
  }
};

try {
  await migrate();
  console.log(`Mark paper migration ${applyChanges ? "complete" : "dry run complete"}.`);
} finally {
  await mongoose.disconnect();
}