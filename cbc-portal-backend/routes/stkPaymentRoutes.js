import express from 'express';
import verifyToken from '../middleware/verifyToken.js';
import {
	getTeacherPlanningPdfAccess,
	getTeacherPlanningPdfPaymentStatus,
	getStkPaymentStatus,
	handleStkCallback,
	initiateTeacherPlanningPdfStk,
	initiateSubscriptionStk
} from '../controllers/stkPaymentController.js';

const router = express.Router();

router.post('/subscriptions', verifyToken, initiateSubscriptionStk);
router.get('/planning-pdf/access', verifyToken, getTeacherPlanningPdfAccess);
router.post('/planning-pdf', verifyToken, initiateTeacherPlanningPdfStk);
router.get('/planning-pdf/:paymentId', verifyToken, getTeacherPlanningPdfPaymentStatus);
router.get('/:paymentId', verifyToken, getStkPaymentStatus);
router.post('/callback', handleStkCallback);

export default router;