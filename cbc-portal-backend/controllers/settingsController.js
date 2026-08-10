// controllers/settingsController.js
import Setting from "../models/Setting.js";

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