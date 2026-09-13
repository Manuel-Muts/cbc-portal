// controllers/resetController.js
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import sendSMS from "../utils/sendSMS.js";


// ----------------------------------
// Generate 6-digit OTP
// ----------------------------------
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ============================================================
// 0️⃣ VERIFY USER (role + email)
// ============================================================
export const verifyUser = async (req, res) => {
  const { role, email, username } = req.body;

  if (!role || ((!email) && (!username))) {
    return res.status(400).json({ msg: "Missing required fields" }); //
  }

  try {
    const isLearner = ["student", "learner"].includes(String(role).toLowerCase());
    const user = isLearner
      ? await User.findOne({ role: "student", username: String(username).trim().toLowerCase() })
      : await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Check role - Allow matches for primary role OR class teacher designation
    const roleMatches =
      user.role === String(role).toLowerCase() ||
      (role === "classteacher" && user.isClassTeacher === true);

    if (!roleMatches) {
      return res.status(400).json({ msg: "Role mismatch" });
    }

    // All good
    res.json({ msg: "User verified" });
  } catch (err) {
    console.error("verifyUser error:", err);
    res.status(500).json({ msg: "Server error verifying user" });
  }
};

// ============================================================
// 1️⃣ REQUEST RESET CODE (via Brevo API) with logging
// ============================================================
import fetch from "node-fetch"; // or native fetch if Node >=18

export const requestReset = async (req, res) => {
  const { email, username, role } = req.body;
  const isLearner = ["student", "learner"].includes(String(role || "").toLowerCase());
  if ((!isLearner && !email) || (isLearner && !username)) return res.status(400).json({ msg: isLearner ? "Username is required" : "Email is required" });

  try {
    const user = isLearner
      ? await User.findOne({ role: "student", username: String(username).trim().toLowerCase() })
      : await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(404).json({ msg: isLearner ? "No learner account with that username" : "No account with that email" });

    // Generate 6-digit OTP
    const code = generateCode();
    const hashed = await bcrypt.hash(code, 10);

    // Save reset info in DB
    user.resetCode = hashed;
    user.resetAttempts = 0;
    user.resetCodeExpires = Date.now() + 10 * 60 * 1000; // 10 mins
    await user.save();

    if (isLearner) {
      if (!user.contact) return res.status(400).json({ msg: "No parent or guardian phone number is registered" });
      const smsResult = await sendSMS(user.contact, `CompetenceHub password reset code: ${code}. It expires in 10 minutes. Do not share this code.`);
      if (!smsResult) return res.status(503).json({ msg: "Unable to send code to the parent or guardian phone" });
      return res.json({ msg: "Reset code sent to the parent or guardian phone" });
    }

    // -------------------------
    // Send email via Brevo API
    // -------------------------
    const payload = {
      sender: { name: "COMPETENCEHUB", email: process.env.EMAIL_USER },
      to: [{ email: user.email, name: user.firstname || user.name }],
      subject: "Password Reset",
      htmlContent: `
        <h3>Hello ${user.firstname || user.name}</h3>
        <p>Your Password Reset Code is:</p>
        <div style="
          font-size: 26px;
          font-weight: bold;
          letter-spacing: 4px;
          margin: 10px 0;
        ">${code}</div>
        <p>This code expires in <b>10 minutes</b>.</p>
        <p>If you didn’t request this, ignore this email.</p>
      `
    };

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const brevoData = await brevoRes.json().catch(() => null);

    // Log full Brevo response for debugging
    console.log("Brevo API response:", {
      status: brevoRes.status,
      ok: brevoRes.ok,
      body: brevoData
    });

    if (!brevoRes.ok) {
      return res.status(500).json({
        msg: "Failed to send reset code",
        brevo: brevoData // include Brevo error message
      });
    }

    res.json({ msg: "Reset code sent to your email" });

  } catch (err) {
    console.error("requestReset error:", err);
    res.status(500).json({ msg: "Failed to send reset code", error: err.message });
  }
};
// ============================================================
// 2️⃣ VERIFY RESET CODE
// ============================================================
   export const verifyResetCode = async (req, res) => {
    const { email, username, code, role } = req.body;

    const isLearner = ["student", "learner"].includes(String(role || "").toLowerCase());
    if ((!isLearner && !email) || (isLearner && !username) || !code)
      return res.status(400).json({ msg: isLearner ? "Username and code are required" : "Email and code are required" });

  try {
      const user = isLearner
        ? await User.findOne({ role: "student", username: String(username).trim().toLowerCase() })
        : await User.findOne({ email: String(email).trim().toLowerCase() });
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
  const { email, username, role, code, password } = req.body;
  const isLearner = ["student", "learner"].includes(String(role || "").toLowerCase());

  if (((!isLearner && !email) || (isLearner && !username)) || !code || !password)
    return res.status(400).json({ msg: "Missing fields" });

  try {
    const user = isLearner
      ? await User.findOne({ role: "student", username: String(username).trim().toLowerCase() })
      : await User.findOne({ email: String(email).trim().toLowerCase() });
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
