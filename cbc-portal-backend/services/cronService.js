import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { Material } from '../models/Material.js';
import Payment from '../models/Payment.js';
import LoginAttempt from '../models/LoginAttempt.js';
import Timetable from '../models/Timetable.js';
import { cleanOrphanedEnrollments } from '../controllers/enrollmentController.js'; // Import the cleanup function
import { School } from '../models/school.js';
import { User } from '../models/User.js';
import SMSAllocation from '../models/SMSAllocation.js';
//import { S3Client } from '@aws-sdk/client-s3';
//import { Upload } from '@aws-sdk/lib-storage';

const UPLOADS_DIR = path.join(path.resolve(), 'uploads');
const BACKUPS_DIR = path.join(path.resolve(), 'backups', 'payments');

// Configure AWS S3 Client
//const s3Client = new S3Client({
 // region: process.env.AWS_REGION,
 // credentials: {
   // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
   // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 // },
//});

export const startCronJobs = () => {
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

  // Run every day at 01:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('🕒 Starting daily payments collection backup...');

    try {
      // Ensure backup directory exists
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `payments_backup_${timestamp}.json`;
      const filePath = path.join(BACKUPS_DIR, filename);
      const s3Key = `payments/${filename}`; // S3 object key

      // Fetch all payments using lean() for better performance during export
      const payments = await Payment.find().lean();

      // Write to file (pretty-printed JSON)
      fs.writeFileSync(filePath, JSON.stringify(payments, null, 2));
      console.log(`✅ Backup created: ${filename} (${payments.length} records)`);

      // Upload to S3 if credentials are provided
      if (process.env.AWS_S3_BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION) {
        console.log('⬆️ Uploading backup to S3...');
        const fileStream = fs.createReadStream(filePath);

        const uploader = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: s3Key,
            Body: fileStream,
            ContentType: 'application/json',
          },
        });

        uploader.on('httpUploadProgress', (progress) => {
          console.log(`   S3 Upload Progress: ${Math.round(progress.loaded / progress.total * 100)}%`);
        });

        await uploader.done();
        console.log(`✅ Backup uploaded to S3: s3://${process.env.AWS_S3_BUCKET_NAME}/${s3Key}`);

        // Delete local file after successful S3 upload
        fs.unlinkSync(filePath);
        console.log(`🗑️ Local backup file deleted: ${filename}`);

      } else {
        console.warn('⚠️ AWS S3 credentials or bucket name not configured. Skipping S3 upload.');
        // If S3 upload is skipped, apply local retention logic
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const files = fs.readdirSync(BACKUPS_DIR);
        let deletedCount = 0;

        for (const file of files) {
          const fullPath = path.join(BACKUPS_DIR, file);
          const stats = fs.statSync(fullPath);

          if (stats.mtime < sevenDaysAgo) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        }

        if (deletedCount > 0) {
          console.log(`🗑️ Cleaned up ${deletedCount} old local backup files.`);
        }
      }

      console.log('✅ Daily backup job completed.');
    } catch (err) {
      console.error('❌ Error during payments backup job:', err);
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

          if (usersCount <= 0) {
            console.log(`   [${s.name}] No users with contact numbers found. Skipping allocation.`);
            continue;
          }

          // Increment school's smsCredits by usersCount
          await School.findByIdAndUpdate(s._id, { $inc: { smsCredits: usersCount } });

          // Record the allocation for auditing
          await SMSAllocation.create({
            schoolId: s._id,
            count: usersCount,
            month: monthStr,
            source: 'monthly_auto',
            allocatedBy: 'system'
          });

          console.log(`   [${s.name}] Allocated ${usersCount} SMS credits for ${monthStr}.`);
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