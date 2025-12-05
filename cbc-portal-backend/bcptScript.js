// bcptScript.js
import bcrypt from "bcryptjs";

const password = "Ken12345";
const hash = await bcrypt.hash(password, 10);

console.log("Generated hash:", hash);