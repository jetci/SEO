// EEAT Studio V2 — Drizzle DB Connection (MySQL 8 / PlanetScale / Aiven Cloud SSL)
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';

const VERCEL_DEPLOYED = Boolean(process.env.VERCEL_URL);
const DB_SSL = (process.env.DB_SSL === '1' || process.env.DB_SSL === 'true' || process.env.DB_SSL === 'required' || VERCEL_DEPLOYED) && process.env.DB_SSL !== '0' && process.env.DB_SSL !== 'false';

const DATABASE_URL = process.env.DATABASE_URL;
const SSL_CONFIG = DB_SSL ? { rejectUnauthorized: process.env.DB_SSL_VERIFY !== '0' } : undefined;

function createPoolSafe() {
  if (DATABASE_URL) {
    const u = new URL(DATABASE_URL);
    return mysql.createPool({
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password || ''),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
      charset: 'utf8mb4',
      timezone: '+00:00',
      ssl: SSL_CONFIG,
      waitForConnections: true,
      queueLimit: 0,
    });
  }
  return mysql.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'eeat',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'eeat_studio_v2',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
    charset: 'utf8mb4',
    timezone: '+00:00',
    ssl: SSL_CONFIG,
    waitForConnections: true,
    queueLimit: 0,
  });
}

const pool = createPoolSafe();

export const db = drizzle(pool, { schema, mode: 'default' });
export default db;
export { DB_SSL, VERCEL_DEPLOYED, DATABASE_URL as DB_URL_FROM_ENV };
