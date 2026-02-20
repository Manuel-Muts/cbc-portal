// controllers/MarkController.js
import Mark from "../models/mark.js";
import { User } from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";

// ---------------------------
// ADD MARK
// ---------------------------
export const addMark = async (req, res) => {
  try {
    console.log("[addMark] Received payload:", req.body);

    const {
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
    } = req.body;

    const student = await User.findOne({
      admission: admissionNo,
      role: "student",
      schoolId: req.user.schoolId
    }).select("name admission");

    if (!student) {
      return res.status(404).json({ message: "Student not found in your school" });
    }

    // ✅ SAFE GRADE PARSING (FIXED)
    const gradeNum = parseInt(String(grade).replace(/\D/g, ""), 10);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    // ---------------------------
    // VALIDATION
    // ---------------------------
    if (isSeniorSchool) {
      if (!pathway || !course) {
        return res.status(400).json({
          message: "Pathway and course are required for senior school"
        });
      }
      if (subject) {
        return res.status(400).json({
          message: "Subject should not be provided for senior school"
        });
      }
    } else {
      if (!subject) {
        return res.status(400).json({
          message: "Subject is required for junior school"
        });
      }
      if (pathway || course) {
        return res.status(400).json({
          message: "Pathway and course should not be provided for junior school"
        });
      }
    }

    // ---------------------------
    // BASE MARK DATA
    // ---------------------------
    const markData = {
      admissionNo: student.admission,
      studentName: studentName || student.name,
      grade,
      stream: stream || null,
      term,
      year,
      assessment,
      teacherId: req.user.id,
      schoolId: req.user.schoolId,
      enrollmentId: req.body.enrollmentId || null
    };

    // ---------------------------
    // SENIOR SCHOOL
    // ---------------------------
    if (isSeniorSchool) {
      markData.subject = null;
      markData.pathway = pathway;
      markData.course = course;
      markData.score = null;

      markData.continuousAssessment = continuousAssessment ? Number(continuousAssessment) : null;
      markData.projectWork = projectWork ? Number(projectWork) : null;
      markData.endTermExam = endTermExam ? Number(endTermExam) : null;

      if (continuousAssessment || projectWork || endTermExam) {
        const ca = continuousAssessment ? Number(continuousAssessment) : 0;
        const pw = projectWork ? Number(projectWork) : 0;
        const et = endTermExam ? Number(endTermExam) : 0;

        const finalScore = (ca * 0.3) + (pw * 0.2) + (et * 0.5);
        markData.finalScore = Math.round(finalScore * 10) / 10;

        if (finalScore >= 80) markData.performanceLevel = "EE";
        else if (finalScore >= 65) markData.performanceLevel = "ME";
        else if (finalScore >= 50) markData.performanceLevel = "AE";
        else markData.performanceLevel = "BE";
      } else {
        // ✅ important reset
        markData.finalScore = null;
        markData.performanceLevel = null;
      }
    }

    // ---------------------------
    // JUNIOR SCHOOL
    // ---------------------------
    else {
      markData.subject = subject;
      markData.pathway = null;
      markData.course = null;
      markData.score = Number(score);
      markData.finalScore = null;
      markData.performanceLevel = null;
    }

    const mark = new Mark(markData);
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
    const {
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
    } = req.body;

    const mark = await Mark.findById(id);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    if (mark.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ SAFE GRADE PARSING (FIXED)
    const gradeNum = parseInt(String(grade).replace(/\D/g, ""), 10);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    // ---------------------------
    // VALIDATION
    // ---------------------------
    if (isSeniorSchool) {
      if (!pathway || !course) {
        return res.status(400).json({
          message: "Pathway and course are required for senior school"
        });
      }
      if (subject) {
        return res.status(400).json({
          message: "Subject should not be provided for senior school"
        });
      }
    } else {
      if (!subject) {
        return res.status(400).json({
          message: "Subject is required for junior school"
        });
      }
      if (pathway || course) {
        return res.status(400).json({
          message: "Pathway and course should not be provided for junior school"
        });
      }
    }

    // ---------------------------
    // UPDATE COMMON FIELDS
    // ---------------------------
    mark.grade = grade;
    mark.stream = stream || null;
    mark.term = term;
    mark.year = year;
    mark.assessment = assessment;

    // ---------------------------
    // SENIOR SCHOOL UPDATE
    // ---------------------------
    if (isSeniorSchool) {
      mark.subject = null;
      mark.pathway = pathway;
      mark.course = course;
      mark.score = null;

      mark.continuousAssessment = continuousAssessment ? Number(continuousAssessment) : null;
      mark.projectWork = projectWork ? Number(projectWork) : null;
      mark.endTermExam = endTermExam ? Number(endTermExam) : null;

      if (continuousAssessment || projectWork || endTermExam) {
        const ca = continuousAssessment ? Number(continuousAssessment) : 0;
        const pw = projectWork ? Number(projectWork) : 0;
        const et = endTermExam ? Number(endTermExam) : 0;

        const finalScore = (ca * 0.3) + (pw * 0.2) + (et * 0.5);
        mark.finalScore = Math.round(finalScore * 10) / 10;

        if (finalScore >= 80) mark.performanceLevel = "EE";
        else if (finalScore >= 65) mark.performanceLevel = "ME";
        else if (finalScore >= 50) mark.performanceLevel = "AE";
        else mark.performanceLevel = "BE";
      } else {
        // ✅ reset when cleared
        mark.finalScore = null;
        mark.performanceLevel = null;
      }
    }

    // ---------------------------
    // JUNIOR SCHOOL UPDATE
    // ---------------------------
    else {
      mark.subject = subject;
      mark.pathway = null;
      mark.course = null;
      mark.score = Number(score);
      mark.finalScore = null;
      mark.performanceLevel = null;
    }

    await mark.save();

    return res.status(200).json({
      message: "Mark updated successfully",
      mark
    });

  } catch (err) {
    console.error("updateMark error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// GET MARKS FOR TEACHER
// ---------------------------
export const getMarks = async (req, res) => {
  try {
    // Get all marks submitted by this teacher for their school
    const marks = await Mark.find({
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    }).sort({ year: -1, term: -1, assessment: -1 });

    return res.json(marks);
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

    let studentMarks = await Mark.find({ admissionNo, schoolId })
      .sort({ year: -1, term: -1, assessment: -1, _id: -1 })
      .lean();

    if (!studentMarks.length) {
      return res.status(404).json({ message: "No marks found for this student" });
    }

    const latest = studentMarks[0];
    term = term && term !== "all" ? Number(term) : latest.term;
    year = year && year !== "all" ? Number(year) : latest.year;
    assessment = assessment && assessment !== "all" ? Number(assessment) : latest.assessment;

    studentMarks = studentMarks.filter(
      m => m.term === term && m.year === year && m.assessment === assessment
    );

    if (!studentMarks.length) {
      return res.status(404).json({ message: "No marks found for selected filters" });
    }

    // ⚠️ left untouched (grade-based class comparison)
    const allClassMarks = await Mark.find({
      term,
      year,
      assessment,
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
    const isClassTeacher = req.user.roles?.includes("classteacher");

    // 🔑 ALWAYS take grade from query
    const grade = req.query.grade;

    if (!grade) {
      return res.status(400).json({
        message: "Grade query parameter is required"
      });
    }

    const filterByStream =
      isClassTeacher && req.query.stream && req.query.stream !== "";

    // ---------------------------
    // NORMALIZE GRADE
    // ---------------------------
    const gradeStr = String(grade).trim();
    const normalizedGrades = [
      gradeStr,
      `Grade ${gradeStr}`
    ];

    const { term, year, assessment, subject } = req.query;

    // ---------------------------
    // BASE MARK QUERY
    // ---------------------------
    const markQuery = {
      grade: { $in: [...new Set(normalizedGrades)] },
      schoolId: req.user.schoolId
    };

    if (term && term !== "all") markQuery.term = Number(term);
    if (year && year !== "all") markQuery.year = Number(year);
    if (assessment && assessment !== "all") markQuery.assessment = Number(assessment);
    if (subject && subject !== "all") markQuery.subject = subject.trim();

// ---------------------------
// STREAM FILTER (SMART + OPTIONAL)
// ---------------------------
if (filterByStream) {
  const requestedStream = req.query.stream.trim();

  const studentGradeVariants = [gradeStr, `Grade ${gradeStr}`];

  // Determine whether this grade uses streams (some schools don't)
  const streamsExist = await StudentEnrollment.exists({
    schoolId: req.user.schoolId,
    grade: { $in: studentGradeVariants },
    stream: { $ne: null }
  });

  const enrollmentFilter = {
    schoolId: req.user.schoolId,
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

  markQuery.admissionNo = { $in: admissions };
}


    console.log("[getMarksByGrade] final mark query:", markQuery);

    const marks = await Mark.find(markQuery).sort({
      admissionNo: 1,
      subject: 1
    });

    if (!marks.length) {
      return res.status(404).json({
        message: "No marks found"
      });
    }

    // ---------------------------
    // GROUP RESULTS
    // ---------------------------
    const grouped = {};
    marks.forEach(m => {
      const key = `${m.admissionNo}_${m.assessment}_${m.term}_${m.year}`;
      if (!grouped[key]) {
        grouped[key] = {
          admissionNo: m.admissionNo,
          studentName: m.studentName,
          grade: m.grade,
          term: m.term,
          year: m.year,
          assessment: String(m.assessment),
          subjects: []
        };
      }
      grouped[key].subjects.push({
        subject: m.subject,
        score: Number(m.score)
      });
    });

    return res.json(Object.values(grouped));

  } catch (err) {
    console.error("❌ getMarksByGrade error:", err);
    return res.status(500).json({
      message: "Server error fetching marks"
    });
  }
};

// ---------------------------
// CLASS MARKS FOR STUDENT (RANKING)
// ---------------------------
export const getClassMarks = async (req, res) => {
  try {
    const { term, year, assessment } = req.query;

    if (!term || !year || !assessment) {
      return res.status(400).json({ message: "Missing query parameters" });
    }

    const allMarks = await Mark.find({
      term: Number(term),
      year: Number(year),
      assessment: Number(assessment),
      schoolId: req.user.schoolId
    }).lean();

    if (!allMarks.length) {
      return res.status(404).json({ message: "No marks found" });
    }

    return res.json(allMarks);
  } catch (err) {
    console.error("getClassMarks error:", err);
    return res.status(500).json({ message: "Server error fetching class marks" });
  }
};
