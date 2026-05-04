import express from 'express';
import {
  getGlobalFeeNote,
  saveGlobalFeeNote
} from '../controllers/paymentController.js';
import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

router.get('/global-note', verifyToken, getGlobalFeeNote);
router.post('/global-note', verifyToken, saveGlobalFeeNote);

export default router;