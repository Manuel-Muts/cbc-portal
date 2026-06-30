import express from "express";
import { getStudents } from "../controllers/LearnerController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/", verifyToken, getStudents);

export default router;