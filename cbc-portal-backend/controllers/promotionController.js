// controllers/promotionController.js
import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import {User} from "../models/User.js";
import { Student } from "../models/RoleModels.js";
import Payment from "../models/Payment.js";
import FeeStructure from "../models/FeeStructure.js";

const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

// ---------------------------
// GRADE NORMALIZER
// ---------------------------
const normalizeGrade = (grade) => {
  if (!grade) return null;
   let str = String(grade).trim();

  // 🆕 Robust PP check: handles "PP1", "pp1", "Grade PP1", "Grade pp1"
  let checkStr = str.toUpperCase();
  if (checkStr.startsWith("GRADE ")) {
    checkStr = checkStr.replace(/^GRADE\s+/i, "").trim();
  }
  if (checkStr.startsWith("PP")) {
    return checkStr;
  }
  

  // For other grades, extract the numeric part and prepend "Grade "
  const match = str.match(/\d+/);
  if (match) return `Grade ${match[0]}`;
  return str; // Fallback for other non-numeric, non-PP strings
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

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const results = [];
        const warnings = [];
        const errorsDuringProcessing = []; // To collect errors for individual students

        // 🚀 NEW: Pre-fetch all necessary context to solve N+1
        const studentIds = decisions.map(d => d.studentId);
        const [allStudents, currentEnrollments, allPayments, allFeeStructures] = await Promise.all([
          Student.find({ _id: { $in: studentIds } }).session(session).lean(),
          StudentEnrollment.find({
            studentId: { $in: studentIds },
            schoolId: req.user.schoolId,
            academicYear: fromAcademicYear,
            status: "active"
          }).session(session).lean(),
          Payment.find({
            studentId: { $in: studentIds },
            academicYear: fromAcademicYear,
            isReversed: { $ne: true }
          }).session(session).lean(),
          FeeStructure.find({
            schoolId: req.user.schoolId,
            academicYear: fromAcademicYear
          }).session(session).lean()
        ]);

        const enrollmentMap = new Map(currentEnrollments.map(e => [String(e.studentId), e]));
        const userMap = new Map(allStudents.map(u => [String(u._id), u]));

        // Step 2: Process with in-memory data sequentially
        for (const d of decisions) {
          try { // Wrap individual student processing in a try-catch
            const enrollment = enrollmentMap.get(String(d.studentId));

            if (!enrollment) {
              throw new Error("Active enrollment record not found for this year.");
            }

            // 🚫 Handle students already completed or transferred gracefully with a warning
            if (["completed", "transferred"].includes(enrollment.status)) {
              const student = userMap.get(String(d.studentId));
              warnings.push({
                studentId: d.studentId,
                name: student?.name || "Unknown Learner",
                admission: student?.admission || "N/A",
                message: `Learner is already marked as ${enrollment.status}. Skipping.`
              });
              continue; // Skip to the next student in the batch
            }
            // TRANSFER
            // -----------------------
            if (d.action === "transfer") {
              await StudentEnrollment.updateOne({ _id: enrollment._id }, { status: "transferred" }, { session });
              results.push({ studentId: d.studentId, action: "transferred" });
            continue;
            }

            const currentGrade = enrollment.grade;
            const normalizedGrade = normalizeGrade(currentGrade); // e.g., "Grade 9" or "Grade 12"
            const isTerminalGrade = normalizedGrade === "Grade 9" || normalizedGrade === "Grade 12"; // 🆕 Include Grade 12


            // -----------------------
            // TERMINAL GRADE (9 or 12) + PROMOTE = COMPLETE
            // -----------------------
            if (isTerminalGrade && d.action === "promote") { // 🆕 Use isTerminalGrade
              await StudentEnrollment.updateOne({ _id: enrollment._id }, { status: "completed" }, { session });
              results.push({ studentId: d.studentId, action: `completed (${normalizedGrade})` }); // 🆕 More specific action
            continue;
            }

            // -----------------------
            // CLOSE OLD ENROLLMENT
            // -----------------------
            await StudentEnrollment.updateOne({ _id: enrollment._id }, { status: "completed" }, { session });

            // -----------------------
            // AUTOMATIC CARRY FORWARD (POSITIVE BALANCE)
            // -----------------------
            try {
              const studentUser = userMap.get(String(enrollment.studentId));
              if (!studentUser) {
                warnings.push({ studentId: d.studentId, message: "Student user record not found, cannot carry forward balance." });
                // Continue processing promotion, but log this warning
              } else {
                  // Optimized In-Memory Balance Calculation
                  const fee = allFeeStructures.find(f => f.grade === enrollment.grade);
                  const sPayments = allPayments.filter(p => String(p.studentId) === String(studentUser._id));
                  const paid = sPayments.reduce((sum, p) => sum + p.amount, 0);
                  const totalFee = fee ? fee.totalFee : 0;
                  const bal = totalFee - paid;

                  if (bal !== 0) {
                      // Unique reference to avoid duplicates: BF-YYYY-STUDENTID
                      const baseRef = `BF-${fromAcademicYear}-${enrollment.studentId}`;

                      // CASE 1: Credit/Surplus (Balance < 0)
                      if (bal < 0) {
                          await Payment.create([{
                              studentId: enrollment.studentId,
                              schoolId: enrollment.schoolId,
                              amount: Math.abs(bal),
                              method: "fund_transfer",
                              reference: `${baseRef}-CR`, // CR for Credit
                              term: "Term 1",
                              academicYear: toAcademicYear,
                              recordedBy: req.user.id,
                              recordedByRole: "system"
                          }], { session });
                      }
                      // CASE 2: Debt/Arrears (Balance > 0)
                      else if (bal > 0) {
                          await Payment.create([{
                              studentId: enrollment.studentId,
                              schoolId: enrollment.schoolId,
                              amount: -Math.abs(bal), // Negative amount implies debt brought forward
                              method: "fund_transfer",
                              reference: `${baseRef}-DR`, // DR for Debit
                              term: "Term 1",
                              academicYear: toAcademicYear,
                              recordedBy: req.user.id,
                              recordedByRole: "system"
                          }], { session });
                      }
                  }
              }
            } catch (err) {
              console.error(`Failed to carry forward balance for student ${enrollment.studentId}:`, err);
              warnings.push({ studentId: d.studentId, message: `Balance carry-forward failed: ${err.message}` });
              // Do NOT re-throw here, as we want to continue with promotion if possible, but log the warning.
            }

            // -----------------------
            // REPEAT OR PROMOTE
            // -----------------------
            const nextGrade =
              d.action === "repeat"
                ? normalizedGrade
                : getNextGrade(normalizedGrade);

            if (!nextGrade) {
            throw new Error(`No next grade found in the school progression map for '${enrollment.grade}'.`);
            }

            // -----------------------
            // CREATE NEW ENROLLMENT
            // -----------------------
            const newEnrollment = await StudentEnrollment.create([{
              studentId: enrollment.studentId,
              schoolId: enrollment.schoolId,
              academicYear: toAcademicYear,
              grade: nextGrade,
              stream: enrollment.stream, // Carry forward stream
              term: "Term 1",
              promotedFrom: fromAcademicYear,
              status: "active"
            }], { session });

            await Student.findByIdAndUpdate(enrollment.studentId, {
              grade: nextGrade
            }, { session });

            results.push(newEnrollment[0]); // create returns an array
          } catch (studentProcessingError) {
            // If any step for a single student fails, record it and continue to the next student
            const student = userMap.get(String(d.studentId));
            errorsDuringProcessing.push({
              studentId: d.studentId,
              name: student?.name || "Unknown Learner",
              admission: student?.admission || "N/A",
              message: studentProcessingError.message
            });
            console.error(`Error processing student ${d.studentId}:`, studentProcessingError);
          }
        } // End of for...of loop

        // If there were any errors during individual student processing, throw to trigger rollback by withTransaction
        if (errorsDuringProcessing.length > 0) {
          const batchError = new Error("Promotion batch aborted due to specific learner errors.");
          batchError.individualErrors = errorsDuringProcessing;
          throw batchError;
        }

        // The session will automatically commit if no error is thrown
        res.json({
          message: "Promotion processed successfully",
          affected: results.length,
          warnings,
          errors: errorsDuringProcessing 
        });
      });
    } catch (err) {
      if (err.individualErrors) {
        return res.status(400).json({ 
          message: "The batch promotion was cancelled. No changes were saved.", 
          errors: err.individualErrors 
        });
      }
      res.status(500).json({ message: `Server error during promotion: ${err.message}` });
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("Promotion error (outer catch):", err);
    res.status(500).json({ message: "Server error during promotion" });
  }
};



export const previewPromotion = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { academicYear, page, limit, search } = req.query;
    if (!academicYear) {
      return res.status(400).json({ message: "Academic year required" });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const query = {
      schoolId: schoolId,
      academicYear: Number(academicYear),
      status: "active" // Only active students are eligible for promotion preview
    };

    // 🚀 Using aggregation to perform an inner join between Enrollments and Users.
    // This ensures that "Unknown Learner" rows are never generated because $unwind 
    // automatically excludes enrollments that don't have a matching user record.
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" }, 
      // 🆕 Add search filter if provided
      ...(search ? [{
        $match: {
          $or: [
            { "student.name": { $regex: escapeRegex(search), $options: "i" } },
            { "student.admission": { $regex: escapeRegex(search), $options: "i" } }
          ]
        }
      }] : []),
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { grade: 1, "student.name": 1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                studentId: "$student._id",
                enrollmentId: "$_id",
                name: "$student.name",
                admission: "$student.admission",
                currentGrade: "$grade",
                status: "$status"
              }
            }
          ]
        }
      }
    ];

    const result = await StudentEnrollment.aggregate(pipeline);
    const total = result[0]?.metadata[0]?.total || 0;
    const enrollments = result[0]?.data || [];

    const preview = enrollments.map(e => ({
      ...e,
      nextGrade: e.currentGrade === "Grade 9" ? null : getNextGrade(e.currentGrade)
    }));

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
