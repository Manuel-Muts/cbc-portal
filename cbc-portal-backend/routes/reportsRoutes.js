// routes/reportsRoutes.js
import express from "express";
import { generateFeeStructuresPDF, generateStudentFeesPDF, getOutstandingFees, generateOutstandingFeesPDF, generateOutstandingFeesPDFFromData } from "../controllers/reportsController.js";
import verifyToken from "../middleware/verifyToken.js";
import { accountsOnly } from "../middleware/roleChecks.js";

const router = express.Router();

// Protect all routes
router.use(verifyToken);

// Accounts only for fee structure reports
router.get("/fee-structures", accountsOnly, generateFeeStructuresPDF);
router.get("/fees", accountsOnly, generateStudentFeesPDF);
router.get("/outstanding-fees", accountsOnly, getOutstandingFees);
router.get("/outstanding-fees-pdf", accountsOnly, generateOutstandingFeesPDF);
router.post("/outstanding-fees-pdf-from-data", accountsOnly, generateOutstandingFeesPDFFromData);

export default router;