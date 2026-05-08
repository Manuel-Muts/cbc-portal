//routes/enrollmentRoutes.js
import express from "express";
import { adminSearchStudent, 
    updateEnrollment,
    getEnrollmentHistory,
    getEnrollmentById,
    getMyEnrollment,
    getStudentsByClass
} from "../controllers/enrollmentController.js";
import { cleanOrphanedEnrollments } from '../controllers/enrollmentController.js';
  
import  verifyToken  from "../middleware/verifyToken.js";


const router = express.Router();

// Admin search route
router.get("/admin-search", verifyToken, adminSearchStudent);

// Get students by class (for teachers to load students for marks entry)
router.get("/class/:classLabel", verifyToken, getStudentsByClass);

// Student route - get current enrollment with stream
router.get("/my-enrollment", verifyToken, getMyEnrollment);

// History route with verification
router.get("/history", verifyToken, getEnrollmentHistory);

// Single enrollment routes with verification
router.get("/:id", verifyToken, getEnrollmentById);
router.put("/:id", verifyToken, updateEnrollment);

    
// Route for cleaning up orphaned enrollments
router.delete("/cleanup", verifyToken, cleanOrphanedEnrollments);

export default router;
