// routes/schoolRoutes.js
import express from "express";
import { getMySchool, updateSchoolPaybill, updateSchoolSignature, initiateSmsTopup, handleIntaSendWebhook } from "../controllers/schoolController.js";
import { deleteSchool as deleteSchoolBySuperAdmin } from "../controllers/superAdminController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/my-school", verifyToken, getMySchool);
router.put("/update-paybill", verifyToken, updateSchoolPaybill);
router.put("/update-school-signature", verifyToken, updateSchoolSignature);
router.post("/sms-topup", verifyToken, initiateSmsTopup);
router.post("/sms-webhook", handleIntaSendWebhook); // No verifyToken (called by IntaSend)
router.delete("/schools/:id", verifyToken, deleteSchoolBySuperAdmin);

export default router;
