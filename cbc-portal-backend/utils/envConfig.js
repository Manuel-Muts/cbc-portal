import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export function resolveEnvironmentSettings({ env = process.env.NODE_ENV || 'development', envVars = process.env } = {}) {
  const normalizedEnv = String(env || 'development').trim().toLowerCase();
  const resolvedDbSource = (envVars.DB_SOURCE || envVars.MONGO_SOURCE || (normalizedEnv === 'production' ? 'atlas' : 'local'))
    .toString()
    .trim()
    .toLowerCase();

  return {
    nodeEnv: normalizedEnv,
    dbSource: resolvedDbSource,
  };
}

export function loadEnvironmentFiles({ env = process.env.NODE_ENV || 'development' } = {}) {
  const normalizedEnv = String(env || 'development').trim().toLowerCase();
  const candidates = [
    `.env.${normalizedEnv}.local`,
    `.env.${normalizedEnv}`,
    '.env.local',
    '.env',
  ];

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(projectRoot, candidate);
    dotenv.config({ path: resolvedPath, override: false });
  }

  const settings = resolveEnvironmentSettings({
    env: normalizedEnv,
    envVars: process.env,
  });

  process.env.NODE_ENV = settings.nodeEnv;
  process.env.DB_SOURCE = process.env.DB_SOURCE || settings.dbSource;

  return settings;
}
