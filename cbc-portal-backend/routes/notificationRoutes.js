import express from 'express';
import verifyToken from '../middleware/verifyToken.js';
import { getMyNotifications, markMyNotificationsRead } from '../controllers/notificationController.js';

const router = express.Router();
router.use(verifyToken);
router.get('/mine', getMyNotifications);
router.post('/mine/read', markMyNotificationsRead);

export default router;
