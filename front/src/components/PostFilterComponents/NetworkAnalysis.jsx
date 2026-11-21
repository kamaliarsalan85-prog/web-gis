import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as turf from '@turf/turf';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { MapPinIcon, ArrowRightCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

const NetworkAnalysis = ({ filteredFeatures = [], setAnalysisResult }) => {
  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  const [serviceRadius, setServiceRadius] = useState(1000); // متر
  const [isProcessing, setIsProcessing] = useState(false);
  const [fieldKey, setFieldKey] = useState('mahalle_ID');

  useEffect(() => {
    setStartPoint('');
    setEndPoint('');
  }, [fieldKey]);

  const hasFeatures = useMemo(() => filteredFeatures.length > 0, [filteredFeatures]);

  const fields = useMemo(() => {
    if (filteredFeatures[0] && filteredFeatures[0].properties) {
      return Object.keys(filteredFeatures[0].properties);
    }
    return [];
  }, [filteredFeatures]);

  const featureOptions = useMemo(() => {
    const seen = new Set();
    return filteredFeatures
      .map(f => {
        const id = String(f?.properties?.[fieldKey]);
        if (!id || id === 'undefined' || id === 'null' || id === '') return null;
        if (seen.has(id)) return null;
        seen.add(id);
        return {
          id,
          name: f?.properties?.Name || id || 'نامشخص',
        };
      })
      .filter(Boolean);
  }, [filteredFeatures, fieldKey]);

  const isValidServiceRadius = useMemo(() => serviceRadius > 0, [serviceRadius]);

  const findFeatureById = useCallback(
    (id) => {
      if (!id && id !== 0) return null;
      return filteredFeatures.find(f => String(f?.properties?.[fieldKey]) === String(id));
    },
    [filteredFeatures, fieldKey]
  );

  const toPointFeature = useCallback((feature) => {
    if (!feature) return null;
    if (feature.geometry && feature.geometry.type === 'Point') {
      return feature;
    }
    try {
      return turf.centroid(feature);
    } catch (err) {
      console.error('خطا در محاسبه centroid:', err);
      return null;
    }
  }, []);

  const calculateShortestPath = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای تحلیل شبکه وجود ندارد');
      return;
    }
    if (!startPoint || !endPoint) {
      toast.error('نقاط شروع و پایان را انتخاب کنید');
      return;
    }
    setIsProcessing(true);
    try {
      const startFeat = findFeatureById(startPoint);
      const endFeat = findFeatureById(endPoint);

      if (!startFeat || !endFeat) {
        toast.error('نقاط شروع یا پایان معتبر نیستند');
        return;
      }

      const startPt = toPointFeature(startFeat);
      const endPt = toPointFeature(endFeat);

      if (!startPt || !endPt) {
        toast.error('نمی‌توان نقاط هندسی را بدست آورد');
        return;
      }

      const distanceKm = turf.distance(startPt, endPt, { units: 'kilometers' });
      toast.success(`فاصله کوتاه‌ترین مسیر: ${distanceKm.toFixed(3)} کیلومتر`);
      const lineFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            startPt.geometry.coordinates,
            endPt.geometry.coordinates
          ]
        },
        properties: {
          from: startPoint,
          to: endPoint,
          distance_km: distanceKm
        }
      };
      const lineGeoJSON = {
        type: 'FeatureCollection',
        features: [lineFeature]
      };
      if (setAnalysisResult) setAnalysisResult(lineGeoJSON);
    } catch (err) {
      console.error('خطا در محاسبه مسیر:', err);
      toast.error(`خطا در محاسبه مسیر: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [startPoint, endPoint, findFeatureById, toPointFeature, hasFeatures, setAnalysisResult]);

  const calculateServiceArea = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای تحلیل شبکه وجود ندارد');
      return;
    }
    if (!startPoint) {
      toast.error('نقطه مرکزی را انتخاب کنید');
      return;
    }
    if (!isValidServiceRadius) {
      toast.error('شعاع سرویس‌دهی باید بزرگ‌تر از صفر باشد');
      return;
    }
    setIsProcessing(true);
    try {
      const centerFeat = findFeatureById(startPoint);
      if (!centerFeat) {
        toast.error('نقطه مرکزی معتبر نیست');
        return;
      }

      const centerPt = toPointFeature(centerFeat);
      if (!centerPt) {
        toast.error('نمی‌توان نقطه مرکزی را بدست آورد');
        return;
      }

      const radiusKm = Number(serviceRadius) / 1000;
      const buffered = turf.buffer(centerPt, radiusKm, { units: 'kilometers' });
      if(setAnalysisResult) setAnalysisResult(buffered);
      toast.success(`منطقه سرویس‌دهی با شعاع ${serviceRadius} متر ایجاد شد`);
    } catch (err) {
      console.error('خطا در محاسبه منطقه سرویس:', err);
      toast.error(`خطا در ایجاد منطقه سرویس: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [startPoint, serviceRadius, findFeatureById, toPointFeature, hasFeatures, isValidServiceRadius, setAnalysisResult]);

  const resetSettings = useCallback(() => {
    setStartPoint('');
    setEndPoint('');
    setServiceRadius(1000);
    setFieldKey('mahalle_ID');
    if (setAnalysisResult) setAnalysisResult(null);
    toast.info('تنظیمات ریست شد');
  }, [setAnalysisResult]);

  return (
    <div className="space-y-6">
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
      
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">تحلیل شبکه</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          تعداد فیچرها: {filteredFeatures.length}
        </p>
      </div>

      <div>
        <label htmlFor="field-key-select" className="block mb-1 text-gray-700 dark:text-gray-200 text-sm font-medium">انتخاب کلید اطلاعاتی</label>
        <select
          id="field-key-select"
          value={fieldKey}
          onChange={e => setFieldKey(e.target.value)}
          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
        >
          {fields.map(field => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
      </div>

      <motion.div
        className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">محاسبه مسیر کوتاه</h4>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:flex-1">
            <select
              value={String(startPoint)}
              onChange={e => setStartPoint(e.target.value)}
              className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="انتخاب نقطه شروع"
              disabled={!hasFeatures}
            >
              <option value="">نقطه شروع</option>
              {featureOptions.map(f => (
                <option key={f.id + '_start'} value={f.id}>{f.name}</option>
              ))}
            </select>
            <MapPinIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative w-full sm:flex-1">
            <select
              value={String(endPoint)}
              onChange={e => setEndPoint(e.target.value)}
              className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="انتخاب نقطه پایان"
              disabled={!hasFeatures}
            >
              <option value="">نقطه پایان</option>
              {featureOptions.map(f => (
                <option key={f.id + '_end'} value={f.id}>{f.name}</option>
              ))}
            </select>
            <MapPinIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
          </div>
          <button
            onClick={calculateShortestPath}
            disabled={isProcessing || !hasFeatures || !startPoint || !endPoint}
            className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="محاسبه مسیر کوتاه"
          >
            <ArrowRightCircleIcon className="w-5 h-5 ml-2" />
            محاسبه مسیر
          </button>
        </div>
      </motion.div>

      <motion.div
        className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">محاسبه منطقه سرویس‌دهی</h4>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:flex-1">
            <select
              value={String(startPoint)}
              onChange={e => setStartPoint(e.target.value)}
              className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="انتخاب نقطه مرکزی"
              disabled={!hasFeatures}
            >
              <option value="">نقطه مرکزی</option>
              {featureOptions.map(f => (
                <option key={f.id + '_center'} value={f.id}>{f.name}</option>
              ))}
            </select>
            <MapPinIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="relative w-full sm:w-auto">
            <label htmlFor="service-radius-input" className="sr-only">شعاع سرویس (متر)</label>
            <input
              id="service-radius-input"
              type="number"
              value={serviceRadius}
              onChange={e => setServiceRadius(Number(e.target.value))}
              className="w-full sm:w-32 p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              min={1}
              placeholder="شعاع (متر)"
              aria-label="شعاع سرویس‌دهی (متر)"
              disabled={!hasFeatures}
            />
          </div>
          <button
            onClick={calculateServiceArea}
            disabled={isProcessing || !hasFeatures || !startPoint || !isValidServiceRadius}
            className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-md hover:from-teal-600 hover:to-cyan-600 focus:ring-2 focus:ring-teal-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="محاسبه منطقه سرویس‌دهی"
          >
            <MapPinIcon className="w-5 h-5 ml-2" />
            محاسبه محدوده
          </button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <button
          onClick={resetSettings}
          disabled={isProcessing || (!startPoint && !endPoint && serviceRadius === 1000)}
          className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:ring-2 focus:ring-gray-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          aria-label="ریست کردن تمام تنظیمات"
        >
          <ArrowPathIcon className="w-5 h-5 ml-2" />
          ریست تنظیمات
        </button>
      </motion.div>
    </div>
  );
};

export default React.memo(NetworkAnalysis);