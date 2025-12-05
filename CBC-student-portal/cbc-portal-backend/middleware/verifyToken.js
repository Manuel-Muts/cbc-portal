import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

// Middleware to verify JWT and attach user to request
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from DB
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ msg: 'User not found' });
    }

    // Prefer classGrade from JWT payload, fallback to DB assignedClass
    const classGrade =
      decoded.classGrade ??
      (user.assignedClass ? String(user.assignedClass) : null);

    // Attach user + roles to request
   req.user = {
  id: user._id.toString(),   // 👈 ensure string, not ObjectId
  name: user.name,
  email: user.email,
  admission: user.admission,
  role: user.role,
  roles: decoded.roles || [],
  isClassTeacher: !!user.isClassTeacher,
  passwordMustChange: !!user.passwordMustChange,
  classGrade
};

    // Debug logging (only in development)
    if (process.env.DEBUG === "true") {
      console.log("🔑 verifyToken attached user:", {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        roles: req.user.roles,
        isClassTeacher: req.user.isClassTeacher,
        classGrade: req.user.classGrade
      });
    }

    next();
  } catch (err) {
    console.error('VerifyToken Error:', err);
    res.status(401).json({ msg: 'Invalid or expired token' });
  }
};

export default verifyToken; 