import React, { useMemo } from 'react';
import * as turf from '@turf/turf';
import { toast } from 'react-toastify';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { ArrowDownTrayIcon } from '@heroicons/react/24/solid';

const StatisticalAnalysis = ({ filteredFeatures, nameField, setNameField, valueField, setValueField }) => {
  const stats = useMemo(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return {};

    const fields = Object.keys(filteredFeatures[0].properties || {});
    const result = {};
    fields.forEach(key => {
      if (typeof filteredFeatures[0].properties[key] === 'number') {
        const values = filteredFeatures
          .map(f => f.properties[key])
          .filter(v => v !== undefined && v !== null);

        if (values.length > 0) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);

          result[key] = {
            mean,
            max: Math.max(...values),
            min: Math.min(...values),
            variance,
            stdDev,
            count: values.length,
          };
        }
      }
    });
    return result;
  }, [filteredFeatures]);

  const totalArea = useMemo(
    () =>
      filteredFeatures && filteredFeatures.length > 0
        ? turf.area({ type: 'FeatureCollection', features: filteredFeatures }) / 1000000
        : 0,
    [filteredFeatures]
  );
  const totalLength = useMemo(
    () =>
      filteredFeatures && filteredFeatures.length > 0
        ? turf.length({ type: 'FeatureCollection', features: filteredFeatures }, { units: 'kilometers' })
        : 0,
    [filteredFeatures]
  );

  const infoFields = useMemo(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return [];
    return Object.keys(filteredFeatures[0].properties || {});
  }, [filteredFeatures]);

  React.useEffect(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return;
    const fields = Object.keys(filteredFeatures[0].properties || {});
    if ((!nameField || nameField === '') && fields.length > 0) {
      if (fields.includes('Name')) setNameField('Name');
      else {
        const firstString = fields.find(f => typeof filteredFeatures[0].properties[f] === 'string');
        setNameField(firstString || fields[0] || '');
      }
    }
  }, [filteredFeatures, nameField, setNameField]);

  const numericFields = useMemo(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return [];
    return Object.keys(filteredFeatures[0].properties || {}).filter(
      key => typeof filteredFeatures[0].properties[key] === 'number'
    );
  }, [filteredFeatures]);

  React.useEffect(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return;
    const fields = Object.keys(filteredFeatures[0].properties || {});
    if ((!valueField || valueField === '') && fields.length > 0) {
      if (fields.includes('Shape_Area')) setValueField('Shape_Area');
      else {
        const firstNum = fields.find(f => typeof filteredFeatures[0].properties[f] === 'number');
        setValueField(firstNum || fields[0] || '');
      }
    }
  }, [filteredFeatures, valueField, setValueField]);

  const chartData = useMemo(
    () =>
      filteredFeatures && filteredFeatures.length > 0
        ? filteredFeatures.map(f => ({
            name: f.properties[nameField] || `فیچر ${f.properties.mahalle_ID}`,
            value: Number(f.properties[valueField]) || 0,
          }))
        : [],
    [filteredFeatures, nameField, valueField]
  );

  const [sortConfig, setSortConfig] = React.useState({ key: 'mean', direction: 'asc' });

  const sortedStats = useMemo(() => {
    const entries = Object.entries(stats);
    if (!sortConfig.key) return entries;

    return entries.sort(([keyA, valA], [keyB, valB]) => {
      const valueA = valA[sortConfig.key] || 0;
      const valueB = valB[sortConfig.key] || 0;
      if (sortConfig.direction === 'asc') {
        return valueA - valueB;
      }
      return valueB - valueA;
    });
  }, [stats, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const escaped = str.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const downloadCSV = () => {
    const headers = ['فیلد', 'تعداد', 'میانگین', 'ماکزیمم', 'مینیمم', 'واریانس', 'انحراف معیار'];

    const rows = Object.entries(stats).map(([key, val]) => [
      key,
      val.count,
      isFinite(val.mean) ? val.mean.toFixed(2) : '',
      val.max,
      val.min,
      isFinite(val.variance) ? val.variance.toFixed(2) : '',
      isFinite(val.stdDev) ? val.stdDev.toFixed(2) : '',
    ]);

    const lines = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'statistical_analysis.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('فایل CSV دانلود شد');
  };

  if (!filteredFeatures || filteredFeatures.length === 0) {
    return (
      <motion.div
        className="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        هیچ فیچری برای تحلیل انتخاب نشده است. لطفا ابتدا یک یا چند فیچر را انتخاب کنید.
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">تحلیل آماری</h3>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg shadow">
          <p className="text-sm text-gray-600 dark:text-gray-300">تعداد فیچرها</p>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{filteredFeatures.length}</p>
        </div>
        <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg shadow">
          <p className="text-sm text-gray-600 dark:text-gray-300">مساحت کل</p>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{totalArea.toFixed(2)} کیلومتر مربع</p>
        </div>
        <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg shadow">
          <p className="text-sm text-gray-600 dark:text-gray-300">طول/محیط کل</p>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{totalLength.toFixed(2)} کیلومتر</p>
        </div>
      </motion.div>

      {/* --- MOBILE VIEW: CARDS --- */}
      <motion.div
        className="md:hidden space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {sortedStats.map(([key, val]) => (
          <div key={key} className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg shadow">
            <h4 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-2 border-b border-gray-300 dark:border-gray-600 pb-2">{key}</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="font-semibold text-gray-600 dark:text-gray-300">تعداد:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.count}</span>
              
              <span className="font-semibold text-gray-600 dark:text-gray-300">میانگین:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.mean.toFixed(2)}</span>

              <span className="font-semibold text-gray-600 dark:text-gray-300">ماکزیمم:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.max}</span>

              <span className="font-semibold text-gray-600 dark:text-gray-300">مینیمم:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.min}</span>

              <span className="font-semibold text-gray-600 dark:text-gray-300">واریانس:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.variance.toFixed(2)}</span>
              
              <span className="font-semibold text-gray-600 dark:text-gray-300">انحراف معیار:</span>
              <span className="text-gray-800 dark:text-gray-200">{val.stdDev.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </motion.div>

      {/* --- DESKTOP VIEW: TABLE --- */}
      <motion.div
        className="overflow-x-auto hidden md:block"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md table-auto border-collapse">
          <thead dir="ltr" style={{ unicodeBidi: 'embed' }} className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('field')}>
                فیلد {sortConfig.key === 'field' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('count')}>
                تعداد {sortConfig.key === 'count' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('mean')}>
                میانگین {sortConfig.key === 'mean' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('max')}>
                ماکزیمم {sortConfig.key === 'max' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('min')}>
                مینیمم {sortConfig.key === 'min' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('variance')}>
                واریانس {sortConfig.key === 'variance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th scope="col" className="px-4 py-2 align-middle text-left border-b text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap" onClick={() => handleSort('stdDev')}>
                انحراف معیار {sortConfig.key === 'stdDev' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map(([key, val], index) => (
              <tr key={key} className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{key}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.count}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.mean.toFixed(2)}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.max}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.min}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.variance.toFixed(2)}</td>
                <td className="px-4 py-2 align-middle border-b text-gray-700 dark:text-gray-300 whitespace-nowrap">{val.stdDev.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
          <div className="w-full flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-full sm:w-auto flex-1">
                <label htmlFor="name-field-select" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">فیلد نام:</label>
                <select
                    id="name-field-select"
                    value={nameField}
                    onChange={e => setNameField(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    aria-label="انتخاب فیلد نام فیچر"
                >
                    {infoFields.map(field => (
                    <option key={field} value={field}>{field}</option>
                    ))}
                </select>
            </div>
            <div className="w-full sm:w-auto flex-1">
                <label htmlFor="value-field-select" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">فیلد مقدار:</label>
                <select
                    id="value-field-select"
                    value={valueField}
                    onChange={e => setValueField(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    aria-label="انتخاب فیلد مقدار نمودار"
                >
                    {numericFields.map(field => (
                    <option key={field} value={field}>{field}</option>
                    ))}
                </select>
            </div>
          </div>
          <button
            onClick={downloadCSV}
            className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition"
            aria-label="دانلود آمار به‌صورت CSV"
          >
            <ArrowDownTrayIcon className="w-4 h-4 ml-2" />
            دانلود CSV
          </button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(31, 41, 55, 0.8)', // dark:bg-gray-800 with opacity
                border: '1px solid #4B5563', // dark:border-gray-600
                borderRadius: '8px',
                color: '#F9FAFB' // dark:text-gray-50
              }}
              labelStyle={{ fontWeight: 'bold' }}
              itemStyle={{ color: '#60A5FA' }} // blue-400
            />
            <Legend />
            <Bar dataKey="value" fill="#3B82F6" name={valueField} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
};

export default React.memo(StatisticalAnalysis);