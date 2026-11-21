import React, { useState, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { LinkIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

const DataJoining = ({ filteredFeatures = [], layers = [], setAnalysisResult }) => {
  const [joinField, setJoinField] = useState('');
  const [targetLayer, setTargetLayer] = useState('');
  const [targetField, setTargetField] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // بررسی وجود فیچرها و لایه‌ها
  const hasFeatures = useMemo(() => filteredFeatures.length > 0, [filteredFeatures]);
  const hasLayers = useMemo(() => layers.length > 0, [layers]);

  // استخراج فیلدهای منبع
  const fields = useMemo(
    () => (filteredFeatures[0] ? Object.keys(filteredFeatures[0].properties) : []),
    [filteredFeatures]
  );

  // استخراج فیلدهای هدف
  const targetFields = useMemo(() => {
    const layer = layers.find(l => l.name === targetLayer);
    return layer?.data?.features[0] ? Object.keys(layer.data.features[0].properties) : [];
  }, [layers, targetLayer]);

  // انجام Join
  const performJoin = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای اتصال داده‌ها وجود ندارد');
      return;
    }
    if (!hasLayers) {
      toast.error('هیچ لایه‌ای برای اتصال داده‌ها وجود ندارد');
      return;
    }
    if (!targetLayer || !joinField || !targetField) {
      toast.error('لایه، فیلد منبع و فیلد هدف را انتخاب کنید');
      return;
    }
    setIsProcessing(true);
    try {
      const layer = layers.find(l => l.name === targetLayer);
      if (!layer || !layer.data?.features) {
        toast.error('لایه هدف معتبر نیست');
        return;
      }

      const joined = filteredFeatures.map(f => {
        const match = layer.data.features.find(tf => tf.properties[targetField] === f.properties[joinField]);
        return match ? { ...f, properties: { ...f.properties, ...match.properties } } : f;
      });

      // ارسال نتایج به والد (اگر prop وجود داشته باشه)
      if (typeof setAnalysisResult === 'function') {
        setAnalysisResult({ type: 'FeatureCollection', features: joined });
      }

      toast.success(`اتصال داده‌ها انجام شد — ${joined.length} فیچر پردازش شد`);
      return joined;
    } catch (err) {
      console.error('خطا در اتصال داده‌ها:', err);
      toast.error(`خطا در اتصال داده‌ها: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [filteredFeatures, layers, targetLayer, joinField, targetField, hasFeatures, hasLayers, setAnalysisResult]);

  // ریست تنظیمات
  const resetSettings = useCallback(() => {
    setJoinField('');
    setTargetLayer('');
    setTargetField('');
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
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">اتصال داده‌ها</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            تعداد فیچرها: {filteredFeatures.length} | لایه‌های موجود: {layers.length}
          </p>
        </div>

        {/* انتخاب لایه هدف */}
        <motion.div
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">انتخاب لایه هدف</h4>
          <div className="relative">
            <select
              value={targetLayer}
              onChange={e => setTargetLayer(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              aria-label="انتخاب لایه هدف"
              disabled={!hasLayers}
            >
              <option value="">انتخاب لایه هدف</option>
              {layers.map(l => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
            <LinkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
          </div>
          {!hasLayers && (
            <motion.p
              className="text-sm text-red-600 dark:text-red-400 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              هیچ لایه‌ای برای اتصال وجود ندارد
            </motion.p>
          )}
        </motion.div>

        {/* انتخاب فیلدها */}
        <motion.div
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">انتخاب فیلدها</h4>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <select
                value={joinField}
                onChange={e => setJoinField(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                aria-label="انتخاب فیلد منبع"
                disabled={!hasFeatures}
              >
                <option value="">انتخاب فیلد منبع</option>
                {fields.map(field => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <LinkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
            </div>
            <div className="relative flex-1">
              <select
                value={targetField}
                onChange={e => setTargetField(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                aria-label="انتخاب فیلد هدف"
                disabled={!targetLayer || targetFields.length === 0}
              >
                <option value="">انتخاب فیلد هدف</option>
                {targetFields.map(field => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <LinkIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
            </div>
          </div>
          {!hasFeatures && (
            <motion.p
              className="text-sm text-red-600 dark:text-red-400 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              هیچ فیچری برای انتخاب فیلد منبع وجود ندارد
            </motion.p>
          )}
          {targetLayer && targetFields.length === 0 && (
            <motion.p
              className="text-sm text-red-600 dark:text-red-400 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              لایه هدف هیچ فیلدی ندارد
            </motion.p>
          )}
        </motion.div>

        {/* عملیات Join و ریست */}
        <motion.div
          className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={performJoin}
              disabled={isProcessing || !hasFeatures || !hasLayers || !targetLayer || !joinField || !targetField}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="انجام اتصال داده‌ها"
            >
              <LinkIcon className="w-4 h-4 ml-2" />
              انجام Join
            </button>
            <button
              onClick={resetSettings}
              disabled={isProcessing || (!joinField && !targetLayer && !targetField)}
              className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-md hover:from-gray-600 hover:to-gray-700 focus:ring-2 focus:ring-gray-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
              aria-label="ریست تنظیمات"
            >
              <ArrowPathIcon className="w-4 h-4 ml-2" />
              ریست تنظیمات
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default React.memo(DataJoining);