import express from "express";
import {
  addMaterial,
  getMaterials,
  deleteMaterial,
  getAllMaterials,
  downloadMaterial
} from "../controllers/materialController.js";
import verifyToken from "../middleware/verifyToken.js";
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(path.resolve(), "uploads")),
  filename: (req, file, cb) => {
    const ext =
      file.mimetype === "application/pdf"
        ? ".pdf"
        : file.mimetype === "application/msword"
        ? ".doc"
        : ".docx";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only PDF or Word files are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const router = express.Router();

// ---------------------------
// MATERIAL ROUTES
// ---------------------------

// Upload material (teacher only)
router.post("/upload", verifyToken, upload.single("file"), addMaterial);

// Get all materials (students)
router.get("/all", verifyToken, getAllMaterials);

// Get teacher’s own materials
router.get("/", verifyToken, getMaterials);

// Delete material (teacher only)
router.delete("/:id", verifyToken, deleteMaterial);

// Secure download route (students/teachers)
router.get("/download/:id", verifyToken, downloadMaterial);

export default router;