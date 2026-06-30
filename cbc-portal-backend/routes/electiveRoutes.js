import express from "express";

import {
  createElectiveSet,
  getElectiveSets,
  updateElectiveSet,
  deleteElectiveSet,
  assignElectiveSet,
  bulkAssignElectiveSet,
  getAssignments,
  deleteAssignment,
  getLearnerElectives
} from "../controllers/ElectiveController.js";

import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

/* ================= ELECTIVE SETS ================= */

router.get("/sets", verifyToken, getElectiveSets);
router.post("/sets", verifyToken, createElectiveSet);
router.put("/sets/:id", verifyToken, updateElectiveSet);
router.delete("/sets/:id", verifyToken, deleteElectiveSet);

/* ============== ASSIGNMENTS ================= */

router.get("/assignments", verifyToken, getAssignments);
router.post("/assignments", verifyToken, assignElectiveSet);
router.post("/assignments/bulk", verifyToken, bulkAssignElectiveSet);
router.delete("/assignments/:id", verifyToken, deleteAssignment);

/* ============== LEARNER ELECTIVES ================= */

router.get("/learners/:learnerId", verifyToken, getLearnerElectives);

export default router;