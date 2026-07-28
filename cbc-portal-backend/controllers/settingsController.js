// controllers/settingsController.js
import Setting from "../models/Setting.js";

export const getTermLockStatus = async (req, res) => {
  try {
    const { year, term } = req.query;
    if (!year || !term) {
      return res.status(400).json({ message: "Year and term are required" });
    }
    // 🆕 Ensure schoolId is present in the request user object
    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "School ID missing from user token. Unauthorized." });
    }

    const lockKey = `term_lock_${req.user.schoolId}_${year}_${term}`;
    const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${year}_${term}`;

    const [lockSetting, editSetting] = await Promise.all([
      Setting.findOne({ key: lockKey }).lean(),
      Setting.findOne({ key: editPermissionKey }).lean()
    ]);

    const isLocked = lockSetting ? lockSetting.value === true : false;
    const allowTeacherSubmittedMarkEdits = editSetting ? editSetting.value === true : false;

    res.json({ isLocked, allowTeacherSubmittedMarkEdits });
  } catch (err) {
    console.error("getTermLockStatus error:", err);
    res.status(500).json({ message: "Server error fetching term lock status" });
  }
};

// New function to update term lock status
export const updateTermLockStatus = async (req, res) => {
  try {
    const { year, term, isLocked, allowTeacherSubmittedMarkEdits } = req.body;
    if (!year || !term || (isLocked === undefined && allowTeacherSubmittedMarkEdits === undefined)) {
      return res.status(400).json({ message: "Year, term, and at least one status field are required." });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    // Only admins can manage term locks and submitted-mark edit permissions.
    if (!isAdmin) {
      return res.status(403).json({ message: "Unauthorized: Only admins can manage term locks and submitted-mark edit permissions." });
    }


    const lockKey = `term_lock_${req.user.schoolId}_${year}_${term}`;
    const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${year}_${term}`;

    if (isLocked !== undefined) {
      await Setting.findOneAndUpdate(
        { key: lockKey },
        { value: isLocked },
        { upsert: true, new: true }
      );
    }

    if (allowTeacherSubmittedMarkEdits !== undefined) {
      await Setting.findOneAndUpdate(
        { key: editPermissionKey },
        { value: allowTeacherSubmittedMarkEdits },
        { upsert: true, new: true }
      );
    }

    const [lockSetting, editSetting] = await Promise.all([
      Setting.findOne({ key: lockKey }).lean(),
      Setting.findOne({ key: editPermissionKey }).lean()
    ]);

    res.json({
      message: `Term ${term}, Year ${year} settings updated successfully.`,
      isLocked: lockSetting ? lockSetting.value === true : false,
      allowTeacherSubmittedMarkEdits: editSetting ? editSetting.value === true : false
    });
  } catch (err) {
    console.error("updateTermLockStatus error:", err);
    res.status(500).json({ message: "Server error updating term lock status." });
  }
};