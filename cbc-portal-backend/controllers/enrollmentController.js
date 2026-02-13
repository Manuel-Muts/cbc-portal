//controllers/enrollmentController.js
import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { User } from "../models/User.js";

/**
 * ADMIN SEARCH STUDENTS (name or admission)
 */
export const adminSearchStudent = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: "Search query required" });
    }

    // -----------------------
    // FIND MATCHING STUDENTS
    // -----------------------
    const students = await User.find({
      schoolId: req.user.schoolId,
      role: "student",
      $or: [
        { name: { $regex: q, $options: "i" } },
        { admission: { $regex: q, $options: "i" } }
      ]
    }).select("name admission");

    if (!students.length) {
      return res.json({ results: [] });
    }

    const studentIds = students.map(s => s._id);

    // -----------------------
    // GET LATEST ENROLLMENTS
    // -----------------------
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: studentIds }
    })
      .sort({ academicYear: -1 })
      .populate("studentId", "name admission");

    // Latest enrollment per student
    const latestMap = new Map();
    for (const e of enrollments) {
      if (!latestMap.has(String(e.studentId._id))) {
        latestMap.set(String(e.studentId._id), e);
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

    res.json({ results });
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
