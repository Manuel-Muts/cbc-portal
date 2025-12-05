import { User } from '../models/User.js';
import sendEmail from './sendEmail.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ------------------------------------
// FIND USER BY EMAIL
// ------------------------------------
export const findUserByEmail = async (email) => {
  return await User.findOne({ email });
};

// ------------------------------------
// VALIDATE PASSWORD
// ------------------------------------
export const validatePassword = async (input, hashed) => {
  return bcrypt.compare(input, hashed);
};

// ------------------------------------
// LOGIN SUCCESS RESPONSE
// ------------------------------------
export const sendLoginSuccess = (res, user) => {
  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    msg: 'Login successful',
    token,
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      admissionNumber: user.admissionNumber,
    },
  });
};

// ------------------------------------
// GENERATE RAW PASSWORD BASED ON ROLE
// ------------------------------------
export const generateRawPassword = (role, admissionNumber) => {
  switch (role) {
    case 'student':
      return admissionNumber.trim();
    case 'teacher':
      return 'T-' + Math.random().toString(36).slice(-8).toUpperCase();
    case 'classTeacher':
      return 'CT-' + Math.random().toString(36).slice(-8).toUpperCase();
    case 'admin':
      return 'ADMIN-' + Math.random().toString(36).slice(-8).toUpperCase();
    default:
      throw new Error('Invalid role');
  }
};

// ------------------------------------
// SEND CREDENTIAL EMAIL
// ------------------------------------
export const sendCredentialsEmail = async ({ name, email, rawPassword }) => {
  await sendEmail({
    to: email,
    subject: 'Your CBC Portal Login Credentials',
    text: `Hello ${name},\n\nYour login credentials:\nEmail: ${email}\nPassword: ${rawPassword}\n\nPlease log in and change your password immediately.`,
    html: `
      <p>Hello <strong>${name}</strong>,</p>
      <p>Your login credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${rawPassword}</li>
      </ul>
      <p>Please log in and change your password immediately.</p>
    `,
  });

  console.log(`✅ Credentials email sent successfully to ${email}`);
};