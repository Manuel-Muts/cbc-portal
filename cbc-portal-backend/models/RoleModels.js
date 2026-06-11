// Discriminator models for Student and Teacher, extending the base User model.
// This allows us to have role-specific fields while still sharing common user fields.
import { User } from './User.js';
import mongoose from 'mongoose';

// 🎓 Student Discriminator
// Note: We don't redefine fields already in User.js, only student-specific ones.
export const Student = User.discriminator('student', new mongoose.Schema({
    // We can now make this truly required at the schema level
    admission: { type: String, required: true }, // Uniqueness handled by base compound index
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrollment" }
}));

// 🍎 Teacher Discriminator 
export const Teacher = User.discriminator('teacher', new mongoose.Schema({
    isDean: { type: Boolean, default: false },
    signatureUrl: { type: String, default: "" },
    allocations: [{
        grade: { type: String, required: true },
        stream: { type: String, default: null },
        subjects: { type: [String], default: [] }
    }]
}));
