// middleware/attachEnrollmentToMarks.js
import { User } from "../models/User.js";
import  StudentEnrollment  from "../models/StudentEnrollment.js";

export const attachEnrollmentToMarks = async (req, res, next) => {
  try {
    const {
      admissionNo,
      schoolId,
      year,
      grade
    } = req.body;

    if (!admissionNo || !schoolId || !year) {
      // Cannot resolve enrollment — skip silently
      return next();
    }

    // ------------------------------------
    // FIND STUDENT
    // ------------------------------------
    const student = await User.findOne({
      role: "student",
      admission: admissionNo,
      schoolId
    }).select("_id name");

    if (!student) {
      return next(); // Let existing logic handle invalid admission
    }

    // ------------------------------------
    // FIND ACTIVE ENROLLMENT FOR YEAR
    // ------------------------------------
    const enrollment = await StudentEnrollment.findOne({
      studentId: student._id,
      schoolId,
      academicYear: Number(year),
      status: "active"
    });

    if (!enrollment) {
      // January / legacy case — no enrollment yet
      return next();
    }

    // ------------------------------------
    // ATTACH ENROLLMENT
    // ------------------------------------
    req.body.enrollmentId = enrollment._id;

    // ------------------------------------
    // GRADE MISMATCH WARNING (NON-BLOCKING)
    // Normalize grade comparison: UI sends numeric (e.g., 10), enrollment stores "Grade X" (e.g., "Grade 10")
    // ------------------------------------
    if (grade) {
      // Extract numeric part from enrollment.grade (e.g., "Grade 10" → "10")
      const enrollmentGradeNum = enrollment.grade.replace(/^\D+/, '').trim();
      const uiGradeNum = String(grade).trim();
      
      if (uiGradeNum !== enrollmentGradeNum) {
        console.warn(
          `[GRADE MISMATCH] Admission ${admissionNo}: UI grade=${uiGradeNum}, Enrollment grade=${enrollmentGradeNum}`
        );

        // Attach warning for controller response (optional)
        req.gradeWarning = {
          message: "Grade mismatch detected",
          uiGrade: uiGradeNum,
          enrollmentGrade: enrollmentGradeNum
        };
      }
    }

    next();

  } catch (err) {
    console.error("attachEnrollmentToMarks error:", err);
    next(); // Never block marks saving
  }
};
