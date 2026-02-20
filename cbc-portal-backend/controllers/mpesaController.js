// controllers/mpesaController.js
import Payment from "../models/Payment.js";
import { User } from "../models/User.js";
import { School } from "../models/school.js";
import bcrypt from "bcryptjs";
import axios from "axios";
import base64 from "base-64";


export const mpesaCallback = async (req, res) => {
  try {
    const callback = req.body;

    // Handle both STK Push and C2B callbacks
    let amount, receipt, phone, admission, businessShortCode, isC2B = false;

    if (callback.Body?.stkCallback) {
      // STK PUSH CALLBACK
      const resultCode = callback.Body.stkCallback.ResultCode;
      if (resultCode !== 0) return res.json({ ResultCode: 0 });

      const metadata = callback.Body.stkCallback.CallbackMetadata.Item;
      const getItem = (name) => metadata.find(i => i.Name === name)?.Value;

      amount = getItem("Amount");
      receipt = getItem("MpesaReceiptNumber");
      phone = getItem("PhoneNumber");
      admission = getItem("AccountReference");
      businessShortCode = getItem("BusinessShortCode");

    } else if (callback.TransID) {
      // C2B CALLBACK (Manual Paybill Payment)
      isC2B = true;
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
      console.log(`No student found with admission: ${admission} in school: ${school.name}`);
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
      // Use the accounts role required by the Payment schema so the record persists
      recordedByRole: "accounts"
    });

    console.log(`${isC2B ? 'C2B' : 'STK'} Payment recorded: ${amount} KES for student ${student.name} (${admission}) at ${school.name}`);
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

// ---------------------------
// INITIATE STK PUSH (Optional - only if you want push payments)
// ---------------------------
export const initiateSTK = async (req, res) => {
  try {
    const { phone, amount, admission, schoolId } = req.body;

    if (!phone || !amount || !admission || !schoolId) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 🔎 Get school paybill configuration
    const school = await School.findById(schoolId);
    if (!school || !school.paybill) {
      return res.status(400).json({ message: "School paybill not configured" });
    }

    // For STK Push, you need separate shortcode and passkey
    // This assumes paybill is also used as shortcode for STK
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = base64.encode(
      school.paybill + // Using paybill as shortcode
      process.env.MPESA_PASSKEY +
      timestamp
    );

    const payload = {
      BusinessShortCode: school.paybill,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: school.paybill,
      PhoneNumber: phone,
      CallBackURL: `${process.env.BASE_URL}/api/mpesa/callback`,
      AccountReference: admission,
      TransactionDesc: `School Fees - ${admission}`
    };

    const response = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      payload,
      {
        headers: {
          Authorization: `Bearer ${req.mpesaToken}`
        }
      }
    );

    res.json({
      message: "STK push sent",
      checkoutRequestId: response.data.CheckoutRequestID
    });

  } catch (err) {
    console.error("STK ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to initiate STK" });
  }
};
