import { loadEnvironmentFiles } from '../utils/envConfig.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'production' });

const { backupMongoDatabase } = await import('../services/backupCronService.js');

try {
  const result = await backupMongoDatabase({
    collections: undefined,
    daysToKeep: 5
  });

  const sizeMB = (result.sizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`MongoDB backup completed: ${result.backupRootDir} (${sizeMB} MB)`);
} catch (error) {
  console.error('MongoDB backup failed:', error);
  process.exitCode = 1;
}
