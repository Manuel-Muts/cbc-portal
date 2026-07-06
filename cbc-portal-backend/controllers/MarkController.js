// controllers/MarkController.js
import mongoose from "mongoose";
import Mark from "../models/mark.js";
import { User } from "../models/User.js";
import { Student } from "../models/RoleModels.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { School } from "../models/school.js";
import Setting from "../models/Setting.js";
import cache from "../utils/cacheManager.js";
import sendSMS, { countSMSSegments } from "../utils/sendSMS.js";
import SMSLog from "../models/SMSLog.js";

// 🆕 Senior School Subject Definitions (Duplicated from frontend for backend validation)
const SENIOR_COMPULSORY_SUBJECTS = [
  "English",
  "Kiswahili",
  "Mathematics",
  "PE",
  "ICT",
  "CSL"
];

const SENIOR_SCHOOL_PATHWAYS = {
  STEM: [
    "Biology", "Chemistry", "Physics", "Computer Studies","Home Science", 
    "Environmental Science", "Engineering Technology", "Applied Sciences",
    "Electricity", "Aviation", "Agriculture", "Marine and Fisheries",
    "Building and Construction", "Woodwork", "Metalwork", "Power Mechanics",
    "General Science", "Media Technology"
  ],
  "Social Sciences": [
    "History & Citizenship","History", "Geography", "Business Studies", "Political Studies",
    "Christian Religious Education", "Kenya Sign Language", "Literature",
    "Fasihi", "Indigenous Language", "Hindu Religious Education", "French",
    "German", "Islamic Religious Education",
  ],
  "Arts & Sports Science": [
    "Fine Art", "Film & Media Studies", "Fashion & Design", "Music and Dance",
    "Theatre and Film", "Sports and Recreation"
  ]
};

const normalizeSeniorSubjectName = (subject) => {
  const name = String(subject || "").trim();
  const normalized = name.toLowerCase();
  const aliases = {
    "bio": "Biology",
    "biology": "Biology",
    "b/s": "Biology",
    "geo": "Geography",
    "geography": "Geography",
    "hist": "History",
    "history": "History",
    "chem": "Chemistry",
    "physics": "Physics",
    "phy":"Physics",
    "chemistry": "Chemistry",
    "computer science": "Computer Science",
    "cs": "Computer Science",
    "computer studies": "Computer Science",
    "community service learning": "CSL",
    "csl": "CSL",
    "business": "Business Studies",
    "business studies": "Business Studies",
    "cre": "Christian Religious Education",
    "christian religious education": "Christian Religious Education",
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
    "information and communication technology": "ICT"
  };
  return aliases[normalized] || name;
};

// 🆕 Helper to normalize pathway values to canonical backend strings
const normalizePathway = (p) => {
  if (p === undefined || p === null) return null;
  const raw = String(p).trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const map = {
    stem: 'STEM',
    STEM: 'STEM',
    'social sciences': 'Social Sciences',
    'SOCIAL SCIENCES': 'Social Sciences',
    socialsciences: 'Social Sciences',
    ARTS: 'Arts & Sports Science',
    'ARTS': 'Arts & Sports Science',
    'arts & sports science': 'Arts & Sports Science',
    'arts and sports science': 'Arts & Sports Science',
    artsandsportsscience: 'Arts & Sports Science',
    artsandsportscience: 'Arts & Sports Science',
    artssportsscience: 'Arts & Sports Science',
  };
  return map[key] || raw;
};

const getSeniorPathway = (subjectName) => {
  const sub = normalizeSeniorSubjectName(subjectName);
  if (SENIOR_COMPULSORY_SUBJECTS.some(s => s.toLowerCase() === sub.toLowerCase())) return "Core";

  for (const [pathway, subjects] of Object.entries(SENIOR_SCHOOL_PATHWAYS)) {
    if (subjects.some(s => s.toLowerCase() === sub.toLowerCase())) {
      return pathway;
    }
  }
  return null;
};

const getElectiveSubjectsForPathway = (pathway) => {
  const pathwaySubjects = SENIOR_SCHOOL_PATHWAYS[pathway];
  if (!pathwaySubjects) return [];
  
  const compulsoryLower = SENIOR_COMPULSORY_SUBJECTS.map(s => s.toLowerCase());
  return pathwaySubjects
    .map(sub => normalizeSeniorSubjectName(sub))
    .filter(sub => !compulsoryLower.includes(sub.toLowerCase()));
};

const validateSeniorElectiveSelection = (studentPathway, allSubmittedCourses) => {
  const errors = [];
  if (!studentPathway) {
    errors.push("Student pathway is not defined.");
    return errors;
  }
  const compulsorySubjectsLower = SENIOR_COMPULSORY_SUBJECTS.map(s => s.toLowerCase());
  const pathwayElectivesLower = getElectiveSubjectsForPathway(studentPathway).map(s => s.toLowerCase());
  const submittedCourses = (allSubmittedCourses || []).map(course => normalizeSeniorSubjectName(course));
  const submittedElectives = new Set(submittedCourses.filter(course => pathwayElectivesLower.includes(course.toLowerCase())));
  const submittedOther = new Set(submittedCourses.filter(course => !compulsorySubjectsLower.includes(course.toLowerCase()) && !pathwayElectivesLower.includes(course.toLowerCase())));
  if (submittedElectives.size !== 3) {
    errors.push(`Learner must select exactly 3 elective subjects from their pathway. Currently selected: ${submittedElectives.size}`);
  }
  if (submittedOther.size > 0) {
    errors.push(`Some subjects are not part of the compulsory list or the '${studentPathway}' pathway: ${Array.from(submittedOther).join(', ')}`);
  }
  return errors;
};

const SENIOR_NON_GRADED_SUBJECTS = ["PE"];

const isExcludedSeniorSubject = (subject) => {
  const normalized = normalizeSeniorSubjectName(subject);
  return SENIOR_NON_GRADED_SUBJECTS.some(s => s.toLowerCase() === normalized.toLowerCase());
};

// ---------------------------
// 🆕 Helper to extract numeric grade
const getGradeLevel = (grade) => parseInt(String(grade).replace(/\D/g, ""), 10);

// 🆕 Helper to check if a grade is Primary (PP1 - Grade 6)
const isPrimaryGrade = (grade) => {
  if (!grade) return false;
  const normalized = String(grade).trim();
  if (normalized === "PG" || normalized === "PP1" || normalized === "PP2") return true;
  const match = normalized.match(/\d+/);
  if (match) {
    const num = parseInt(match[0]);
    return num >= 1 && num <= 6;
  }
  return false;
};

// 🆕 Helper to calculate points in the backend for SMS, now grade-aware
const getPoints = (score, grade, customConfig = null) => {
  if (score === null || score === undefined || score === "" || isNaN(score) || String(score).toUpperCase() === "X") return 0;
  const s = Number(score);
  const isPrimary = isPrimaryGrade(grade);

  // 1. Check for custom configuration first
  const levelConfig = isPrimary ? customConfig?.primary : customConfig?.secondary;
  if (levelConfig && Array.isArray(levelConfig)) {
    const range = levelConfig.find(r => s >= r.min && s <= r.max);
    if (range) return range.points;
  }

  // 2. Default Logic
  if (isPrimary) {
    // New primary point system
    if (s >= 75) return 4; // EE
    if (s >= 41) return 3; // ME 
    if (s >= 21) return 2; // AE
    if (s >= 0) return 1;  // BE
  } else {
    // Default secondary point system (8-point)
    if (s >= 90) return 8; if (s >= 75) return 7; if (s >= 58) return 6; if (s >= 41) return 5;
    if (s >= 31) return 4; if (s >= 21) return 3; if (s >= 11) return 2; if (s >= 0) return 1;
  }
  return 0;
};

// 🆕 Helper to safely parse input to Number or NULL (for "X" / Absence)
const safeParse = (val) => {
  if (val === null || val === undefined || String(val).trim() === "" || String(val).trim().toUpperCase() === "X") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
};

// ---------------------------
// HELPER: Performance Level Subdivision (now grade-aware)
// ---------------------------
const getPerformanceSubdivision = (score, grade, customConfig = null) => {
  if (score === null || score === undefined || score === "" || isNaN(score) || String(score).toUpperCase() === "X") return "ABS";
  const s = Number(score);
  const isPrimary = isPrimaryGrade(grade);

  // 1. Check for custom configuration
  const levelConfig = isPrimary ? customConfig?.primary : customConfig?.secondary;
  if (levelConfig && Array.isArray(levelConfig)) {
    const range = levelConfig.find(r => s >= r.min && s <= r.max);
    if (range) return range.label;
  }

  // 2. Default Logic
  if (isPrimary) {
    // Simplified subdivision for Primary grades (PP1 - Grade 6)
    if (s >= 75) return "EE";
    if (s >= 41) return "ME";
    if (s >= 21) return "AE";
    return "BE";
  } else {
    // Existing sublevels for Junior (7-9) and Senior (10-12)
    if (s >= 90) return "EE1"; if (s >= 75) return "EE2"; if (s >= 58) return "ME1"; if (s >= 41) return "ME2";
    if (s >= 31) return "AE1"; if (s >= 21) return "AE2"; if (s >= 11) return "BE1"; return "BE2";
  }
};

// 🆕 Helper for SMS Subject Abbreviation to save characters
const getSubjectAbbr = (subject) => {
  const abbreviations = {
    "Mathematics": "MATH",
    "English": "ENG",
    "Kiswahili": "KISW",
    "Integrated Science": "I/SCI",
    "Science and Technology": "SCI/T",
    "Social Studies": "S/S",
    "Christian Religious Studies (CRE)": "CRE",
    "Christian Religious Education": "CRE",
    "Agriculture": "AGR",
    "Business Studies": "B/S",
    "Pre-Technical Studies": "P/TECH",
    "Health Education": "HLTH",
    "Physical Health Education": "PHE",
    "Environmental Activities": "ENV",
    "Creative Arts": "C/A",
    "Creative Arts and Sports": "C/A",
    "Sports C/A(s)": "SPRT",
    "Visual Arts C/A(v)": "VISL",
    "Performing Arts C/A(p)": "PERF",
    "Home Science": "H/S",
    "Computer Studies": "COMP",
    "History & Citizenship": "H&C",
    "Geography": "GEO",
    "Physics": "PHY",
    "Chemistry": "CHEM",
    "Biology": "BIO",
  };

  const normalized = (subject || "").trim();
  return abbreviations[normalized] || (normalized.length > 5 ? normalized.substring(0, 4).toUpperCase() : normalized.toUpperCase());
};

// ---------------------------
// HELPER: Process Single Mark (for add, update, and bulk operations)
// ---------------------------
const processSingleMark = async (markData, reqUser, isNew = true, cachedContext = null) => {
  // Determine school level early to avoid ReferenceErrors
  const gradeNum = getGradeLevel(markData.grade);
  const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;
  
  // 🚀 Optimization: Use gradingConfig from cachedContext if available to prevent N+1 queries
  let customConfig = cachedContext?.gradingConfig;
  if (!customConfig && !cachedContext) {
    const school = await School.findById(reqUser.schoolId).select("gradingConfig").lean();
    customConfig = school?.gradingConfig;
  }

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

  const effectivePathway = isSeniorSchool ? normalizePathway(pathway || getSeniorPathway(course)) : null;

  if (isSeniorSchool && course && isExcludedSeniorSubject(course)) {
    throw new Error(`${normalizeSeniorSubjectName(course)} is not a graded senior subject and should not be submitted.`);
  }

  // 🆕 Term Lock Check (Optimized: bypass if already checked in bulk)
  if (!cachedContext?.lockChecked) {
    const lockKey = `term_lock_${reqUser.schoolId}_${year}_${term}`;
    const isLocked = await Setting.findOne({ key: lockKey }).lean();
    if (isLocked?.value === true && reqUser.role !== 'super_admin') {
      throw new Error(`Action denied: Year ${year} Term ${term} is officially locked.`);
    }
  }

  if (!isNew) {
    const allowTeacherSubmittedMarkEdits = cachedContext?.allowTeacherSubmittedMarkEdits;
    if (allowTeacherSubmittedMarkEdits === false && reqUser.role !== 'super_admin') {
      throw new Error(`Action denied: Teacher edits for submitted marks are disabled by admin for Year ${year} Term ${term}.`);
    }
  }

  // Find student if new or if admissionNo is provided for update
  let student;
  let enrollment;
  if (isNew || admissionNo) { // For updates, admissionNo might not be in req.body, but it's in the mark object
    
    // Optimized: Use pre-fetched map if available
    if (cachedContext?.studentMap && admissionNo) {
      student = cachedContext.studentMap.get(admissionNo);
    } else {
      student = await Student.findOne({
        admission: admissionNo,
        schoolId: reqUser.schoolId
      }).select("name admission _id");
    }

    if (!student) {
      throw new Error(`Student with admission ${admissionNo} not found in your school`);
    }

    // 🆕 Strict Active Enrollment Check
  // Optimized: Use pre-fetched map to eliminate N+1 queries during bulk operations
    if (cachedContext?.enrollmentMap) {
      enrollment = cachedContext.enrollmentMap.get(String(student._id));
    } else {
      enrollment = await StudentEnrollment.findOne({
        studentId: student._id,
        schoolId: reqUser.schoolId,
        academicYear: Number(year),
        status: "active"
      });
    }

    if (!enrollment) {
      throw new Error(`Recording failed: Student ${student.name} (${student.admission}) is not actively enrolled for ${year}. Check promotion status.`);
    }
  }

  // 🆕 NEW: Check for existing mark if this is a new submission
  if (isNew) {
    if (cachedContext?.existingMarksMap) {
      // Efficient O(1) lookup in pre-fetched set
      const checkKey = isSeniorSchool 
        ? `${student.admission}_${pathway}_${course}`
        : `${student.admission}_${subject}`;
        
      if (cachedContext.existingMarksMap.has(checkKey)) {
        throw new Error("Duplicate, marks already exist.");
      }
    } else {
      // Fallback for single record additions
      const existingMarkQuery = {
        admissionNo: student.admission,
        schoolId: reqUser.schoolId,
        teacherId: reqUser.id,
        term: Number(term),
        year: Number(year),
        assessment: Number(assessment),
      };

      if (isSeniorSchool) {
        existingMarkQuery.pathway = normalizePathway(pathway);
        existingMarkQuery.course = course;
      } else {
        existingMarkQuery.subject = subject;
      }

      const existingMark = await Mark.findOne(existingMarkQuery);
      if (existingMark) {
        throw new Error("Duplicate, marks already exist.");
      }
    }
  }

  // Validation
  if (isSeniorSchool) {
    if (!effectivePathway || !course) {
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
    studentId: student ? student._id : (markData.studentId || null), // 🆕 Link directly to User ID for robust relations
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

  if (isSeniorSchool) {
    markFields.subject = null; markFields.pathway = effectivePathway; markFields.course = course;
    markFields.score = safeParse(score);
    markFields.finalScore = markFields.score;
    markFields.continuousAssessment = null;
    markFields.projectWork = null;
    markFields.endTermExam = null;

    if (markFields.score !== null) {
      markFields.performanceLevel = getPerformanceSubdivision(markFields.score, grade, customConfig);
    } else {
      markFields.performanceLevel = null;
    }
  } else {
    markFields.subject = subject; markFields.pathway = null; markFields.course = null;
    markFields.score = safeParse(score); 
    markFields.finalScore = null; markFields.performanceLevel = null;
    // 🆕 Calculate performance level for junior school
    markFields.performanceLevel = getPerformanceSubdivision(markFields.score, grade, customConfig);
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
    
    cache.clearByPattern(String(req.user.schoolId));

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

    if (req.user.role !== 'super_admin') {
      const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${mark.year}_${mark.term}`;
      const editSetting = await Setting.findOne({ key: editPermissionKey }).lean();
      if (!editSetting || editSetting.value !== true) {
        return res.status(403).json({ message: "Teacher edits for submitted marks are disabled by admin for this term." });
      }
    }
    const processedFields = await processSingleMark({ ...req.body, _id: id, admissionNo: mark.admissionNo }, req.user, false); // Pass _id and admissionNo for context, isNew=false
    const updatedMark = await Mark.findByIdAndUpdate(
      id,
      { $set: processedFields },
      { new: true, runValidators: true }
    );
    
    cache.clearByPattern(String(req.user.schoolId));

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

    // Ensure senior mark payloads always include inferred pathway values for duplicate checks
    marksArray.forEach(mark => {
      const gradeNum = getGradeLevel(mark.grade);
      if (gradeNum >= 10 && gradeNum <= 12 && !mark.pathway && mark.course) {
        mark.pathway = normalizePathway(getSeniorPathway(mark.course));
      } else if (gradeNum >= 10 && gradeNum <= 12 && mark.pathway) {
        mark.pathway = normalizePathway(mark.pathway);
      }
    });

    const schoolId = req.user.schoolId;
    const sample = marksArray[0];

    // 1. Pre-fetch Term Lock and School Config once for the whole batch
    const lockKey = `term_lock_${schoolId}_${sample.year}_${sample.term}`;
    const editPermissionKey = `submitted_marks_edits_allowed_${schoolId}_${sample.year}_${sample.term}`;
    const [isLocked, editSetting] = await Promise.all([
      Setting.findOne({ key: lockKey }).lean(),
      Setting.findOne({ key: editPermissionKey }).lean()
    ]);
    if (isLocked?.value === true && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: `Year ${sample.year} Term ${sample.term} is locked.` });
    }
    const allowTeacherSubmittedMarkEdits = editSetting ? editSetting.value !== false : true;

    // 2. Pre-fetch students and enrollments to avoid N+1 queries
    const admissions = [...new Set(marksArray.map(m => m.admissionNo).filter(Boolean))];
    const students = await Student.find({ 
      admission: { $in: admissions }, 
      schoolId 
    }).select("name admission _id").lean();
    
    const studentMap = new Map(students.map(s => [s.admission, s]));
    
    const enrollments = await StudentEnrollment.find({
      studentId: { $in: students.map(s => s._id) },
      schoolId,
      academicYear: Number(sample.year),
      status: "active"
    }).lean();
    
    const enrollmentMap = new Map(enrollments.map(e => [String(e.studentId), e]));

    // 3. Pre-fetch existing marks for duplicate check to eliminate N+1 queries
    const existingMarksQuery = {
      schoolId,
      year: Number(sample.year),
      term: Number(sample.term),
      assessment: Number(sample.assessment),
      admissionNo: { $in: admissions }
    };

    // 🚀 Optimization: Include subject/course to leverage the full unique index prefix
    const sampleGradeNum = getGradeLevel(sample.grade);
    if (sampleGradeNum >= 10 && sampleGradeNum <= 12) {
      existingMarksQuery.pathway = normalizePathway(sample.pathway);
      existingMarksQuery.course = sample.course;
    } else {
      existingMarksQuery.subject = sample.subject;
    }

    const existingMarks = await Mark.find(existingMarksQuery).select("admissionNo subject course pathway grade").lean();

    const existingMarksMap = new Set(existingMarks.map(m => {
      const gNum = getGradeLevel(m.grade);
      if (gNum >= 10 && gNum <= 12) {
        const p = normalizePathway(m.pathway) || '';
        return `${m.admissionNo}_${p}_${m.course}`;
      }
      return `${m.admissionNo}_${m.subject}`;
    }));

    // 🚀 NEW: Fetch school grading config once for bulk processing
    const school = await School.findById(schoolId).select("gradingConfig").lean();

    const cachedContext = { studentMap, enrollmentMap, lockChecked: true, existingMarksMap, gradingConfig: school?.gradingConfig, allowTeacherSubmittedMarkEdits };
    const ops = [];
    const errors = [];

    // 🆕 Group elective courses for senior students, but only validate complete elective sets
    const seniorElectiveGroups = new Map(); // Key: `${studentId}_${assessment}`

    for (const markData of marksArray) {
        const gradeNum = getGradeLevel(markData.grade);
        const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

        if (!isSeniorSchool || !markData.course) continue;

        const normalizedCourse = normalizeSeniorSubjectName(markData.course);
        const coursePathway = getSeniorPathway(normalizedCourse);
        if (!coursePathway || coursePathway === "Core") continue; // Only validate elective course groups

        const studentId = markData.studentId || (cachedContext.studentMap.get(markData.admissionNo)?._id);
        if (!studentId) {
            errors.push({ mark: markData, message: `Student ID not found for admission ${markData.admissionNo}` });
            continue;
        }
        const key = `${studentId}_${markData.assessment}`;
        if (!seniorElectiveGroups.has(key)) {
          seniorElectiveGroups.set(key, {
            pathway: normalizePathway(markData.pathway),
            courses: new Set(),
            sampleMark: markData
          });
        }
        const group = seniorElectiveGroups.get(key);
        group.courses.add(normalizedCourse);
    }

    // Perform validation only for groups with a full elective set
    for (const group of seniorElectiveGroups.values()) {
        if (group.courses.size < 3) continue;
        const electiveValidationErrors = validateSeniorElectiveSelection(group.pathway, Array.from(group.courses));
        if (electiveValidationErrors.length > 0) {
            electiveValidationErrors.forEach(err => {
                errors.push({ mark: group.sampleMark, message: `Learner ${group.sampleMark.studentName} (${group.sampleMark.admissionNo}): ${err}` });
            });
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            message: "Validation failed for some marks.",
            successCount: 0,
            failureCount: errors.length,
            errors: errors
        });
    }

    for (const markData of marksArray) {
      try {
        const isUpdate = !!markData._id;
        const processedFields = await processSingleMark(markData, req.user, !isUpdate, cachedContext);

        if (isUpdate) {
          ops.push({
            updateOne: {
              filter: { _id: markData._id },
              update: { $set: processedFields }
            }
          });
        } else {
          ops.push({
            insertOne: {
              document: processedFields
            }
          });
        }
      } catch (error) {
        errors.push({ mark: markData, message: error.message });
      }
    }

    // Step 2: Execute all operations in a single database round-trip
    let successCount = 0;
    if (ops.length > 0) {
      const bulkResult = await Mark.bulkWrite(ops, { ordered: false });
      // Count inserts, updates (modified), and matches (no change needed) as successes
      successCount = (bulkResult.insertedCount || 0) + (bulkResult.matchedCount || 0) + (bulkResult.upsertedCount || 0);
    }
    
    cache.clearByPattern(String(schoolId));

    return res.status(200).json({
      message: "Bulk mark operation completed",
      successCount,
      failureCount: marksArray.length - successCount,
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
    
    // 🆕 Check Lock and admin edit permission before deletion
    const lockKey = `term_lock_${req.user.schoolId}_${mark.year}_${mark.term}`;
    const editPermissionKey = `submitted_marks_edits_allowed_${req.user.schoolId}_${mark.year}_${mark.term}`;
    const [lockSetting, editSetting] = await Promise.all([
      Setting.findOne({ key: lockKey }).lean(),
      Setting.findOne({ key: editPermissionKey }).lean()
    ]);

    if (lockSetting?.value === true && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: "Cannot delete marks: This academic term is officially locked." });
    }
    if ((!editSetting || editSetting.value !== true) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: "Cannot delete marks: Teacher edits for submitted marks are disabled by admin for this term." });
    }

    await mark.deleteOne();
    cache.clearByPattern(String(req.user.schoolId));

    return res.json({ message: "Mark deleted" });
  } catch (err) {
    console.error("deleteMark error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// BULK DELETE MARKS
// ---------------------------
export const bulkDeleteMarks = async (req, res) => {
  try {
    const { markIds } = req.body; // Expect an array of Mark _id's

    if (!Array.isArray(markIds) || markIds.length === 0) {
      return res.status(400).json({ message: "An array of mark IDs is required for bulk deletion." });
    }

    // 1. Fetch the actual mark documents to validate ownership and check term locks
    const marksToDelete = await Mark.find({
      _id: { $in: markIds },
      schoolId: req.user.schoolId // Ensure marks belong to the user's school
    });

    if (marksToDelete.length !== markIds.length) {
      // This means some IDs provided either don't exist or don't belong to this school
      return res.status(404).json({ message: "One or more marks not found or unauthorized for your school." });
    }

    // 2. Validate ownership (all marks must belong to the requesting teacher)
    const unauthorizedMarks = marksToDelete.filter(mark => String(mark.teacherId) !== String(req.user.id));
    if (unauthorizedMarks.length > 0) {
      return res.status(403).json({ message: "You can only delete your own marks." });
    }

    // 3. Perform Term Lock Check
    // Collect all unique (year, term) combinations for the marks to be deleted.
    // Use req.user.schoolId and req.user.role.
    const termKeys = [...new Set(marksToDelete.map(m => `term_lock_${req.user.schoolId}_${m.year}_${m.term}`))];
    if (req.user.role !== 'super_admin') {
      // Optimized: Fetch all relevant lock settings in one go
      const [lockedSettings, editSettings] = await Promise.all([
        Setting.find({ key: { $in: termKeys }, value: true }).lean(),
        Setting.find({ key: { $in: termKeys.map(k => k.replace('term_lock_', 'submitted_marks_edits_allowed_')) } }).lean()
      ]);

      // For submitted mark edits, require explicit true for each term; missing setting means disabled.
      const missingOrDisabledEditKey = termKeys.map(k => k.replace('term_lock_', 'submitted_marks_edits_allowed_')).find(editKey => {
        const found = editSettings.find(e => e.key === editKey);
        return !found || found.value !== true;
      });
      if (missingOrDisabledEditKey) {
        const parts = missingOrDisabledEditKey.split('_');
        const disabledYear = parts[4];
        const disabledTerm = parts[5];
        return res.status(403).json({
          message: `Cannot delete marks: Teacher edits for submitted marks are disabled by admin for Year ${disabledYear} Term ${disabledTerm}.`
        });
      }

      if (lockedSettings.length > 0) {
        const firstLocked = lockedSettings[0].key.split('_');
        const lockedYear = firstLocked[3];
        const lockedTerm = firstLocked[4];
        return res.status(403).json({ 
          message: `Cannot delete marks: One or more academic terms (e.g., Year ${lockedYear} Term ${lockedTerm}) are officially locked.` 
        });
      }
    }

    // 4. Execute bulk deletion
    const deleteResult = await Mark.deleteMany({
      _id: { $in: markIds },
      teacherId: req.user.id, // Double-check ownership during deletion
      schoolId: req.user.schoolId
    });
    
    cache.clearByPattern(String(req.user.schoolId));

    return res.status(200).json({ message: `Successfully deleted ${deleteResult.deletedCount} marks.` });
  } catch (err) {
    console.error("bulkDeleteMarks error:", err);
    return res.status(500).json({ message: "Server error during bulk deletion." });
  }
};

// ---------------------------
// STUDENT GET OWN MARKS
// ---------------------------
export const getStudentMarks = async (req, res) => {
  try {
    const studentId = req.user.id; // Using ID from JWT
    const admissionNo = req.user.admission;
    const schoolId = req.user.schoolId;
    let { term, year, assessment } = req.query;

    if (!studentId || !schoolId) {
      return res.status(400).json({ message: "Student info missing" });
    }

    // 🆕 Build query dynamically based on filters to prevent heavy fetch
    // Prioritize studentId, but fallback to admissionNo for historical records
    const filter = { 
      $or: [
        { studentId: studentId },
        { admissionNo: admissionNo }
      ],
      schoolId 
    };

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

    // 🚀 Performance Optimization: Removed redundant class comparison fetch.
    // Dashboard analytics are calculated locally from student marks; fetching class sets is unnecessary.
    return res.json({ studentMarks, allClassMarks: [] });
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
    const gradeNum = parseInt(numericPart || "", 10);
    const isSeniorGrade = !isNaN(gradeNum) && gradeNum >= 10 && gradeNum <= 12;
    const normalizedGrades = [gradeStr];

    // If it's an early childhood grade (PG, PP1, PP2), we only query for that exact string.
    // Otherwise, we also include numeric and "Grade X" variants for robustness.
    if (!gradeStr.toUpperCase().startsWith("PP") && gradeStr.toUpperCase() !== "PG") {
      if (numericPart) {
        normalizedGrades.push(numericPart);
        normalizedGrades.push(`Grade ${numericPart}`);
      }
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
    
    // Exclude senior non-graded subjects like PE from grade-level analysis when no explicit subject filter is provided
    if (isSeniorGrade && (!subject || subject === "all")) {
      markQuery.$and = markQuery.$and || [];
      markQuery.$and.push({
        $nor: [
          { course: "PE" },
          { subject: "PE" }
        ]
      });
    }

    // Search logic (optional)
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      markQuery.$or = [
        { studentName: regex },
        { admissionNo: regex }
      ];
    }

    // ---------------------------
    // STREAM FILTER (DIRECT & OPTIMIZED)
    // ---------------------------
    if (filterByStream) {
      markQuery.stream = req.query.stream.trim();
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
          studentId: { $first: "$studentId" },
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
          studentId: 1,
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
          studentId: { $first: "$studentId" },
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
          studentId: 1,
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

// ---------------------------
// GET MARKS BY GRADE AND STUDENTS (for frontend pre-filling)
// ---------------------------
export const getMarksByGradeAndStudents = async (req, res) => {
  try {
    const { grade, term, year, assessment, subject, course, admissionNos } = req.query;
    const schoolId = req.user.schoolId;

    if (!grade || !term || !year || !assessment || (!subject && !course) || !admissionNos) {
      return res.status(400).json({ message: "Missing required query parameters for fetching existing marks." });
    }

    const admissionsArray = admissionNos.split(',');

    const query = {
      schoolId: new mongoose.Types.ObjectId(schoolId),
      term: Number(term),
      year: Number(year),
      assessment: Number(assessment),
      admissionNo: { $in: admissionsArray }
    };

    const gradeNum = parseInt(String(grade).replace(/\D/g, ""), 10);
    const isSeniorSchool = gradeNum >= 10 && gradeNum <= 12;

    if (isSeniorSchool) {
      query.course = course;
    } else {
      query.subject = subject;
    }

    const marks = await Mark.find(query).lean();

    return res.json(marks);
  } catch (err) {
    console.error("getMarksByGradeAndStudents error:", err);
    return res.status(500).json({ message: "Server error fetching existing marks" });
  }
};

// ---------------------------
// BROADCAST RESULTS VIA SMS
// ---------------------------
export const broadcastResultsSMS = async (req, res) => {
  try {
    const { grade, term, year, assessment } = req.body;
    const schoolId = req.user.schoolId;

    if (!grade || !term || !year || !assessment) {
      return res.status(400).json({ message: "Selection parameters missing" });
    }

    // 🆕 Safeguard: Prevent duplicate broadcast within 2 minutes
    const lockKey = cache.generateKey(`sms_broadcast_lock:${schoolId}`, {
      grade,
      term,
      year,
      assessment
    });

    if (cache.get(lockKey)) {
      return res.status(429).json({ 
        message: "A broadcast for these results was recently initiated. Please wait 2 minutes before trying again." 
      });
    }

    // 1. Fetch relevant marks and School config
    const school = await School.findById(schoolId).select("smsCredits gradingConfig").lean();
    const marks = await Mark.find({
      schoolId,
      grade,
      term: Number(term),
      year: Number(year),
      assessment: Number(assessment)
    }).lean();

    if (!marks.length) return res.status(404).json({ message: "No marks found to broadcast" });

    // 2. Fetch students for contacts
    const studentIds = [...new Set(marks.map(m => m.studentId).filter(Boolean))];
    const adms = [...new Set(marks.map(m => m.admissionNo).filter(Boolean))];

    const students = await Student.find({ 
      $or: [
        { _id: { $in: studentIds } },
        { admission: { $in: adms } }
      ],
      schoolId 
    })
      .select("admission contact name")
      .lean();

    const studentMap = new Map();
    students.forEach(s => {
      studentMap.set(String(s._id), s);
      studentMap.set(s.admission, s);
    });

    // 3. Aggregate marks per student
    const records = marks.reduce((acc, m) => {
      const groupKey = m.studentId ? String(m.studentId) : m.admissionNo;
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(m);
      return acc;
    }, {});

    // 4. Send messages
    const isSenior = getGradeLevel(grade) >= 10;
    const mapping = { 1: "Opener", 5: "Midterm", 8: "Endterm" }; 
    const assessLabel = mapping[assessment] || `A${assessment}`;

    const messagesToSend = [];
    let totalRequiredCredits = 0;
    let tooLongCount = 0;

    for (const [key, sMarks] of Object.entries(records)) {
      const student = studentMap.get(key);
      if (!student || !student.contact) continue;

      // 🆕 EXCLUSION LOGIC: Skip students with any missing marks or "X" (absences)
      // This ensures parents only receive the SMS if the performance profile is complete.
      const hasIncompleteMarks = sMarks.some(m => {
        const score = isSenior ? m.finalScore : m.score;
        return score === null || score === undefined || String(score).toUpperCase() === "X";
      });

      if (hasIncompleteMarks) {
        console.log(`[SMS Broadcast] Skipping ${student.name} (${adm}) due to incomplete mark profile.`);
        continue;
      }

      const firstName = student.name.split(' ')[0];
      
      // Compact Header: "John Opener T1/2026:" (Note: removing the trailing space here)
      let content = `${firstName} ${assessLabel} T${term}/${year}:`;

      const subScores = [];
      let studentTotal = 0;
      let studentCount = 0;
      let totalPoints = 0; // 🆕 Track total points for the entire assessment

      sMarks.forEach(m => {
        const fullSub = isSenior ? (m.course || "Sub") : (m.subject || "Sub");
        const score = isSenior ? m.finalScore : m.score;
        const abbr = getSubjectAbbr(fullSub);
        
        // Use X for absent, or round the score to save space
        const displayScore = (score === null || score === undefined || score === "X") ? "X" : Math.round(score);
        subScores.push(`${abbr} ${displayScore}`);

        studentTotal += Number(displayScore);
        studentCount++;
        totalPoints += getPoints(displayScore, grade, school?.gradingConfig); 
      });

      content += ' ' + subScores.join(', ');

      // Add Total Points and Overall Performance Level using subdivision codes
      if (studentCount > 0) {
        const mean = studentTotal / studentCount;
        const level = getPerformanceSubdivision(mean, grade, school?.gradingConfig);
        content += ` | PTS:${totalPoints} LVL:${level}`;
      }

      const segments = countSMSSegments(content.trim());
      if (segments > 1) tooLongCount++;
      
      totalRequiredCredits += segments;
      messagesToSend.push({ 
        contact: student.contact, 
        content: content.trim(),
        studentName: student.name 
      });
    }

    // 🆕 Safeguard: Prevent long SMS that cost beyond 1 credit
    if (tooLongCount > 0) {
      return res.status(400).json({ 
        message: `Broadcast blocked: Results for ${tooLongCount} learners exceed the 160-character limit (1 credit). To prevent multi-segment costs, please contact support to enable long messages or simplify the results format.` 
      });
    }

    if (!school || (school.smsCredits || 0) < totalRequiredCredits) {
      return res.status(402).json({ 
        message: `Insufficient credit: Balance ${school?.smsCredits || 0}. Please top up your balance.`
      });
    }

    // Set a 2-minute lock now that credits are verified
    cache.set(lockKey, true, 120);

    let isCancelled = false;
    req.on('close', () => {
      isCancelled = true;
      console.log(`[SMS Broadcast] Connection closed. Cancelling remaining messages for school ${schoolId}`);
    });

    // 🆕 Batch sending to prevent network congestion and timeout errors
    const BATCH_SIZE = 50;
    for (let i = 0; i < messagesToSend.length; i += BATCH_SIZE) {
      if (isCancelled) break;

      const batch = messagesToSend.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (m) => {
        const response = await sendSMS(m.contact, m.content);
        
        // 🆕 Only count as success if status is 'Success' or 'Sent'
        const isActualSuccess = response?.SMSMessageData?.Recipients?.some(recp => ['Success', 'Sent'].includes(recp.status));

        return {
          schoolId,
          senderId: req.user.id,
          recipient: m.contact,
          studentName: m.studentName,
          content: m.content,
          status: isActualSuccess ? "Sent" : "Failed",
          providerResponse: response
        };
      }));

      await SMSLog.insertMany(batchResults);

      // 🆕 Add a short delay between batches to reduce network spikes
      if (i + BATCH_SIZE < messagesToSend.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 🆕 Deduct Credits after successful broadcast initiation
    if (totalRequiredCredits > 0) {
      await School.findByIdAndUpdate(schoolId, { $inc: { smsCredits: -totalRequiredCredits } });
      
      // 🆕 Invalidate school profile cache to reflect new balance immediately
      cache.clearByPattern(String(schoolId));
    }

    return res.json({ message: `Successfully initiated results SMS for ${messagesToSend.length} learners with complete records.` });

  } catch (err) {
    console.error("broadcastResultsSMS error:", err);
    return res.status(500).json({ message: "SMS Broadcast failed" });
  }
};

/**
 * 🆕 Fetches a summary of SMS activity (Success counts + Detailed Failures)
 */
export const getSMSLogsSummary = async (req, res) => {
  try {
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    
    // 1. Get counts for the last 30 days
    const successCount = await SMSLog.countDocuments({ schoolId, status: "Sent" });
    const failureCount = await SMSLog.countDocuments({ schoolId, status: "Failed" });

    // 2. Fetch the most recent failures for action
    const recentFailures = await SMSLog.find({ schoolId, status: "Failed" })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("recipient studentName content createdAt providerResponse")
      .lean();

    return res.json({
      summary: { sent: successCount, failed: failureCount },
      recentFailures
    });
  } catch (err) {
    console.error("getSMSLogsSummary error:", err);
    return res.status(500).json({ message: "Failed to fetch SMS history summary" });
  }
};

/**
 * 🆕 GET SCHOOL-WIDE RANKINGS
 * Aggregates mean scores across all grades for a specific term/year/assessment.
 * This provides a single view of the top performers in the entire school.
 */
export const getSchoolWideRankings = async (req, res) => {
  try {
    const { year, term, assessment, page = 1, limit = 50 } = req.query;
    const schoolId = req.user.schoolId;

    if (!year || !term || !assessment) {
      return res.status(400).json({ message: "Year, Term, and Assessment are required." });
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    // 🚀 NEW: Server-side caching for rankings
    const cacheKey = cache.generateKey(`rankings:${schoolId}`, {
      year,
      term,
      assessment,
      page: pageNum,
      limit: limitNum
    });

    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const pipeline = [
      {
        $match: {
          schoolId: new mongoose.Types.ObjectId(schoolId),
          year: Number(year),
          term: Number(term),
          assessment: Number(assessment)
        }
      },
      {
        $group: {
          _id: "$admissionNo",
          studentName: { $first: "$studentName" },
          grade: { $first: "$grade" },
          stream: { $first: "$stream" },
          studentId: { $first: "$studentId" },
          // Extract either the Senior finalScore or Junior score
          scores: { $push: { $ifNull: ["$finalScore", "$score"] } }
        }
      },
      {
        $addFields: {
          meanScore: { $avg: "$scores" },
          totalSubjects: { $size: "$scores" }
        }
      },
      // 🏆 Calculate Competition Rank (1, 2, 2, 4) globally across all grades
      {
        $setWindowFields: {
          sortBy: { meanScore: -1 },
          output: { rank: { $rank: {} } }
        }
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $sort: { rank: 1, studentName: 1 } }, { $skip: skip }, { $limit: limitNum }]
        }
      }
    ];

    const [result] = await Mark.aggregate(pipeline).allowDiskUse(true);
    const total = result.metadata[0]?.total || 0;
    const rankings = result.data || [];

    const response = { rankings, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
    
    // Cache the result for 10 minutes (600 seconds)
    cache.set(cacheKey, response, 600);

    res.json(response);
  } catch (err) {
    console.error("[getSchoolWideRankings] Error:", err);
    res.status(500).json({ message: "Failed to generate school-wide ranking report." });
  }
};

export const getSubmittedSubjectStats = async (req, res) => {
  try {
    const { grade, term, year, assessment, stream, scope } = req.query;
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return res.status(401).json({ message: "School context missing" });
    }
    
    // Generate a unique cache key based on all query parameters and schoolId
    const cacheKey = cache.generateKey(`submitted_subjects_stats:${schoolId}`, {
      grade, term, year, assessment, stream, scope
    });

    // Check cache first
    const cachedStats = cache.get(cacheKey);
    if (cachedStats) return res.json(cachedStats);

    // 🆕 Normalize Grade for robust matching (identical logic to other Mark endpoints)
    let normalizedGrades = [];
    if (scope !== 'school' && grade) { // Only normalize if a specific grade is requested
      const gradeStr = String(grade).trim();
      const numericPart = gradeStr.match(/\d+/)?.[0];
      normalizedGrades = [gradeStr.toUpperCase()]; // Ensure consistency for direct matches
      if (!gradeStr.toUpperCase().startsWith("PP") && gradeStr.toUpperCase() !== "PG") {
        if (numericPart) {
          normalizedGrades.push(numericPart);
          normalizedGrades.push(`Grade ${numericPart}`);
        }
      }
    }


    // 1. Build the match filter
    const match = {
      schoolId: new mongoose.Types.ObjectId(schoolId),
      term: Number(term), // Use Number() here for explicit conversion
      year: Number(year)
    };

    // Add optional filters
    if (stream && stream !== 'all') match.stream = stream;
    if (assessment && assessment !== 'all') match.assessment = Number(assessment);
    
    // If not 'school' scope, add the grade filter
    if (scope !== 'school' && normalizedGrades.length > 0) {
      match.grade = { $in: [...new Set(normalizedGrades)] };
    }
    
    const stats = await Mark.aggregate([
      // Step 1: Filter to the specific class context
      { $match: match },
      
      // Step 2: Filter out documents without valid scores (ignore nulls/absent)
      { 
        $match: {
          $or: [
            { "score": { $ne: null } },
            { "finalScore": { $ne: null } },
            { "endTermExam": { $ne: null } }
          ]
        }
      },
      
      // Step 3: Group by subject name (supporting both Junior and Senior fields)
     {
  $group: {
    _id: {
      grade: "$grade",
      stream: "$stream",
      subject: { $ifNull: ["$course", "$subject"] }
    }
  }
},
{
  $project: {
    _id: 0,
    grade: "$_id.grade",
    stream: "$_id.stream",
    subject: "$_id.subject"
  }
},
{ $sort: { grade: 1, stream: 1, subject: 1 } }
    ]);

    const filteredStats = stats.filter(item => !isExcludedSeniorSubject(item.subject));

    // Cache the filtered result for 5 minutes (300 seconds)
    cache.set(cacheKey, filteredStats, 300);

    res.json(filteredStats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
