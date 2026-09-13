import mongoose from "mongoose";
import { loadEnvironmentFiles } from "../utils/envConfig.js";

loadEnvironmentFiles({ env: process.env.NODE_ENV || "development" });
const { default: config } = await import("../config.js");
const applyChanges = process.argv.includes("--apply");

const removeLegacyFirstname = async () => {
  if (!config.database.uri) {
    throw new Error("No MongoDB connection string is configured.");
  }

  await mongoose.connect(config.database.uri, config.database.options);
  const users = mongoose.connection.collection("users");
  const filter = { firstname: { $exists: true } };
  const count = await users.countDocuments(filter);

  if (!applyChanges) {
    console.log(`Dry run: ${count} user records contain the legacy firstname field.`);
    console.log("No database records were changed. Run again with --apply to remove it.");
    return;
  }

  const result = await users.updateMany(filter, { $unset: { firstname: "" } });
  console.log(`Legacy firstname cleanup complete. Matched: ${result.matchedCount}, modified: ${result.modifiedCount}.`);
};

try {
  await removeLegacyFirstname();
} catch (error) {
  console.error("Legacy firstname cleanup failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
