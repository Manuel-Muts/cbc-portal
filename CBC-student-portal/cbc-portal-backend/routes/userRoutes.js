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
  getStudentByAdmission
} from '../controllers/userController.js';

import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

// 🔓 Public routes
router.post('/login', loginUser);

// 👤 User profile route (protected)
router.get('/user', verifyToken, getUser);

// 🔐 Admin-only routes
router.post('/register', verifyToken, registerUser);
router.post('/resend-credentials', verifyToken, resendCredentials);

// All routes below require authentication
router.use(verifyToken);

// 👤 Student route
router.get('/student/:admission', getStudentByAdmission);

// 🧑‍🏫 Class teacher management
router.post('/classes/assign-teacher', assignClassTeacher);  // Assign class teacher
router.post('/classes/remove', removeClassTeacher);          // Remove class teacher

// 👥 User management
router.get('/', getAllUsers);         // Get all users
router.put('/:id', updateUser);       // Update user
router.delete('/:id', deleteUser);    // Delete user

// 📚 Academic allocations
router.post('/subjects/assign', assignSubjects);             // Assign subjects to teacher
router.post('/subjects/remove', removeSubjectAllocation);   // Remove subject allocation

router.get('/subjects/allocations', getSubjectAllocations); // View subject allocations

// ✅ Class teacher allocations (used by front-end for /allocations)
router.get('/allocations', getClassTeacherAllocations);     

export default router;
