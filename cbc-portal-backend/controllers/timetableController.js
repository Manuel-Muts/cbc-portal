import crypto from 'crypto';
import Timetable from '../models/Timetable.js';

const normalizeGrade = (g) => {
  if (!g) return null;
  const str = String(g).trim();
  const match = str.match(/\d+/); // Extract only the numeric part
  if (match) {
    return `Grade ${match[0]}`;
  }
  return str;
};

/**
 * Save or Update a generated timetable
 */
export const saveTimetable = async (req, res) => {
  try {
    const { grade, stream, pathway, academicYear, term, lessonFrequencies, settings, grid, extraActivities } = req.body;
    const schoolId = req.user.schoolId;

    if (!grade || !academicYear || !term || !grid) {
      return res.status(400).json({ message: "Grade, year, term, and grid data are required." });
    }
    const normalizedGrade = normalizeGrade(grade);

    // 🆕 Added 'stream' to filter to ensure we handle multiple streams per grade correctly
    const filter = {
      schoolId,
      grade: normalizedGrade,
      stream: stream || "",
      pathway: pathway || null,
      academicYear: Number(academicYear),
      term
    };

    const normalizedLessonFrequencies = lessonFrequencies && typeof lessonFrequencies.toObject === 'function'
      ? lessonFrequencies.toObject()
      : lessonFrequencies;

    const normalizedSettings = settings || {};
    const normalizedExtraActivities = Array.isArray(extraActivities) ? extraActivities : [];

    const hashSource = JSON.stringify({
      lessonFrequencies: normalizedLessonFrequencies,
      settings: normalizedSettings,
      grid,
      extraActivities: normalizedExtraActivities
    });
    const payloadHash = crypto.createHash('sha256').update(hashSource).digest('hex');

    const existingTimetable = await Timetable.findOne(filter).lean();
    if (existingTimetable && existingTimetable.payloadHash === payloadHash) {
      return res.status(200).json({
        message: "No changes detected; timetable is already up-to-date.",
        timetable: existingTimetable
      });
    }

    const update = {
      $set: {
        term,
        stream: stream || "",
        lessonFrequencies: normalizedLessonFrequencies,
        settings: normalizedSettings,
        grid,
        extraActivities: normalizedExtraActivities,
        payloadHash,
        lastUpdatedBy: req.user.id
      }
    };

    const timetable = await Timetable.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      runValidators: true
    });

    res.status(200).json({
      message: "Timetable saved successfully to the portal.",
      timetable
    });
  } catch (err) {
    console.error("Save Timetable Error:", err);
    res.status(500).json({ message: "Server error while saving timetable." });
  }
};

/**
 * 🆕 Fetch all timetables for a school in a specific year (for clash detection)
 */
export const getAllTimetables = async (req, res) => {
  try {
    // 🆕 Robustly check both parameter names for compatibility
    const year = req.query.academicYear || req.query.year;
    const term = req.query.term;
    const schoolId = req.user.schoolId;

    const query = { schoolId };
    if (year) query.academicYear = Number(year);
    if (term) query.term = term;

    // 🚀 OPTIMIZATION: Only fetch fields needed for teacher clash detection and block view.
    // Excludes heavy settings, frequencies, and hashes not used in aggregate views.
    const timetables = await Timetable.find(query)
      .select('grade stream grid academicYear term')
      .lean();
    res.json(timetables);
  } catch (err) {
    console.error("Get All Timetables Error:", err);
    res.status(500).json({ message: "Server error while fetching timetables." });
  }
};

/**
 * Fetch a timetable for a specific grade and year
 */
export const getTimetable = async (req, res) => {
  try {
    const { grade } = req.params;
    const { academicYear, year, term, pathway, stream } = req.query;
    const schoolId = req.user.schoolId;

    const query = {
      schoolId,
      grade: normalizeGrade(grade),
      academicYear: Number(academicYear || year || new Date().getFullYear()),
      term: term || "Term 1"
    };

    // 🆕 Support stream-specific fetching
    if (stream !== undefined) query.stream = stream;
    if (pathway) query.pathway = pathway;

    const timetable = await Timetable.findOne(query).lean();

    if (!timetable) {
      return res.status(404).json({ message: "No saved timetable found for this selection." });
    }

    res.json(timetable);
  } catch (err) {
    console.error("Get Timetable Error:", err);
    res.status(500).json({ message: "Server error while fetching timetable." });
  }
};