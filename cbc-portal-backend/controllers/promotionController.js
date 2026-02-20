// controllers/promotionController.js
import StudentEnrollment from "../models/StudentEnrollment.js";
import {User} from "../models/User.js";
import Mark from "../models/mark.js";



// ---------------------------
// GRADE NORMALIZER
// ---------------------------
const normalizeGrade = (grade) => {
  if (!grade) return null;

  // numeric grades: "2", 2 → "Grade 2"
  if (!isNaN(grade)) {
    return `Grade ${grade}`;
  }

  return grade;
};


// ------------------------------------
// CBC GRADE PROGRESSION MAP
// ------------------------------------
const GRADE_ORDER = [
  "PP1",
  "PP2",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12"
];

const getNextGrade = (currentGrade) => {
  const normalized = normalizeGrade(currentGrade);
  const index = GRADE_ORDER.indexOf(normalized);

  if (index === -1 || index === GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[index + 1];
};


//PROMOTE STUDENTS CONTROLLER
export const promoteStudents = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !req.user.schoolId) {
      return res.status(403).json({ message: "Only school admins can promote students" });
    }

    const { fromAcademicYear, toAcademicYear, decisions } = req.body;

    if (!fromAcademicYear || !toAcademicYear || !Array.isArray(decisions)) {
      return res.status(400).json({ message: "Invalid promotion payload" });
    }

    if (toAcademicYear <= fromAcademicYear) {
      return res.status(400).json({ message: "Invalid academic year progression" });
    }

    const results = [];
    const warnings = [];

    for (const d of decisions) {
      const enrollment = await StudentEnrollment.findOne({
        studentId: d.studentId,
        schoolId: req.user.schoolId,
        academicYear: fromAcademicYear,
        status: "active"
      });

      if (!enrollment) continue;

      // 🚫 Skip if already completed or transferred
      if (["completed", "transferred"].includes(enrollment.status)) {
        continue;
      }

      // -----------------------
      // TRANSFER
      // -----------------------
      if (d.action === "transfer") {
        await enrollment.updateOne({ status: "transferred" });
        continue;
      }

      const currentGrade = enrollment.grade;
      const normalizedGrade = normalizeGrade(currentGrade);
      const isGrade9 = normalizedGrade === "Grade 9";


      // -----------------------
      // GRADE 9 + PROMOTE = COMPLETE
      // -----------------------
      if (isGrade9 && d.action === "promote") {
        await enrollment.updateOne({ status: "completed" });
        continue;
      }

      // -----------------------
      // CLOSE OLD ENROLLMENT
      // -----------------------
      await enrollment.updateOne({ status: "completed" });

      // -----------------------
      // REPEAT OR PROMOTE
      // -----------------------
         const nextGrade =
         d.action === "repeat"
          ? normalizedGrade
          : getNextGrade(normalizedGrade);

      if (!nextGrade) {
        warnings.push({
          studentId: enrollment.studentId,
          message: "No next grade found"
        });
        continue;
      }

      // -----------------------
      // CREATE NEW ENROLLMENT
      // -----------------------
      const newEnrollment = await StudentEnrollment.create({
        studentId: enrollment.studentId,
        schoolId: enrollment.schoolId,
        academicYear: toAcademicYear,
        grade: nextGrade,
        term: "Term 1",
        promotedFrom: fromAcademicYear,
        status: "active"
      });

      await User.findByIdAndUpdate(enrollment.studentId, {
        grade: nextGrade
      });

      results.push(newEnrollment);
    }

    res.json({
      message: "Promotion processed successfully",
      affected: results.length,
      warnings
    });

  } catch (err) {
    console.error("Promotion error:", err);
    res.status(500).json({ message: "Server error during promotion" });
  }
};



export const previewPromotion = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { academicYear } = req.query;
    if (!academicYear) {
      return res.status(400).json({ message: "Academic year required" });
    }

    const enrollments = await StudentEnrollment.find({
      schoolId: req.user.schoolId,
      academicYear: Number(academicYear)
    })
      .populate("studentId", "name admission")
      .sort({ grade: 1 });

    const preview = [];

    for (const e of enrollments) {
      if (!e.studentId) continue;

      const isFinalGrade = e.grade === "Grade 9";

      preview.push({
        studentId: e.studentId._id,
        name: e.studentId.name,
        admission: e.studentId.admission,
        currentGrade: e.grade,
        nextGrade: isFinalGrade ? null : getNextGrade(e.grade),
        status: e.status
      });
    }

    res.json({ preview });

  } catch (err) {
    console.error("Preview error:", err);
    res.status(500).json({ message: "Failed to load promotion preview" });
  }
};

// ---------------------------
// FILTER ENROLLMENTS API
// ---------------------------
export const filterEnrollments = async (req, res) => {
  try {
    if (!req.user?.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { academicYear, grade, status } = req.query;

    const query = { schoolId: req.user.schoolId };

    if (academicYear) query.academicYear = Number(academicYear);
    if (grade) query.grade = grade;
    if (status) query.status = status; // e.g., "active", "completed", "transferred"

    const enrollments = await StudentEnrollment.find(query)
      .populate("studentId", "name admission")
      .sort({ grade: 1 });

    const result = enrollments.map(e => ({
      _id: e._id,
      studentId: e.studentId?._id || null,
      name: e.studentId?.name || "Unknown",
      admission: e.studentId?.admission || "",
      grade: e.grade,
      academicYear: e.academicYear,
      status: e.status
    }));

    res.json(result);

  } catch (err) {
    console.error("Filter error:", err);
    res.status(500).json({ message: "Failed to filter enrollments" });
  }
};

