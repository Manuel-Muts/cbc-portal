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
import StudentEnrollment  from '../models/StudentEnrollment.js'; // ✅ ADD THIS


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

    const { name, email, role, admission, schoolId, grade, academicYear, stream } = req.body;

    if (!name || !role)
      return res.status(400).json({ msg: "Name and role are required" });
    const allowedRoles = [
  "student",
  "teacher",
  "accounts",
  "classteacher",
  "admin",
  "super_admin"
];

if (!allowedRoles.includes(role)) {
  return res.status(400).json({ msg: "Invalid role" });
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

    // roles that MUST belong to a school
    const rolesNeedingSchool = ["admin", "accounts","teacher", "student", "parent", "classteacher"];

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

    // ----------------------------
    // EMAIL CHECK
    // ----------------------------
    if (email && role !== "student") {
      const existing = await User.findOne({ email });
      if (existing)
        return res.status(400).json({ msg: "Email already exists" });
    }

    if (role === "student" && !admission) {
      return res.status(400).json({ msg: "Admission required for students" });
    }

    // ----------------------------
    // PASSWORD GENERATION
    // ----------------------------
    const rawPassword = generateRawPassword(role, admission);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const newUser = new User({
      name,
      role,
      email: role !== "student" ? email : undefined,
      password: hashedPassword,
      ...(role === "student" && { admission }),
      passwordMustChange: ["teacher", "classteacher", "accounts"].includes(role),
      schoolId: schoolIdToAssign,
      createdBy: admin._id
    });

    await newUser.save();

    // ----------------------------
    // AUTOMATIC STUDENT ENROLLMENT
    // ----------------------------
    if (role === "student") {
      try {
        // Normalize grade to "Grade X" format
        const normalizeGrade = (grade) => {
          if (!grade) return null;
          if (!isNaN(grade)) {
            return `Grade ${grade}`;
          }
          return grade;
        };

        const enrollment = new StudentEnrollment({
          studentId: newUser._id,
          schoolId: schoolIdToAssign,
          grade: normalizeGrade(grade),
          stream: stream || null, // Add stream field (optional)
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
      user: newUser
    });

  } catch (err) {
    console.error("Register User Error:", err);
    return res.status(500).json({ msg: err.message });
  }
};


export const loginUser = async (req, res) => {
  const { role, email, fullname, admission, password } = req.body;

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

    if (!role) return res.status(400).json({ message: "Role is required" });

    let user;

    // ---------------------------
    // STUDENT/LEARNER LOGIN
    // ---------------------------
    if (role === "student" || role === "learner") {
      if (!fullname || !admission) {
        // Record attempt (no user found yet)
        await LoginAttempt.create({ identifier: admission || null, roleAttempted: role, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Full name and admission number required" });
      }

      user = await User.findOne({ role: "student", admission });
      if (!user) {
        await LoginAttempt.create({ identifier: admission, roleAttempted: role, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid admission number" });
      }

      if (user.name.toLowerCase() !== fullname.toLowerCase()) {
        await LoginAttempt.create({ userId: user._id, identifier: admission, roleAttempted: role, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Full name does not match" });
      }
    } 
    // ---------------------------
    // CLASS TEACHER LOGIN
    // ---------------------------
    else if (role === "classteacher") {
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });

      user = await User.findOne({ email, isClassTeacher: true });
      if (!user) {
        await LoginAttempt.create({ identifier: email, roleAttempted: role, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.classTeacherPassword);
      if (!isMatch) {
        await LoginAttempt.create({ userId: user._id, identifier: email, roleAttempted: role, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }
    } 
    // ---------------------------
    // TEACHER / ADMIN / SUPERADMIN LOGIN
    // ---------------------------
    else {
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });

      user = await User.findOne({ email,role });
      if (!user) {
        await LoginAttempt.create({ identifier: email, roleAttempted: role, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await LoginAttempt.create({ userId: user._id, identifier: email, roleAttempted: role, schoolId: user.schoolId, success: false, ip: req.ip, userAgent: req.headers['user-agent'] });
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
        return res.status(403).json({ message: "Your school is suspended. Contact MUTS_TECH LTD." });
      }
    }

    // ---------------------------
    // BUILD ROLES ARRAY
    // ---------------------------
    const roles = [user.role];
    if (user.isClassTeacher && user.role !== "classteacher") roles.push("classteacher");
     
    const classGrade = user.assignedClass ? String(user.assignedClass) : null;
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
          user.role === "student"
            ? (user.grade ? String(user.grade) : null)
            : user.role === "classteacher"
            ? (user.assignedClass ? String(user.assignedClass) : null)
            : null,
        classStream: user.role === "classteacher" ? classStream : null, // 🆕 Include stream in JWT
        schoolStatus: school ? school.status : null,
        schoolVersion: school ? school.version : null,
        isClassTeacher: user.isClassTeacher
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

    // ✅ SEND RESPONSE ONCE
    return res.json({ token, user });

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

    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only admins can view users' });
    }

    let query = {};

    // Admins see only users in their school if schoolId exists
    if (user.role === 'admin' && user.schoolId) {
      query.schoolId = user.schoolId;
    }

    const users = await User.find(query).select('-password');
    res.json(users);
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

    if (!Array.isArray(teacher.allocations)) teacher.allocations = [];

    const normalizedSubjects = Array.isArray(subjects) ? subjects : [subjects];
    const gradeStr = String(grade);
    const streamStr = stream ? String(stream) : null; // Optional stream

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
    const query = {};
    if (req.user.role === 'admin') {
      query.schoolId = req.user.schoolId;
    }

    const teachers = await User.find({ role: 'teacher', ...query })
      .select('name allocations schoolId')
      .lean();

    teachers.forEach(t => {
      t.allocations = (t.allocations || []).map(a => ({
        grade: a.grade,
        stream: a.stream || null,
        subjects: Array.isArray(a.subjects) ? a.subjects : []
      }));
    });

    res.json(teachers);
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
      .select('name allocations assignedClass assignedStream')
      .lean();

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Format allocations with stream information
    const allocations = (teacher.allocations || []).map(a => ({
      grade: a.grade,
      stream: a.stream || null, // Could be "W", "E", "A", etc. or null
      classLabel: a.stream ? `Grade ${a.grade}${a.stream}` : `Grade ${a.grade}`,
      subjects: Array.isArray(a.subjects) ? a.subjects : []
    }));

    // Include class teacher assignment if applicable
    const classTeacherInfo = teacher.assignedClass ? {
      grade: teacher.assignedClass,
      stream: teacher.assignedStream || null,
      classLabel: teacher.assignedStream 
        ? `Grade ${teacher.assignedClass}${teacher.assignedStream}` 
        : `Grade ${teacher.assignedClass}`
    } : null;

    res.json({
      name: teacher.name,
      subjectAllocations: allocations,
      classTeacherAssignment: classTeacherInfo
    });
  } catch (err) {
    console.error("GetMyAllocations Error:", err);
    res.status(500).json({ error: err.message });
  }
};

          // ---------------------------
          // ASSIGN CLASS TEACHER (Admin Only)
          // ---------------------------
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

    teacher.assignedClass = assignedClass;
    teacher.assignedStream = assignedStream || null; // Optional stream
    teacher.isClassTeacher = true;

    const rawClassTeacherPassword = 'CT-' + Math.random().toString(36).slice(-8).toUpperCase();
    const hashed = await bcrypt.hash(rawClassTeacherPassword, 10);
    teacher.classTeacherPassword = hashed;

    teacher.passwordMustChange = true;

    await teacher.save();

    // Email the class teacher credentials (if email exists)
    if (teacher.email) {
      const classLabel = assignedStream 
        ? `Grade ${assignedClass}${assignedStream}` 
        : `Grade ${assignedClass}`;
      
      await sendEmail({
        to: teacher.email,
        subject: 'CBC Portal Class Teacher Allocation',
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
    const query = { assignedClass: { $ne: null }, role: 'teacher' };
    if (req.user.role === 'admin') query.schoolId = req.user.schoolId;

    const classTeachers = await User.find(query).select('name email admission assignedClass assignedStream isClassTeacher');

    const allocations = classTeachers.map(t => ({
      teacherId: t._id.toString(),
      teacherName: t.name,
      teacherAdmission: t.admission,
      assignedClass: t.assignedClass || '',
      assignedStream: t.assignedStream || null,
      classLabel: t.assignedStream ? `Grade ${t.assignedClass}${t.assignedStream}` : `Grade ${t.assignedClass}`,
      isClassTeacher: !!t.isClassTeacher
    }));

    res.json(allocations);
  } catch (err) {
    console.error("GetClassTeacherAllocations Error:", err);
    res.status(500).json({ error: err.message });
  }
};


export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -classTeacherPassword")
      .lean();

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    return res.status(200).json({
      ...user,
      // normalize for frontend safety
      classGrade: user.assignedClass || user.classGrade || null
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

    const { teacherId, grade, stream } = req.body; // 🆕 Accept stream parameter
    if (!teacherId || !grade) return res.status(400).json({ message: 'teacherId and grade required' });

    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    if (String(teacher.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'You can only remove allocations for teachers in your school' });
    }

    console.log(`[DEBUG] Removing allocation - Teacher: ${teacher.name}, Grade: ${grade} (type: ${typeof grade}), Stream: ${stream} (type: ${typeof stream})`);
    console.log(`[DEBUG] Current allocations:`, JSON.stringify(teacher.allocations, null, 2));

    // 🆕 Filter by both grade and stream - use == for comparison to handle string/number conversion
    const originalLength = (teacher.allocations || []).length;
    teacher.allocations = (teacher.allocations || []).filter(a => {
      const match = String(a.grade) == String(grade) && (a.stream || null) === (stream || null);
      console.log(`[DEBUG] Checking allocation - grade: ${a.grade}, stream: ${a.stream || 'null'} - Match: ${match}`);
      return !match;
    });
    const newLength = teacher.allocations.length;

    console.log(`[DEBUG] Allocations removed: ${originalLength - newLength}, Before: ${originalLength}, After: ${newLength}`);

    teacher.markModified('allocations');

    await teacher.save();
    const gradeLabel = stream ? `Grade ${grade}${stream}` : `Grade ${grade}`;
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

    if (teacher.email) {
      await sendEmail({
        to: teacher.email,
        subject: 'CBC Portal Class Teacher Removal',
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

    const query = { admission, role: "student" };

    // ---------------------------
    // School scoping
    // ---------------------------
    if (req.user.role === 'admin' || req.user.role === 'teacher' || req.user.role === 'classteacher') {
      // Only fetch students in the same school
      query.schoolId = req.user.schoolId;
    }
    // super_admin can fetch any student → no schoolId restriction

    const student = await User.findOne(query).select("name admission schoolId enrollmentId");
    if (!student) return res.status(404).json({ message: "Student not found" });

    // Fetch current enrollment to get grade and stream
    let grade = null;
    let stream = null;
    if (student.enrollmentId) {
      const enrollment = await StudentEnrollment.findById(student.enrollmentId).select("grade stream");
      if (enrollment) {
        grade = enrollment.grade;
        stream = enrollment.stream;
      }
    }

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
          schoolVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      return res.json({
        message: "Password updated successfully",
        user,
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
        schoolVersion
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Password changed successfully",
      user,
      token
    });

  } catch (err) {
    console.error("ChangePassword Error:", err);
    res.status(500).json({ message: "Server error" });
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
    const allowed = ["name", "email", "role"];

    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        targetUser[key] = req.body[key];
      }
    });

    // schoolId safely assigned after validation
    if (actingUser.role === "super_admin" && req.body.schoolId) {
      targetUser.schoolId = req.body.schoolId;
    }

    await targetUser.save();

    res.json({ message: "User updated", user: targetUser });
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
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.status(500).json({ error: err.message });
  }
};
