import dns from "node:dns";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Force Node.js to use Google DNS
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const uri = process.env.MONGO_URI;

async function run() {
  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ Connection failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();