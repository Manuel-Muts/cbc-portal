//controllers/enrollmentController.js
import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { User } from "../models/User.js";

const escapeRegex = (text) => {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

/**
 * ADMIN SEARCH STUDENTS (name or admission)
 */
export const adminSearchStudent = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { q, page: pageQuery, limit: limitQuery } = req.query;
    if (!q) {
      return res.status(400).json({ message: "Search query required" });
    }

    const page = Math.max(1, parseInt(pageQuery, 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(limitQuery, 10) || 20));
    const skip = (page - 1) * limit;

    const sanitizedQ = escapeRegex(q);

    // -----------------------
    // FIND MATCHING STUDENTS
    // -----------------------
    const searchQuery = {
      schoolId: req.user.schoolId,
      role: "student",
      $or: [
        { name: { $regex: sanitizedQ, $options: "i" } },
        { admission: { $regex: sanitizedQ, $options: "i" } }
      ]
    };

    const total = await User.countDocuments(searchQuery);

    const students = await User.find(searchQuery)
      .select("name admission")
      .skip(skip)
      .limit(limit)
      .lean();

    if (!students.length) {
      return res.json({ results: [], total, page, limit, pages: Math.ceil(total / limit) });
    }

    const studentIds = students.map(s => s._id);

    // -----------------------
    // GET LATEST ENROLLMENTS
    // -----------------------
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: studentIds }
    })
      .select("studentId academicYear grade stream status")
      .sort({ academicYear: -1 })
      .lean();

    // Latest enrollment per student
    const latestMap = new Map();
    for (const e of enrollments) {
      const sId = String(e.studentId);
      if (!latestMap.has(sId)) {
        latestMap.set(sId, e);
      }
    }

    const results = students.map(s => {
      const e = latestMap.get(String(s._id));
      return {
        studentId: s._id,
         enrollmentId: e?._id || null,
        name: s.name,
        admission: s.admission,
        academicYear: e?.academicYear || null,
        grade: e?.grade || null,
        stream: e?.stream || null,
        status: e?.status || "not-enrolled"
      };
    });

    res.json({ results, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("Admin student search error:", err);
    res.status(500).json({ message: "Search failed" });
  }
};

/**
 * GET SINGLE ENROLLMENT BY ID (FOR EDIT)
 */
export const getEnrollmentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    const enrollment = await StudentEnrollment
      .findById(id)
      .populate("studentId", "name admission");

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    res.json(enrollment);
  } catch (error) {
    console.error("Get enrollment error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * UPDATE ENROLLMENT DETAILS
 */
export const updateEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const { academicYear, grade, stream, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    const enrollment = await StudentEnrollment.findById(id);
    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (enrollment.status === "completed") {
      return res.status(403).json({ message: "Cannot edit completed student" });
    }

    // Normalize grade to "Grade X" format
    const normalizeGrade = (grade) => {
      if (!grade) return null;
      if (!isNaN(grade)) {
        return `Grade ${grade}`;
      }
      return grade;
    };

    enrollment.academicYear = academicYear ?? enrollment.academicYear;
    enrollment.grade = grade ? normalizeGrade(grade) : enrollment.grade;
    enrollment.stream = stream ?? enrollment.stream; // Update stream field
    enrollment.status = status ?? enrollment.status;

    await enrollment.save();

    res.json({ message: "Enrollment updated", enrollment });
  } catch (err) {
    console.error("Update enrollment error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET ENROLLMENT HISTORY FOR A STUDENT
 */
export const getEnrollmentHistory = async (req, res) => {
  const { studentId } = req.query;

  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return res.status(400).json({ message: "Invalid studentId" });
  }

  try {
    const history = await StudentEnrollment
      .find({ studentId })
      .sort({ academicYear: 1 })
      .select("academicYear grade term status promotedFrom createdAt");

    res.json({ history });
  } catch (err) {
    console.error("Enrollment history error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET STUDENT'S CURRENT ENROLLMENT (for student dashboard/reports)
 */
export const getMyEnrollment = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can access this endpoint" });
    }

    const studentId = req.user.id;
    const currentYear = new Date().getFullYear();

    // Get latest enrollment for this academic year, or latest overall
    const enrollment = await StudentEnrollment.findOne({
      studentId: studentId,
      academicYear: currentYear,
      status: "active"
    }).select("grade stream term academicYear status");

    if (!enrollment) {
      // Fall back to latest enrollment
      const latestEnrollment = await StudentEnrollment.findOne({
        studentId: studentId
      })
        .sort({ academicYear: -1 })
        .select("grade stream term academicYear status");

      if (!latestEnrollment) {
        return res.status(404).json({ message: "No enrollment found" });
      }

      return res.json(latestEnrollment);
    }

    res.json(enrollment);
  } catch (err) {
    console.error("getMyEnrollment error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET ALL STUDENTS IN A CLASS (by classLabel) - for Teachers to load students for marks entry
 * classLabel format: "Grade 5W", "Grade 3", etc.
 */
export const getStudentsByClass = async (req, res) => {
  try {
    const { classLabel } = req.params;
    
    if (!classLabel) {
      return res.status(400).json({ message: "classLabel is required" });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Only authenticated users can access this
    if (!req.user.id || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Parse classLabel: "Grade 5W" or "Grade 5"
    const classRegex = /Grade\s+(\d+)([A-Z])?/i;
    const match = classLabel.match(classRegex);
    
    if (!match) {
      return res.status(400).json({ message: "Invalid class label format" });
    }

    const gradeNum = match[1];
    const stream = match[2] || null;
    
    // Build query
    const query = {
      schoolId: req.user.schoolId,
      grade: `Grade ${gradeNum}`,
      status: "active",
      academicYear: new Date().getFullYear()
    };
    
    if (stream) {
      query.stream = stream;
    }

    const total = await StudentEnrollment.countDocuments(query);

    // Get enrollments and populate student details
    const enrollments = await StudentEnrollment.find(query)
      .populate({
        path: "studentId",
        select: "name admission",
        model: "User"
      })
      .select("studentId grade stream academicYear classLabel")
      .skip(skip)
      .limit(limit)
      .sort("studentId");

    // Filter out enrollments where studentId is null (orphaned records)
    const validEnrollments = enrollments.filter(e => e.studentId);

    // Format response
    const students = validEnrollments.map(e => ({
      _id: e.studentId._id,
      name: e.studentId.name,
      admissionNo: e.studentId.admission, // Maps DB 'admission' to API 'admissionNo'
      grade: e.grade,
      stream: e.stream,
      classLabel: e.classLabel
    }));

    res.json({
      students,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    console.error("getStudentsByClass error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
