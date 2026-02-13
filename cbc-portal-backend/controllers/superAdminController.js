// controllers/superAdminController.js
import { User } from '../models/User.js';
import { School } from '../models/school.js';
import bcrypt from 'bcryptjs';
import { sendCredentialsEmail } from '../utils/authHelpers.js';
import Payment from '../models/Payment.js';
import Setting from '../models/Setting.js';
import LoginAttempt from '../models/LoginAttempt.js';

// ---------------------------
// CREATE NEW SCHOOL
// ---------------------------
export const createSchool = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') 
      return res.status(403).json({ msg: 'Only super-admins can create schools' });

    const { name, adminEmail, address, contactNumber } = req.body;
    if (!name || !adminEmail) 
      return res.status(400).json({ msg: 'Name and admin email are required' });

    const existingSchool = await School.findOne({ name });
    if (existingSchool) 
      return res.status(400).json({ msg: 'School already exists' });

    // Handle logo upload
    const logo = req.file ? `/uploads/school-logos/${req.file.filename}` : "";

    const school = await School.create({ 
      name, 
      adminEmail, 
      address, 
      contactNumber,
      logo 
    });

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

    await admin.deleteOne(); // <-- changed from remove()
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

    const { name, adminEmail, address, contactNumber } = req.body;

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ msg: 'School not found' });

    if (name) school.name = name;
    if (adminEmail) school.adminEmail = adminEmail;
    if (address) school.address = address;
    if (contactNumber) school.contactNumber = contactNumber;

    // Update logo if uploaded
    if (req.file) school.logo = `/uploads/school-logos/${req.file.filename}`;

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

    await school.deleteOne(); // <-- changed from remove()
    res.json({ msg: 'School deleted successfully' });
  } catch (err) {
    console.error('Delete School Error:', err);
    res.status(500).json({ msg: err.message });
  }
};

// ---------------------------
// GET SYSTEM OVERVIEW - Super Admin only
// ---------------------------
export const getSystemOverview = async (req, res) => {
  try {
    // --- Total counts ---
    const totalSchools = await School.countDocuments();
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalTeachers = await User.countDocuments({ role: 'teacher' });
    const totalStudents = await User.countDocuments({ role: 'student' });

    // --- Recent Schools ---
    const recentSchools = await School.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name adminEmail status');

    // --- Recent Admins ---
    const recentAdmins = await User.find({ role: 'admin' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email schoolId status')
      .populate('schoolId', 'name');

    const mappedRecentAdmins = recentAdmins.map(a => ({
      name: a.name,
      email: a.email,
      schoolName: a.schoolId?.name || '-',
      status: a.status || 'Active'
    }));


  // --- Users & Teachers per school ---
  // Produce counts for every school (include zeros) so frontend charts show correct bars
  const usersAgg = await User.aggregate([
    { $match: { role: { $in: ['student', 'teacher'] } } },
    { $group: {
        _id: '$schoolId',
        studentsCount: { $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] } },
        teachersCount: { $sum: { $cond: [{ $eq: ['$role', 'teacher'] }, 1, 0] } }
    } }
  ]);

  // Get all schools and map counts (defaults to 0)
  const allSchools = await School.find().select('name').lean();
  const countsBySchool = {};
  usersAgg.forEach(u => {
    if (u._id) countsBySchool[String(u._id)] = { studentsCount: u.studentsCount || 0, teachersCount: u.teachersCount || 0 };
  });

  const usersPerSchoolAgg = allSchools.map(s => ({
    schoolId: s._id,
    schoolName: s.name,
    studentsCount: (countsBySchool[String(s._id)]?.studentsCount) || 0,
    teachersCount: (countsBySchool[String(s._id)]?.teachersCount) || 0
  }));


    // --- Admins per school ---
    const adminsPerSchoolAgg = await User.aggregate([
      { $match: { role: 'admin' } },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
      { $lookup: { from: 'schools', localField: '_id', foreignField: '_id', as: 'school' } },
      { $unwind: '$school' },
      { $project: { schoolName: '$school.name', count: 1 } }
    ]);

    // --- Response ---
    res.json({
      totalSchools,
      totalAdmins,
      totalTeachers,
      totalStudents,
      recentSchools,
      recentAdmins: mappedRecentAdmins,
      usersPerSchool: usersPerSchoolAgg,
      adminsPerSchool: adminsPerSchoolAgg
    });
  } catch (err) {
    console.error('System Overview Error:', err);
    res.status(500).json({ message: 'Failed to fetch system overview' });
  }
};

// ---------------------------
// GET ANALYTICS
// ---------------------------
export const getAnalytics = async (req, res) => {
  try {
    // Monthly user registrations (last 12 months)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const registrations = await User.aggregate([
      { $match: { createdAt: { $gte: oneYearAgo } } },
      { $project: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } } },
      { $group: { _id: { year: '$year', month: '$month' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Payments per month (last 12 months)
    const payments = await Payment.aggregate([
      { $match: { createdAt: { $gte: oneYearAgo } } },
      { $project: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, amount: 1 } },
      { $group: { _id: { year: '$year', month: '$month' }, total: { $sum: '$amount' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Top schools by student count
    const topSchools = await User.aggregate([
      { $match: { role: 'student' } },
      { $group: { _id: '$schoolId', students: { $sum: 1 } } },
      { $lookup: { from: 'schools', localField: '_id', foreignField: '_id', as: 'school' } },
      { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },
      { $project: { schoolName: '$school.name', students: 1 } },
      { $sort: { students: -1 } },
      { $limit: 10 }
    ]);

    res.json({ registrations, payments, topSchools });
  } catch (err) {
    console.error('Get Analytics Error:', err);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
};

// ---------------------------
// GET LOGS (lightweight)
// ---------------------------
export const getLogs = async (req, res) => {
  try {
    const type = req.query.type || null;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.max(parseInt(req.query.limit || '10', 10), 1);
    const q = req.query.q ? String(req.query.q).trim() : '';

    // Top failed login attempts (user-level)
    const topLoginAgg = await LoginAttempt.aggregate([
      { $match: { success: false, userId: { $ne: null } } },
      { $group: { _id: '$userId', attempts: { $sum: 1 } } },
      { $sort: { attempts: -1 } },
      { $limit: 1 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'schools', localField: 'user.schoolId', foreignField: '_id', as: 'school' } },
      { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', attempts: 1, userName: '$user.name', role: '$user.role', schoolName: '$school.name' } }
    ]);

    const topLoginAttempt = topLoginAgg && topLoginAgg.length ? topLoginAgg[0] : null;

    // If a specific type is requested, return paginated results for that type
    if (type === 'payments') {
      // Aggregation to join student info and support search
      const pipeline = [
        { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } }
      ];

      if (q) {
        const regex = { $regex: q, $options: 'i' };
        pipeline.push({ $match: { $or: [ { reference: regex }, { 'student.name': regex }, { 'student.admission': regex } ] } });
      }

      pipeline.push({ $sort: { createdAt: -1 } });
      pipeline.push({ $facet: {
        metadata: [ { $count: 'total' } ],
        data: [ { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { studentId: 1, amount: 1, reference: 1, term:1, academicYear:1, createdAt:1, 'student.name': 1, 'student.admission': 1 } } ]
      } });

      const agg = await Payment.aggregate(pipeline);
      const metadata = agg[0].metadata[0] || { total: 0 };
      const data = agg[0].data || [];
      const total = metadata.total || 0;
      const totalPages = Math.ceil(total / limit);

      return res.json({ payments: data, meta: { total, page, limit, totalPages }, topLoginAttempt });
    }

    if (type === 'schools') {
      const filter = {};
      if (q) filter.$or = [ { name: { $regex: q, $options: 'i' } }, { adminEmail: { $regex: q, $options: 'i' } } ];
      const total = await School.countDocuments(filter);
      const data = await School.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('name adminEmail createdAt address');
      const totalPages = Math.ceil(total / limit);
      return res.json({ schools: data, meta: { total, page, limit, totalPages }, topLoginAttempt });
    }

    if (type === 'admins') {
      const filter = { role: 'admin' };
      if (q) filter.$or = [ { name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } } ];
      const total = await User.countDocuments(filter);
      const data = await User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('name email createdAt schoolId').populate('schoolId', 'name');
      const totalPages = Math.ceil(total / limit);
      return res.json({ admins: data, meta: { total, page, limit, totalPages }, topLoginAttempt });
    }

    // Default: return first page for all three lists plus topLoginAttempt
    const recentPayments = await Payment.aggregate([
      { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      { $project: { studentId: 1, amount: 1, reference: 1, term:1, academicYear:1, createdAt:1, 'student.name': 1, 'student.admission': 1 } }
    ]);

    const recentSchools = await School.find().sort({ createdAt: -1 }).limit(10).select('name adminEmail createdAt address');
    const recentAdmins = await User.find({ role: 'admin' }).sort({ createdAt: -1 }).limit(10).select('name email createdAt').populate('schoolId', 'name');

    return res.json({ recentPayments, recentSchools, recentAdmins, topLoginAttempt });
  } catch (err) {
    console.error('Get Logs Error:', err);
    res.status(500).json({ message: 'Failed to fetch logs' });
  }
};

// ---------------------------
// SETTINGS (simple key/value)
// ---------------------------
export const getSettings = async (req, res) => {
  try {
    const entries = await Setting.find().lean();
    const settings = {};
    entries.forEach(e => settings[e.key] = e.value);
    res.json({ settings });
  } catch (err) {
    console.error('Get Settings Error:', err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body || {};
    const keys = Object.keys(updates);
    for (const key of keys) {
      await Setting.findOneAndUpdate({ key }, { value: updates[key] }, { upsert: true });
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error('Update Settings Error:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
};


// ---------------------------
// TOGGLE SCHOOL STATUS (Super-admin)
// ---------------------------
export const toggleSchoolStatus = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") 
      return res.status(403).json({ msg: "Only super-admins can update school status" });

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ msg: "School not found" });

    school.status = school.status === "Active" ? "Suspended" : "Active";
    school.version += 1; // increment version on status change
    await school.save();

    res.json({ msg: `School ${school.status}`, school });
  } catch (err) {
    console.error("Toggle School Status Error:", err);
    res.status(500).json({ msg: "Failed to toggle school status" });
  }
};
