import { Material } from "../models/Material.js";
import fs from "fs";
import path from "path";

// ---------------------------
// ADD STUDY MATERIAL
// ---------------------------
export const addMaterial = async (req, res) => {
  try {
    const { grade, subject, title, description } = req.body;

    let fileName = null;
    let fileUrl = null;

    // Handle uploaded file
    if (req.file) {
      // Validate MIME type (multer already filters, but double-check)
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Only PDF or Word files are allowed" });
      }

      fileName = req.file.originalname;
      fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }

    const material = new Material({
      grade,
      subject,
      title,
      description,
      fileName,
      file: fileUrl,
      teacherId: req.user.id
    });

    await material.save();
    res.status(201).json(material);
  } catch (err) {
    console.error("addMaterial error:", err);
    res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// GET ALL MATERIALS (for students)
// ---------------------------
export const getAllMaterials = async (req, res) => {
  try {
    const materials = await Material.find({}).sort({ createdAt: -1 });
    res.json(materials);
  } catch (err) {
    console.error("getAllMaterials error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET MATERIALS BY TEACHER
// ---------------------------
export const getMaterials = async (req, res) => {
  try {
    const materials = await Material.find({ teacherId: req.user.id }).sort({ createdAt: -1 });
    res.json(materials);
  } catch (err) {
    console.error("getMaterials error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DELETE MATERIAL
// ---------------------------
export const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ message: "Material not found" });

    if (material.teacherId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Delete file from disk too
    const filePath = path.join(path.resolve(), "uploads", path.basename(material.file));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await material.deleteOne();
    res.json({ message: "Material deleted" });
  } catch (err) {
    console.error("deleteMaterial error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// SECURE DOWNLOAD MATERIAL
// ---------------------------
export const downloadMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ message: "Material not found" });

    // Optional: role-based check
    // Example: only students in the same grade or the teacher who uploaded
    // if (req.user.role === "student" && req.user.classGrade !== material.grade) {
    //   return res.status(403).json({ message: "Unauthorized to access this file" });
    // }

    const filePath = path.join(path.resolve(), "uploads", path.basename(material.file));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    res.download(filePath, material.fileName); // serve with original filename
  } catch (err) {
    console.error("downloadMaterial error:", err);
    res.status(500).json({ message: err.message });
  }
};