import { Material } from "../models/Material.js";
import fs from "fs";
import path from "path";
import { cloudinary } from "../utils/cloudinary.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import axios from "axios";

// ---------------------------
// ADD STUDY MATERIAL (Teacher)
export const uploadRaw = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // When using multer-storage-cloudinary, req.file contains 'path' (URL) and 'filename' (public_id)
    res.json({
      url: req.file.path,
      public_id: req.file.filename
    });
  } catch (err) {
    console.error("uploadRaw error:", err);
    res.status(500).json({ message: "Upload processing failed" });
  }
};

export const addMaterial = async (req, res) => {
  try {
    const { grade, subject, pathway, course, title, description } = req.body;
    const gradeNum = parseInt(String(grade).replace(/\D/g, ""), 10);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    // --- CLOUDINARY FIX ---
    // The multer middleware (not shown) should be configured to use Cloudinary storage.
    // req.file will now contain Cloudinary data.

    if (req.file) {
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
        "image/jpg"
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Only PDF, Word, or Image files are allowed" });
      }
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
        fileName: req.file?.originalname,
        file: req.file?.path, // Cloudinary URL
        cloudinaryId: req.file?.filename, // Cloudinary public_id
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
        fileName: req.file?.originalname,
        file: req.file?.path, // Cloudinary URL
        cloudinaryId: req.file?.filename, // Cloudinary public_id
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can access their materials" });
    }

    const schoolId = req.user.schoolId;
    let grade = req.user.classGrade; // may be "all"

    // Helper to normalize grade (e.g., "Grade 5W" -> "5") to match material storage ("5")
    const normalizeGradeToNumberString = (g) => {
      if (!g || g === "all") return null;
      const str = String(g);
      const match = str.match(/\d+/);
      return match ? match[0] : null; 
    };

    // If classGrade is missing or "all", try to resolve real grade from Enrollment
    if (!grade || grade === "all") {
      const enrollment = await StudentEnrollment.findOne({
        studentId: req.user.id, // Mongoose handles casting if id is string
        status: "active"
      }).sort({ academicYear: -1 }).select("grade");

      if (enrollment && enrollment.grade) {
        grade = enrollment.grade;
        // normalize to number if stored as "Grade 5" for consistent int parsing later
        // But Material schema stores grade as String (often "5" or "Grade 5")
      }
    }

    if (!schoolId) {
      return res.status(400).json({ message: "Student school not defined" });
    }

    const filter = { schoolId };
    const normalizedGradeStr = normalizeGradeToNumberString(grade);
    
    // STRICT SERVER-SIDE FILTERING: Force grade filter if user is student
    if (normalizedGradeStr) {
      filter.grade = normalizedGradeStr; 
    }

    const gradeNum = parseInt(String(normalizedGradeStr).replace(/\D/g, ""), 10);
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

    const total = await Material.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const materialsDocs = await Material.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() to allow property modification

    const materials = materialsDocs.map(m => ({
      ...m,
      isRead: m.readBy && m.readBy.some(id => id.toString() === req.user.id)
    }));

    res.json({ materials, total, totalPages, currentPage: page });
  } catch (err) {
    console.error("getStudentMaterials error:", err);
    res.status(500).json({ message: "Server error fetching student materials" });
  }
};

// ---------------------------
// GET MATERIALS BY TEACHER
// ---------------------------
export const getMaterials = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    };

    const total = await Material.countDocuments(query);
    const materials = await Material.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ materials, total, totalPages: Math.ceil(total / limit), currentPage: page });
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

    // --- CLOUDINARY FIX ---
    // Delete from Cloudinary using the stored public_id
    if (material.cloudinaryId) {
      await cloudinary.uploader.destroy(material.cloudinaryId);
    }

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

    // Only count student downloads once per material
    const alreadyDownloaded = Array.isArray(material.readBy) && material.readBy.some(id => id.toString() === req.user.id.toString());
    if (req.user.role === "student") {
      if (!alreadyDownloaded) {
        await Material.findByIdAndUpdate(req.params.id, {
          $inc: { downloadCount: 1 },
          $addToSet: { readBy: req.user.id }
        });
      } else {
        await Material.findByIdAndUpdate(req.params.id, {
          $addToSet: { readBy: req.user.id }
        });
      }
    }

    // Generate signed URL to bypass Cloudinary ACL/Strict restrictions
    let resourceType = 'image';
    if (material.file && material.file.includes('/raw/')) resourceType = 'raw';
    else if (material.file && material.file.includes('/video/')) resourceType = 'video';

    const ext = material.file ? path.extname(material.file).split('?')[0].substring(1) : undefined;
    
    const urlParams = {
      resource_type: resourceType,
      secure: true,
      sign_url: true
    };

    // Avoid double extension for raw files (e.g. .pdf.pdf)
    if (resourceType !== 'raw' && ext) {
      urlParams.format = ext;
    }

    const signedUrl = material.cloudinaryId ? cloudinary.url(material.cloudinaryId, urlParams) : material.file;

    // Proxy file download with signed URL and User-Agent
    const response = await axios({
      url: signedUrl,
      method: "GET",
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    res.setHeader("Content-Disposition", `attachment; filename="${material.fileName || 'download'}"`);
    
    // Ensure correct content type for PDFs
    let contentType = response.headers["content-type"];
    if (material.fileName && material.fileName.toLowerCase().endsWith('.pdf')) {
      contentType = "application/pdf";
    }
    res.setHeader("Content-Type", contentType);
    response.data.pipe(res);
  } catch (err) {
    console.error("downloadMaterial error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// MARK MATERIAL AS READ
// ---------------------------
export const markAsRead = async (req, res) => {
  try {
    await Material.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user.id }
    });
    res.json({ success: true });
  } catch (err) {
    console.error("markAsRead error:", err);
    res.status(500).json({ message: err.message });
  }
};
