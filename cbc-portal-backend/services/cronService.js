import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { Material } from '../models/Material.js';
import LoginAttempt from '../models/LoginAttempt.js';
import Timetable from '../models/Timetable.js';
import { cleanOrphanedEnrollments } from '../controllers/enrollmentController.js'; // Import the cleanup function
import { School } from '../models/school.js';
import { User } from '../models/User.js';
import SMSAllocation from '../models/SMSAllocation.js';
import { applyMonthlySmsAllocation } from '../utils/smsBalance.js';
import { refreshAllDashboardSummaries, pruneOldDashboardSummaries } from './dashboardSummaryService.js';

const UPLOADS_DIR = path.join(path.resolve(), 'uploads');

export const startCronJobs = () => {
  // 🆕 Cron Job: Refresh dashboard summary cache every 15 minutes.
  // This precomputes compact values so dashboard requests return fast payloads.
  cron.schedule('*/15 * * * *', async () => {
    console.log('🕒 [Cron Job] Refreshing dashboard summaries...');
    try {
      const summaries = await refreshAllDashboardSummaries();
      console.log(`✅ [Cron Job] Refreshed ${summaries.length} dashboard summaries.`);
    } catch (err) {
      console.error('❌ Error during dashboard summary refresh job:', err);
    }
  });

  // Keep only a short rolling history of dashboard snapshots.
  // Runs every Sunday at midnight.
  cron.schedule('0 0 * * 0', async () => {
    console.log('🕒 [Cron Job] Pruning old dashboard summary snapshots...');
    try {
      const result = await pruneOldDashboardSummaries({ daysToKeep: 7 });
      console.log(`✅ [Cron Job] Deleted ${result.deletedCount} old dashboard summary snapshots older than ${result.cutoffDate.toISOString()}`);
    } catch (err) {
      console.error('❌ Error during dashboard summary pruning job:', err);
    }
  });

  // 🆕 Cron Job: Clean up orphaned StudentEnrollment records weekly
  // Runs every Sunday at 3:00 AM (0 3 * * 0)
  // This ensures that "Unknown Learner" ghost records are removed from the DB automatically.
  cron.schedule('0 3 * * 0', async () => {
    console.log('🕒 [Cron Job] Starting weekly cleanup of orphaned student enrollments...');
    try {
      // Simulate a request object with a super_admin user for system-wide cleanup
      const mockReq = {
        user: {
          id: 'system',
          role: 'super_admin',
          // No schoolId needed for super_admin to clean globally
        }
      };
      // Simulate a response object for logging purposes
      const mockRes = {
        status: function(code) {
          console.log(`🕒 [Cron Job] Cleanup Status: ${code}`);
          return this;
        },
        json: function(data) {
          console.log(`🕒 [Cron Job] Cleanup Result:`, JSON.stringify(data));
        }
      };
      await cleanOrphanedEnrollments(mockReq, mockRes);
    } catch (err) {
      console.error('❌ Error during orphaned enrollment cleanup job:', err);
    }
  });

  // Run every day at midnight (00:00)
  // Format: Minute Hour DayOfMonth Month DayOfWeek
  cron.schedule('0 0 * * *', async () => {
    console.log('🕒 Running scheduled cleanup of expired materials...');
    
    try {
      // Calculate date 1 year ago
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      // Find materials older than 1 year
      const expiredMaterials = await Material.find({ createdAt: { $lt: oneYearAgo } });
      
      if (expiredMaterials.length === 0) {
        console.log('✅ No expired materials found.');
        return;
      }

      console.log(`🗑️ Found ${expiredMaterials.length} expired materials. Deleting...`);

      for (const material of expiredMaterials) {
        try {
          // Delete file from filesystem
          if (material.file) {
            const filename = path.basename(material.file);
            const filePath = path.join(UPLOADS_DIR, filename);
            
            if (fs.existsSync(filePath)) {
              try {
                fs.unlinkSync(filePath);
                console.log(`   Deleted file: ${filename}`);
              } catch (fileErr) {
                console.error(`   ⚠️ Failed to delete file ${filename}:`, fileErr.message);
                continue; // Skip database record deletion if file deletion fails
              }
            }
          }
          
          // Delete record from database
          await material.deleteOne();
        } catch (err) {
          console.error(`   ❌ Error deleting material ${material._id}:`, err.message);
        }
      }
      
      console.log('✅ Cleanup completed.');
    } catch (err) {
      console.error('❌ Error during cleanup job:', err);
    }
  });

  // 🆕 Cron Job: Explicit cleanup of login attempts
  // This acts as a safety net for M0 clusters where TTL indexes can be unreliable.
  // Runs every day at 2:00 AM (0 2 * * *)
  cron.schedule('0 2 * * *', async () => {
    console.log('🕒 [Cleanup Job] Starting daily removal of login attempts older than 7 days...');
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const result = await LoginAttempt.deleteMany({ createdAt: { $lt: oneWeekAgo } });
      console.log(`✅ [Cleanup Job] Deleted ${result.deletedCount} login attempt records.`);
      
      // 💡 Future Expansion: Add cleanup for other logging collections (e.g. AuditLogs) here.
      // const thirtyDaysAgo = new Date();
      // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // await ActivityLog.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
    } catch (err) {
      console.error('❌ Error during login attempts cleanup job:', err);
    }
  });

  // 🆕 Cron Job: Clear saved timetables once a term is over
  // Runs at 4:00 AM on the 1st of January, May, and September.
  cron.schedule('0 4 1 1,5,9 *', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed (Jan=1, May=5, Sep=9)

    let targetTerm = "";
    let targetYear = year;

    // Determine the term that just ended
    if (month === 1) { targetTerm = "Term 3"; targetYear = year - 1; }
    else if (month === 5) { targetTerm = "Term 1"; targetYear = year; }
    else if (month === 9) { targetTerm = "Term 2"; targetYear = year; }

    if (targetTerm) {
      console.log(`🕒 [Cleanup Job] Term end reached. Clearing timetables for ${targetTerm} ${targetYear}...`);
      try {
        const result = await Timetable.deleteMany({ term: targetTerm, academicYear: targetYear });
        console.log(`✅ [Cleanup Job] Deleted ${result.deletedCount} old timetable records.`);
      } catch (err) {
        console.error('❌ Error during timetables cleanup job:', err);
      }
    }
  });

  // 🆕 Cron Job: Monthly automatic SMS allocation
  // Runs at 00:00 on the 1st of every month (server timezone)
  // A new month starts with a fresh allocation; previous balance does not carry over.
  cron.schedule('0 0 1 * *', async () => {
    console.log('🕒 [Cron Job] Starting monthly SMS allocation to schools...');
    try {
      const schools = await School.find().select('name');
      const monthStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();

      for (const s of schools) {
        try {
          // Count users in the school that have contact numbers (likely recipients)
          const usersCount = await User.countDocuments({ schoolId: s._id, contact: { $ne: null }, role: { $ne: 'super_admin' } });
          const currentSchool = await School.findById(s._id).select('smsCredits');
          const currentBalance = Number(currentSchool?.smsCredits || 0);

          if (usersCount <= 0) {
            console.log(`   [${s.name}] No users with contact numbers found. Skipping allocation.`);
            continue;
          }

          const nextBalance = applyMonthlySmsAllocation(currentBalance, usersCount);

          await School.findByIdAndUpdate(s._id, { smsCredits: nextBalance });

          // Record the allocation for auditing
          await SMSAllocation.create({
            schoolId: s._id,
            count: usersCount,
            month: monthStr,
            source: 'monthly_auto',
            allocatedBy: 'system'
          });

          console.log(`   [${s.name}] Updated SMS balance to ${nextBalance} credits for ${monthStr}.`);
        } catch (innerErr) {
          console.error(`   ❌ Allocation error for school ${s._id}:`, innerErr.message || innerErr);
        }
      }

      console.log('✅ Monthly SMS allocation job completed.');
    } catch (err) {
      console.error('❌ Error during monthly SMS allocation job:', err);
    }
  });
};