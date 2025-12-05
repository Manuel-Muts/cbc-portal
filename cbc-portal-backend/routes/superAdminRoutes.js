import express from 'express';
import {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin
} from '../controllers/superAdminController.js';

import verifyToken from '../middleware/verifyToken.js';

const router = express.Router();

router.use(verifyToken);

// Schools
router.post('/schools', createSchool);
router.get('/schools', getSchools);

// Admins
router.post('/admins', createAdmin);
router.get('/admins', getAdmins);

// Single admin routes
router.get('/admins/:id', getAdminById);
router.put('/admins/:id', updateAdmin);
router.delete('/admins/:id', deleteAdmin);

// Single school routes
router.get('/schools/:id', getSchoolById);
router.put('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);


export default router;
