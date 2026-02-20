// routes/accountsRoutes.js
import express from "express";
import { getAllStudentAccounts, upsertFeeStructure, listSchoolFeeStructures, updateFeeStructure, deleteFeeStructure } from "../controllers/paymentController.js";
import verifyToken from "../middleware/verifyToken.js";
import { accountsOnly } from "../middleware/roleChecks.js";

const router = express.Router();

// Protect all routes
router.use(verifyToken);

// Accounts only
router.use(accountsOnly);

router.get("/", getAllStudentAccounts);
router.post('/fee-structure', upsertFeeStructure);
router.get('/fee-structures', listSchoolFeeStructures);
router.put('/fee-structure/:id', updateFeeStructure);
router.delete('/fee-structure/:id', deleteFeeStructure);

export default router;