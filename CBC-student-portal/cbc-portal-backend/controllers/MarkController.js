import { Mark } from "../models/mark.js";
import { User } from "../models/User.js";

// ---------------------------
// ADD MARK
// ---------------------------
export const addMark = async (req, res) => {
  try {
    const { admissionNo, studentName, grade, term, year, subject, assessment, score } = req.body;

    const student = await User.findOne({ admission: admissionNo, role: "student" }).select("name admission grade");
    if (!student) return res.status(404).json({ message: "Student not found" });

    const mark = new Mark({
      admissionNo: student.admission,
      studentName: studentName || student.name,
      grade,
      term,
      year,
      subject,
      assessment,
      score: Number(score),
      teacherId: req.user.id,
    });

    await mark.save();
    res.status(201).json(mark);
  } catch (err) {
    console.error("addMark error:", err);
    res.status(400).json({ message: err.message });
  }
};

// ---------------------------
// GET MARKS FOR TEACHER
// ---------------------------
export const getMarks = async (req, res) => {
  try {
    const marks = await Mark.find({ teacherId: req.user.id }).sort({ year: -1, term: -1, assessment: -1 });
    res.json(marks);
  } catch (err) {
    console.error("getMarks error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// DELETE MARK
// ---------------------------
export const deleteMark = async (req, res) => {
  try {
    const mark = await Mark.findById(req.params.id);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    if (mark.teacherId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await mark.deleteOne();
    res.json({ message: "Mark deleted" });
  } catch (err) {
    console.error("deleteMark error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// UPDATE MARK
// ---------------------------
export const updateMark = async (req, res) => {
  try {
    const mark = await Mark.findById(req.params.id);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    if (mark.teacherId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { admissionNo, studentName, grade, term, year, subject, assessment, score } = req.body;

    mark.admissionNo = admissionNo ?? mark.admissionNo;
    mark.studentName = studentName ?? mark.studentName;
    mark.grade = grade ?? mark.grade;
    mark.term = term ?? mark.term;
    mark.year = year ?? mark.year;
    mark.subject = subject ?? mark.subject;
    mark.assessment = assessment ?? mark.assessment;
    mark.score = score ?? mark.score;

    await mark.save();
    res.json(mark);
  } catch (err) {
    console.error("updateMark error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET STUDENT MARKS (supports filters + latest first)
// ---------------------------
export const getStudentMarks = async (req, res) => {
  try {
    // Only students can access their marks
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can access their marks" });
    }

    const admission = req.user.admission;
    const { term, year, assessment } = req.query; // properly declared here

    console.log("Filters applied:", { term, year, assessment });

    const filter = { admissionNo: admission };

    // Apply numeric filters if provided and not "all"
    if (term && term !== "all") filter.term = Number(term);
    if (year && year !== "all") filter.year = Number(year);
    if (assessment && assessment !== "all") filter.assessment = Number(assessment);

    // Query marks and sort latest first
    const marks = await Mark.find(filter).sort({ year: -1, term: -1, assessment: -1, _id: -1 });

    console.log(`Found ${marks.length} marks for student ${admission}`);
    res.json(marks);
  } catch (err) {
    console.error("getStudentMarks error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// GET ALL MARKS (optional for admin)
// ---------------------------
export const getAllMarks = async (req, res) => {
  try {
    const marks = await Mark.find().sort({ year: -1, term: -1, assessment: -1 });
    res.json(marks);
  } catch (err) {
    console.error("getAllMarks error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =====================================
// GET MARKS BY GRADE (Filtered Grouped)
// =====================================
export const getMarksByGrade = async (req, res) => {
  try {
    const { grade, term, year, assessment } = req.query;

    // Enforce role: must be class teacher
    const roles = Array.isArray(req.user.roles)
      ? req.user.roles.map(r => r.toLowerCase())
      : [String(req.user.role).toLowerCase()];
    const isClassTeacher = roles.includes("classteacher") || req.user?.isClassTeacher === true;

    if (!isClassTeacher) {
      return res.status(403).json({ message: "Forbidden: class teacher role required" });
    }

    // Enforce grade scoping
    const userClassGrade = req.user?.classGrade;

    if (grade && userClassGrade && grade !== userClassGrade) {
      if (process.env.DEBUG === "true") {
        console.warn(
          `⚠️ Grade mismatch: requested=${grade}, userClassGrade=${userClassGrade}, teacher=${req.user?.name || req.user?.email || req.user?.id}`
        );
      }
      return res.status(403).json({ message: "Unauthorized: not the class teacher for this grade" });
    }

    // Build query with numeric filters
    const query = {};
    if (grade) query.grade = grade; // keep grade as string for consistency
    if (term && term !== "all") query.term = Number(term);
    if (year && year !== "all") query.year = Number(year);
    if (assessment && assessment !== "all") query.assessment = Number(assessment);

    if (process.env.DEBUG === "true") {
      console.log("📊 getMarksByGrade query:", query);
      console.log("👩‍🏫 Teacher:", req.user?.name, "| Grade:", userClassGrade);
    }

    const marks = await Mark.find(query).sort({ admissionNo: 1, subject: 1 });

    // Group by composite key (student + assessment + term + year)
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
          assessment: String(m.assessment), // ensure string for frontend
          subjects: []
        };
      }
      grouped[key].subjects.push({
        subject: m.subject,
        score: Number(m.score)
      });
    });

    res.json(Object.values(grouped));
  } catch (err) {
    console.error("❌ getMarksByGrade error:", err);
    res.status(500).json({ msg: "Server error fetching grade marks" });
  }
};