//schoolController.js
import { School } from '../models/school.js';
import cache from "../utils/cacheManager.js";
import { shouldBypassSchoolProfileCache } from '../utils/smsBalance.js';
import { getPlanFeatures } from '../utils/planAccess.js';

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
    const normalizeFieldName = (field) => field === 'schoolName' ? 'name' : field;
    const selectedFields = rawFields
      .split(',')
      .map((field) => normalizeFieldName(field.trim()))
      .filter(Boolean);
    const fields = selectedFields.join(' ');

    const isStudent = user?.role === 'student' || user?.role === 'learner';
    const isStudentLiteFetch = isStudent && !includeLogo;

    let cacheSuffix = '';
    if (fields) cacheSuffix = `_fields_${fields.replace(/\s+/g, '_')}`;
    else if (isStudentLiteFetch) cacheSuffix = '_student_lite';
    else if (includeLogo) cacheSuffix = '_full_with_logo';
    else cacheSuffix = '_full_no_logo';

    const cacheKey = `school_profile_${schoolId}${cacheSuffix}`;
    const cached = bypassCache ? null : cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let projectionFields = "name schoolCode status allowSignatureUpload schoolType smsCredits subscriptionExpiresAt";

    if (fields) {
      const selectedFields = fields
        .split(/\s+/)
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

    const normalizeResponse = (payload) => ({
      ...payload,
      name: payload.name || payload.schoolName || null,
      schoolName: payload.schoolName || payload.name || null,
    });

    if (fields) {
      const normalized = normalizeResponse(school);
      cache.set(cacheKey, normalized, 300);
      return res.json(normalized);
    }

    const subscriptionExpired = school.subscriptionExpiresAt && school.subscriptionExpiresAt <= new Date();
    const effectivePlan = subscriptionExpired ? 'basic' : school.plan || 'basic';
    const response = normalizeResponse({
      name: school.name,
      schoolCode: school.schoolCode || "",
      allowSignatureUpload: school.allowSignatureUpload !== false,
      schoolType: school.schoolType || 'full',
      plan: effectivePlan,
      planFeatures: subscriptionExpired
        ? getPlanFeatures('basic')
        : {
            ...getPlanFeatures(effectivePlan),
            ...(school.planFeatures || {})
          },
      subscriptionExpiresAt: school.subscriptionExpiresAt || null,
      smsCredits: school.smsCredits || 0
    });

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