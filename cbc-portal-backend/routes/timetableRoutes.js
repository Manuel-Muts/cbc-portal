import express from 'express';
import { saveTimetable, getTimetable, getAllTimetables } from '../controllers/timetableController.js';
import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

/**
 * 🆕 Helper to authorize specific roles or Dean status
 */
const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    
    const hasRole = roles.includes(req.user.role);
    const isDean = roles.includes('dean') && req.user.isDean === true;
    
    if (hasRole || isDean) return next();
    res.status(403).json({ message: "Forbidden: You do not have permission to perform this action." });
  };
};

// 🆕 Fetch all timetables for school (for clash detection context)
router.get('/all', verifyToken, getAllTimetables);

// Only Deans and Admins can publish timetables
router.post('/save', verifyToken, authorizeRoles(['admin', 'dean']), saveTimetable);

// All authenticated users (Students/Teachers) can view saved timetables
router.get('/:grade', verifyToken, getTimetable);

export default router;