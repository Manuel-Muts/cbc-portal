import express from "express";
import multer from "multer";
import path from "path";
import verifyToken from "../middleware/verifyToken.js";
import {
  addMaterial,
  getMaterials,
  deleteMaterial,
  downloadMaterial,
  getStudentMaterials
} from "../controllers/materialcontroller.js";

const router = express.Router();

// ---------------------------
// MULTER CONFIG
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(path.resolve(), "uploads")),
  filename: (req, file, cb) => {
    const ext =
      file.mimetype === "application/pdf"
        ? ".pdf"
        : file.mimetype === "application/msword"
        ? ".doc"
        : ".docx";
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ---------------------------
// STUDENT MIDDLEWARE
const isStudent = (req, res, next) => {
  if (req.user.role !== "student") return res.status(403).json({ message: "Only students can access this route" });
  next();
};

// ---------------------------
// ROUTES
router.post("/upload", verifyToken, upload.single("file"), addMaterial);
router.get("/student", verifyToken, isStudent, getStudentMaterials);
router.get("/", verifyToken, getMaterials);
router.delete("/:id", verifyToken, deleteMaterial);
router.get("/download/:id", verifyToken, downloadMaterial);

export default router;
