import { Material } from "../models/Material.js";
import fs from "fs";
import path from "path";

// ---------------------------
// ADD STUDY MATERIAL (Teacher)
export const addMaterial = async (req, res) => {
  try {
    const { grade, subject, pathway, course, title, description } = req.body;
    const gradeNum = parseInt(grade);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    let fileName = null;
    let fileUrl = null;

    if (req.file) {
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

    // ===== JUNIOR SCHOOL (1-9) =====
    if (!isSeniorSchool) {
      if (!subject) {
        return res.status(400).json({ message: "Subject is required for Junior School materials" });
      }

      const material = new Material({
        grade,
        subject,
        title,
        description,
        fileName,
        file: fileUrl,
        teacherId: req.user.id,
        schoolId: req.user.schoolId
      });

      await material.save();
      return res.status(201).json(material);
    }
    // ===== SENIOR SCHOOL (10-12) =====
    else {
      if (!pathway || !course) {
        return res.status(400).json({ message: "Pathway and Course are required for Senior School materials" });
      }

      const material = new Material({
        grade,
        pathway,
        course,
        title,
        description,
        fileName,
        file: fileUrl,
        teacherId: req.user.id,
        schoolId: req.user.schoolId
      });

      await material.save();
      return res.status(201).json(material);
    }
  } catch (err) {
    console.error("addMaterial error:", err);
    res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// GET STUDENT MATERIALS
// ---------------------------
export const getStudentMaterials = async (req, res) => {
  try {
    console.log("🔎 Decoded user payload:", {
      id: req.user?.id,
      role: req.user?.role,
      schoolId: req.user?.schoolId,
      classGrade: req.user?.classGrade
    });

    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can access their materials" });
    }

    const schoolId = req.user.schoolId;
    let grade = req.user.classGrade; // may be "all"

    if (!schoolId) {
      return res.status(400).json({ message: "Student school not defined" });
    }

    const filter = { schoolId };
    if (grade && grade !== "all") {
      filter.grade = grade; // only filter grade if defined and not "all"
    }

    const gradeNum = parseInt(grade);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    // ===== JUNIOR SCHOOL (1-9): Filter by subject =====
    if (!isSeniorSchool) {
      const { subject } = req.query;
      if (subject && subject.toLowerCase() !== "all") {
        filter.subject = new RegExp(`^${subject}$`, "i");
      }
    }
    // ===== SENIOR SCHOOL (10-12): Filter by pathway (and optionally course) =====
    else {
      const { subject } = req.query; // 'subject' is used for pathway in frontend
      if (subject && subject.toLowerCase() !== "all") {
        // Convert slugified pathway back to proper format
        const pathwayMap = {
          "stem": "STEM",
          "social-sciences": "Social Sciences",
          "arts-&-sports-science": "Arts & Sports Science"
        };
        const pathway = pathwayMap[subject.toLowerCase()] || subject;
        filter.pathway = pathway;
      }
    }

    console.log("STUDENT MATERIAL FILTER:", filter); // debug

    const materials = await Material.find(filter).sort({ createdAt: -1 });
    res.json(materials);
  } catch (err) {
    console.error("getStudentMaterials error:", err);
    res.status(500).json({ message: "Server error fetching student materials" });
  }
};

// ---------------------------
// GET MATERIALS BY TEACHER
export const getMaterials = async (req, res) => {
  try {
    const materials = await Material.find({
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    }).sort({ createdAt: -1 });

    res.json(materials);
  } catch (err) {
    console.error("getMaterials error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DELETE MATERIAL
export const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ message: "Material not found" });

    if (material.teacherId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const filePath = path.join(path.resolve(), "uploads", path.basename(material.file));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await material.deleteOne();
    res.json({ message: "Material deleted" });
  } catch (err) {
    console.error("deleteMaterial error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DOWNLOAD MATERIAL
export const downloadMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ message: "Material not found" });

    if (material.schoolId.toString() !== req.user.schoolId.toString()) {
      return res.status(403).json({ message: "Unauthorized file access" });
    }

    const filePath = path.join(path.resolve(), "uploads", path.basename(material.file));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });

    res.download(filePath, material.fileName);
  } catch (err) {
    console.error("downloadMaterial error:", err);
    res.status(500).json({ message: err.message });
  }
};
