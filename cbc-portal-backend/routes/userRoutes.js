// routes/userRoutes.js
import express from "express";
import {
  registerUser,
  loginUser,
  resendCredentials,
  getAllUsers,
  updateUser,
  deleteUser,
  assignSubjects,
  assignClassTeacher,
  getSubjectAllocations,
  getMyAllocations,
  getUser,
  removeSubjectAllocation,
  removeClassTeacher,
  getClassTeacherAllocations,
  getStudentByAdmission,
  changePassword
} from "../controllers/userController.js";

import verifyToken from "../middleware/verifyToken.js";
import { getMySchool } from '../controllers/schoolController.js';
import { recordPayment, getStudentLedger, reversePayment, getMyFeeStructure, getMyBalance, getMyPayments } from "../controllers/paymentController.js";
import { initiateSTK } from "../controllers/mpesaController.js";
import { accountsOnly } from "../middleware/roleChecks.js";

const router = express.Router();

// ---------------------------
// Helper middleware
// ---------------------------
const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ msg: "Only admins can perform this action" });
  }
  next();
};

// ---------------------------
// PUBLIC ROUTES
// ---------------------------
router.post("/login", loginUser);

// ---------------------------
// AUTHENTICATED ROUTES
// ---------------------------
router.use(verifyToken);

router.get("/user", getUser);
router.put("/change-password", changePassword);

// ---------------------------
// STUDENT ROUTES
// ---------------------------
// Only authenticated users can fetch students
router.get("/student/:admission", getStudentByAdmission);

// after router initialization
router.get('/my-school', getMySchool);

// ---------------------------
// USER MANAGEMENT
// ---------------------------
router.post("/register", requireAdmin, registerUser);
router.post("/resend-credentials", requireAdmin, resendCredentials);
router.get("/", requireAdmin, getAllUsers);
router.put("/:id", requireAdmin, updateUser);
router.delete("/:id", requireAdmin, deleteUser);

// ---------------------------
// CLASS TEACHER MANAGEMENT
// ---------------------------
router.post("/classes/assign-teacher", requireAdmin, assignClassTeacher);
router.post("/classes/remove", requireAdmin, removeClassTeacher);
router.get("/allocations", getClassTeacherAllocations);

// ---------------------------
// ACCOUNTS ROUTES
// ---------------------------
router.post("/record", accountsOnly, recordPayment);
router.get("/ledger/:admission", accountsOnly, getStudentLedger);
router.get('/my-fees', getMyFeeStructure);
router.get('/my-balance', getMyBalance);
router.get('/my-payments', getMyPayments);
router.post("/reverse", accountsOnly, reversePayment);
router.post("/stk-push", initiateSTK);

// ---------------------------
// SUBJECT MANAGEMENT
// ---------------------------
router.post("/subjects/assign", requireAdmin, assignSubjects);
router.post("/subjects/remove", requireAdmin, removeSubjectAllocation);
router.get("/subjects/allocations", getSubjectAllocations);
router.get("/subjects/my-allocations", getMyAllocations);

export default router;
