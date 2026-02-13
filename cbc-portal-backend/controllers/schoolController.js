//schoolController.js
import { School } from '../models/school.js';

export const getMySchool = async (req, res) => {
  try {
    if (!req.user?.schoolId) {
      return res.status(400).json({ msg: "No school assigned" });
    }

    const school = await School.findById(req.user.schoolId)
  .select("name logo address status paybill mpesaShortcode");

if (!school) return res.status(404).json({ msg: "School not found" });

// Make the logo path relative to /uploads
const logoPath = school.logo || null;


res.json({
  name: school.name,
  address: school.address,
  logo: logoPath,
  paybill: school.paybill || ""
});

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

    res.json({
      msg: "Paybill configuration updated successfully",
      paybill: school.paybill
    });

  } catch (err) {
    console.error("Update School Paybill Error:", err);
    res.status(500).json({ msg: err.message || "Failed to update paybill" });
  }
}; 