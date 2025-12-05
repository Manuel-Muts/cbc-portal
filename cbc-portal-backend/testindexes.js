import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./models/User.js";
import { Material } from "./models/Material.js";
import { Mark } from "./models/mark.js";

dotenv.config(); // ✅ load .env so process.env.MONGO_URI is available

async function runTests() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // USER INDEX TEST
    const userExplain = await User.find({ role: "teacher" }).explain("executionStats");
    console.log("\n--- User Query Explain ---");
    console.log(JSON.stringify(userExplain.executionStats.executionStages, null, 2));

    // MATERIAL INDEX TEST
    const materialExplain = await Material.find({ grade: "Grade 6", subject: "Math" }).explain("executionStats");
    console.log("\n--- Material Query Explain ---");
    console.log(JSON.stringify(materialExplain.executionStats.executionStages, null, 2));

    // MARK INDEX TEST
    const markExplain = await Mark.find({ grade: "8", year: 2025, term: 2 }).explain("executionStats");
    console.log("\n--- Mark Query Explain ---");
    console.log(JSON.stringify(markExplain.executionStats.executionStages, null, 2));

    await mongoose.disconnect();
    console.log("\n✅ Tests complete, connection closed.");
  } catch (err) {
    console.error("❌ Error running index tests:", err);
  }
}

runTests();