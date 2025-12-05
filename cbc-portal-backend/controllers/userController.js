// controllers/userController.js
import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sendEmail from '../utils/sendEmail.js';
import {
  findUserByEmail,
  generateRawPassword,
  sendCredentialsEmail
} from '../utils/authHelpers.js';

// ---------------------------
// REGISTER USER (Admin Only)
// ---------------------------
export const registerUser = async (req, res) => {
  try {
    const admin = req.user;
    if (admin.role !== 'admin') return res.status(403).json({ msg: 'Only admins can register users' });

    const { name, email, role, admission } = req.body;
    if (!name || !role) return res.status(400).json({ msg: 'Name and role are required' });

    if (email && role !== 'student') {
      const existing = await findUserByEmail(email);
      if (existing) return res.status(400).json({ msg: 'Email already exists' });
    }

    if (role === 'student' && !admission) return res.status(400).json({ msg: 'Admission number required for students' });

    const rawPassword = generateRawPassword(role, admission);
    const password = await bcrypt.hash(rawPassword, 10);

    const newUser = new User({
      name,
      role,
      email: role !== 'student' ? email : undefined,
      password,
      ...(role === 'student' && { admission }),
      passwordMustChange: role === 'teacher' || role === 'classteacher'
    });

    await newUser.save();

    if (role !== 'student' && email) {
      try {
        await sendCredentialsEmail({ name, email, rawPassword });
      } catch (err) {
        return res.status(201).json({
          msg: `${role} registered, but failed to send email`,
          emailError: err.message
        });
      }
    }

    return res.status(201).json({ msg: `${role} registered successfully` });
  } catch (err) {
    console.error('Register User Error:', err);
    return res.status(500).json({ msg: err.message });
  }
};
// ---------------------------
// LOGIN USER (All Roles)
// ---------------------------
export const loginUser = async (req, res) => {
  const { role, email, firstname, password } = req.body;

  try {
    let user;

    // ---------------------------
    // STUDENT LOGIN
    // ---------------------------
    if (role === "student") {
      if (!firstname || !password) {
        return res
          .status(400)
          .json({ message: "Full name and admission number required" });
      }

      user = await User.findOne({ role: "student", admission: password });
      if (!user)
        return res.status(400).json({ message: "Invalid admission number" });

      if (user.name.toLowerCase() !== firstname.toLowerCase()) {
        return res.status(400).json({ message: "Full name does not match" });
      }
    }

    // ---------------------------
    // CLASS TEACHER LOGIN
    // ---------------------------
    else if (role === "classteacher") {
      if (!email)
        return res
          .status(400)
          .json({ message: "Email required for class teachers" });

      user = await User.findOne({ email, isClassTeacher: true });
      if (!user) return res.status(400).json({ message: "Invalid credentials" });

      if (!user.classTeacherPassword)
        return res
          .status(400)
          .json({ message: "No class teacher credentials set" });

      const isMatch = await bcrypt.compare(password, user.classTeacherPassword);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
    }

    // ---------------------------
    // TEACHER / ADMIN LOGIN
    // ---------------------------
    else {
      if (!email) return res.status(400).json({ message: "Email required" });
      user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
    }

    // ---------------------------
    // BUILD ROLES ARRAY
    // ---------------------------
    const roles = [user.role];
    if (user.isClassTeacher && user.role !== "classteacher")
      roles.push("classteacher");

    // Normalize assignedClass → classGrade
    const classGrade = user.assignedClass ? String(user.assignedClass) : null;

    // ---------------------------
    // JWT TOKEN
    // ---------------------------
    const token = jwt.sign(
      { id: user._id, roles, classGrade, isClassTeacher: user.isClassTeacher },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        roles,
        role: user.role,
        email: user.email,
        admission: user.admission,
        isClassTeacher: user.isClassTeacher,
        passwordMustChange: user.passwordMustChange,
        classGrade, // include in response
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// ---------------------------
// RESEND CREDENTIALS (Admin Only)
// ---------------------------
export const resendCredentials = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Only admins can resend credentials' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ msg: 'User not found' });

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
/* Admin-only: Users CRUD and allocations */
// ---------------------------
export const getAllUsers = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can view users' });
  }

  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateUser = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can update users' });
  }

  const { name, email, role } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role },
      { new: true }
    ).select('-password');

    res.json({ message: 'User updated', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteUser = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can delete users' });
  }

  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ASSIGN SUBJECTS TO TEACHERS (Admin Only)
// --------------------------
export const assignSubjects = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can assign subjects' });
  }

  const { teacherId, grade, subjects } = req.body;
  console.log("Incoming body:", req.body); // 👈 helpful debug

  try {
    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    if (!Array.isArray(teacher.allocations)) teacher.allocations = [];

    // ✅ Normalize subjects into an array of strings
    const normalizedSubjects = Array.isArray(subjects) ? subjects : [subjects];

    // ✅ Place your snippet here
    const gradeStr = String(grade);
    const existingAllocation = teacher.allocations.find(a => a.grade === gradeStr);

    if (existingAllocation) {
      normalizedSubjects.forEach(subj => {
        if (!existingAllocation.subjects.includes(subj)) {
          existingAllocation.subjects.push(subj);
        }
      });
      teacher.markModified('allocations'); // ensure Mongoose saves changes
    } else {
      teacher.allocations.push({ grade: gradeStr, subjects: normalizedSubjects });
    }

    console.log("Teacher after allocation:", teacher.allocations); // 👈 debug

    await teacher.save();
    res.json({ message: 'Subjects assigned successfully', teacher });
  } catch (err) {
    console.error("AssignSubjects Error:", err); // 👈 backend error log
    res.status(500).json({ error: err.message });
  }
};
// ---------------------------
// GET Subject Allocations
// ---------------------------
export const getSubjectAllocations = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' })
      .select('name allocations')
      .lean();

    console.log("Allocations from DB:", teachers); // 👈 log raw data

    teachers.forEach(t => {
      t.allocations = (t.allocations || []).map(a => ({
        grade: a.grade,
        subjects: Array.isArray(a.subjects) ? a.subjects : []
      }));
    });

    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ---------------------------
// GET Class Teacher Allocations
// ---------------------------
export const assignClassTeacher = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can assign class teachers' });
  }

  const { teacherId, assignedClass } = req.body;

  try {
    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    teacher.assignedClass = assignedClass;
    teacher.isClassTeacher = true;

    // Always regenerate a class teacher password on re-allocation
    const rawClassTeacherPassword = 'CT-' + Math.random().toString(36).slice(-8).toUpperCase();
    const hashed = await bcrypt.hash(rawClassTeacherPassword, 10);
    teacher.classTeacherPassword = hashed;

    // 👇 Force modal at next login
    teacher.passwordMustChange = true;

    await teacher.save();

    // Send the raw password in the email
    await sendEmail({
      to: teacher.email,
      subject: 'CBC Portal Class Teacher Allocation',
      text: `Hello ${teacher.name},

     You have been allocated to Grade ${assignedClass} as the class teacher.

    Login credentials (Class Teacher role):
    Email: ${teacher.email}
    Password: ${rawClassTeacherPassword}

    Please log in and change your password immediately.`,
      html: `
        <p>Hello <strong>${teacher.name}</strong>,</p>
        <p>You have been allocated to <strong>Grade ${assignedClass}</strong> as the class teacher.</p>
        <p><strong>Login credentials (Class Teacher role):</strong></p>
        <ul>
          <li>Email: ${teacher.email}</li>
          <li>Password: ${rawClassTeacherPassword}</li>
        </ul>
        <p>Please log in and change your password immediately.</p>
      `
    });

    res.json({ message: 'Class teacher assigned successfully', teacherId: teacher._id, assignedClass: teacher.assignedClass });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// GET all class teacher allocations
export const getClassTeacherAllocations = async (req, res) => {
  try {
    const classTeachers = await User.find(
      { assignedClass: { $ne: null }, role: 'teacher' }
    ).select('name email admission assignedClass isClassTeacher');

    // Shape data for frontend
    const allocations = classTeachers.map(t => ({
      teacherId: t._id.toString(),
      teacherName: t.name,
      teacherAdmission: t.admission,
      assignedClass: t.assignedClass || '',
      isClassTeacher: !!t.isClassTeacher
    }));

    res.json(allocations);
  } catch (err) {
    console.error("Error fetching allocations:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------
// GET current authenticated user
// ---------------------------
export const getUser = async (req, res) => {
  try {
    // req.user is already normalized by verifyToken
    if (!req.user) {
      return res.status(404).json({ msg: "User not found" });
    }

    return res.status(200).json(req.user);
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};
//remove subject allocation (Admin Only)
export const removeSubjectAllocation = async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can remove subject allocations' });
  }

  const { teacherId, grade } = req.body;
  try {
    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    teacher.allocations = (teacher.allocations || []).filter(a => a.grade !== grade);
    teacher.markModified('allocations');

    await teacher.save();
    res.json({ message: `Allocation for grade ${grade} removed successfully`, teacher });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// remove class teacher assignment (Admin Only)
export const removeClassTeacher = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can remove class teachers' });
  }

  const { teacherId } = req.body;

  try {
    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    // Reset class teacher fields
    teacher.assignedClass = null;
    teacher.isClassTeacher = false;
    teacher.classTeacherPassword = null;   // wipe class teacher credentials
    teacher.passwordMustChange = false;    // clear flag

    await teacher.save();

    // Optional: notify teacher by email
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
    console.error("Remove class teacher error:", err);
    res.status(500).json({ error: err.message });
  }
};

// controllers/userController.js (or your current userControllers file)
export const getStudentByAdmission = async (req, res) => {
  try {
    const { admission } = req.params;

    // Find a user who is a student with this admission number
    const student = await User.findOne({
      admission,
      role: "student"
    }).select("name admission grade");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({
      name: student.name,
      admission: student.admission,
      grade: student.grade
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

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // CLASS TEACHER SPECIAL CASE — they do NOT submit currentPassword
    if (req.user.roles.includes("classteacher") && !currentPassword) {
      const hashed = await bcrypt.hash(newPassword, 10);
      user.classTeacherPassword = hashed;
      user.passwordMustChange = false;

      await user.save();

      return res.json({
        message: "Password updated successfully",
        user,
        token: req.headers.authorization?.split(" ")[1]
      });
    }

    // NORMAL USERS → must match current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(403).json({ message: "Current password incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordMustChange = false;

    await user.save();

    // Re-issue token
    const token = jwt.sign(
      {
        id: user._id,
        roles: [user.role],
        classGrade: user.assignedClass || null,
        isClassTeacher: user.isClassTeacher
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
    res.status(500).json({ message: err.message });
  }
};
