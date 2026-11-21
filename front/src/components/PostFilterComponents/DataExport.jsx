import React, { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import shpwrite from '@mapbox/shp-write';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownTrayIcon, PlusCircleIcon } from '@heroicons/react/24/solid';
import { API_BASE_URL } from '../../services/api';
const API_BASE = API_BASE_URL;

const DataExport = ({ filteredFeatures = [], activeLayerName, onRefresh }) => {
  const [newLayerName, setNewLayerName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // بررسی وجود فیچرها
  const hasFeatures = useMemo(() => filteredFeatures && filteredFeatures.length > 0, [filteredFeatures]);

  // اعتبارسنجی نام لایه
  const isValidLayerName = useMemo(() => {
    return newLayerName && /^[a-zA-Z0-9_-]+$/.test(newLayerName);
  }, [newLayerName]);

  // صدور به GeoJSON (بدون تغییر منطق)
  const exportToGeoJSON = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای صدور وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const geojson = { type: 'FeatureCollection', features: filteredFeatures };
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeLayerName || 'filtered'}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`GeoJSON با ${filteredFeatures.length} فیچر صادر شد`);
    } catch (error) {
      console.error(error);
      toast.error('خطا در صدور GeoJSON');
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, activeLayerName, hasFeatures]);

  // تابع کمکی برای escape مقادیر CSV
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const escaped = str.replace(/"/g, '""'); // دوبل کردن "
    return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  // صدور به CSV (اصلاح‌شده)
  const exportToCSV = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای صدور وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      // کلیدها (ترتیب هدرها) را از اولین فیچر می‌گیریم
      const keys = Object.keys(filteredFeatures[0]?.properties || {});
      if (keys.length === 0) {
        toast.error('هیچ ویژگی‌ای برای نوشتن در CSV یافت نشد');
        setIsProcessing(false);
        return;
      }

      // هدرها (اگر بخواهید می‌توانید نام فارسی جای کلیدها قرار دهید)
      const headers = keys.map(k => escapeCSV(k)).join(',');

      // ردیف‌ها بر اساس کلیدها ساخته می‌شوند تا ترتیب ثابت حفظ شود
      const rows = filteredFeatures
        .map(f => keys.map(k => escapeCSV(f.properties?.[k] ?? '')).join(','))
        .join('\r\n');

      // BOM برای سازگاری UTF-8 با اکسل و CRLF برای پایان خط
      const csvContent = '\uFEFF' + headers + '\r\n' + rows;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeLayerName || 'filtered'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV با ${filteredFeatures.length} فیچر صادر شد`);
    } catch (error) {
      console.error(error);
      toast.error('خطا در صدور CSV');
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, activeLayerName, hasFeatures]);

  // صدور به Shapefile (بدون تغییر منطق)
  const exportToShapefile = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای صدور وجود ندارد');
      return;
    }
    setIsProcessing(true);
    try {
      const geojson = { type: 'FeatureCollection', features: filteredFeatures };
      geojson.features.forEach((feature, index) => {
        if (!feature.geometry || !feature.properties) {
          throw new Error(`داده‌های نامعتبر در فیچر شماره ${index + 1}`);
        }
      });
      const files = shpwrite.zip(geojson);
      const zip = new Blob([files], { type: 'application/zip' });
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeLayerName || 'filtered'}_shapefile.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Shapefile با ${filteredFeatures.length} فیچر صادر شد`);
    } catch (error) {
      console.error(error);
      toast.error(`خطا در صدور Shapefile: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, activeLayerName, hasFeatures]);

  // ذخیره به لایه جدید (بدون تغییر منطق)
  const exportToNewLayer = useCallback(async () => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای ذخیره وجود ندارد');
      return;
    }
    if (!isValidLayerName) {
      toast.error('نام لایه جدید نامعتبر است (فقط حروف، اعداد، خط تیره و زیرخط مجازند)');
      return;
    }
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('لطفاً دوباره وارد شوید');
      }
      await axios.post(
        `${API_BASE}/api/add-layer`,
        {
          layerName: newLayerName,
          features: filteredFeatures,
          storage: 'local',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success(`لایه جدید ${newLayerName} با ${filteredFeatures.length} فیچر ذخیره شد`);
      setNewLayerName('');
      onRefresh?.();
    } catch (error) {
      console.error(error);
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.details ||
        error.message ||
        'خطا در ذخیره لایه جدید';
      toast.error(`خطا در ذخیره لایه جدید: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, newLayerName, isValidLayerName, onRefresh, hasFeatures]);

  return (
    <div className="max-w-10/10 min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 font-vazir">
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
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">خروجی گرفتن</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            تعداد فیچرها: {filteredFeatures.length}
          </p>
        </div>

        {/* دکمه‌های صدور */}
        <motion.div
          className="flex flex-wrap gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={exportToGeoJSON}
            disabled={isProcessing || !hasFeatures}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="صدور به فرمت GeoJSON"
          >
            <ArrowDownTrayIcon className="w-4 h-4 ml-2" />
            GeoJSON
          </button>
          <button
            onClick={exportToCSV}
            disabled={isProcessing || !hasFeatures}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="صدور به فرمت CSV"
          >
            <ArrowDownTrayIcon className="w-4 h-4 ml-2" />
            CSV
          </button>
          <button
            onClick={exportToShapefile}
            disabled={isProcessing || !hasFeatures}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="صدور به فرمت Shapefile"
          >
            <ArrowDownTrayIcon className="w-4 h-4 ml-2" />
            Shapefile
          </button>
        </motion.div>

        {/* ذخیره به لایه جدید */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="نام لایه جدید (فقط حروف، اعداد، خط تیره و زیرخط)"
              value={newLayerName}
              onChange={e => setNewLayerName(e.target.value)}
              className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="نام لایه جدید"
              aria-describedby="layer-name-error"
            />
            <PlusCircleIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
          </div>
          <button
            onClick={exportToNewLayer}
            disabled={isProcessing || !hasFeatures || !isValidLayerName}
            className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-md hover:from-green-700 hover:to-green-800 focus:ring-2 focus:ring-green-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            aria-label="ذخیره به لایه جدید"
          >
            <PlusCircleIcon className="w-4 h-4 ml-2" />
            ذخیره به لایه جدید
          </button>
        </motion.div>
        {!isValidLayerName && newLayerName && (
          <motion.p
            className="text-sm text-red-600 dark:text-red-400 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            id="layer-name-error"
          >
            نام لایه باید فقط شامل حروف، اعداد، خط تیره و زیرخط باشد
          </motion.p>
        )}
      </div>
    </div>
  );
};

export default React.memo(DataExport);
