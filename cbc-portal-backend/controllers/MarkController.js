// controllers/MarkController.js
import mongoose from "mongoose";
import Mark from "../models/mark.js";
import { User } from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Setting from "../models/Setting.js";

// ---------------------------
// HELPER: Performance Level Subdivision
// ---------------------------
const getPerformanceSubdivision = (score) => {
  if (score >= 90) return "EE1";
  if (score >= 75) return "EE2";
  if (score >= 58) return "ME1";
  if (score >= 41) return "ME2";
  if (score >= 31) return "AE1";
  if (score >= 21) return "AE2";
  if (score >= 11) return "BE1";
  return "BE2";
};

// ---------------------------
// HELPER: Process Single Mark (for add, update, and bulk operations)
// ---------------------------
const processSingleMark = async (markData, reqUser, isNew = true) => {
  const {
    _id, // Only present for updates
    admissionNo,
    studentName,
    grade,
    stream,
    term,
    year,
    subject,
    pathway,
    course,
    assessment,
    score,
    continuousAssessment,
    projectWork,
    endTermExam
  } = markData;

  // 🆕 Term Lock Check
  // Prevents any modifications (add/update/bulk) if the school admin has locked the term.
  // Lock keys are stored as: term_lock_{schoolId}_{year}_{termNum}
  const lockKey = `term_lock_${reqUser.schoolId}_${year}_${term}`;
  const isLocked = await Setting.findOne({ key: lockKey });

  if (isLocked && isLocked.value === true && reqUser.role !== 'super_admin') {
    throw new Error(`Action denied: Year ${year} Term ${term} is officially locked. Please contact the Dean or Admin to make corrections.`);
  }

  // Find student if new or if admissionNo is provided for update
  let student;
  let enrollment;
  if (isNew || admissionNo) { // For updates, admissionNo might not be in req.body, but it's in the mark object
    student = await User.findOne({
      admission: admissionNo,
      role: "student",
      schoolId: reqUser.schoolId
    }).select("name admission _id");

    if (!student) {
      throw new Error(`Student with admission ${admissionNo} not found in your school`);
    }

    // 🆕 Strict Active Enrollment Check
    // Ensures marks can only be recorded for students with an "active" status for the given year.
    enrollment = await StudentEnrollment.findOne({
      studentId: student._id,
      schoolId: reqUser.schoolId,
      academicYear: Number(year),
      status: "active"
    });

    if (!enrollment) {
      throw new Error(`Recording failed: Student ${student.name} (${student.admission}) is not actively enrolled for ${year}. Check promotion status.`);
    }
  }

  // Determine if senior school
  const gradeNum = parseInt(String(grade).replace(/\D/g, ""), 10);
  const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

  // Validation
  if (isSeniorSchool) {
    if (!pathway || !course) {
      throw new Error("Pathway and course are required for senior school");
    }
    if (subject) {
      throw new Error("Subject should not be provided for senior school");
    }
  } else {
    if (!subject) {
      throw new Error("Subject is required for junior school");
    }
    if (pathway || course) {
      throw new Error("Pathway and course should not be provided for junior school");
    }
  }

  const markFields = {
    admissionNo: student ? student.admission : admissionNo, // Use found student's admission if available
    studentName: studentName || (student ? student.name : undefined),
    grade,
    stream: stream || (enrollment ? enrollment.stream : null),
    term,
    year,
    assessment,
    teacherId: reqUser.id,
    schoolId: reqUser.schoolId,
    enrollmentId: enrollment ? enrollment._id : (markData.enrollmentId || null)
  };

  // 🆕 Helper to safely parse input to Number or NULL (for "X" / Absence)
  // This prevents Number(null) from becoming 0
  const safeParse = (val) => {
    if (val === null || val === undefined || String(val).trim() === "" || String(val).trim().toUpperCase() === "X") return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  if (isSeniorSchool) {
    markFields.subject = null; markFields.pathway = pathway; markFields.course = course; markFields.score = null;
    markFields.continuousAssessment = safeParse(continuousAssessment);
    markFields.projectWork = safeParse(projectWork);
    markFields.endTermExam = safeParse(endTermExam);

    // 🆕 Senior School Absence Logic: If ANY component is missing (null), the final score is null (Absent).
    // This prevents "X" from turning into "0" when other components exist.
    const isFullyTested = 
        markFields.continuousAssessment !== null && 
        markFields.projectWork !== null && 
        markFields.endTermExam !== null;

    if (isFullyTested) {
      const ca = markFields.continuousAssessment;
      const pw = markFields.projectWork;
      const et = markFields.endTermExam;
      const finalScore = (ca * 0.3) + (pw * 0.2) + (et * 0.5);
      markFields.finalScore = Math.round(finalScore * 10) / 10; markFields.performanceLevel = getPerformanceSubdivision(markFields.finalScore);
    } else { 
      markFields.finalScore = null; 
      markFields.performanceLevel = null; 
    }
  } else {
    markFields.subject = subject; markFields.pathway = null; markFields.course = null;
    markFields.score = safeParse(score);
    markFields.finalScore = null; markFields.performanceLevel = null;
  }
  return markFields;
};

// ---------------------------
// ADD MARK
// ---------------------------
export const addMark = async (req, res) => {
  try {
    console.log("[addMark] Received payload:", req.body);

    const processedFields = await processSingleMark(req.body, req.user, true);
    const mark = new Mark(processedFields);
    await mark.save();

    return res.status(201).json({
      message: "Mark saved successfully",
      mark,
      warning: req.gradeWarning || undefined
    });

  } catch (err) {
    console.error("addMark error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// UPDATE MARK
// ---------------------------
export const updateMark = async (req, res) => {
  try {
    const { id } = req.params;
    const mark = await Mark.findById(id);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    if (mark.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    const processedFields = await processSingleMark({ ...req.body, _id: id, admissionNo: mark.admissionNo }, req.user, false); // Pass _id and admissionNo for context, isNew=false
    const updatedMark = await Mark.findByIdAndUpdate(
      id,
      { $set: processedFields },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Mark updated successfully",
      mark: updatedMark
    });

  } catch (err) {
    console.error("updateMark error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// BULK ADD/UPDATE MARKS
// ---------------------------
export const bulkAddUpdateMarks = async (req, res) => {
  try {
    const marksArray = req.body;
    if (!Array.isArray(marksArray) || marksArray.length === 0) {
      return res.status(400).json({ message: "Request body must be an array of marks" });
    }

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const markData of marksArray) {
      try {
        const isUpdate = !!markData._id;
        const processedFields = await processSingleMark(markData, req.user, !isUpdate);

        if (isUpdate) {
          const updatedMark = await Mark.findByIdAndUpdate(
            markData._id,
            { $set: processedFields },
            { new: true, runValidators: true }
          );
          if (updatedMark) {
            successCount++;
          } else {
            failureCount++;
            errors.push({ mark: markData, message: "Mark not found for update" });
          }
        } else {
          const newMark = new Mark(processedFields);
          await newMark.save();
          successCount++;
        }
      } catch (error) {
        failureCount++;
        errors.push({ mark: markData, message: error.message });
      }
    }

    if (failureCount > 0) {
      console.error("Bulk mark submission errors:", errors);
    }

    return res.status(200).json({
      message: "Bulk mark operation completed",
      successCount,
      failureCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error("bulkAddUpdateMarks error:", err);
    return res.status(500).json({ message: "Server error during bulk mark operation" });
  }
};

// ---------------------------
// GET MARKS FOR TEACHER
// ---------------------------
export const getMarks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    };

    const total = await Mark.countDocuments(query);
    const marks = await Mark.find(query)
      .sort({ year: -1, term: -1, assessment: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({ marks, total, totalPages: Math.ceil(total / limit), currentPage: page });
  } catch (err) {
    console.error("getMarks error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DELETE MARK
// ---------------------------
export const deleteMark = async (req, res) => {
  try {
    const mark = await Mark.findById(req.params.id);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    if (String(mark.teacherId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 🆕 Check Lock before deletion
    const lockKey = `term_lock_${req.user.schoolId}_${mark.year}_${mark.term}`;
    const isLocked = await Setting.findOne({ key: lockKey });
    if (isLocked && isLocked.value === true && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: "Cannot delete marks: This academic term is officially locked." });
    }

    await mark.deleteOne();
    return res.json({ message: "Mark deleted" });
  } catch (err) {
    console.error("deleteMark error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// STUDENT GET OWN MARKS
// ---------------------------
export const getStudentMarks = async (req, res) => {
  try {
    const admissionNo = req.user.admission;
    const schoolId = req.user.schoolId;
    let { term, year, assessment } = req.query;

    if (!admissionNo || !schoolId) {
      return res.status(400).json({ message: "Student info missing" });
    }

    // 🆕 Build query dynamically based on filters to prevent heavy fetch
    const filter = { admissionNo, schoolId };
    if (term && term !== "all") filter.term = Number(term);
    if (year && year !== "all") filter.year = Number(year);
    if (assessment && assessment !== "all") filter.assessment = Number(assessment);

    let studentMarks = await Mark.find(filter)
      .sort({ year: -1, term: -1, assessment: -1, _id: -1 })
      .lean();

    if (!studentMarks.length) {
      return res.json({ studentMarks: [], allClassMarks: [] });
    }

    const contextMark = studentMarks[0];
    const refTerm = contextMark.term;
    const refYear = contextMark.year;
    const refAssess = contextMark.assessment;
    const refGrade = contextMark.grade;

    // Optimized class comparison fetch: only fetch marks for the same grade/context
    const allClassMarks = await Mark.find({
      term: refTerm,
      year: refYear,
      assessment: refAssess,
      grade: refGrade,
      schoolId
    }).lean();

    return res.json({ studentMarks, allClassMarks });
  } catch (err) {
    console.error("getStudentMarks error:", err);
    return res.status(500).json({ message: "Server error fetching marks" });
  }
};

export const getMarksByGrade = async (req, res) => {
  try {
    // Helper to escape regex special characters
    const escapeRegex = (text) => {
      return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    };

    // 🔑 ALWAYS take grade from query
    const grade = req.query.grade;
    const schoolId = req.user.schoolId;

    if (!grade) {
      return res.status(400).json({
        message: "Grade query parameter is required"
      });
    }

    const filterByStream = req.query.stream && req.query.stream !== "" && req.query.stream !== "all";

    // ---------------------------
    // NORMALIZE GRADE
    // ---------------------------
    const gradeStr = String(grade).trim();
    const numericPart = gradeStr.match(/\d+/)?.[0];
    const normalizedGrades = [gradeStr];
    if (numericPart) {
      normalizedGrades.push(numericPart);
      normalizedGrades.push(`Grade ${numericPart}`);
    }

    const { term, year, assessment, subject, page, limit, search } = req.query;

    // ---------------------------
    // BASE MARK QUERY
    // ---------------------------
    const markQuery = {
      grade: { $in: [...new Set(normalizedGrades)] },
      schoolId: new mongoose.Types.ObjectId(schoolId)
    };

    if (term && term !== "all") markQuery.term = Number(term);
    if (year && year !== "all") markQuery.year = Number(year);
    if (assessment && assessment !== "all") markQuery.assessment = Number(assessment);
    if (subject && subject !== "all") markQuery.subject = subject.trim();
    
    // Search logic (optional)
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      markQuery.$or = [
        { studentName: regex },
        { admissionNo: regex }
      ];
    }

// ---------------------------
// STREAM FILTER (SMART + OPTIONAL)
// ---------------------------
if (filterByStream) {
  const requestedStream = req.query.stream.trim();

  const studentGradeVariants = [gradeStr, `Grade ${gradeStr}`];

  // Determine whether this grade uses streams (some schools don't)
  const streamsExist = await StudentEnrollment.exists({
    schoolId: schoolId,
    grade: { $in: studentGradeVariants },
    stream: { $ne: null }
  });

  const enrollmentFilter = {
    schoolId: schoolId,
    grade: { $in: studentGradeVariants },
    status: "active"
  };

  // If streams are used, filter by requested stream; otherwise use stream=null
  if (streamsExist) enrollmentFilter.stream = requestedStream;
  else enrollmentFilter.stream = null;

  const enrollments = await StudentEnrollment.find(enrollmentFilter)
    .populate({ path: "studentId", select: "admission" })
    .select("studentId")
    .lean();

  const admissions = enrollments.map(e => (e.studentId && e.studentId.admission) ? e.studentId.admission : null).filter(Boolean);

  if (!admissions.length) {
    return res.status(404).json({ message: "No students found for selected class" });
  }

  // Combine admission filter with existing search filters properly
  if (markQuery.$or) {
    markQuery.$and = [
      { admissionNo: { $in: admissions } },
      { $or: markQuery.$or }
    ];
    delete markQuery.$or;
  } else {
    markQuery.admissionNo = { $in: admissions };
  }
}


    console.log("[getMarksByGrade] final mark query:", markQuery);

    // ---------------------------
    // AGGREGATION PIPELINE
    // ---------------------------
    const pipeline = [
      { $match: markQuery },
      {
        // Group marks by student+assessment to consolidate subjects
        $group: {
          _id: {
            admissionNo: "$admissionNo",
            term: "$term",
            year: "$year",
            assessment: "$assessment"
          },
          // Persist student details from the first record found
          studentName: { $first: "$studentName" },
          grade: { $first: "$grade" },
          stream: { $first: "$stream" },
          // Collect all subjects/courses into an array
          subjects: {
            $push: {
              _id: "$_id",
              subject: "$subject",
              score: "$score",
              course: "$course",
              pathway: "$pathway",
              continuousAssessment: "$continuousAssessment",
              projectWork: "$projectWork",
              endTermExam: "$endTermExam",
              finalScore: "$finalScore"
            }
          }
        }
      },
      // Flatten structure for the response
      {
        $project: {
          _id: 0,
          admissionNo: "$_id.admissionNo",
          studentName: 1,
          grade: 1,
          stream: 1,
          term: "$_id.term",
          year: "$_id.year",
          assessment: "$_id.assessment",
          subjects: 1
        }
      },
      { $sort: { admissionNo: 1 } }
    ];

    // ---------------------------
    // PAGINATION LOGIC
    // ---------------------------
    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      pipeline.push({
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limitNum }]
        }
      });

      const [result] = await Mark.aggregate(pipeline).allowDiskUse(true);
      const total = result.metadata[0]?.total || 0;
      const data = result.data || [];

      return res.json({
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    const data = await Mark.aggregate(pipeline).allowDiskUse(true);

    if (!data.length) {
      return res.status(404).json({
        message: "No marks found"
      });
    }

    return res.json(data);

  } catch (err) {
    console.error("❌ getMarksByGrade error:", err);
    return res.status(500).json({
      message: "Server error fetching marks"
    });
  }
};

export const getPaginatedMarksByGrade = getMarksByGrade;

// ---------------------------
// CLASS MARKS FOR STUDENT (RANKING)
// ---------------------------
export const getClassMarks = async (req, res) => {
  try {
    const { term, year, assessment } = req.query;

    if (!term || !year || !assessment) {
      return res.status(400).json({ message: "Missing query parameters" });
    }

    const pipeline = [
      {
        $match: {
          schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
          term: Number(term),
          year: Number(year),
          assessment: Number(assessment)
        }
      },
      {
        $group: {
          _id: "$admissionNo",
          studentName: { $first: "$studentName" },
          grade: { $first: "$grade" },
          stream: { $first: "$stream" },
          subjects: {
            $push: {
              _id: "$_id",
              subject: "$subject",
              score: "$score",
              course: "$course",
              pathway: "$pathway",
              continuousAssessment: "$continuousAssessment",
              projectWork: "$projectWork",
              endTermExam: "$endTermExam",
              finalScore: "$finalScore"
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          admissionNo: "$_id",
          studentName: 1,
          grade: 1,
          stream: 1,
          subjects: 1
        }
      }
    ];

    const allMarks = await Mark.aggregate(pipeline).allowDiskUse(true);

    if (!allMarks.length) {
      return res.json([]);
    }

    return res.json(allMarks);
  } catch (err) {
    console.error("getClassMarks error:", err);
    return res.status(500).json({ message: "Server error fetching class marks" });
  }
};
