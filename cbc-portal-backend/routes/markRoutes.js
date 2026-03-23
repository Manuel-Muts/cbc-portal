// routes/markRoutes.js
import express from "express";
import {
  addMark,
  updateMark,
  getMarks,
  deleteMark,
  getStudentMarks,
  getMarksByGrade,
  getClassMarks,
  getPaginatedMarksByGrade
} from "../controllers/MarkController.js";

import VerifyToken from "../middleware/verifyToken.js";
import { isStudent, isClassTeacher } from "../middleware/roleChecks.js";
import { attachEnrollmentToMarks } from "../middleware/attachEnrollmentToMarks.js";

const router = express.Router();

// Teacher routes
router.post(
  "/add",
  VerifyToken,
  attachEnrollmentToMarks,   // 🔒 MUST be before addMark
  addMark
);

router.get("/teacher", VerifyToken, getMarks);

router.put("/:id", VerifyToken, attachEnrollmentToMarks, updateMark);

router.delete("/:id", VerifyToken, deleteMark);

// Class teacher route
router.get("/by-grade", VerifyToken, isClassTeacher, getMarksByGrade);
router.get("/paginated-by-grade", VerifyToken, isClassTeacher, getPaginatedMarksByGrade);

// Student routes
router.get("/student", VerifyToken, isStudent, getStudentMarks);
router.get("/class", VerifyToken, isStudent, getClassMarks);

export default router;
