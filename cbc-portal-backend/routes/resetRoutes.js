// routes/resetRoutes.js
import express from "express";
import {
  verifyUser,
  requestReset,
  verifyResetCode,
  setNewPassword,
} from "../controllers/resetController.js";

const router = express.Router();

router.post("/verify-user", verifyUser);
router.post("/request", requestReset);
router.post("/verify", verifyResetCode);
router.post("/new-password", setNewPassword);

export default router;
