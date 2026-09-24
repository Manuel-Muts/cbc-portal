import { loadEnvironmentFiles } from '../utils/envConfig.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'production' });

const { backupMongoDatabase } = await import('../services/backupCronService.js');

try {
  const result = await backupMongoDatabase({
    collections: undefined,
    daysToKeep: 5
  });

  console.log(`MongoDB backup completed: ${result.backupRootDir}`);
} catch (error) {
  console.error('MongoDB backup failed:', error);
  process.exitCode = 1;
}
