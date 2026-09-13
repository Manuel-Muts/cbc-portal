//routes/enrollmentRoutes.js
import express from "express";
import { adminSearchStudent,
     getEnrollmentById, 
     updateEnrollment,
      getEnrollmentHistory, 
      getMyEnrollment, 
      cleanOrphanedEnrollments, 
      getStudentsByClass, 
      getUniqueStreams,
      createLearnerForMarksEntry,
      findLearnerForMarksEntry,
      checkLearnerNameForMarksEntry } from "../controllers/enrollmentController.js";
import  verifyToken  from "../middleware/verifyToken.js";


const router = express.Router();

// Admin search route
router.get("/admin-search", verifyToken, adminSearchStudent);

// Get students by class (for teachers to load students for marks entry)
router.get("/class/:classLabel", verifyToken, getStudentsByClass);
router.get("/class/:classLabel/learner", verifyToken, findLearnerForMarksEntry);
router.get("/class/:classLabel/learner/name-check", verifyToken, checkLearnerNameForMarksEntry);
router.post("/class/:classLabel/learner", verifyToken, createLearnerForMarksEntry);

// Student route - get current enrollment with stream
router.get("/my-enrollment", verifyToken, getMyEnrollment);

// Get unique streams for filters
router.get("/unique-streams", verifyToken, getUniqueStreams);

// History route with verification
router.get("/history", verifyToken, getEnrollmentHistory);

// Single enrollment routes with verification
router.get("/:id", verifyToken, getEnrollmentById);
router.put("/:id", verifyToken, updateEnrollment);

// Route for cleaning up orphaned enrollments
router.delete("/cleanup", verifyToken, cleanOrphanedEnrollments);

export default router;
