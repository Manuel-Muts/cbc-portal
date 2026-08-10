import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function normalizeEnvValue(value, fallback = 'development') {
  return String(value || fallback).trim().toLowerCase();
}

export function resolveEnvironmentSettings({ env = process.env.NODE_ENV || 'development', envVars = process.env } = {}) {
  const normalizedEnv = normalizeEnvValue(envVars.NODE_ENV || env || 'development');
  const explicitDbSource = normalizeEnvValue(envVars.DB_SOURCE || envVars.MONGO_SOURCE || '', '');
  const resolvedDbSource = explicitDbSource || (normalizedEnv === 'production' ? 'atlas' : 'local');

  return {
    nodeEnv: normalizedEnv,
    dbSource: resolvedDbSource,
  };
}

export function loadEnvironmentFiles({ env = process.env.NODE_ENV || 'development' } = {}) {
  const explicitEnv = normalizeEnvValue(env || process.env.NODE_ENV || 'development');
  const requestedEnv = explicitEnv || 'development';
  const candidates = [
    `.env.${requestedEnv}.local`,
    `.env.${requestedEnv}`,
    '.env.local',
    '.env',
  ];

  for (const candidate of candidates) {
    const resolvedPath = path.resolve(projectRoot, candidate);
    dotenv.config({ path: resolvedPath, override: false });
  }

  const settings = resolveEnvironmentSettings({
    env: process.env.NODE_ENV || requestedEnv,
    envVars: process.env,
  });

  process.env.NODE_ENV = normalizeEnvValue(process.env.NODE_ENV || settings.nodeEnv, settings.nodeEnv);
  process.env.DB_SOURCE = normalizeEnvValue(process.env.DB_SOURCE || process.env.MONGO_SOURCE || settings.dbSource, settings.dbSource);

  return settings;
}
