import mongoose from 'mongoose';
import Announcement from '../models/Announcement.js';
import { User } from '../models/User.js';
import { School } from '../models/school.js';
import sendSMS, { countSMSSegments } from '../utils/sendSMS.js';
import cacheManager from '../utils/cacheManager.js';
import StudentEnrollment from '../models/StudentEnrollment.js';
import SMSLog from '../models/SMSLog.js';

// Create a new announcement (Super Admin / Admin only)
export const createAnnouncement = async (req, res) => {
  try {
    const { title, message, targetRole, targetPage, expiresAt, sendAsSms, targetGrade, targetStream } = req.body; // 🆕 Add expiresAt

    // 🆕 Safeguard: Prevent duplicate broadcast/announcement within 2 minutes
    const lockKey = cacheManager.generateKey(`announcement_lock:${req.user.id}`, { 
      message, 
      targetRole: targetRole || 'all', 
      targetGrade: targetGrade || 'all',
      sendAsSms 
    });
    if (cacheManager.get(lockKey)) {
      return res.status(429).json({ message: "Duplicate request detected. Please wait 2 minutes before sending the same message again." });
    }
    
    // ---------------------------
    // SMS BROADCAST PATHWAY
    // ---------------------------
    if (sendAsSms === true) {
      const query = { schoolId: new mongoose.Types.ObjectId(req.user.schoolId), contact: { $ne: null } };
      if (targetRole && targetRole !== 'all') query.role = targetRole;

      const currentYear = new Date().getFullYear();

      // 🆕 Apply filters if grade/stream is specified (Handles 'student' and 'all' roles)
      if ((targetRole === 'student' || targetRole === 'all') && ((targetGrade && targetGrade !== 'all') || (targetStream && targetStream !== 'all'))) {
        const enrollmentFilter = {
          schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
          academicYear: currentYear,
          status: 'active'
        };
        
        if (targetGrade && targetGrade !== 'all') enrollmentFilter.grade = targetGrade;
        if (targetStream && targetStream !== 'all') enrollmentFilter.stream = targetStream;

        const enrollments = await StudentEnrollment.find(enrollmentFilter).select('studentId').lean();
        const studentIds = enrollments.map(e => e.studentId);
        
        if (studentIds.length === 0) {
          return res.status(404).json({ message: `No active learners found for ${targetGrade} in the ${currentYear} academic year.` });
        }

        // If targeting 'all', we keep teachers but filter students by ID
        if (targetRole === 'all') {
          query.$or = [
            { role: 'teacher' },
            { _id: { $in: studentIds } }
          ];
        } else {
          query._id = { $in: studentIds };
        }
      }

      const users = await User.find(query).select('contact name role');
      const recipients = users.map(u => ({ contact: u.contact, name: u.name, role: u.role })).filter(r => r.contact);
      
      console.log(`[SMS Broadcast] Found ${recipients.length} recipients.`);

      if (recipients.length > 0) {
        const smsText = String(message).trim();
        const segments = countSMSSegments(smsText);

        // 🆕 Safeguard: Prevent long SMS that cost beyond 1 credit
        if (segments > 1) {
          return res.status(400).json({ 
            message: `SMS failed: Message is too long (${smsText.length} chars). To keep costs at 1 credit per recipient, please shorten your message to under 160 characters.`
          });
        }

        const totalRequiredCredits = recipients.length * segments;

        // 🆕 Credit Check
        const school = await School.findById(req.user.schoolId).select('smsCredits');
        if (!school || (school.smsCredits || 0) < totalRequiredCredits) {
          return res.status(402).json({ 
            message: `Insufficient credit:Balance ${school?.smsCredits || 0}`
          });
        }

        let isCancelled = false;
        req.on('close', () => { isCancelled = true; });

        // 🆕 Batching logic for large recipient lists
        const BATCH_SIZE = 50;
        let actualSentCount = 0;
        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
          if (isCancelled) break;

          const batch = recipients.slice(i, i + BATCH_SIZE);
          const batchLogs = await Promise.all(batch.map(async (r) => {
            const response = await sendSMS(r.contact, smsText);
            
            // 🆕 Only count as success if at least one recipient status is 'Success' or 'Sent'
            const isActualSuccess = response?.SMSMessageData?.Recipients?.some(recp => ['Success', 'Sent'].includes(recp.status));
            if (isActualSuccess) actualSentCount++;

            return {
              schoolId: req.user.schoolId,
              senderId: req.user.id,
              recipient: r.contact,
              studentName: r.role === 'student' ? r.name : `Staff: ${r.name}`,
              content: smsText,
              status: isActualSuccess ? "Sent" : "Failed",
              providerResponse: response
            };
          }));

          await SMSLog.insertMany(batchLogs);

          // 🆕 Add a short delay between batches to reduce network spikes
          if (i + BATCH_SIZE < recipients.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // 🆕 Deduct accurate credits based on segments
        const creditsToDeduct = actualSentCount * segments;
        if (creditsToDeduct > 0) {
          await School.findByIdAndUpdate(req.user.schoolId, { $inc: { smsCredits: -creditsToDeduct } });
        }
        
        // 🆕 Invalidate school profile cache to reflect new balance immediately
        cacheManager.clearPattern(String(req.user.schoolId));
        console.log(`[SMS Broadcast] Finished. AT accepted ${actualSentCount}/${recipients.length} messages.`);

        // Set the lock only after successful validation and broadcast initiation
        cacheManager.set(lockKey, true, 120);
        
        return res.status(201).json({ 
          message: `SMS Broadcast complete. ${actualSentCount} messages sent.`,
          creditsUsed: creditsToDeduct
        });
      } else {
        return res.status(404).json({ message: 'No recipients with valid contact numbers found for this broadcast.' });
      }
    }

    // ---------------------------
    // DASHBOARD ANNOUNCEMENT PATHWAY
    // ---------------------------
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Announcement title is required." });
    }

    const announcement = new Announcement({
      title,
      message, 
      targetRole: targetRole || 'all',
      targetPage: targetPage || 'all',
      targetGrade: targetGrade || 'all',
      targetStream: targetStream || 'all',
      expiresAt: expiresAt || null, // 🆕 Save expiresAt
      createdBy: req.user.id,
      // Super Admin can post global announcements (schoolId: null) or to specific schools
      schoolId: (req.user.role === 'super_admin') ? (req.body.schoolId || null) : req.user.schoolId
    });

    await announcement.save();
    cacheManager.set(lockKey, true, 120);
    res.status(201).json({ message: 'Announcement posted successfully', announcement });
  } catch (err) {
    res.status(500).json({ message: 'Failed to process request', error: err.message });
  }
};

// Get all announcements (Super Admin only management)
export const getAllAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find().populate('schoolId', 'name').sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching announcements' });
  }
};

// Get active announcements for the current user
export const getActiveAnnouncements = async (req, res) => {
  try {
    const userRole = req.user.role; // Primary role
    const userRoles = req.user.roles || [userRole]; // Array of all roles (e.g. teacher, classteacher)
    const userGrade = req.user.classGrade; // Extracted from JWT
    const userStream = req.user.classStream;
    const schoolId = req.user.schoolId;
    
    // Students get info via parent SMS; don't show dashboard announcements
    if (userRole === 'student' || userRole === 'learner') {
      return res.json([]);
    }

    const now = new Date();
    const expirationCondition = {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    };

    // Filter for announcements that are active AND not expired AND (targeted to this school OR system-wide global)
    let query = {
      isActive: true,
      $or: [
        { schoolId: schoolId },
        { schoolId: null }
      ]
    };

    query.$and = [expirationCondition];

    // Super admins see everything for oversight
    if (userRole !== 'super_admin') {
      const roleConditions = [
        { targetRole: 'all' }
      ];
      
      // Add all roles the user possesses to the query
      userRoles.forEach(r => roleConditions.push({ targetRole: r }));

      // Special check for Deans
      if (req.user.isDean) {
        roleConditions.push({ targetRole: 'dean' });
      }

      query.$and = [
        { $or: roleConditions },
        { $or: [
          { targetGrade: 'all' },
          { targetGrade: userGrade },
          { targetGrade: `Grade ${userGrade}` }
        ]}
      ];

      query.$and.push({ $or: [
        { targetStream: 'all' },
        { targetStream: userStream }
      ]});
    }

    const announcements = await Announcement.find(query).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching announcements' });
  }
};

// 🆕 Update an existing announcement
export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, targetRole, targetPage, expiresAt, schoolId, targetGrade, targetStream } = req.body;

    const announcement = await Announcement.findById(id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });

    // Security: Admins can only edit their own school's announcements
    if (req.user.role === 'admin' && String(announcement.schoolId) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Unauthorized to edit this announcement' });
    }

    // Update fields
    if (title !== undefined) announcement.title = title;
    if (message !== undefined) announcement.message = message;
    if (targetRole !== undefined) announcement.targetRole = targetRole;
    if (targetPage !== undefined) announcement.targetPage = targetPage;
    if (expiresAt !== undefined) announcement.expiresAt = expiresAt;
    if (targetGrade !== undefined) announcement.targetGrade = targetGrade;
    if (targetStream !== undefined) announcement.targetStream = targetStream;
    
    // Only Super Admin can change the target school
    if (req.user.role === 'super_admin' && schoolId !== undefined) {
      announcement.schoolId = schoolId || null;
    }

    await announcement.save();
    res.json({ message: 'Announcement updated successfully', announcement });
  } catch (err) {
    res.status(500).json({ message: 'Error updating announcement', error: err.message });
  }
};

// Toggle active status or delete (Admin only)
export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);
    
    if (!announcement) return res.status(404).json({ message: 'Not found' });
    
    // Enforce school boundaries if regular Admin
    if (req.user.role === 'admin' && String(announcement.createdBy) !== String(req.user.id)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    await announcement.deleteOne();
    res.json({ message: 'Announcement removed' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting announcement' });
  }
};

/**
 * 🆕 Fetches a summary of SMS activity (Success counts + Detailed Failures)
 */
export const getSMSLogsSummary = async (req, res) => {
  try {
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    
    // 1. Get counts for the last 30 days
    const successCount = await SMSLog.countDocuments({ schoolId, status: "Sent" });
    const failureCount = await SMSLog.countDocuments({ schoolId, status: "Failed" });

    // 2. Fetch the most recent failures for action
    const recentFailures = await SMSLog.find({ schoolId, status: "Failed" })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("recipient studentName content createdAt providerResponse")
      .lean();

    return res.json({
      summary: { sent: successCount, failed: failureCount },
      recentFailures
    });
  } catch (err) {
    console.error("getSMSLogsSummary error:", err);
    return res.status(500).json({ message: "Failed to fetch SMS history summary" });
  }
};

/**
 * 🆕 Retries sending failed SMS messages for a school
 */
export const retryFailedSMS = async (req, res) => {
  try {
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);

    // Safeguard: Prevent duplicate retry within 2 minutes
    const lockKey = cacheManager.generateKey(`sms_retry_lock:${req.user.schoolId}`, {});
    if (cacheManager.get(lockKey)) {
      return res.status(429).json({ message: "A retry operation is already in progress or was recently completed. Please wait 2 minutes." });
    }

    // 1. Find all failed logs for this school
    const failedLogs = await SMSLog.find({ schoolId, status: "Failed" });

    if (!failedLogs.length) {
      return res.status(404).json({ message: "No failed SMS records found to retry." });
    }

    // 2. Initial Credit Check
    const school = await School.findById(schoolId).select('smsCredits');
    if (!school) return res.status(404).json({ message: "School not found" });

    if ((school.smsCredits || 0) <= 0) {
      return res.status(402).json({ message: `Insufficient credits to retry. Balance: ${school.smsCredits || 0}` });
    }

    // Set lock
    cacheManager.set(lockKey, true, 120);

    let successCount = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < failedLogs.length; i += BATCH_SIZE) {
      const batch = failedLogs.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (log) => {
        const segments = countSMSSegments(log.content);
        
        // Dynamic Credit Check (Fetch fresh balance inside loop)
        const currentSchool = await School.findById(schoolId).select('smsCredits');
        if (!currentSchool || (currentSchool.smsCredits || 0) < segments) return;

        const response = await sendSMS(log.recipient, log.content);
        
        // Only count as success if status is 'Success' or 'Sent' (matching AT response structure)
        const isActualSuccess = response?.SMSMessageData?.Recipients?.some(recp => ['Success', 'Sent'].includes(recp.status));

        if (isActualSuccess) {
          successCount++;
          await SMSLog.findByIdAndUpdate(log._id, {
            status: "Sent",
            providerResponse: response
          });
          await School.findByIdAndUpdate(schoolId, { $inc: { smsCredits: -segments } });
        } else {
          await SMSLog.findByIdAndUpdate(log._id, { providerResponse: response });
        }
      }));

      if (i + BATCH_SIZE < failedLogs.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (successCount > 0) {
      cacheManager.clearPattern(String(schoolId));
    }

    return res.json({
      message: `Retry complete. Successfully sent ${successCount} of ${failedLogs.length} failed messages.`,
      successCount
    });
  } catch (err) {
    console.error("retryFailedSMS error:", err);
    return res.status(500).json({ message: "Failed to retry SMS broadcast" });
  }
};