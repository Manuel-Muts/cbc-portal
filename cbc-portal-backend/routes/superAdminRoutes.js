
//superAdminRoutes.js
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
  deleteAdmin,
  getSystemOverview,
  getAnalytics,
  getLogs,
  getSettings,
  updateSettings,
  toggleSchoolStatus
} from '../controllers/superAdminController.js';
import { School } from "../models/school.js"; 


import verifyToken from '../middleware/verifyToken.js';
import { upload } from '../middleware/upload.js';
const router = express.Router();

// ============================
// Protect all routes for logged-in users
// ============================
router.use(verifyToken);

// ============================
// SUPER ADMIN ONLY routes
// ============================
const superAdminOnly = (req, res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
};

// ----------------------------
// Schools routes (super admin)
router.post('/schools', superAdminOnly, upload.single('logo'), createSchool);
router.get('/schools', superAdminOnly, getSchools);
router.get('/schools/:id', superAdminOnly, getSchoolById);
router.put('/schools/:id', superAdminOnly, upload.single('logo'), updateSchool);
router.delete('/schools/:id', superAdminOnly, deleteSchool);
router.patch('/schools/:id/toggle-status', superAdminOnly, toggleSchoolStatus);

// ----------------------------
// Admins routes (super admin)
router.post('/admins', superAdminOnly, createAdmin);
router.get('/admins', superAdminOnly, getAdmins);
router.get('/admins/:id', superAdminOnly, getAdminById);
router.put('/admins/:id', superAdminOnly, updateAdmin);
router.delete('/admins/:id', superAdminOnly, deleteAdmin);

// ----------------------------
// System overview (super admin)
router.get('/overview', superAdminOnly, getSystemOverview);
router.get('/analytics', superAdminOnly, getAnalytics);
router.get('/logs', superAdminOnly, getLogs);
router.get('/settings', superAdminOnly, getSettings);
router.put('/settings', superAdminOnly, updateSettings);

// ============================
// SCHOOL INFO ROUTE FOR ALL ROLES
// ============================
const allowSchoolAccess = (req, res, next) => {
  const allowedRoles = ["super_admin", "admin", "teacher", "classteacher"];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

router.get('/school-info', allowSchoolAccess, async (req, res) => {
  try {
    let school;

    // Super admin can fetch any school by query ?id=xxxx
    if (req.user.role === "super_admin" && req.query.id) {
      school = await School.findById(req.query.id).select("name logo address status");
      if (!school) return res.status(404).json({ message: "School not found" });
    } else {
      // Admin, teacher, classteacher fetch their assigned school
      if (!req.user.schoolId) {
        return res.status(403).json({ message: "No school assigned" });
      }
      school = await School.findById(req.user.schoolId).select("name logo address status");
      if (!school) return res.status(404).json({ message: "School not found" });
    }

    res.json({
      name: school.name,
      logo: school.logo,
      address: school.address,
      status: school.status
    });
  } catch (err) {
    console.error("Fetch School Info Error:", err);
    res.status(500).json({ message: "Failed to fetch school info" });
  }
});

export default router;
