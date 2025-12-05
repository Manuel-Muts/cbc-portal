// middleware/verifyToken.js
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

// Normalize roles for hierarchy checks
const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  teacher: 1,
  classteacher: 1,
  student: 0
};

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ msg: 'User not found' });

    const roles = decoded.roles || [user.role];
    const role = decoded.role || user.role;
    const schoolId = decoded.schoolId ?? (user.schoolId ? String(user.schoolId) : null);

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      admission: user.admission,
      role, // canonical role
      roles,
      isClassTeacher: !!user.isClassTeacher,
      passwordMustChange: !!user.passwordMustChange,
      classGrade: decoded.classGrade ?? (user.assignedClass ? String(user.assignedClass) : null),
      schoolId,
      // convenience function for hierarchy checks
      canCreate: (targetRole) => {
        return ROLE_HIERARCHY[role] > ROLE_HIERARCHY[targetRole];
      },
      isSuperAdmin: role === 'super_admin',
      isSchoolAdmin: role === 'admin'
    };

    if (process.env.DEBUG === "true") {
      console.log("🔑 verifyToken attached user:", req.user);
    }

    next();
  } catch (err) {
    console.error('VerifyToken Error:', err);
    res.status(401).json({ msg: 'Invalid or expired token' });
  }
};

export default verifyToken;
