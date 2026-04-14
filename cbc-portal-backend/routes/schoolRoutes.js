// routes/schoolRoutes.js
import express from "express";
import { getMySchool, updateSchoolPaybill, updateSchoolSignature } from "../controllers/schoolController.js";
import  verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/my-school", verifyToken, getMySchool);
router.put("/update-paybill", verifyToken, updateSchoolPaybill);
router.put("/update-school-signature", verifyToken, updateSchoolSignature);

export default router;
