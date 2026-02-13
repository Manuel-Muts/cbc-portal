// routes/promotionRoutes.js
import express from "express";
import {
  promoteStudents,
  previewPromotion,
  filterEnrollments
} from "../controllers/promotionController.js";
import  {adminSearchStudent}  from "../controllers/enrollmentController.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.post("/promote", verifyToken, promoteStudents);
router.get("/preview", verifyToken, previewPromotion);
router.get("/filter", verifyToken, filterEnrollments);
router.get("/admin-search", verifyToken, adminSearchStudent);




export default router;
