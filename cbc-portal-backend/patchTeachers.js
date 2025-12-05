import mongoose from "mongoose";
import { User } from "./models/User.js"; // adjust path if needed

const run = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/cbcportal"); // replace with your DB name

    const result = await User.updateMany(
      { role: { $in: ["teacher", "classTeacher"] } },
      { $set: { passwordMustChange: true } }
    );

    console.log(`✅ Updated ${result.modifiedCount} teacher/classTeacher records`);
    process.exit(0);
  } catch (err) {
    console.error("Error patching teachers:", err);
    process.exit(1);
  }
};

run();