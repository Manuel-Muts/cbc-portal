import express from 'express';
import verifyToken from '../middleware/verifyToken.js';
import { 
  addMaterial, 
  getMaterials, 
  getStudentMaterials, 
  deleteMaterial, 
  downloadMaterial,
  markAsRead 
} from '../controllers/materialController.js';
import upload from '../utils/multer.js'; // Import the Cloudinary multer config

const router = express.Router();

// Wrapper to handle Multer/Cloudinary errors gracefully
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error("Upload Error:", err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: "File size exceeds 10MB limit" });
      }
      // Return actual error message instead of 500 crash
      return res.status(400).json({ message: err.message || "File upload failed" });
    }
    next();
  });
};

// Teacher: Add material
router.post('/add', verifyToken, uploadMiddleware, addMaterial);

// Teacher: Get uploaded materials
router.get('/teacher', verifyToken, getMaterials);

// Student: Get materials
router.get('/student', verifyToken, getStudentMaterials);

// Shared: Download & Actions
router.get('/download/:id', verifyToken, downloadMaterial);
router.put('/:id/read', verifyToken, markAsRead);
router.delete('/:id', verifyToken, deleteMaterial);

export default router;