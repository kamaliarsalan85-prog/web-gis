import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, LayersControl, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import api, { safeGet, isStaticHost } from '../services/api';
import { io } from 'socket.io-client';
// ✅ Socket base URL from ENV or same-origin fallback
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : '');
import GeoJSONLayer from './GeoJSONLayer';
import ImportTool from './ImportTool';
import FeatureEditor from './FeatureEditor';
import GeometryEditor from './GeometryEditor';
import DrawTool from './DrawTool';
import FeatureFilterWrapper from './FeatureFilterWrapper';
import LayerActions from './LayerActions';
import SearchBar from './SearchBar';
import Tabs from './Tabs';
import { ToastContainer, toast } from 'react-toastify';
import { XMarkIcon, SunIcon, MoonIcon, RectangleStackIcon } from '@heroicons/react/24/solid';
import 'react-toastify/dist/ReactToastify.css';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { useUndoRedo } from './useUndoRedo';
import UndoRedoButtons from './UndoRedoButtons';
import L from 'leaflet';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
// --- Lazy Loading for Heavy Components ---
const StatisticalAnalysis = lazy(() => import('./PostFilterComponents/StatisticalAnalysis'));
const DataEditing = lazy(() => import('./PostFilterComponents/DataEditing'));
const DataExport = lazy(() => import('./PostFilterComponents/DataExport'));
const SpatialAnalysis = lazy(() => import('./PostFilterComponents/SpatialAnalysis'));
const VisualMapping = lazy(() => import('./PostFilterComponents/VisualMapping'));
const NetworkAnalysis = lazy(() => import('./PostFilterComponents/NetworkAnalysis'));
const DataJoining = lazy(() => import('./PostFilterComponents/DataJoining'));
const AdvancedModeling = lazy(() => import('./PostFilterComponents/AdvancedModeling'));
/* -------------------------- NEW: CACHING IMPLEMENTATION -------------------------- */
const LAYERS_CACHE_KEY = 'hominex-layers-cache';
const CACHE_EXPIRATION = 2 * 60 * 60 * 1000; // 2 hours
// دليل تغيير:
// خواندن JSON از localStorage قبلاً با JSON.parse مستقيم انجام مي‌شد و رشته
// "undefined" يا داده خراب کل نقشه را از کار مي‌انداخت؛ اين هلپر آن را امن مي‌کند.
const safeLocalJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined || raw === '' || raw === 'undefined' || raw === 'null') {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Invalid JSON in localStorage for ${key}:`, error);
    try {
      localStorage.removeItem(key);
    } catch (removeError) {
      console.warn(`Failed to remove invalid localStorage key ${key}:`, removeError);
    }
    return fallback;
  }
};
const cacheLayers = (layers) => {
  try {
    const cacheData = {
      data: layers,
      timestamp: Date.now()
    };
    localStorage.setItem(LAYERS_CACHE_KEY, JSON.stringify(cacheData));
  } catch (e) {
    console.error('Failed to cache layers:', e);
  }
};
const getCachedLayers = () => {
  const parsed = safeLocalJSON(LAYERS_CACHE_KEY, null);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  if (!Array.isArray(parsed.data) || typeof parsed.timestamp !== 'number') {
    try {
      localStorage.removeItem(LAYERS_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to remove corrupted layers cache:', error);
    }
    return null;
  }
  if (Date.now() - parsed.timestamp < CACHE_EXPIRATION) {
    return parsed.data;
  }
  return null;
};
/* -------------------------- END OF CACHING IMPLEMENTATION -------------------------- */
/* ---------- helper chunking ---------- */
const chunkLayers = (layers, maxChunkSize = 3) => {
  const chunks = [];
  for (let i = 0; i < layers.length; i += maxChunkSize) {
    chunks.push(layers.slice(i, i + maxChunkSize));
  }
  return chunks;
};
/* ---------- simple concurrency runner for tasks ---------- */
const runWithLimit = async (tasks, limit = 2) => {
  const results = new Array(tasks.length);
  let idx = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = idx++;
      if (current >= tasks.length) break;
      try {
        results[current] = await tasks[current]();
      } catch (e) {
        results[current] = { error: e };
      }
    }
  });
  await Promise.all(workers);
  return results;
};
/* ---------- helpers for dedupe / stable keys ---------- */
const makeLayerId = (layer) => {
  const ver = layer?.version ?? (layer?.updatedAt ? new Date(layer.updatedAt).getTime() : '');
  return `${String(layer?.name ?? '')}::${String(ver)}`;
};
const dedupeLayersById = (layers = []) => {
  const map = new Map();
  for (const l of layers) {
    const id = makeLayerId(l);
    map.set(id, l);
  }
  return Array.from(map.values());
};
const makeLayerKey = (layer) => {
  const ver = layer?.version ?? (layer?.updatedAt ? new Date(layer.updatedAt).getTime() : '');
  const count =
    (layer?.data && Array.isArray(layer.data.features) && layer.data.features.length) ||
    (Array.isArray(layer?.data) && layer.data.length) ||
    '';
  return `${String(layer?.storage ?? 's')}:${String(layer?.name)}:${String(ver)}:${String(count)}`;
};
/* ---------- LabelManager (unchanged) with debounce ---------- */
function LabelManager({ layers = [], active, property, zoomThreshold, filteredFeatures = [] }) {
  const map = useMap();
  const groupRef = useRef(null);
  useEffect(() => {
    groupRef.current = L.layerGroup().addTo(map);
    return () => {
      try {
        groupRef.current && groupRef.current.remove();
      } catch (e) { }
    };
  }, [map]);
  const stableFilteredFeatures = useMemo(() => filteredFeatures || [], [filteredFeatures]);
  // Debounced update function
  const debouncedUpdate = useCallback(
    debounce(() => {
      if (!groupRef.current) return;
      const update = () => {
        try {
          groupRef.current.clearLayers();
        } catch (e) { }
        if (!active) return;
        const z = map.getZoom();
        if (z < zoomThreshold) return;
        const HIGH_FEATURE_LIMIT = 500;
        const HIGH_FEATURE_ZOOM = 18;
        const bounds = map.getBounds();
        const activeLayer = layers.find((layer) => layer.visible);
        let featsToLabel = [];
        if (stableFilteredFeatures.length > 0 && activeLayer) {
          featsToLabel = stableFilteredFeatures;
        } else {
          layers.forEach((layer) => {
            if (!layer.visible || !layer.data) return;
            const feats = Array.isArray(layer.data.features)
              ? layer.data.features
              : Array.isArray(layer.data)
                ? layer.data
                : layer.data.features ?? [];
            if (feats.length > HIGH_FEATURE_LIMIT && z < HIGH_FEATURE_ZOOM) return;
            featsToLabel = featsToLabel.concat(
              feats.filter((f) => {
                let coords = null;
                const geom = f.geometry;
                if (!geom) return false;
                if (geom.type === 'Point') {
                  coords = geom.coordinates;
                } else if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
                  const ring = geom.coordinates[0];
                  const sum = ring.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
                  coords = [sum[0] / ring.length, sum[1] / ring.length];
                } else if (Array.isArray(geom.coordinates)) {
                  const c0 = geom.coordinates[0];
                  if (Array.isArray(c0[0])) coords = c0[0];
                  else coords = c0;
                }
                if (!coords || !Array.isArray(coords)) return false;
                const lng = coords[0];
                const lat = coords[1];
                return bounds.contains([lat, lng]);
              })
            );
          });
        }
        featsToLabel.forEach((f) => {
          try {
            const val = f?.properties?.[property] ?? f?.properties?.Name ?? null;
            if (val === null || val === undefined || String(val).trim() === '') return;
            const geom = f.geometry;
            if (!geom) return;
            let coords = null;
            if (geom.type === 'Point') {
              coords = geom.coordinates;
            } else if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
              const ring = geom.coordinates[0];
              const sum = ring.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
              coords = [sum[0] / ring.length, sum[1] / ring.length];
            } else if (Array.isArray(geom.coordinates)) {
              const c0 = geom.coordinates[0];
              if (Array.isArray(c0[0])) coords = c0[0];
              else coords = c0;
            }
            if (!coords || !Array.isArray(coords)) return;
            const lng = coords[0];
            const lat = coords[1];
            const html = `<div style="
              padding: 6px 14px;
              font-size: 14px;
              font-weight: 600;
              color: #222;
              border-radius: 8px;
              box-shadow: 0 6px 18px rgba(0,0,0,0.18);
              background: linear-gradient(90deg, #f8fafc 80%, #e0e7ef 100%);
              border: 1.5px solid #3b82f6;
              direction: rtl;
              letter-spacing: 0.2px;
              text-shadow: 0 1px 0 #fff, 0 0px 2px #3b82f6;
              filter: drop-shadow(0 2px 6px rgba(59,130,246,0.08));
              ">
              ${String(val)}
            </div>`;
            const icon = L.divIcon({ className: 'hominex-feature-label', html, iconSize: null });
            const marker = L.marker([lat, lng], { icon, interactive: false });
            groupRef.current.addLayer(marker);
          } catch (e) { }
        });
      };
      update();
    }, 300), // 300ms delay
    [layers, active, property, zoomThreshold, map, stableFilteredFeatures]
  );
  useEffect(() => {
    debouncedUpdate();
    map.on('zoomend', debouncedUpdate);
    map.on('moveend', debouncedUpdate);
    return () => {
      try {
        map.off('zoomend', debouncedUpdate);
        map.off('moveend', debouncedUpdate);
      } catch (e) { }
    };
  }, [debouncedUpdate]);
  return null;
}
// Helper function for debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
/* ---------- OverlayVisibilitySync (unchanged) ---------- */
function OverlayVisibilitySync({ setLayers }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const onOverlayAdd = (e) => {
      const name = e.name || e.layer?.options?.name;
      if (!name) return;
      setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible: true } : l)), `نمایش لایه: ${name}`);
    };
    const onOverlayRemove = (e) => {
      const name = e.name || e.layer?.options?.name;
      if (!name) return;
      setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible: false } : l)), `مخفی کردن لایه: ${name}`);
    };
    map.on('overlayadd', onOverlayAdd);
    map.on('overlayremove', onOverlayRemove);
    return () => {
      map.off('overlayadd', onOverlayAdd);
      map.off('overlayremove', onOverlayRemove);
    };
  }, [map, setLayers]);
  return null;
}
/* ---------- MapWheelControl: updated to include isLayersOpen ---------- */
function MapWheelControl({ isFeatureEditorOpen, isTabsOpen, isToolsOpen, isLayersOpen }) {
  const map = useMap();
  useEffect(() => {
    if (isFeatureEditorOpen || isTabsOpen || isToolsOpen || isLayersOpen) {
      map.scrollWheelZoom.disable();
    } else {
      map.scrollWheelZoom.enable();
    }
  }, [map, isFeatureEditorOpen, isTabsOpen, isToolsOpen, isLayersOpen]);
  return null;
}
/* ---------- MapClickHandler (kept for filter behavior) ---------- */
function MapClickHandler({ filteredFeatures, filterMode, setFilterMode, setFilteredFeatures }) {
  const map = useMap();
  useEffect(() => {
    const handleClick = (e) => {
      if (e.originalEvent.target === map.getContainer()) {
        if (filteredFeatures.length === 0 && filterMode) {
          setFilterMode(false);
          setFilteredFeatures([]);
        }
      }
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, filteredFeatures, filterMode, setFilterMode, setFilteredFeatures]);
  return null;
}
/* ---------- CoreMap (main) ---------- */
const CoreMap = ({ children, center = [37.4750, 57.3332], zoom = 14 }) => {
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [selectedLayerName, setSelectedLayerName] = useState(null);
  const [editableLayerIndex, setEditableLayerIndex] = useState(null);
  const [showEditOptions, setShowEditOptions] = useState(false);
  const [editMode, setEditMode] = useState(null);
  const [drawMode, setDrawMode] = useState(null);
  const [filterMode, setFilterMode] = useState(false);
  const [filteredFeatures, setFilteredFeatures] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState('light');
  const navigate = useNavigate();
  const userRole = localStorage.getItem('role');
  const userTools = safeLocalJSON('tools', []);
  const socketRef = useRef(null);
  const setLayersRef = useRef(null);
  const isUndoingOrRedoing = useRef(false);
  const previousLayersRef = useRef([]);
  const fetchTimerRef = useRef(null);
  const [labelActive, setLabelActive] = useState(false);
  const [labelProperty, setLabelProperty] = useState('Name');
  const [labelZoom, setLabelZoom] = useState(17);
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [showLayerModal, setShowLayerModal] = useState(false);
  const [operationType, setOperationType] = useState(null);
  const [selectedLayerForOp, setSelectedLayerForOp] = useState(null);
  // tools modal state
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const toolsButtonRef = useRef(null);
  const [toolsPos, setToolsPos] = useState({ left: 15, top: 10 });
  const [toolsSize, setToolsSize] = useState({ width: 360, height: 420 });
  const [isDragging, setIsDragging] = useState(false);
  const dragLast = useRef({ x: 0, y: 0 });
  // layers modal state
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef(null);
  const layersButtonRef = useRef(null);
  const [layersPos, setLayersPos] = useState({ left: 0, top: 10 });
  const [layersSize, setLayersSize] = useState({ width: 360, height: 420 });
  const [isLayersDragging, setIsLayersDragging] = useState(false);
  const layersDragLast = useRef({ x: 0, y: 0 });
  // track map instance
  const [mapInstance, setMapInstance] = useState(null);
  // store previous interaction enabled states and pointer-events value
  const mapInteractionStateRef = useRef({
    dragging: null,
    touchZoom: null,
    scrollWheelZoom: null,
    doubleClickZoom: null,
    boxZoom: null,
    pointerEvents: null,
  });
  const { state: layers, updateState: setLayers, undo, redo, canUndo, canRedo, history, stateRef } = useUndoRedo([], 20);
  const activeLayers = layers.filter((layer) => layer.visible);
  const extractPropertiesFromLayers = useCallback(() => {
    const activeLayers = layers.filter((layer) => layer.visible && layer.data);
    const allProps = new Set();
    activeLayers.forEach((layer) => {
      const features = Array.isArray(layer.data.features)
        ? layer.data.features
        : Array.isArray(layer.data)
          ? layer.data
          : layer.data.features || [];
      features.forEach((feature) => {
        if (feature && feature.properties) {
          Object.keys(feature.properties).forEach((prop) => {
            if (prop && String(prop).trim() !== '') {
              allProps.add(prop);
            }
          });
        }
      });
    });
    return Array.from(allProps).sort();
  }, [layers]);
  useEffect(() => {
    const propsList = extractPropertiesFromLayers();
    setAvailableProperties(propsList);
    if (propsList.length > 0 && !propsList.includes(labelProperty)) {
      setLabelProperty(propsList[0] || 'Name');
    }
  }, [extractPropertiesFromLayers, labelProperty]);
  useEffect(() => {
    setLayersRef.current = setLayers;
  }, [setLayers]);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      toast.error('لطفاً ابتدا وارد شوید');
    }
  }, [navigate]);
  // ---------- NEW: track transition into filterMode to show alert only when enabling ----------
  const prevFilterModeRef = useRef(filterMode);
  useEffect(() => {
    if (!prevFilterModeRef.current && filterMode) {
      // وقتی فیلتِر فعال می‌شود: نمایش اطلاع‌رسانی (آلرت).
      // توجه: این پیام در زمان لغو (غیرفعال‌سازی) نمایش داده نخواهد شد.
      toast.info('برای جابجایی روی نقشه، فیلتر مکانی را فعال کنید');
    }
    prevFilterModeRef.current = filterMode;
  }, [filterMode]);
  // -------------------------------------------------------------------------------------------
  const fetchLayers = useCallback(async () => {
    if (editMode === 'geometry') {
      console.log('fetchLayers blocked during geometry edit');
      return;
    }
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }
    fetchTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token available');
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const dbReq = api.get('/api/layers', { headers, params: { storage: 'db', t: Date.now() } });
        const localReq = api.get('/api/layers', { headers, params: { storage: 'local', t: Date.now() } });
        const [dbResponse, localResponse] = await Promise.all([dbReq, localReq]);
        const allServerLayersRaw = [
          ...(dbResponse.data.layers || []),
          ...(localResponse.data.layers || []),
        ];
        const allServerLayers = dedupeLayersById(allServerLayersRaw);
        const updater = (prevLayers = []) => {
          const firstLoad = !prevLayers || prevLayers.length === 0;
          const prevByName = (prevLayers || []).reduce((acc, l) => {
            acc[l.name] = l;
            return acc;
          }, {});
          const merged = allServerLayers.map((serverLayer) => {
            const prev = prevByName[serverLayer.name] || {};
            const version =
              serverLayer.version ??
              (serverLayer.updatedAt ? new Date(serverLayer.updatedAt).getTime() : Date.now());
            return {
              ...serverLayer,
              version,
              visible: prev.hasOwnProperty('visible') ? prev.visible : firstLoad ? false : serverLayer.visible ?? false,
              color: serverLayer.color ?? prev.color ?? '#0000FF',
            };
          });
          setSelectedLayerName((prevName) => {
            if (!prevName) return prevName;
            const exists = merged.find((l) => l.name === prevName);
            return exists ? prevName : null;
          });
          previousLayersRef.current = merged;
          return merged;
        };
        if (setLayersRef.current && !isUndoingOrRedoing.current) {
          setLayersRef.current(updater, 'بروزرسانی لایه‌ها از سرور (DB + Local)', { toast: false, record: false });
        }
        console.log('db X-Cache:', dbResponse.headers['x-cache'], 'X-Fetch-Time-ms:', dbResponse.headers['x-fetch-time-ms']);
        console.log('local X-Cache:', localResponse.headers['x-cache'], 'X-Fetch-Time-ms:', localResponse.headers['x-fetch-time-ms']);
      } catch (error) {
        console.error('Fetch layers error:', error.response?.data || error.message);
        if (error.response?.status === 401 || (error.response?.data?.error && String(error.response.data.error).toLowerCase().includes('token'))) {
          toast.error('جلسه شما منقضی شده است. لطفاً دوباره وارد شوید.');
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('tools');
          navigate('/login');
        } else if (error.response?.status === 400) {
          toast.error(error.response.data.error || 'خطا در درخواست به سرور');
        } else {
          toast.error('خطا در دریافت لایه‌ها از سرور: ' + (error.message || 'ناشناخته'));
        }
      } finally {
        setIsLoading(false);
      }
    }, 1000);
  }, [editMode, setLayers, navigate]);
  /* -------------------------- NEW: CACHE IMPLEMENTATION -------------------------- */
  useEffect(() => {
    if (editMode === 'geometry') {
      console.log('fetchLayers blocked during geometry edit');
      return;
    }
    const cachedLayers = getCachedLayers();
    if (cachedLayers) {
      console.log('Using cached layers');
      setLayers(cachedLayers);
    } else {
      console.log('Fetching layers from server');
      fetchLayers();
    }
  }, []);
  useEffect(() => {
    if (layers.length > 0) {
      cacheLayers(layers);
    }
  }, [layers]);
  /* -------------------------- END OF CACHE IMPLEMENTATION -------------------------- */
  
  // --- NEW: State for tracking parcel and mabar data loading ---
  const [parcelsLoaded, setParcelsLoaded] = useState(false);
  const [mabarLoaded, setMabarLoaded] = useState(false);
  
  // --- NEW: Effect to load parcel data when main-parcels layer is activated ---
  useEffect(() => {
    const mainParcelsLayer = layers.find(layer => layer.name === 'main-parcels');
    if (mainParcelsLayer && mainParcelsLayer.visible && !parcelsLoaded) {
      const loadParcels = async () => {
        try {
          setIsLoading(true);
          let page = 1;
          let hasMore = true;
          let allFeatures = [];
          
          while (hasMore) {
            try {
              const response = await safeGet(
                `/api/parcels-geojson?page=${page}&page_size=100`,
                { type: 'FeatureCollection', features: [] }
              );
              const data = response.data || { type: 'FeatureCollection', features: [] };
              
              if (data.features && data.features.length > 0) {
                allFeatures = [...allFeatures, ...data.features];
              }
              
              if (data.pagination?.has_next) {
                page++;
              } else {
                hasMore = false;
              }
            } catch (err) {
              console.error("❌ خطا در لود صفحه", page, err);
              hasMore = false;
            }
          }
          
          // Update the layer with the new features
          if (allFeatures.length > 0) {
            setLayers(prev => prev.map(l => 
              l.name === 'main-parcels' 
                ? { 
                    ...l, 
                    data: { 
                      ...l.data, 
                      features: [...(l.data?.features || []), ...allFeatures] 
                    } 
                  } 
                : l
            ));
          }
          
          setParcelsLoaded(true);
          setIsLoading(false);
        } catch (error) {
          console.error('Error loading parcels data:', error);
          setIsLoading(false);
        }
      };
      
      loadParcels();
    }
  }, [layers, parcelsLoaded]);
  
  // --- NEW: Effect to load mabar data when main-mabar layer is activated ---
  useEffect(() => {
    const mainMabarLayer = layers.find(layer => layer.name === 'main-mabar');
    const mainParcelsLayer = layers.find(layer => layer.name === 'main-parcels');
    
    if (mainMabarLayer && mainMabarLayer.visible && !mabarLoaded && mainParcelsLayer && mainParcelsLayer.data) {
      const loadMabar = async () => {
        try {
          setIsLoading(true);
          // Get the parcel IDs from the main-parcels layer
          let idsParam = '';
          
          if (mainParcelsLayer.data.features) {
            const parcelIds = mainParcelsLayer.data.features
              .map(f => f.properties?.mahalle_ID)
              .filter(id => id !== undefined && id !== null);
            
            if (parcelIds.length > 0) {
              idsParam = parcelIds.join(',');
            }
          }
          
          if (idsParam) {
            const response = await safeGet(
              `/api/mabar?ids=${idsParam}`,
              { type: 'FeatureCollection', features: [] }
            );
            const data = response.data || { type: 'FeatureCollection', features: [] };
            
            // Update the layer with the new features
            if (data.features && data.features.length > 0) {
              setLayers(prev => prev.map(l => 
                l.name === 'main-mabar' 
                  ? { 
                      ...l, 
                      data: { 
                        ...l.data, 
                        features: data.features 
                      } 
                    } 
                  : l
              ));
            }
          }
          
          setMabarLoaded(true);
          setIsLoading(false);
        } catch (error) {
          console.error('Error loading mabar data:', error);
          setIsLoading(false);
        }
      };
      
      loadMabar();
    }
  }, [layers, mabarLoaded]);

  const syncLayersWithServer = useCallback(
    async (layersToSync, actionDescription, options = { force: false }) => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const changedLayers = layersToSync.filter((layer) => {
          const prev = previousLayersRef.current.find((pl) => pl.name === layer.name);
          return !prev || prev.version !== layer.version;
        });
        if (changedLayers.length === 0) {
          setIsLoading(false);
          return;
        }
        const chunks = chunkLayers(changedLayers, 3);
        const tasks = chunks.map((chunk) => async () => {
          const body = { layers: chunk, force: options.force === true };
          const resp = await api.post('/api/update-layers', body, { headers });
          return resp.data;
        });
        const responses = await runWithLimit(tasks, 2);
        const updatedLayers = responses.flatMap((r) => (r?.updated || []));
        if (updatedLayers.length > 0) {
          setLayers((prev) =>
            prev.map((l) => {
              const updated = updatedLayers.find((ul) => ul === l.name || (ul && ul.name === l.name));
              if (!updated) return l;
              if (typeof updated === 'string') return { ...l, name: updated };
              return { ...l, ...updated };
            })
          );
          previousLayersRef.current = previousLayersRef.current.map((pl) => {
            const found = updatedLayers.find((u) => (typeof u === 'string' ? u === pl.name : u.name === pl.name));
            return found ? { ...pl, version: Date.now() } : pl;
          });
        }
      } catch (error) {
        console.error('syncLayersWithServer error:', error.response?.data || error.message);
        if (error.response?.status === 409) {
          toast.error('تعارض: لایه در سرور تغییر کرده است. در حال بازخوانی...');
          await fetchLayers();
        } else {
          toast.error('خطا در همگام‌سازی لایه‌ها');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [setLayers, fetchLayers]
  );
  useEffect(() => {
  if (isStaticHost()) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  const s = io(SOCKET_URL, {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });
  socketRef.current = s;
  s.on('connect', () => console.log('Connected to socket server'));
  s.on('layerUpdated', ({ layerName }) => {
    if (isUndoingOrRedoing.current || editMode === 'geometry') return;
    if (fetchTimerRef.current) {
      return;
    }
    console.log(`لایه ${layerName} در سرور به روز شد.`);
    toast.info(`لایه ${layerName} به‌روزرسانی شد`);
    // ✅ تابع جدید: به‌روزرسانی فقط یک لایه
    const updateSingleLayer = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token available');
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        // درخواست برای لایه DB
        const dbResp = await api.get('/api/layers', { 
          headers, 
          params: { storage: 'db', name: layerName } 
        });
        // درخواست برای لایه Local
        const localResp = await api.get('/api/layers', { 
          headers, 
          params: { storage: 'local', name: layerName } 
        });
        const serverLayersRaw = [
          ...(dbResp.data.layers || []),
          ...(localResp.data.layers || []),
        ];
        const serverLayer = serverLayersRaw.find(l => l.name === layerName);
        if (serverLayer) {
          // ❗ ابتدا لایه را در UI به‌روز کن
          setLayers(prev => 
            prev.map(l => 
              l.name === layerName 
                ? { 
                    ...l, 
                    data: serverLayer.data, 
                    version: serverLayer.version ?? (serverLayer.updatedAt ? new Date(serverLayer.updatedAt).getTime() : Date.now()), 
                    color: serverLayer.color ?? l.color 
                  } 
                : l
            )
          );
          // ✅ سپس previousLayersRef را برای این لایه به‌روز کن
          previousLayersRef.current = previousLayersRef.current.map(l =>
            l.name === layerName ? { ...l, version: serverLayer.version } : l
          );
        }
      } catch (error) {
        console.error('Error updating single layer:', error);
        toast.error('خطا در به‌روزرسانی لایه');
      }
    };
    // 🔁 اجرای تابع به‌روزرسانی لایه
    updateSingleLayer();
  });
  s.on('connect_error', (err) => {
    if (err.message?.toLowerCase().includes('unauthorized') || err?.code === 'AUTH_ERROR') {
      s.io.opts.reconnection = false;
      toast.error('خطای احراز هویت. لطفاً دوباره وارد شوید.');
      navigate('/login');
    }
  });
  return () => {
    console.log('Socket cleanup');
    if (socketRef.current) {
      try {
        socketRef.current.off('layerUpdated');
        socketRef.current.off('connect');
        socketRef.current.off('connect_error');
        socketRef.current.disconnect();
      } catch (e) {
        console.warn('Socket cleanup error:', e);
      }
      socketRef.current = null;
    }
  };
}, [navigate, editMode]);
  const handleUndo = useCallback(async () => {
    if (drawMode || filterMode) {
      toast.warn('نمی‌توان در حالت ترسیم یا فیلتر بازگشت کرد');
      return;
    }
    isUndoingOrRedoing.current = true;
    undo();
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await api.post('/api/force-update-layers', { layers: stateRef.current }, { headers });
      toast.success('بازگشت با موفقیت انجام شد.');
    } catch (error) {
      toast.error('خطا در همگام‌سازی بازگشت');
    } finally {
      setSelectedFeature(null);
      setSelectedLayerName(null);
      setEditableLayerIndex(null);
      setShowEditOptions(false);
      setEditMode(null);
      setTimeout(() => {
        isUndoingOrRedoing.current = false;
      }, 300);
    }
  }, [undo, stateRef, drawMode, filterMode]);
  const handleRedo = useCallback(async () => {
    if (drawMode || filterMode) {
      toast.warn('نمی‌توان در حالت ترسیم یا فیلتر بازگردانی کرد');
      return;
    }
    isUndoingOrRedoing.current = true;
    redo();
    try {
      await syncLayersWithServer(stateRef.current, 'بازگردانی (redo)', { force: true });
      toast.success('بازگردانی با موفقیت انجام شد.');
    } catch (error) {
      toast.error('خطا در همگام‌سازی بازگردانی');
    } finally {
      setSelectedFeature(null);
      setSelectedLayerName(null);
      setEditableLayerIndex(null);
      setShowEditOptions(false);
      setEditMode(null);
      setTimeout(() => {
        isUndoingOrRedoing.current = false;
      }, 300);
    }
  }, [redo, syncLayersWithServer, stateRef, drawMode, filterMode]);
  const handleLayerUpdate = useCallback(
    (updater, actionDescription) => {
      setLayers(updater, actionDescription);
    },
    [setLayers]
);
  const handleSaveFeature = useCallback(
  async (updatedProperties, serverData, layerUpdater, actionDescription) => {
    if (!selectedFeature || !selectedLayerName) {
      toast.error('هیچ فیچر یا لایه‌ای انتخاب نشده است');
      return;
    }
    try {
      if (serverData) {
        if (serverData.conflict && serverData.serverLayer) {
          setLayers(
            (prev) =>
              prev.map((l) =>
                l.name === serverData.serverLayer.name
                  ? {
                      ...l,
                      data: serverData.serverLayer.data,
                      version: serverData.serverLayer.version,
                      updatedAt: serverData.serverLayer.updatedAt,
                    }
                  : l
              ),
            `رفع تعارض نسخه برای لایه ${selectedLayerName}`,
            { toast: false }
          );
          previousLayersRef.current = previousLayersRef.current.map((l) =>
            l.name === serverData.serverLayer.name
              ? { ...l, version: serverData.serverLayer.version }
              : l
          );
        } else if (layerUpdater) {
          setLayers(layerUpdater, actionDescription, { toast: false });
          previousLayersRef.current = previousLayersRef.current.map((l) =>
            l.name === serverData.layer?.name
              ? { ...l, version: serverData.layer.version }
              : l
          );
        }
        setSelectedFeature(null);
        setEditMode(null);
        setShowEditOptions(false);
        toast.success('تغییرات ذخیره شد');
        return;
      }
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
      const featureId = selectedFeature.id || selectedFeature.properties?.mahalle_ID;
      if (!featureId) {
        toast.error('شناسه فیچر نامعتبر است');
        return;
      }
      const layer = layers.find((l) => l.name === selectedLayerName);
      const isMainParcels = selectedLayerName === 'main-parcels';
      const payload = isMainParcels
        ? {
            layerName: selectedLayerName,
            id: String(featureId),
            key: Object.keys(updatedProperties)[0],
            value: Object.values(updatedProperties)[0],
          }
        : {
            layerName: selectedLayerName,
            updatedFeature: {
              type: 'Feature',
              geometry: selectedFeature.geometry,
              properties: {
                ...selectedFeature.properties,
                ...updatedProperties,
                mahalle_ID: selectedFeature.properties?.mahalle_ID ?? featureId,
              },
              ...(selectedFeature.id ? { id: selectedFeature.id } : {}),
            },
            expectedVersion: layer?.version,
          };
      console.log('Saving feature to server, layer:', selectedLayerName, 'isMainParcels:', isMainParcels);
      const resp = await api.post('/api/update-feature', payload, { headers });
      if (resp.data?.layer) {
        const returned = resp.data.layer;
        setLayers(
          (prev) =>
            prev.map((l) =>
              l.name === returned.name
                ? {
                    ...l,
                    data: returned.data,
                    version: returned.version ?? (returned.updatedAt ? new Date(returned.updatedAt).getTime() : Date.now()),
                    color: returned.color ?? l.color,
                  }
                : l
            ),
          `ذخیره فیچر در لایه: ${selectedLayerName}`,
          { toast: true }
        );
        // ✅ فقط previousLayersRef را برای لایه فعلی به‌روز کن (سبک)
        previousLayersRef.current = previousLayersRef.current.map((l) =>
          l.name === returned.name ? { ...l, version: returned.version } : l
        );
      } else {
        toast.error('پاسخ سرور نامعتبر بود');
      }
      setSelectedFeature(null);
      setEditMode(null);
      setShowEditOptions(false);
      toast.success('تغییرات ویژگی‌ها ذخیره شد');
    } catch (error) {
      console.error('Save feature error:', error.response?.data || error.message);
      if (error.response?.status === 409) {
        toast.error('تعارض: لایه در سرور تغییر کرده است. لطفاً دوباره بارگذاری کنید.');
        await fetchLayers(); // ⚠️ فقط در صورت تعارض، تمام لایه‌ها را بخوان
      } else if (error.response?.status === 401) {
        toast.error('جلسه شما منقضی شده است. لطفاً دوباره وارد شوید.');
        navigate('/login');
      } else {
        toast.error(error.response?.data?.error || 'خطا در ذخیره تغییرات');
      }
    }
  },
  [selectedFeature, selectedLayerName, layers, setLayers, navigate]
);
  // اضافه کردن ref برای جلوگیری از کلیک‌های سریع در موبایل
  const lastClickTimeRef = useRef(0);
  const handleFeatureClick = useCallback(
    (feature, layerName) => {
      // جلوگیری از اجرای چندگانه در دستگاه‌های موبایل
      if (Date.now() - lastClickTimeRef.current < 300) {
        return;
      }
      lastClickTimeRef.current = Date.now();
      // اگر filterMode فعاله و filteredFeatures خالیه، filterMode رو غیرفعال کن
      if (filterMode && filteredFeatures.length === 0) {
        setFilterMode(false);
        setFilteredFeatures([]);
      }
      // اگر drawMode یا filterMode فعاله (و filteredFeatures خالی نیست)، کلیک رو نادیده بگیر
      if (drawMode || (filterMode && filteredFeatures.length > 0)) return;
      setSelectedFeature(feature);
      const layerIndex = layers.findIndex((l) => l.name === layerName);
      const computedLayerName = layerIndex !== -1 ? layers[layerIndex]?.name : null;
      setSelectedLayerName(computedLayerName);
      setEditableLayerIndex(layerIndex);
      setShowEditOptions(true);
      setEditMode(null);
    },
    [layers, drawMode, filterMode, filteredFeatures, setFilterMode, setFilteredFeatures]
  );
  const openFeatureEditor = () => {
    setDrawMode(null);
    setFilterMode(false);
    setShowEditOptions(false);
    setEditMode('properties');
  };
  const openGeometryEditor = () => {
    setShowEditOptions(false);
    setEditMode('geometry');
    const layerIndex = layers.findIndex((l) => l.name === selectedLayerName);
    if (layerIndex === -1) {
      toast.error('لایه انتخاب‌شده یافت نشد');
      setEditMode(null);
      setSelectedFeature(null);
      return;
    }
    setEditableLayerIndex(layerIndex);
  };
  const handleStartOperation = (type) => {
    const activeLayers = layers.filter((layer) => layer.visible);
    if (activeLayers.length === 0) {
      toast.error('هیچ لایه‌ای فعال نیست');
      return;
    } else if (activeLayers.length === 1) {
      if (type === 'polygon') {
        setDrawMode('Polygon');
      } else if (type === 'linestring') {
        setDrawMode('LineString');
      } else if (type === 'filter') {
        setFilterMode(true);
      }
      setEditMode(null);
      setSelectedFeature(null);
      setShowEditOptions(false);
      setEditableLayerIndex(null);
    } else {
      setShowLayerModal(true);
      setOperationType(type);
      setSelectedLayerForOp(null);
    }
  };
  const togglePolygonDrawMode = () => {
    if (drawMode === 'Polygon') {
      setDrawMode(null);
      setToolsOpen(false);
      return;
    }
    handleStartOperation('polygon');
  };
  const toggleLineStringDrawMode = () => {
    if (drawMode === 'LineString') {
      setDrawMode(null);
      setToolsOpen(false);
      return;
    }
    handleStartOperation('linestring');
  };
  const toggleFilterMode = () => {
    if (filterMode) {
      setFilterMode(false);
      setFilteredFeatures([]);
      setToolsOpen(false);
      return;
    }
    // open under button
    setToolsOpen(true);
    handleStartOperation('filter');
  };
  const handleConfirmLayerSelection = () => {
    if (!selectedLayerForOp) {
      toast.error('لطفاً یک لایه انتخاب کنید');
      return;
    }
    setLayers((prev) =>
      prev.map((l) =>
        l.name === selectedLayerForOp
          ? { ...l, visible: true }
          : { ...l, visible: false }
      )
    );
    setShowLayerModal(false);
    if (operationType === 'polygon') {
      setDrawMode('Polygon');
    } else if (operationType === 'linestring') {
      setDrawMode('LineString');
    } else if (operationType === 'filter') {
      setFilterMode(true);
    }
    setEditMode(null);
    setSelectedFeature(null);
    setShowEditOptions(false);
    setEditableLayerIndex(null);
  };
  const handleFilter = (filtered) => {
    setFilteredFeatures(filtered || []);
  };
  const activeLayerName = layers.find((layer) => layer.visible)?.name;
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('tools');
    localStorage.removeItem('layers');
    navigate('/login');
    toast.success('با موفقیت خارج شدید');
  };
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'night' : 'light'));
  };
  const onClose = useCallback(() => {
    setEditableLayerIndex(null);
    setSelectedFeature(null);
    setEditMode(null);
    setShowEditOptions(false);
  }, []);
  const onLayerUpdate = useCallback(
    (updater, actionDescription) => {
      handleLayerUpdate(updater, actionDescription);
    },
    [handleLayerUpdate]
  );
  const geometryEditorProps = useMemo(
    () => ({
      layer: editableLayerIndex !== null ? layers[editableLayerIndex] : null,
      selectedFeature,
      onClose,
      onLayerUpdate,
    }),
    [editableLayerIndex, layers, selectedFeature, onClose, onLayerUpdate]
  );
  /* ---------------- Tools and Layers modal: drag & resize handlers ---------------- */
  const disableMapInteractions = useCallback(() => {
    const map = mapInstance;
    if (!map) return;
    try {
      mapInteractionStateRef.current.dragging = map.dragging && typeof map.dragging.enabled === 'function' ? map.dragging.enabled() : null;
      mapInteractionStateRef.current.touchZoom = map.touchZoom && typeof map.touchZoom.enabled === 'function' ? map.touchZoom.enabled() : null;
      mapInteractionStateRef.current.scrollWheelZoom = map.scrollWheelZoom && typeof map.scrollWheelZoom.enabled === 'function' ? map.scrollWheelZoom.enabled() : null;
      mapInteractionStateRef.current.doubleClickZoom = map.doubleClickZoom && typeof map.doubleClickZoom.enabled === 'function' ? map.doubleClickZoom.enabled() : null;
      mapInteractionStateRef.current.boxZoom = map.boxZoom && typeof map.boxZoom.enabled === 'function' ? map.boxZoom.enabled() : null;
      const container = map.getContainer();
      mapInteractionStateRef.current.pointerEvents = container?.style?.pointerEvents ?? '';
      if (map.dragging && map.dragging.disable) map.dragging.disable();
      if (map.touchZoom && map.touchZoom.disable) map.touchZoom.disable();
      if (map.scrollWheelZoom && map.scrollWheelZoom.disable) map.scrollWheelZoom.disable();
      if (map.doubleClickZoom && map.doubleClickZoom.disable) map.doubleClickZoom.disable();
      if (map.boxZoom && map.boxZoom.disable) map.boxZoom.disable();
      if (container) container.style.pointerEvents = 'none';
    } catch (err) {
      console.warn('disableMapInteractions error', err);
    }
  }, [mapInstance]);
  const restoreMapInteractions = useCallback(() => {
    const map = mapInstance;
    if (!map) return;
    try {
      const container = map.getContainer();
      if (container && mapInteractionStateRef.current.pointerEvents != null) {
        container.style.pointerEvents = mapInteractionStateRef.current.pointerEvents || '';
      } else if (container) {
        container.style.pointerEvents = '';
      }
      if (map.dragging && map.dragging.enable && mapInteractionStateRef.current.dragging) map.dragging.enable();
      if (map.touchZoom && map.touchZoom.enable && mapInteractionStateRef.current.touchZoom) map.touchZoom.enable();
      if (map.scrollWheelZoom && map.scrollWheelZoom.enable && mapInteractionStateRef.current.scrollWheelZoom) map.scrollWheelZoom.enable();
      if (map.doubleClickZoom && map.doubleClickZoom.enable && mapInteractionStateRef.current.doubleClickZoom) map.doubleClickZoom.enable();
      if (map.boxZoom && map.boxZoom.enable && mapInteractionStateRef.current.boxZoom) map.boxZoom.enable();
      mapInteractionStateRef.current = {
        dragging: null,
        touchZoom: null,
        scrollWheelZoom: null,
        doubleClickZoom: null,
        boxZoom: null,
        pointerEvents: null,
      };
    } catch (err) {
      console.warn('restoreMapInteractions error', err);
    }
  }, [mapInstance]);
  // Tools drag handlers
  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dx = clientX - dragLast.current.x;
      const dy = clientY - dragLast.current.y;
      dragLast.current = { x: clientX, y: clientY };
      setToolsPos(prev => {
        const left = Math.min(window.innerWidth - 40, Math.max(8, prev.left + dx));
        const top = Math.min(window.innerHeight - 40, Math.max(8, prev.top + dy));
        return { left, top };
      });
    };
    const onUp = () => {
      if (isDragging) setIsDragging(false);
      restoreMapInteractions();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging, restoreMapInteractions]);
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
    dragLast.current = { x: clientX, y: clientY };
    setIsDragging(true);
    disableMapInteractions();
  };
  // Layers drag handlers
  useEffect(() => {
    const onMove = (e) => {
      if (!isLayersDragging) return;
      e.preventDefault();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dx = clientX - layersDragLast.current.x;
      const dy = clientY - layersDragLast.current.y;
      layersDragLast.current = { x: clientX, y: clientY };
      setLayersPos(prev => {
        const left = Math.min(window.innerWidth - 40, Math.max(0, prev.left + dx));
        const top = Math.min(window.innerHeight - 40, Math.max(8, prev.top + dy));
        return { left, top };
      });
    };
    const onUp = () => {
      if (isLayersDragging) setIsLayersDragging(false);
      restoreMapInteractions();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isLayersDragging, restoreMapInteractions]);
  const startLayersDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
    layersDragLast.current = { x: clientX, y: clientY };
    setIsLayersDragging(true);
    disableMapInteractions();
  };
  // Resize handlers
  const MIN_WIDTH = 280;
  const MIN_HEIGHT = 220;
  const MAX_WIDTH = 900;
  const MAX_HEIGHT = 900;
  const onToolsResize = (event, { size }) => {
    const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(size.width)));
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(size.height)));
    setToolsSize({ width: w, height: h });
    setToolsPos(prev => {
      const maxLeft = Math.max(8, window.innerWidth - w - 8);
      const maxTop = Math.max(8, window.innerHeight - h - 8);
      return {
        left: Math.min(prev.left, maxLeft),
        top: Math.min(prev.top, maxTop)
      };
    });
  };
  const onLayersResize = (event, { size }) => {
    const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(size.width)));
    const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(size.height)));
    setLayersSize({ width: w, height: h });
    setLayersPos(prev => {
      const maxLeft = Math.max(0, window.innerWidth - w - 8);
      const maxTop = Math.max(8, window.innerHeight - h - 8);
      return {
        left: Math.min(prev.left, maxLeft),
        top: Math.min(prev.top, maxTop)
      };
    });
  };
  // Ensure modals stay in viewport on window resize
  useEffect(() => {
    const onWinResize = () => {
      setToolsPos(prev => {
        const maxLeft = Math.max(8, window.innerWidth - toolsSize.width - 8);
        const maxTop = Math.max(8, window.innerHeight - toolsSize.height - 8);
        return {
          left: Math.min(prev.left, maxLeft),
          top: Math.min(prev.top, maxTop)
        };
      });
      setLayersPos(prev => {
        const maxLeft = Math.max(0, window.innerWidth - layersSize.width - 8);
        const maxTop = Math.max(8, window.innerHeight - layersSize.height - 8);
        return {
          left: Math.min(prev.left, maxLeft),
          top: Math.min(prev.top, maxTop)
        };
      });
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [toolsSize, layersSize]);
  // Open tools under button
  const openToolsUnderButton = useCallback(() => {
    const btn = toolsButtonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const offsetRight = 10;
      const offsetTop = 6;
      const desiredLeft = Math.max(8, Math.min(window.innerWidth - toolsSize.width - 8, rect.left + offsetRight));
      const desiredTop = Math.max(8, Math.min(window.innerHeight - toolsSize.height - 8, rect.bottom + offsetTop));
      setToolsPos({ left: desiredLeft, top: desiredTop });
      setToolsOpen(true);
    } else {
      setToolsPos({ left: 15, top: 10 });
      setToolsOpen(true);
    }
  }, [toolsSize.width, toolsSize.height]);
  // Open layers under button
  const openLayersUnderButton = useCallback(() => {
    const btn = layersButtonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const offsetRight = 10;
      const offsetTop = 6;
      const desiredLeft = Math.max(0, Math.min(window.innerWidth - layersSize.width - 8, rect.left + offsetRight));
      const desiredTop = Math.max(8, Math.min(window.innerHeight - layersSize.height - 8, rect.bottom + offsetTop));
      setLayersPos({ left: desiredLeft, top: desiredTop });
      setLayersOpen(true);
    } else {
      setLayersPos({ left: 0, top: 10 });
      setLayersOpen(true);
    }
  }, [layersSize.width, layersSize.height]);
  const handleToolsToggle = () => {
    if (toolsOpen) {
      setToolsOpen(false);
      restoreMapInteractions();
    } else {
      openToolsUnderButton();
    }
  };
  const handleLayersToggle = () => {
    if (layersOpen) {
      setLayersOpen(false);
      restoreMapInteractions();
    } else {
      openLayersUnderButton();
    }
  };
  // Close modals on ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (toolsOpen) {
          setToolsOpen(false);
          restoreMapInteractions();
        }
        if (layersOpen) {
          setLayersOpen(false);
          restoreMapInteractions();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toolsOpen, layersOpen, restoreMapInteractions]);
  const isLayersDocked = layersPos.left <= 5;
  /* ---------------- NEW: outside-click handler (بستن مودال‌ها مگر در حالت ویرایش هندسه) ---------------- */
  const showEditOptionsRef = useRef(null);
  useEffect(() => {
    const onDocEvent = (e) => {
      // جلوگیری از رفتار دوگانه در دستگاه‌های هیبریدی
      if (e.type === 'mousedown' && e.pointerType === 'touch') {
        return;
      }
      // اگر در حالت ویرایش هندسه هستیم، هیچ‌چیز را نبند
      if (editMode === 'geometry') return;
      const target = e.target;
      // اگر کلیک داخل ابزارها بود، نادیده بگیر
      if (toolsRef.current && toolsRef.current.contains(target)) return;
      // اگر کلیک داخل پنجره لایه‌ها بود، نادیده بگیر
      if (layersRef.current && layersRef.current.contains(target)) return;
      // اگر کلیک داخل پنجره‌ی showEditOptions (گزینه‌های ویرایش) بود، نادیده بگیر
      if (showEditOptionsRef.current && showEditOptionsRef.current.contains(target)) return;
      // اگر در حالت فیلتر هستیم و filteredFeatures خالیه، نادیده بگیر
      if (filterMode && filteredFeatures.length === 0) return;
      // اگر کلیک داخل modal انتخاب لایه بود، نادیده بگیر
      if (document.querySelector('.fixed.inset-0.z-\\[1005\\]')?.contains(target)) return;
      // اگر هیچ مودالی باز نیست، خروج
      if (!toolsOpen && !layersOpen && !showEditOptions) return;
      // بستن مودال‌ها
      setToolsOpen(false);
      setLayersOpen(false);
      setShowEditOptions(false);
      setSelectedFeature(null);
      setEditMode(null);
      setEditableLayerIndex(null);
      restoreMapInteractions();
      // جلوگیری از رفتار پیش‌فرض در رویدادهای لمسی
      if (e.type.startsWith('touch')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // اضافه کردن هر دو رویداد موس و لمس
    document.addEventListener('mousedown', onDocEvent);
    document.addEventListener('touchstart', onDocEvent, { passive: false });
    return () => {
      document.removeEventListener('mousedown', onDocEvent);
      document.removeEventListener('touchstart', onDocEvent);
    };
  }, [toolsOpen, layersOpen, showEditOptions, editMode, filterMode, filteredFeatures, restoreMapInteractions]);
  /* ---------------- Render ---------------- */
  return (
    <div className={` h-screen w-full font-vazir ${theme === 'night' ? 'bg-gray-900' : 'bg-white'}`}>
      {isLoading && (
        <div className="fixed top-4 right-4 z-[1004] bg-white p-2 rounded-full shadow-lg">
          <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      {/* --- MOBILE: MOVED THEME BUTTON TO BOTTOM-RIGHT --- */}
      <div className="fixed bottom-4 right-4 z-[1003]">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'فعال‌سازی حالت شب' : 'فعال‌سازی حالت روز'}
          className="relative p-3 rounded-full bg-gray-200 text-gray-800 shadow-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
        >
          <div className="relative w-6 h-6">
            <SunIcon
              className={`absolute w-6 h-6 text-yellow-500 transition-opacity duration-300 ${theme === 'light' ? 'opacity-100' : 'opacity-0'}`}
            />
            <MoonIcon
              className={`absolute w-6 h-6 text-blue-900 transition-opacity duration-300 ${theme === 'night' ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full animate-pulse" />
        </button>
      </div>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={2} 
        maxZoom={40} 
         className="h-full w-full"
        whenCreated={(m) => setMapInstance(m)}
      >
        <MapWheelControl
          isFeatureEditorOpen={editMode === 'properties'}
          isTabsOpen={filteredFeatures.length > 0}
          isToolsOpen={toolsOpen}
          isLayersOpen={layersOpen}
        />
        <MapClickHandler
          filteredFeatures={filteredFeatures}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          setFilteredFeatures={setFilteredFeatures}
        />
        <LayersControl position="topleft" >
          <LayersControl.BaseLayer checked={theme === 'light'} name="نقشه خیابانی">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={theme === 'night'} name="نقشه شب">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
              attribution="&copy; CartoDB"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="نقشه ماهواره‌ای">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="نقشه خالی">
            <TileLayer
              url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
              attribution=""
            />
          </LayersControl.BaseLayer>
          {layers.map((layer) => {
            let layerData = layer.data;
            if (filteredFeatures.length > 0 && layer.visible && layer.name === activeLayerName) {
              if (layer.data && layer.data.type === 'FeatureCollection') {
                layerData = {
                  ...layer.data,
                  features: filteredFeatures,
                };
              } else {
                layerData = filteredFeatures;
              }
            } else if (editMode === 'geometry' && layer.name === selectedLayerName && selectedFeature) {
              if (layer.data && layer.data.type === 'FeatureCollection') {
                layerData = {
                  ...layer.data,
                  features: layer.data.features.filter(
                    (f) => f.properties?.mahalle_ID !== selectedFeature.properties?.mahalle_ID
                  ),
                };
              } else if (Array.isArray(layer.data)) {
                layerData = layerData.filter(
                  (f) => f.properties?.mahalle_ID !== selectedFeature.properties?.mahalle_ID
                );
              }
            }
            const overlayKey = `${makeLayerKey(layer)}-overlay`;
            const geoKey = `${makeLayerKey(layer)}-geo`;
            return (
              <LayersControl.Overlay
                key={overlayKey}
                checked={!!layer.visible}
                name={layer.name}
              >
                <GeoJSONLayer
                  key={geoKey}
                  data={layerData}
                  name={layer.name}
                  color={layer.color || 'blue'}
                  visible={!!layer.visible}
                  onFeatureClick={(feature) => handleFeatureClick(feature, layer.name)}
                  pointOnly={layer.geometryType === 'Point'}
                  originalFeatureCount={
                    layer.data && Array.isArray(layer.data.features)
                      ? layer.data.features.length
                      : Array.isArray(layer.data)
                        ? layer.data.length
                        : 0
                  }
                />
              </LayersControl.Overlay>
            );
          })}
          {analysisResult && (
            <LayersControl.Overlay key={`analysis_result`} checked name="نتایج تحلیل مکانی">
              <GeoJSONLayer data={analysisResult} name="analysis_result" color="red" />
            </LayersControl.Overlay>
          )}
        </LayersControl>
        <OverlayVisibilitySync setLayers={setLayers} />
        <LayerActions
          layers={layers || []}
          fetchLayers={fetchLayers}
          drawMode={drawMode}
          editMode={editMode}
          selectedLayerName={selectedLayerName}
        />
        <DrawTool
          layers={layers || []}
          onRefresh={fetchLayers}
          drawMode={drawMode}
          onLayerUpdate={handleLayerUpdate}
        />
        {/* --- MOBILE: REPOSITIONED MAIN CONTROLS --- */}
        <div className="fixed top-20 right-4 z-[1001] flex flex-col items-end gap-2 md:flex-row md:items-center md:top-5 md:right-10">
          <button
            ref={toolsButtonRef}
            onClick={handleToolsToggle}
            aria-expanded={toolsOpen}
            aria-label="ابزارها"
            className="flex items-center gap-2 px-5 py-3 rounded-md bg-gradient-to-r from-cyan-600 to-teal-500 text-white font-bold shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            ابزارها
            <svg
              className={`h-4 w-4 transform transition-transform ${toolsOpen ? 'rotate-180' : 'rotate-0'}`}
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex flex-col md:flex-row gap-2">
            {userRole === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="px-3 py-3 bg-gradient-to-r from-cyan-600 to-teal-500 text-white rounded-md transition shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="رفتن به داشبورد ادمین"
              >
                داشبورد ادمین
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 transition shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="خروج"
            >
              خروج
            </button>
          </div>
        </div>
        {toolsOpen && createPortal(
          <>
            <div
              className="fixed inset-0 z-[1002]"
              style={{ background: 'transparent', pointerEvents: 'none' }}
              aria-hidden="true"
            />
            <div
              style={{
                position: 'fixed',
                left: toolsPos.left,
                top: toolsPos.top,
                width: toolsSize.width,
                height: toolsSize.height,
                zIndex: 1003,
                touchAction: 'none',
              }}
            >
              <Resizable
                width={toolsSize.width}
                height={toolsSize.height}
                onResize={onToolsResize}
                minConstraints={[MIN_WIDTH, MIN_HEIGHT]}
                maxConstraints={[MAX_WIDTH, MAX_HEIGHT]}
                resizeHandles={['se']}
              >
                <div
                  ref={toolsRef}
                  className=" bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                  style={{ width: '100%', height: '100%' }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                >
                  <div
                    className="flex items-center justify-between p-3 bg-gradient-to-l from-gray-600 to-gray-800 text-white cursor-move"
                    onMouseDown={(e) => { e.stopPropagation(); startDrag(e); }}
                    onTouchStart={(e) => { e.stopPropagation(); startDrag(e); }}
                    style={{ userSelect: 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-amber-50">ابزارها</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        title="بستن"
                        onClick={() => { setToolsOpen(false); restoreMapInteractions(); }}
                        className="p-1 rounded hover:bg-indigo-500/30"
                      >
                        <XMarkIcon className="w-5 h-5 text-white" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-3 overflow-auto bg-gray-800" style={{ fontSize: 13 }}>
                    <div>
                      <div className="text-xs text-white mb-1">ترسیم</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { 
                            togglePolygonDrawMode(); 
                            setToolsOpen(false); 
                            restoreMapInteractions(); 
                          }}
                          disabled={activeLayers.length === 0}
                          className={`flex-1 px-3 py-2 rounded-md text-white font-medium transition ${drawMode === 'Polygon' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed'}`}
                          aria-label={drawMode === 'Polygon' ? 'لغو ترسیم پلی‌گان' : 'فعال‌سازی ابزار ترسیم پلی‌گان'}
                        >
                          {drawMode === 'Polygon' ? 'لغو پلی‌گان' : 'پلی‌گان'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { 
                            toggleLineStringDrawMode(); 
                            setToolsOpen(false); 
                            restoreMapInteractions(); 
                          }}
                          disabled={activeLayers.length === 0}
                          className={`flex-1 px-3 py-2 rounded-md text-white font-medium transition ${drawMode === 'LineString' ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed'}`}
                          aria-label={drawMode === 'LineString' ? 'لغو ترسیم خط' : 'فعال‌سازی ابزار ترسیم خط'}
                        >
                          {drawMode === 'LineString' ? 'لغو خط' : 'خط'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white mb-1">فیلتر</div>
                      <button
                        type="button"
                        onClick={() => { 
                          toggleFilterMode(); 
                          setToolsOpen(false); 
                          restoreMapInteractions(); 
                        }}
                        disabled={activeLayers.length === 0}
                        className={`w-full px-3 py-2 rounded-md text-white font-medium transition ${filterMode ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed'}`}
                        aria-label={filterMode ? 'لغو فیلتر' : 'فعال‌سازی فیلتر فیچرها'}
                      >
                        {filterMode ? 'لغو فیلتر' : 'فیلتر فیچرها'}
                      </button>
                    </div>
                    <div>
                      <div className="text-xs text-white mb-1">برچسپ گذاری</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setLabelActive((v) => !v);
                            setToolsOpen(false);
                            restoreMapInteractions();
                            toast.success(labelActive ? 'نمایش برچسب‌ها غیرفعال شد' : 'نمایش برچسب‌ها فعال شد');
                          }}
                          className={`flex-1 px-3 py-2 rounded-md text-white font-medium transition ${labelActive ? 'bg-teal-700 hover:bg-teal-800' : 'bg-teal-600 hover:bg-teal-700'}`}
                        >
                          {labelActive ? 'برچسب روشن' : 'نمایش برچسب'}
                        </button>
                        <button
                          onClick={() => { setShowLabelPanel((s) => !s); setToolsOpen(true); }}
                          className="px-2 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 cyan text-white"
                        >
                          تنظیمات
                        </button>
                      </div>
                      {showLabelPanel && (
                        <div className="mt-2 bg-gray-700 p-2 rounded text-white">
                          <label className="block text-sm text-white mb-1">انتخاب ویژگی</label>
                          <select
                            value={labelProperty}
                            onChange={(e) => setLabelProperty(e.target.value)}
                            className="w-full p-2 border rounded-md text-sm mb-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          >
                            {availableProperties.length > 0 ? (
                              availableProperties.map((prop) => (
                                <option key={prop} value={prop}>
                                  {prop}
                                </option>
                              ))
                            ) : (
                              <option value="">هیچ فیلدی یافت نشد</option>
                            )}
                          </select>
                          <label className="block text-sm text-white mb-1">حداقل زوم</label>
                          <input
                            type="number"
                            value={labelZoom}
                            onChange={(e) => setLabelZoom(Number(e.target.value))}
                            className="w-full p-2 border rounded-md text-sm"
                            min={0}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Resizable>
            </div>
          </>,
          document.body
        )}
        {layersOpen && createPortal(
          <>
            <div
              className="fixed inset-0 z-[1002]"
              style={{ background: 'transparent', pointerEvents: 'none' }}
              aria-hidden="true"
            />
            <div
              style={{
                position: 'fixed',
                left: layersPos.left,
                top: layersPos.top,
                width: layersSize.width,
                height: layersSize.height,
                zIndex: 1003,
                touchAction: 'none',
              }}
            >
              <Resizable
                width={layersSize.width}
                height={layersSize.height}
                onResize={onLayersResize}
                minConstraints={[MIN_WIDTH, MIN_HEIGHT]}
                maxConstraints={[MAX_WIDTH, MAX_HEIGHT]}
                resizeHandles={['se']}
              >
                <div
                  ref={layersRef}
                  className=" bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                  style={{ width: '100%', height: '100%' }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                >
                  <div
                    className="flex items-center justify-between p-3 bg-gradient-to-l from-gray-600 to-gray-800 text-white cursor-move"
                    onMouseDown={(e) => { e.stopPropagation(); startLayersDrag(e); }}
                    onTouchStart={(e) => { e.stopPropagation(); startLayersDrag(e); }}
                    style={{ userSelect: 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-amber-50">مدیریت لایه‌ها</span>
                      <span className="text-sm opacity-80 text-amber-50">{layers.length} لایه</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isLayersDocked && (
                        <button
                          title="بستن"
                          onClick={() => { setLayersOpen(false); restoreMapInteractions(); }}
                          className="p-1 rounded hover:bg-indigo-500/30"
                        >
                          <XMarkIcon className="w-5 h-5 text-white" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-3 overflow-auto bg-gray-800" style={{ fontSize: 13 }}>
                    <div>
                      <div className="text-xs text-white mb-1">ایمپورت لایه</div>
                      <div><ImportTool onRefresh={fetchLayers} /></div>
                    </div>
                    <div>
                      <div className="flex gap-3text-xs text-white mb-5">
                        <span className="text-sm opacity-80 text-amber-50"> لایه‌ها</span>
                        <span className="text-sm opacity-80 text-amber-50 ml-50">{activeLayers.length} لایه فعال</span>
                      </div>
                      <div className="space-y-2">
                        {layers.map((layer) => (
                          <div key={layer.name} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                            <span className="text-white">{layer.name}</span>
                            <input
                              type="checkbox"
                              checked={layer.visible}
                              onChange={() => {
                                setLayers(
                                  (prev) =>
                                    prev.map((l) =>
                                      l.name === layer.name ? { ...l, visible: !l.visible } : l
                                    ),
                                  `تغییر وضعیت نمایش لایه: ${layer.name}`
                                );
                              }}
                              className="mr-2"
                            />
                          </div>
                        ))}
                        {layers.length === 0 && (
                          <div className="text-gray-400 text-sm">هیچ لایه‌ای یافت نشد</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Resizable>
              {isLayersDocked && (
                <button
                  onClick={handleLayersToggle}
                  className="absolute top-1/2 -translate-y-1/2 -right-5 w-10 h-20 bg-gray-800 rounded-r-full flex items-center justify-center text-white shadow-lg hover:bg-indigo-600 transition duration-300"
                  style={{ zIndex: 1004 }}
                  aria-label="بستن مودال لایه‌ها"
                >
                  <RectangleStackIcon className="h-6 w-6 transform rotate-180" />
                </button>
              )}
            </div>
          </>,
          document.body
        )}
        {/* --- MOBILE: REPOSITIONED LAYERS TOGGLE BUTTON --- */}
        {!layersOpen && (
          <button
            ref={layersButtonRef}
            onClick={handleLayersToggle}
            className="fixed left-4 bottom-4 w-14 h-14 bg-gradient-to-r from-gray-600 to-gray-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-indigo-600 transition duration-300 z-[1003] md:left-0 md:bottom-1/4 md:w-10 md:h-20 md:rounded-r-full md:rounded-l-none"
            aria-label="باز کردن مودال لایه‌ها"
          >
            <RectangleStackIcon className="h-6 w-6" />
          </button>
        )}
        {(userTools.length === 0 || userTools.includes('search')) && (
          // --- MOBILE: ADDED PADDING TO SEARCH BAR ---
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[1000] w-full max-w-md px-4 md:px-0">
            <SearchBar />
          </div>
        )}
        {filterMode && (userTools.length === 0 || userTools.includes('filter')) && (
          <FeatureFilterWrapper layers={layers || []} onFilter={handleFilter} />
        )}
        {filteredFeatures.length > 0 && (
          <Tabs
            filteredFeatures={filteredFeatures}
            activeLayerName={activeLayerName}
            onRefresh={fetchLayers}
            layers={layers || []}
            setAnalysisResult={setAnalysisResult}
            setFilteredFeatures={setFilteredFeatures}
          />
        )}
        {filteredFeatures.length > 0 && (
          <div className="hidden fixed top-24 right-4 bg-white shadow-lg rounded-lg p-4 z-[1003] max-w-sm max-h-[50vh] overflow-y-scroll overflow-x-hidden custom-scrollbar scroll-smooth">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">فیچرهای فیلتر شده:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {filteredFeatures.map((feature, index) => (
                <li key={feature?.properties?.mahalle_ID ?? feature?.id ?? index} className="text-gray-600">
                  {feature.properties?.Name || 'نامشخص'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {showEditOptions && selectedFeature && (
          <div
            ref={showEditOptionsRef}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1003] bg-white shadow-lg rounded-lg p-6"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <h4 className="text-lg font-semibold text-gray-800 mb-4">
              ویرایش {selectedFeature.properties?.Name || 'محله'}
            </h4>
            <div className="flex gap-4">
              <button
                onClick={openFeatureEditor}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                aria-label="ویرایش ویژگی‌های فیچر"
              >
                ویرایش ویژگی‌ها
              </button>
              <button
                onClick={openGeometryEditor}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                aria-label="ویرایش هندسه فیچر"
              >
                ویرایش هندسه
              </button>
              <button
                onClick={() => {
                  setShowEditOptions(false);
                  setSelectedFeature(null);
                  setEditMode(null);
                  setEditableLayerIndex(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition"
                aria-label="لغو ویرایش"
              >
                لغو
              </button>
            </div>
          </div>
        )}
        {editMode === 'properties' && selectedFeature && (
          <FeatureEditor
            feature={selectedFeature}
            layerName={selectedLayerName}
            layerVersion={layers.find((l) => l.name === selectedLayerName)?.version}
            storage={layers.find((l) => l.name === selectedLayerName)?.storage}
            onSave={handleSaveFeature}
            onClose={() => {
              setSelectedFeature(null);
              setEditMode(null);
              setShowEditOptions(false);
            }}
          />
        )}
        {editMode === 'geometry' && geometryEditorProps.layer && geometryEditorProps.selectedFeature && (
          <GeometryEditor
            key={`${selectedLayerName}-${selectedFeature?.properties?.mahalle_ID ?? selectedFeature?.id ?? 'sel'}`}
            {...geometryEditorProps}
          />
        )}
        <LabelManager
          layers={layers || []}
          active={labelActive}
          property={labelProperty}
          zoomThreshold={labelZoom}
          filteredFeatures={filteredFeatures}
        />
        {showLayerModal && (
          <div className="fixed inset-0 flex items-center justify-center z-[1005] bg-black bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">انتخاب لایه برای عملیات</h3>
                <button onClick={() => setShowLayerModal(false)}>
                  <XMarkIcon className="h-6 w-6 text-gray-500" />
                </button>
              </div>
              <div className="space-y-2">
                {activeLayers.map((layer) => (
                  <div key={layer.name} className="flex items-center">
                    <input
                      type="radio"
                      id={layer.name}
                      name="layerSelect"
                      value={layer.name}
                      checked={selectedLayerForOp === layer.name}
                      onChange={(e) => setSelectedLayerForOp(e.target.value)}
                      className="mr-2"
                    />
                    <label htmlFor={layer.name}>{layer.name}</label>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4 gap-2">
                <button
                  onClick={handleConfirmLayerSelection}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  تأیید
                </button>
                <button
                  onClick={() => setShowLayerModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  لغو
                </button>
              </div>
            </div>
          </div>
        )}
        <UndoRedoButtons undo={handleUndo} redo={handleRedo} canUndo={canUndo} canRedo={canRedo} history={history} />
        <ToastContainer position="top-right" autoClose={3000} />
        {children}
      </MapContainer>
    </div>
  );
};
// Memoized components for better performance
const MemoizedGeoJSONLayer = React.memo(GeoJSONLayer);
const MemoizedFeatureEditor = React.memo(FeatureEditor);
const MemoizedGeometryEditor = React.memo(GeometryEditor);
const MemoizedDrawTool = React.memo(DrawTool);
const MemoizedFeatureFilterWrapper = React.memo(FeatureFilterWrapper);
const MemoizedLayerActions = React.memo(LayerActions);
const MemoizedTabs = React.memo(Tabs);
const MemoizedImportTool = React.memo(ImportTool);
const MemoizedSearchBar = React.memo(SearchBar);
const MemoizedUndoRedoButtons = React.memo(UndoRedoButtons);
const MemoizedLabelManager = React.memo(LabelManager);
export default CoreMap;
