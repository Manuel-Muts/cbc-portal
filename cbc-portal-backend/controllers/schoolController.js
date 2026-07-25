//schoolController.js
import { School } from '../models/school.js';
import cache from "../utils/cacheManager.js";
import { shouldBypassSchoolProfileCache } from '../utils/smsBalance.js';
import axios from 'axios';
import crypto from 'crypto';

/**
 * 🆕 Initiate IntaSend Payment for SMS Credits
 */
export const initiateSmsTopup = async (req, res) => {
  try {
    const { amount, phone } = req.body; // Phone is now optional
    const schoolId = req.user.schoolId;

    if (!amount || amount < 10) {
      return res.status(400).json({ msg: "Minimum top-up amount is KES 10" });
    }

    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ msg: "School not found" });
    
    // 🆕 Detect Sandbox vs Production environment
    const publicKey = (process.env.INTASEND_PUBLIC_KEY || "").trim();
    const isTestMode = publicKey.startsWith('ISPubKey_test_');
    
    const intasendCheckoutUrl = isTestMode 
      ? 'https://sandbox.intasend.com/api/v1/checkout/' 
      : 'https://payment.intasend.com/api/v1/checkout/';

    // 🆕 Bulletproof Host Construction
    let hostUrl = (process.env.FRONTEND_URL || "http://localhost:5500").trim();
    if (!hostUrl.startsWith('http')) hostUrl = 'https://' + hostUrl;

    // IntaSend Checkout API Request
    const payload = {
      public_key: publicKey,
      amount: Number(amount),
      currency: "KES",
      charge_bearer: true, // 🆕 Forces the customer (School) to pay the transaction fees
      email: school.adminEmail || 'admin@school.com',
      first_name: (school.name || "School").split(' ')[0],
      last_name: (school.name || "Admin").split(' ').slice(1).join(' ') || "School",
      host: hostUrl.replace(/\/$/, ""), 
      api_ref: `SMS_TOPUP_${String(schoolId)}_${Date.now()}` // Important for tracking
    };

    if (phone) payload.phone_number = phone.trim().replace(/\+/g, '').replace(/^0/, '254');

    console.log(`🚀 Initiating IntaSend (${isTestMode ? 'SANDBOX' : 'PROD'}):`, JSON.stringify(payload, null, 2));

    const response = await axios.post(intasendCheckoutUrl, payload);

    res.json({ url: response.data.url });
  } catch (err) {
    // Enhanced logging for Sandbox troubleshooting
    const errorDetail = err.response?.data;
    console.error("❌ IntaSend initiation error:", JSON.stringify({
      message: err.message,
      details: errorDetail,
      payload_sent: req.body // Helps verify what actually left the server
    }, null, 2));
    res.status(500).json({ msg: "Failed to initialize payment gateway" });
  }
};

/**
 * 🆕 Webhook to handle IntaSend Payment Confirmation
 */
export const handleIntaSendWebhook = async (req, res) => {
  try {
    // 0. (Recommended) Verify the webhook signature from IntaSend
    // This ensures the request actually came from IntaSend
    const signature = req.headers['x-intasend-signature'];
    const payload = JSON.stringify(req.body);
    
    console.log("📥 Incoming IntaSend Webhook:", JSON.stringify(req.body, null, 2));

    if (signature && process.env.INTASEND_SECRET_KEY) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.INTASEND_SECRET_KEY)
        .update(payload)
        .digest('hex');
      if (signature !== expectedSignature) {
        return res.status(401).send('Invalid signature');
      }
    }

    const { invoice, state, api_ref, value, net_amount, invoice_id } = req.body;

    // 1. Verify it's a successful payment
    const normalizedState = String(state).toUpperCase();
    if (normalizedState !== 'COMPLETE' && normalizedState !== 'COMPLETED') {
      console.log(`ℹ️ [Webhook] Invoice ${invoice_id || 'N/A'} is ${state}. Waiting for 'COMPLETE' state...`);
      return res.status(200).send(`OK: ${state}`);
    }

    // 2. Parse schoolId and intent from our reference
    // Format: SMS_TOPUP_schoolId_timestamp
    if (!api_ref.startsWith('SMS_TOPUP_')) {
      console.log("⚠️ Webhook ignored: Not an SMS top-up reference");
      return res.status(200).send('Ignored: Not an SMS top-up');
    }

    const parts = api_ref.split('_');
    const schoolId = parts[2];
    
    // 🆕 Flexible amount parsing to handle different IntaSend payload versions
    // It tries to find the amount in 'value', 'net_amount', or nested 'invoice.amount'
    const rawAmount = value || net_amount || (invoice && (invoice.amount || invoice.net_amount));
    const paidAmount = Number(rawAmount);

    if (isNaN(paidAmount)) {
      console.error("❌ Webhook error: Could not parse payment amount from payload");
      return res.status(400).send('Invalid amount');
    }

    // 3. Convert KES to Credits
    // If you want to charge 1.2 KES per SMS, divide by 1.2.
    const creditsToAdd = Math.floor(paidAmount / 1.0); // Currently 1 KES = 1 Credit

    let updatedSchool = await School.findByIdAndUpdate(
      schoolId,
      { $inc: { smsCredits: creditsToAdd } },
      { new: true }
    );

    if (!updatedSchool) {
      console.error(`❌ Webhook Error: School ${schoolId} not found during update.`);
      return res.status(404).send('School not found');
    }

    console.log(`✅ [PAYMENT SUCCESS] ${creditsToAdd} SMS credits added to ${updatedSchool.name}. New balance: ${updatedSchool.smsCredits}`);

    // Invalidate cache so balance updates immediately
    cache.clearByPattern(String(schoolId));

    res.status(200).send('OK');
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).send('Error');
  }
};

export const getMySchool = async (req, res) => {
  try {
    const user = req?.user;
    const schoolId = user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ msg: "No school assigned" });
    }

    const query = req?.query || {};
    const includeLogoParam = typeof query.includeLogo === 'string' ? query.includeLogo : '';
    const includeLogo = includeLogoParam.toLowerCase() === 'true';
    const rawFields = typeof query.fields === 'string' ? query.fields : '';
    const bypassCache = shouldBypassSchoolProfileCache(query);
    const fields = rawFields
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
      .join(' ');

    const isStudent = user?.role === 'student' || user?.role === 'learner';
    const isStudentLiteFetch = isStudent && !includeLogo;

    let cacheSuffix = '';
    if (fields) cacheSuffix = `_fields_${fields.replace(/\s+/g, '_')}`;
    if (isStudentLiteFetch) cacheSuffix = '_student_lite';
    else if (includeLogo) cacheSuffix = '_full_with_logo';
    else cacheSuffix = '_full_no_logo';

    const cacheKey = `school_profile_${schoolId}${cacheSuffix}`;
    const cached = bypassCache ? null : cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let projectionFields = "name address status allowSignatureUpload schoolType smsCredits";

    if (fields) {
      const selectedFields = fields
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);
      if (includeLogo) {
        selectedFields.push('logo', 'logoMimeType');
      }
      projectionFields = [...new Set(selectedFields)].join(' ');
    } else if (includeLogo) {
      projectionFields += " logo logoMimeType headteacherSignatureUrl paybill mpesaShortcode smsCredits";
    } else if (isStudentLiteFetch) {
      projectionFields += " paybill mpesaShortcode";
    } else {
      projectionFields += " paybill mpesaShortcode headteacherSignatureUrl";
    }

    const school = await School.findById(schoolId).select(projectionFields).lean();
    if (!school) return res.status(404).json({ msg: "School not found" });

    if (fields) {
      cache.set(cacheKey, school, 300);
      return res.json(school);
    }

    const response = {
      name: school.name,
      address: school.address,
      allowSignatureUpload: school.allowSignatureUpload !== false,
      schoolType: school.schoolType || 'full',
      smsCredits: school.smsCredits || 0
    };

    if (school.logo !== undefined) {
      response.logo = school.logo || null;
      response.logoMimeType = school.logoMimeType || 'image/png';
    }
    if (school.headteacherSignatureUrl !== undefined) {
      response.headteacherSignatureUrl = school.headteacherSignatureUrl || "";
    }
    if (school.paybill !== undefined) {
      response.paybill = school.paybill || "";
      response.mpesaShortcode = school.mpesaShortcode || "";
    }

    cache.set(cacheKey, response, 300);
    return res.json(response);
  } catch (err) {
    console.error("Get My School Error:", err);
    res.status(500).json({ msg: "Failed to fetch school" });
  }
};

// ---------------------------
// UPDATE SCHOOL PAYBILL CONFIGURATION
// ---------------------------
export const updateSchoolPaybill = async (req, res) => {
  try {
    let schoolIdToUpdate;

    if (req.user.role === "super_admin") {
      // Super admin must provide schoolId in the request body
      schoolIdToUpdate = req.body.schoolId;
      if (!schoolIdToUpdate) {
        return res.status(400).json({ msg: "School ID is required for super admin" });
      }
    } else {
      // Other users update their own school
      schoolIdToUpdate = req.user.schoolId;
      if (!schoolIdToUpdate) {
        return res.status(400).json({ msg: "No school assigned" });
      }
      // Ensure they can't update other schools
      if (req.body.schoolId && req.body.schoolId !== schoolIdToUpdate) {
        return res.status(403).json({ msg: "Access denied" });
      }
    }

    const { paybill } = req.body;

    if (!paybill) {
      return res.status(400).json({ msg: "Paybill number is required" });
    }

    const school = await School.findByIdAndUpdate(
      schoolIdToUpdate,
      {
        paybill: paybill.trim()
      },
      { new: true, runValidators: true }
    ).select("paybill");

    if (!school) {
      return res.status(404).json({ msg: "School not found" });
    }

    // Invalidate cache for this school
    cache.clearByPattern(String(schoolIdToUpdate));

    res.json({
      msg: "Paybill configuration updated successfully",
      paybill: school.paybill
    });

  } catch (err) {
    console.error("Update School Paybill Error:", err);
    res.status(500).json({ msg: err.message || "Failed to update paybill" });
  }
};

// ---------------------------
// UPDATE SCHOOL SIGNATURE (Admin)
// ---------------------------
export const updateSchoolSignature = async (req, res) => {
  try {
    const { signatureUrl } = req.body;
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return res.status(400).json({ msg: "No school assigned" });
    }

    if (!signatureUrl) {
      return res.status(400).json({ msg: "Signature URL is required" });
    }

    const school = await School.findByIdAndUpdate(
      schoolId,
      {
        headteacherSignatureUrl: signatureUrl
      },
      { new: true }
    ).select("headteacherSignatureUrl");

    if (!school) {
      return res.status(404).json({ msg: "School not found" });
    }

    // Invalidate cache for this school profile
    cache.clearByPattern(`school_profile_${schoolId}`);

    res.json({
      msg: "Official signature updated successfully",
      headteacherSignatureUrl: school.headteacherSignatureUrl
    });
  } catch (err) {
    console.error("Update School Signature Error:", err);
    res.status(500).json({ msg: "Failed to update signature" });
  }
};

/**
 * 🆕 Update School's Grading Configuration (Admin/Dean)
 */
export const updateMySchoolGradingConfig = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const { gradingConfig } = req.body;

    if (!schoolId) {
      return res.status(400).json({ msg: "No school assigned to user." });
    }

    // Basic validation for gradingConfig structure
    if (!gradingConfig || typeof gradingConfig !== 'object' || !Array.isArray(gradingConfig.primary) || !Array.isArray(gradingConfig.secondary)) {
      return res.status(400).json({ msg: "Invalid grading configuration format. Expected { primary: [], secondary: [] }." });
    }

    // Ensure only Admin or Dean can update this
    if (!['admin', 'dean'].includes(req.user.role)) {
      return res.status(403).json({ msg: "Unauthorized: Only Admin or Dean can update grading configuration." });
    }

    const school = await School.findByIdAndUpdate(
      schoolId,
      { gradingConfig },
      { new: true, runValidators: true }
    ).select("gradingConfig");

    if (!school) {
      return res.status(404).json({ msg: "School not found." });
    }

    // 🚀 Robust Invalidation: Clear all variations of the school profile cache
    cache.clearByPattern(String(schoolId));
    res.json({ msg: "Grading configuration updated successfully.", gradingConfig: school.gradingConfig });
  } catch (err) {
    console.error("updateMySchoolGradingConfig error:", err);
    res.status(500).json({ msg: "Failed to update grading configuration." });
  }
};