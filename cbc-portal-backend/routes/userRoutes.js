import express from 'express';
import {
  registerUser,
  loginUser,
  resendCredentials,
  getAllUsers,
  updateUser,
  deleteUser,
  assignSubjects,
  assignClassTeacher,
  getSubjectAllocations,
  getUser,
  removeSubjectAllocation,
  removeClassTeacher,
  getClassTeacherAllocations,
  getStudentByAdmission,
  changePassword
} from '../controllers/userController.js';

import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

// 🔓 Public routes
router.post('/login', loginUser);

// 👤 User profile route (protected)
router.get('/user', verifyToken, getUser);
router.put('/change-password', verifyToken, changePassword);
// ---------------------------
// Admin-only / Super-admin routes
// ---------------------------

// Register users (super_admin can create anyone, school admin can create teachers/students)
router.post('/register', verifyToken, (req, res, next) => {
  if (!req.user || (!req.user.isSuperAdmin && !req.user.isSchoolAdmin)) {
    return res.status(403).json({ msg: 'Only admins can register users' });
  }
  next();
}, registerUser);

// Resend credentials (admin only)
router.post('/resend-credentials', verifyToken, (req, res, next) => {
  if (!req.user || (!req.user.isSuperAdmin && !req.user.isSchoolAdmin)) {
    return res.status(403).json({ msg: 'Only admins can resend credentials' });
  }
  next();
}, resendCredentials);

// ---------------------------
// All routes below require authentication
// ---------------------------
router.use(verifyToken);

// 👤 Student route
router.get('/student/:admission', getStudentByAdmission);


// 🧑‍🏫 Class teacher management (admin only)
router.post('/classes/assign-teacher', (req, res, next) => {
  if (!req.user.canCreate('classteacher') && !req.user.isSuperAdmin) {
    return res.status(403).json({ msg: 'Only admins can assign class teachers' });
  }
  next();
}, assignClassTeacher);

router.post('/classes/remove', (req, res, next) => {
  if (!req.user.canCreate('classteacher') && !req.user.isSuperAdmin) {
    return res.status(403).json({ msg: 'Only admins can remove class teachers' });
  }
  next();
}, removeClassTeacher);

// 👥 User management (admin only)
router.get('/', (req, res, next) => {
  if (!req.user.isSuperAdmin && !req.user.isSchoolAdmin) {
    return res.status(403).json({ msg: 'Only admins can view users' });
  }
  next();
}, getAllUsers);

router.put('/:id', (req, res, next) => {
  if (!req.user.isSuperAdmin && !req.user.isSchoolAdmin) {
    return res.status(403).json({ msg: 'Only admins can update users' });
  }
  next();
}, updateUser);

router.delete('/:id', (req, res, next) => {
  if (!req.user.isSuperAdmin && !req.user.isSchoolAdmin) {
    return res.status(403).json({ msg: 'Only admins can delete users' });
  }
  next();
}, deleteUser);

// 📚 Academic allocations (admin only)
router.post('/subjects/assign', (req, res, next) => {
  if (!req.user.canCreate('teacher') && !req.user.isSuperAdmin) {
    return res.status(403).json({ msg: 'Only admins can assign subjects' });
  }
  next();
}, assignSubjects);

router.post('/subjects/remove', (req, res, next) => {
  if (!req.user.canCreate('teacher') && !req.user.isSuperAdmin) {
    return res.status(403).json({ msg: 'Only admins can remove subject allocations' });
  }
  next();
}, removeSubjectAllocation);

// View subject allocations (any authenticated user)
router.get('/subjects/allocations', getSubjectAllocations);

// ✅ Class teacher allocations
router.get('/allocations', getClassTeacherAllocations);

export default router;
