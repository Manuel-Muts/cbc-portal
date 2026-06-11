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
  getClassTeacher,
  changePassword,
  toggleDeanStatus,
  updateSignature,
  bulkDeleteStudentsByClass,
  getClassTeachersByGradesAndStreams, // 🆕 Import the new function
  updateGradingConfig, // 🆕 Import the new function
  bulkRegisterUsers // 🆕 Import the new function
} from "../controllers/userController.js";

import verifyToken from "../middleware/verifyToken.js";
import { getMySchool } from '../controllers/schoolController.js';
import { recordPayment, getStudentLedger, reversePayment, getMyFeeStructure, getMyBalance, getMyPayments } from "../controllers/paymentController.js";
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

/**
 * 🆕 Middleware to authorize Admin or Dean
 */
const isAdminOrDean = (req, res, next) => {
  if (['admin', 'super_admin'].includes(req.user.role) || req.user.isDean === true) {
    return next();
  }
  res.status(403).json({ message: "Access denied: Requires Admin or Dean privileges." });
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
router.put("/profile/signature", updateSignature);

// ---------------------------
// STUDENT ROUTES
// ---------------------------
// Only authenticated users can fetch students
router.get("/student/:admission", getStudentByAdmission);

// after router initialization
router.get('/my-school', getMySchool);
router.put('/my-school/grading-config', isAdminOrDean, updateGradingConfig); // 🆕 Add the PUT route

// ---------------------------
// USER MANAGEMENT
// ---------------------------
router.post("/register", requireAdmin, registerUser);
router.post("/bulk-register", requireAdmin, bulkRegisterUsers); // 🆕 New route for bulk registration
router.post("/resend-credentials", requireAdmin, resendCredentials);
router.get("/", getAllUsers); // Removed requireAdmin middleware
router.put("/:id", requireAdmin, updateUser);
router.delete("/bulk-delete-students", requireAdmin, bulkDeleteStudentsByClass); // 🆕 New route for bulk deletion
router.delete("/:id", requireAdmin, deleteUser);
router.post("/toggle-dean", requireAdmin, toggleDeanStatus);


// ---------------------------
// CLASS TEACHER MANAGEMENT
// ---------------------------
router.post("/classes/assign-teacher", requireAdmin, assignClassTeacher);
router.post("/classes/remove", requireAdmin, removeClassTeacher);
router.get("/allocations", getClassTeacherAllocations);
router.get("/class-teacher", getClassTeacher);
router.post('/class-teachers/batch', getClassTeachersByGradesAndStreams);
// ---------------------------
// ACCOUNTS ROUTES
// ---------------------------
router.post("/record", accountsOnly, recordPayment);
router.get("/ledger/:admission", accountsOnly, getStudentLedger);
router.get('/my-fees', getMyFeeStructure);
router.get('/my-balance', getMyBalance);
router.get('/my-payments', getMyPayments);
router.post("/reverse", accountsOnly, reversePayment);

// ---------------------------
// SUBJECT MANAGEMENT
// ---------------------------
router.post("/subjects/assign", requireAdmin, assignSubjects);
router.post("/subjects/remove", requireAdmin, removeSubjectAllocation);
router.get("/subjects/allocations", getSubjectAllocations);
router.get("/subjects/my-allocations", getMyAllocations);

export default router;
