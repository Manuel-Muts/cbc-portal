import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const BACKUPS_DIR = path.join(path.resolve(), 'backups', 'mongodb');
const DEFAULT_DB_BACKUP_COLLECTIONS = ['marks', 'studentenrollments', 'users', 'schools', 'payments'];
export const BACKUP_COLLECTION_OPTIONS = DEFAULT_DB_BACKUP_COLLECTIONS;
const execFileAsync = promisify(execFile);
const MONGODUMP_COMMAND = process.env.MONGODUMP_PATH || 'mongodump';

const hasBackupFiles = (folderPath) => {
  if (!fs.existsSync(folderPath)) return false;

  return fs.readdirSync(folderPath, { withFileTypes: true }).some((entry) => {
    const entryPath = path.join(folderPath, entry.name);
    return entry.isFile() || (entry.isDirectory() && hasBackupFiles(entryPath));
  });
};

export const listMongoBackupFolders = () => {
  if (!fs.existsSync(BACKUPS_DIR)) return [];

  return fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderPath = path.join(BACKUPS_DIR, entry.name);
      const stats = fs.statSync(folderPath);
      return { name: entry.name, createdAt: stats.mtime.toISOString() };
    })
    .filter(({ name }) => hasBackupFiles(path.join(BACKUPS_DIR, name)))
    .sort((left, right) => right.name.localeCompare(left.name));
};

export const getMongoDatabaseName = () => {
  const mongoUri = process.env.MONGO_LOCAL || process.env.MONGO_ATLAS || 'mongodb://127.0.0.1:27017/cbc_portal';

  try {
    const parsed = new URL(mongoUri);
    const dbName = parsed.pathname.replace(/^\/+/, '').split('/')[0];
    return dbName || 'cbc_portal';
  } catch (err) {
    return 'cbc_portal';
  }
};

export const runMongoDumpForCollection = async (databaseUri, collectionName, backupRootDir) => {
  const mongoDbName = getMongoDatabaseName();

  await execFileAsync(MONGODUMP_COMMAND, [
    '--uri', databaseUri,
    '--db', mongoDbName,
    '--collection', collectionName,
    '--out', backupRootDir
  ]);
};

export const runMongoFullDatabaseDump = async (databaseUri, backupRootDir) => {
  const mongoDbName = getMongoDatabaseName();

  await execFileAsync(MONGODUMP_COMMAND, [
    '--uri', databaseUri,
    '--db', mongoDbName,
    '--out', backupRootDir
  ]);
};

const pruneOldMongoBackups = async ({ daysToKeep = 5 } = {}) => {
  if (!fs.existsSync(BACKUPS_DIR)) return { deletedCount: 0, cutoffDate: null };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const files = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
  let deletedCount = 0;

  for (const file of files) {
    if (!file.isDirectory()) continue;

    const fullPath = path.join(BACKUPS_DIR, file.name);
    const stats = fs.statSync(fullPath);

    if (stats.mtime < cutoffDate) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      deletedCount += 1;
    }
  }

  return { deletedCount, cutoffDate };
};

export const backupMongoDatabase = async ({
  collections = DEFAULT_DB_BACKUP_COLLECTIONS,
  daysToKeep = 5
} = {}) => {
  const mongoUri = process.env.MONGO_LOCAL || process.env.MONGO_ATLAS;

  if (!mongoUri) {
    throw new Error('MongoDB connection string is not configured. Set MONGO_LOCAL or MONGO_ATLAS.');
  }

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRootDir = path.join(BACKUPS_DIR, `db_backup_${timestamp}`);
  fs.mkdirSync(backupRootDir, { recursive: true });

  const selectedCollections = Array.isArray(collections) && collections.length > 0 ? collections : null;

  try {
    if (!selectedCollections) {
      console.log('📦 Backing up full MongoDB database...');
      await runMongoFullDatabaseDump(mongoUri, backupRootDir);
    } else {
      for (const collectionName of selectedCollections) {
        console.log(`📦 Backing up collection: ${collectionName}`);
        await runMongoDumpForCollection(mongoUri, collectionName, backupRootDir);
      }
    }
  } catch (error) {
    fs.rmSync(backupRootDir, { recursive: true, force: true });
    throw error;
  }

  const pruneResult = await pruneOldMongoBackups({ daysToKeep });
  if (pruneResult.deletedCount > 0) {
    console.log(`🗑️ Cleaned up ${pruneResult.deletedCount} old MongoDB backup folders older than ${pruneResult.cutoffDate.toISOString()}`);
  }

  return { backupRootDir, selectedCollections };
};

export const startBackupCronJobs = () => {
  cron.schedule('0 1 * * *', async () => {
    console.log('🕒 Starting MongoDB backup job for selected collections...');

    try {
      const result = await backupMongoDatabase({
        collections: DEFAULT_DB_BACKUP_COLLECTIONS,
        daysToKeep: 5
      });

      console.log(`✅ MongoDB backup completed: ${result.backupRootDir}`);
    } catch (err) {
      console.error('❌ Error during MongoDB backup job:', err);
    }
  });
};
