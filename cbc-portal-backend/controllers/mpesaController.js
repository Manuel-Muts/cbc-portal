// controllers/mpesaController.js
import Payment from "../models/Payment.js";
import { User } from "../models/User.js";
import { School } from "../models/school.js";
import bcrypt from "bcryptjs";

export const mpesaCallback = async (req, res) => {
  try {
    const callback = req.body;

    // Handle C2B callbacks only
    let amount, receipt, phone, admission, businessShortCode;

    if (callback.TransID) {
      // C2B CALLBACK (Manual Paybill Payment)
      amount = callback.TransAmount;
      receipt = callback.TransID;
      phone = callback.MSISDN;
      admission = callback.BillRefNumber; // Account reference (admission number)
      businessShortCode = callback.BusinessShortCode;
    } else {
      console.log("Unknown callback format");
      return res.json({ ResultCode: 0 });
    }

    // 🔎 Find school by paybill number
    const school = await School.findOne({
      paybill: businessShortCode,
      status: "Active"
    });

    if (!school) {
      console.log(`No school found with paybill: ${businessShortCode}`);
      return res.json({ ResultCode: 0 });
    }

    // 🔎 Find student by admission number within this school
    const student = await User.findOne({
      admission,
      role: "student",
      schoolId: school._id
    });

    if (!student) {
  await Payment.create({
    schoolId: school._id,
    amount,
    method: "mpesa",
    reference: receipt,
    admission,
    phone,
    status: "unmatched",
    term: getCurrentTerm(),
    academicYear: new Date().getFullYear()
  });

  console.log(`Unmatched payment: ${admission}`);

  return res.json({ ResultCode: 0 });
}

    // 🔐 Prevent duplicate recording
    const exists = await Payment.findOne({ reference: receipt });
    if (exists) {
      console.log(`Payment ${receipt} already recorded`);
      return res.json({ ResultCode: 0 });
    }

    // Ensure we have a valid accounts user to record the payment
    let recorder = await User.findOne({ role: "accounts", schoolId: school._id });
    if (!recorder) {
      try {
        const sysEmail = `mpesa-system+${school._id}@local`;
        const raw = Math.random().toString(36).slice(2, 10);
        const hashed = await bcrypt.hash(raw, 10);
        const sysUser = new User({
          name: `MPESA System - ${school.name}`,
          role: "accounts",
          email: sysEmail,
          password: hashed,
          passwordMustChange: false,
          schoolId: school._id,
          createdAt: new Date()
        });
        await sysUser.save();
        recorder = sysUser;
        console.log(`Created system accounts user for school ${school.name}`);
      } catch (err) {
        console.error("Failed to create system accounts user:", err);
      }
    }

    const recordedById = recorder ? recorder._id : null;

    await Payment.create({
      studentId: student._id,
      schoolId: school._id,
      amount,
      method: "mpesa",
      reference: receipt,
      term: getCurrentTerm(),
      academicYear: new Date().getFullYear(),
      recordedBy: recordedById,
      recordedByRole: "system"
    });

    console.log(`C2B Payment recorded: ${amount} KES for student ${student.name} (${admission}) at ${school.name}`);
    return res.json({ ResultCode: 0 });

  } catch (err) {
    console.error("MPESA CALLBACK ERROR:", err);
    return res.json({ ResultCode: 0 });
  }
};

function getCurrentTerm() {
  const month = new Date().getMonth() + 1;
  if (month <= 4) return "Term 1";
  if (month <= 8) return "Term 2";
  return "Term 3";
}
