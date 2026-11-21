import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as turf from '@turf/turf';
import { toast } from 'react-toastify';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
if (typeof window !== 'undefined' && !window.L) {
  window.L = L;
}
import 'leaflet.heat';
import { motion, AnimatePresence } from 'framer-motion';
import { MapIcon, FireIcon, ArrowPathIcon, PlayIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { debounce } from 'lodash';

const HeatmapLayer = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !points || points.length === 0) return;

    const latlngs = points.map(p => {
      const [lng, lat] = p.geometry.coordinates;
      const intensity = (p.properties && p.properties.weight) ? p.properties.weight : 1;
      return [lat, lng, intensity];
    });

    if (latlngs.length === 0) return;

    const heatLayer = window.L.heatLayer(latlngs, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);

    return () => {
      try {
        map.removeLayer(heatLayer);
      } catch (err) {
        // ignore
      }
    };
  }, [map, points]);

  return null;
};

const AdvancedModeling = ({
  filteredFeatures = [],
  setAnalysisResult,
  onFilterToMap,
  bufferRadius, setBufferRadius,
  modelSteps, setModelSteps,
  modelResult, setModelResult,
  showMap, setShowMap,
  featureColors, setFeatureColors,
  categoryColors, setCategoryColors,
  filters, setFilters,
  expandedSections, setExpandedSections,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const isValidBufferRadius = useMemo(() => bufferRadius > 0, [bufferRadius]);

  const inputFeatures = useMemo(() => {
    if (!filteredFeatures) return [];
    if (Array.isArray(filteredFeatures)) return filteredFeatures;
    if (filteredFeatures.type === 'FeatureCollection' && Array.isArray(filteredFeatures.features)) return filteredFeatures.features;
    if (filteredFeatures.type === 'Feature') return [filteredFeatures];
    return [];
  }, [filteredFeatures]);

  const filteredInputFeatures = useMemo(() => {
    return inputFeatures.filter(feature => {
      if (!feature.properties) return false;
      return Object.entries(filters).every(([key, value]) => {
        const trimmedValue = (value || '').toString().trim();
        if (!trimmedValue) return true;
        const propValue = feature.properties[key];
        const stringPropValue = propValue != null ? propValue.toString().trim() : '';
        return stringPropValue === trimmedValue;
      });
    });
  }, [inputFeatures, filters]);


  // تابع برای اعمال فیلتر روی نقشه اصلی (با دکمه)
  const handleApplyFilterToMap = useCallback(() => {
    if (typeof onFilterToMap === 'function') {
      onFilterToMap(filteredInputFeatures);
      toast.success('فیلتر روی نقشه اصلی اعمال شد');
    }
  }, [filteredInputFeatures, onFilterToMap]);

  const categories = useMemo(() => {
    const categorySet = new Set();
    inputFeatures.forEach(feature => {
      if (feature.properties && feature.properties.category) {
        categorySet.add(feature.properties.category);
      }
    });
    return Array.from(categorySet);
  }, [inputFeatures]);

  const availableProperties = useMemo(() => {
    const props = new Set();
    inputFeatures.forEach(feature => {
      if (feature.properties) {
        Object.keys(feature.properties).forEach(key => props.add(key));
      }
    });
    return Array.from(props);
  }, [inputFeatures]);

  const debouncedSetBufferRadius = useCallback(
    debounce((value) => setBufferRadius(Number(value)), 300),
    []
  );

  const runModel = useCallback(() => {
    if (!filteredInputFeatures || filteredInputFeatures.length === 0) {
      toast.error('هیچ فیچری برای پردازش وجود ندارد');
      setModelResult([]);
      return [];
    }
    if (!isValidBufferRadius) {
      toast.error('شعاع بافر باید بزرگ‌تر از صفر باشد');
      return [];
    }
    if (modelSteps.includes('intersect') && filteredInputFeatures.length < 2) {
      toast.error('برای عملیات Intersect حداقل دو هندسه نیاز است');
      setModelResult([]);
      return [];
    }
    setIsProcessing(true);
    try {
      let working = filteredInputFeatures.map(f => f);

      modelSteps.forEach(step => {
        if (step === 'buffer') {
          working = working.map(f => {
            try {
              const buffered = turf.buffer(f, bufferRadius, { units: 'meters' });
              buffered.properties = { ...buffered.properties, type: 'buffer' };
              return buffered;
            } catch (err) {
              console.error('خطا در buffer برای فیچر:', f, err);
              return null;
            }
          }).filter(Boolean);
        } else if (step === 'intersect') {
          let intersection = working[0];
          for (let i = 1; i < working.length; i++) {
            try {
              intersection = turf.intersect(intersection, working[i]);
              if (!intersection) break;
            } catch (err) {
              console.error('خطا در intersect بین فیچرها:', err);
              intersection = null;
              break;
            }
          }
          if (intersection) {
            intersection.properties = { ...intersection.properties, type: 'intersect' };
          }
          working = intersection ? [intersection] : working;
        }
      });

      setModelResult(working);
      if (typeof setAnalysisResult === 'function') {
        setAnalysisResult({ type: 'FeatureCollection', features: working });
      }
      toast.success(`مدل اجرا شد — ${working.length} فیچر پردازش شد`);
      return working;
    } catch (error) {
      console.error('خطا در اجرای مدل:', error);
      toast.error(`خطا در اجرای مدل: ${error.message}`);
      setModelResult([]);
      return [];
    } finally {
      setIsProcessing(false);
    }
  }, [filteredInputFeatures, bufferRadius, modelSteps, isValidBufferRadius, setAnalysisResult]);

  const generateHeatmap = useCallback(() => {
    const points = filteredInputFeatures.filter(f => f && f.geometry && f.geometry.type === 'Point');
    if (points.length < 2) {
      toast.error('برای Heatmap حداقل دو نقطه نیاز است');
      return;
    }
    setIsProcessing(true);
    try {
      setModelResult([]);
      setShowMap(true);
      toast.success(`Heatmap با ${points.length} نقطه تولید شد`);
    } catch (err) {
      console.error('خطا در تولید Heatmap:', err);
      toast.error(`خطا در تولید Heatmap: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredInputFeatures]);

  const resetSettings = useCallback(() => {
    setBufferRadius(1000);
    setModelSteps(['buffer', 'intersect']);
    setModelResult([]);
    setShowMap(true);
    setFeatureColors({});
    setCategoryColors({});
    setFilters({});
    setExpandedSections({
      modelSettings: true,
      categoryColors: false,
      filters: true,
      featureColors: false,
    });
    toast.info('تنظیمات و نتایج ریست شد');
  }, []);

  const getFeatureStyle = useCallback((feature) => {
    const featureId = feature.properties?.id || feature.id || `feature-${Math.random().toString(36).substr(2, 9)}`;
    const category = feature.properties?.category || 'default';
    const defaultColors = {
      buffer: { color: '#10B981', weight: 2, fillOpacity: 0.4 },
      intersect: { color: '#F87171', weight: 2, fillOpacity: 0.4 },
      default: { color: '#3B82F6', weight: 1, dashArray: '4', fillOpacity: 0.2 },
    };

    if (featureColors[featureId]) {
      return { ...defaultColors.default, color: featureColors[featureId], fillColor: featureColors[featureId] };
    }
    if (categoryColors[category]) {
      return { ...defaultColors.default, color: categoryColors[category], fillColor: categoryColors[category] };
    }

    if (feature.properties?.type === 'buffer') {
      return defaultColors.buffer;
    } else if (feature.properties?.type === 'intersect') {
      return defaultColors.intersect;
    }
    return defaultColors.default;
  }, [featureColors, categoryColors]);

  const modelGeoJSON = useMemo(() => {
    if (!modelResult || modelResult.length === 0) return null;
    return { type: 'FeatureCollection', features: modelResult };
  }, [modelResult]);

  const mapCenter = useMemo(() => {
    const firstPoint = filteredInputFeatures.find(f => f && f.geometry && f.geometry.type === 'Point') || null;
    if (firstPoint) {
      const [lng, lat] = firstPoint.geometry.coordinates;
      return [lat, lng];
    }
    const firstFeat = filteredInputFeatures[0];
    if (firstFeat) {
      try {
        const bbox = turf.bbox(firstFeat);
        const center = [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2];
        return center;
      } catch (err) {
        console.error('خطا در محاسبه مرکز:', err);
      }
    }
    return [0, 0];
  }, [filteredInputFeatures]);

  const heatmapPoints = useMemo(() => {
    return filteredInputFeatures.filter(f => f && f.geometry && f.geometry.type === 'Point');
  }, [filteredInputFeatures]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const updateFilter = useCallback((prop, value) => {
    const trimmedValue = value.trim();
    setFilters(prev => ({
      ...prev,
      [prop]: trimmedValue || undefined, // Remove if empty
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-6 font-vazir text-right">
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 z-[1000] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg flex items-center gap-2">
              <svg className="animate-spin h-6 w-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-gray-800 dark:text-gray-100">در حال پردازش...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-10/10 mx-auto bg-white dark:bg-gray-800 shadow-xl rounded-2xl p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">مدلسازی پیشرفته</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            تعداد فیچرها: {filteredInputFeatures.length} / {inputFeatures.length}
          </p>
        </div>

        {/* Model Settings */}
        <motion.section
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            className="w-full flex justify-between items-center text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
            onClick={() => toggleSection('modelSettings')}
            aria-expanded={expandedSections.modelSettings}
            aria-controls="model-settings"
          >
            تنظیمات مدل
            {expandedSections.modelSettings ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </button>
          <AnimatePresence>
            {expandedSections.modelSettings && (
              <motion.div
                id="model-settings"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <label htmlFor="buffer-radius" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      شعاع بافر (متر)
                    </label>
                    <input
                      id="buffer-radius"
                      type="number"
                      value={bufferRadius}
                      onChange={e => debouncedSetBufferRadius(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                      min={1}
                      aria-describedby="buffer-radius-error"
                      disabled={isProcessing}
                    />
                    <span className="absolute right-3 top-10 text-gray-500 dark:text-gray-400">متر</span>
                    {!isValidBufferRadius && bufferRadius !== '' && (
                      <motion.p
                        className="text-sm text-red-600 dark:text-red-400 mt-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        id="buffer-radius-error"
                      >
                        شعاع بافر باید بزرگ‌تر از صفر باشد
                      </motion.p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={modelSteps.includes('buffer')}
                        onChange={e => {
                          setModelSteps(prev => (e.target.checked ? Array.from(new Set([...prev, 'buffer'])) : prev.filter(s => s !== 'buffer')));
                        }}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        aria-label="فعال‌سازی عملیات بافر"
                        disabled={isProcessing}
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-100">Buffer</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={modelSteps.includes('intersect')}
                        onChange={e => {
                          setModelSteps(prev => (e.target.checked ? Array.from(new Set([...prev, 'intersect'])) : prev.filter(s => s !== 'intersect')));
                        }}
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        aria-label="فعال‌سازی عملیات تقاطع"
                        disabled={isProcessing}
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-100">Intersect</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Category Colors */}
        <motion.section
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <button
            className="w-full flex justify-between items-center text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
            onClick={() => toggleSection('categoryColors')}
            aria-expanded={expandedSections.categoryColors}
            aria-controls="category-colors"
          >
            تنظیمات رنگ دسته‌بندی‌ها
            {expandedSections.categoryColors ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </button>
          <AnimatePresence>
            {expandedSections.categoryColors && (
              <motion.div
                id="category-colors"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categories.map((category, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <label className="text-sm text-gray-800 dark:text-gray-100">
                        دسته‌بندی {category}:
                      </label>
                      <input
                        type="color"
                        value={categoryColors[category] || '#3B82F6'}
                        onChange={(e) =>
                          setCategoryColors((prev) => ({
                            ...prev,
                            [category]: e.target.value,
                          }))
                        }
                        className="w-10 h-10 rounded-md cursor-pointer"
                        aria-label={`انتخاب رنگ برای دسته‌بندی ${category}`}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Filters - Enhanced with better matching */}
        <motion.section
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <button
            className="w-full flex justify-between items-center text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
            onClick={() => toggleSection('filters')}
            aria-expanded={expandedSections.filters}
            aria-controls="filters"
          >
            فیلترهای پیشرفته
            {expandedSections.filters ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </button>
          <AnimatePresence>
            {expandedSections.filters && (
              <motion.div
                id="filters"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {availableProperties.map((prop, index) => (
                    <div key={index} className="flex flex-col">
                      <label className="text-sm text-gray-800 dark:text-gray-100 mb-1">{prop}:</label>
                      <input
                        type="text"
                        value={filters[prop] || ''}
                        onChange={(e) => updateFilter(prop, e.target.value)}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                        placeholder={`مقدار دقیق ${prop} را وارد کنید (مثال: برای فیلتر بر اساس ID یا نام)`}
                        aria-label={`فیلتر برای ${prop}`}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        تطبیق دقیق (حساس به نوع داده، اما تبدیل به رشته)
                      </p>
                    </div>
                  ))}
                </div>
                {Object.keys(filters).length > 0 && (
                  <motion.p
                    className="text-sm text-blue-600 dark:text-blue-400 mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    فیلترها اعمال شد: {filteredInputFeatures.length} فیچر مطابقت دارد.
                  </motion.p>
                )}
                {/* دکمه اعمال فیلتر روی نقشه */}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleApplyFilterToMap}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition"
                  >
                    اعمال فیلتر روی نقشه اصلی
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Feature Colors */}
        <motion.section
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <button
            className="w-full flex justify-between items-center text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
            onClick={() => toggleSection('featureColors')}
            aria-expanded={expandedSections.featureColors}
            aria-controls="feature-colors"
          >
            تنظیمات رنگ فیچرها
            {expandedSections.featureColors ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </button>
          <AnimatePresence>
            {expandedSections.featureColors && (
              <motion.div
                id="feature-colors"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-48 overflow-y-auto">
                  {filteredInputFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <label className="text-sm text-gray-800 dark:text-gray-100">
                        فیچر {feature.properties?.id || index + 1}:
                      </label>
                      <input
                        type="color"
                        value={featureColors[feature.properties?.id || index] || '#3B82F6'}
                        onChange={(e) =>
                          setFeatureColors((prev) => ({
                            ...prev,
                            [feature.properties?.id || index]: e.target.value,
                          }))
                        }
                        className="w-10 h-10 rounded-md cursor-pointer"
                        aria-label={`انتخاب رنگ برای فیچر ${feature.properties?.id || index + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Actions */}
        <motion.div
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">اجرای عملیات</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <button
              onClick={runModel}
              disabled={isProcessing || !filteredInputFeatures.length || !isValidBufferRadius || (modelSteps.includes('intersect') && filteredInputFeatures.length < 2)}
              className="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              aria-label="اجرای مدل"
            >
              <PlayIcon className="w-5 h-5" />
              اجرای مدل
            </button>
            <button
              onClick={generateHeatmap}
              disabled={isProcessing || heatmapPoints.length < 2}
              className="px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 focus:ring-2 focus:ring-green-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              aria-label="تولید Heatmap"
            >
              <FireIcon className="w-5 h-5" />
              تولید Heatmap
            </button>
            <button
              onClick={resetSettings}
              disabled={isProcessing}
              className="px-4 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 focus:ring-2 focus:ring-gray-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              aria-label="ریست تنظیمات"
            >
              <ArrowPathIcon className="w-5 h-5" />
              ریست تنظیمات
            </button>
            <button
              onClick={() => setShowMap(s => !s)}
              className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 focus:ring-2 focus:ring-indigo-500 transition flex items-center justify-center gap-2"
              aria-label={showMap ? 'پنهان کردن نقشه' : 'نمایش نقشه'}
            >
              <MapIcon className="w-5 h-5" />
              {showMap ? 'پنهان کردن نقشه' : 'نمایش نقشه'}
            </button>
          </div>
        </motion.div>

        {/* Map */}
        {showMap && (
          <motion.div
            className="h-[32rem] w-full rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 shadow-lg"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {modelGeoJSON && (
                <>
                  <GeoJSON
                    data={{ type: 'FeatureCollection', features: modelResult.filter(f => f.properties && f.properties.type === 'buffer') }}
                    style={getFeatureStyle}
                  />
                  <GeoJSON
                    data={{ type: 'FeatureCollection', features: modelResult.filter(f => f.properties && f.properties.type === 'intersect') }}
                    style={getFeatureStyle}
                  />
                </>
              )}
              {filteredInputFeatures && filteredInputFeatures.length > 0 && (
                <GeoJSON
                  data={{ type: 'FeatureCollection', features: filteredInputFeatures }}
                  style={getFeatureStyle}
                />
              )}
              {heatmapPoints && heatmapPoints.length >= 2 && (
                <HeatmapLayer points={heatmapPoints} />
              )}
            </MapContainer>
          </motion.div>
        )}
        {showMap && filteredInputFeatures.length === 0 && inputFeatures.length > 0 && (
          <motion.p
            className="text-sm text-red-600 dark:text-red-400 text-center mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            هیچ فیچری با فیلترهای فعلی مطابقت ندارد. فیلترها را بررسی کنید.
          </motion.p>
        )}
        {showMap && inputFeatures.length === 0 && (
          <motion.p
            className="text-sm text-gray-600 dark:text-gray-400 text-center mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            هیچ فیچری برای نمایش در نقشه وجود ندارد
          </motion.p>
        )}
      </div>
    </div>
  );
};

export default React.memo(AdvancedModeling);