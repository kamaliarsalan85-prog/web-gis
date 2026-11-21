import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const cacheDir = path.join(backendDir, 'cache');
const localDbPath = path.join(__dirname, 'local-db.json');

export const DEFAULT_ADMIN_TOOLS = [
  'stats', 'edit', 'export', 'spatial', 'visual', 'network',
  'join', 'modeling', 'draw', 'filter', 'search',
];

export const DEFAULT_LAYERS = ['main-parcels', 'main-mahalles', 'main-mabar'];

export const loadSeedLayers = () => {
  const layerConfigs = [
    { name: 'main-parcels', file: 'main-parcels-cache.json', color: '#3b82f6' },
    { name: 'main-mahalles', file: 'main-mahalles-cache.json', color: '#10b981' },
    { name: 'main-mabar', file: 'main-mabar-cache.json', color: '#f59e0b' },
  ];

  return layerConfigs.map((cfg) => {
    const filePath = path.join(cacheDir, cfg.file);
    let data = { type: 'FeatureCollection', features: [] };
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        data = raw.data || raw;
      } catch (e) {
        // ignore parse errors and keep empty FeatureCollection
      }
    }
    return {
      id: `layer-${cfg.name}`,
      name: cfg.name,
      data,
      storage: 'db',
      color: cfg.color,
    };
  });
};

export const createDefaultAdminRecord = () => ({
  id: 'default-admin-id',
  username: 'admin',
  password: bcrypt.hashSync(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123', 10),
  role: 'admin',
  tools: DEFAULT_ADMIN_TOOLS,
  layers: DEFAULT_LAYERS,
});

export const seedPostgres = async (pool) => {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schemaSql);

  const admin = createDefaultAdminRecord();
  await pool.query(
    `INSERT INTO users (id, username, password, role, tools, layers)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (username) DO NOTHING`,
    [
      admin.id,
      admin.username,
      admin.password,
      admin.role,
      JSON.stringify(admin.tools),
      JSON.stringify(admin.layers),
    ]
  );

  const layers = loadSeedLayers();
  for (const layer of layers) {
    await pool.query(
      `INSERT INTO layers (id, name, data, storage, color)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [layer.id, layer.name, JSON.stringify(layer.data), layer.storage, layer.color]
    );
  }
};

export const seedLocalDbFile = () => {
  let existing = { users: [], layers: [] };
  if (fs.existsSync(localDbPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localDbPath, 'utf-8'));
      existing = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        layers: Array.isArray(parsed.layers) ? parsed.layers : [],
      };
    } catch (e) {
      existing = { users: [], layers: [] };
    }
  }

  const now = new Date().toISOString();
  if (!existing.users.some((u) => u.username === 'admin')) {
    const admin = createDefaultAdminRecord();
    existing.users.push({ ...admin, created_at: now, updated_at: now });
  }

  const seedLayers = loadSeedLayers();
  for (const layer of seedLayers) {
    if (!existing.layers.some((l) => l.name === layer.name)) {
      existing.layers.push({ ...layer, created_at: now, updated_at: now });
    }
  }

  fs.writeFileSync(localDbPath, JSON.stringify(existing, null, 2), 'utf-8');
  return existing;
};

// Allow running directly via `node backend/db/seed.js`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  dotenv.config();
  if (process.env.DATABASE_URL) {
    const { Pool } = pg;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await seedPostgres(pool);
      console.log('PostgreSQL database initialized and seeded successfully.');
    } finally {
      await pool.end();
    }
  } else {
    seedLocalDbFile();
    console.log(`Local persistent database seeded at ${localDbPath}`);
  }
}
