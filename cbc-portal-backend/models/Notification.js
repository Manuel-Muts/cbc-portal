import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  type: { type: String, enum: ['marks_edit_reopened', 'subject_assigned', 'class_reassigned'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
