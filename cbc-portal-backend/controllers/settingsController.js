// controllers/settingsController.js
import Setting from "../models/Setting.js";
import { School } from "../models/school.js";
import Mark from "../models/mark.js";
import { User } from "../models/User.js";
import { createNotificationsForUsers } from './notificationController.js';

const DEFAULT_ASSESSMENTS = [
  { id: 1, name: 'Opener', enabled: true, sortOrder: 1, system: true },
  { id: 5, name: 'Midterm', enabled: true, sortOrder: 2, system: true },
  { id: 8, name: 'Endterm', enabled: true, sortOrder: 3, system: true }
];

const canManageAssessments = (user) =>
  ['admin', 'super_admin', 'dean'].includes(user?.role) || user?.isDean === true;

const normalizeAssessments = (assessments) => {
  if (!Array.isArray(assessments) || assessments.length === 0) {
    throw new Error('At least one assessment is required.');
  }

  const normalized = assessments.map((assessment, index) => ({
    id: Number(assessment?.id),
    name: String(assessment?.name || '').trim().toUpperCase(),
    enabled: assessment?.enabled !== false,
    sortOrder: Number.isFinite(Number(assessment?.sortOrder)) ? Number(assessment.sortOrder) : index + 1,
    system: assessment?.system === true
  }));

  if (normalized.some(assessment => !Number.isInteger(assessment.id) || assessment.id < 1)) {
    throw new Error('Assessment IDs must be positive whole numbers.');
  }
  if (normalized.some(assessment => !assessment.name || assessment.name.length > 80)) {
    throw new Error('Assessment names are required and must be 80 characters or fewer.');
  }

  const ids = normalized.map(assessment => assessment.id);
  const names = normalized.map(assessment => assessment.name.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new Error('Assessment IDs must be unique.');
  if (new Set(names).size !== names.length) throw new Error('Assessment names must be unique.');

  DEFAULT_ASSESSMENTS.forEach(defaultAssessment => {
    const configured = normalized.find(assessment => assessment.id === defaultAssessment.id);
    if (!configured) normalized.push(defaultAssessment);
    else configured.system = true;
  });

  if (!normalized.some(assessment => assessment.enabled)) {
    throw new Error('At least one assessment must remain enabled.');
  }

  return normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
};

export const getAssessmentConfig = async (req, res) => {
  try {
    if (!req.user?.schoolId) return res.status(403).json({ message: 'School ID missing from user token.' });
    const school = await School.findById(req.user.schoolId).select('assessmentConfig').lean();
    if (!school) return res.status(404).json({ message: 'School not found.' });
    const assessments = school.assessmentConfig?.length
      ? normalizeAssessments(school.assessmentConfig)
      : DEFAULT_ASSESSMENTS;

    const requestedPage = Number(req.query.page);
    const limit = Number(req.query.limit);
    if (Number.isInteger(requestedPage) && requestedPage > 0 && Number.isInteger(limit) && limit > 0) {
      const systemAssessments = assessments.filter(assessment => assessment.system === true);
      const customAssessments = assessments
        .filter(assessment => assessment.system !== true)
        .sort((a, b) => Number(b.id) - Number(a.id) || Number(b.sortOrder) - Number(a.sortOrder));
      const firstPageCustomSlots = Math.max(0, limit - systemAssessments.length);
      const total = systemAssessments.length + customAssessments.length;
      const totalPages = Math.max(1, customAssessments.length <= firstPageCustomSlots
        ? 1
        : 1 + Math.ceil((customAssessments.length - firstPageCustomSlots) / limit));
      const page = Math.min(requestedPage, totalPages);
      const customStart = page === 1
        ? 0
        : firstPageCustomSlots + ((page - 2) * limit);
      const pageItems = page === 1
        ? [...systemAssessments, ...customAssessments.slice(0, firstPageCustomSlots)]
        : customAssessments.slice(customStart, customStart + limit);

      return res.json({
        assessments: pageItems,
        page,
        limit,
        total,
        totalPages
      });
    }

    return res.json({ assessments });
  } catch (err) {
    console.error('getAssessmentConfig error:', err);
    return res.status(500).json({ message: 'Server error fetching assessments.' });
  }
};

export const updateAssessmentConfig = async (req, res) => {
  try {
    if (!req.user?.schoolId || !canManageAssessments(req.user)) {
      return res.status(403).json({ message: 'Only a school admin or dean can manage assessments.' });
    }
    const assessments = normalizeAssessments(req.body?.assessments);
    const school = await School.findByIdAndUpdate(
      req.user.schoolId,
      { $set: { assessmentConfig: assessments } },
      { new: true, runValidators: true }
    ).select('assessmentConfig').lean();
    if (!school) return res.status(404).json({ message: 'School not found.' });
    return res.json({ message: 'Assessment configuration saved.', assessments: school.assessmentConfig });
  } catch (err) {
    console.error('updateAssessmentConfig error:', err);
    return res.status(400).json({ message: err.message || 'Invalid assessment configuration.' });
  }
};

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
    // Match the enforcement logic: teacher submitted-mark edits are allowed by default
    // unless an admin explicitly records a false setting for that year/term.
    const allowTeacherSubmittedMarkEdits = editSetting ? editSetting.value === true : true;

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

    if (allowTeacherSubmittedMarkEdits === true) {
      const teachers = await User.find({ schoolId: req.user.schoolId, role: 'teacher' }).select('_id').lean();
      await createNotificationsForUsers({
        userIds: teachers.map(teacher => teacher._id),
        schoolId: req.user.schoolId,
        type: 'marks_edit_reopened',
        title: 'Marks editing reopened',
        message: `Marks editing is now open for Term ${term}, ${year}.`
      });
    }

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

export const deleteAssessmentConfig = async (req, res) => {
  try {
    if (!req.user?.schoolId || !canManageAssessments(req.user)) {
      return res.status(403).json({ message: 'Only a school admin or dean can manage assessments.' });
    }

    const assessmentId = Number(req.params.id);
    if (!Number.isInteger(assessmentId) || assessmentId < 1) {
      return res.status(400).json({ message: 'A valid assessment code is required.' });
    }
    if (DEFAULT_ASSESSMENTS.some(assessment => assessment.id === assessmentId)) {
      return res.status(400).json({ message: 'Built-in assessments cannot be deleted.' });
    }

    const school = await School.findById(req.user.schoolId).select('assessmentConfig').lean();
    if (!school) return res.status(404).json({ message: 'School not found.' });
    const configuredAssessment = (school.assessmentConfig || []).find(item => Number(item.id) === assessmentId);
    if (!configuredAssessment) return res.status(404).json({ message: 'Assessment not found.' });

    const marksExist = await Mark.exists({ schoolId: req.user.schoolId, assessment: assessmentId });
    if (marksExist) {
      return res.status(409).json({ message: 'This assessment cannot be deleted because marks already exist for it. Disable it instead.' });
    }

    const updatedSchool = await School.findByIdAndUpdate(
      req.user.schoolId,
      { $pull: { assessmentConfig: { id: assessmentId } } },
      { new: true }
    ).select('assessmentConfig').lean();
    return res.json({ message: 'Assessment deleted.', assessments: normalizeAssessments(updatedSchool.assessmentConfig) });
  } catch (err) {
    console.error('deleteAssessmentConfig error:', err);
    return res.status(500).json({ message: 'Server error deleting assessment.' });
  }
};