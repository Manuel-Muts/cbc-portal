//controllers/enrollmentController.js
import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import LearnerElective from "../models/LearnerElective.js";
import { User } from "../models/User.js";
import { normalizePathway } from "../utils/pathwayUtils.js";

const SENIOR_PATHWAYS = ["STEM", "Social Sciences", "Arts & Sports Science"];

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
    const limit = Math.min(100, Math.max(10, parseInt(limitQuery, 10) || 15));
    const skip = (page - 1) * limit;

    const sanitizedQ = escapeRegex(q);

    // -----------------------
    // FIND MATCHING STUDENTS
    // -----------------------
    // 🆕 Smart search: exact match for numeric admission, regex for names
    const isNumericSearch = /^\d+$/.test(q); // Check if query is all digits
    
    let searchQuery = {
      schoolId: req.user.schoolId,
      role: "student"
    };

    if (isNumericSearch) {
      // For numeric searches, match admission exactly (not substring)
      searchQuery.$or = [
        { admission: q } // Exact match on admission
      ];
    } else {
      // For text searches, use regex on both name and admission
      searchQuery.$or = [
        { name: { $regex: sanitizedQ, $options: "i" } },
        { admission: { $regex: sanitizedQ, $options: "i" } }
      ];
    }

    const total = await User.countDocuments(searchQuery);

    const students = await User.find(searchQuery)
      .select("name admission contact")
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
      .select("studentId academicYear grade stream pathway status")
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
        contact: s.contact || null,
        academicYear: e?.academicYear || null,
        grade: e?.grade || null,
        stream: e?.stream || null,
        pathway: e?.pathway || null,
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
    const { academicYear, grade, stream, pathway, status } = req.body;

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
    const normalizeGrade = (g) => {
      if (!g) return null;
      const str = String(g).trim();
      // 🆕 Support Early Childhood grades (PP1, PP2, PG)
      if (str.toUpperCase().startsWith("PP") || str.toUpperCase() === "PG") {
        return str.toUpperCase();
      }
      const match = str.match(/\d+/); // Extract only the numeric part
      if (match) {
        return `Grade ${match[0]}`;
      }
      // If no numeric part, but it's already "Grade X", return as is.
      // Otherwise, if it's just a string, return it as is (e.g., "PP1", "PP2")
      return str.toLowerCase().startsWith("grade") ? str : str;
    };

    enrollment.academicYear = academicYear ?? enrollment.academicYear;
    enrollment.grade = grade ? normalizeGrade(grade) : enrollment.grade;
    enrollment.stream = stream ?? enrollment.stream; // Update stream field
    enrollment.pathway = (pathway !== undefined && pathway !== null) ? normalizePathway(pathway) : enrollment.pathway;
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
    }).select("grade stream term academicYear status pathway");

    if (!enrollment) {
      // Fall back to latest enrollment
      const latestEnrollment = await StudentEnrollment.findOne({
        studentId: studentId
      })
        .sort({ academicYear: -1 })
        .select("grade stream term academicYear status pathway");

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
 * CLEAN UP ORPHANED ENROLLMENTS
 * Deletes StudentEnrollment records that refer to non-existent User IDs.
 */
export const cleanOrphanedEnrollments = async (req, res) => {
  try {
    // Only admins or super_admins should be able to trigger this
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: "Unauthorized to perform this action" });
    }

    const schoolId = req.user.schoolId; // Admin's schoolId

    // Initial match for enrollments within the admin's school (if not super_admin)
    const initialMatch = {};
    if (req.user.role === 'admin' && schoolId) {
      initialMatch.schoolId = new mongoose.Types.ObjectId(schoolId);
    }

    // Find orphaned enrollments using aggregation
    const orphanedEnrollments = await StudentEnrollment.aggregate([
      {
        $match: initialMatch // Filter by school if admin
      },
      {
        $lookup: {
          from: "users", // The collection name for the User model
          localField: "studentId",
          foreignField: "_id",
          as: "studentDetails"
        }
      },
      {
        $match: {
          "studentDetails": { $eq: [] } // Match enrollments where no studentDetails were found
        }
      },
      {
        $project: {
          _id: 1 // Only need the ID of the orphaned enrollment
        }
      }
    ]);

    const orphanedIds = orphanedEnrollments.map(e => e._id);

    if (orphanedIds.length === 0) {
      return res.status(200).json({ message: "No orphaned enrollments found.", deletedCount: 0 });
    }

    // Delete the identified orphaned enrollments
    const deleteResult = await StudentEnrollment.deleteMany({ _id: { $in: orphanedIds } });

    console.log(`[Cleanup] Deleted ${deleteResult.deletedCount} orphaned enrollment records.`);

    res.status(200).json({
      message: `Successfully deleted ${deleteResult.deletedCount} orphaned enrollment records.`,
      deletedCount: deleteResult.deletedCount,
      deletedIds: orphanedIds
    });

  } catch (err) {
    console.error("cleanOrphanedEnrollments error:", err);
    res.status(500).json({ message: "Server error during cleanup" });
  }
};

/**
 * GET ALL STUDENTS IN A CLASS (by classLabel) - for Teachers to load students for marks entry
 * classLabel format: "Grade 5W", "Grade 3", etc.
 */
export const getStudentsByClass = async (req, res) => {
  try {
    const { classLabel } = req.params;
    const { pathway, electiveSubject } = req.query;
    
    if (!classLabel) {
      return res.status(400).json({ message: "classLabel is required" });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const normalizeSeniorSubjectName = (subject) => {
      const name = String(subject || "").trim().toLowerCase();
      const aliasMap = {
        "bio": "Biology",
        "biology": "Biology",
        "physics": "Physics",
        "phy": "Physics",
        "geo": "Geography",
        "geography": "Geography",
        "hist": "History",
        "history": "History",
        "chem": "Chemistry",
        "chemistry": "Chemistry",
        "cs": "Computer Studies",
        "computer studies": "Computer Studies",
        "computer science": "Computer Studies",
        "business": "Business Studies",
        "business studies": "Business Studies",
        "cre": "Christian Religious Education",
        "christian religious education": "Christian Religious Education",
        "christian religious studies": "Christian Religious Education",
        "religious education": "Christian Religious Education",
        "history & citizenship": "History & Citizenship",
        "history and citizenship": "History & Citizenship",
        "english": "English",
        "english language": "English",
        "math": "Mathematics",
        "maths": "Mathematics",
        "mathematics": "Mathematics",
        "kiswahili": "Kiswahili",
        "kiswahili language": "Kiswahili",
        "physical education": "PE",
        "phys ed": "PE",
        "pe": "PE",
        "ict": "ICT",
        "information communication technology": "ICT",
        "information and communication technology": "ICT",
      };
      return aliasMap[name] || subject?.trim() || "";
    };

    const buildElectiveSubjectPattern = (subject) => {
      const canonical = normalizeSeniorSubjectName(subject);
      const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const candidates = new Set([
        canonical,
        String(subject || "").trim(),
        String(subject || "").trim().toUpperCase(),
      ].filter(Boolean));

      const extraAliases = {
        "Physics": ["PHY"],
        "Christian Religious Education": ["CRE", "Christian Religious Studies", "Religious Education"],
        "Computer Studies": ["CS", "Computer Science"],
        "History & Citizenship": ["History and Citizenship"],
      };
      if (extraAliases[canonical]) {
        extraAliases[canonical].forEach(alias => candidates.add(alias));
      }

      const regexSource = Array.from(candidates)
        .map(subjectText => `^\\s*${escapeRegex(subjectText)}\\s*$`)
        .join("|");

      return new RegExp(`(?:${regexSource})`, "i");
    };

    // Only authenticated users can access this
    if (!req.user || !req.user.schoolId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 🚀 FIX: Update regex to support numeric streams (e.g. Grade 2 2) and handle mandatory spacing
    const classRegex = /^(?:Grade\s+)?(PP\d|PG|\d+)(?:\s+)?([A-Z0-9]+)?$/i;
    const match = classLabel.match(classRegex);
    
    if (!match) {
      return res.status(400).json({ message: "Invalid class label format" });
    }

    const extractedGrade = match[1]; // This will be "PP1", "PP2", "PG", "1", "5", etc.
    const extractedStream = match[2] || null; // This will be "W", "A", or null

    // Normalize the grade for the query to match database storage ("PP1", "PP2", "PG" or "Grade X")
    let queryGrade;
    if (extractedGrade.toUpperCase().startsWith("PP") || extractedGrade.toUpperCase() === "PG") {
      queryGrade = extractedGrade.toUpperCase(); // Keep "PP1", "PP2" as is
    } else {
      queryGrade = `Grade ${extractedGrade}`; // Prepend "Grade " for numeric grades
    }
    
    // Build query for aggregation (requires ObjectId)
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const query = {
      schoolId: schoolId,
      grade: queryGrade, // Use the normalized grade
      status: "active",
      academicYear: new Date().getFullYear()
    };
    
    if (extractedStream) { // Use the extracted stream
      query.stream = extractedStream;
    }

    const requestedPathway = pathway ? normalizePathway(pathway) : null;
    const requestedPathways = (req.query.pathways || "")
      .split(",")
      .map(p => normalizePathway(p))
      .filter(Boolean);

    if (!electiveSubject && requestedPathway && SENIOR_PATHWAYS.includes(requestedPathway)) {
      query.pathway = requestedPathway;
    }

    if (electiveSubject && String(electiveSubject).trim()) {
      const subjectPattern = buildElectiveSubjectPattern(electiveSubject);
      const electiveQuery = {
        schoolId,
        subjects: subjectPattern,
      };

      if (queryGrade) {
        electiveQuery.$or = [
          { grade: queryGrade },
          { grade: extractedGrade },
          { grade: { $regex: new RegExp(`\\b${escapeRegex(extractedGrade)}\\b`, "i") } },
        ];
      }

      const learnerIds = await LearnerElective.distinct("learnerId", electiveQuery);
      console.log("📌 Elective load backend:", {
        electiveSubject,
        requestedPathway,
        requestedPathways,
        queryGrade,
        learnerIdsCount: learnerIds.length,
        learnerIdsSample: learnerIds.slice(0, 10)
      });
      if (!learnerIds.length) {
        if (requestedPathway) {
          query.pathway = requestedPathway;
          console.log("📌 Falling back to pathway query for elective load:", requestedPathway);
        } else if (requestedPathways.length > 0) {
          query.pathway = requestedPathways.length === 1 ? requestedPathways[0] : { $in: requestedPathways };
          console.log("📌 Falling back to pathways query for elective load:", requestedPathways);
        } else {
          return res.json({
            students: [],
            total: 0,
            totalPages: 0,
            currentPage: page,
          });
        }
      } else {
        // Use learner IDs directly for elective lookups and avoid grade/stream mismatch filtering.
        delete query.grade;
        delete query.stream;
        query.studentId = { $in: learnerIds };
      }
    }

    // 🚀 Performance Optimization: Use countDocuments directly on the roster index.
    // This avoids an expensive join and leverages the compound index prefix.
    const total = await StudentEnrollment.countDocuments(query);

    // Fetch the students with pagination
    const dataPipeline = [
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "studentId",
          foreignField: "_id",
          as: "student"
        }
      },
      { $unwind: "$student" },
      { $sort: { "student.name": 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: "$student._id",
          name: "$student.name",
          admissionNo: "$student.admission",
          grade: "$grade",
          stream: "$stream",
          pathway: "$pathway"
        }
      }
    ];

    const students = await StudentEnrollment.aggregate(dataPipeline);

    res.json({
      students,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    console.error("getStudentsByClass error:", err);
    res.status(500).json({ message: "Server error fetching students" });
  }
};

// ---------------------------
// GET UNIQUE STREAMS (for filters)
// ---------------------------
export const getUniqueStreams = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: "School ID missing" });
    }
    const { grade } = req.query; // 🆕 Get grade from query
    const normalizeQueryGrade = (g) => {
      if (!g) return null;
      let value = String(g).trim();
      // 🆕 Support Early Childhood grades in unique stream filters
      if (value.toUpperCase().startsWith("PP") || value.toUpperCase() === "PG") {
        return value.toUpperCase();
      }
      const numeric = value.match(/\d+/);
      if (numeric) return `Grade ${numeric[0]}`;
      return value;
    };
    const normalizedGrade = normalizeQueryGrade(grade);

    const filter = {
      schoolId: req.user.schoolId,
      stream: { $ne: null, $ne: '' }
    };

    if (normalizedGrade && normalizedGrade !== 'all') { // 🆕 Apply grade filter if provided
      filter.grade = normalizedGrade;
    }
    const streams = await StudentEnrollment.distinct('stream', filter); // 🆕 Use the filter object
    res.json(streams);
  } catch (err) {
    console.error("getUniqueStreams error:", err);
    res.status(500).json({ message: "Server error fetching streams" });
  }
};