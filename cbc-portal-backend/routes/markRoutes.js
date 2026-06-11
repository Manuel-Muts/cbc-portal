// routes/markRoutes.js
import express from "express";
import {
  addMark,
  updateMark,
  getMarks,
  deleteMark,
  getStudentMarks,
  getMarksByGrade,
  getMarksByGradeAndStudents, // 🆕 Import new function
  getSchoolWideRankings,
  bulkAddUpdateMarks,
  getClassMarks,
  getPaginatedMarksByGrade,
  broadcastResultsSMS,
  bulkDeleteMarks,
  getSMSLogsSummary
} from "../controllers/MarkController.js";

import VerifyToken from "../middleware/verifyToken.js";
import { isStudent, isClassTeacher } from "../middleware/roleChecks.js";

const router = express.Router();

/**
 * Middleware to authorize only the Dean of Studies
 */
const isDean = (req, res, next) => {
  if (req.user.isDean === true) {
    return next();
  }
  res.status(403).json({ message: "Access denied: Requires Dean privileges." });
};

// Teacher routes
router.post(
  "/add",
  VerifyToken,
  addMark
);

router.get("/teacher", VerifyToken, getMarks);

router.put("/:id", VerifyToken, updateMark);

router.route('/bulk-add-update').post(VerifyToken, bulkAddUpdateMarks)

router.post("/bulk-delete", VerifyToken, bulkDeleteMarks);

router.delete("/:id", VerifyToken, deleteMark);

router.get("/by-grade-and-students", VerifyToken, getMarksByGradeAndStudents); // 🆕 New route
// Class teacher route
router.get("/by-grade", VerifyToken, isClassTeacher, getMarksByGrade);
router.get("/paginated-by-grade", VerifyToken, isClassTeacher, getPaginatedMarksByGrade);
router.get("/school-wide-rankings", VerifyToken, isClassTeacher, getSchoolWideRankings);

// Student routes
router.get("/student", VerifyToken, isStudent, getStudentMarks);
router.get("/class", VerifyToken, isStudent, getClassMarks);

/**
 * @route   POST /api/marks/broadcast-sms
 * @desc    Aggregate and send student results to parents via SMS
 * @access  Private (Dean only)
 */
router.post("/broadcast-sms", VerifyToken, isDean, broadcastResultsSMS);

router.get("/sms-summary", VerifyToken, isDean, getSMSLogsSummary);

export default router;
