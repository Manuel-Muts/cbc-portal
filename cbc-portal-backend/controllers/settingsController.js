// controllers/settingsController.js
import Setting from "../models/Setting.js";
import { School } from "../models/school.js";

export const getMarksEditSettings = async (req, res) => {
  try {
    const { year, term } = req.query;
    if (!year || !term) {
      return res.status(400).json({ message: "Year and term are required" });
    }
    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "School ID missing from user token. Unauthorized." });
    }

    const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${year}_${term}`;
    const editSetting = await Setting.findOne({ key: editPermissionKey }).lean();
    const allowTeacherSubmittedMarkEdits = editSetting ? editSetting.value === true : false;

    res.json({ isLocked: false, allowTeacherSubmittedMarkEdits });
  } catch (err) {
    console.error("getMarksEditSettings error:", err);
    res.status(500).json({ message: "Server error fetching marks edit settings" });
  }
};

export const updateMarksEditSettings = async (req, res) => {
  try {
    const { year, term, allowTeacherSubmittedMarkEdits } = req.body;
    if (!year || !term || allowTeacherSubmittedMarkEdits === undefined) {
      return res.status(400).json({ message: "Year, term, and the edit permission value are required." });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ message: "Unauthorized: Only admins can manage marks edit permissions." });
    }

    const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${year}_${term}`;
    const editSetting = await Setting.findOneAndUpdate(
      { key: editPermissionKey },
      { value: allowTeacherSubmittedMarkEdits },
      { upsert: true, new: true }
    ).lean();

    res.json({
      message: `Marks edit settings for Term ${term}, Year ${year} updated successfully.`,
      isLocked: false,
      allowTeacherSubmittedMarkEdits: editSetting ? editSetting.value === true : false
    });
  } catch (err) {
    console.error("updateMarksEditSettings error:", err);
    res.status(500).json({ message: "Server error updating marks edit settings." });
  }
};

// Get term configuration for the school
export const getTermConfig = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "School ID missing from user token. Unauthorized." });
    }

    const school = await School.findById(req.user.schoolId).select('termConfig').lean();
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    res.json({
      termConfig: school.termConfig || {
        term1: true,
        term2: true,
        term3: true,
        activeTerm: 'Term 1'
      }
    });
  } catch (err) {
    console.error("getTermConfig error:", err);
    res.status(500).json({ message: "Server error fetching term configuration" });
  }
};

// Update term configuration for the school
export const updateTermConfig = async (req, res) => {
  try {
    const { term1, term2, term3, activeTerm } = req.body;

    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "School ID missing from user token. Unauthorized." });
    }

    // Only admins can update term config
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin) {
      return res.status(403).json({ message: "Unauthorized: Only admins can configure terms" });
    }

    // Validate that at least one term is enabled
    if (!term1 && !term2 && !term3) {
      return res.status(400).json({ message: "At least one term must be enabled" });
    }

    // Validate activeTerm is one of the enabled terms
    if (!['Term 1', 'Term 2', 'Term 3'].includes(activeTerm)) {
      return res.status(400).json({ message: "Invalid active term" });
    }

    const enabledTerms = { 'Term 1': term1, 'Term 2': term2, 'Term 3': term3 };
    if (!enabledTerms[activeTerm]) {
      return res.status(400).json({ message: `${activeTerm} is not enabled` });
    }

    const updatedSchool = await School.findByIdAndUpdate(
      req.user.schoolId,
      {
        $set: {
          'termConfig.term1': term1,
          'termConfig.term2': term2,
          'termConfig.term3': term3,
          'termConfig.activeTerm': activeTerm
        }
      },
      { new: true }
    ).select('termConfig').lean();

    res.json({
      message: "Term configuration updated successfully",
      termConfig: updatedSchool.termConfig
    });
  } catch (err) {
    console.error("updateTermConfig error:", err);
    res.status(500).json({ message: "Server error updating term configuration" });
  }
};

// Get active term for the school
export const getActiveTerm = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "School ID missing from user token. Unauthorized." });
    }

    const school = await School.findById(req.user.schoolId).select('termConfig').lean();
    if (!school || !school.termConfig) {
      // Fallback to month-based calculation if termConfig doesn't exist
      const month = new Date().getMonth() + 1;
      const defaultTerm = month <= 4 ? 'Term 1' : month <= 8 ? 'Term 2' : 'Term 3';
      return res.json({ activeTerm: defaultTerm });
    }

    res.json({ activeTerm: school.termConfig.activeTerm });
  } catch (err) {
    console.error("getActiveTerm error:", err);
    res.status(500).json({ message: "Server error fetching active term" });
  }
};