import mongoose from "mongoose";
import { loadEnvironmentFiles } from "../utils/envConfig.js";

loadEnvironmentFiles({ env: process.env.NODE_ENV || "development" });
const { default: config } = await import("../config.js");

const removeLegacyMarkFields = async () => {
  if (!config.database.uri) {
    throw new Error("No MongoDB connection string is configured.");
  }

  await mongoose.connect(config.database.uri, config.database.options);
  const result = await mongoose.connection.collection("marks").updateMany(
    {},
    { $unset: { continuousAssessment: "", projectWork: "", endTermExam: "", finalScore: "", performanceLevel: "" } }
  );

  console.log(`Legacy mark fields removed. Matched: ${result.matchedCount}, modified: ${result.modifiedCount}.`);
};

try {
  await removeLegacyMarkFields();
} catch (error) {
  console.error("Failed to remove legacy mark fields:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
