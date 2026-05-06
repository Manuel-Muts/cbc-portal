// controllers/promotionController.js
import StudentEnrollment from "../models/StudentEnrollment.js";
import {User} from "../models/User.js";
import Mark from "../models/mark.js";
import Payment from "../models/Payment.js";
import { calculateBalance } from "../services/balanceService.js";



// ---------------------------
// GRADE NORMALIZER
// ---------------------------
const normalizeGrade = (grade) => {
  if (!grade) return null;
  const str = String(grade).trim();
  if (!isNaN(str) && str !== "") return `Grade ${str}`;
  if (str.length <= 2 && /^\d+[A-Z]?$/i.test(str)) return `Grade ${str}`;
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

    // Optimize: Process students in parallel instead of sequentially
    await Promise.all(decisions.map(async (d) => {
      const enrollment = await StudentEnrollment.findOne({
        studentId: d.studentId,
        schoolId: req.user.schoolId,
        academicYear: fromAcademicYear,
        status: "active"
      });

      if (!enrollment) return;

      // 🚫 Skip if already completed or transferred
      if (["completed", "transferred"].includes(enrollment.status)) {
        return;
      }

      // -----------------------
      // TRANSFER
      // -----------------------
      if (d.action === "transfer") {
        await enrollment.updateOne({ status: "transferred" });
        return;
      }

      const currentGrade = enrollment.grade;
      const normalizedGrade = normalizeGrade(currentGrade);
      const isGrade9 = normalizedGrade === "Grade 9";


      // -----------------------
      // GRADE 9 + PROMOTE = COMPLETE
      // -----------------------
      if (isGrade9 && d.action === "promote") {
        await enrollment.updateOne({ status: "completed" });
        return;
      }

      // -----------------------
      // CLOSE OLD ENROLLMENT
      // -----------------------
      await enrollment.updateOne({ status: "completed" });

      // -----------------------
      // AUTOMATIC CARRY FORWARD (POSITIVE BALANCE)
      // -----------------------
      try {
        const studentUser = await User.findById(enrollment.studentId);
        // Calculate balance for the year we are leaving
        const balanceData = await calculateBalance(studentUser, enrollment.grade, fromAcademicYear);
        
        if (balanceData) {
          const bal = balanceData.balance;
          // Unique reference to avoid duplicates: BF-YYYY-STUDENTID
          const baseRef = `BF-${fromAcademicYear}-${enrollment.studentId}`;

          // CASE 1: Credit/Surplus (Balance < 0)
          // Example: Fee 10k, Paid 15k, Balance = -5k.
          // Action: Credit new year with +5000.
          if (bal < 0) {
            await Payment.create({
              studentId: enrollment.studentId,
              schoolId: enrollment.schoolId,
              amount: Math.abs(bal),
              method: "fund_transfer",
              reference: `${baseRef}-CR`, // CR for Credit
              term: "Term 1",
              academicYear: toAcademicYear,
              recordedBy: req.user.id,
              recordedByRole: "system" // Or 'accounts' if 'system' not in enum
            });
          }
          // CASE 2: Debt/Arrears (Balance > 0)
          // Example: Fee 10k, Paid 5k, Balance = +5k.
          // Action: Debit new year with -5000 (Negative payment increases balance).
          else if (bal > 0) {
            await Payment.create({
              studentId: enrollment.studentId,
              schoolId: enrollment.schoolId,
              amount: -Math.abs(bal), // Negative amount implies debt brought forward
              method: "fund_transfer",
              reference: `${baseRef}-DR`, // DR for Debit
              term: "Term 1",
              academicYear: toAcademicYear,
              recordedBy: req.user.id,
              recordedByRole: "accounts" // keeping role valid
            });
          }
        }
      } catch (err) {
        console.error(`Failed to carry forward balance for student ${enrollment.studentId}:`, err);
        // We assume we continue promoting even if balance transfer fails, or log a warning
      }

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
        return;
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
    }));

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

    const { academicYear, page, limit } = req.query;
    if (!academicYear) {
      return res.status(400).json({ message: "Academic year required" });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const query = {
      schoolId: req.user.schoolId,
      academicYear: Number(academicYear),
      status: "active" // Only active students are eligible for promotion preview
    };

    const total = await StudentEnrollment.countDocuments(query);

    const enrollments = await StudentEnrollment.find(query)
      .populate("studentId", "name admission")
      .sort({ grade: 1, _id: 1 }) // Stable sort for pagination
      .skip(skip)
      .limit(limitNum)
      .lean(); // Optimize read query

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

    res.json({ 
      preview,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum
    });

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
      .sort({ grade: 1, _id: 1 });

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
