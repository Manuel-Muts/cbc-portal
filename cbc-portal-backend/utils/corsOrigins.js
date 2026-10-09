const PRODUCTION_ORIGINS = [
  'https://competencehub.co.ke',
  'https://www.competencehub.co.ke',
  'http://127.0.0.1:5000',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://localhost:8080',
  'http://localhost:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5501',
];

const normalizeOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const createCorsOriginAllowlist = ({
  frontendUrl = '',
  corsAllowedOrigins = '',
  nodeEnv = process.env.NODE_ENV,
} = {}) => {
  const configuredOrigins = (corsAllowedOrigins || frontendUrl)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = nodeEnv === 'production'
    ? PRODUCTION_ORIGINS
    : [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];

  return new Set(
    [...defaults, ...configuredOrigins]
      .map(normalizeOrigin)
      .filter(Boolean)
  );
};

export const isAllowedCorsOrigin = (origin, allowlist) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin !== null && allowlist.has(normalizedOrigin);
};