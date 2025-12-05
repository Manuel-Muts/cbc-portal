import express from "express";
import {
  addMark,
  getMarks,
  deleteMark,
  updateMark,
  getStudentMarks,
  getAllMarks,
  getMarksByGrade
} from "../controllers/MarkController.js";
import VerifyToken from "../middleware/verifyToken.js";
import { isAdmin, isStudent, isClassTeacher } from "../middleware/roleChecks.js";

const router = express.Router();

// Teacher routes
router.post("/add", VerifyToken, addMark);
router.get("/teacher", VerifyToken, getMarks);
router.put("/:id", VerifyToken, updateMark);
router.delete("/:id", VerifyToken, deleteMark);

// Admin route
router.get("/all", VerifyToken, isAdmin, getAllMarks);

// Class teacher route
router.get("/by-grade", VerifyToken, isClassTeacher, getMarksByGrade);

// Student route
router.get("/student", VerifyToken, isStudent, getStudentMarks);

export default router;