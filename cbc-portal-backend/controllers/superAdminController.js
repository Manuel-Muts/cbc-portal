// controllers/superAdminController.js
import { User } from '../models/User.js';
import { School } from '../models/school.js';
import bcrypt from 'bcryptjs';
import { sendCredentialsEmail } from '../utils/authHelpers.js';

// ---------------------------
// CREATE NEW SCHOOL
// ---------------------------
export const createSchool = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ msg: 'Only super-admins can create schools' });

    const { name, adminEmail } = req.body;
    if (!name || !adminEmail) return res.status(400).json({ msg: 'Name and admin email are required' });

    const existingSchool = await School.findOne({ name });
    if (existingSchool) return res.status(400).json({ msg: 'School already exists' });

    const school = await School.create({ name, adminEmail });
    res.status(201).json({ msg: 'School created', school });
  } catch (err) {
    console.error('Create School Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// CREATE NEW ADMIN (SUPER-ADMIN)
// ---------------------------
export const createAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ msg: 'Only super-admins can create admins' });

    const { name, email, schoolId } = req.body;
    if (!name || !email || !schoolId) return res.status(400).json({ msg: 'All fields required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'Email already exists' });

    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ msg: 'School not found' });

    const rawPassword = Math.random().toString(36).slice(-6); // 6-character alphanumeric
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
 
    const admin = await User.create({
      name,
      role: 'admin',
      email,
      password: hashedPassword,
      schoolId: school._id,
      schoolName: school.name,
      passwordMustChange: true
    });

    await sendCredentialsEmail({ name, email, rawPassword });

    res.status(201).json({ msg: 'Admin created successfully', admin });
  } catch (err) {
    console.error('Create Admin Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// GET ALL SCHOOLS
// ---------------------------
export const getSchools = async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ msg: 'Only super-admins can view schools' });
  const schools = await School.find().sort({ createdAt: -1 });
  res.json(schools);
};

// ---------------------------
// GET ALL ADMINS
// ---------------------------
export const getAdmins = async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ msg: 'Only super-admins can view admins' });
  const admins = await User.find({ role: 'admin' }).populate('schoolId', 'name').sort({ createdAt: -1 });
  res.json(admins);
};

// ---------------------------
// GET SINGLE ADMIN
// ---------------------------
export const getAdminById = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can view admins' });

    const admin = await User.findById(req.params.id).populate('schoolId', 'name');
    if (!admin) return res.status(404).json({ msg: 'Admin not found' });

    res.json(admin);
  } catch (err) {
    console.error('Get Admin Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// UPDATE SINGLE ADMIN
// ---------------------------
export const updateAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can update admins' });

    const { name, email, schoolId } = req.body;

    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ msg: 'Admin not found' });

    if (name) admin.name = name;
    if (email) admin.email = email;
    if (schoolId) {
      const school = await School.findById(schoolId);
      if (!school) return res.status(404).json({ msg: 'School not found' });
      admin.schoolId = school._id;
      admin.schoolName = school.name;
    }

    await admin.save();
    res.json({ msg: 'Admin updated successfully', admin });
  } catch (err) {
    console.error('Update Admin Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// DELETE SINGLE ADMIN
// ---------------------------
export const deleteAdmin = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can delete admins' });

    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ msg: 'Admin not found' });

    await admin.remove();
    res.json({ msg: 'Admin deleted successfully' });
  } catch (err) {
    console.error('Delete Admin Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// GET SINGLE SCHOOL
// ---------------------------
export const getSchoolById = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can view schools' });

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ msg: 'School not found' });

    res.json(school);
  } catch (err) {
    console.error('Get School Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// UPDATE SINGLE SCHOOL
// ---------------------------
export const updateSchool = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can update schools' });

    const { name, adminEmail } = req.body;
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ msg: 'School not found' });

    if (name) school.name = name;
    if (adminEmail) school.adminEmail = adminEmail;

    await school.save();
    res.json({ msg: 'School updated successfully', school });
  } catch (err) {
    console.error('Update School Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// DELETE SINGLE SCHOOL
// ---------------------------
export const deleteSchool = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ msg: 'Only super-admins can delete schools' });

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ msg: 'School not found' });

    await school.remove();
    res.json({ msg: 'School deleted successfully' });
  } catch (err) {
    console.error('Delete School Error:', err);
    res.status(500).json({ msg: err.message });
  }
};
