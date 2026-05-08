import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { Material } from '../models/Material.js';
import Payment from '../models/Payment.js';
import { cleanOrphanedEnrollments } from '../controllers/enrollmentController.js'; // Import the cleanup function
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
  cron.schedule('0 3 * * 0', async () => {
    console.log('🕒 Running scheduled cleanup of orphaned student enrollments...');
    try {
      // Simulate a request object with a super_admin user for system-wide cleanup
      const mockReq = {
        user: {
          role: 'super_admin',
          // No schoolId needed for super_admin to clean globally
        }
      };
      // Simulate a response object for logging purposes
      const mockRes = {
        status: function(code) {
          console.log(`[Orphaned Enrollment Cleanup] Status: ${code}`);
          return this;
        },
        json: function(data) {
          console.log(`[Orphaned Enrollment Cleanup] Result:`, data);
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
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const files = fs.readdirSync(BACKUPS_DIR);
        let deletedCount = 0;

        for (const file of files) {
          const fullPath = path.join(BACKUPS_DIR, file);
          const stats = fs.statSync(fullPath);

          if (stats.mtime < thirtyDaysAgo) {
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
};