import express from 'express';
import { 
  createAnnouncement, 
  getAllAnnouncements, 
  getActiveAnnouncements, 
  deleteAnnouncement,
  getSMSLogsSummary,
   retryFailedSMS
} from '../controllers/announcementController.js';
import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

/**
 * 🆕 Middleware to authorize Admin or the Dean of Studies
 */
const isAdminOrDean = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.isDean === true) {
    return next();
  }
  res.status(403).json({ message: "Access denied: Requires Admin or Dean privileges." });
};

const isAdmin = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'super_admin') {
    return next();
  }
  res.status(403).json({ message: "Admin access required" });
};

// Middleware to check for Super Admin only
const isSuperAdmin = (req, res, next) => {
  if (req.user.role === 'super_admin') {
    return next();
  }
  res.status(403).json({ message: "Super admin access required" });
};

// Publicly accessible (but authenticated) route for all users to see their relevant popups
router.get('/active', verifyToken, getActiveAnnouncements);

// Management routes for Super Admins to see the full list
router.get('/all', verifyToken, isSuperAdmin, getAllAnnouncements);

// Creation and deletion restricted to Admin and Super Admin
router.post('/', verifyToken, isAdmin, createAnnouncement);
router.delete('/:id', verifyToken, isAdmin, deleteAnnouncement);

router.get('/sms-summary', verifyToken, isAdminOrDean, getSMSLogsSummary);
router.post('/retry-failed', verifyToken, isAdminOrDean, retryFailedSMS);

export default router;