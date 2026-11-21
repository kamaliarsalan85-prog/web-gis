// server.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import https from 'https';
import bodyParser from 'body-parser';
import axios from 'axios';
import compression from 'compression';
import crypto from 'crypto';
import { closeDatabase, initializeDatabase, Layer, User } from './db/postgres.js';
dotenv.config();
// دليل تغيير:
// براي يکدست شدن لاگ خطاها و بستن مسير موقت ثبت ادمين، از ابتدا
// رفتار console.error و فلگ env را متمرکز مي‌کنيم تا ديباگ و امنيت ساده‌تر شود.
const originalConsoleError = console.error.bind(console);
console.error = (...args) => originalConsoleError('[ERR]', ...args);
const ENABLE_TMP_REGISTER = String(process.env.ENABLE_TMP_REGISTER || 'false').toLowerCase() === 'true';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, true),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  },
});
app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  })
);
// compress responses (gzip/brotli if node supports it + client accepts)
app.set('trust proxy', 1);
app.use(compression());
app.use(bodyParser.json({ limit: '300mb' }));
app.use(bodyParser.urlencoded({ limit: '300mb', extended: true }));
// ---------- Directories ----------
const DATA_DIR = path.join(__dirname, 'data'); // local layers directory
await fs.mkdir(DATA_DIR, { recursive: true }).catch((err) =>
  console.error('Failed to create data directory:', err)
);
// CACHE_DIR: separate directory for caches (main-parcels cache lives here)
const CACHE_DIR = path.join(__dirname, 'cache');
await fs.mkdir(CACHE_DIR, { recursive: true }).catch((err) =>
  console.error('Failed to create cache directory:', err)
);
// PARCELS_CACHE_FILE now points inside CACHE_DIR (option B)
const PARCELS_CACHE_FILE = path.join(CACHE_DIR, 'main-parcels-cache.json');
const MAHALLES_CACHE_FILE = path.join(CACHE_DIR, 'main-mahalles-cache.json');
// NEW: add mabar cache file
const MABAR_CACHE_FILE = path.join(CACHE_DIR, 'main-mabar-cache.json');
const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET || 'gis-platform-default-secret-key-2026';
if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set in .env — using in-memory database fallback');
}
try {
  await initializeDatabase();
} catch (err) {
  console.warn('Database initialization warning:', err.message);
}
// دليل تغيير:
// اين توابع کمکي، ساخت GeoJSON خالي و خواندن امن fallbackها از کش، ديتابيس
// و فايل‌هاي محلي را متمرکز مي‌کنند تا endpointها هرگز با داده undefined کرش نکنند.
const createEmptyFeatureCollection = () => ({
  type: 'FeatureCollection',
  features: [],
});
const isFeatureCollection = (data) =>
  Boolean(data && data.type === 'FeatureCollection' && Array.isArray(data.features));
const hasNonEmptyFeatureCollection = (data) =>
  isFeatureCollection(data) && Array.isArray(data.features) && data.features.length > 0;
const getLayerFilePath = (layerName) => path.join(DATA_DIR, `${layerName}.geojson`);
const getNumericFeatureObjectId = (feature) => {
  const candidates = [
    feature?.properties?.OBJECTID,
    feature?.properties?.object_id,
    feature?.object_id,
    feature?.id,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};
const readFeatureCollectionFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return isFeatureCollection(parsed) ? parsed : null;
  } catch (error) {
    if (!['ENOENT'].includes(error.code)) {
      console.error(`Failed to read feature collection file ${filePath}:`, error.message);
    }
    return null;
  }
};
const readFeatureCollectionCacheFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return isFeatureCollection(parsed?.data) ? parsed.data : null;
  } catch (error) {
    if (!['ENOENT'].includes(error.code)) {
      console.error(`Failed to read cache file ${filePath}:`, error.message);
    }
    return null;
  }
};
const readFeatureCollectionCachePayload = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return {
      data: isFeatureCollection(parsed?.data) ? parsed.data : null,
      meta: parsed?.meta ?? {},
    };
  } catch (error) {
    if (!['ENOENT'].includes(error.code)) {
      console.error(`Failed to read cache payload ${filePath}:`, error.message);
    }
    return null;
  }
};
// ---------- Auth middlewares ----------
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')?.[1];
  if (!token) {
    return res.status(401).json({
      status: 'error',
      error: 'Authentication required. Please provide a valid token.',
    });
  }
  try {
    const secret = JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      error: 'Invalid or expired token',
      details: error.message,
    });
  }
};
const optionalAuthMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')?.[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // ignore
    }
  }
  next();
};
const adminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      error: 'Access denied. Admin privileges required.',
    });
  }
  next();
};
// ---------- external axios with keep-alive ----------
const EXTERNAL_BASE_URL = (process.env.MAHALLE_API || process.env.EXTERNAL_API_BASE || '').trim();
const externalAxios = axios.create({
  baseURL: EXTERNAL_BASE_URL || 'http://localhost:3000',
  timeout: 10000,
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
});
// convenience mahalle endpoints root
const MAHALLE_PREFIX = '/api/mahalle';
// simple concurrency limiter (no external dependency)
const pLimit = (limit) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then((v) => resolve(v))
      .catch((e) => reject(e))
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};
// ---------- sendToFakeSync ----------
const sendToFakeSync = async (action, layerName, data) => {
  if (!EXTERNAL_BASE_URL) return;
  try {
    await externalAxios.post('/api/fake-sync', { action, layerName, data });
  } catch (error) {
    // quietly ignore if upstream fake-sync endpoint is unavailable
  }
};
// ---------- parcels-geojson, mahalles & mabar cache & fetch (conditional requests) ----------
const DEFAULT_CACHE_TTL_MS = process.env.CACHE_TTL_MS ? Number(process.env.CACHE_TTL_MS) : 30 * 1000;
const CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;
// optional per-layer TTL map (e.g., process.env.PARCELS_TTL_MS)
const LAYER_TTLS = {
  'main-parcels': process.env.PARCELS_TTL_MS ? Number(process.env.PARCELS_TTL_MS) : CACHE_TTL_MS,
  'main-mahalles': process.env.MAHALLES_TTL_MS ? Number(process.env.MAHALLES_TTL_MS) : CACHE_TTL_MS,
  'main-mabar': process.env.MABAR_TTL_MS ? Number(process.env.MABAR_TTL_MS) : CACHE_TTL_MS,
};
// parcelsCache structure - keep same fields as before
let parcelsCache = {
  data: null,
  etag: null,
  lastModified: null,
  updatedAt: 0,
  fetchPromise: null,
};
// mahalles cache
let mahallesCache = {
  data: null,
  etag: null,
  lastModified: null,
  updatedAt: 0,
  fetchPromise: null,
};
// NEW: mabar cache
let mabarCache = {
  data: null,
  etag: null,
  lastModified: null,
  updatedAt: 0,
  fetchPromise: null,
};
// generic helper to write cache file with metadata
const writeCacheFile = async (filePath, { data, etag, lastModified, updatedAt }) => {
  const payload = {
    meta: {
      etag: etag ?? null,
      lastModified: lastModified ?? null,
      updatedAt: updatedAt ?? Date.now(),
    },
    data,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
};
const writeParcelsToFile = async (data, meta = {}) =>
  writeCacheFile(PARCELS_CACHE_FILE, { data, ...meta });
const writeMahallesToFile = async (data, meta = {}) =>
  writeCacheFile(MAHALLES_CACHE_FILE, { data, ...meta });
const writeMabarToFile = async (data, meta = {}) =>
  writeCacheFile(MABAR_CACHE_FILE, { data, ...meta });
// دليل تغيير:
// با اين هلپرها، منبع fallback هر لايه در يک نقطه مديريت مي‌شود
// تا در قطع سرويس خارجي، کش، ديتابيس يا فايل محلي به ترتيب استفاده شوند.
const syncCacheState = async (cacheObj, writer, data, meta = {}) => {
  cacheObj.data = isFeatureCollection(data) ? data : createEmptyFeatureCollection();
  cacheObj.etag = meta.etag ?? cacheObj.etag ?? `W/"${hashForETag(cacheObj.data)}"`;
  cacheObj.lastModified = meta.lastModified ?? cacheObj.lastModified ?? null;
  cacheObj.updatedAt = meta.updatedAt ?? Date.now();
  try {
    await writer(cacheObj.data, {
      etag: cacheObj.etag,
      lastModified: cacheObj.lastModified,
      updatedAt: cacheObj.updatedAt,
    });
  } catch (error) {
    console.error('Failed to persist cache state:', error.message);
  }
  return cacheObj.data;
};
const getInternalLayerFallback = async (layerName) => {
  try {
    const dbLayer = await Layer.findOne({ name: layerName, storage: 'db' }).lean();
    if (isFeatureCollection(dbLayer?.data)) {
      return { source: 'db', data: dbLayer.data };
    }
  } catch (error) {
    console.error(`Failed to read ${layerName} from MongoDB fallback:`, error.message);
  }
  return null;
};
const resolveLayerFallback = async (layerName, cacheObj, cacheFile, writer) => {
  if (hasNonEmptyFeatureCollection(cacheObj.data) && cacheObj.updatedAt > 0) {
    return { fromCache: true, data: cacheObj.data, source: 'cache' };
  }
  const diskCache = await readFeatureCollectionCachePayload(cacheFile);
  if (hasNonEmptyFeatureCollection(diskCache?.data) && Number(diskCache?.meta?.updatedAt || 0) > 0) {
    await syncCacheState(cacheObj, writer, diskCache.data, {
      etag: diskCache.meta?.etag ?? `W/"${hashForETag(diskCache.data)}"`,
      lastModified: diskCache.meta?.lastModified ?? null,
      updatedAt: Number(diskCache.meta?.updatedAt || Date.now()),
    });
    return { fromCache: true, data: cacheObj.data, source: 'cache-disk' };
  }
  const internal = await getInternalLayerFallback(layerName);
  if (hasNonEmptyFeatureCollection(internal?.data)) {
    await syncCacheState(cacheObj, writer, internal.data, {
      etag: `W/"${hashForETag(internal.data)}"`,
      updatedAt: Date.now(),
    });
    return { fromCache: true, data: cacheObj.data, source: internal.source };
  }
  const emptyData = createEmptyFeatureCollection();
  await syncCacheState(cacheObj, writer, emptyData, {
    etag: `W/"${hashForETag(emptyData)}"`,
    updatedAt: 0,
  });
  return { fromCache: true, data: emptyData, source: 'empty', isEmpty: true };
};
const buildMainLayerSummary = (name, data) => ({
  name,
  count: Array.isArray(data?.features) ? data.features.length : 0,
  storage: 'external',
  data,
  updatedAt: new Date().toISOString(),
});
const getNextFeatureObjectId = async (layerName, base = 1) => {
  let maxObjectId = base - 1;
  const sources = [];
  const cacheMap = {
    'main-parcels': parcelsCache.data,
    'main-mahalles': mahallesCache.data,
    'main-mabar': mabarCache.data,
  };
  if (isFeatureCollection(cacheMap[layerName])) {
    sources.push(cacheMap[layerName]);
  }
  const dbLayer = await Layer.findOne({ name: layerName, storage: 'db' }).lean().catch((error) => {
    console.error(`Failed to inspect ${layerName} in MongoDB for next object id:`, error.message);
    return null;
  });
  if (isFeatureCollection(dbLayer?.data)) {
    sources.push(dbLayer.data);
  }
  const localData = await readFeatureCollectionFile(getLayerFilePath(layerName));
  if (isFeatureCollection(localData)) {
    sources.push(localData);
  }
  for (const source of sources) {
    for (const feature of source.features) {
      const currentId = getNumericFeatureObjectId(feature);
      if (currentId !== null) {
        maxObjectId = Math.max(maxObjectId, currentId);
      }
    }
  }
  return maxObjectId + 1;
};
// دليل تغيير:
// براي اينکه routeهاي سازگاري فرانت بدون وابستگي به upstream هم کار کنند،
// يک لايه کمکي براي بارگذاري/ذخيره فيچرهاي main-* به‌صورت محلي اضافه مي‌کنيم.
const cloneGeoJSON = (data) => JSON.parse(JSON.stringify(data));
const getMainLayerArtifacts = (layerName) => {
  switch (layerName) {
    case 'main-parcels':
      return { cacheObj: parcelsCache, writer: writeParcelsToFile, localFilePath: null };
    case 'main-mahalles':
      return { cacheObj: mahallesCache, writer: writeMahallesToFile, localFilePath: null };
    case 'main-mabar':
      return { cacheObj: mabarCache, writer: writeMabarToFile, localFilePath: getLayerFilePath('main-mabar') };
    default:
      throw new Error(`Unsupported main layer: ${layerName}`);
  }
};
const loadMutableMainLayerData = async (layerName) => {
  const { cacheObj, localFilePath } = getMainLayerArtifacts(layerName);
  if (isFeatureCollection(cacheObj?.data)) {
    return cloneGeoJSON(cacheObj.data);
  }
  try {
    const dbLayer = await Layer.findOne({ name: layerName, storage: 'db' }).lean();
    if (isFeatureCollection(dbLayer?.data)) {
      return cloneGeoJSON(dbLayer.data);
    }
  } catch (error) {
    console.error(`Failed to load ${layerName} from MongoDB writable store:`, error.message);
  }
  if (localFilePath) {
    const localData = await readFeatureCollectionFile(localFilePath);
    if (isFeatureCollection(localData)) {
      return cloneGeoJSON(localData);
    }
  }
  return createEmptyFeatureCollection();
};
const persistMutableMainLayerData = async (layerName, geojson) => {
  const { cacheObj, writer, localFilePath } = getMainLayerArtifacts(layerName);
  const normalized = isFeatureCollection(geojson) ? geojson : createEmptyFeatureCollection();
  await syncCacheState(cacheObj, writer, normalized, {
    etag: `W/"${hashForETag(normalized)}"`,
    updatedAt: Date.now(),
  });
  await Layer.findOneAndUpdate(
    { name: layerName, storage: 'db' },
    {
      name: layerName,
      data: normalized,
      storage: 'db',
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (localFilePath) {
    await fs.writeFile(localFilePath, JSON.stringify(normalized, null, 2), 'utf8');
  }
  return normalized;
};
const upsertMainLayerFeatureLocal = async (layerName, feature) => {
  const geojson = await loadMutableMainLayerData(layerName);
  const featureId = String(feature?.properties?.OBJECTID ?? feature?.id ?? '');
  const index = geojson.features.findIndex(
    (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') === featureId
  );
  if (index >= 0) {
    geojson.features[index] = feature;
  } else {
    geojson.features.push(feature);
  }
  const persisted = await persistMutableMainLayerData(layerName, geojson);
  return {
    layer: persisted,
    feature: geojson.features[index >= 0 ? index : geojson.features.length - 1],
    created: index === -1,
  };
};
const updateMainLayerGeometryLocal = async (layerName, featureId, geometry) => {
  const geojson = await loadMutableMainLayerData(layerName);
  const index = geojson.features.findIndex(
    (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') === String(featureId)
  );
  if (index === -1) {
    const error = new Error('Feature not found');
    error.status = 404;
    throw error;
  }
  geojson.features[index] = {
    ...geojson.features[index],
    geometry,
  };
  const persisted = await persistMutableMainLayerData(layerName, geojson);
  return {
    layer: persisted,
    feature: geojson.features[index],
  };
};
const updateMainLayerPropertyLocal = async (layerName, featureId, key, value, mode = 'set') => {
  const geojson = await loadMutableMainLayerData(layerName);
  const index = geojson.features.findIndex(
    (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') === String(featureId)
  );
  if (index === -1) {
    const error = new Error('Feature not found');
    error.status = 404;
    throw error;
  }
  const nextProperties = { ...(geojson.features[index].properties || {}) };
  if (mode === 'delete') {
    delete nextProperties[key];
  } else {
    nextProperties[key] = value;
  }
  geojson.features[index] = {
    ...geojson.features[index],
    properties: nextProperties,
  };
  const persisted = await persistMutableMainLayerData(layerName, geojson);
  return {
    layer: persisted,
    feature: geojson.features[index],
  };
};
const deleteMainLayerFeatureLocal = async (layerName, featureId) => {
  const geojson = await loadMutableMainLayerData(layerName);
  const originalLength = geojson.features.length;
  geojson.features = geojson.features.filter(
    (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') !== String(featureId)
  );
  if (geojson.features.length === originalLength) {
    const error = new Error('Feature not found');
    error.status = 404;
    throw error;
  }
  const persisted = await persistMutableMainLayerData(layerName, geojson);
  return { layer: persisted };
};
const buildMainLayerCreateFeature = (layerName, payload = {}) => {
  const objectId = payload.object_id ?? payload.properties?.OBJECTID ?? payload.id ?? Date.now();
  const baseProps = {
    ...(payload.properties || {}),
    OBJECTID: payload.properties?.OBJECTID ?? objectId,
  };
  if (layerName === 'main-parcels' && baseProps.mahalle_ID === undefined) {
    baseProps.mahalle_ID = payload.properties?.mahalle_ID ?? null;
  }
  return {
    type: 'Feature',
    id: String(objectId),
    geometry: payload.geometry,
    properties: baseProps,
  };
};
const fetchParcelsFromExternal = async () => {
  // if someone already fetching, reuse the promise (coalescing)
  if (parcelsCache.fetchPromise) {
    try {
      await parcelsCache.fetchPromise;
      return { fromCache: true, data: parcelsCache.data };
    } catch (e) {
      // fallthrough to try again below
    }
  }
  // create a new fetch promise and store it
  let resolver;
  parcelsCache.fetchPromise = new Promise((resolve, reject) => { resolver = { resolve, reject }; });
  if (!EXTERNAL_BASE_URL) {
    const fallback = await resolveLayerFallback('main-parcels', parcelsCache, PARCELS_CACHE_FILE, writeParcelsToFile);
    resolver.resolve();
    parcelsCache.fetchPromise = null;
    return fallback;
  }
  const start = Date.now();
  try {
    const headers = {};
    if (parcelsCache.etag) headers['If-None-Match'] = parcelsCache.etag;
    if (parcelsCache.lastModified) headers['If-Modified-Since'] = parcelsCache.lastModified;
    const resp = await externalAxios.get('/api/parcels-geojson/', { headers, validateStatus: null });
    if (resp.status === 200 && resp.data) {
      parcelsCache.data = resp.data;
      parcelsCache.etag = resp.headers?.etag ?? 'W/"' + hashForETag(resp.data) + '"';
      parcelsCache.lastModified = resp.headers?.['last-modified'] ?? parcelsCache.lastModified;
      parcelsCache.updatedAt = Date.now();
      // persist both data and metadata
      writeParcelsToFile(resp.data, {
        etag: parcelsCache.etag,
        lastModified: parcelsCache.lastModified,
        updatedAt: parcelsCache.updatedAt,
      }).catch(() => {});
      console.log(`Fetched parcels (200) in ${Date.now() - start}ms; bytes=${JSON.stringify(resp.data).length}`);
      resolver.resolve();
      parcelsCache.fetchPromise = null;
      return { fromCache: false, data: resp.data };
    }
    if (resp.status === 304) {
      parcelsCache.updatedAt = Date.now();
      resolver.resolve();
      parcelsCache.fetchPromise = null;
      return { fromCache: true, data: parcelsCache.data };
    }
    if (parcelsCache.data) {
      resolver.resolve();
      parcelsCache.fetchPromise = null;
      return { fromCache: true, data: parcelsCache.data };
    }
    const fallback = await resolveLayerFallback('main-parcels', parcelsCache, PARCELS_CACHE_FILE, writeParcelsToFile);
    resolver.resolve();
    parcelsCache.fetchPromise = null;
    return fallback;
  } catch (err) {
    if (err?.response?.status === 304) {
      parcelsCache.updatedAt = Date.now();
      resolver.resolve();
      parcelsCache.fetchPromise = null;
      return { fromCache: true, data: parcelsCache.data };
    }
    const fallback = await resolveLayerFallback('main-parcels', parcelsCache, PARCELS_CACHE_FILE, writeParcelsToFile);
    resolver.resolve();
    parcelsCache.fetchPromise = null;
    return fallback;
  }
};
const fetchMahallesFromExternal = async () => {
  // if someone already fetching, reuse the promise (coalescing)
  if (mahallesCache.fetchPromise) {
    try {
      await mahallesCache.fetchPromise;
      return { fromCache: true, data: mahallesCache.data };
    } catch (e) {
      // fallthrough to try again below
    }
  }
  // create a new fetch promise and store it
  let resolver;
  mahallesCache.fetchPromise = new Promise((resolve, reject) => { resolver = { resolve, reject }; });
  if (!EXTERNAL_BASE_URL) {
    const fallback = await resolveLayerFallback('main-mahalles', mahallesCache, MAHALLES_CACHE_FILE, writeMahallesToFile);
    resolver.resolve();
    mahallesCache.fetchPromise = null;
    return fallback;
  }
  const start = Date.now();
  try {
    const headers = {};
    if (mahallesCache.etag) headers['If-None-Match'] = mahallesCache.etag;
    if (mahallesCache.lastModified) headers['If-Modified-Since'] = mahallesCache.lastModified;
    const resp = await externalAxios.get('/api/mahalles', { headers, validateStatus: null });
    if (resp.status === 200 && resp.data) {
      // Convert DRF paginated response to GeoJSON FeatureCollection
      let geojsonData = { type: 'FeatureCollection', features: [] };
      if (resp.data.results && Array.isArray(resp.data.results)) {
        geojsonData.features = resp.data.results.map((item) => ({
          type: 'Feature',
          id: item.id,
          geometry: item.geometry,
          properties: {
            ...(item.properties || {}),
            created_at: item.created_at,
            updated_at: item.updated_at,
            is_active: item.is_active,
          },
        }));
      } else if (resp.data.type === 'FeatureCollection') {
        geojsonData = resp.data;
      }
      mahallesCache.data = geojsonData;
      mahallesCache.etag = resp.headers?.etag ?? 'W/"' + hashForETag(geojsonData) + '"';
      mahallesCache.lastModified = resp.headers?.['last-modified'] ?? mahallesCache.lastModified;
      mahallesCache.updatedAt = Date.now();
      // persist both data and metadata
      writeMahallesToFile(geojsonData, {
        etag: mahallesCache.etag,
        lastModified: mahallesCache.lastModified,
        updatedAt: mahallesCache.updatedAt,
      }).catch(() => {});
      console.log(`Fetched mahalles (200) in ${Date.now() - start}ms; bytes=${JSON.stringify(geojsonData).length}`);
      resolver.resolve();
      mahallesCache.fetchPromise = null;
      return { fromCache: false, data: geojsonData };
    }
    if (resp.status === 304) {
      mahallesCache.updatedAt = Date.now();
      resolver.resolve();
      mahallesCache.fetchPromise = null;
      return { fromCache: true, data: mahallesCache.data };
    }
    if (mahallesCache.data) {
      resolver.resolve();
      mahallesCache.fetchPromise = null;
      return { fromCache: true, data: mahallesCache.data };
    }
    const fallback = await resolveLayerFallback('main-mahalles', mahallesCache, MAHALLES_CACHE_FILE, writeMahallesToFile);
    resolver.resolve();
    mahallesCache.fetchPromise = null;
    return fallback;
  } catch (err) {
    if (err?.response?.status === 304) {
      mahallesCache.updatedAt = Date.now();
      resolver.resolve();
      mahallesCache.fetchPromise = null;
      return { fromCache: true, data: mahallesCache.data };
    }
    const fallback = await resolveLayerFallback('main-mahalles', mahallesCache, MAHALLES_CACHE_FILE, writeMahallesToFile);
    resolver.resolve();
    mahallesCache.fetchPromise = null;
    return fallback;
  }
};
// NEW: fetch data from /mabar-simple/ as a read-only external layer (main-mabar)
const fetchMabarFromExternal = async () => {
  // if someone already fetching, reuse the promise (coalescing)
  if (mabarCache.fetchPromise) {
    try {
      await mabarCache.fetchPromise;
      return { fromCache: true, data: mabarCache.data };
    } catch (e) {
      // fallthrough to try again below
    }
  }
  // create a new fetch promise and store it
  let resolver;
  mabarCache.fetchPromise = new Promise((resolve, reject) => { resolver = { resolve, reject }; });
  if (!EXTERNAL_BASE_URL) {
    const fallback = await resolveLayerFallback('main-mabar', mabarCache, MABAR_CACHE_FILE, writeMabarToFile);
    resolver.resolve();
    mabarCache.fetchPromise = null;
    return fallback;
  }
  const start = Date.now();
  try {
    const headers = {};
    if (mabarCache.etag) headers['If-None-Match'] = mabarCache.etag;
    if (mabarCache.lastModified) headers['If-Modified-Since'] = mabarCache.lastModified;
    // try root of mabar-simple; the exact structure upstream may vary, so handle multiple shapes
    const resp = await externalAxios.get('/mabar-simple/', { headers, validateStatus: null });
    if (resp.status === 200 && resp.data) {
      // Normalize to GeoJSON FeatureCollection if possible
      let geojsonData = { type: 'FeatureCollection', features: [] };
      // Common cases:
      // - resp.data.results (DRF) -> map to features
      // - resp.data.features (already GeoJSON)
      // - resp.data itself is a Feature or FeatureCollection
      if (resp.data.results && Array.isArray(resp.data.results)) {
        geojsonData.features = resp.data.results.map((item) => {
          // item may already be a geo feature or contain geometry/properties fields
          let geometry = item.geometry ?? item.geom ?? item.geo ?? null;
          if (item.geometry_json) {
            try {
              geometry = JSON.parse(item.geometry_json);
            } catch (parseErr) {
              console.error('Failed to parse geometry_json for item:', parseErr.message);
            }
          }
          if (item.type === 'Feature') return { ...item, geometry };
          return {
            type: 'Feature',
            id: item.id ?? item.properties?.OBJECTID ?? item.pk ?? undefined,
            geometry,
            properties: { ...(item.properties || {}), ...(item.extra || {}) },
          };
        });
      } else if (resp.data.type === 'FeatureCollection' && Array.isArray(resp.data.features)) {
        geojsonData = { ...resp.data };
        geojsonData.features = geojsonData.features.map((feature) => {
          let geometry = feature.geometry;
          if (feature.properties?.geometry_json) {
            try {
              geometry = JSON.parse(feature.properties.geometry_json);
            } catch (parseErr) {
              console.error('Failed to parse geometry_json in properties:', parseErr.message);
            }
          } else if (feature.geometry_json) {
            try {
              geometry = JSON.parse(feature.geometry_json);
            } catch (parseErr) {
              console.error('Failed to parse geometry_json in feature:', parseErr.message);
            }
          }
          return { ...feature, geometry };
        });
      } else if (Array.isArray(resp.data)) {
        // top-level array -> assume list of features or items convertible to features
        geojsonData.features = resp.data.map((item) => {
          let geometry = item.geometry ?? item.geom ?? null;
          if (item.geometry_json) {
            try {
              geometry = JSON.parse(item.geometry_json);
            } catch (parseErr) {
              console.error('Failed to parse geometry_json for item:', parseErr.message);
            }
          }
          if (item.type === 'Feature') return { ...item, geometry };
          return {
            type: 'Feature',
            id: item.id ?? item.properties?.OBJECTID ?? undefined,
            geometry,
            properties: { ...(item.properties || {}), ...(item.extra || {}) },
          };
        });
      } else if (resp.data.type === 'Feature') {
        let geometry = resp.data.geometry;
        if (resp.data.geometry_json) {
          try {
            geometry = JSON.parse(resp.data.geometry_json);
          } catch (parseErr) {
            console.error('Failed to parse geometry_json for single feature:', parseErr.message);
          }
        }
        geojsonData.features = [{ ...resp.data, geometry }];
      } else {
        // fallback: try to see if resp.data has items under a key like items, data, features
        const candidate =
          resp.data.items || resp.data.data || resp.data.features || null;
        if (Array.isArray(candidate)) {
          geojsonData.features = candidate.map((item) => {
            let geometry = item.geometry ?? item.geom ?? null;
            if (item.geometry_json) {
              try {
                geometry = JSON.parse(item.geometry_json);
              } catch (parseErr) {
                console.error('Failed to parse geometry_json for candidate item:', parseErr.message);
              }
            }
            if (item.type === 'Feature') return { ...item, geometry };
            return {
              type: 'Feature',
              id: item.id ?? item.properties?.OBJECTID ?? undefined,
              geometry,
              properties: { ...(item.properties || {}), ...(item.extra || {}) },
            };
          });
        } else {
          // could not convert cleanly — store raw response as a single feature property
          let geometry = null;
          if (resp.data.geometry_json) {
            try {
              geometry = JSON.parse(resp.data.geometry_json);
            } catch (parseErr) {
              console.error('Failed to parse geometry_json for raw:', parseErr.message);
            }
          }
          geojsonData.features = [
            {
              type: 'Feature',
              id: 'mabar_raw_1',
              geometry,
              properties: { raw: resp.data },
            },
          ];
        }
      }
      mabarCache.data = geojsonData;
      mabarCache.etag = resp.headers?.etag ?? 'W/"' + hashForETag(geojsonData) + '"';
      mabarCache.lastModified = resp.headers?.['last-modified'] ?? mabarCache.lastModified;
      mabarCache.updatedAt = Date.now();
      // persist both data and metadata
      writeMabarToFile(geojsonData, {
        etag: mabarCache.etag,
        lastModified: mabarCache.lastModified,
        updatedAt: mabarCache.updatedAt,
      }).catch(() => {});
      console.log(`Fetched mabar (200) in ${Date.now() - start}ms; bytes=${JSON.stringify(geojsonData).length}`);
      resolver.resolve();
      mabarCache.fetchPromise = null;
      return { fromCache: false, data: geojsonData };
    }
    if (resp.status === 304) {
      mabarCache.updatedAt = Date.now();
      console.log(`Mabar not modified (304) — using cached data.`);
      resolver.resolve();
      mabarCache.fetchPromise = null;
      return { fromCache: true, data: mabarCache.data };
    }
    if (mabarCache.data) {
      resolver.resolve();
      mabarCache.fetchPromise = null;
      return { fromCache: true, data: mabarCache.data };
    }
    const fallback = await resolveLayerFallback('main-mabar', mabarCache, MABAR_CACHE_FILE, writeMabarToFile);
    resolver.resolve();
    mabarCache.fetchPromise = null;
    return fallback;
  } catch (err) {
    // special-case 304 in axios error path
    if (err?.response?.status === 304) {
      mabarCache.updatedAt = Date.now();
      resolver.resolve();
      mabarCache.fetchPromise = null;
      return { fromCache: true, data: mabarCache.data };
    }
    const fallback = await resolveLayerFallback('main-mabar', mabarCache, MABAR_CACHE_FILE, writeMabarToFile);
    resolver.resolve();
    mabarCache.fetchPromise = null;
    return fallback;
  }
};
// load caches from disk at startup (best-effort) — now reads PARCELS_CACHE_FILE & MAHALLES_CACHE_FILE & MABAR_CACHE_FILE inside CACHE_DIR
(async () => {
  const ensureCacheSeed = async (filePath, name) => {
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeCacheFile(filePath, {
        data: createEmptyFeatureCollection(),
        etag: null,
        lastModified: null,
        updatedAt: 0,
      });
      console.log(`Seeded empty ${name} cache at startup.`);
    }
  };
  const load = async (filePath, cacheObj, name) => {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      cacheObj.data = isFeatureCollection(parsed.data) ? parsed.data : createEmptyFeatureCollection();
      cacheObj.etag = parsed.meta?.etag ?? cacheObj.etag;
      cacheObj.lastModified = parsed.meta?.lastModified ?? cacheObj.lastModified;
      cacheObj.updatedAt = parsed.meta?.updatedAt ?? 0;
      console.log(`Loaded ${name} cache from disk (${filePath})`);
    } catch (e) {
      console.warn(`Failed to load ${name} cache from disk, reseeding empty cache:`, e.message);
      await writeCacheFile(filePath, {
        data: createEmptyFeatureCollection(),
        etag: null,
        lastModified: null,
        updatedAt: 0,
      });
      cacheObj.data = createEmptyFeatureCollection();
      cacheObj.etag = null;
      cacheObj.lastModified = null;
      cacheObj.updatedAt = 0;
    }
  };
  await ensureCacheSeed(PARCELS_CACHE_FILE, 'parcels');
  await ensureCacheSeed(MAHALLES_CACHE_FILE, 'mahalles');
  await ensureCacheSeed(MABAR_CACHE_FILE, 'mabar');
  await load(PARCELS_CACHE_FILE, parcelsCache, 'parcels');
  await load(MAHALLES_CACHE_FILE, mahallesCache, 'mahalles');
  await load(MABAR_CACHE_FILE, mabarCache, 'mabar');
})();
// Helper: normalize layer object returned to client
const makeLayerResponse = (rawLayer, storage = 'db') => {
  if (!rawLayer) return null;
  if (storage === 'db') {
    // mongoose doc
    const data = rawLayer.data ?? {};
    const updatedAt = rawLayer.updatedAt ? new Date(rawLayer.updatedAt).toISOString() : new Date().toISOString();
    const version = rawLayer.updatedAt ? rawLayer.updatedAt.getTime() : Date.now();
    return {
      name: rawLayer.name,
      data,
      storage: 'db',
      updatedAt,
      version,
      color: rawLayer.color,
    };
  } else {
    // plain object for local file
    const updatedAt = rawLayer.updatedAt ?? new Date().toISOString();
    const version = rawLayer.version ?? Date.now();
    return {
      name: rawLayer.name,
      data: rawLayer.data,
      storage: 'local',
      updatedAt,
      version,
      color: rawLayer.color,
    };
  }
};
// sanitize layer/file names safely (avoid unicode-regex pitfalls)
const sanitizeLayerName = (name) => {
  if (!name || typeof name !== 'string') return `layer_${Date.now()}`;
  // basename without extension
  const base = path.basename(name, path.extname(name));
  // keep ASCII letters, digits, underscore and dash; replace others with underscore
  return base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || `layer_${Date.now()}`;
};
// ---------- Socket ----------
io.on('connection', (socket) => {
  console.log('User connected to socket');
  socket.on('disconnect', () => console.log('User disconnected'));
});
// helper: send cache headers to client and handle conditional request
const respondWithCache = (req, res, cacheObj, name) => {
  if (!cacheObj || !isFeatureCollection(cacheObj.data)) return false;
  if (cacheObj.etag) res.setHeader('ETag', cacheObj.etag);
  if (cacheObj.lastModified) res.setHeader('Last-Modified', cacheObj.lastModified);
  // let client cache (public) for short time, but still validate with ETag
  res.setHeader('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, must-revalidate`);
  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  if (inm && cacheObj.etag && inm === cacheObj.etag) {
    res.status(304).end();
    return true;
  }
  if (ims && cacheObj.lastModified && new Date(cacheObj.lastModified).getTime() <= Date.parse(ims)) {
    res.status(304).end();
    return true;
  }
  return false;
};
// --- Debug request logger (place after bodyParser middlewares, before your routes) ---
app.use((req, res, next) => {
  if (!req.originalUrl.startsWith('/api')) {
    return next();
  }
  try {
    const now = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    // don't print full bodies in prod; print a short preview for debugging
    let bodyPreview = '';
    try {
      if (req.body && Object.keys(req.body).length) {
        const raw = JSON.stringify(req.body);
        bodyPreview = raw.length > 500 ? raw.slice(0, 500) + '... (truncated)' : raw;
      }
    } catch (e) {
      bodyPreview = '[unable to stringify body]';
    }
    console.log(`[REQ] ${now} ${ip} ${req.method} ${req.originalUrl} headers=${JSON.stringify({
      'content-type': req.headers['content-type'],
      authorization: req.headers['authorization'] ? '[REDACTED]' : undefined,
    })} body=${bodyPreview}`);
  } catch (loggerErr) {
    console.warn('Request logger error:', loggerErr);
  }
  next();
});
// ---------- Routes ----------
app.get('/api/parcels-geojson', async (req, res) => {
  try {
    const now = Date.now();
    if (hasNonEmptyFeatureCollection(parcelsCache.data) && parcelsCache.updatedAt > 0 && now - parcelsCache.updatedAt < LAYER_TTLS['main-parcels']) {
      res.setHeader('X-Cache', 'HIT');
      if (respondWithCache(req, res, parcelsCache, 'parcels')) return;
      return res.json(parcelsCache.data);
    }
    const start = Date.now();
    const result = await fetchParcelsFromExternal();
    const took = Date.now() - start;
    res.setHeader('X-Cache', result.source === 'empty' ? 'EMPTY' : result.fromCache ? 'HIT' : 'MISS');
    res.setHeader('X-Fetch-Time-ms', String(took));
    if (result.source === 'empty') {
      return res.status(200).json(result.data);
    }
    if (respondWithCache(req, res, parcelsCache, 'parcels')) return;
    return res.json(result.data);
  } catch (err) {
    console.error('parcels-geojson handler error:', err.message);
    res.status(500).json({ status: 'error', error: 'Server error', details: err.message });
  }
});
app.get('/api/mahalles', async (req, res) => {
  try {
    const now = Date.now();
    if (hasNonEmptyFeatureCollection(mahallesCache.data) && mahallesCache.updatedAt > 0 && now - mahallesCache.updatedAt < LAYER_TTLS['main-mahalles']) {
      res.setHeader('X-Cache', 'HIT');
      if (respondWithCache(req, res, mahallesCache, 'mahalles')) return;
      return res.json(mahallesCache.data);
    }
    const start = Date.now();
    const result = await fetchMahallesFromExternal();
    const took = Date.now() - start;
    res.setHeader('X-Cache', result.source === 'empty' ? 'EMPTY' : result.fromCache ? 'HIT' : 'MISS');
    res.setHeader('X-Fetch-Time-ms', String(took));
    if (result.source === 'empty') {
      return res.status(200).json(result.data);
    }
    if (respondWithCache(req, res, mahallesCache, 'mahalles')) return;
    return res.json(result.data);
  } catch (err) {
    console.error('mahalles handler error:', err.message);
    res.status(500).json({ status: 'error', error: 'Server error', details: err.message });
  }
});
// NEW: provide endpoint for mabar layer as read-only external layer
app.get('/api/mabar', async (req, res) => {
  try {
    const now = Date.now();
    if (hasNonEmptyFeatureCollection(mabarCache.data) && mabarCache.updatedAt > 0 && now - mabarCache.updatedAt < LAYER_TTLS['main-mabar']) {
      res.setHeader('X-Cache', 'HIT');
      if (respondWithCache(req, res, mabarCache, 'mabar')) return;
      return res.json(mabarCache.data);
    }
    const start = Date.now();
    const result = await fetchMabarFromExternal();
    const took = Date.now() - start;
    res.setHeader('X-Cache', result.source === 'empty' ? 'EMPTY' : result.fromCache ? 'HIT' : 'MISS');
    res.setHeader('X-Fetch-Time-ms', String(took));
    if (result.source === 'empty') {
      return res.status(200).json(result.data);
    }
    if (respondWithCache(req, res, mabarCache, 'mabar')) return;
    return res.json(result.data);
  } catch (err) {
    console.error('mabar handler error:', err.message);
    res.status(500).json({ status: 'error', error: 'Server error', details: err.message });
  }
});
// دليل تغيير:
// اين endpointهاي سازگاري براي فرانت‌اند React اضافه شده‌اند تا شناسه و ايجاد
// عارضه main-mabar بدون وابستگي مستقيم به سرويس خارجي داخل همين سرور انجام شود.
app.get('/api/next-object-id', authMiddleware, async (req, res) => {
  try {
    const nextParcelId = await getNextFeatureObjectId('main-parcels', 1);
    const nextMahalleId = await getNextFeatureObjectId('main-mahalles', 1);
    return res.json({
      status: 'success',
      objectId: Math.max(nextParcelId, nextMahalleId),
    });
  } catch (error) {
    console.error('next-object-id handler error:', error.message);
    return res.status(500).json({ status: 'error', error: 'Failed to calculate next object id', details: error.message });
  }
});
app.get('/api/next-mabar-object-id', authMiddleware, async (req, res) => {
  try {
    const objectId = await getNextFeatureObjectId('main-mabar', 2000);
    return res.json({ status: 'success', objectId });
  } catch (error) {
    console.error('next-mabar-object-id handler error:', error.message);
    return res.status(500).json({ status: 'error', error: 'Failed to calculate next mabar object id', details: error.message });
  }
});
app.post('/api/mabar/create/', authMiddleware, async (req, res) => {
  try {
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes('main-mabar')
    ) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to main-mabar layer',
      });
    }
    const { object_id, geometry, properties = {} } = req.body || {};
    if (!geometry) {
      return res.status(400).json({ status: 'error', error: 'geometry is required' });
    }
    const resolvedObjectId = object_id ?? (await getNextFeatureObjectId('main-mabar', 2000));
    const feature = {
      type: 'Feature',
      id: String(resolvedObjectId),
      geometry,
      properties: {
        ...properties,
        OBJECTID: properties.OBJECTID ?? resolvedObjectId,
      },
    };
    const filePath = getLayerFilePath('main-mabar');
    const geojson = (await readFeatureCollectionFile(filePath)) || createEmptyFeatureCollection();
    const featureIndex = geojson.features.findIndex(
      (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') === String(feature.properties.OBJECTID)
    );
    if (featureIndex >= 0) {
      geojson.features[featureIndex] = feature;
    } else {
      geojson.features.push(feature);
    }
    await fs.writeFile(filePath, JSON.stringify(geojson, null, 2), 'utf8');
    await syncCacheState(mabarCache, writeMabarToFile, geojson, {
      etag: `W/"${hashForETag(geojson)}"`,
      updatedAt: Date.now(),
    });
    await sendToFakeSync('add_feature', 'main-mabar', feature).catch(() => {});
    try {
      io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() });
    } catch (socketError) {
      console.error('Failed to emit main-mabar update:', socketError.message);
    }
    return res.status(featureIndex >= 0 ? 200 : 201).json({
      status: 'success',
      message: featureIndex >= 0 ? 'Mabar updated successfully' : 'Mabar created successfully',
      feature,
      layer: {
        name: 'main-mabar',
        data: geojson,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('mabar/create handler error:', error.stack || error.message);
    return res.status(500).json({
      status: 'error',
      error: 'Failed to create mabar feature',
      details: error.message,
    });
  }
});
// دليل تغيير:
// فرانت چند route قديمي براي create/update/delete لايه‌هاي اصلي صدا مي‌زند؛
// اين routeهاي سازگاري همان رفتار را به backend محلي متصل مي‌کنند تا mismatch نماند.
const ensureMainLayerAccess = (req, res, layerName) => {
  if (
    req.user.role !== 'admin' &&
    req.user.role !== 'editor' &&
    !req.user.layers.includes(layerName)
  ) {
    res.status(403).json({
      status: 'error',
      error: `Access denied to ${layerName} layer`,
    });
    return false;
  }
  return true;
};
const refreshMainLayerAfterMutation = async (layerName) => {
  if (layerName === 'main-parcels') return (await fetchParcelsFromExternal()).data;
  if (layerName === 'main-mahalles') return (await fetchMahallesFromExternal()).data;
  if (layerName === 'main-mabar') return (await fetchMabarFromExternal()).data;
  return createEmptyFeatureCollection();
};
const respondMainLayerMutation = async (res, layerName, message, feature, statusCode = 200) => {
  const data = await refreshMainLayerAfterMutation(layerName).catch(async () => {
    const localData = await loadMutableMainLayerData(layerName);
    return localData;
  });
  return res.status(statusCode).json({
    status: 'success',
    message,
    feature,
    layer: {
      name: layerName,
      data,
      updatedAt: new Date().toISOString(),
    },
  });
};
app.post('/api/parcel/create/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-parcels')) return;
    const { object_id, geometry, properties = {} } = req.body || {};
    if (!geometry) {
      return res.status(400).json({ status: 'error', error: 'geometry is required' });
    }
    const feature = buildMainLayerCreateFeature('main-parcels', { object_id, geometry, properties });
    try {
      const upstream = await externalAxios.post('/api/parcel/create/', req.body, { validateStatus: null });
      if (upstream.status >= 200 && upstream.status < 300 && upstream.data?.status !== 'error') {
        await sendToFakeSync('add_feature', 'main-parcels', feature).catch(() => {});
        try { io.emit('layerUpdated', { layerName: 'main-parcels', updatedAt: new Date().toISOString() }); } catch (e) {}
        return respondMainLayerMutation(res, 'main-parcels', 'Parcel created successfully', feature, 201);
      }
      throw new Error(`Upstream returned ${upstream.status}`);
    } catch (error) {
      console.warn('parcel/create upstream unavailable, using local fallback:', error.message);
      const result = await upsertMainLayerFeatureLocal('main-parcels', feature);
      await sendToFakeSync('add_feature', 'main-parcels', feature).catch(() => {});
      try { io.emit('layerUpdated', { layerName: 'main-parcels', updatedAt: new Date().toISOString() }); } catch (e) {}
      return respondMainLayerMutation(res, 'main-parcels', 'Parcel created locally via fallback', result.feature, result.created ? 201 : 200);
    }
  } catch (error) {
    console.error('parcel/create handler error:', error.stack || error.message);
    return res.status(500).json({ status: 'error', error: 'Failed to create parcel', details: error.message });
  }
});
app.post('/api/mahalle/create/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mahalles')) return;
    const { object_id, geometry, properties = {} } = req.body || {};
    if (!geometry) {
      return res.status(400).json({ status: 'error', error: 'geometry is required' });
    }
    const feature = buildMainLayerCreateFeature('main-mahalles', { object_id, geometry, properties });
    try {
      const upstream = await externalAxios.post('/api/mahalle/create/', req.body, { validateStatus: null });
      if (upstream.status >= 200 && upstream.status < 300 && upstream.data?.status !== 'error') {
        await sendToFakeSync('add_feature', 'main-mahalles', feature).catch(() => {});
        try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch (e) {}
        return respondMainLayerMutation(res, 'main-mahalles', 'Mahalle created successfully', feature, 201);
      }
      throw new Error(`Upstream returned ${upstream.status}`);
    } catch (error) {
      console.warn('mahalle/create upstream unavailable, using local fallback:', error.message);
      const result = await upsertMainLayerFeatureLocal('main-mahalles', feature);
      await sendToFakeSync('add_feature', 'main-mahalles', feature).catch(() => {});
      try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch (e) {}
      return respondMainLayerMutation(res, 'main-mahalles', 'Mahalle created locally via fallback', result.feature, result.created ? 201 : 200);
    }
  } catch (error) {
    console.error('mahalle/create handler error:', error.stack || error.message);
    return res.status(500).json({ status: 'error', error: 'Failed to create mahalle', details: error.message });
  }
});
app.post('/api/parcel/update-geometry/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-parcels')) return;
    const { parcel_id, geometry } = req.body || {};
    if (!parcel_id || !geometry) {
      return res.status(400).json({ status: 'error', error: 'parcel_id and geometry are required' });
    }
    const result = await updateGeometryInMainLayer('main-parcels', parcel_id, geometry);
    await sendToFakeSync('update_geometry', 'main-parcels', { parcel_id, geometry }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-parcels', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-parcels', 'Parcel geometry updated successfully', result.feature || { geometry });
  } catch (error) {
    console.error('parcel/update-geometry handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to update parcel geometry', details: error.message });
  }
});
app.post('/api/mahalle/update-geometry/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mahalles')) return;
    const { mahalle_id, geometry } = req.body || {};
    if (!mahalle_id || !geometry) {
      return res.status(400).json({ status: 'error', error: 'mahalle_id and geometry are required' });
    }
    const result = await updateGeometryInMainLayer('main-mahalles', mahalle_id, geometry);
    await sendToFakeSync('update_geometry', 'main-mahalles', { mahalle_id, geometry }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mahalles', 'Mahalle geometry updated successfully', result.feature || { geometry });
  } catch (error) {
    console.error('mahalle/update-geometry handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to update mahalle geometry', details: error.message });
  }
});
app.post('/api/mabar/update-geometry/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mabar')) return;
    const { mabar_id, geometry } = req.body || {};
    if (!mabar_id || !geometry) {
      return res.status(400).json({ status: 'error', error: 'mabar_id and geometry are required' });
    }
    const result = await updateGeometryInMainLayer('main-mabar', mabar_id, geometry);
    await sendToFakeSync('update_geometry', 'main-mabar', { mabar_id, geometry }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mabar', 'Mabar geometry updated successfully', result.feature || { geometry });
  } catch (error) {
    console.error('mabar/update-geometry handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to update mabar geometry', details: error.message });
  }
});
app.post('/api/parcel/delete', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-parcels')) return;
    const { parcel_id } = req.body || {};
    if (!parcel_id) {
      return res.status(400).json({ status: 'error', error: 'parcel_id is required' });
    }
    const result = await deleteMainLayerFeatureLocal('main-parcels', parcel_id);
    await sendToFakeSync('delete_feature', 'main-parcels', { parcel_id }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-parcels', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-parcels', 'Parcel deleted successfully', { parcel_id });
  } catch (error) {
    console.error('parcel/delete handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to delete parcel', details: error.message });
  }
});
app.post('/api/mahalle/delete/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mahalles')) return;
    const { mahalle_id } = req.body || {};
    if (!mahalle_id) {
      return res.status(400).json({ status: 'error', error: 'mahalle_id is required' });
    }
    await deleteMainLayerFeatureLocal('main-mahalles', mahalle_id);
    await sendToFakeSync('delete_feature', 'main-mahalles', { mahalle_id }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mahalles', 'Mahalle deleted successfully', { mahalle_id });
  } catch (error) {
    console.error('mahalle/delete handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to delete mahalle', details: error.message });
  }
});
app.post('/api/mabar/delete', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mabar')) return;
    const { mabar_id } = req.body || {};
    if (!mabar_id) {
      return res.status(400).json({ status: 'error', error: 'mabar_id is required' });
    }
    await deleteMainLayerFeatureLocal('main-mabar', mabar_id);
    await sendToFakeSync('delete_feature', 'main-mabar', { mabar_id }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mabar', 'Mabar deleted successfully', { mabar_id });
  } catch (error) {
    console.error('mabar/delete handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to delete mabar', details: error.message });
  }
});
app.post('/api/mabar/add-feature/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mabar')) return;
    const { mabar_id, key, value } = req.body || {};
    if (!mabar_id || !key || value === undefined) {
      return res.status(400).json({ status: 'error', error: 'mabar_id, key and value are required' });
    }
    const result = await updateMainLayerPropertyLocal('main-mabar', mabar_id, key, value, 'set');
    await sendToFakeSync('add_property', 'main-mabar', { mabar_id, key, value }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mabar', 'Mabar property added successfully', result.feature);
  } catch (error) {
    console.error('mabar/add-feature handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to add mabar property', details: error.message });
  }
});
app.post('/api/mabar/update-feature/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mabar')) return;
    const { mabar_id, key, value } = req.body || {};
    if (!mabar_id || !key || value === undefined) {
      return res.status(400).json({ status: 'error', error: 'mabar_id, key and value are required' });
    }
    const result = await updateMainLayerPropertyLocal('main-mabar', mabar_id, key, value, 'set');
    await sendToFakeSync('update_property', 'main-mabar', { mabar_id, key, value }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mabar', 'Mabar property updated successfully', result.feature);
  } catch (error) {
    console.error('mabar/update-feature handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to update mabar property', details: error.message });
  }
});
app.post('/api/mabar/delete-feature/', authMiddleware, async (req, res) => {
  try {
    if (!ensureMainLayerAccess(req, res, 'main-mabar')) return;
    const { mabar_id, key } = req.body || {};
    if (!mabar_id || !key) {
      return res.status(400).json({ status: 'error', error: 'mabar_id and key are required' });
    }
    const result = await updateMainLayerPropertyLocal('main-mabar', mabar_id, key, undefined, 'delete');
    await sendToFakeSync('delete_property', 'main-mabar', { mabar_id, key }).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mabar', updatedAt: new Date().toISOString() }); } catch (e) {}
    return respondMainLayerMutation(res, 'main-mabar', 'Mabar property deleted successfully', result.feature);
  } catch (error) {
    console.error('mabar/delete-feature handler error:', error.stack || error.message);
    return res.status(error.status || 500).json({ status: 'error', error: 'Failed to delete mabar property', details: error.message });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        error: 'Username and password are required',
      });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ status: 'error', error: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ status: 'error', error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user._id, role: user.role, tools: user.tools, layers: user.layers },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({
      status: 'success',
      message: 'Login successful',
      token,
      role: user.role,
      tools: user.tools,
      layers: user.layers,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Login failed',
      details: error.message,
    });
  }
});
app.post('/api/auth/login', async (req, res, next) => {
  req.url = '/api/login';
  app.handle(req, res, next);
});
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const user = await User.findOne({ _id: req.user.id });
  if (!user) return res.status(404).json({ status: 'error', error: 'User not found' });
  res.json({
    status: 'success',
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      tools: user.tools,
      layers: user.layers,
    },
  });
});
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username || !password) {
      return res.status(400).json({ status: 'error', error: 'Username and password are required' });
    }
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ status: 'error', error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      role,
      tools: ['stats', 'filter', 'spatial', 'visual', 'draw'],
      layers: ['main-parcels', 'main-mahalles', 'main-mabar'],
    });
    await newUser.save();
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role, tools: newUser.tools, layers: newUser.layers },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({
      status: 'success',
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        tools: newUser.tools,
        layers: newUser.layers,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});
app.post('/api/register', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password, role, tools, layers } = req.body;
    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        error: 'Username and password are required',
      });
    }
    if (await User.findOne({ username })) {
      return res.status(400).json({
        status: 'error',
        error: 'Username already exists',
      });
    }
    const validTools = [
      'stats',
      'edit',
      'export',
      'spatial',
      'visual',
      'network',
      'join',
      'modeling',
      'draw',
      'filter',
      'search',
    ];
    if (tools && tools.some((tool) => !validTools.includes(tool))) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid tools provided',
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      role: role || 'user',
      tools: tools || [],
      layers: layers || [],
    });
    await user.save();
    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      username: user.username,
      user: { tools: user.tools, layers: user.layers },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to register user',
      details: error.message,
    });
  }
});
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({
      status: 'success',
      message: 'Users fetched successfully',
      users,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch users',
      details: error.message,
    });
  }
});
app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, tools, layers } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, tools, layers },
      { new: true }
    ).select('-password');
    if (!user) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found',
      });
    }
    res.json({
      status: 'success',
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to update user',
      details: error.message,
    });
  }
});
app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        error: 'User not found',
      });
    }
    res.json({
      status: 'success',
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete user',
      details: error.message,
    });
  }
});
app.get('/api/layers', optionalAuthMiddleware, async (req, res) => {
  try {
    const storage = req.query.storage || 'db';
    if (!['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: "Storage must be 'db' or 'local'",
      });
    }
    let layers = [];
    if (storage === 'db') {
      const dbLayers = await Layer.find({ storage: 'db' });
      layers = dbLayers.map((layer) => ({
        name: layer.name,
        count: layer.data.features?.length || 0,
        storage: 'db',
        data: layer.data,
        color: layer.color,
        version: layer.updatedAt.getTime(),
        updatedAt: layer.updatedAt,
      }));
      // دليل تغيير:
      // ليست لايه‌ها هم بايد همان زنجيره fallback را رعايت کند؛ وگرنه
      // در قطع API خارجي، فرانت‌اند اصلاً سه لايه اصلي را نخواهد ديد.
      const mainLayerFetchers = [
        ['main-parcels', fetchParcelsFromExternal],
        ['main-mahalles', fetchMahallesFromExternal],
        ['main-mabar', fetchMabarFromExternal],
      ];
      const mainLayers = [];
      for (const [layerName, fetcher] of mainLayerFetchers) {
        try {
          const result = await fetcher();
          if (isFeatureCollection(result?.data)) {
            mainLayers.push(buildMainLayerSummary(layerName, result.data));
          }
        } catch (error) {
          mainLayers.push(buildMainLayerSummary(layerName, createEmptyFeatureCollection()));
        }
      }
      // Combine main layers with database layers without duplicate layer names
      const layerMap = new Map();
      for (const l of mainLayers) {
        layerMap.set(l.name, l);
      }
      for (const l of layers) {
        if (!layerMap.has(l.name)) {
          layerMap.set(l.name, l);
        }
      }
      layers = Array.from(layerMap.values());
    } else if (storage === 'local') {
      const files = await fs.readdir(DATA_DIR);
      layers = await Promise.all(
        files
          .filter((file) => file.endsWith('.geojson'))
          .map(async (file) => {
            const data = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
            const geojson = JSON.parse(data);
            const stat = await fs.stat(path.join(DATA_DIR, file));
            return {
              name: path.basename(file, '.geojson'),
              count: geojson.features?.length || 0,
              storage: 'local',
              data: geojson,
              version: stat.mtimeMs,
              updatedAt: stat.mtime.toISOString(),
            };
          })
      );
    }
    const accessibleLayers = layers.filter((layer) => {
      if (!req.user) return true;
      if (layer.storage === 'local' || layer.storage === 'external') return true;
      return req.user.role === 'admin' || req.user.layers?.includes(layer.name);
    });
    res.json({
      status: 'success',
      message: 'Layers fetched successfully',
      layers: accessibleLayers,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch layers',
      details: error.message,
    });
  }
});
app.get('/api/layers/:name', optionalAuthMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    let data = null;
    if (name === 'main-parcels') {
      const result = await fetchParcelsFromExternal();
      data = result.data;
    } else if (name === 'main-mahalles') {
      const result = await fetchMahallesFromExternal();
      data = result.data;
    } else if (name === 'main-mabar') {
      const result = await fetchMabarFromExternal();
      data = result.data;
    } else {
      const layer = await Layer.findOne({ name });
      if (layer) data = layer.data;
    }
    if (!data) return res.status(404).json({ status: 'error', error: 'Layer not found' });
    res.json({
      status: 'success',
      layer: {
        name,
        data,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});
const updateFeatureInLayer = async (
  layerName,
  featureId,
  updatedFeature,
  properties,
  key,
  value,
  storage,
  expectedVersion
) => {
  // Returns standardized object:
  // { layer: { name, data, version, updatedAt }, updatedFeature }
  if (storage === 'db') {
    let layer = await Layer.findOne({ name: layerName, storage: 'db' });
    if (!layer) {
      const e = new Error(`Layer ${layerName} not found`);
      e.cause = { status: 404 };
      throw e;
    }
    if (expectedVersion && layer.updatedAt.getTime() > Number(expectedVersion)) {
      const e = new Error('Conflict: layer has been modified on server');
      e.cause = {
        status: 409,
        layer: {
          name: layerName,
          data: layer.data,
          version: layer.updatedAt.getTime(),
          updatedAt: layer.updatedAt.toISOString(),
        },
      };
      throw e;
    }
    const featureIndex = layer.data.features.findIndex(
      (f) => String(f.properties?.OBJECTID ?? f.id ?? '') === String(featureId)
    );
    if (featureIndex === -1) {
      const e = new Error('Feature not found');
      e.cause = { status: 404 };
      throw e;
    }
    if (updatedFeature) {
      layer.data.features[featureIndex].geometry =
        updatedFeature.geometry ?? layer.data.features[featureIndex].geometry;
      layer.data.features[featureIndex].properties = {
        ...layer.data.features[featureIndex].properties,
        ...(updatedFeature.properties || {}),
      };
      if (updatedFeature.id) layer.data.features[featureIndex].id = updatedFeature.id;
    } else if (properties) {
      layer.data.features[featureIndex].properties = {
        ...layer.data.features[featureIndex].properties,
        ...properties,
      };
    } else if (key && value !== undefined) {
      layer.data.features[featureIndex].properties = {
        ...layer.data.features[featureIndex].properties,
        [key]: value,
      };
    } else {
      const e = new Error('No updatedFeature, properties, or key/value provided');
      e.cause = { status: 400 };
      throw e;
    }
    layer.updatedAt = new Date();
    await layer.save();
    const standardized = {
      name: layer.name,
      data: layer.data,
      version: layer.updatedAt.getTime(),
      updatedAt: layer.updatedAt.toISOString(),
    };
    return { layer: standardized, updatedFeature: layer.data.features[featureIndex] };
  } else {
    const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
    let geojson;
    try {
      geojson = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (err) {
      const e = new Error(`Layer ${layerName} not found`);
      e.cause = { status: 404 };
      throw e;
    }
    if (expectedVersion) {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs > Number(expectedVersion)) {
        const e = new Error('Conflict: layer has been modified on server');
        e.cause = {
          status: 409,
          layer: {
            name: layerName,
            data: geojson,
            version: stat.mtimeMs,
            updatedAt: stat.mtime.toISOString(),
          },
        };
        throw e;
      }
    }
    const featureIndex = geojson.features.findIndex(
      (f) => String(f.properties?.OBJECTID ?? f.id ?? '') === String(featureId)
    );
    if (featureIndex === -1) {
      const e = new Error('Feature not found');
      e.cause = { status: 404 };
      throw e;
    }
    if (updatedFeature) {
      geojson.features[featureIndex].geometry =
        updatedFeature.geometry ?? geojson.features[featureIndex].geometry;
      geojson.features[featureIndex].properties = {
        ...geojson.features[featureIndex].properties,
        ...(updatedFeature.properties || {}),
      };
      if (updatedFeature.id) geojson.features[featureIndex].id = updatedFeature.id;
    } else if (properties) {
      geojson.features[featureIndex].properties = {
        ...geojson.features[featureIndex].properties,
        ...properties,
      };
    } else if (key && value !== undefined) {
      geojson.features[featureIndex].properties = {
        ...geojson.features[featureIndex].properties,
        [key]: value,
      };
    } else {
      const e = new Error('No updatedFeature, properties, or key/value provided');
      e.cause = { status: 400 };
      throw e;
    }
    await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
    const stat = await fs.stat(filePath);
    const standardized = {
      name: layerName,
      data: geojson,
      version: stat.mtimeMs,
      updatedAt: stat.mtime.toISOString(),
    };
    return {
      layer: standardized,
      updatedFeature: geojson.features[featureIndex],
    };
  }
};
// Updated: Handle geometry updates for main-parcels and main-mahalles
const updateGeometryInMainLayer = async (layerName, featureId, geometry) => {
  const idStr = String(featureId);
  let externalResponse;
  let endpoint;
  let payload;
  if (layerName === 'main-parcels') {
    payload = { parcel_id: Number(idStr), geometry };
    endpoint = '/api/parcel/update-geometry/';
  } else if (layerName === 'main-mahalles') {
    payload = { mahalle_id: Number(idStr), geometry };
    endpoint = `${MAHALLE_PREFIX}/update-geometry/`;
  } else if (layerName === 'main-mabar') {
    payload = { mabar_id: Number(idStr), geometry };
    endpoint = '/api/mabar/update-geometry/';
  } else {
    throw new Error(`Unsupported layer for geometry update: ${layerName}`);
  }
  try {
    // Try with trailing slash first, fallback without
    const fallbackEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : `${endpoint}/`;
    try {
      externalResponse = await externalAxios.post(endpoint, payload, { validateStatus: null });
    } catch (err) {
      console.warn(`External POST failed for ${endpoint}:`, err.message);
      try {
        externalResponse = await externalAxios.post(fallbackEndpoint, payload, { validateStatus: null });
      } catch (err2) {
        console.error(`External POST fallback failed for ${fallbackEndpoint}:`, err2.message);
        throw err2;
      }
    }
    if (externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      console.error(`Upstream geometry update failed:`, {
        status: externalResponse.status,
        data: externalResponse.data,
        endpoint,
        payload,
      });
      throw new Error(`Upstream API returned ${externalResponse.status}: ${JSON.stringify(externalResponse.data)}`);
    }
    console.log(`Geometry updated successfully for ${layerName} ${idStr} via ${endpoint}`);
    return externalResponse.data;
  } catch (error) {
    console.warn(`External geometry update failed for ${layerName}, using local fallback:`, error.message);
    const localResult = await updateMainLayerGeometryLocal(layerName, idStr, geometry);
    return {
      status: 'success',
      message: 'Geometry updated locally via fallback',
      feature: localResult.feature,
      layer: {
        name: layerName,
        data: localResult.layer,
        updatedAt: new Date().toISOString(),
      },
      fallback: true,
    };
  }
};
app.post('/api/update-feature', authMiddleware, async (req, res) => {
  try {
    const { layerName, updatedFeature, id, properties, key, value, expectedVersion, storage, updates } =
      req.body;
    if (!layerName || (!['db', 'local'].includes(storage) && !['main-parcels', 'main-mahalles', 'main-mabar'].includes(layerName))) {
      return res.status(400).json({
        status: 'error',
        error: "layerName is required and storage must be 'db' or 'local' for non-main layers",
      });
    }
    const featureId = id ?? updatedFeature?.properties?.OBJECTID ?? updatedFeature?.id ?? properties?.OBJECTID;
    if (!featureId && !['main-parcels', 'main-mahalles', 'main-mabar'].includes(layerName)) {
      return res.status(400).json({
        status: 'error',
        error: 'Feature ID (object_id or id) is required for non-main-parcels layers',
      });
    }
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes(layerName)
    ) {
      return res.status(403).json({
        status: 'error',
        error: `Access denied to layer ${layerName}`,
      });
    }
    // NEW: Handle geometry updates for main-parcels and main-mahalles
    if (['main-parcels', 'main-mahalles', 'main-mabar'].includes(layerName) && updatedFeature?.geometry) {
      try {
        const geometryResponse = await updateGeometryInMainLayer(layerName, featureId, updatedFeature.geometry);
        // Refresh local cache immediately
        let updatedLayerData = null;
        try {
          if (layerName === 'main-parcels') {
            parcelsCache.updatedAt = 0; // force refresh
            const refreshed = await fetchParcelsFromExternal().catch(() => null);
            updatedLayerData = refreshed?.data ?? parcelsCache.data;
          } else if (layerName === 'main-mahalles') {
            mahallesCache.updatedAt = 0;
            const refreshed = await fetchMahallesFromExternal().catch(() => null);
            updatedLayerData = refreshed?.data ?? mahallesCache.data;
          } else if (layerName === 'main-mabar') {
            mabarCache.updatedAt = 0;
            const refreshed = await fetchMabarFromExternal().catch(() => null);
            updatedLayerData = refreshed?.data ?? mabarCache.data;
          }
          if (updatedFeature?.properties && updatedLayerData) {
            const mutable = await loadMutableMainLayerData(layerName);
            const targetIndex = mutable.features.findIndex(
              (item) => String(item?.properties?.OBJECTID ?? item?.id ?? '') === String(featureId)
            );
            if (targetIndex >= 0) {
              mutable.features[targetIndex] = {
                ...mutable.features[targetIndex],
                geometry: updatedFeature.geometry ?? mutable.features[targetIndex].geometry,
                properties: {
                  ...(mutable.features[targetIndex].properties || {}),
                  ...(updatedFeature.properties || {}),
                },
                id: updatedFeature.id ?? mutable.features[targetIndex].id,
              };
              updatedLayerData = await persistMutableMainLayerData(layerName, mutable);
            }
          }
        } catch (refreshErr) {
          console.error('Failed to refresh main layer after geometry update:', refreshErr.message);
        }
        // Notify clients
        try {
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        } catch (e) {
          console.warn('Socket emit failed:', e);
        }
        // Send to fake-sync
        await sendToFakeSync('update_geometry', layerName, {
          [layerName === 'main-parcels' ? 'parcel_id' : layerName === 'main-mahalles' ? 'mahalle_id' : 'mabar_id']: featureId,
          geometry: updatedFeature.geometry,
        }).catch(() => {});
        return res.json({
          status: 'success',
          message: 'Geometry updated successfully in main layer',
          feature: { ...updatedFeature, geometry: updatedFeature.geometry },
          layer: {
            name: layerName,
            data: updatedLayerData,
            version: Date.now(),
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('Geometry update error:', error.message);
        return res.status(500).json({
          status: 'error',
          error: `Failed to update geometry in ${layerName}: ${error.message}`,
        });
      }
    }
    // ORIGINAL: Handle property updates for main-parcels and main-mahalles
    if (layerName === 'main-parcels' || layerName === 'main-mahalles') {
      const idStr = String(featureId);
      let results = [];
      let updatedLayerData = null;
      if (updates && typeof updates === 'object' && !Array.isArray(updates)) {
        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            status: 'error',
            error: 'updates object is empty',
          });
        }
        const limit = pLimit(8);
        const entries = Object.entries(updates);
        const tasks = entries.map(([k, v]) =>
          limit(async () => {
            const start = Date.now();
            try {
              // choose payload & endpoint depending on layerName
              if (layerName === 'main-parcels') {
                try {
                  const externalResponse = await externalAxios.post('/api/update-feature/', {
                    parcel_id: idStr,
                    key: k,
                    value: v,
                  }, { validateStatus: null });
                  console.log(`external parcels update key=${k} took ${Date.now() - start}ms`);
                  if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
                    await sendToFakeSync('update_property', layerName, {
                      parcel_id: idStr,
                      key: k,
                      value: v,
                    });
                    return {
                      key: k,
                      status: 'success',
                      feature: externalResponse.data.feature || null,
                    };
                  }
                  throw new Error(`Upstream returned ${externalResponse.status}`);
                } catch (externalError) {
                  console.warn(`Falling back to local parcel property update for key=${k}:`, externalError.message);
                  const localResult = await updateMainLayerPropertyLocal('main-parcels', idStr, k, v, 'set');
                  await sendToFakeSync('update_property', layerName, {
                    parcel_id: idStr,
                    key: k,
                    value: v,
                  }).catch(() => {});
                  return {
                    key: k,
                    status: 'success',
                    feature: localResult.feature,
                    fallback: true,
                  };
                }
              } else {
                // main-mahalles -> use mahalle/update-feature/
                try {
                  const externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/update-feature/`, {
                    mahalle_id: idStr,
                    key: k,
                    value: v,
                  }, { validateStatus: null });
                  console.log(`external mahalles update key=${k} took ${Date.now() - start}ms`);
                  if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
                    await sendToFakeSync('update_property', layerName, {
                      mahalle_id: idStr,
                      key: k,
                      value: v,
                    });
                    return {
                      key: k,
                      status: 'success',
                      feature: externalResponse.data.feature || null,
                    };
                  }
                  throw new Error(`Upstream returned ${externalResponse.status}`);
                } catch (externalError) {
                  console.warn(`Falling back to local mahalle property update for key=${k}:`, externalError.message);
                  const localResult = await updateMainLayerPropertyLocal('main-mahalles', idStr, k, v, 'set');
                  await sendToFakeSync('update_property', layerName, {
                    mahalle_id: idStr,
                    key: k,
                    value: v,
                  }).catch(() => {});
                  return {
                    key: k,
                    status: 'success',
                    feature: localResult.feature,
                    fallback: true,
                  };
                }
              }
            } catch (extErr) {
              console.error(`External update error for key=${k}:`, extErr.message);
              return {
                key: k,
                status: 'error',
                error: extErr.message,
                details: extErr.response?.data || null,
              };
            }
          })
        );
        results = await Promise.all(tasks);
      } else if (key && value !== undefined) {
        try {
          if (layerName === 'main-parcels') {
            try {
              const externalResponse = await externalAxios.post('/api/update-feature/', {
                parcel_id: idStr,
                key,
                value,
              }, { validateStatus: null });
              if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
                results.push({
                  key,
                  status: 'success',
                  feature: externalResponse.data.feature || null,
                });
                await sendToFakeSync('update_property', 'main-parcels', {
                  parcel_id: idStr,
                  key,
                  value,
                });
              } else {
                throw new Error(`Upstream returned ${externalResponse.status}`);
              }
            } catch (externalError) {
              const localResult = await updateMainLayerPropertyLocal('main-parcels', idStr, key, value, 'set');
              results.push({
                key,
                status: 'success',
                feature: localResult.feature,
                fallback: true,
              });
              await sendToFakeSync('update_property', 'main-parcels', {
                parcel_id: idStr,
                key,
                value,
              }).catch(() => {});
            }
          } else {
            // main-mahalles
            try {
              const externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/update-feature/`, {
                mahalle_id: idStr,
                key,
                value,
              }, { validateStatus: null });
              if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
                results.push({
                  key,
                  status: 'success',
                  feature: externalResponse.data.feature || null,
                });
                await sendToFakeSync('update_property', 'main-mahalles', {
                  mahalle_id: idStr,
                  key,
                  value,
                });
              } else {
                throw new Error(`Upstream returned ${externalResponse.status}`);
              }
            } catch (externalError) {
              const localResult = await updateMainLayerPropertyLocal('main-mahalles', idStr, key, value, 'set');
              results.push({
                key,
                status: 'success',
                feature: localResult.feature,
                fallback: true,
              });
              await sendToFakeSync('update_property', 'main-mahalles', {
                mahalle_id: idStr,
                key,
                value,
              }).catch(() => {});
            }
          }
        } catch (extErr) {
          console.error(`External update error for key=${key}:`, extErr.message);
          return res.status(500).json({
            status: 'error',
            error: 'Failed to update property in main layer',
            details: extErr.message,
          });
        }
      } else {
        return res.status(400).json({
          status: 'error',
          error: 'parcel_id/mahalle_id and either `key`+`value` or `updates` object are required for main layers',
        });
      }
      // Invalidate and refresh local cache immediately (best-effort)
      try {
        if (layerName === 'main-parcels') {
          parcelsCache.updatedAt = 0; // force next fetch to go upstream
          const refreshed = await fetchParcelsFromExternal().catch(() => null);
          if (refreshed?.data) {
            updatedLayerData = refreshed.data;
          } else if (parcelsCache.data) {
            updatedLayerData = parcelsCache.data;
          }
        } else if (layerName === 'main-mahalles') {
          mahallesCache.updatedAt = 0;
          const refreshed = await fetchMahallesFromExternal().catch(() => null);
          if (refreshed?.data) {
            updatedLayerData = refreshed.data;
          } else if (mahallesCache.data) {
            updatedLayerData = mahallesCache.data;
          }
        }
      } catch (refreshErr) {
        console.error('Failed to refresh main layer:', refreshErr.message);
      }
      // notify clients immediately
      try {
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      } catch (e) {
        console.warn('Socket emit failed:', e);
      }
      const failed = results.filter((r) => r.status !== 'success');
      if (failed.length > 0) {
        return res.status(207).json({
          status: 'partial',
          message: 'Some properties updated, some failed',
          results,
          layer: {
            name: layerName,
            data: updatedLayerData,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      return res.json({
        status: 'success',
        message: 'Properties updated successfully in main layer',
        results,
        layer: {
          name: layerName,
          data: updatedLayerData,
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      // Original logic for DB/local layers
      try {
        const { layer, updatedFeature: updated } = await updateFeatureInLayer(
          layerName,
          featureId,
          updatedFeature,
          properties,
          key,
          value,
          storage,
          expectedVersion
        );
        await sendToFakeSync('update_feature', layerName, updated);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.json({
          status: 'success',
          message: 'Feature updated successfully',
          feature: updated,
          layer,
        });
      } catch (error) {
        if (error.cause?.status) {
          return res.status(error.cause.status).json({
            status: 'error',
            error: error.message,
            layer: error.cause.layer,
          });
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('Update feature error:', error.stack || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Failed to update feature',
      details: error.message,
    });
  }
});
app.post('/api/add-feature', authMiddleware, async (req, res) => {
  try {
    const { layerName, newFeature, storage, expectedVersion } = req.body;
    if (!layerName || !newFeature || !newFeature.properties?.OBJECTID || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'layerName, newFeature, OBJECTID, and storage are required',
      });
    }
    // permission: match update-feature (admin | editor | layer in user's layers)
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes(layerName)
    ) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to this layer',
      });
    }
    const featureId = String(newFeature.properties?.OBJECTID ?? newFeature.id);
    if (!featureId) {
      return res.status(400).json({ status: 'error', error: 'Invalid feature id' });
    }
    // DB-backed storage
    if (storage === 'db') {
      let layer = await Layer.findOne({ name: layerName, storage: 'db' });
      // create layer if not exists and add feature
      if (!layer) {
        layer = new Layer({
          name: layerName,
          data: { type: 'FeatureCollection', features: [newFeature] },
          storage: 'db',
        });
        layer.updatedAt = new Date();
        await layer.save();
        const responseLayer = makeLayerResponse(layer, 'db');
        await sendToFakeSync('add_feature', layerName, newFeature);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(201).json({
          status: 'success',
          message: 'Feature added successfully (new layer created)',
          layer: responseLayer,
          feature: newFeature,
        });
      }
      // if feature exists -> delegate to updateFeatureInLayer (same behavior as update)
      const existsIndex = layer.data.features.findIndex(
        (f) => String(f.properties?.OBJECTID ?? f.id ?? '') === featureId
      );
      if (existsIndex !== -1) {
        try {
          const { layer: standardized, updatedFeature } = await updateFeatureInLayer(
            layerName,
            featureId,
            newFeature, // use incoming feature as updatedFeature
            null,
            null,
            undefined,
            'db',
            expectedVersion
          );
          await sendToFakeSync('update_feature', layerName, updatedFeature);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          return res.json({
            status: 'success',
            message: 'Feature existed and was updated',
            feature: updatedFeature,
            layer: standardized,
          });
        } catch (err) {
          if (err.cause?.status) {
            return res.status(err.cause.status).json({
              status: 'error',
              error: err.message,
              layer: err.cause.layer,
            });
          }
          throw err;
        }
      }
      // feature not exists -> add it
      layer.data.features.push(newFeature);
      layer.updatedAt = new Date();
      await layer.save();
      const responseLayer = makeLayerResponse(layer, 'db');
      await sendToFakeSync('add_feature', layerName, newFeature);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      return res.status(201).json({
        status: 'success',
        message: 'Feature added successfully',
        layer: responseLayer,
        feature: newFeature,
      });
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      let geojson;
      try {
        geojson = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch (err) {
        // if file doesn't exist -> create it with the new feature
        if (err.code === 'ENOENT') {
          const newGeo = { type: 'FeatureCollection', features: [newFeature] };
          await fs.writeFile(filePath, JSON.stringify(newGeo, null, 2));
          const stat = await fs.stat(filePath);
          const responseLayer = { name: layerName, data: newGeo, version: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
          await sendToFakeSync('add_feature', layerName, newFeature);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          return res.status(201).json({
            status: 'success',
            message: 'Feature added successfully (new local layer created)',
            layer: responseLayer,
            feature: newFeature,
          });
        }
        throw err;
      }
      const featureIndex = geojson.features.findIndex(
        (f) => String(f.properties?.OBJECTID ?? f.id ?? '') === featureId
      );
      if (featureIndex !== -1) {
        // existing -> reuse updateFeatureInLayer for consistency
        try {
          const { layer: standardized, updatedFeature } = await updateFeatureInLayer(
            layerName,
            featureId,
            newFeature,
            null,
            null,
            undefined,
            'local',
            expectedVersion
          );
          await sendToFakeSync('update_feature', layerName, updatedFeature);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          return res.json({
            status: 'success',
            message: 'Feature existed and was updated',
            feature: updatedFeature,
            layer: standardized,
          });
        } catch (err) {
          if (err.cause?.status) {
            return res.status(err.cause.status).json({
              status: 'error',
              error: err.message,
              layer: err.cause.layer,
            });
          }
          throw err;
        }
      }
      // not exists -> add and save file
      geojson.features.push(newFeature);
      await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
      const stat = await fs.stat(filePath);
      const responseLayer = { name: layerName, data: geojson, version: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
      await sendToFakeSync('add_feature', layerName, newFeature);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      return res.status(201).json({
        status: 'success',
        message: 'Feature added successfully',
        layer: responseLayer,
        feature: newFeature,
      });
    }
  } catch (error) {
    console.error('Add feature error:', error.stack || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add feature',
      details: error.message,
    });
  }
});
/* ----------------------------------------------------------------------
   New: MAHALLE endpoints that mirror main-parcels behavior:
   - POST /api/mahalle/update-feature/
   - POST /api/mahalle/delete-feature/
   - POST /api/mahalle/add-feature/
   These endpoints expect payload:
     - mahalle_id === OBJECTID (stringable)
     - for add/update: key + value   OR updates object
     - for delete: key (no value required)
   ---------------------------------------------------------------------- */
// MAHALLE: update-feature (behaves like main-parcels /api/update-feature for parcels)
app.post('/api/mahalle/update-feature/', authMiddleware, async (req, res) => {
  try {
    const { mahalle_id, key, value, updates } = req.body;
    if (!mahalle_id) {
      return res.status(400).json({ status: 'error', error: 'mahalle_id is required' });
    }
    if (!updates && (key === undefined || value === undefined)) {
      return res.status(400).json({
        status: 'error',
        error: 'Either `updates` (object) or `key`+`value` must be provided',
      });
    }
    // permission: admin | editor | user.layers contains main-mahalles
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes('main-mahalles')
    ) {
      return res.status(403).json({ status: 'error', error: 'Access denied to main-mahalles layer' });
    }
    const idStr = String(mahalle_id);
    const results = [];
    let updatedLayerData = null;
    if (updates && typeof updates === 'object' && !Array.isArray(updates)) {
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ status: 'error', error: 'updates object is empty' });
      }
      const limit = pLimit(8);
      const entries = Object.entries(updates);
      const tasks = entries.map(([k, v]) =>
        limit(async () => {
          const start = Date.now();
          try {
            try {
              const externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/update-feature/`, {
                mahalle_id: idStr,
                key: k,
                value: v,
              }, { validateStatus: null });
              console.log(`external mahalle update key=${k} took ${Date.now() - start}ms`);
              if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
                await sendToFakeSync('update_property', 'main-mahalles', {
                  mahalle_id: idStr,
                  key: k,
                  value: v,
                }).catch(() => {});
                return {
                  key: k,
                  status: 'success',
                  feature: externalResponse.data.feature || null,
                };
              }
              throw new Error(`Upstream returned ${externalResponse.status}`);
            } catch (externalError) {
              const localResult = await updateMainLayerPropertyLocal('main-mahalles', idStr, k, v, 'set');
              await sendToFakeSync('update_property', 'main-mahalles', {
                mahalle_id: idStr,
                key: k,
                value: v,
              }).catch(() => {});
              return {
                key: k,
                status: 'success',
                feature: localResult.feature,
                fallback: true,
              };
            }
          } catch (extErr) {
            console.error(`External mahalle update error for key=${k}:`, extErr.message);
            return { key: k, status: 'error', error: extErr.message, details: extErr.response?.data || null };
          }
        })
      );
      const all = await Promise.all(tasks);
      results.push(...all);
    } else {
      // single key/value
      try {
        try {
          const externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/update-feature/`, {
            mahalle_id: idStr,
            key,
            value,
          }, { validateStatus: null });
          if (externalResponse.status === 200 && externalResponse.data?.status === 'success') {
            results.push({ key, status: 'success', feature: externalResponse.data.feature || null });
            await sendToFakeSync('update_property', 'main-mahalles', { mahalle_id: idStr, key, value }).catch(() => {});
          } else {
            throw new Error(`Upstream returned ${externalResponse.status}`);
          }
        } catch (externalError) {
          const localResult = await updateMainLayerPropertyLocal('main-mahalles', idStr, key, value, 'set');
          results.push({ key, status: 'success', feature: localResult.feature, fallback: true });
          await sendToFakeSync('update_property', 'main-mahalles', { mahalle_id: idStr, key, value }).catch(() => {});
        }
      } catch (extErr) {
        console.error('External mahalle update error:', extErr.message);
        return res.status(500).json({ status: 'error', error: 'Failed to update mahalle property', details: extErr.message });
      }
    }
    // invalidate & refresh cache best-effort
    try {
      mahallesCache.updatedAt = 0;
      const refreshed = await fetchMahallesFromExternal().catch(() => null);
      updatedLayerData = refreshed?.data ?? mahallesCache.data;
    } catch (refreshErr) {
      console.warn('Failed to refresh mahalles after update:', refreshErr.message);
    }
    // notify clients
    try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch(e){}
    const failed = results.filter((r) => r.status !== 'success');
    if (failed.length > 0) {
      return res.status(207).json({
        status: 'partial',
        message: 'Some properties updated, some failed',
        results,
        layer: { name: 'main-mahalles', data: updatedLayerData, updatedAt: new Date().toISOString() },
      });
    }
    return res.json({
      status: 'success',
      message: 'Properties updated successfully in main-mahalles',
      results,
      layer: { name: 'main-mahalles', data: updatedLayerData, updatedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error('mahalle update-feature handler error:', err.stack || err.message);
    res.status(500).json({ status: 'error', error: 'Server error', details: err.message });
  }
});
// MAHALLE: delete-feature (behaves like delete-parcel-property but for mahalles)
app.post('/api/mahalle/delete-feature/', authMiddleware, async (req, res) => {
  try {
    const { mahalle_id, key } = req.body;
    if (!mahalle_id || !key) {
      return res.status(400).json({ status: 'error', error: 'mahalle_id and key are required' });
    }
    // permission
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes('main-mahalles')
    ) {
      return res.status(403).json({ status: 'error', error: 'Access denied to main-mahalles layer' });
    }
    const payload = { mahalle_id: String(mahalle_id), key };
    // attempt external (with trailing slash, fallback)
    let externalResponse;
    try {
      externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/delete-feature/`, payload, { validateStatus: null });
    } catch (err) {
      console.warn('externalAxios POST failed for mahalle delete-feature:', err.message);
      try {
        externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/delete-feature`, payload, { validateStatus: null });
      } catch (err2) {
        console.warn('mahalle delete-feature upstream unavailable, using local fallback:', err2.message);
      }
    }
    if (!externalResponse || externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      await updateMainLayerPropertyLocal('main-mahalles', payload.mahalle_id, key, undefined, 'delete');
    }
    // refresh cache best-effort
    try {
      const refreshResp = await externalAxios.get('/api/mahalles', { validateStatus: null });
      if (refreshResp?.data) {
        let geojsonData = { type: 'FeatureCollection', features: [] };
        if (refreshResp.data.results && Array.isArray(refreshResp.data.results)) {
          geojsonData.features = refreshResp.data.results.map((item) => ({
            type: 'Feature',
            id: item.id,
            geometry: item.geometry,
            properties: item.properties,
          }));
        } else if (refreshResp.data.type === 'FeatureCollection') {
          geojsonData = refreshResp.data;
        }
        mahallesCache.data = geojsonData;
        mahallesCache.updatedAt = Date.now();
        writeMahallesToFile(geojsonData).catch(() => {});
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh mahalles after delete:', refreshErr.message);
    }
    await sendToFakeSync('delete_property', 'main-mahalles', payload).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch(e){}
    return res.json({
      status: 'success',
      message: 'Property deleted successfully (mahalle)',
      feature: externalResponse?.data?.feature || null,
      layer: { name: 'main-mahalles', data: mahallesCache.data, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('mahalle delete-feature handler error:', error.stack || error.message);
    res.status(500).json({ status: 'error', error: 'Failed to delete property', details: error.message });
  }
});
// MAHALLE: add-feature (behaves like add-parcel-property / add-feature for parcels)
app.post('/api/mahalle/add-feature/', authMiddleware, async (req, res) => {
  try {
    const { mahalle_id, key, value } = req.body;
    if (!mahalle_id || !key || value === undefined) {
      return res.status(400).json({ status: 'error', error: 'mahalle_id, key and value are required' });
    }
    // permission
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'editor' &&
      !req.user.layers.includes('main-mahalles')
    ) {
      return res.status(403).json({ status: 'error', error: 'Access denied to main-mahalles layer' });
    }
    const payload = { mahalle_id: String(mahalle_id), key, value };
    let externalResponse;
    try {
      externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/add-feature/`, payload, { validateStatus: null });
    } catch (err) {
      console.warn('externalAxios POST failed for mahalle add-feature:', err.message);
      try {
        externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/add-feature`, payload, { validateStatus: null });
      } catch (err2) {
        console.warn('mahalle add-feature upstream unavailable, using local fallback:', err2.message);
      }
    }
    if (!externalResponse || externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      await updateMainLayerPropertyLocal('main-mahalles', payload.mahalle_id, key, value, 'set');
    }
    // refresh cache best-effort
    try {
      const refreshResp = await externalAxios.get('/api/mahalles', { validateStatus: null });
      if (refreshResp?.data) {
        let geojsonData = { type: 'FeatureCollection', features: [] };
        if (refreshResp.data.results && Array.isArray(refreshResp.data.results)) {
          geojsonData.features = refreshResp.data.results.map((item) => ({
            type: 'Feature',
            id: item.id,
            geometry: item.geometry,
            properties: item.properties,
          }));
        } else if (refreshResp.data.type === 'FeatureCollection') {
          geojsonData = refreshResp.data;
        }
        mahallesCache.data = geojsonData;
        mahallesCache.updatedAt = Date.now();
        writeMahallesToFile(geojsonData).catch(() => {});
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh mahalles after add:', refreshErr.message);
    }
    await sendToFakeSync('add_property', 'main-mahalles', payload).catch(() => {});
    try { io.emit('layerUpdated', { layerName: 'main-mahalles', updatedAt: new Date().toISOString() }); } catch(e){}
    return res.json({
      status: 'success',
      message: 'Property added successfully (mahalle)',
      feature: externalResponse?.data?.feature || null,
      layer: { name: 'main-mahalles', data: mahallesCache.data, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('mahalle add-feature handler error:', error.stack || error.message);
    res.status(500).json({ status: 'error', error: 'Failed to add property', details: error.message });
  }
});
/* ----------------------------------------------------------------------
   End of MAHALLE endpoints
   ---------------------------------------------------------------------- */
app.post('/api/force-update-layers', authMiddleware, async (req, res) => {
  try {
    const { layers, delta, action, expectedVersions, storage } = req.body;
    if (!['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: "Storage must be 'db' or 'local'",
      });
    }
    if (delta && typeof delta === 'object' && action) {
      if (!expectedVersions) {
        return res.status(400).json({
          status: 'error',
          error: 'expectedVersions required for delta',
        });
      }
      const updated = [];
      const conflicts = [];
      for (const [layerName, changes] of Object.entries(delta)) {
        if (!changes || !layerName) continue;
        if (req.user.role !== 'admin' && !req.user.layers.includes(layerName)) {
          return res.status(403).json({
            status: 'error',
            error: `Access denied to layer ${layerName}`,
          });
        }
        if (storage === 'db') {
          let layer = await Layer.findOne({ name: layerName, storage: 'db' });
          if (!layer) {
            return res.status(404).json({
              status: 'error',
              error: `Layer ${layerName} not found`,
            });
          }
          const currentVersion = layer.updatedAt.getTime();
          if (expectedVersions[layerName] && currentVersion > Number(expectedVersions[layerName])) {
            conflicts.push({ name: layerName, version: currentVersion });
            continue;
          }
          const featureMap = new Map(
            layer.data.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
          );
          if (Array.isArray(changes.removed)) {
            changes.removed.forEach((id) => featureMap.delete(String(id)));
          }
          if (Array.isArray(changes.updated)) {
            changes.updated.forEach((updatedFeature) => {
              const id = updatedFeature.properties?.OBJECTID || updatedFeature.id;
              if (id) featureMap.set(String(id), updatedFeature);
            });
          }
          if (Array.isArray(changes.added)) {
            changes.added.forEach((newFeature) => {
              const id = newFeature.properties?.OBJECTID || newFeature.id;
              featureMap.set(String(id || `temp_${Date.now()}`), newFeature);
            });
          }
          layer.data.features = Array.from(featureMap.values());
          layer.updatedAt = new Date();
          await layer.save();
          await sendToFakeSync(action, layerName, changes);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          updated.push(layerName);
        } else {
          const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
          let geojson;
          try {
            geojson = JSON.parse(await fs.readFile(filePath, 'utf8'));
          } catch (err) {
            if (err.code === 'ENOENT') {
              return res.status(404).json({
                status: 'error',
                error: `Layer ${layerName} not found`,
              });
            }
            throw err;
          }
          const stat = await fs.stat(filePath);
          const currentVersion = stat.mtimeMs;
          if (expectedVersions[layerName] && currentVersion > Number(expectedVersions[layerName])) {
            conflicts.push({ name: layerName, version: currentVersion });
            continue;
          }
          const featureMap = new Map(
            geojson.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
          );
          if (Array.isArray(changes.removed)) {
            changes.removed.forEach((id) => featureMap.delete(String(id)));
          }
          if (Array.isArray(changes.updated)) {
            changes.updated.forEach((updatedFeature) => {
              const id = updatedFeature.properties?.OBJECTID || updatedFeature.id;
              if (id) featureMap.set(String(id), updatedFeature);
            });
          }
          if (Array.isArray(changes.added)) {
            changes.added.forEach((newFeature) => {
              const id = newFeature.properties?.OBJECTID || newFeature.id;
              featureMap.set(String(id || `temp_${Date.now()}`), newFeature);
            });
          }
          geojson.features = Array.from(featureMap.values());
          const backupPath = `${filePath}.bak.${Date.now()}`;
          await fs.copyFile(filePath, backupPath);
          await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
          await sendToFakeSync(action, layerName, changes);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          updated.push(layerName);
        }
      }
      if (conflicts.length > 0) {
        return res.status(409).json({
          status: 'error',
          error: 'Conflicts in some layers',
          conflicts,
          updated,
        });
      }
      return res.json({
        status: 'success',
        message: 'Layers updated successfully',
        updated,
        action,
      });
    }
    if (!Array.isArray(layers) || layers.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'layers array required',
      });
    }
    const updated = [];
    const conflicts = [];
    for (const layer of layers) {
      if (!layer.name || !layer.data) continue;
      if (storage === 'db') {
        let dbLayer = await Layer.findOne({ name: layer.name, storage: 'db' });
        if (
          layer.version &&
          dbLayer &&
          dbLayer.updatedAt.getTime() > Number(layer.version) &&
          !layer.force
        ) {
          conflicts.push({
            name: layer.name,
            data: dbLayer.data,
            version: dbLayer.updatedAt.getTime(),
            updatedAt: dbLayer.updatedAt.toISOString(),
          });
          continue;
        }
        if (!dbLayer) {
          dbLayer = new Layer({
            name: layer.name,
            data: layer.data,
            storage: 'db',
          });
        } else {
          dbLayer.data = layer.data;
          dbLayer.updatedAt = new Date();
        }
        await dbLayer.save();
        await sendToFakeSync('update_layer', layer.name, layer.data);
        io.emit('layerUpdated', { layerName: layer.name, updatedAt: new Date().toISOString() });
        updated.push(layer.name);
      } else {
        const filePath = path.join(DATA_DIR, `${layer.name}.geojson`);
        try {
          const stat = await fs.stat(filePath);
          if (
            layer.version &&
            stat.mtimeMs > Number(layer.version) &&
            !force &&
            !layer.force
          ) {
            const currentContent = await fs.readFile(filePath, 'utf8');
            conflicts.push({
              name: layer.name,
              data: JSON.parse(currentContent),
              version: stat.mtimeMs,
              updatedAt: stat.mtime.toISOString(),
            });
            continue;
          }
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        try {
          await fs.stat(filePath);
          const backupPath = `${filePath}.bak.${Date.now()}`;
          await fs.copyFile(filePath, backupPath);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        await fs.writeFile(filePath, JSON.stringify(layer.data, null, 2));
        await sendToFakeSync('update_layer', layer.name, layer.data);
        io.emit('layerUpdated', { layerName: layer.name, updatedAt: new Date().toISOString() });
        updated.push(layer.name);
      }
    }
    if (conflicts.length > 0) {
      return res.status(409).json({
        status: 'error',
        error: 'Conflict: some layers have been modified on server',
        conflicts,
        updated,
      });
    }
    res.json({
      status: 'success',
      message: 'Layers updated successfully',
      updated,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to force update layers',
      details: error.message,
    });
  }
});
app.post('/api/delete-feature', authMiddleware, async (req, res) => {
  try {
    const { layerName, featureId, storage } = req.body;
    if (!layerName || featureId == null || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'layerName, featureId, and storage are required',
      });
    }
    if (req.user.role !== 'admin' && !req.user.layers.includes(layerName)) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to this layer',
      });
    }
    if (storage === 'db') {
      let layer = await Layer.findOne({ name: layerName, storage: 'db' });
      if (!layer) {
        return res.status(404).json({
          status: 'error',
          error: `Layer ${layerName} not found`,
        });
      }
      const originalLength = layer.data.features.length;
      layer.data.features = layer.data.features.filter(
        (f) => String(f.properties?.OBJECTID ?? f.id ?? '') !== String(featureId)
      );
      if (layer.data.features.length === originalLength) {
        return res.status(404).json({ status: 'error', error: 'Feature not found' });
      }
      layer.updatedAt = new Date();
      await layer.save();
      await sendToFakeSync('delete_feature', layerName, { featureId });
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Feature deleted successfully' });
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      let geojson;
      try {
        geojson = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            status: 'error',
            error: `Layer ${layerName}.geojson not found`,
          });
        }
        throw error;
      }
      const originalLength = geojson.features.length;
      geojson.features = geojson.features.filter(
        (f) => String(f.properties?.OBJECTID ?? f.id ?? '') !== String(featureId)
      );
      if (geojson.features.length === originalLength) {
        return res.status(404).json({ status: 'error', error: 'Feature not found' });
      }
      await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
      await sendToFakeSync('delete_feature', layerName, { featureId });
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Feature deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete feature',
      details: error.message,
    });
  }
});
app.delete('/api/delete-layer', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { layerName, storage } = req.body;
    if (!layerName || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'layerName and storage are required',
      });
    }
    if (storage === 'db') {
      const layer = await Layer.findOneAndDelete({ name: layerName, storage: 'db' });
      if (!layer) {
        return res.status(404).json({
          status: 'error',
          error: `Layer ${layerName} not found`,
        });
      }
      await sendToFakeSync('delete_layer', layerName, null);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Layer deleted successfully' });
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({
            status: 'error',
            error: `Layer ${layerName}.geojson not found`,
          });
        }
        throw error;
      }
      await sendToFakeSync('delete_layer', layerName, null);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Layer deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete layer',
      details: error.message,
    });
  }
});
app.post('/api/add-layer', authMiddleware, async (req, res) => {
  try {
    const { layerName, features, storage } = req.body;
    if (!layerName || !features || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'layerName, features, and storage are required',
      });
    }
    if (req.user.role !== 'admin' && !req.user.layers.includes(layerName)) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to this layer',
      });
    }
    if (storage === 'db') {
      let layer = await Layer.findOne({ name: layerName, storage: 'db' });
      if (layer) {
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      }
      layer = new Layer({
        name: layerName,
        data: { type: 'FeatureCollection', features },
        storage: 'db',
      });
      await layer.save();
      const responseLayer = makeLayerResponse(layer, 'db');
      await sendToFakeSync('add_layer', layerName, features);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Layer added successfully', layer: responseLayer });
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      try {
        await fs.access(filePath);
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const geojson = { type: 'FeatureCollection', features };
      await fs.writeFile(filePath, JSON.stringify(geojson, null, 2));
      const stat = await fs.stat(filePath);
      const responseLayer = { name: layerName, data: geojson, version: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
      await sendToFakeSync('add_layer', layerName, features);
      io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
      res.json({ status: 'success', message: 'Layer added successfully', layer: responseLayer });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to add layer',
      details: error.message,
    });
  }
});
app.post('/api/update-layers', authMiddleware, async (req, res) => {
  try {
    const { layers, force, storage } = req.body;
    if (!Array.isArray(layers) || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: "layers must be an array and storage must be 'db' or 'local'",
      });
    }
    const accessibleLayers =
      req.user.role === 'admin'
        ? layers
        : layers.filter((layer) => req.user.layers.includes(layer.name));
    if (accessibleLayers.length === 0) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to all provided layers',
      });
    }
    const updatedLayers = [];
    const conflicts = [];
    for (const layer of accessibleLayers) {
      if (!layer.name || !layer.data) continue;
      if (storage === 'db') {
        let dbLayer = await Layer.findOne({ name: layer.name, storage: 'db' });
        if (
          layer.version &&
          dbLayer &&
          dbLayer.updatedAt.getTime() > Number(layer.version) &&
          !force &&
          !layer.force
        ) {
          conflicts.push({
            name: layer.name,
            data: dbLayer.data,
            version: dbLayer.updatedAt.getTime(),
            updatedAt: dbLayer.updatedAt.toISOString(),
          });
          continue;
        }
        if (!dbLayer) {
          dbLayer = new Layer({
            name: layer.name,
            data: layer.data,
            storage: 'db',
          });
        } else {
          dbLayer.data = layer.data;
          dbLayer.updatedAt = new Date();
        }
        await dbLayer.save();
        await sendToFakeSync('update_layer', layer.name, layer.data);
        io.emit('layerUpdated', { layerName: layer.name, updatedAt: new Date().toISOString() });
        updatedLayers.push(layer.name);
      } else {
        const filePath = path.join(DATA_DIR, `${layer.name}.geojson`);
        try {
          const stat = await fs.stat(filePath);
          if (
            layer.version &&
            stat.mtimeMs > Number(layer.version) &&
            !force &&
            !layer.force
          ) {
            const currentContent = await fs.readFile(filePath, 'utf8');
            conflicts.push({
              name: layer.name,
              data: JSON.parse(currentContent),
              version: stat.mtimeMs,
              updatedAt: stat.mtime.toISOString(),
            });
            continue;
          }
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        try {
          await fs.stat(filePath);
          const backupPath = `${filePath}.bak.${Date.now()}`;
          await fs.copyFile(filePath, backupPath);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
        await fs.writeFile(filePath, JSON.stringify(layer.data, null, 2));
        await sendToFakeSync('update_layer', layer.name, layer.data);
        io.emit('layerUpdated', { layerName: layer.name, updatedAt: new Date().toISOString() });
        updatedLayers.push(layer.name);
      }
    }
    if (conflicts.length > 0) {
      return res.status(409).json({
        status: 'error',
        error: 'Conflict: some layers have been modified on server',
        conflicts,
        updated: updatedLayers,
      });
    }
    res.json({
      status: 'success',
      message: 'Layers updated successfully',
      updated: updatedLayers,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: 'Failed to update layers',
      details: error.message,
    });
  }
});
// replace add-parcel-property: forward to external add-feature and refresh cache
// extended to support mahalle if mahalle_id or target:'mahalle' provided
app.post('/api/add-parcel-property', authMiddleware, async (req, res) => {
  try {
    const { parcel_id, mahalle_id, key, value, target } = req.body;
    // accept either parcel_id (parcels) or mahalle_id / target==='mahalle' (mahalles)
    if ((!parcel_id && !mahalle_id) || !key || value === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'parcel_id/mahalle_id and key and value are required',
      });
    }
    const isMahalle = !!mahalle_id || target === 'mahalle';
    if (isMahalle) {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-mahalles')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-mahalles layer',
        });
      }
    } else {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-parcels')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-parcels layer',
        });
      }
    }
    const payload = isMahalle ? { mahalle_id: String(mahalle_id || parcel_id), key, value } : { parcel_id: String(parcel_id), key, value };
    // try with trailing slash first, fallback without slash
    let externalResponse;
    try {
      externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/add-feature/`, payload, { validateStatus: null });
    } catch (err) {
      console.warn('externalAxios POST failed:', err.message);
      try {
        externalResponse = await externalAxios.post(`${MAHALLE_PREFIX}/add-feature`, payload, { validateStatus: null });
      } catch (err2) {
        console.warn('externalAxios POST fallback failed, using local mutation:', err2.message);
      }
    }
    let usedLocalFallback = false;
    if (!externalResponse || externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      usedLocalFallback = true;
      const localLayerName = isMahalle ? 'main-mahalles' : 'main-parcels';
      await updateMainLayerPropertyLocal(localLayerName, String(mahalle_id || parcel_id), key, value, 'set');
    }
    // success -> refresh cache best-effort
    let updatedLayerData = null;
    try {
      if (isMahalle) {
        const refreshResp = await externalAxios.get('/api/mahalles', { validateStatus: null });
        if (refreshResp?.data) {
          let geojsonData = { type: 'FeatureCollection', features: [] };
          if (refreshResp.data.results && Array.isArray(refreshResp.data.results)) {
            geojsonData.features = refreshResp.data.results.map((item) => ({
              type: 'Feature',
              id: item.id,
              geometry: item.geometry,
              properties: item.properties,
            }));
          } else if (refreshResp.data.type === 'FeatureCollection') {
            geojsonData = refreshResp.data;
          }
          updatedLayerData = geojsonData;
          mahallesCache.data = updatedLayerData;
          mahallesCache.updatedAt = Date.now();
          writeMahallesToFile(updatedLayerData).catch(() => {});
        }
      } else {
        const refreshResp = await externalAxios.get('/api/parcels-geojson/', { validateStatus: null });
        if (refreshResp?.data) {
          updatedLayerData = refreshResp.data;
          parcelsCache.data = updatedLayerData;
          parcelsCache.updatedAt = Date.now();
          writeParcelsToFile(updatedLayerData).catch(() => {});
        }
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh after add-parcel-property:', refreshErr.message);
    }
    await sendToFakeSync('add_property', isMahalle ? 'main-mahalles' : 'main-parcels', payload).catch(() => {});
    io.emit('layerUpdated', { layerName: isMahalle ? 'main-mahalles' : 'main-parcels', updatedAt: new Date().toISOString() });
    return res.json({
      status: 'success',
      message: usedLocalFallback ? 'Property added successfully via local fallback' : 'Property added successfully',
      feature: externalResponse?.data?.feature || null,
      layer: {
        name: isMahalle ? 'main-mahalles' : 'main-parcels',
        data: updatedLayerData,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Add parcel property error (internal):', error.stack || error.message, error.response?.data || {});
    res.status(500).json({
      status: 'error',
      error: 'Failed to add property',
      details: error.response?.data || error.message,
    });
  }
});
app.post('/api/update-parcel-property', authMiddleware, async (req, res) => {
  try {
    const { parcel_id, mahalle_id, key, value, target } = req.body;
    if ((!parcel_id && !mahalle_id) || !key || value === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'parcel_id/mahalle_id, key, and value are required',
      });
    }
    const isMahalle = !!mahalle_id || target === 'mahalle';
    if (isMahalle) {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-mahalles')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-mahalles layer',
        });
      }
    } else {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-parcels')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-parcels layer',
        });
      }
    }
    const payload = isMahalle
      ? { mahalle_id: String(mahalle_id || parcel_id), key, value }
      : { parcel_id: String(parcel_id), key, value };
    const endpoint = isMahalle ? `${MAHALLE_PREFIX}/update-feature/` : '/api/update-feature/';
    let externalResponse = null;
    let usedLocalFallback = false;
    try {
      externalResponse = await externalAxios.post(endpoint, payload, { validateStatus: null });
    } catch (externalError) {
      console.warn('update-parcel-property upstream unavailable, using local fallback:', externalError.message);
    }
    if (!externalResponse || externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      usedLocalFallback = true;
      await updateMainLayerPropertyLocal(isMahalle ? 'main-mahalles' : 'main-parcels', String(mahalle_id || parcel_id), key, value, 'set');
    }
    let updatedLayerData = null;
    try {
      if (isMahalle) {
        const refreshResponse = await externalAxios.get('/api/mahalles');
        if (refreshResponse?.data) {
          let geojsonData = { type: 'FeatureCollection', features: [] };
          if (refreshResponse.data.results && Array.isArray(refreshResponse.data.results)) {
            geojsonData.features = refreshResponse.data.results.map((item) => ({
              type: 'Feature',
              id: item.id,
              geometry: item.geometry,
              properties: item.properties,
            }));
          } else if (refreshResponse.data.type === 'FeatureCollection') {
            geojsonData = refreshResponse.data;
          }
          updatedLayerData = geojsonData;
          mahallesCache.data = updatedLayerData;
          mahallesCache.updatedAt = Date.now();
          writeMahallesToFile(updatedLayerData).catch(() => {});
        }
      } else {
        const refreshResponse = await externalAxios.get('/api/parcels-geojson/');
        if (refreshResponse?.data) {
          updatedLayerData = refreshResponse.data;
          parcelsCache.data = updatedLayerData;
          parcelsCache.updatedAt = Date.now();
          writeParcelsToFile(updatedLayerData).catch(() => {});
        }
      }
    } catch (refreshErr) {
      console.error('Failed to refresh main layer:', refreshErr.message);
    }
    await sendToFakeSync('update_property', isMahalle ? 'main-mahalles' : 'main-parcels', payload).catch(() => {});
    io.emit('layerUpdated', { layerName: isMahalle ? 'main-mahalles' : 'main-parcels', updatedAt: new Date().toISOString() });
    res.json({
      status: 'success',
      message: usedLocalFallback ? 'Property updated successfully via local fallback' : 'Property updated successfully',
      feature: externalResponse?.data?.feature || null,
      layer: {
        name: isMahalle ? 'main-mahalles' : 'main-parcels',
        data: updatedLayerData,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Update parcel property error:', error.stack || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Failed to update property',
      details: error.message,
    });
  }
});
app.post('/api/delete-parcel-property', authMiddleware, async (req, res) => {
  try {
    const { parcel_id, mahalle_id, key, target } = req.body;
    if ((!parcel_id && !mahalle_id) || !key) {
      return res.status(400).json({
        status: 'error',
        error: 'parcel_id/mahalle_id and key are required',
      });
    }
    const isMahalle = !!mahalle_id || target === 'mahalle';
    if (isMahalle) {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-mahalles')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-mahalles layer',
        });
      }
    } else {
      if (
        req.user.role !== 'admin' &&
        req.user.role !== 'editor' &&
        !req.user.layers.includes('main-parcels')
      ) {
        return res.status(403).json({
          status: 'error',
          error: 'Access denied to main-parcels layer',
        });
      }
    }
    const payload = isMahalle ? { mahalle_id: String(mahalle_id || parcel_id), key } : { parcel_id: String(parcel_id), key };
    // Try with trailing slash first, then fallback without it
    let externalResponse;
    try {
      const endpoint = isMahalle ? `${MAHALLE_PREFIX}/delete-feature/` : '/api/delete-feature/';
      externalResponse = await externalAxios.post(endpoint, payload, { validateStatus: null });
    } catch (err) {
      console.warn('externalAxios POST failed:', err.message);
      try {
        const endpoint = isMahalle ? `${MAHALLE_PREFIX}/delete-feature` : '/api/delete-feature';
        externalResponse = await externalAxios.post(endpoint, payload, { validateStatus: null });
      } catch (err2) {
        console.warn('external delete-feature fallback failed, using local mutation:', err2.message);
      }
    }
    let usedLocalFallback = false;
    if (!externalResponse || externalResponse.status !== 200 || externalResponse.data?.status !== 'success') {
      usedLocalFallback = true;
      await updateMainLayerPropertyLocal(isMahalle ? 'main-mahalles' : 'main-parcels', String(mahalle_id || parcel_id), key, undefined, 'delete');
    }
    // refresh appropriate cache best-effort
    let updatedLayerData = null;
    try {
      if (isMahalle) {
        const refreshResp = await externalAxios.get('/api/mahalles', { validateStatus: null });
        if (refreshResp?.data) {
          let geojsonData = { type: 'FeatureCollection', features: [] };
          if (refreshResp.data.results && Array.isArray(refreshResp.data.results)) {
            geojsonData.features = refreshResp.data.results.map((item) => ({
              type: 'Feature',
              id: item.id,
              geometry: item.geometry,
              properties: item.properties,
            }));
          } else if (refreshResp.data.type === 'FeatureCollection') {
            geojsonData = refreshResp.data;
          }
          updatedLayerData = geojsonData;
          mahallesCache.data = updatedLayerData;
          mahallesCache.updatedAt = Date.now();
          writeMahallesToFile(updatedLayerData).catch(() => {});
        }
      } else {
        const refreshResp = await externalAxios.get('/api/parcels-geojson/', { validateStatus: null });
        if (refreshResp?.data) {
          updatedLayerData = refreshResp.data;
          parcelsCache.data = updatedLayerData;
          parcelsCache.updatedAt = Date.now();
          writeParcelsToFile(updatedLayerData).catch(() => {});
        }
      }
    } catch (refreshErr) {
      console.warn('Failed to refresh after delete-parcel-property:', refreshErr.message);
    }
    await sendToFakeSync('delete_property', isMahalle ? 'main-mahalles' : 'main-parcels', payload).catch(() => {});
    io.emit('layerUpdated', { layerName: isMahalle ? 'main-mahalles' : 'main-parcels', updatedAt: new Date().toISOString() });
    return res.json({
      status: 'success',
      message: usedLocalFallback ? 'Property deleted successfully via local fallback' : 'Property deleted successfully',
      feature: externalResponse?.data?.feature || null,
      layer: {
        name: isMahalle ? 'main-mahalles' : 'main-parcels',
        data: updatedLayerData,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Delete parcel property error (internal):', error.stack || error.message, error.response?.data || {});
    res.status(500).json({
      status: 'error',
      error: 'Failed to delete property',
      details: error.response?.data || error.message,
    });
  }
});
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: "No file uploaded (field name must be 'file')",
      });
    }
    const { option = 'add_new', storage = 'local', name, targetLayer } = req.body;
    // توی برخی بخش‌های قدیمی فرانت یا تست‌ها، optionهای آپلود با نام‌های legacy
    // مثل add/merge ارسال می‌شوند. این نگاشت باعث می‌شود همان route اصلی بدون 400
    // غیرضروری آن‌ها را بپذیرد و رفتار آپلود یکدست بماند.
    const normalizedOption =
      option === 'add'
        ? 'add_new'
        : option === 'merge'
        ? 'replace'
        : option;
    if (!['add_new', 'replace', 'delete_and_replace'].includes(normalizedOption) || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid option or storage',
      });
    }
    if ((normalizedOption === 'replace' || normalizedOption === 'delete_and_replace') && !targetLayer) {
      return res.status(400).json({
        status: 'error',
        error: 'targetLayer is required for replace or delete_and_replace',
      });
    }
    let layerName = name ? sanitizeLayerName(name) : `layer_${Date.now()}`;
    if (normalizedOption === 'replace' || normalizedOption === 'delete_and_replace') {
      layerName = targetLayer;
    }
    if (req.user.role !== 'admin' && !req.user.layers.includes(layerName)) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to this layer',
        layer: layerName,
      });
    }
    const text = req.file.buffer.toString('utf8');
    let incomingGeo;
    try {
      incomingGeo = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid JSON/GeoJSON',
        details: e.message,
      });
    }
    let incomingFeatures =
      incomingGeo.type === 'FeatureCollection'
        ? Array.isArray(incomingGeo.features)
          ? incomingGeo.features
          : []
        : incomingGeo.type === 'Feature'
        ? [incomingGeo]
        : [];
    if (!incomingFeatures.length) {
      return res.status(400).json({
        status: 'error',
        error: 'Please upload a Feature or FeatureCollection GeoJSON',
      });
    }
    // FIX: avoid spreading undefined properties
    incomingFeatures = incomingFeatures.map((f, idx) => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        OBJECTID: f.properties?.OBJECTID ?? f.id ?? `auto_${Date.now()}_${idx}`,
      },
      id: String(f.properties?.OBJECTID ?? f.id ?? `auto_${Date.now()}_${idx}`),
    }));
    if (storage === 'db') {
      let layer = await Layer.findOne({ name: layerName, storage: 'db' });
      if (normalizedOption === 'add_new' && layer) {
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      }
      if (normalizedOption === 'add_new') {
        layer = new Layer({
          name: layerName,
          data: { type: 'FeatureCollection', features: incomingFeatures },
          storage: 'db',
        });
        await layer.save();
        const responseLayer = makeLayerResponse(layer, 'db');
        await sendToFakeSync('add_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(201).json({
          status: 'success',
          message: 'Layer uploaded successfully',
          layer: responseLayer,
        });
      }
      if (!layer && (normalizedOption === 'replace' || normalizedOption === 'delete_and_replace')) {
        return res.status(404).json({
          status: 'error',
          error: `Layer ${layerName} not found`,
        });
      }
      if (normalizedOption === 'replace') {
        const existingById = new Map(
          layer.data.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
        );
        let added = 0;
        let updated = 0;
        for (const f of incomingFeatures) {
          const id = String(f.properties?.OBJECTID ?? f.id);
          if (!existingById.has(id)) {
            layer.data.features.push(f);
            added++;
          } else {
            const index = layer.data.features.findIndex(
              (feat) => String(feat.properties?.OBJECTID ?? feat.id) === id
            );
            layer.data.features[index] = f;
            updated++;
          }
        }
        layer.updatedAt = new Date();
        await layer.save();
        await sendToFakeSync('replace_layer', layerName, { added, updated });
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: `Layer replaced successfully, ${added} added, ${updated} updated`,
          layerName,
        });
      }
      if (normalizedOption === 'delete_and_replace') {
        layer.data = { type: 'FeatureCollection', features: incomingFeatures };
        layer.updatedAt = new Date();
        await layer.save();
        await sendToFakeSync('delete_and_replace_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: 'Layer deleted and replaced successfully',
          layerName,
        });
      }
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      let existingGeo = { type: 'FeatureCollection', features: [] };
      try {
        const content = await fs.readFile(filePath, 'utf8');
        existingGeo = JSON.parse(content);
        if (!Array.isArray(existingGeo.features)) existingGeo.features = [];
      } catch (err) {
        if (err.code === 'ENOENT') {
          const newGeo = { type: 'FeatureCollection', features: incomingFeatures };
          await fs.writeFile(filePath, JSON.stringify(newGeo, null, 2));
          const stat = await fs.stat(filePath);
          const responseLayer = { name: layerName, data: newGeo, version: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
          await sendToFakeSync('add_layer', layerName, incomingFeatures);
          io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
          return res.status(201).json({
            status: 'success',
            message: 'Layer uploaded successfully (new local layer created)',
            layer: responseLayer,
          });
        }
        throw err;
      }
      if (normalizedOption === 'add_new' && existingGeo.features.length > 0) {
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      }
      if (normalizedOption === 'add_new') {
        await fs.writeFile(
          filePath,
          JSON.stringify({ type: 'FeatureCollection', features: incomingFeatures }, null, 2)
        );
        const stat = await fs.stat(filePath);
        const responseLayer = {
          name: layerName,
          data: { type: 'FeatureCollection', features: incomingFeatures },
          version: stat.mtimeMs,
          updatedAt: stat.mtime.toISOString(),
        };
        await sendToFakeSync('add_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(201).json({
          status: 'success',
          message: 'Layer uploaded successfully',
          layer: responseLayer,
        });
      }
      if (normalizedOption === 'replace') {
        const existingById = new Map(
          existingGeo.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
        );
        let added = 0;
        let updated = 0;
        for (const f of incomingFeatures) {
          const id = String(f.properties?.OBJECTID ?? f.id);
          if (!existingById.has(id)) {
            existingGeo.features.push(f);
            added++;
          } else {
            const index = existingGeo.features.findIndex(
              (feat) => String(feat.properties?.OBJECTID ?? feat.id) === id
            );
            existingGeo.features[index] = f;
            updated++;
          }
        }
        await fs.writeFile(filePath, JSON.stringify(existingGeo, null, 2));
        await sendToFakeSync('replace_layer', layerName, { added, updated });
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: `Layer replaced successfully, ${added} added, ${updated} updated`,
          layerName,
        });
      }
      if (normalizedOption === 'delete_and_replace') {
        await fs.writeFile(
          filePath,
          JSON.stringify({ type: 'FeatureCollection', features: incomingFeatures }, null, 2)
        );
        await sendToFakeSync('delete_and_replace_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: 'Layer deleted and replaced successfully',
          layerName,
        });
      }
    }
  } catch (error) {
    console.error('Upload handler error:', error.stack || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Server error',
      details: error.message,
    });
  }
});
app.post('/api/upload-geojson', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        error: "No file uploaded (field name must be 'file')",
      });
    }
    const { option = 'add', storage = 'local', name, targetLayer } = req.body;
    if (!['add', 'merge', 'replace'].includes(option) || !['db', 'local'].includes(storage)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid option or storage',
      });
    }
    if ((option === 'merge' || option === 'replace') && !targetLayer) {
      return res.status(400).json({
        status: 'error',
        error: 'targetLayer is required for merge or replace',
      });
    }
    let layerName = name ? sanitizeLayerName(name) : `layer_${Date.now()}`;
    if (option === 'merge' || option === 'replace') {
      layerName = targetLayer;
    }
    if (req.user.role !== 'admin' && !req.user.layers.includes(layerName)) {
      return res.status(403).json({
        status: 'error',
        error: 'Access denied to this layer',
        layer: layerName,
      });
    }
    const text = req.file.buffer.toString('utf8');
    let incomingGeo;
    try {
      incomingGeo = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid JSON/GeoJSON',
        details: e.message,
      });
    }
    let incomingFeatures =
      incomingGeo.type === 'FeatureCollection'
        ? Array.isArray(incomingGeo.features)
          ? incomingGeo.features
          : []
        : incomingGeo.type === 'Feature'
        ? [incomingGeo]
        : [];
    if (!incomingFeatures.length) {
      return res.status(400).json({
        status: 'error',
        error: 'Please upload a Feature or FeatureCollection GeoJSON',
      });
    }
    // FIX: avoid spreading undefined properties
    incomingFeatures = incomingFeatures.map((f, idx) => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        OBJECTID: f.properties?.OBJECTID ?? f.id ?? `auto_${Date.now()}_${idx}`,
      },
      id: String(f.properties?.OBJECTID ?? f.id ?? `auto_${Date.now()}_${idx}`),
    }));
    if (storage === 'db') {
      let layer = await Layer.findOne({ name: layerName, storage: 'db' });
      if (option === 'add' && layer) {
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      }
      if (option === 'add') {
        layer = new Layer({
          name: layerName,
          data: { type: 'FeatureCollection', features: incomingFeatures },
          storage: 'db',
        });
        await layer.save();
        const responseLayer = makeLayerResponse(layer, 'db');
        await sendToFakeSync('add_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(201).json({
          status: 'success',
          message: 'Layer uploaded successfully',
          layer: responseLayer,
        });
      }
      if (!layer && (option === 'merge' || option === 'replace')) {
        return res.status(404).json({
          status: 'error',
          error: `Layer ${layerName} not found`,
        });
      }
      if (option === 'replace') {
        layer.data = { type: 'FeatureCollection', features: incomingFeatures };
        layer.updatedAt = new Date();
        await layer.save();
        await sendToFakeSync('replace_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: 'Layer replaced successfully',
          layerName,
        });
      }
      if (option === 'merge') {
        const existingById = new Map(
          layer.data.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
        );
        let added = 0;
        for (const f of incomingFeatures) {
          const id = String(f.properties?.OBJECTID ?? f.id);
          if (!existingById.has(id)) {
            layer.data.features.push(f);
            existingById.set(id, f);
            added++;
          }
        }
        layer.updatedAt = new Date();
        await layer.save();
        await sendToFakeSync('merge_layer', layerName, { added });
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: `Layer merged successfully, ${added} features added`,
          layerName,
        });
      }
    } else {
      const filePath = path.join(DATA_DIR, `${layerName}.geojson`);
      let existingGeo = { type: 'FeatureCollection', features: [] };
      try {
        const content = await fs.readFile(filePath, 'utf8');
        existingGeo = JSON.parse(content);
        if (!Array.isArray(existingGeo.features)) existingGeo.features = [];
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (option === 'add' && existingGeo.features.length > 0) {
        return res.status(400).json({
          status: 'error',
          error: `Layer ${layerName} already exists`,
        });
      }
      if (option === 'add') {
        await fs.writeFile(
          filePath,
          JSON.stringify({ type: 'FeatureCollection', features: incomingFeatures }, null, 2)
        );
        const stat = await fs.stat(filePath);
        const responseLayer = { name: layerName, data: incomingFeatures, version: stat.mtimeMs, updatedAt: stat.mtime.toISOString() };
        await sendToFakeSync('add_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(201).json({
          status: 'success',
          message: 'Layer uploaded successfully',
          layer: responseLayer,
        });
      }
      if (option === 'replace') {
        await fs.writeFile(
          filePath,
          JSON.stringify({ type: 'FeatureCollection', features: incomingFeatures }, null, 2)
        );
        await sendToFakeSync('replace_layer', layerName, incomingFeatures);
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: 'Layer replaced successfully',
          layerName,
        });
      }
      if (option === 'merge') {
        const existingById = new Map(
          existingGeo.features.map((f) => [String(f.properties?.OBJECTID ?? f.id), f])
        );
        let added = 0;
        for (const f of incomingFeatures) {
          const id = String(f.properties?.OBJECTID ?? f.id);
          if (!existingById.has(id)) {
            existingGeo.features.push(f);
            existingById.set(id, f);
            added++;
          }
        }
        await fs.writeFile(filePath, JSON.stringify(existingGeo, null, 2));
        await sendToFakeSync('merge_layer', layerName, { added });
        io.emit('layerUpdated', { layerName, updatedAt: new Date().toISOString() });
        return res.status(200).json({
          status: 'success',
          message: `Layer merged successfully, ${added} features added`,
          layerName,
        });
      }
    }
  } catch (error) {
    console.error('Upload-geojson handler error:', error.stack || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Server error',
      details: error.message,
    });
  }
});
// دليل تغيير:
// مسير ثبت موقت ادمين فقط در محيط‌هاي کنترل‌شده بايد فعال باشد؛
// در حالت پيش‌فرض تعريف نمي‌شود تا سطح حمله سرور کم بماند.
if (ENABLE_TMP_REGISTER) {
  app.post('/api/_tmp_register_admin', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({
          status: 'error',
          error: 'username & password required',
        });
      }
      const hashed = await bcrypt.hash(password, 10);
      const user = new User({
        username,
        password: hashed,
        role: 'admin',
        tools: [
          'stats',
          'edit',
          'export',
          'spatial',
          'visual',
          'network',
          'join',
          'modeling',
          'draw',
          'filter',
          'search',
        ],
        layers: ['test'],
      });
      await user.save();
      res.status(201).json({
        status: 'success',
        message: 'Admin registered successfully',
        username: user.username,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message,
      });
    }
  });
}
app.post('/api/admin/refresh-cache', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { layers } = req.body; // e.g. ['main-parcels', 'main-mahalles']
    const results = {};
    if (!Array.isArray(layers) || layers.length === 0) {
      return res.status(400).json({ status:'error', error: 'layers array required' });
    }
    for (const layer of layers) {
      if (layer === 'main-parcels') {
        parcelsCache.updatedAt = 0;
        try { const r = await fetchParcelsFromExternal(); results[layer] = { ok: true, fromCache: r.fromCache }; }
        catch(e){ results[layer] = { ok:false, error: e.message }; }
      } else if (layer === 'main-mahalles') {
        mahallesCache.updatedAt = 0;
        try { const r = await fetchMahallesFromExternal(); results[layer] = { ok: true, fromCache: r.fromCache }; }
        catch(e){ results[layer] = { ok:false, error: e.message }; }
      } else if (layer === 'main-mabar') {
        mabarCache.updatedAt = 0;
        try { const r = await fetchMabarFromExternal(); results[layer] = { ok: true, fromCache: r.fromCache }; }
        catch(e){ results[layer] = { ok:false, error: e.message }; }
      } else {
        results[layer] = { ok:false, error: 'unknown layer' };
      }
    }
    return res.json({ status:'success', results });
  } catch (err) {
    return res.status(500).json({ status:'error', error: err.message });
  }
});
const hashForETag = (obj) => {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha1').update(str).digest('hex');
};
// --- Frontend integration & static serving ---
const frontDir = path.resolve(__dirname, '..', 'front');
const distDir = path.resolve(__dirname, '..', 'dist');

let isViteMounted = false;
if (process.env.NODE_ENV !== 'production') {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
      root: frontDir,
    });
    // Serve a clean no-op HMR client when HMR/WebSocket is disabled so /@vite/client never opens a failing WS to port 24678
    app.get('/@vite/client', (req, res) => {
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
const hotContext = {
  data: {},
  accept() {},
  acceptExports() {},
  dispose() {},
  prune() {},
  invalidate() {},
  on() {},
  off() {},
  send() {},
};
export function createHotContext() {
  return hotContext;
}
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function injectQuery(url, queryToInject) {
  if (typeof url !== 'string' || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay extends (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) {}
`);
    });
    app.use(vite.middlewares);
    isViteMounted = true;
    console.log('Mounted Vite development server middleware');
  } catch (err) {
    console.warn('Could not mount Vite middleware, falling back to static build:', err.message);
  }
}

if (!isViteMounted) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    status: 'error',
    error: 'API endpoint not found',
    method: req.method,
    url: req.originalUrl,
  });
});

// Global Express error handler
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    status: 'error',
    error: err.message || 'Internal Server Error',
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
// دليل تغيير:
// براي جلوگيري از قطع ناگهاني پردازش، خاموش‌سازي graceful اضافه شده
// تا Socket.IO، سرور HTTP و اتصال MongoDB به ترتيب و امن بسته شوند.
let shutdownInProgress = false;
const gracefulShutdown = async (signal) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  console.log(`[SHUTDOWN] Received ${signal}, closing resources...`);
  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing process exit.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();
  try {
    await new Promise((resolve) => {
      io.close(() => {
        server.close(() => resolve());
      });
    });
    await closeDatabase();
    clearTimeout(forceExitTimer);
    console.log('[SHUTDOWN] Completed successfully.');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error('Graceful shutdown failed:', error.message);
    process.exit(1);
  }
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
