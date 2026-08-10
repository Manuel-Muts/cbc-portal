// routes/settingsRoutes.js
import express from "express";
import { getMarksEditSettings, updateMarksEditSettings } from "../controllers/settingsController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

// Route to read or update marks edit permissions for a specific academic term
router.get("/term-lock", verifyToken, getMarksEditSettings);
router.put("/term-lock", verifyToken, updateMarksEditSettings);

export default router;