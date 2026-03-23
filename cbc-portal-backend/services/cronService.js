import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { Material } from '../models/Material.js';

const UPLOADS_DIR = path.join(path.resolve(), 'uploads');

export const startCronJobs = () => {
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
};