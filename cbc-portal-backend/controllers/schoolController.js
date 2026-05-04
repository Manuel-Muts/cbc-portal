//schoolController.js
import { School } from '../models/school.js';
import cache from "../utils/simpleCache.js";

export const getMySchool = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ msg: "No school assigned" });
    }

    const isStudent = req.user.role === 'student' || req.user.role === 'learner';
    const includeLogo = req.query.includeLogo === 'true';
    const fields = req.query.fields;
    // Determine if we are fetching a "lite" version for a student (no logo, but needs paybill)
    const isStudentLiteFetch = isStudent && !includeLogo;

    // Cache key should reflect the type of payload
    let cacheSuffix = '';
    if (fields) cacheSuffix = `_fields_${fields}`;
    if (isStudentLiteFetch) cacheSuffix = '_student_lite';
    else if (includeLogo) cacheSuffix = '_full_with_logo';
    else cacheSuffix = '_full_no_logo'; // For admins/teachers not requesting logo

    const cacheKey = `school_profile_${schoolId}${cacheSuffix}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let projectionFields = "name address status allowSignatureUpload"; // Base fields

    if (fields) {
      projectionFields = fields.replace(/,/g, ' ');
    } else if (includeLogo) {
      projectionFields += " logo logoMimeType headteacherSignatureUrl paybill mpesaShortcode";
    } else if (isStudentLiteFetch) {
      // For student dashboard/fee modal, get name, address, paybill, mpesaShortcode, but no logo/signature
      projectionFields += " paybill mpesaShortcode";
    } else {
      // For other roles (admin/teacher) not requesting logo, get all non-logo fields
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
      allowSignatureUpload: school.allowSignatureUpload !== false
    };

    // Conditionally add fields to the response object based on what was projected
    if (school.logo !== undefined) { // Check if logo was included in the projection
  response.logo = school.logo || null;
  response.logoMimeType = school.logoMimeType;
    }
    if (school.headteacherSignatureUrl !== undefined) {
  response.headteacherSignatureUrl = school.headteacherSignatureUrl || "";
    }
    if (school.paybill !== undefined) {
      response.paybill = school.paybill || "";
      response.mpesaShortcode = school.mpesaShortcode || "";
}

cache.set(cacheKey, response, 300); // Cache for 5 minutes
res.json(response);

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