import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  targetRole: { 
    type: String, 
    enum: ['all', 'super_admin', 'admin', 'teacher', 'dean', 'accounts', 'student', 'classteacher'], 
    default: 'all' 
  },
  targetPage: { type: String, default: 'all' }, // e.g., 'dean-dashboard.html'
  targetGrade: { type: String, default: 'all' },
  targetStream: { type: String, default: 'all' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date }, // Optional: Auto-expire announcements
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null }
}, { timestamps: true });

// Index for faster filtering by role and status
announcementSchema.index({ targetRole: 1, isActive: 1, targetGrade: 1, targetStream: 1, schoolId: 1 });
announcementSchema.index({ schoolId: 1, isActive: 1, createdAt: -1 });
announcementSchema.index({ targetRole: 1, schoolId: 1, isActive: 1, targetPage: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
export default Announcement;