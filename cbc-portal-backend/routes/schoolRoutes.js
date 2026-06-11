// routes/schoolRoutes.js
import express from "express";
import { getMySchool, updateSchoolPaybill, updateSchoolSignature, initiateSmsTopup, handleIntaSendWebhook } from "../controllers/schoolController.js";
import  verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/my-school", verifyToken, getMySchool);
router.put("/update-paybill", verifyToken, updateSchoolPaybill);
router.put("/update-school-signature", verifyToken, updateSchoolSignature);
router.post("/sms-topup", verifyToken, initiateSmsTopup);
router.post("/sms-webhook", handleIntaSendWebhook); // No verifyToken (called by IntaSend)

export default router;
