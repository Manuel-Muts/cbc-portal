// routes/settingsRoutes.js
import express from "express";
import { getTermLockStatus, updateTermLockStatus } from "../controllers/settingsController.js"; // Import new function
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

// Route to check if a specific academic term is locked
router.get("/term-lock", verifyToken, getTermLockStatus);
router.put("/term-lock", verifyToken, updateTermLockStatus); // New route

export default router;