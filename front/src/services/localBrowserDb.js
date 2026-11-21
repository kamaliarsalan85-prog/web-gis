import { SEED_GEO_DATA } from '../data/seedGeoData.js';

const DB_NAME = 'gis_platform_browser_db';
const DB_VERSION = 1;
const LS_USERS_KEY = 'gis_browser_db_users_v1';
const LS_LAYERS_KEY = 'gis_browser_db_layers_v1';

const DEFAULT_TOOLS = [
  'stats', 'edit', 'export', 'spatial', 'visual', 'network',
  'join', 'modeling', 'draw', 'filter', 'search',
];

const DEFAULT_LAYERS = ['main-parcels', 'main-mahalles', 'main-mabar'];

const hashPassword = async (password) => {
  const input = String(password || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return 'sha256:' + Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (e) {
    // fallback below
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'fnv1a:' + (h >>> 0).toString(16);
};

const verifyPassword = async (plain, storedHash) => {
  if (!storedHash) return false;
  if (storedHash.startsWith('sha256:') || storedHash.startsWith('fnv1a:')) {
    return (await hashPassword(plain)) === storedHash;
  }
  return plain === storedHash;
};

const encodeBase64Url = (obj) => {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decodeToken = (token) => {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
};

const createToken = (user) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeBase64Url({
    id: user._id,
    username: user.username,
    role: user.role,
    tools: user.tools || [],
    layers: user.layers || [],
    iat: nowSec,
    exp: nowSec + 3600 * 12,
  });
  return `${header}.${payload}.local-browser-sig`;
};

const openIdb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains('layers')) {
        db.createObjectStore('layers', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });

const readStore = async (storeName, lsKey) => {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try {
      const raw = localStorage.getItem(lsKey);
      return raw ? JSON.parse(raw) : [];
    } catch (lsErr) {
      return [];
    }
  }
};

const writeStore = async (storeName, lsKey, items) => {
  try {
    localStorage.setItem(lsKey, JSON.stringify(items));
  } catch (e) {
    // ignore quota errors
  }
  try {
    const db = await openIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // localStorage copy already saved
  }
};

let seedPromise = null;
export const ensureBrowserDbSeeded = async () => {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const now = new Date().toISOString();
    let users = await readStore('users', LS_USERS_KEY);
    if (!Array.isArray(users) || !users.some((u) => u.username === 'admin')) {
      const passwordHash = await hashPassword('admin123');
      users = [
        ...(Array.isArray(users) ? users : []),
        {
          _id: 'default-admin-id',
          username: 'admin',
          password: passwordHash,
          role: 'admin',
          tools: DEFAULT_TOOLS,
          layers: DEFAULT_LAYERS,
          createdAt: now,
          updatedAt: now,
        },
      ];
      await writeStore('users', LS_USERS_KEY, users);
    }

    let layers = await readStore('layers', LS_LAYERS_KEY);
    if (!Array.isArray(layers) || layers.length === 0) {
      const ts = Date.now();
      layers = [
        {
          key: 'external:main-parcels',
          name: 'main-parcels',
          storage: 'external',
          color: '#3b82f6',
          data: SEED_GEO_DATA['main-parcels'],
          count: SEED_GEO_DATA['main-parcels']?.features?.length || 0,
          version: ts,
          updatedAt: now,
        },
        {
          key: 'external:main-mahalles',
          name: 'main-mahalles',
          storage: 'external',
          color: '#10b981',
          data: SEED_GEO_DATA['main-mahalles'],
          count: SEED_GEO_DATA['main-mahalles']?.features?.length || 0,
          version: ts,
          updatedAt: now,
        },
        {
          key: 'external:main-mabar',
          name: 'main-mabar',
          storage: 'external',
          color: '#f59e0b',
          data: SEED_GEO_DATA['main-mabar'],
          count: SEED_GEO_DATA['main-mabar']?.features?.length || 0,
          version: ts,
          updatedAt: now,
        },
        {
          key: 'local:main-mabar',
          name: 'main-mabar',
          storage: 'local',
          color: '#ef4444',
          data: SEED_GEO_DATA['local-main-mabar'],
          count: SEED_GEO_DATA['local-main-mabar']?.features?.length || 0,
          version: ts + 1,
          updatedAt: now,
        },
      ];
      await writeStore('layers', LS_LAYERS_KEY, layers);
    }
  })();
  return seedPromise;
};

const buildResponse = (config, status, data) => ({
  data,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
  headers: { 'content-type': 'application/json', 'x-cache': 'BROWSER-DB' },
  config,
});

const parseBody = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  return raw;
};

const getAuthUser = (config) => {
  const authHeader =
    config.headers?.Authorization ||
    config.headers?.authorization ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('token')
      ? `Bearer ${localStorage.getItem('token')}`
      : '');
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  return decodeToken(token);
};

const getNextObjectId = (layers, base = 1) => {
  let maxId = base - 1;
  for (const layer of layers) {
    const features = layer?.data?.features || [];
    for (const f of features) {
      const n = Number(f?.properties?.OBJECTID ?? f?.id);
      if (Number.isFinite(n)) maxId = Math.max(maxId, n);
    }
  }
  return maxId + 1;
};

export const handleLocalApiRequest = async (config) => {
  await ensureBrowserDbSeeded();

  const method = String(config.method || 'GET').toUpperCase();
  const fullUrl = String(config.url || '');
  const parsedUrl = new URL(fullUrl, 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(parsedUrl.searchParams.entries());
  const params = { ...query, ...(config.params || {}) };
  const body = parseBody(config.data);
  const authUser = getAuthUser(config);

  const users = await readStore('users', LS_USERS_KEY);
  const layers = await readStore('layers', LS_LAYERS_KEY);

  // --- Auth endpoints ---
  if (method === 'POST' && (pathname === '/api/login' || pathname === '/api/auth/login')) {
    const { username, password } = body;
    if (!username || !password) {
      return buildResponse(config, 400, { status: 'error', error: 'Username and password are required' });
    }
    const user = users.find((u) => u.username === username);
    if (!user || !(await verifyPassword(password, user.password))) {
      return buildResponse(config, 401, { status: 'error', error: 'نام کاربری یا رمز عبور اشتباه است' });
    }
    const token = createToken(user);
    return buildResponse(config, 200, {
      status: 'success',
      message: 'Login successful',
      token,
      role: user.role,
      tools: user.tools || [],
      layers: user.layers || [],
    });
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    if (!authUser) {
      return buildResponse(config, 401, { status: 'error', error: 'Authentication required' });
    }
    const user = users.find((u) => u._id === authUser.id || u.username === authUser.username);
    if (!user) {
      return buildResponse(config, 404, { status: 'error', error: 'User not found' });
    }
    const { password: _p, ...safeUser } = user;
    return buildResponse(config, 200, { status: 'success', user: safeUser });
  }

  if (method === 'POST' && (pathname === '/api/register' || pathname === '/api/auth/register')) {
    if (pathname === '/api/register' && authUser?.role !== 'admin') {
      return buildResponse(config, 403, { status: 'error', error: 'Admin privileges required' });
    }
    const { username, password, role = 'user', tools = [], layers: allowedLayers = [] } = body;
    if (!username || !password) {
      return buildResponse(config, 400, { status: 'error', error: 'Username and password are required' });
    }
    if (users.some((u) => u.username === username)) {
      return buildResponse(config, 400, { status: 'error', error: 'Username already exists' });
    }
    const now = new Date().toISOString();
    const newUser = {
      _id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username,
      password: await hashPassword(password),
      role: pathname === '/api/auth/register' ? 'user' : role,
      tools: Array.isArray(tools) ? tools : [],
      layers: Array.isArray(allowedLayers) ? allowedLayers : [],
      createdAt: now,
      updatedAt: now,
    };
    const nextUsers = [...users, newUser];
    await writeStore('users', LS_USERS_KEY, nextUsers);
    const { password: _p, ...safeUser } = newUser;
    return buildResponse(config, 201, { status: 'success', message: 'User registered', user: safeUser });
  }

  // --- Users endpoints ---
  if (method === 'GET' && pathname === '/api/users') {
    if (!authUser || authUser.role !== 'admin') {
      return buildResponse(config, 403, { status: 'error', error: 'Admin privileges required' });
    }
    const safeUsers = users.map(({ password: _p, ...u }) => u);
    return buildResponse(config, 200, { status: 'success', message: 'Users fetched successfully', users: safeUsers });
  }

  if (method === 'PUT' && pathname.startsWith('/api/users/')) {
    if (!authUser || authUser.role !== 'admin') {
      return buildResponse(config, 403, { status: 'error', error: 'Admin privileges required' });
    }
    const id = pathname.replace('/api/users/', '');
    const idx = users.findIndex((u) => u._id === id);
    if (idx === -1) {
      return buildResponse(config, 404, { status: 'error', error: 'User not found' });
    }
    const updated = {
      ...users[idx],
      role: body.role ?? users[idx].role,
      tools: body.tools ?? users[idx].tools,
      layers: body.layers ?? users[idx].layers,
      updatedAt: new Date().toISOString(),
    };
    users[idx] = updated;
    await writeStore('users', LS_USERS_KEY, users);
    const { password: _p, ...safeUser } = updated;
    return buildResponse(config, 200, { status: 'success', user: safeUser });
  }

  if (method === 'DELETE' && pathname.startsWith('/api/users/')) {
    if (!authUser || authUser.role !== 'admin') {
      return buildResponse(config, 403, { status: 'error', error: 'Admin privileges required' });
    }
    const id = pathname.replace('/api/users/', '');
    const nextUsers = users.filter((u) => u._id !== id);
    await writeStore('users', LS_USERS_KEY, nextUsers);
    return buildResponse(config, 200, { status: 'success', message: 'User deleted' });
  }

  // --- Layers & GeoJSON endpoints ---
  if (method === 'GET' && pathname === '/api/parcels-geojson') {
    const l = layers.find((x) => x.name === 'main-parcels');
    return buildResponse(config, 200, l?.data || { type: 'FeatureCollection', features: [] });
  }
  if (method === 'GET' && pathname === '/api/mahalles') {
    const l = layers.find((x) => x.name === 'main-mahalles');
    return buildResponse(config, 200, l?.data || { type: 'FeatureCollection', features: [] });
  }
  if (method === 'GET' && pathname === '/api/mabar') {
    const l = layers.find((x) => x.name === 'main-mabar');
    return buildResponse(config, 200, l?.data || { type: 'FeatureCollection', features: [] });
  }

  if (method === 'GET' && pathname === '/api/next-object-id') {
    return buildResponse(config, 200, { status: 'success', objectId: getNextObjectId(layers, 1) });
  }
  if (method === 'GET' && pathname === '/api/next-mabar-object-id') {
    const mabarOnly = layers.filter((l) => l.name === 'main-mabar');
    return buildResponse(config, 200, { status: 'success', objectId: getNextObjectId(mabarOnly, 2000) });
  }

  if (method === 'GET' && pathname === '/api/layers') {
    const storage = params.storage || 'db';
    const filtered = layers.filter((l) =>
      storage === 'local' ? l.storage === 'local' : l.storage !== 'local'
    );
    const accessible = filtered.filter((l) => {
      if (!authUser || l.storage === 'local' || l.storage === 'external') return true;
      return authUser.role === 'admin' || authUser.layers?.includes(l.name);
    });
    return buildResponse(config, 200, {
      status: 'success',
      message: 'Layers fetched successfully',
      layers: accessible,
    });
  }

  if (method === 'GET' && pathname.startsWith('/api/layers/')) {
    const name = decodeURIComponent(pathname.replace('/api/layers/', ''));
    const layer = layers.find((l) => l.name === name);
    if (!layer) {
      return buildResponse(config, 404, { status: 'error', error: 'Layer not found' });
    }
    return buildResponse(config, 200, { status: 'success', layer });
  }

  if (method === 'POST' && pathname === '/api/add-layer') {
    const { name, data, storage = 'db', color = '#3b82f6' } = body;
    if (!name) return buildResponse(config, 400, { status: 'error', error: 'Layer name required' });
    const now = new Date().toISOString();
    const fc = data?.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: Array.isArray(data) ? data : [] };
    const newLayer = {
      key: `${storage}:${name}`,
      name,
      storage,
      color,
      data: fc,
      count: fc.features.length,
      version: Date.now(),
      updatedAt: now,
    };
    const nextLayers = [...layers.filter((l) => l.key !== newLayer.key), newLayer];
    await writeStore('layers', LS_LAYERS_KEY, nextLayers);
    return buildResponse(config, 201, { status: 'success', layer: newLayer });
  }

  if (method === 'DELETE' && pathname === '/api/delete-layer') {
    const layerName = body.layerName || params.layerName;
    const storage = body.storage || params.storage;
    const nextLayers = layers.filter((l) => !(l.name === layerName && (!storage || l.storage === storage)));
    await writeStore('layers', LS_LAYERS_KEY, nextLayers);
    return buildResponse(config, 200, { status: 'success', message: 'Layer deleted' });
  }

  if (method === 'POST' && (pathname === '/api/update-layers' || pathname === '/api/force-update-layers')) {
    const incoming = Array.isArray(body.layers) ? body.layers : [];
    const now = new Date().toISOString();
    const nextLayers = [...layers];
    for (const item of incoming) {
      const storage = item.storage || 'db';
      const key = `${storage}:${item.name}`;
      const idx = nextLayers.findIndex((l) => l.key === key || l.name === item.name);
      const updatedItem = {
        key,
        name: item.name,
        storage,
        color: item.color || nextLayers[idx]?.color || '#3b82f6',
        data: item.data || nextLayers[idx]?.data || { type: 'FeatureCollection', features: [] },
        count: item.data?.features?.length || 0,
        version: Date.now(),
        updatedAt: now,
      };
      if (idx >= 0) nextLayers[idx] = updatedItem;
      else nextLayers.push(updatedItem);
    }
    await writeStore('layers', LS_LAYERS_KEY, nextLayers);
    return buildResponse(config, 200, { status: 'success', layers: nextLayers });
  }

  if (method === 'POST' && (pathname === '/api/add-feature' || pathname.endsWith('/create') || pathname.endsWith('/add-feature'))) {
    const targetName =
      body.layerName ||
      (pathname.includes('/parcel/') ? 'main-parcels' : pathname.includes('/mahalle/') ? 'main-mahalles' : pathname.includes('/mabar/') ? 'main-mabar' : 'main-parcels');
    const idx = layers.findIndex((l) => l.name === targetName);
    if (idx === -1) return buildResponse(config, 404, { status: 'error', error: 'Layer not found' });
    const feature = body.feature || {
      type: 'Feature',
      id: String(body.object_id || body.properties?.OBJECTID || Date.now()),
      geometry: body.geometry,
      properties: { ...(body.properties || {}), OBJECTID: body.properties?.OBJECTID ?? body.object_id ?? Date.now() },
    };
    const nextFeatures = [...(layers[idx].data?.features || []), feature];
    layers[idx] = {
      ...layers[idx],
      data: { type: 'FeatureCollection', features: nextFeatures },
      count: nextFeatures.length,
      version: Date.now(),
      updatedAt: new Date().toISOString(),
    };
    await writeStore('layers', LS_LAYERS_KEY, layers);
    return buildResponse(config, 201, { status: 'success', feature, layer: layers[idx] });
  }

  if (method === 'POST' && (pathname === '/api/update-feature' || pathname.endsWith('/update-feature') || pathname.endsWith('/update-geometry'))) {
    const targetName =
      body.layerName ||
      (pathname.includes('/parcel/') ? 'main-parcels' : pathname.includes('/mahalle/') ? 'main-mahalles' : pathname.includes('/mabar/') ? 'main-mabar' : null);
    const featureId = String(body.featureId ?? body.object_id ?? body.id ?? body.feature?.properties?.OBJECTID ?? body.feature?.id ?? '');
    let updated = false;
    for (let i = 0; i < layers.length; i++) {
      if (targetName && layers[i].name !== targetName) continue;
      const feats = layers[i].data?.features || [];
      const fIdx = feats.findIndex((f) => String(f?.properties?.OBJECTID ?? f?.id ?? '') === featureId);
      if (fIdx >= 0) {
        feats[fIdx] = body.feature
          ? body.feature
          : {
              ...feats[fIdx],
              geometry: body.geometry ?? feats[fIdx].geometry,
              properties: body.properties ? { ...feats[fIdx].properties, ...body.properties } : feats[fIdx].properties,
            };
        layers[i] = {
          ...layers[i],
          data: { type: 'FeatureCollection', features: [...feats] },
          version: Date.now(),
          updatedAt: new Date().toISOString(),
        };
        updated = true;
      }
    }
    if (updated) {
      await writeStore('layers', LS_LAYERS_KEY, layers);
      return buildResponse(config, 200, { status: 'success', message: 'Feature updated' });
    }
    return buildResponse(config, 404, { status: 'error', error: 'Feature not found' });
  }

  if (method === 'POST' && (pathname === '/api/delete-feature' || pathname.endsWith('/delete-feature') || pathname.endsWith('/delete'))) {
    const targetName =
      body.layerName ||
      (pathname.includes('/parcel/') ? 'main-parcels' : pathname.includes('/mahalle/') ? 'main-mahalles' : pathname.includes('/mabar/') ? 'main-mabar' : null);
    const featureId = String(body.featureId ?? body.object_id ?? body.id ?? '');
    for (let i = 0; i < layers.length; i++) {
      if (targetName && layers[i].name !== targetName) continue;
      const feats = (layers[i].data?.features || []).filter(
        (f) => String(f?.properties?.OBJECTID ?? f?.id ?? '') !== featureId
      );
      layers[i] = {
        ...layers[i],
        data: { type: 'FeatureCollection', features: feats },
        count: feats.length,
        version: Date.now(),
        updatedAt: new Date().toISOString(),
      };
    }
    await writeStore('layers', LS_LAYERS_KEY, layers);
    return buildResponse(config, 200, { status: 'success', message: 'Feature deleted' });
  }

  if (method === 'POST' && (pathname === '/api/add-parcel-property' || pathname === '/api/update-parcel-property' || pathname === '/api/delete-parcel-property')) {
    const parcelId = String(body.parcel_id ?? body.featureId ?? body.id ?? '');
    const key = body.key;
    const idx = layers.findIndex((l) => l.name === 'main-parcels');
    if (idx >= 0 && key) {
      const feats = (layers[idx].data?.features || []).map((f) => {
        if (String(f?.properties?.OBJECTID ?? f?.id ?? '') !== parcelId) return f;
        const props = { ...(f.properties || {}) };
        if (pathname.endsWith('delete-parcel-property')) {
          delete props[key];
        } else {
          props[key] = body.value;
        }
        return { ...f, properties: props };
      });
      layers[idx] = {
        ...layers[idx],
        data: { type: 'FeatureCollection', features: feats },
        version: Date.now(),
        updatedAt: new Date().toISOString(),
      };
      await writeStore('layers', LS_LAYERS_KEY, layers);
    }
    return buildResponse(config, 200, { status: 'success' });
  }

  return buildResponse(config, 404, { status: 'error', error: `Unsupported local endpoint: ${method} ${pathname}` });
};
