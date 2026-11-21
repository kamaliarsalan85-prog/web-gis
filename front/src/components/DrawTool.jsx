import React, { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import axios from 'axios';
import { toast } from 'react-toastify';
import area from '@turf/area';
import kinks from '@turf/kinks';
import unkinkPolygon from '@turf/unkink-polygon';
import cleanCoords from '@turf/clean-coords';
import { redirectToLogin } from '../services/api';

// ✅ API bases from ENV (fallback to same-origin)
const API = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? '' : '');
const MAHALLE_API = API;


// تابع کمکی برای تولید عدد تصادفی غیرتکراری (برای mahalle_ID)
const generateRandomId = (min, max, existingIds = new Set()) => {
  let id;
  do {
    id = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
};

// تابع برای مدیریت object_id ترتیبی
const getNextObjectId = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${MAHALLE_API}/api/next-object-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.objectId;
  } catch (error) {
    console.error('Error fetching next object ID:', error);
    return Date.now(); // fallback
  }
};

// تابع برای main-mabar با شروع از 2000
const getNextMabarObjectId = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${MAHALLE_API}/api/next-mabar-object-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.objectId;
  } catch (error) {
    console.error('Error fetching next mabar object ID:', error);
    return 7001 + Math.floor(Math.random() * 1000); // fallback
  }
};

/** helper */
function buildPropertiesFromTemplate(templateProps = {}) {
  const newProps = {
    mahalle_ID: null,
    OBJECTID: null,
    Name: '',
    Shape_Area: 0,
  };

  if (!templateProps || Object.keys(templateProps).length === 0) {
    return newProps;
  }

  for (const key of Object.keys(templateProps)) {
    if (key === 'mahalle_ID' || key === 'OBJECTID') {
      newProps[key] = null;
      continue;
    }

    const val = templateProps[key];
    const t = typeof val;

    if (t === 'string') newProps[key] = '';
    else if (t === 'number') newProps[key] = 0;
    else if (t === 'boolean') newProps[key] = false;
    else if (Array.isArray(val)) newProps[key] = [];
    else if (t === 'object') newProps[key] = null;
    else newProps[key] = null;
  }

  if (!newProps.hasOwnProperty('Name')) newProps.Name = '';
  return newProps;
}

/** main */
const DrawTool = ({ layers, onRefresh, drawMode, onLayerUpdate }) => {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const existingMahalleIds = useRef(new Set());

  const getActiveLayer = useCallback(() => {
    const activeLayers = (layers || []).filter(
      (layer) => layer.visible && layer.data && Array.isArray(layer.data.features)
    );

    if (activeLayers.length === 0) {
      toast.error('لطفاً یک لایه را از پنل لایه‌ها فعال کنید.');
      return null;
    }
    if (activeLayers.length > 1) {
      toast.error('فقط یک لایه باید فعال باشد برای ترسیم.');
      return null;
    }
    return activeLayers[0];
  }, [layers]);

  const disableDrawingSafe = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      if (map.pm && typeof map.pm.disableDraw === 'function') {
        map.pm.disableDraw();
      }
      if (map.pm && typeof map.pm.removeControls === 'function') {
        map.pm.removeControls();
      }
    } catch (e) {
      console.warn('Error disabling drawing safely:', e);
    }
  }, [map]);

  const onCreatePolygon = useCallback(
    async (e) => {
      if (drawMode !== 'Polygon') return;
      const controller = new AbortController();
      try {
        const layer = e.layer;
        const activeLayer = getActiveLayer();
        if (!activeLayer) {
          map.removeLayer(layer);
          toast.error('لایه فعالی یافت نشد');
          return;
        }

        let created = layer.toGeoJSON();
        if (created.type === 'FeatureCollection' && Array.isArray(created.features) && created.features.length > 0) {
          created = created.features[0];
        }

        if (!created.geometry || created.geometry.type !== 'Polygon') {
          toast.error('هندسه ایجاد شده باید پلی‌گان باشد');
          map.removeLayer(layer);
          return;
        }

        let newFeature, payloadForServer, apiUrl;

        if (activeLayer.name === 'main-mahalles' || activeLayer.name === 'main-parcels') {
          // رفتار برای لایه‌های main
          const objectId = await getNextObjectId();
          const mahalleId = generateRandomId(100, 999, existingMahalleIds.current);

          newFeature = {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: created.geometry.coordinates,
            },
            properties: {
              mahalle_ID: mahalleId,
              landuse_name: 'مسکونی',
            },
            object_id: objectId,
          };

          payloadForServer = {
            object_id: newFeature.object_id,
            geometry: newFeature.geometry,
            properties: {
              mahalle_ID: newFeature.properties.mahalle_ID,
              landuse_name: newFeature.properties.landuse_name,
            },
          };

          apiUrl =
            activeLayer.name === 'main-mahalles'
              ? `${MAHALLE_API}/api/mahalle/create/`
              : `${MAHALLE_API}/api/parcel/create/`;
        } else {
          // رفتار برای لایه‌های غیر-main (local)
          const existingFeatures = activeLayer.data?.features || [];
          const templateFeature = existingFeatures.find((f) => f && f.properties) || null;
          const templateProps = templateFeature ? templateFeature.properties : {};
          const propsTemplate = buildPropertiesFromTemplate(templateProps);

          const newMahalleId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          propsTemplate.mahalle_ID = newMahalleId;
          propsTemplate.OBJECTID = newMahalleId;
          if (propsTemplate.hasOwnProperty('Name')) {
            propsTemplate.Name = `پلی‌گان جدید ${newMahalleId}`;
          }

          newFeature = {
            type: 'Feature',
            properties: propsTemplate,
            geometry: created.geometry || created,
            id: newMahalleId,
          };

          payloadForServer = {
            layerName: activeLayer.name,
            newFeature,
            OBJECTID: newMahalleId,
            storage: 'local',
          };

          apiUrl = `${API}/api/add-feature`;
        }

        try {
          newFeature.properties.Shape_Area = area(newFeature);
        } catch (err) {
          console.warn('Area calculation failed:', err);
          toast.warn('محاسبه مساحت با خطا مواجه شد');
        }

        try {
          const invalid = kinks(newFeature);
          if (invalid && Array.isArray(invalid.features) && invalid.features.length > 0) {
            toast.warn('هندسه نامعتبر است، در حال اصلاح...');
            let fixed = cleanCoords(newFeature);
            fixed = unkinkPolygon(fixed);

            let normalized = null;
            if (!fixed) {
              normalized = newFeature;
            } else if (fixed.type === 'FeatureCollection' && Array.isArray(fixed.features) && fixed.features.length > 0) {
              normalized = fixed.features[0];
            } else if (fixed.type === 'Feature') {
              normalized = fixed;
            } else {
              normalized = newFeature;
            }

            newFeature.geometry = normalized.geometry || newFeature.geometry;
            newFeature.properties = {
              ...newFeature.properties,
              mahalle_ID: newFeature.properties.mahalle_ID || newMahalleId,
              OBJECTID: newFeature.properties.OBJECTID || newMahalleId,
              Name: newFeature.properties.Name || `پلی‌گان جدید ${newMahalleId}`,
              Shape_Area: newFeature.properties.Shape_Area,
            };

            try {
              newFeature.properties.Shape_Area = area(newFeature);
            } catch (err2) {
              console.warn('Area after fix failed:', err2);
            }

            const invalidAfterFix = kinks(newFeature);
            if (invalidAfterFix.features.length > 0) {
              toast.error('هندسه پس از اصلاح همچنان نامعتبر است');
              map.removeLayer(layer);
              return;
            }
          }
        } catch (err) {
          console.error('Geometry validation/repair failed:', err);
          toast.error('خطا در اعتبارسنجی هندسه');
          map.removeLayer(layer);
          return;
        }

        console.log('Polygon feature to save:', newFeature);
        console.log('Payload sent to API:', JSON.stringify(payloadForServer, null, 2));

        const token = localStorage.getItem('token');
        if (!token) {
          toast.error('لطفاً دوباره وارد شوید');
          redirectToLogin();
          map.removeLayer(layer);
          return;
        }

        const response = await axios.post(apiUrl, payloadForServer, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (onLayerUpdate) {
          const updatedLayer = {
            ...activeLayer,
            data: {
              ...activeLayer.data,
              features: [...activeLayer.data.features, newFeature],
            },
            version: Date.now(),
          };
          onLayerUpdate(
            (prevLayers) =>
              prevLayers.map((l) => (l.name === activeLayer.name ? updatedLayer : l)),
            `افزودن پلی‌گان جدید به لایه ${activeLayer.name}`
          );
        }

        toast.success('پلی‌گان جدید ذخیره شد');
        // onRefresh && onRefresh(); // این خط حذف شده - نیازی به بارگیری مجدد لایه‌ها نیست
      } catch (error) {
        if (axios.isCancel(error)) return;
        console.error('Error saving polygon feature:', error.response?.data || error.message);
        console.log('API response:', JSON.stringify(error.response?.data, null, 2));
        let errorMsg = error.response?.data?.error || error.message || 'خطای شبکه';
        if (error.response?.data && typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          errorMsg = 'خطای سرور Django - لطفاً backend را بررسی کنید';
        }
        toast.error('خطا در ذخیره پلی‌گان: ' + errorMsg);
      } finally {
        try {
          map.removeLayer(e.layer);
        } catch (e) {
          // ignore
        }
      }
    },
    [map, getActiveLayer, onLayerUpdate, drawMode]
  );

  const onCreateLineString = useCallback(
    async (e) => {
      if (drawMode !== 'LineString') return;
      const controller = new AbortController();
      try {
        const layer = e.layer;
        const activeLayer = getActiveLayer();
        if (!activeLayer) {
          map.removeLayer(layer);
          toast.error('لایه فعالی یافت نشد');
          return;
        }

        let created = layer.toGeoJSON();
        if (created.type === 'FeatureCollection' && Array.isArray(created.features) && created.features.length > 0) {
          created = created.features[0];
        }

        if (created.geometry.type !== 'LineString') {
          toast.error('هندسه ایجاد شده باید خط باشد');
          map.removeLayer(layer);
          return;
        }

        if (activeLayer.name === 'main-mabar') {
          const objectId = await getNextMabarObjectId();

          const payloadForMabar = {
            object_id: objectId,
            geometry: created.geometry,
            properties: {
              street_name: 'خیابان جدید',
            },
          };

          console.log('LineString for mabar to save:', payloadForMabar);

          const token = localStorage.getItem('token');
          if (!token) {
            toast.error('لطفاً دوباره وارد شوید');
            redirectToLogin();
            map.removeLayer(layer);
            return;
          }

          const response = await axios.post(
            `${MAHALLE_API}/api/mabar/create/`,
            payloadForMabar,
            { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
          );

          if (onLayerUpdate) {
            const newFeature = {
              type: 'Feature',
              geometry: created.geometry,
              properties: {
                ...payloadForMabar.properties,
                OBJECTID: objectId,
              },
              id: String(objectId),
            };

            const updatedLayer = {
              ...activeLayer,
              data: {
                ...activeLayer.data,
                features: [...(activeLayer.data?.features || []), newFeature],
              },
              version: Date.now(),
            };

            onLayerUpdate(
              (prevLayers) =>
                prevLayers.map((l) => (l.name === activeLayer.name ? updatedLayer : l)),
              `افزودن خط جدید به لایه ${activeLayer.name}`
            );
          }

          toast.success('خط جدید mabar ذخیره شد');
          // onRefresh && onRefresh(); // این خط حذف شده - نیازی به بارگیری مجدد لایه‌ها نیست
          return;
        }

        const existingFeatures = activeLayer.data?.features || [];
        const templateFeature = existingFeatures.find((f) => f && f.properties) || null;
        const templateProps = templateFeature ? templateFeature.properties : {};
        const propsTemplate = buildPropertiesFromTemplate(templateProps);

        const newMahalleId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        propsTemplate.mahalle_ID = newMahalleId;
        propsTemplate.OBJECTID = newMahalleId;
        if (propsTemplate.hasOwnProperty('Name')) {
          propsTemplate.Name = `خط جدید ${newMahalleId}`;
        }

        let newFeature = {
          type: 'Feature',
          properties: propsTemplate,
          geometry: created.geometry || created,
          id: newMahalleId,
        };

        console.log('LineString feature to save:', newFeature);

        const token = localStorage.getItem('token');
        if (!token) {
          toast.error('لطفاً دوباره وارد شوید');
          redirectToLogin();
          map.removeLayer(layer);
          return;
        }
        const response = await axios.post(
          `${API}/api/add-feature`,
          {
            layerName: activeLayer.name,
            newFeature,
            OBJECTID: newMahalleId,
            storage: 'local',
          },
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
        );

        if (onLayerUpdate) {
          const updatedLayer = {
            ...activeLayer,
            data: {
              ...activeLayer.data,
              features: [...activeLayer.data.features, newFeature],
            },
            version: Date.now(),
          };
          onLayerUpdate(
            (prevLayers) =>
              prevLayers.map((l) => (l.name === activeLayer.name ? updatedLayer : l)),
            `افزودن خط جدید به لایه ${activeLayer.name}`
          );
        }

        toast.success('خط جدید ذخیره شد');
        // onRefresh && onRefresh(); // این خط حذف شده - نیازی به بارگیری مجدد لایه‌ها نیست
      } catch (error) {
        if (axios.isCancel(error)) return;
        console.error('Error saving LineString feature:', error.response?.data || error.message);
        console.log('API response:', JSON.stringify(error.response?.data, null, 2));
        toast.error('خطا در ذخیره خط: ' + (error.response?.data?.error || error.message || 'خطای شبکه'));
      } finally {
        try {
          map.removeLayer(e.layer);
        } catch (e) {
          // ignore
        }
      }
    },
    [map, getActiveLayer, onLayerUpdate, drawMode]
  );

  const onDrawEnd = useCallback(() => {
    console.log('pm:drawend');
  }, []);

  useEffect(() => {
    if (!map) return;
    if (!L.PM) {
      console.error('leaflet-geoman not loaded');
      toast.error('کتابخانه ترسیم بارگذاری نشد');
      return;
    }

    let mounted = true;

    map.whenReady(() => {
      if (!mounted) return;
      if (!drawMode) {
        disableDrawingSafe();
        return;
      }

      const activeLayer = getActiveLayer();
      if (!activeLayer) {
        disableDrawingSafe();
        return;
      }

      try {
        isDrawingRef.current = true;
        map.pm.addControls({
          position: 'topleft',
          drawPolygon: drawMode === 'Polygon',
          drawPolyline: drawMode === 'LineString',
          drawRectangle: false,
          drawCircle: false,
          drawMarker: false,
          drawCircleMarker: false,
          editControls: false,
          removalMode: false,
          dragMode: false,
        });

        map.pm.setLang && map.pm.setLang('en');

        if (drawMode === 'Polygon') {
          map.pm.enableDraw('Polygon', {
            allowSelfIntersection: false,
          });
          map.on('pm:create', onCreatePolygon);
        } else if (drawMode === 'LineString') {
          map.pm.enableDraw('Line', {
            allowSelfIntersection: false,
          });
          map.on('pm:create', onCreateLineString);
        }

        map.on('pm:drawend', onDrawEnd);
      } catch (e) {
        console.error('Error setting up draw controls:', e);
        toast.error('خطا در راه‌اندازی ابزار ترسیم');
      }
    });

    return () => {
      mounted = false;
      try {
        map.off('pm:create', onCreatePolygon);
        map.off('pm:create', onCreateLineString);
        map.off('pm:drawend', onDrawEnd);
        if (map.pm && typeof map.pm.disableDraw === 'function') map.pm.disableDraw();
        if (map.pm && typeof map.pm.removeControls === 'function') map.pm.removeControls();
      } catch (e) {}
      isDrawingRef.current = false;
    };
  }, [map, drawMode, getActiveLayer, disableDrawingSafe, onCreatePolygon, onCreateLineString, onDrawEnd]);

  return null;
};

export default DrawTool;
