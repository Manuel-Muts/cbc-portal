import express from 'express';
import verifyToken from '../middleware/verifyToken.js';
import { getDashboardSummary } from '../controllers/dashboardSummaryController.js';

const router = express.Router();

router.use(verifyToken);
router.get('/summary', getDashboardSummary);

export default router;
