-- GIS Platform PostgreSQL Schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'editor')),
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  storage TEXT NOT NULL DEFAULT 'db' CHECK (storage IN ('db')),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE layers ADD COLUMN IF NOT EXISTS color TEXT;

CREATE INDEX IF NOT EXISTS layers_storage_name_idx ON layers (storage, name);
