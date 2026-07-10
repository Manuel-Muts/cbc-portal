// routes/reportsRoutes.js
import express from "express";
import { generateFeeStructuresPDF, generateStudentFeesPDF, getOutstandingFees, generateOutstandingFeesPDF, generateOutstandingFeesPDFFromData, getSchoolTotals, getSchoolOverviewStats, getLearnerDemographics } from "../controllers/reportsController.js";
import verifyToken from "../middleware/verifyToken.js";
import { accountsOnly } from "../middleware/roleChecks.js";

const router = express.Router();

// Protect all routes
router.use(verifyToken);

// Custom middleware to allow both admin and accounts staff
const adminOrAccounts = (req, res, next) => {
  if (!req.user || !["admin", "accounts"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin or Accounts access required" });
  }
  next();
};

// Accounts only for fee structure reports
router.get("/fee-structures", accountsOnly, generateFeeStructuresPDF);
router.get("/fees", accountsOnly, generateStudentFeesPDF);
router.get("/outstanding-fees", accountsOnly, getOutstandingFees);
router.get("/school-totals", accountsOnly, getSchoolTotals);
router.get("/school-overview-stats", accountsOnly, getSchoolOverviewStats); // New endpoint for overview cards
router.get("/outstanding-fees-pdf", accountsOnly, generateOutstandingFeesPDF);
router.post("/outstanding-fees-pdf-from-data", accountsOnly, generateOutstandingFeesPDFFromData);
router.get("/learner-demographics", adminOrAccounts, getLearnerDemographics); // 🆕 Learner demographics endpoint (admin/accounts)

export default router;