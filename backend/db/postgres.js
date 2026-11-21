import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { seedLocalDbFile, seedPostgres } from './seed.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localDbPath = path.join(__dirname, 'local-db.json');

let pool = null;
let isUsingMockDb = !process.env.DATABASE_URL;

const mockUsers = new Map();
const mockLayers = new Map();

const persistLocalDb = () => {
  try {
    const payload = {
      users: Array.from(mockUsers.values()).map((u) => ({
        ...u,
        created_at: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
        updated_at: u.updated_at instanceof Date ? u.updated_at.toISOString() : u.updated_at,
      })),
      layers: Array.from(mockLayers.values()).map((l) => ({
        ...l,
        created_at: l.created_at instanceof Date ? l.created_at.toISOString() : l.created_at,
        updated_at: l.updated_at instanceof Date ? l.updated_at.toISOString() : l.updated_at,
      })),
    };
    const tmpPath = `${localDbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    fs.renameSync(tmpPath, localDbPath);
  } catch (err) {
    console.warn('Failed to persist local-db.json:', err.message);
  }
};

const loadLocalDb = () => {
  const seeded = seedLocalDbFile();
  mockUsers.clear();
  mockLayers.clear();

  for (const user of seeded.users || []) {
    mockUsers.set(user.username, {
      ...user,
      created_at: user.created_at ? new Date(user.created_at) : new Date(),
      updated_at: user.updated_at ? new Date(user.updated_at) : new Date(),
    });
  }

  for (const layer of seeded.layers || []) {
    mockLayers.set(layer.name, {
      ...layer,
      created_at: layer.created_at ? new Date(layer.created_at) : new Date(),
      updated_at: layer.updated_at ? new Date(layer.updated_at) : new Date(),
    });
  }
};

loadLocalDb();

const getPool = () => {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
};

const createId = () => crypto.randomUUID();
const toUser = (row) => row && ({
  _id: row.id,
  username: row.username,
  password: row.password,
  role: row.role,
  tools: row.tools || [],
  layers: row.layers || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toLayer = (row) => {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    data: row.data,
    storage: row.storage,
    color: row.color || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    save: async function save() {
      if (isUsingMockDb) {
        this.updatedAt = new Date();
        const updatedRow = {
          id: this._id,
          name: this.name,
          data: this.data,
          storage: this.storage,
          color: this.color || null,
          created_at: this.createdAt,
          updated_at: this.updatedAt,
        };
        mockLayers.set(this.name, updatedRow);
        persistLocalDb();
        Object.assign(this, toLayer(updatedRow), { save: this.save });
        return this;
      }
      const activePool = getPool();
      const result = await activePool.query(
        `UPDATE layers SET name = $1, data = $2::jsonb, storage = $3, color = $4, updated_at = $5
         WHERE id = $6 RETURNING *`,
        [this.name, JSON.stringify(this.data), this.storage, this.color || null, this.updatedAt || new Date(), this._id]
      );
      if (!result.rows[0]) throw new Error(`Layer ${this.name} no longer exists`);
      Object.assign(this, toLayer(result.rows[0]), { save: this.save });
      return this;
    },
  };
};

class Query {
  constructor(executor) { this.executor = executor; this.projection = null; }
  select(projection) { this.projection = projection; return this; }
  lean() { return this; }
  async execute() {
    const result = await this.executor();
    return Array.isArray(result) ? result.map((item) => this.applyProjection(item)) : this.applyProjection(result);
  }
  applyProjection(value) {
    if (!value || this.projection !== '-password') return value;
    const safeValue = { ...value };
    delete safeValue.password;
    return safeValue;
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
  finally(onFinally) { return this.execute().finally(onFinally); }
}

const findUserWhere = (filter = {}) => {
  if (filter.username !== undefined) return { clause: 'username = $1', values: [filter.username] };
  if (filter._id !== undefined) return { clause: 'id = $1', values: [filter._id] };
  return { clause: 'TRUE', values: [] };
};

const findLayerWhere = (filter = {}) => {
  const conditions = [];
  const values = [];
  for (const [field, column] of [['name', 'name'], ['storage', 'storage'], ['_id', 'id']]) {
    if (filter[field] !== undefined) {
      values.push(filter[field]);
      conditions.push(`${column} = $${values.length}`);
    }
  }
  return { clause: conditions.length ? conditions.join(' AND ') : 'TRUE', values };
};

class UserDocument {
  constructor(values = {}) {
    Object.assign(this, {
      _id: values._id || createId(),
      username: values.username,
      password: values.password,
      role: values.role || 'user',
      tools: values.tools || [],
      layers: values.layers || [],
      createdAt: values.createdAt || new Date(),
      updatedAt: values.updatedAt || new Date(),
    });
  }
  async save() {
    if (isUsingMockDb) {
      this.updatedAt = new Date();
      const row = {
        id: this._id,
        username: this.username,
        password: this.password,
        role: this.role,
        tools: this.tools,
        layers: this.layers,
        created_at: this.createdAt,
        updated_at: this.updatedAt,
      };
      mockUsers.set(this.username, row);
      persistLocalDb();
      Object.assign(this, toUser(row));
      return this;
    }
    const activePool = getPool();
    const result = await activePool.query(
      `INSERT INTO users (id, username, password, role, tools, layers)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password = EXCLUDED.password,
         role = EXCLUDED.role, tools = EXCLUDED.tools, layers = EXCLUDED.layers, updated_at = NOW()
       RETURNING *`,
      [this._id, this.username, this.password, this.role, JSON.stringify(this.tools), JSON.stringify(this.layers)]
    );
    Object.assign(this, toUser(result.rows[0]));
    return this;
  }
}

class UserModel extends UserDocument {
  static findOne(filter) {
    return new Query(async () => {
      if (isUsingMockDb) {
        if (filter.username !== undefined) {
          const row = mockUsers.get(filter.username);
          return toUser(row);
        }
        if (filter._id !== undefined) {
          for (const row of mockUsers.values()) {
            if (row.id === filter._id) return toUser(row);
          }
        }
        return null;
      }
      const activePool = getPool();
      const where = findUserWhere(filter);
      const result = await activePool.query(`SELECT * FROM users WHERE ${where.clause} LIMIT 1`, where.values);
      return toUser(result.rows[0]);
    });
  }
  static find(filter = {}) {
    return new Query(async () => {
      if (isUsingMockDb) {
        const list = Array.from(mockUsers.values());
        list.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
        return list.map(toUser);
      }
      const activePool = getPool();
      const where = findUserWhere(filter);
      const result = await activePool.query(`SELECT * FROM users WHERE ${where.clause} ORDER BY username`, where.values);
      return result.rows.map(toUser);
    });
  }
  static findByIdAndUpdate(id, values) {
    return new Query(async () => {
      if (isUsingMockDb) {
        for (const [uname, row] of mockUsers.entries()) {
          if (row.id === id) {
            row.role = values.role ?? row.role;
            row.tools = values.tools ?? row.tools;
            row.layers = values.layers ?? row.layers;
            if (values.username && values.username !== uname) {
              mockUsers.delete(uname);
              row.username = values.username;
              mockUsers.set(row.username, row);
            }
            if (values.password) {
              row.password = values.password;
            }
            row.updated_at = new Date();
            persistLocalDb();
            return toUser(row);
          }
        }
        return null;
      }
      const activePool = getPool();
      const result = await activePool.query(
        `UPDATE users SET role = COALESCE($1, role), tools = COALESCE($2::jsonb, tools), layers = COALESCE($3::jsonb, layers), updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [
          values.role ?? null,
          values.tools !== undefined ? JSON.stringify(values.tools) : null,
          values.layers !== undefined ? JSON.stringify(values.layers) : null,
          id,
        ]
      );
      return toUser(result.rows[0]);
    });
  }
  static async findByIdAndDelete(id) {
    if (isUsingMockDb) {
      for (const [uname, row] of mockUsers.entries()) {
        if (row.id === id) {
          mockUsers.delete(uname);
          persistLocalDb();
          return toUser(row);
        }
      }
      return null;
    }
    const activePool = getPool();
    const result = await activePool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
    return toUser(result.rows[0]);
  }
}

class LayerDocument {
  constructor(values = {}) {
    Object.assign(this, {
      _id: values._id || createId(),
      name: values.name,
      data: values.data || { type: 'FeatureCollection', features: [] },
      storage: values.storage || 'db',
      color: values.color || null,
      createdAt: values.createdAt || new Date(),
      updatedAt: values.updatedAt || new Date(),
    });
  }
  async save() {
    if (isUsingMockDb) {
      this.updatedAt = new Date();
      const row = {
        id: this._id,
        name: this.name,
        data: this.data,
        storage: this.storage,
        color: this.color || null,
        created_at: this.createdAt,
        updated_at: this.updatedAt,
      };
      mockLayers.set(this.name, row);
      persistLocalDb();
      Object.assign(this, toLayer(row), { save: this.save });
      return this;
    }
    const activePool = getPool();
    const result = await activePool.query(
      `INSERT INTO layers (id, name, data, storage, color, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data,
         storage = EXCLUDED.storage, color = EXCLUDED.color, updated_at = EXCLUDED.updated_at RETURNING *`,
      [this._id, this.name, JSON.stringify(this.data), this.storage, this.color || null, this.createdAt, this.updatedAt || new Date()]
    );
    Object.assign(this, toLayer(result.rows[0]), { save: this.save });
    return this;
  }
}

class LayerModel extends LayerDocument {
  static findOne(filter) {
    return new Query(async () => {
      if (isUsingMockDb) {
        for (const row of mockLayers.values()) {
          let match = true;
          if (filter.name !== undefined && row.name !== filter.name) match = false;
          if (filter.storage !== undefined && row.storage !== filter.storage) match = false;
          if (filter._id !== undefined && row.id !== filter._id) match = false;
          if (match) return toLayer(row);
        }
        return null;
      }
      const activePool = getPool();
      const where = findLayerWhere(filter);
      const result = await activePool.query(`SELECT * FROM layers WHERE ${where.clause} LIMIT 1`, where.values);
      return toLayer(result.rows[0]);
    });
  }
  static find(filter = {}) {
    return new Query(async () => {
      if (isUsingMockDb) {
        const list = [];
        for (const row of mockLayers.values()) {
          let match = true;
          if (filter.name !== undefined && row.name !== filter.name) match = false;
          if (filter.storage !== undefined && row.storage !== filter.storage) match = false;
          if (filter._id !== undefined && row.id !== filter._id) match = false;
          if (match) list.push(toLayer(row));
        }
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return list;
      }
      const activePool = getPool();
      const where = findLayerWhere(filter);
      const result = await activePool.query(`SELECT * FROM layers WHERE ${where.clause} ORDER BY name`, where.values);
      return result.rows.map(toLayer);
    });
  }
  static async findOneAndUpdate(filter, values, options = {}) {
    const existing = await LayerModel.findOne(filter);
    if (existing) {
      Object.assign(existing, values);
      return existing.save();
    }
    if (!options.upsert) return null;
    return new LayerModel(values).save();
  }
  static async findOneAndDelete(filter) {
    if (isUsingMockDb) {
      for (const [name, row] of mockLayers.entries()) {
        let match = true;
        if (filter.name !== undefined && row.name !== filter.name) match = false;
        if (filter.storage !== undefined && row.storage !== filter.storage) match = false;
        if (match) {
          mockLayers.delete(name);
          persistLocalDb();
          return toLayer(row);
        }
      }
      return null;
    }
    const activePool = getPool();
    const where = findLayerWhere(filter);
    const result = await activePool.query(
      `DELETE FROM layers WHERE ctid IN (SELECT ctid FROM layers WHERE ${where.clause} LIMIT 1) RETURNING *`,
      where.values
    );
    return toLayer(result.rows[0]);
  }
}

export const initializeDatabase = async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[DB] Using persistent local database at backend/db/local-db.json');
    isUsingMockDb = true;
    loadLocalDb();
    return;
  }
  try {
    const activePool = getPool();
    await seedPostgres(activePool);
    console.log('Connected to PostgreSQL and verified schema/seed data');
    isUsingMockDb = false;
  } catch (err) {
    console.warn('[DB] Could not connect to PostgreSQL:', err.message, '— falling back to persistent local database');
    isUsingMockDb = true;
    loadLocalDb();
  }
};

export const closeDatabase = () => {
  if (pool) return pool.end();
};
export { UserModel as User, LayerModel as Layer };
