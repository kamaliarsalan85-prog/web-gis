import React, { useState, useCallback, useMemo } from 'react';
import * as turf from '@turf/turf';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPinIcon, ScissorsIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon, LinkIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

/* ----------------------- Helpers ----------------------- */
const safeClean = (f) => {
  try {
    return turf.cleanCoords ? turf.cleanCoords(f) : f;
  } catch (e) {
    console.warn('safeClean failed', e);
    return f;
  }
};

const isFeature = (f) => !!(f && f.type === 'Feature' && f.geometry && f.geometry.type);

const coordsAreFinite = (coords) => {
  if (!Array.isArray(coords)) return false;
  const check = (arr) => {
    if (!Array.isArray(arr)) return Number.isFinite(arr);
    return arr.every(check);
  };
  return check(coords);
};

const isValidPolygonGeometry = (geom) => {
  if (!geom || !geom.type) return false;
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) return false;
    if (!Array.isArray(rings[0]) || rings[0].length < 4) return false;
    return coordsAreFinite(rings);
  }
  if (geom.type === 'MultiPolygon') {
    if (!Array.isArray(geom.coordinates)) return false;
    return geom.coordinates.some(poly => Array.isArray(poly[0]) && poly[0].length >= 4 && coordsAreFinite(poly));
  }
  return false;
};

const normalizeToPolygons = (feature) => {
  if (!feature || !feature.geometry) return [];
  const geom = feature.geometry;
  const props = feature.properties || {};

  if (geom.type === 'Polygon') {
    if (isValidPolygonGeometry(geom)) return [{ type: 'Feature', properties: props, geometry: geom }];
    return [];
  }

  if (geom.type === 'MultiPolygon') {
    const out = [];
    (geom.coordinates || []).forEach(polyCoords => {
      const polyGeom = { type: 'Polygon', coordinates: polyCoords };
      if (isValidPolygonGeometry(polyGeom)) out.push({ type: 'Feature', properties: props, geometry: polyGeom });
    });
    return out;
  }

  if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
    const out = [];
    geom.geometries.forEach(g => {
      if (g.type === 'Polygon' && isValidPolygonGeometry(g)) out.push({ type: 'Feature', properties: props, geometry: g });
      if (g.type === 'MultiPolygon') {
        (g.coordinates || []).forEach(polyCoords => {
          const polyGeom = { type: 'Polygon', coordinates: polyCoords };
          if (isValidPolygonGeometry(polyGeom)) out.push({ type: 'Feature', properties: props, geometry: polyGeom });
        });
      }
    });
    return out;
  }

  return [];
};

const validatePolygonFeature = (feat) => {
  if (!feat || !feat.geometry) return false;
  const geom = feat.geometry;
  if (!isValidPolygonGeometry(geom)) return false;
  try {
    const area = turf.area(feat);
    if (!Number.isFinite(area) || area <= 0) return false;
  } catch (e) {
    return false;
  }
  return true;
};

const findInvalidPolygons = (features) => {
  return (features || []).map((f, idx) => {
    if (!f) return { idx, reason: 'no feature object', feature: f };
    if (!f.geometry) return { idx, reason: 'no geometry', feature: f };
    const t = f.geometry.type;
    if (t !== 'Polygon' && t !== 'MultiPolygon' && t !== 'GeometryCollection') return { idx, reason: `wrong geometry type: ${t}`, feature: f };
    if (!isValidPolygonGeometry(f.geometry) && t !== 'GeometryCollection') return { idx, reason: 'invalid polygon coordinates', feature: f };
    if (t === 'GeometryCollection' && normalizeToPolygons(f).length === 0) return { idx, reason: 'geometryCollection with no valid polygons', feature: f };
    try {
      const normalized = normalizeToPolygons(f);
      if (!normalized.length) return { idx, reason: 'normalization produced zero polygons', feature: f };
      if (!normalized.every(validatePolygonFeature)) return { idx, reason: 'some normalized polygons invalid', feature: f };
    } catch (e) {
      return { idx, reason: 'error during validation', error: e, feature: f };
    }
    return null;
  }).filter(Boolean);
};

if (typeof window !== 'undefined') window.findInvalidPolygons = findInvalidPolygons;

const toFC = (features) => ({ type: 'FeatureCollection', features });

/* -------------------- Component -------------------- */

export default function SpatialAnalysis({
  filteredFeatures = [],
  layers = [],
  setAnalysisResult,
  bufferRadius, setBufferRadius,
  selectedLayer, setSelectedLayer
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  const getTargetLayer = useCallback(() => layers.find(l => l.name === selectedLayer), [layers, selectedLayer]);

  // اعتبارسنجی شعاع بافر
  const isValidBufferRadius = useMemo(() => bufferRadius > 0, [bufferRadius]);

  // تعداد فیچرهای معتبر
  const validFeatureCount = useMemo(() => filteredFeatures.filter(isFeature).length, [filteredFeatures]);

  /* ---------- Buffer ---------- */
  const performBuffer = useCallback(() => {
    if (!isValidBufferRadius) {
      toast.error('شعاع بافر باید مثبت باشد');
      return;
    }
    if (!validFeatureCount) {
      toast.info('هیچ فیچر معتبری برای بافر وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const buffered = filteredFeatures
        .filter(isFeature)
        .map(f => {
          try {
            return turf.buffer(safeClean(f), bufferRadius, { units: 'meters' });
          } catch (e) {
            console.warn('buffer failed for feature', e, f);
            return null;
          }
        })
        .filter(Boolean);

      setAnalysisResult(toFC(buffered));
      toast.success(`بافر انجام شد — خروجی: ${buffered.length} فیچر`);
    } catch (error) {
      console.error('Buffer error:', error);
      toast.error(`خطا در ایجاد بافر: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bufferRadius, filteredFeatures, setAnalysisResult, isValidBufferRadius, validFeatureCount]);

  /* ---------- computeClippedPolygons (robust) ---------- */
  const computeClippedPolygons = useCallback(() => {
    const clipLayer = getTargetLayer();
    if (!clipLayer) {
      toast.error('لایه برای برش انتخاب نشده است');
      return null;
    }

    const rawTargets = clipLayer.data?.features || [];
    const normalizedTargets = rawTargets.flatMap(normalizeToPolygons);
    const validTargets = normalizedTargets.filter(validatePolygonFeature);
    const droppedCount = normalizedTargets.length - validTargets.length;
    if (droppedCount > 0) {
      console.warn(`computeClippedPolygons: dropped ${droppedCount} invalid normalized target polygons. Call findInvalidPolygons(clipLayer.data.features) for details.`);
    }

    if (validTargets.length === 0) {
      const bad = findInvalidPolygons(rawTargets);
      console.warn('No valid clip polygons. Diagnostics:', bad);
      return { results: [], diagnostics: bad, ok: false };
    }

    const results = [];
    const inputs = filteredFeatures.flatMap(f => normalizeToPolygons(f));
    const validInputs = inputs.filter(validatePolygonFeature);
    const droppedIn = inputs.length - validInputs.length;
    if (droppedIn > 0) {
      console.warn(`computeClippedPolygons: dropped ${droppedIn} invalid input polygons (check filteredFeatures)`);
    }

    validInputs.forEach((inPoly, ipi) => {
      validTargets.forEach((tPoly, ti) => {
        try {
          let maybe = false;
          try {
            maybe = turf.booleanIntersects(inPoly, tPoly) || turf.booleanWithin(inPoly, tPoly) || turf.booleanWithin(tPoly, inPoly);
          } catch (e) {
            maybe = true;
          }
          if (!maybe) return;

          const a = safeClean(inPoly);
          const b = safeClean(tPoly);

          if (!a || !a.geometry || !b || !b.geometry) return;
          const areaA = turf.area(a);
          const areaB = turf.area(b);
          if (!Number.isFinite(areaA) || areaA <= 0 || !Number.isFinite(areaB) || areaB <= 0) return;

          const inter = turf.intersect(a, b);
          if (inter) results.push(inter);
        } catch (e) {
          console.warn(`Intersect failed for pair (inPoly ${ipi} vs tPoly ${ti}):`, e && e.message ? e.message : e);
        }
      });
    });

    return { results, diagnostics: null, ok: true };
  }, [filteredFeatures, getTargetLayer]);

  /* ---------- Clip ---------- */
  const performClip = useCallback(() => {
    if (!selectedLayer) {
      toast.error('لایه هدف برای برش انتخاب نشده است');
      return;
    }
    if (!validFeatureCount) {
      toast.info('هیچ فیچر معتبری برای برش وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const computed = computeClippedPolygons();
      if (!computed) return;
      if (!computed.ok) {
        toast.warn('هیچ پلیگون معتبری در لایهٔ هدف برای برش پیدا نشد (کنسول را برای جزئیات بررسی کن)');
        setAnalysisResult(toFC([]));
        return;
      }
      setAnalysisResult(toFC(computed.results));
      toast.success(`برش انجام شد — خروجی: ${computed.results.length} فیچر`);
    } catch (error) {
      console.error('Clip error:', error);
      toast.error(`خطا در برش: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [computeClippedPolygons, setAnalysisResult, selectedLayer, validFeatureCount]);

  /* ---------- Intersect ---------- */
  const performIntersect = useCallback(() => {
    if (!selectedLayer) {
      toast.error('لایه هدف برای تقاطع انتخاب نشده است');
      return;
    }
    if (!validFeatureCount) {
      toast.info('هیچ فیچر معتبری برای تقاطع وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const computed = computeClippedPolygons();
      if (!computed) return;
      if (!computed.ok) {
        toast.warn('برای تقاطع، لایهٔ هدف پلیگونی معتبر نیاز است (جزئیات در کنسول)');
        setAnalysisResult(toFC([]));
        return;
      }
      setAnalysisResult(toFC(computed.results));
      toast.success(`تقاطع انجام شد — خروجی: ${computed.results.length} فیچر`);
    } catch (error) {
      console.error('Intersect error:', error);
      toast.error(`خطا در تقاطع: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [computeClippedPolygons, setAnalysisResult, selectedLayer, validFeatureCount]);

  /* ---------- Union ---------- */
  const performUnion = useCallback(() => {
    const targetLayer = getTargetLayer();
    if (!targetLayer) {
      toast.error('لایه هدف برای اتحاد انتخاب نشده است');
      return;
    }
    if (!validFeatureCount) {
      toast.info('هیچ فیچر معتبری برای اتحاد وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const all = [...filteredFeatures, ...(targetLayer.data?.features || [])]
        .flatMap(normalizeToPolygons)
        .filter(validatePolygonFeature);
      if (!all.length) {
        toast.info('هیچ فیچر معتبری برای اتحاد وجود ندارد');
        return;
      }

      let unioned = all[0];
      for (let i = 1; i < all.length; i++) {
        try {
          unioned = turf.union(unioned, all[i]);
        } catch (e) {
          console.error('turf.union failed for pair:', e, { a: unioned, b: all[i] });
        }
      }
      if (unioned) {
        setAnalysisResult(toFC([unioned]));
        toast.success('اتحاد انجام شد — خروجی: ۱ فیچر');
      } else {
        toast.warn('اتحاد نتوانست خروجی معتبر تولید کند');
      }
    } catch (error) {
      console.error('Union error:', error);
      toast.error(`خطا در اتحاد: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, getTargetLayer, setAnalysisResult, validFeatureCount]);

  /* ---------- Spatial Join ---------- */
  const performSpatialJoin = useCallback(() => {
    const targetLayer = getTargetLayer();
    if (!targetLayer) {
      toast.error('لایه هدف برای پیوست مکانی انتخاب نشده است');
      return;
    }
    if (!validFeatureCount) {
      toast.info('هیچ فیچر معتبری برای پیوست مکانی وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const targets = (targetLayer.data?.features || []).flatMap(normalizeToPolygons).filter(validatePolygonFeature);
      const joined = filteredFeatures.map(f => {
        let merged = { ...f.properties };
        const inPolys = normalizeToPolygons(f).filter(validatePolygonFeature);
        for (const tf of targets) {
          try {
            let hit = false;
            for (const inPoly of inPolys) {
              try {
                if (
                  turf.booleanIntersects(inPoly, tf) ||
                  turf.booleanWithin(inPoly, tf) ||
                  turf.booleanWithin(tf, inPoly)
                ) {
                  if (turf.intersect(safeClean(inPoly), safeClean(tf))) {
                    hit = true;
                    break;
                  }
                }
              } catch { /* ignore pair */ }
            }
            if (hit) merged = { ...merged, ...tf.properties };
          } catch (e) {
            console.warn('Spatial join check failed for pair:', e);
          }
        }
        return { ...f, properties: merged };
      });

      setAnalysisResult(toFC(joined));
      toast.success(`پیوست مکانی انجام شد — خروجی: ${joined.length} فیچر`);
    } catch (error) {
      console.error('SpatialJoin error:', error);
      toast.error(`خطا در پیوست مکانی: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, getTargetLayer, setAnalysisResult, validFeatureCount]);

  // ریست تنظیمات
  const resetSettings = useCallback(() => {
    setBufferRadius(1000);
    setSelectedLayer('');
    toast.info('تنظیمات ریست شد');
  }, []);

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 font-vazir">
      {isProcessing && (
        <div className="fixed top-4 right-4 z-[1001] bg-white dark:bg-gray-800 p-2 rounded-full shadow-lg">
          <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      <div className="max-w-10/10 mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">تحلیل مکانی</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            تعداد فیچرها: {validFeatureCount}/{filteredFeatures.length} | لایه‌های موجود: {layers.length}
          </p>
        </div>

        {/* Buffer */}
        <motion.div
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">بافر</h4>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <input
                type="number"
                value={bufferRadius}
                onChange={e => setBufferRadius(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                min={0}
                aria-label="شعاع بافر (متر)"
                aria-describedby="buffer-radius-error"
              />
              <MapPinIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
            </div>
            <button
              onClick={performBuffer}
              disabled={isProcessing || !isValidBufferRadius || !validFeatureCount}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="ایجاد بافر"
            >
              <MapPinIcon className="w-4 h-4 ml-2" />
              ایجاد Buffer
            </button>
          </div>
          {!isValidBufferRadius && bufferRadius !== '' && (
            <motion.p
              className="text-sm text-red-600 dark:text-red-400 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              id="buffer-radius-error"
            >
              شعاع بافر باید مثبت باشد
            </motion.p>
          )}
        </motion.div>

        {/* Layer Selection and Other Operations */}
        <motion.div
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">عملیات‌های مکانی</h4>
          <div className="flex flex-col sm:flex-row gap-4 items-center mb-4">
            <select
              value={selectedLayer}
              onChange={e => setSelectedLayer(e.target.value)}
              className="w-full sm:w-1/2 p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="انتخاب لایه هدف"
            >
              <option value="">انتخاب لایه هدف</option>
              {layers.map(l => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              onClick={resetSettings}
              disabled={isProcessing || (!bufferRadius && !selectedLayer)}
              className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-md hover:from-gray-600 hover:to-gray-700 focus:ring-2 focus:ring-gray-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="ریست تنظیمات"
            >
              <ArrowPathIcon className="w-4 h-4 ml-2" />
              ریست
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={performClip}
              disabled={isProcessing || !selectedLayer || !validFeatureCount}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="انجام برش"
            >
              <ScissorsIcon className="w-4 h-4 ml-2" />
              برش (Clip)
            </button>
            <button
              onClick={performIntersect}
              disabled={isProcessing || !selectedLayer || !validFeatureCount}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="انجام تقاطع"
            >
              <ArrowsPointingInIcon className="w-4 h-4 ml-2" />
              تقاطع (Intersect)
            </button>
            <button
              onClick={performUnion}
              disabled={isProcessing || !selectedLayer || !validFeatureCount}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="انجام اتحاد"
            >
              <ArrowsPointingOutIcon className="w-4 h-4 ml-2" />
              اتحاد (Union)
            </button>
            <button
              onClick={performSpatialJoin}
              disabled={isProcessing || !selectedLayer || !validFeatureCount}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="انجام پیوست مکانی"
            >
              <LinkIcon className="w-4 h-4 ml-2" />
              پیوست مکانی
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}