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
    const setting = await Setting.findOne({ key: lockKey });

    const isLocked = setting ? setting.value === true : false;

    res.json({ isLocked });
  } catch (err) {
    console.error("getTermLockStatus error:", err);
    res.status(500).json({ message: "Server error fetching term lock status" });
  }
};

// New function to update term lock status
export const updateTermLockStatus = async (req, res) => {
  try {
    // Only admins can perform this action
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: "Unauthorized: Only admins can manage term locks." });
    }

    const { year, term, isLocked } = req.body;
    if (!year || !term || isLocked === undefined) {
      return res.status(400).json({ message: "Year, term, and lock status are required." });
    }

    const lockKey = `term_lock_${req.user.schoolId}_${year}_${term}`;

    // Find and update the setting, or create it if it doesn't exist
    const updatedSetting = await Setting.findOneAndUpdate(
      { key: lockKey },
      { value: isLocked },
      { upsert: true, new: true } // upsert: create if not found; new: return the updated document
    );

    res.json({ message: `Term ${term}, Year ${year} lock status updated to ${isLocked ? 'locked' : 'unlocked'}.`, isLocked: updatedSetting.value });
  } catch (err) {
    console.error("updateTermLockStatus error:", err);
    res.status(500).json({ message: "Server error updating term lock status." });
  }
};