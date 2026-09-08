import Notification from '../models/Notification.js';

export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.user.id,
      schoolId: req.user.schoolId
    }).sort({ createdAt: -1 }).limit(10).lean();
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to load notifications.' });
  }
};

export const markMyNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user.id, schoolId: req.user.schoolId, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
};

export const createNotificationsForUsers = async ({ userIds, schoolId, type, title, message }) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  await Notification.insertMany(userIds.map(recipientId => ({ recipientId, schoolId, type, title, message })));
};
