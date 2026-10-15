// routes/schoolRoutes.js
import express from "express";
import { getMySchool, updateSchoolPaybill, updateSchoolSignature, removeSchoolSignature } from "../controllers/schoolController.js";
import { initiateSmsStkTopup } from "../controllers/stkPaymentController.js";
import { deleteSchool as deleteSchoolBySuperAdmin } from "../controllers/superAdminController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/my-school", verifyToken, getMySchool);
router.put("/update-paybill", verifyToken, updateSchoolPaybill);
router.put("/update-school-signature", verifyToken, updateSchoolSignature);
router.delete("/update-school-signature", verifyToken, removeSchoolSignature);
router.post("/sms-topup", verifyToken, initiateSmsStkTopup);
router.delete("/schools/:id", verifyToken, deleteSchoolBySuperAdmin);

export default router;
