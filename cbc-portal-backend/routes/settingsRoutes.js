// routes/settingsRoutes.js
import express from "express";
import { getMarksEditSettings, updateMarksEditSettings, getTermConfig, updateTermConfig, getActiveTerm, getAssessmentConfig, updateAssessmentConfig, deleteAssessmentConfig } from "../controllers/settingsController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

// Route to read or update marks edit permissions for a specific academic term
router.get("/term-lock", verifyToken, getMarksEditSettings);
router.put("/term-lock", verifyToken, updateMarksEditSettings);

// Routes for term configuration
router.get("/term-config", verifyToken, getTermConfig);
router.put("/term-config", verifyToken, updateTermConfig);
router.get("/active-term", verifyToken, getActiveTerm);

router.get("/assessments", verifyToken, getAssessmentConfig);
router.put("/assessments", verifyToken, updateAssessmentConfig);
router.delete("/assessments/:id", verifyToken, deleteAssessmentConfig);

export default router;