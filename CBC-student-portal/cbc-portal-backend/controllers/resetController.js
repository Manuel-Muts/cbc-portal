// controllers/resetController.js
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";


// ----------------------------------
// Generate 6-digit OTP
// ----------------------------------
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ------------------------
// Create transporter
// ------------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: Number(process.env.EMAIL_PORT) === 465, // true if using SSL port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // ✅ allow self-signed certificates
  },
});
// ============================================================
// 0️⃣ VERIFY USER (role + name + email)
// ============================================================
export const verifyUser = async (req, res) => {
  const { role, name, email } = req.body; // 'name' sent from frontend

  if (!role || !name || !email) {
    return res.status(400).json({ msg: "Missing required fields" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Check role
    if (user.role !== role) {
      return res.status(400).json({ msg: "Role mismatch" });
    }

    // Flexible name check: lowercase, trim, remove extra spaces
    const normalize = str => str?.toLowerCase().replace(/\s+/g, " ").trim();

    const dbName = user.name; // <-- use 'name' from DB
    if (normalize(dbName) !== normalize(name)) {
      return res.status(400).json({ msg: "Fullname mismatch" });
    }

    // All good
    res.json({ msg: "User verified" });
  } catch (err) {
    console.error("verifyUser error:", err);
    res.status(500).json({ msg: "Server error verifying user" });
  }
};

// ============================================================
// 1️⃣ REQUEST RESET CODE
// ============================================================
export const requestReset = async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ msg: "Email is required" });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ msg: "No account with that email" });

    const code = generateCode();
    const hashed = await bcrypt.hash(code, 10);

    user.resetCode = hashed;
    user.resetAttempts = 0;
    user.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    await transporter.sendMail({
      from: `"CBC Portal" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Portal Password Reset",
      html: `
        <h3>Hello ${user.firstname || user.name}</h3>
        <p>Your password reset code is:</p>
        <div style="
          font-size: 26px;
          font-weight: bold;
          letter-spacing: 4px;
          margin: 10px 0;
        ">${code}</div>
        <p>This code expires in <b>10 minutes</b>.</p>
        <p>If you didn’t request this, ignore this email.</p>
      `,
    });

    res.json({ msg: "Reset code sent to your email" });
  } catch (err) {
    console.error("requestReset error:", err);
    res.status(500).json({ msg: "Failed to send reset code" });
  }
};

// ============================================================
// 2️⃣ VERIFY RESET CODE
// ============================================================
export const verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code)
    return res.status(400).json({ msg: "Email & code are required" });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ msg: "User not found" });

    if (!user.resetCode || !user.resetCodeExpires)
      return res.status(400).json({ msg: "No reset request found" });

    if (Date.now() > user.resetCodeExpires)
      return res.status(400).json({ msg: "Code expired" });

    // 5 attempts max
    if (user.resetAttempts >= 5)
      return res.status(429).json({ msg: "Too many attempts" });

    const isMatch = await bcrypt.compare(code, user.resetCode);

    if (!isMatch) {
      user.resetAttempts += 1;
      await user.save();
      return res.status(400).json({ msg: "Invalid code" });
    }

    // Success → mark code as verified
    user.resetVerified = true;
    await user.save();

    res.json({ msg: "Code verified" });
  } catch (err) {
    console.error("verifyResetCode error:", err);
    res.status(500).json({ msg: "Server error verifying code" });
  }
};

// ============================================================
// 3️⃣ SET NEW PASSWORD
// ============================================================
export const setNewPassword = async (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password)
    return res.status(400).json({ msg: "Missing fields" });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ msg: "User not found" });

    if (!user.resetVerified)
      return res.status(400).json({ msg: "Code not verified" });

    // ensure again: match code
    const valid = await bcrypt.compare(code, user.resetCode);
    if (!valid)
      return res.status(400).json({ msg: "Invalid OTP" });

    if (Date.now() > user.resetCodeExpires)
      return res.status(400).json({ msg: "Code expired" });

    const hashed = await bcrypt.hash(password, 12);

    user.password = hashed;

    // Clear reset fields
    user.resetCode = null;
    user.resetCodeExpires = null;
    user.resetAttempts = 0;
    user.resetVerified = false;

    await user.save();

    res.json({ msg: "Password reset successful" });
  } catch (err) {
    console.error("setNewPassword error:", err);
    res.status(500).json({ msg: "Error resetting password" });
  }
};
