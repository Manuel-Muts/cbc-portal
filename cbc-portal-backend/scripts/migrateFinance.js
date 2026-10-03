import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironmentFiles } from '../utils/envConfig.js';
import { closePostgresPool, getPostgresPool } from '../services/postgres.js';

loadEnvironmentFiles({ env: process.env.NODE_ENV || 'production' });

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(scriptDirectory, '../migrations');

try {
  const pool = getPostgresPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await fs.readdir(migrationDirectory))
    .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  for (const name of migrationFiles) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (alreadyApplied.rowCount) {
      console.log(`Skipping applied migration ${name}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error('Finance database migration failed:', error);
  process.exitCode = 1;
} finally {
  await closePostgresPool();
}