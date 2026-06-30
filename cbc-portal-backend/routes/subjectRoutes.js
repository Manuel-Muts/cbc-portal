import express from "express";
import { getSubjects } from "../controllers/SubjectController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/", verifyToken, getSubjects);

export default router;