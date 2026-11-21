import { MongoClient } from 'mongodb';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();
const { Pool } = pg;
const mongoUri = process.env.MONGO_URI;
const databaseUrl = process.env.DATABASE_URL;

if (!mongoUri || !databaseUrl) {
  throw new Error('MONGO_URI and DATABASE_URL are required for migration');
}

const toId = (value) => String(value || crypto.randomUUID());
const pool = new Pool({ connectionString: databaseUrl });
const mongo = new MongoClient(mongoUri);

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      layers JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS layers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, data JSONB NOT NULL,
      storage TEXT NOT NULL DEFAULT 'db', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await mongo.connect();
  const source = mongo.db().collection('users');
  const users = await source.find({}).toArray();
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, username, password, role, tools, layers, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role,
         tools = EXCLUDED.tools, layers = EXCLUDED.layers, updated_at = EXCLUDED.updated_at`,
      [toId(user._id), user.username, user.password, user.role || 'user', JSON.stringify(user.tools || []),
        JSON.stringify(user.layers || []), user.createdAt || new Date(), user.updatedAt || new Date()]
    );
  }

  const layers = await mongo.db().collection('layers').find({}).toArray();
  for (const layer of layers) {
    await pool.query(
      `INSERT INTO layers (id, name, data, storage, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'db', $4, $5)
       ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [toId(layer._id), layer.name, JSON.stringify(layer.data), layer.createdAt || new Date(), layer.updatedAt || new Date()]
    );
  }
  console.log(`Migration completed: ${users.length} users, ${layers.length} layers`);
} finally {
  await mongo.close();
  await pool.end();
}