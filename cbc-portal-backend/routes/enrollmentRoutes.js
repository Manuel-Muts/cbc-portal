//routes/enrollmentRoutes.js
import express from "express";
import { adminSearchStudent, 
    updateEnrollment,
    getEnrollmentHistory,
    getEnrollmentById,
    getMyEnrollment
} from "../controllers/enrollmentController.js";
  
import  verifyToken  from "../middleware/verifyToken.js";


const router = express.Router();

// Admin search route
router.get("/admin-search", verifyToken, adminSearchStudent);

// Student route - get current enrollment with stream
router.get("/my-enrollment", verifyToken, getMyEnrollment);

// History route with verification
router.get("/history", verifyToken, getEnrollmentHistory);

// Single enrollment routes with verification
router.get("/:id", verifyToken, getEnrollmentById);
router.put("/:id", verifyToken, updateEnrollment);


export default router;
