import pg from 'pg';

const { Pool } = pg;
let pool;

export const getPostgresPool = () => {
  if (pool) return pool;

  const connectionType = String(process.env.BB_CONNECTION || 'postgresql').trim().toLowerCase();
  if (!['postgres', 'postgresql', 'pgsql'].includes(connectionType)) {
    throw new Error('BB_CONNECTION must be postgres, postgresql, or pgsql.');
  }

  const hasDiscreteConfig = process.env.DB_HOST
    && process.env.DB_PORT
    && process.env.DB_DATABASE
    && process.env.DB_USERNAME
    && process.env.DB_PASSWORD;
  if (!hasDiscreteConfig) {
    throw new Error('PostgreSQL is not configured. Set DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, and DB_PASSWORD.');
  }

  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    max: Number.parseInt(process.env.DB_POOL_MAX || '10', 10),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });

  pool.on('error', error => {
    console.error('Unexpected idle PostgreSQL client error:', error);
  });

  return pool;
};

export const queryPostgres = (text, values) => getPostgresPool().query(text, values);

export const closePostgresPool = async () => {
  if (!pool) return;
  const currentPool = pool;
  pool = undefined;
  await currentPool.end();
};