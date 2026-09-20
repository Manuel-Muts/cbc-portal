import fs from 'fs';
import path from 'path';
import { execFileSync } from 'node:child_process';

const backupBaseDir = path.join(path.resolve(), 'backups', 'mongodb');
const mongoUri = process.env.MONGO_LOCAL || process.env.MONGO_ATLAS;
const restoreMode = (process.env.RESTORE_MODE || process.argv[2] || 'collections').toLowerCase();
const requestedBackupFolder = process.env.BACKUP_FOLDER || process.argv[3];
const MONGORESTORE_COMMAND = process.env.MONGORESTORE_PATH || 'mongorestore';

if (!mongoUri) {
  console.error('❌ No MongoDB URI found. Set MONGO_LOCAL or MONGO_ATLAS in your environment.');
  process.exit(1);
}

if (!fs.existsSync(backupBaseDir)) {
  console.error(`❌ No backup directory found at: ${backupBaseDir}`);
  process.exit(1);
}

const folders = fs
  .readdirSync(backupBaseDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .reverse();

if (folders.length === 0) {
  console.error('❌ No MongoDB backup folders found.');
  process.exit(1);
}

const backupFolder = requestedBackupFolder || folders[0];
if (!folders.includes(backupFolder)) {
  console.error(`❌ Backup folder not found: ${backupFolder}`);
  process.exit(1);
}

const latestBackupDir = path.join(backupBaseDir, backupFolder);
const dbName = (() => {
  try {
    const parsed = new URL(mongoUri);
    return parsed.pathname.replace(/^\/+/, '').split('/')[0] || 'cbc_portal';
  } catch (err) {
    return 'cbc_portal';
  }
})();

const defaultCollections = ['marks', 'studentenrollments', 'users', 'schools', 'payments'];

console.log(`🔄 Restoring latest backup from: ${latestBackupDir}`);
console.log(`📦 Database: ${dbName}`);
console.log(`🧭 Mode: ${restoreMode}`);

if (restoreMode === 'full') {
  execFileSync(MONGORESTORE_COMMAND, [
    '--uri', mongoUri,
    '--db', dbName,
    latestBackupDir
  ], { stdio: 'inherit' });

  console.log('✅ Full MongoDB restore completed successfully.');
  process.exit(0);
}

const restoreCollections = defaultCollections;

for (const collectionName of restoreCollections) {
  const collectionDir = path.join(latestBackupDir, dbName, collectionName);

  if (!fs.existsSync(collectionDir)) {
    console.warn(`⚠️ Collection folder not found for restore: ${collectionName} at ${collectionDir}`);
    continue;
  }

  console.log(`⬇️ Restoring collection: ${collectionName}`);
  execFileSync(MONGORESTORE_COMMAND, [
    '--uri', mongoUri,
    '--db', dbName,
    '--collection', collectionName,
    collectionDir
  ], { stdio: 'inherit' });
}

console.log('✅ Collection-specific MongoDB restore completed successfully.');
