// controllers/userController.js
import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { School } from '../models/school.js';
import sendEmail from '../utils/sendEmail.js';
import Setting from '../models/Setting.js';
import LoginAttempt from '../models/LoginAttempt.js';
import {
  findUserByEmail,
  generateRawPassword,
  sendCredentialsEmail
} from '../utils/authHelpers.js';
import cache from "../utils/cacheManager.js";
import { Student, Teacher } from '../models/RoleModels.js';
import StudentEnrollment  from '../models/StudentEnrollment.js'; // ✅ ADD THIS
import Mark from '../models/mark.js'; // 🆕 Import Mark model
import Payment from '../models/Payment.js'; // 🆕 Import Payment model
import {Material} from '../models/Material.js'; // 🆕 Import Material model
import { normalizePathway } from '../utils/pathwayUtils.js';

// 🆕 Helper to auto-format phone numbers (extracted from registerUser)
const formatContact = (contact) => {
  if (!contact) return null;
  let formattedContact = String(contact).trim().replace(/\s+/g, '');
  if (formattedContact.startsWith('0')) formattedContact = '+254' + formattedContact.substring(1);
  else if (/^[71]/.test(formattedContact) && formattedContact.length === 9) formattedContact = '+254' + formattedContact;
  else if (formattedContact.startsWith('254') && formattedContact.length === 12) formattedContact = '+' + formattedContact;
  return formattedContact;
};

const normalizeGenderValue = (value) => {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  if (["male", "m", "boy", "man"].includes(normalized)) return "Male";
  if (["female", "f", "girl", "woman"].includes(normalized)) return "Female";
  if (["other", "others", "nonbinary", "non-binary", "prefer not to say", "prefer not to say", "prefer not say", "not say"].includes(normalized)) return "Prefer not to say";
  return String(value).trim();
};

const normalizeOptionalDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = value.getMonth();
    const day = value.getDate();
    return new Date(Date.UTC(year, month, day));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, " ");
  const isoMatch = compact.match(/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/);
  if (isoMatch) {
    const [year, month, day] = compact.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const slashMatch = compact.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(compact);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }

  return null;
};

// 🆕 Helper to normalize grade strings consistently across the module
const normalizeGrade = (grade) => {
  if (!grade) return null;
  let str = String(grade).trim();

  let checkStr = str.toUpperCase();
  if (checkStr.startsWith("GRADE")) {
    checkStr = checkStr.replace(/^GRADE\s+/i, "").trim();
  }
  
  // Normalize PG, PP1, PP2 to uppercase without "Grade" prefix
  if (checkStr === "PG") return "PG";
  if (checkStr === "PP1") return "PP1";
  if (checkStr === "PP2") return "PP2";
  // Fallback for other PP/PG variations
  if (checkStr.startsWith("PP") || checkStr.startsWith("PG")) {
    // Ensure "PG" doesn't get "Grade" prepended even if it has numbers like "PG 1"
    return checkStr.toUpperCase();
  }

  const match = str.match(/\d+/);
  if (match) return `Grade ${match[0]}`;
  return str;
};

const escapeRegExp = (str) => {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// ---------------------------
// REGISTER USER (Admin Only)
// ---------------------------

export const registerUser = async (req, res) => {
  try {
    const admin = req.user;

    // Check registrationOpen setting: if false, only super_admin can create users
    try {
      const regSetting = await Setting.findOne({ key: 'registrationOpen' });
      if (regSetting && regSetting.value === false && admin.role !== 'super_admin') {
        return res.status(403).json({ msg: 'Registrations are currently closed' });
      }
    } catch (err) {
      console.error('Failed to read registration setting:', err);
    }

    // Only admins and super admin can register users
    if (!['admin', 'super_admin'].includes(admin.role)) {
      return res.status(403).json({ msg: "Only admins can register users" });
    }

    // roles that MUST belong to a school
    const rolesNeedingSchool = ["admin", "accounts","teacher", "student", "parent", "classteacher"];

    let { name, email, role, admission, schoolId, grade, academicYear, stream, contact, pathway, gender, dateOfBirth } = req.body;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
    const formattedContact = formatContact(contact);
    const normalizedGender = gender ? String(gender).trim() : null;
    const normalizedDateOfBirth = normalizeOptionalDate(dateOfBirth);

    if (dateOfBirth && !normalizedDateOfBirth) {
      return res.status(400).json({ msg: "Date of birth must be in dd/mm/yyyy or yyyy-mm-dd format" });
    }

    if (!name || !role)
      return res.status(400).json({ msg: "Name and role are required" });

    const allowedRoles = ["student", "teacher", "accounts", "classteacher", "admin", "super_admin"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ msg: "Invalid role" });
    }

    // Guard: staff roles must not carry an admission field.
    if (role !== "student") {
      admission = undefined;
      if (Object.prototype.hasOwnProperty.call(req.body, 'admission')) {
        delete req.body.admission;
      }
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ msg: "Invalid role" });
    }

    if (role !== "student") {
      admission = undefined;
    }

    // ----------------------------
    // SCHOOL ID ENFORCEMENT LOGIC
    // ----------------------------
    let schoolIdToAssign = null;

    if (admin.role === "super_admin") {
      // super admin can assign any school for roles that need it
      if (rolesNeedingSchool.includes(role) && role !== "super_admin") {
        if (!schoolId) {
          return res.status(400).json({ msg: "schoolId is required for this user" });
        }
        schoolIdToAssign = schoolId;
      }
      // For roles that don't need school (like accounts), schoolIdToAssign remains null
    }

    if (admin.role === "admin") {
      // admin MUST assign their own schoolId only for roles that need it
      if (rolesNeedingSchool.includes(role)) {
        schoolIdToAssign = admin.schoolId;

        if (!schoolIdToAssign) {
          return res.status(400).json({
            msg: "Admin does not have a schoolId assigned. Cannot create users for this school."
          });
        }
      }
      // For roles that don't need school (like accounts), schoolIdToAssign remains null
    }

    if (rolesNeedingSchool.includes(role) && !schoolIdToAssign) {
      return res.status(400).json({ msg: "This role must be assigned to a school" });
    }

    // Student registration can be restricted per school
    if (role === "student" && schoolIdToAssign) {
      const targetSchool = await School.findById(schoolIdToAssign);
      if (!targetSchool) {
        return res.status(404).json({ msg: "School not found" });
      }
      if (targetSchool.registrationOpen === false && admin.role !== 'super_admin') {
        return res.status(403).json({ msg: "You have been restricted to register new learners, please contact MutsTech." });
      }
    }

    // ----------------------------
    // EMAIL CHECK
    // ----------------------------
    if (normalizedEmail && role !== "student") {
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing)
        return res.status(400).json({ msg: "Email already exists" });
    }

    if (role === "student" && !admission) {
      return res.status(400).json({ msg: "Admission required for students" });
    }

    if (role !== "student" && !normalizedEmail) {
      return res.status(400).json({ msg: "Email is required for staff registrations" });
    }

    // ----------------------------
    // PASSWORD GENERATION
    // ----------------------------
    const rawPassword = generateRawPassword(role, role === "student" ? admission : null);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // 🆕 Support for "Upsert" (Update or Insert) for student imports.
    // If student exists by admission in this school, we update details instead of failing.
    if (role === "student") {
      const existingStudent = await Student.findOne({ admission, schoolId: schoolIdToAssign });
      if (existingStudent) {
        if (formattedContact) existingStudent.contact = formattedContact;
        if (name) existingStudent.name = name;
        if (grade) existingStudent.grade = normalizeGrade(grade);
        if (pathway) existingStudent.pathway = normalizePathway(pathway);
        if (normalizedGender !== null) existingStudent.gender = normalizedGender;
        if (normalizedDateOfBirth !== null) existingStudent.dateOfBirth = normalizedDateOfBirth;

        // 🆕 Sync Enrollment record for the current academic year to ensure class list consistency
        const currentYear = academicYear || new Date().getFullYear();
        
        let enrollment = await StudentEnrollment.findOne({
            studentId: existingStudent._id,
            academicYear: currentYear
        });

        if (enrollment) {
            if (grade) enrollment.grade = normalizeGrade(grade);
            if (stream) enrollment.stream = String(stream).trim();
            if (pathway) enrollment.pathway = normalizePathway(pathway);
            enrollment.status = "active"; 
            await enrollment.save();
        } else {
            enrollment = new StudentEnrollment({
              studentId: existingStudent._id,
              schoolId: schoolIdToAssign,
              grade: normalizeGrade(grade),
              pathway: normalizePathway(pathway) || null,
              stream: stream ? String(stream).trim() : null,
              academicYear: currentYear,
              status: "active"
            });
            await enrollment.save();
        }
        
        // Ensure user record points to the active enrollment
        existingStudent.enrollmentId = enrollment._id;

        await existingStudent.save();
        if (schoolIdToAssign) cache.clearByPattern(String(schoolIdToAssign));

        return res.status(200).json({
          msg: "Student record matched and updated successfully",
          user: existingStudent
        });
      }
    }

    // 🆕 Instantiate the correct model based on the role
    // Build explicit payloads to avoid accidental fields (like admission:null) sneaking in
    let newUser;
    if (role === "student") {
      const payload = {
        name,
        role,
        admission,
        grade: normalizeGrade(grade),
        pathway: normalizePathway(pathway) || null,
        password: hashedPassword,
        contact: formattedContact,
        gender: normalizedGender,
        dateOfBirth: normalizedDateOfBirth,
        passwordMustChange: false,
        schoolId: schoolIdToAssign,
        createdBy: admin._id
      };
      newUser = new Student(payload);
    } else {
      // For staff/admin/accounts build strict payload without admission
      const payload = {
        name,
        role,
        email: normalizedEmail,
        password: hashedPassword,
        contact: formattedContact,
        passwordMustChange: ["teacher", "classteacher", "accounts"].includes(role),
        schoolId: schoolIdToAssign,
        createdBy: admin._id
      };
      if (Object.prototype.hasOwnProperty.call(req.body, 'admission')) {
        return res.status(400).json({ msg: "Invalid payload: 'admission' must not be provided for non-student roles" });
      }
      newUser = (role === 'teacher' || role === 'classteacher') ? new Teacher(payload) : new User(payload);
    }

    // Safety: ensure we never persist an explicit null admission for non-students.
    try {
      if (role !== "student") {
        if (Object.prototype.hasOwnProperty.call(newUser, 'admission')) {
          // Debug log unexpected admission presence
          console.warn(`registerUser: removing unexpected admission for role=${role} schoolId=${String(schoolIdToAssign)} ->`, newUser.admission);
          // Remove the path from the Mongoose document to avoid indexing null
          newUser.admission = undefined;
          delete newUser.admission;
        }
      }
    } catch (err) {
      console.error('registerUser: error while cleaning admission field', err);
    }

    await newUser.save();

    // Invalidate cache for this school
    if (schoolIdToAssign) cache.clearByPattern(String(schoolIdToAssign));

    // ----------------------------
    // AUTOMATIC STUDENT ENROLLMENT
    // ----------------------------
    if (role === "student") {
      try {
        const enrollment = new StudentEnrollment({
          studentId: newUser._id,
          schoolId: schoolIdToAssign,
          grade: normalizeGrade(grade),
          pathway: normalizePathway(pathway) || null,
          stream: stream ? String(stream).trim() : null, // 🆕 Optional for all grades
          academicYear: academicYear || new Date().getFullYear(),
          status: "active"
        });

        await enrollment.save();

        // attach enrollmentId to user
        newUser.enrollmentId = enrollment._id;
        await newUser.save();
      } catch (err) {
        console.error("Error creating student enrollment:", err);
        return res.status(500).json({ msg: "Student created but failed to generate enrollment record" });
      }
    }

    // ----------------------------
    // SEND EMAIL (if not student)
    // ----------------------------
    if (role !== "student" && email) {
      try {
        await sendCredentialsEmail({ name, email, rawPassword });
      } catch (err) {
        return res.status(201).json({
          msg: `${role} registered, but failed to send email`,
          emailError: err.message
        });
      }
    }

    return res.status(201).json({
      msg: `${role} registered successfully`,
      user: {
        _id: newUser._id,
        name: newUser.name,
        role: newUser.role,
        email: newUser.email,
        admission: newUser.admission,
        grade: newUser.grade,
        schoolId: newUser.schoolId,
        createdAt: newUser.createdAt
      }
    });

  } catch (err) {
    console.error("Register User Error:", err);
    return res.status(500).json({ msg: err.message });
  }
};


export const loginUser = async (req, res) => {
  const { role, email, fullname, admission, password } = req.body;
  const normalizedRole = role ? String(role).trim().toLowerCase() : undefined;
  const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

  try {
    // Maintenance mode: block logins for non-super-admins when enabled
    try {
      const m = await Setting.findOne({ key: 'maintenanceMode' });
      if (m && m.value === true && role !== 'super_admin') {
        return res.status(503).json({ message: 'System is under maintenance. Try again later.' });
      }
    } catch (err) {
      console.error('Failed to read maintenance setting:', err);
    }

    if (!normalizedRole) return res.status(400).json({ message: "Role is required" });

    let user;

    // ---------------------------
    // STUDENT/LEARNER LOGIN
    // ---------------------------
    if (normalizedRole === "student" || normalizedRole === "learner") {
      if (!fullname || !admission) {
        // Record attempt (no user found yet)
        await LoginAttempt.create({ identifier: admission || null, roleAttempted: normalizedRole, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Full name and admission number required" });
      }

      user = await User.findOne({ role: "student", admission });
      if (!user) {
        await LoginAttempt.create({ identifier: admission, roleAttempted: normalizedRole, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid admission number" });
      }

      if (user.name.toLowerCase() !== fullname.toLowerCase()) {
        await LoginAttempt.create({ userId: user._id, identifier: admission, roleAttempted: normalizedRole, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Full name does not match" });
      }
    } 
    // ---------------------------
    // CLASS TEACHER LOGIN
    // ---------------------------
    else if (normalizedRole === "classteacher") {
      if (!normalizedEmail || !password) return res.status(400).json({ message: "Email and password required" });

      user = await User.findOne({ email: { $regex: `^${escapeRegExp(normalizedEmail)}$`, $options: 'i' }, isClassTeacher: true });
      if (!user) {
        await LoginAttempt.create({ identifier: normalizedEmail, roleAttempted: normalizedRole, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.classTeacherPassword);
      if (!isMatch) {
        await LoginAttempt.create({ userId: user._id, identifier: normalizedEmail, roleAttempted: normalizedRole, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }
    } 
    // ---------------------------
    // TEACHER / ADMIN / SUPERADMIN LOGIN
    // ---------------------------
    else {
      if (!normalizedEmail || !password) return res.status(400).json({ message: "Email and password required" });

      user = await User.findOne({ email: { $regex: `^${escapeRegExp(normalizedEmail)}$`, $options: 'i' }, role: normalizedRole });
      if (!user) {
        await LoginAttempt.create({ identifier: normalizedEmail, roleAttempted: normalizedRole, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await LoginAttempt.create({ userId: user._id, identifier: normalizedEmail, roleAttempted: normalizedRole, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }
    }

    // ---------------------------
    // SCHOOL CHECK FOR RESTRICTED ROLES
    // ---------------------------
    const rolesNeedingSchool = ["admin", "accounts", "teacher", "student", "learner", "parent", "classteacher"];
    let school = null;

    if (rolesNeedingSchool.includes(user.role)) {
      if (!user.schoolId) {
        await LoginAttempt.create({ userId: user._id, identifier: user.email || user.admission || null, roleAttempted: role, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(403).json({ message: "Account not assigned to a school. Contact super admin." });
      }

      school = await School.findById(user.schoolId);
      if (!school || school.status === "Suspended") {
        await LoginAttempt.create({ userId: user._id, identifier: user.email || user.admission || null, roleAttempted: role, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(403).json({ message: "Your school is suspended. Contact MUTS_TECH." });
      }
    }

    // ---------------------------
    // BUILD ROLES ARRAY
    // ---------------------------
    const roles = [user.role];
    if (user.isClassTeacher && user.role !== "classteacher") roles.push("classteacher");
     
    // Resolve classGrade/Stream for students dynamically from enrollment if missing on user object
    let studentGrade = user.grade ? String(user.grade) : null;
    let studentStream = null;

    if ((user.role === "student" || user.role === "learner")) {
      const currentYear = new Date().getFullYear();
      // Try to find active enrollment
      const enrollment = await StudentEnrollment.findOne({
        studentId: user._id,
        status: "active",
        academicYear: currentYear
      }).select("grade stream pathway");

      if (enrollment) {
        if (!studentGrade) studentGrade = enrollment.grade;
        studentStream = enrollment.stream;
        if (enrollment.pathway && (!user.pathway || user.pathway === null)) {
          user.pathway = enrollment.pathway;
        }
      }
    }

    const classStream = user.assignedStream ? String(user.assignedStream) : null; // 🆕 Stream

    // ---------------------------
    // GENERATE JWT
    // ---------------------------
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        roles,
        schoolId: user.schoolId ? String(user.schoolId) : null,
        classGrade:
          (user.role === "student" || user.role === "learner")
            ? studentGrade
            : (role === "classteacher" || user.isClassTeacher)
            ? (user.assignedClass ? String(user.assignedClass) : null)
            : null,
        classStream: (user.role === "student" || user.role === "learner") 
          ? studentStream 
          : (role === "classteacher" || user.isClassTeacher ? classStream : null),
        schoolStatus: school ? school.status : null,
        schoolVersion: school ? school.version : null,
        isClassTeacher: user.isClassTeacher,
        isDean: user.isDean
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Record successful login
    try {
      await LoginAttempt.create({ userId: user._id, identifier: user.email || user.admission || null, roleAttempted: user.role, schoolId: user.schoolId || null, success: true, ip: req.ip, userAgent: req.headers['user-agent'] });
    } catch (err) {
      console.error('Failed to record login attempt:', err);
    }

    // 🆕 For students: populate enrollmentId with enrollment details (stream, pathway)
    if ((user.role === "student" || user.role === "learner") && user.enrollmentId) {
      try {
        await user.populate('enrollmentId', 'grade stream pathway academicYear');
      } catch (err) {
        console.warn('Failed to populate enrollmentId:', err);
      }
    }

    // 🚀 Security Fix: Sanitize user object to exclude sensitive fields from response body
    const sanitizedUser = user.toObject();
    if ((sanitizedUser.role === 'student' || sanitizedUser.role === 'learner')) {
      const enrollmentPathway = sanitizedUser.enrollmentId?.pathway || sanitizedUser.pathway || null;
      if (enrollmentPathway) {
        sanitizedUser.pathway = normalizePathway(enrollmentPathway);
      }
    }
    delete sanitizedUser.password;
    delete sanitizedUser.classTeacherPassword;
    delete sanitizedUser.resetCode;
    delete sanitizedUser.resetCodeExpires;
    delete sanitizedUser.resetAttempts;
    delete sanitizedUser.resetVerified;

    // ✅ SEND RESPONSE ONCE
    return res.json({ token, user: sanitizedUser });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// ---------------------------
// RESEND CREDENTIALS (Admin Only)
// ---------------------------
export const resendCredentials = async (req, res) => {
  try {
    // Only admins can resend credentials (your prior code required admin)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ msg: 'Only admins can resend credentials' });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // If acting user is school admin, ensure target user is in same school
    if (req.user.role === 'admin' && String(user.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ msg: 'You can only resend credentials for users in your school' });
    }

    let rawPassword;
    if (user.role === 'student') {
      rawPassword = user.admission;
    } else {
      rawPassword = generateRawPassword(user.role);
      user.password = await bcrypt.hash(rawPassword, 10);
      user.passwordMustChange = true;
      await user.save();
    }

    // Invalidate cache
    if (user.schoolId) cache.clearByPattern(String(user.schoolId));

    await sendCredentialsEmail({ name: user.name, email: user.email, rawPassword });
    res.status(200).json({ msg: 'Credentials resent successfully' });
  } catch (err) {
    console.error('Resend Credentials Error:', err);
    return res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// GET ALL USERS (Admin / Super Admin)
// ---------------------------

export const getAllUsers = async (req, res) => {
  try {
    const user = req.user;

    if (!['admin', 'super_admin', 'teacher', 'classteacher', 'accounts'].includes(user.role)) {
      return res.status(403).json({ message: 'Unauthorized access to user directory' });
    }

    // 1. Determine Pagination immediately (Moved up to fix ReferenceErrors and cache consistency)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const requestedLimit = parseInt(req.query.limit, 10);
    // Allow higher limits for exports (up to 5000), but clamp standard UI requests to 50
    const limit = requestedLimit > 50 ? Math.min(requestedLimit, 5000) : Math.min(50, Math.max(1, requestedLimit || 20));
    const skip = (page - 1) * limit;

    // Construct cache key. We ignore '_t' for standard browsing (limit <= 50) to maximize hits.
    // We KEEP '_t' for exports (limit > 50) so cache-busting works as intended.
    const queryForCache = { ...req.query };
    if (requestedLimit <= 50 || isNaN(requestedLimit)) delete queryForCache._t;

    const cacheKey = `users_${user.schoolId || 'global'}_${JSON.stringify(queryForCache)}`;
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }
    
    let query = {};
    let sort = { createdAt: -1, _id: -1 };
    // 🚀 Performance Optimization: Exclude large arrays (allocations) and 
    // sensitive metadata not required for user management table views.
    let projection = { 
      password: 0, 
      classTeacherPassword: 0, 
      allocations: 0, 
      signatureUrl: 0, 
      signaturePublicId: 0,
      resetCode: 0,
      resetCodeExpires: 0,
      resetAttempts: 0,
      resetVerified: 0
    };

    // Staff see only users in their school
    if (user.role !== 'super_admin' && user.schoolId) {
      query.schoolId = user.schoolId;
    }

    // Optional role filter (e.g., ?role=teacher)
    if (req.query.role) {
      query.role = req.query.role;
    }

    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { admission: searchRegex }
      ];
    }

    // 🆕 Filter by grade and stream for students
    const { grade, stream } = req.query;
    const normalizeQueryStream = (s) => {
      if (!s) return null;
      let value = String(s).trim();
      if (/^stream\s+/i.test(value)) value = value.replace(/^stream\s+/i, "");
      return value.toUpperCase();
    };

    const normalizedGrade = normalizeGrade(grade);
    const normalizedStream = normalizeQueryStream(stream);

    if (query.role === 'student' && (normalizedGrade || normalizedStream)) {
      const enrollmentFilter = {
        schoolId: user.schoolId,
        academicYear: new Date().getFullYear(), // Assume current year for active enrollments
        status: 'active'
      };
      if (normalizedGrade && normalizedGrade !== 'all') {
        enrollmentFilter.grade = normalizedGrade;
      }
      if (normalizedStream && normalizedStream !== 'all') {
        enrollmentFilter.stream = normalizedStream;
      }

      const matchingEnrollments = await StudentEnrollment.find(enrollmentFilter).select('studentId').lean();
      const studentIds = matchingEnrollments.map(e => e.studentId);

      // If no enrollments match, return empty array early
      if (studentIds.length === 0) {
        const response = { users: [], total: 0, page, limit, pages: 0 };
        cache.set(cacheKey, response, 60); // Cache for 60 seconds
        return res.json(response);
      }

      // Add studentId filter to the main user query
      query._id = { $in: studentIds };
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select(projection)
      .populate('enrollmentId', 'grade stream pathway') // 🆕 Added pathway to populate selection
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // 🆕 Tally pathway: ensure User.pathway is populated from enrollmentId if missing
    const tallyiedUsers = users.map(u => {
      const userObj = u.toObject ? u.toObject() : u;
      
      // If User.pathway is missing but enrollmentId has it, use enrollmentId.pathway
      if ((!userObj.pathway || userObj.pathway === null) && userObj.enrollmentId && userObj.enrollmentId.pathway) {
        userObj.pathway = userObj.enrollmentId.pathway;
      }
      
      return userObj;
    });

    const response = { users: tallyiedUsers, total, page, limit, pages: Math.ceil(total / limit) };
    cache.set(cacheKey, response, 60); // Cache for 60 seconds
    res.json(response);
  } catch (err) {
    console.error("Get All Users Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// ---------------------------
// ASSIGN SUBJECTS TO TEACHERS (Admin Only)
// ---------------------------
export const assignSubjects = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can assign subjects' });
    }

    const { teacherId, grade, stream, subjects } = req.body;
    if (!teacherId || grade === undefined || !subjects) {
      return res.status(400).json({ message: 'teacherId, grade and subjects are required' });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    // Ensure teacher belongs to same school
    if (String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'You can only assign subjects to teachers in your school' });
    }

    const gradeStr = String(grade);
    const streamStr = stream ? String(stream) : null;
    const normalizedSubjects = Array.isArray(subjects) ? subjects : [subjects];

    // 🆕 Validation: Check if any of these subjects are already assigned to another teacher in this class
    const conflictTeacher = await User.findOne({
      schoolId: req.user.schoolId,
      _id: { $ne: teacherId },
      allocations: {
        $elemMatch: { grade: gradeStr, stream: streamStr, subjects: { $in: normalizedSubjects } }
      }
    }).select('name');

    if (conflictTeacher) {
      return res.status(400).json({ 
        message: ` Subject(s) is already allocated to ${conflictTeacher.name} in this class.` 
      });
    }

    if (!Array.isArray(teacher.allocations)) teacher.allocations = [];

    // Find existing allocation for this grade and stream combination
    const existingAllocation = teacher.allocations.find(
      a => a.grade === gradeStr && (a.stream || null) === streamStr
    );

    if (existingAllocation) {
      // Add new subjects to existing allocation
      normalizedSubjects.forEach(subj => {
        if (!existingAllocation.subjects.includes(subj)) {
          existingAllocation.subjects.push(subj);
        }
      });
      teacher.markModified('allocations');
    } else {
      // Create new allocation with optional stream
      teacher.allocations.push({ 
        grade: gradeStr, 
        stream: streamStr,
        subjects: normalizedSubjects 
      });
    }

    await teacher.save();
    cache.clearByPattern(String(teacher.schoolId)); // Invalidate cache
    res.json({ message: 'Subjects assigned successfully', teacher });
  } catch (err) {
    console.error("AssignSubjects Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// GET Subject Allocations
// ---------------------------
export const getSubjectAllocations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    // Allow higher limit for internal school-wide operations like timetable generation (up to 1000)
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 5));
    const skip = (page - 1) * limit;

    // 🆕 Add filter for unassigned teachers
    const unassignedOnly = req.query.unassigned === 'true';

    const query = { role: 'teacher' };
    if (req.user.schoolId) {
      query.schoolId = req.user.schoolId;
    }

    if (req.query.teacherId) {
      query._id = req.query.teacherId;
    }

    if (unassignedOnly) {
      query.$or = [
        { allocations: { $size: 0 } },
        { allocations: { $exists: false } },
        { allocations: null }
      ];
    }

    const searchQuery = String(req.query.search || '').trim();
    const gradeFilter = String(req.query.grade || '').trim();
    const cacheKey = `sub_alloc_${req.user.schoolId || 'global'}_${page}_${limit}_un${unassignedOnly}_s${encodeURIComponent(searchQuery)}_g${encodeURIComponent(gradeFilter)}`;

    if (!unassignedOnly) {
      if (searchQuery) {
        const sanitizedSearch = escapeRegExp(searchQuery);
        const searchRegex = new RegExp(sanitizedSearch, 'i');
        const normalizedGradeSearch = searchQuery.replace(/^Grade\s+/i, '').trim();
        const gradeSearchRegex = new RegExp(`^${escapeRegExp(normalizedGradeSearch)}$`, 'i');

        query.$or = [
          { name: searchRegex },
          { 'allocations.subjects': searchRegex },
          { 'allocations.grade': searchRegex },
          { 'allocations.stream': searchRegex },
        ];

        if (normalizedGradeSearch && normalizedGradeSearch !== searchQuery) {
          query.$or.push({ 'allocations.grade': gradeSearchRegex });
        }
      }

      if (gradeFilter) {
        const normalizedGradeFilter = gradeFilter.replace(/^Grade\s+/i, '').trim();
        const gradeFilterRegex = new RegExp(`^${escapeRegExp(normalizedGradeFilter)}$`, 'i');
        query['allocations.grade'] = gradeFilterRegex;
      }
    }
    const cached = cache.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const total = await User.countDocuments(query);
    const teachers = await User.find(query)
      // 🆕 Include email and contact for the "Edit Profile" modal
      .select('name email contact allocations schoolId isDean assignedClass assignedStream')
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedTeachers = teachers.map(t => ({
      ...t,
      isDean: !!t.isDean, // Explicitly cast to boolean for frontend safety
      allocations: (t.allocations || []).map(a => ({
        grade: a.grade,
        stream: a.stream || null,
        subjects: Array.isArray(a.subjects) ? a.subjects : []
      }))
    }));

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };

    const response = { data: formattedTeachers, pagination };
    cache.set(cacheKey, response, 120); // Cache page-specific results for 2 minutes
    res.json(response);
  } catch (err) {
    console.error("Get Subject Allocations Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// GET MY ALLOCATIONS (Teacher Only)
// ---------------------------
export const getMyAllocations = async (req, res) => {
  try {
    if (!['teacher', 'classteacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only teachers can view their allocations' });
    }

    const teacher = await User.findById(req.user.id)
      .select('name allocations isDean')
      .lean();

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Format allocations with stream information
    const allocations = (teacher.allocations || []).map(a => ({
      grade: normalizeGrade(a.grade),
      stream: a.stream || null, // Could be "W", "E", "A", etc. or null
      classLabel: (String(a.grade).toUpperCase().startsWith("PP") || String(a.grade).toUpperCase().startsWith("PG"))
        ? (a.stream ? `${normalizeGrade(a.grade)} ${a.stream}` : `${normalizeGrade(a.grade)}`)
        : (a.stream ? `Grade ${a.grade} ${a.stream}` : `Grade ${a.grade}`),
      subjects: Array.isArray(a.subjects) ? a.subjects : []
    }));

    res.json({
      name: teacher.name,
      isDean: !!teacher.isDean,
      subjectAllocations: allocations
    });
  } catch (err) {
    console.error("GetMyAllocations Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * ASSIGN CLASS TEACHER (Admin Only)
 */
export const assignClassTeacher = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can assign class teachers' });
    }

    const { teacherId, assignedClass, assignedStream } = req.body;
    if (!teacherId || assignedClass === undefined) {
      return res.status(400).json({ message: 'teacherId and assignedClass are required' });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    // Ensure teacher is in same school
    if (String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'You can only assign class teachers in your school' });
    }

    const normalizedGrade = normalizeGrade(assignedClass);
    const stream = assignedStream || null;

    // 🆕 Validation: Check if another teacher is already assigned to this specific class/stream
    const existingClassTeacher = await User.findOne({
      schoolId: req.user.schoolId,
      _id: { $ne: teacherId },
      assignedClass: normalizedGrade,
      assignedStream: stream,
      isClassTeacher: true
    }).select('name');

    if (existingClassTeacher) {
      return res.status(400).json({ 
        message: `Class ${normalizedGrade}${stream ? ' ' + stream : ''} is already assigned to ${existingClassTeacher.name}.` 
      });
    }

    teacher.assignedClass = normalizedGrade;
    teacher.assignedStream = stream;
    teacher.isClassTeacher = true;

    const rawClassTeacherPassword = 'CT' + Math.random().toString(36).slice(-5).toUpperCase();
    const hashed = await bcrypt.hash(rawClassTeacherPassword, 10);
    teacher.classTeacherPassword = hashed;

    teacher.passwordMustChange = true;

    await teacher.save();
    cache.clearByPattern(String(teacher.schoolId)); // Invalidate cache

    // Email the class teacher credentials (if email exists)
    if (teacher.email) {
      const classLabel = (String(assignedClass).toUpperCase().startsWith("PP") || String(assignedClass).toUpperCase().startsWith("PG"))
        ? (assignedStream ? `${normalizeGrade(assignedClass)} ${assignedStream}` : `${normalizeGrade(assignedClass)}`)
        : (assignedStream 
          ? `Grade ${assignedClass} ${assignedStream}` 
          : `Grade ${assignedClass}`);
      
      await sendEmail({
        to: teacher.email,
        subject: 'Class Teacher Allocation',
        text: `Hello ${teacher.name},

        You have been allocated to ${classLabel} as the class teacher.

        Login credentials (Class Teacher role):
        Email: ${teacher.email}
        Password: ${rawClassTeacherPassword}

         Please log in and change your password immediately.`,
        html: `
          <p>Hello <strong>${teacher.name}</strong>,</p>
          <p>You have been allocated to <strong>${classLabel}</strong> as the class teacher.</p>
          <p><strong>Login credentials (Class Teacher role):</strong></p>
          <ul>
            <li>Email: ${teacher.email}</li>
            <li>Password: ${rawClassTeacherPassword}</li>
          </ul>
          <p>Please log in and change your password immediately.</p>
           <p>
        <a href="https://competencehub.netlify.app/login" target="_blank">CLICK HERE TO LOGIN</a>
      </p>
       `
      });
    }

    res.json({ 
      message: 'Class teacher assigned successfully', 
      teacherId: teacher._id, 
      assignedClass: teacher.assignedClass,
      assignedStream: teacher.assignedStream
    });
  } catch (err) {
    console.error("AssignClassTeacher Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getClassTeacherAllocations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const cacheKey = `class_alloc_${req.user.schoolId || 'global'}_p${page}_l${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const query = { assignedClass: { $ne: null }, role: 'teacher' };
    if (req.user.role === 'admin') query.schoolId = req.user.schoolId;

    const total = await User.countDocuments(query);
    const classTeachers = await User.find(query)
      .select('name email admission assignedClass assignedStream isClassTeacher isDean signatureUrl')
      .skip(skip)
      .limit(limit);

    const allocations = classTeachers.map(t => ({
      teacherId: t._id.toString(),
      teacherName: t.name,
      teacherAdmission: t.admission,
      assignedClass: t.assignedClass || '',
      assignedStream: t.assignedStream || null,
      classLabel: (String(t.assignedClass).toUpperCase().startsWith("PP") || String(t.assignedClass).toUpperCase().startsWith("PG"))
        ? (t.assignedStream ? `${normalizeGrade(t.assignedClass)} ${t.assignedStream}` : `${normalizeGrade(t.assignedClass)}`)
        : (t.assignedStream ? `Grade ${t.assignedClass} ${t.assignedStream}` : `Grade ${t.assignedClass}`),
      isClassTeacher: !!t.isClassTeacher,
      isDean: !!t.isDean,
      signatureUrl: t.signatureUrl || ""
    }));

    const response = {
      data: allocations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

    cache.set(cacheKey, response, 120);
    res.json(response);
  } catch (err) {
    console.error("GetClassTeacherAllocations Error:", err);
    res.status(500).json({ error: err.message });
  }
};


export const getUser = async (req, res) => {
  try {
    let user = await User.findById(req.user.id)
      .select("-password -classTeacherPassword -resetCode -resetCodeExpires -resetAttempts -resetVerified")
      .populate("schoolId", "status"); // 🆕 Populate school to retrieve its status

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // 🆕 For students: populate enrollmentId with enrollment details (stream, pathway)
    if ((user.role === "student" || user.role === "learner") && user.enrollmentId) {
      try {
        await user.populate('enrollmentId', 'grade stream pathway academicYear');
      } catch (err) {
        console.warn('Failed to populate enrollmentId:', err);
      }
    }

    const userObj = user.lean ? user.lean() : user.toObject();

    return res.status(200).json({
      ...userObj,
      schoolStatus: userObj.schoolId?.status || "Active", // 🆕 Explicitly provide school status
      schoolId: userObj.schoolId?._id || userObj.schoolId,   // 🆕 Restore schoolId as a standard ID string
      isDean: !!userObj.isDean,
      // normalize for frontend safety
      classGrade: userObj.assignedClass || userObj.classGrade || null
    });
  } catch (err) {
    console.error("GetUser Error:", err);
    return res.status(500).json({ msg: "Server error fetching profile" });
  }
};

// ---------------------------
// remove subject allocation (Admin Only)
// ---------------------------
export const removeSubjectAllocation = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can remove subject allocations' });
    }

    const { teacherId, grade, stream, subjects } = req.body; // 🆕 Accept subjects array
    if (!teacherId || !grade) return res.status(400).json({ message: 'teacherId and grade required' });

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    if (String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'You can only remove allocations for teachers in your school' });
    }

    // Find the specific allocation matching grade and stream
    const allocation = (teacher.allocations || []).find(a => 
      String(a.grade) == String(grade) && (a.stream || null) === (stream || null)
    );

    const originalLength = teacher.allocations.length;
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found for this grade/stream' });
    }

    if (Array.isArray(subjects) && subjects.length > 0) {
      // Selective removal: Keep subjects NOT in the removal list
      allocation.subjects = allocation.subjects.filter(s => !subjects.includes(s));
      
      // If no subjects left in this allocation, remove the entire entry
      if (allocation.subjects.length === 0) {
        teacher.allocations = teacher.allocations.filter(a => a !== allocation);
      }
    } else {
      // Fallback/Legacy: Remove the entire allocation entry if no specific subjects provided
      teacher.allocations = teacher.allocations.filter(a => a !== allocation);
    }

    teacher.markModified('allocations');
    const newLength = teacher.allocations.length;

    await teacher.save();
    cache.clearByPattern(String(teacher.schoolId)); // Invalidate cache
    const isSpecial = String(grade).toUpperCase().startsWith("PP") || String(grade).toUpperCase().startsWith("PG");
    const gradeLabel = isSpecial ? (stream ? `${normalizeGrade(grade)} ${stream}` : normalizeGrade(grade)) : (stream ? `Grade ${grade} ${stream}` : `Grade ${grade}`);
    res.json({ 
      message: `Allocation for ${gradeLabel} removed successfully`, 
      removed: originalLength - newLength > 0,
      teacher 
    });
  } catch (err) {
    console.error("RemoveSubjectAllocation Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// remove class teacher assignment (Admin Only)
// ---------------------------
export const removeClassTeacher = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can remove class teachers' });
    }

    const { teacherId } = req.body;
    if (!teacherId) return res.status(400).json({ message: 'teacherId required' });

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    if (String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'You can only remove class teachers in your school' });
    }

    teacher.assignedClass = null;
    teacher.isClassTeacher = false;
    teacher.classTeacherPassword = null;
    teacher.passwordMustChange = false;

    await teacher.save();
    cache.clearByPattern(String(teacher.schoolId)); // Invalidate cache

    if (teacher.email) {
      await sendEmail({
        to: teacher.email,
        subject: 'CBE Portal Class Teacher Removal',
        text: `Hello ${teacher.name},

         You have been removed as class teacher. You still retain your teacher role credentials.

        If you are re-allocated in the future, you will receive new class teacher login details.`,
        html: `
          <p>Hello <strong>${teacher.name}</strong>,</p>
          <p>You have been removed as class teacher. You still retain your teacher role credentials.</p>
          <p>If you are re-allocated in the future, you will receive new class teacher login details.</p>
        `
      });
    }

    res.json({
      message: 'Class teacher removed successfully',
      teacherId: teacher._id
    });
  } catch (err) {
    console.error("RemoveClassTeacher Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// GET Student By Admission (scoped)
// ---------------------------
export const getStudentByAdmission = async (req, res) => {
  try {
    const { admission } = req.params;
    if (!admission) return res.status(400).json({ message: "Admission required" });

    const query = { admission };

    // ---------------------------
    // School scoping
    // ---------------------------
    if (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.role === 'classteacher') {
      // Only fetch students in the same school
      query.schoolId = req.user.schoolId;
    }

    // 🆕 Use Student model to ensure we only ever find learners
    const student = await Student.findOne(query).select("name admission schoolId _id");
    if (!student) return res.status(404).json({ message: "Student not found" });

    // 🔧 FIXED: Fetch LATEST ACTIVE enrollment (handles promotion correctly)
    // First, try to get enrollment for current academic year with active status
    const currentYear = new Date().getFullYear();
    let enrollment = await StudentEnrollment.findOne({
      studentId: student._id,
      academicYear: currentYear,
      status: 'active'
    }).select("grade stream");

    // If no active enrollment for current year, get latest enrollment (post-promotion)
    if (!enrollment) {
      enrollment = await StudentEnrollment.findOne({
        studentId: student._id
      })
        .sort({ academicYear: -1 })
        .select("grade stream");
    }

    const grade = enrollment?.grade || null;
    const stream = enrollment?.stream || null;

    res.json({
      name: student.name,
      admission: student.admission,
      grade: grade,
      stream: stream,
      schoolId: student.schoolId
    });
  } catch (err) {
    console.error("getStudentByAdmission error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ---------------------------
// CHANGE PASSWORD (All Roles)
// ---------------------------
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ---------------------------
    // CLASS TEACHER SPECIAL CASE
    // ---------------------------
    const isClassTeacher = req.user.roles?.includes("classteacher") || user.isClassTeacher;

    if (isClassTeacher) {
      // Class teachers do NOT submit currentPassword
      const hashed = await bcrypt.hash(newPassword, 10);
      user.classTeacherPassword = hashed;
      user.passwordMustChange = false;

      await user.save();

      // Fetch school for version
      let schoolVersion = null;
      if (user.schoolId) {
        const school = await School.findById(user.schoolId).select('version');
        schoolVersion = school ? school.version : null;
      }

      // Generate token with classTeacherPassword flag
      const token = jwt.sign(
        {
          id: user._id,
          roles: ["classteacher", ...(user.role !== "classteacher" ? [user.role] : [])],
          schoolId: user.schoolId ? String(user.schoolId) : null,
          classGrade: user.assignedClass || null,
          classStream: user.assignedStream || null, // 🆕 Include stream
          isClassTeacher: true,
          isDean: user.isDean,
          schoolVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      // Sanitize user for response
      const sanitizedUser = user.toObject();
      delete sanitizedUser.password;
      delete sanitizedUser.classTeacherPassword;
      delete sanitizedUser.resetCode;
      delete sanitizedUser.resetCodeExpires;
      delete sanitizedUser.resetAttempts;
      delete sanitizedUser.resetVerified;

      return res.json({
        message: "Password updated successfully",
        user: sanitizedUser,
        token
      });
    }

    // ---------------------------
    // NORMAL USERS (Teacher/Admin/Student)
    // ---------------------------
    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(403).json({ message: "Current password incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordMustChange = false;

    await user.save();

    // Fetch school for version
    let schoolVersion = null;
    if (user.schoolId) {
      const school = await School.findById(user.schoolId).select('version');
      schoolVersion = school ? school.version : null;
    }

    // Generate JWT with standard roles
    const token = jwt.sign(
      {
        id: user._id,
        roles: [user.role],
        schoolId: user.schoolId ? String(user.schoolId) : null,
        classGrade: user.assignedClass || null,
        classStream: user.assignedStream || null, // 🆕 Include stream
        isClassTeacher: user.isClassTeacher,
        isDean: user.isDean,
        schoolVersion
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

      // Sanitize user for response
      const sanitizedUser = user.toObject();
      delete sanitizedUser.password;
      delete sanitizedUser.classTeacherPassword;
      delete sanitizedUser.resetCode;
      delete sanitizedUser.resetCodeExpires;
      delete sanitizedUser.resetAttempts;
      delete sanitizedUser.resetVerified;

    res.json({
      message: "Password changed successfully",
        user: sanitizedUser,
      token
    });

  } catch (err) {
    console.error("ChangePassword Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------------------
// TOGGLE DEAN STATUS (Admin Only)
// ---------------------------
export const toggleDeanStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only admins can toggle Dean status' });
    }

    const { teacherId, isDean } = req.body;
    if (!teacherId) return res.status(400).json({ message: 'teacherId is required' });

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    // Ensure teacher belongs to same school
    if (req.user.role === 'admin' && String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    teacher.isDean = isDean;
    await teacher.save();
    
    // Invalidate cache
    if (teacher.schoolId) cache.clearByPattern(String(teacher.schoolId));

    res.json({ 
      message: `Dean role ${isDean ? 'granted' : 'revoked'} to ${teacher.name}`, 
      isDean: teacher.isDean 
    });
  } catch (err) {
    console.error("ToggleDeanStatus Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// UPDATE USER (Admin / Super Admin)
// ---------------------------
export const updateUser = async (req, res) => {
  try {
    const actingUser = req.user; // logged in admin
    const targetUser = await User.findById(req.params.id);

    if (!targetUser)
      return res.status(404).json({ message: "User not found" });

    // Admin cannot modify users outside their school
    if (
      actingUser.role === "admin" &&
      String(targetUser.schoolId) !== String(actingUser.schoolId)
    ) {
      return res.status(403).json({ message: "You cannot update users outside your school" });
    }

    // Admin cannot change or remove schoolId — enforce original
    if (actingUser.role === "admin") {
      req.body.schoolId = targetUser.schoolId;
    }

    // Super admin: prevent accidentally wiping schoolId
    if (actingUser.role === "super_admin") {
      if (req.body.schoolId === "" || req.body.schoolId === null) {
        req.body.schoolId = targetUser.schoolId;
      }
    }

    // Assign allowed fields
    let allowed = ["name", "email", "role", "contact", "pathway", "gender", "dateOfBirth"];

    // 🆕 Determine the role we are dealing with (current or newly assigned)
    const effectiveRole = req.body.role || targetUser.role;

    // 🆕 Expand allowed fields based on the discriminator role
    if (effectiveRole === "student") {
      allowed.push("admission", "grade");
    } else if (["teacher", "classteacher"].includes(effectiveRole)) {
      // Allow staff-specific management fields
      allowed.push("isDean", "assignedClass", "assignedStream", "isClassTeacher");
    }

    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        let value = req.body[key];
        // 🆕 Auto-format contact on update
        if (key === 'contact' && value) {
          let str = String(value).trim().replace(/\s+/g, '');
          if (str.startsWith('0')) value = '+254' + str.substring(1);
          else if (/^[71]/.test(str) && str.length === 9) value = '+254' + str;
          else if (str.startsWith('254') && str.length === 12) value = '+' + str;
        }

        // 🆕 Normalize grade if it's a student field being updated
        if (key === 'grade' && effectiveRole === "student") {
          value = normalizeGrade(value);
        }

        if (key === 'dateOfBirth' && value) {
          const parsedDate = normalizeOptionalDate(value);
          if (!parsedDate) {
            return res.status(400).json({ message: "Date of birth must be in dd/mm/yyyy or yyyy-mm-dd format" });
          }
          value = parsedDate;
        }

        targetUser[key] = value;
      }
    });

    // Ensure student has an admission number
    if (targetUser.role === "student" && !targetUser.admission) {
      return res.status(400).json({ message: "Admission number is required for students" });
    }

    // schoolId safely assigned after validation
    if (actingUser.role === "super_admin" && req.body.schoolId) {
      targetUser.schoolId = req.body.schoolId;
    }

    try {
      await targetUser.save();
      if (targetUser.schoolId) cache.clearByPattern(String(targetUser.schoolId));
    } catch (err) {
      // Handle unique constraint violations gracefully
      if (err.code === 11000) {
        return res.status(400).json({ message: "Admission number already exists" });
      }
      throw err;
    }

    // Sanitize user for response
    const sanitizedUser = targetUser.toObject();
    delete sanitizedUser.password;
    delete sanitizedUser.classTeacherPassword;
    delete sanitizedUser.resetCode;
    delete sanitizedUser.resetCodeExpires;
    delete sanitizedUser.resetAttempts;
    delete sanitizedUser.resetVerified;

    res.json({ message: "User updated", user: sanitizedUser });
  } catch (err) {
    console.error("Update User Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// DELETE USER
// ---------------------------
export const deleteUser = async (req, res) => {
  try {
    const actingUser = req.user;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    // Admin can only delete users in their school
    if (actingUser.role === 'admin' && String(targetUser.schoolId) !== String(actingUser.schoolId)) {
      return res.status(403).json({ message: 'You cannot delete users outside your school' });
    }

    await targetUser.deleteOne();
    if (targetUser.schoolId) cache.clearByPattern(String(targetUser.schoolId));
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// UPDATE SIGNATURE (Teacher/Dean)
// ---------------------------
export const updateSignature = async (req, res) => {
  try {
    const userId = req.user.id;
    const { signatureUrl, signaturePublicId } = req.body; // Sent after frontend Cloudinary upload

    if (!signatureUrl) return res.status(400).json({ message: "Signature URL is required" });

    const user = await User.findByIdAndUpdate(
      userId,
      { signatureUrl, signaturePublicId },
      { new: true }
    ).select("-password -classTeacherPassword -resetCode -resetCodeExpires -resetAttempts -resetVerified");
    
    // Invalidate caches that might hold teacher details
    cache.clearByPattern(`class_alloc_${req.user.schoolId}`);

    res.json({ message: "Signature updated successfully", user });
  } catch (err) {
    console.error("Update Signature Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// GET CLASS TEACHER FOR A GRADE (Reports)
// ---------------------------
export const getClassTeacher = async (req, res) => {
  try {
    let { grade, stream } = req.query;
    if (!grade) return res.status(400).json({ message: "Grade is required" });

    // Normalize grade: handle formats like "Grade 2W", "2W", "Grade 2", "2"
    grade = grade.trim();
    let requestedStream = (stream === "null" || stream === "undefined" || !stream) ? null : stream.trim();

    // Parse grade string to handle formats like "Grade 2W" or "2W"
    const gradeParts = grade.match(/^(?:Grade\s+)?(\d+)([A-Z])?$/i);
    let numericGrade = grade;

    if (gradeParts) {
      numericGrade = gradeParts[1];
      // If stream is missing from query but present in grade string, extract it
      if (!requestedStream && gradeParts[2]) {
        requestedStream = gradeParts[2].toUpperCase();
      }
    }

    const query = {
      schoolId: req.user.schoolId,
      assignedClass: { $in: [grade, numericGrade, `Grade ${numericGrade}`] },
      assignedStream: requestedStream,
      isClassTeacher: true
    };

    let teacher = await User.findOne(query).select("name signatureUrl");

    // 🆕 FALLBACK: If specific stream teacher not found, try finding one for the grade with NO stream
    if (!teacher && requestedStream) {
      query.assignedStream = null;
      teacher = await User.findOne(query).select("name signatureUrl");
    }

    if (!teacher) return res.status(404).json({ message: "Class teacher not found" });

    res.json(teacher);
  } catch (err) {
    console.error("GetClassTeacher Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🆕 GET CLASS TEACHERS FOR MULTIPLE GRADES/STREAMS (Batch for Reports)
 * Accepts an array of { grade, stream } objects in the request body.
 */
export const getClassTeachersByGradesAndStreams = async (req, res) => {
  try {
    const { gradeStreamPairs } = req.body; // Expects [{ grade: "Grade 1", stream: "A" }, { grade: "Grade 2", stream: null }]

    if (!Array.isArray(gradeStreamPairs) || gradeStreamPairs.length === 0) {
      return res.status(400).json({ message: "An array of grade/stream pairs is required." });
    }

    const schoolId = req.user.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: "School ID is missing." });
    }

    // 🆕 Deduplicate pairs to prevent redundant query conditions
    const uniquePairs = Array.from(new Set(gradeStreamPairs.map(p => JSON.stringify(p)))).map(p => JSON.parse(p));

    const queryConditions = uniquePairs.map(pair => {
      let grade = pair.grade;
      let stream = (pair.stream === "null" || pair.stream === "undefined" || !pair.stream) ? null : pair.stream.trim();

      // Normalize grade to handle formats like "Grade 2W" or "2W"
      const gradeParts = grade.match(/^(?:Grade\s+)?(\d+)([A-Z])?$/i);
      let numericGrade = grade;
      if (gradeParts) {
        numericGrade = gradeParts[1];
        if (!stream && gradeParts[2]) stream = gradeParts[2].toUpperCase();
      }

      return {
        schoolId: schoolId,
        assignedClass: { $in: [grade, numericGrade, `Grade ${numericGrade}`] },
        assignedStream: stream,
        isClassTeacher: true
      };
    });

    const teachers = await User.find({ $or: queryConditions }).select("name signatureUrl assignedClass assignedStream").lean();

    res.json(teachers);
  } catch (err) {
    console.error("getClassTeachersByGradesAndStreams error:", err);
    res.status(500).json({ message: "Server error fetching class teachers." });
  }
};

// ---------------------------
// BULK DELETE STUDENTS BY CLASS (Admin Only)
// ---------------------------
export const bulkDeleteStudentsByClass = async (req, res) => {
  try {
    const actingUser = req.user;

    if (!['admin', 'super_admin'].includes(actingUser.role)) {
      return res.status(403).json({ message: 'Only admins can perform this action' });
    }

    const { grade, stream, academicYear } = req.body;

    if (!grade || !academicYear) {
      return res.status(400).json({ message: 'Grade and academicYear are required' });
    }

    const schoolId = actingUser.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: 'School ID is missing for the acting user.' });
    }

    // 1. Find all enrollments for the specified class and year
    const enrollmentQuery = {
      schoolId: schoolId,
      grade: grade,
      academicYear: Number(academicYear),
      status: "active" // Only delete active students in this class
    };
    if (stream) {
      enrollmentQuery.stream = stream;
    }

    // 🚀 Update: Populate studentId to get admission numbers for Mark deletion
    const enrollmentsToDelete = await StudentEnrollment.find(enrollmentQuery).populate('studentId', 'admission').lean();
    const studentIdsToDelete = [...new Set(enrollmentsToDelete.map(e => e.studentId?._id?.toString()).filter(Boolean))];
    const admissionsToDelete = [...new Set(enrollmentsToDelete.map(e => e.studentId?.admission).filter(Boolean))];

    if (studentIdsToDelete.length === 0) {
      return res.status(404).json({ message: 'No active students found in this class for the specified academic year.' });
    }

    // 2. Perform bulk deletion across all related collections
    const deleteResults = await Promise.all([
      User.deleteMany({ _id: { $in: studentIdsToDelete }, role: 'student', schoolId: schoolId }),
      StudentEnrollment.deleteMany({ studentId: { $in: studentIdsToDelete }, schoolId: schoolId }),

      // 🆕 Enhanced: Use both studentId and admissionNo for robust cascading deletion
      Mark.deleteMany({ 
        $or: [
          { studentId: { $in: studentIdsToDelete } },
          { admissionNo: { $in: admissionsToDelete } }
        ], 
        schoolId: schoolId 
      }), 
      Payment.deleteMany({ studentId: { $in: studentIdsToDelete }, schoolId: schoolId }), 
      LoginAttempt.deleteMany({ userId: { $in: studentIdsToDelete } }), // Login attempts are linked by userId
      
      // 3. Update Materials: Remove deleted student IDs from 'readBy' array
      Material.updateMany(
        { readBy: { $in: studentIdsToDelete } },
        { $pull: { readBy: { $in: studentIdsToDelete } } }
      )
    ]);

    const deletedUsersCount = deleteResults[0].deletedCount;
    const deletedEnrollmentsCount = deleteResults[1].deletedCount;
    const deletedMarksCount = deleteResults[2].deletedCount;
    const deletedPaymentsCount = deleteResults[3].deletedCount;
    const deletedLoginAttemptsCount = deleteResults[4].deletedCount;

    // 4. Clear relevant caches for the school
    cache.clearByPattern(String(schoolId));

    res.status(200).json({
      message: `Successfully deleted ${deletedUsersCount} students and their associated data.`,
      details: {
        students: deletedUsersCount,
        enrollments: deletedEnrollmentsCount,
        marks: deletedMarksCount,
        payments: deletedPaymentsCount,
        loginAttempts: deletedLoginAttemptsCount
      }
    });
  } catch (err) {
    console.error("bulkDeleteStudentsByClass Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// UPDATE GRADING CONFIG (Admin / Dean)
// ---------------------------
export const updateGradingConfig = async (req, res) => {
  try {
    const { gradingConfig } = req.body;
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return res.status(400).json({ message: "School ID is missing from your profile." });
    }

    const school = await School.findByIdAndUpdate(
      schoolId,
      { gradingConfig },
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({ message: "School not found." });
    }

    // Invalidate school-related caches to reflect changes immediately
    // Use a pattern that catches school profile caches
    cache.clearByPattern(String(schoolId));

    res.status(200).json({
      message: "School grading configuration updated successfully.",
      gradingConfig: school.gradingConfig
    });
  } catch (err) {
    console.error("updateGradingConfig Error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ---------------------------
// BULK REGISTER USERS (Admin Only) - Optimized for CSV Import
// ---------------------------
export const bulkRegisterUsers = async (req, res) => {
  try {
    const admin = req.user;
    if (!['admin', 'super_admin'].includes(admin.role)) {
      return res.status(403).json({ msg: "Only admins can register users" });
    }

    const studentsToProcess = req.body;
    if (!Array.isArray(studentsToProcess) || studentsToProcess.length === 0) {
      return res.status(400).json({ msg: "Request body must be an array of student data" });
    }

    const schoolIdToAssign = admin.schoolId; // Admins can only register for their own school
    if (!schoolIdToAssign) {
      return res.status(400).json({ msg: "Admin does not have a schoolId assigned. Cannot create users for this school." });
    }

    const results = { successCount: 0, failureCount: 0, errors: [] };
    const currentYear = new Date().getFullYear();

    // Pre-fetch all existing students by admission number in one go
    const admissions = studentsToProcess.map(s => s.admission).filter(Boolean);
    const existingStudents = await Student.find({ admission: { $in: admissions }, schoolId: schoolIdToAssign }).lean();
    const existingStudentMap = new Map(existingStudents.map(s => [s.admission, s]));

    // Pre-fetch all existing enrollments for these students for the current year
    const existingEnrollments = await StudentEnrollment.find({ studentId: { $in: existingStudents.map(s => s._id) }, academicYear: currentYear }).lean();
    const existingEnrollmentMap = new Map(existingEnrollments.map(e => [String(e.studentId), e]));

    for (const studentData of studentsToProcess) {
      try {
        const { name, admission, grade, stream, contact, pathway, gender, dateOfBirth } = studentData;

        if (!name || !admission || !grade) {
          throw new Error("Missing required fields (Name, Admission, or Grade)");
        }

        const normalizedGrade = normalizeGrade(grade); // Reuse existing helper
        const formattedContact = formatContact(contact); // Reuse existing helper
        const normalizedGender = normalizeGenderValue(gender);
        const normalizedDateOfBirth = normalizeOptionalDate(dateOfBirth);

        let student = existingStudentMap.get(admission);

        if (student) {
          // Update or create enrollment
          let enrollment = existingEnrollmentMap.get(String(student._id));
          if (enrollment) {
            await StudentEnrollment.findByIdAndUpdate(enrollment._id, { 
              grade: normalizedGrade, 
              stream: stream ? String(stream).trim() : null, 
              pathway: normalizePathway(pathway), 
              status: "active" 
            });
          } else {
            enrollment = await StudentEnrollment.create({
              studentId: student._id,
              schoolId: schoolIdToAssign,
              grade: normalizedGrade,
              pathway: normalizePathway(pathway) || null,
              stream: stream ? String(stream).trim() : null,
              academicYear: currentYear,
              status: "active"
            });
          }

          // 🚀 FIX: Sync User record and ensure it links to the enrollment ID for table display
          await User.findByIdAndUpdate(student._id, {
            name,
            contact: formattedContact,
            grade: normalizedGrade,
            pathway: normalizePathway(pathway) || null,
            gender: normalizedGender,
            dateOfBirth: normalizedDateOfBirth,
            enrollmentId: enrollment._id
          });
          
          results.successCount++;
        } else {
          // Create new student
          const rawPassword = generateRawPassword("student", admission);
          const hashedPassword = await bcrypt.hash(rawPassword, 10);

          const newStudent = await Student.create({
            name,
            role: "student",
            admission,
            grade: normalizedGrade,
            pathway: normalizePathway(pathway) || null,
            contact: formattedContact,
            gender: normalizedGender,
            dateOfBirth: normalizedDateOfBirth,
            password: hashedPassword,
            schoolId: schoolIdToAssign,
            createdBy: admin._id
          });

          const enrollment = await StudentEnrollment.create({
            studentId: newStudent._id,
            schoolId: schoolIdToAssign,
            grade: normalizedGrade,
            pathway: normalizePathway(pathway) || null,
            stream: stream ? String(stream).trim() : null,
            academicYear: currentYear,
            status: "active"
          });

          // 🚀 FIX: Attach enrollment reference to the new learner document
          newStudent.enrollmentId = enrollment._id;
          await newStudent.save();

          results.successCount++;
        }
      } catch (error) {
        results.failureCount++;
        results.errors.push({
          admission: studentData.admission || "N/A",
          name: studentData.name || "N/A",
          message: error.message
        });
      }
    }

    cache.clearByPattern(String(schoolIdToAssign)); // Invalidate cache for the school
    res.status(200).json({
      message: "Bulk import completed",
      successCount: results.successCount,
      failureCount: results.failureCount,
      errors: results.errors.length > 0 ? results.errors : undefined
    });

  } catch (err) {
    console.error("Bulk Register Users Error:", err);
    res.status(500).json({ msg: err.message });
  }
};
