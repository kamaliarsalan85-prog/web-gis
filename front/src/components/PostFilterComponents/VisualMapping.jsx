// VisualMapping.fixed.mobile-modal.jsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { SwatchIcon, TagIcon, ArrowPathIcon, ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { createPortal } from 'react-dom';

/**
  VisualMapping (fixed & mobile-optimized modal)
  - منطق اصلی حفظ شده است.
  - مودال جزئیات برای دسکتاپ قابل جابجایی و تغییر اندازه است.
  - مودال جزئیات در موبایل به صورت Bottom Sheet نمایش داده می‌شود (واکنش‌گرا).
  - انیمیشن‌ها و کنترل‌های مودال برای هر حالت (دسکتاپ/موبایل) بهینه شده است.
*/

// --- Custom Hook for checking screen size ---
const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Set initial value
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [breakpoint]);

  return isMobile;
};


const VisualMapping = ({
  filteredFeatures = [],
  selectedField, setSelectedField,
  color, setColor,
  labelField, setLabelField,
  nameField, setNameField,
  xField = '' // optional
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null); // payload for group
  const [modalPos, setModalPos] = useState({ left: null, top: null }); // px
  const [modalSize, setModalSize] = useState({ width: 520, height: 320 }); // default (small)
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const isMobile = useIsMobile(); // <-- Check if the view is mobile

  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 180;
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 800;

  // ... (other hooks and functions remain unchanged) ...
  /* ---------------- smooth scroll (unchanged) ---------------- */
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    let targetScroll = scrollContainer.scrollTop;
    let ticking = false;
    const clamp = (v) => {
      const max = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      return Math.max(0, Math.min(v, max));
    };
    const step = () => {
      ticking = true;
      const current = scrollContainer.scrollTop;
      const ease = 0.18;
      const diff = targetScroll - current;
      if (Math.abs(diff) < 0.5) {
        scrollContainer.scrollTop = targetScroll;
        ticking = false;
        return;
      }
      scrollContainer.scrollTop = current + diff * ease;
      requestAnimationFrame(step);
    };
    const handleWheel = (e) => {
      const delta = e.deltaY;
      const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const atTop = scrollContainer.scrollTop <= 0;
      const atBottom = scrollContainer.scrollTop >= maxScrollTop;
      if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const multiplier = 1;
      targetScroll = clamp(targetScroll + delta * multiplier);
      if (!ticking) requestAnimationFrame(step);
    };
    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollContainer.removeEventListener('wheel', handleWheel);
  }, []);

  /* ---------------- fields & init nameField (unchanged) ---------------- */
  const fields = useMemo(() => (filteredFeatures[0] ? Object.keys(filteredFeatures[0].properties) : []), [filteredFeatures]);
  const allFields = useMemo(() => (filteredFeatures[0] ? Object.keys(filteredFeatures[0].properties) : []), [filteredFeatures]);

  useEffect(() => {
    if (!filteredFeatures || filteredFeatures.length === 0) return;
    if (!nameField || nameField === '') {
      const flds = Object.keys(filteredFeatures[0].properties || {});
      if (flds.includes('Name')) setNameField('Name');
      else {
        const firstString = flds.find(f => typeof filteredFeatures[0].properties[f] === 'string');
        setNameField(firstString || flds[0] || '');
      }
    }
  }, [filteredFeatures, nameField, setNameField]);

  /* ---------------- chart & grouping (unchanged) ---------------- */
  const chartData = useMemo(
    () =>
      filteredFeatures.map(f => ({
        name: f.properties[nameField] || `فیچر ${f.properties?.mahalle_ID || 'نامشخص'}`,
        value: Number(f.properties[selectedField]) || 0,
        feature: f
      })),
    [filteredFeatures, selectedField, nameField]
  );

  const groupedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const groups = new Map();
    chartData.forEach(item => {
      const keyNum = Number(item.value);
      const keyStr = String(keyNum);
      if (!groups.has(keyStr)) {
        groups.set(keyStr, { value: keyNum, features: [], names: [], count: 0 });
      }
      const g = groups.get(keyStr);
      g.features.push(item.feature);
      g.names.push(item.name);
      g.count += 1;
    });
    const arr = Array.from(groups.entries()).map(([keyStr, obj]) => ({
      group: keyStr,
      value: obj.value,
      features: obj.features,
      names: obj.names,
      namesLabel: obj.names.join(', '),
      count: obj.count,
      firstName: obj.names && obj.names.length ? obj.names[0] : ''
    }));
    arr.sort((a, b) => a.value - b.value);
    return arr;
  }, [chartData]);

  const hasFeatures = useMemo(() => filteredFeatures.length > 0, [filteredFeatures]);

  /* ---------------- actions (unchanged) ---------------- */
  const applySymbology = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای نمادگذاری وجود ندارد');
      return;
    }
    if (!selectedField) {
      toast.error('فیلد برای نمادگذاری انتخاب نشده است');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      toast.success(`نمادگذاری با رنگ ${color} برای ${filteredFeatures.length} فیچر اعمال شد`);
      setIsProcessing(false);
    }, 500);
  }, [color, filteredFeatures, selectedField, hasFeatures]);

  const applyLabels = useCallback(() => {
    if (!hasFeatures) {
      toast.error('هیچ فیچری برای برچسب‌گذاری وجود ندارد');
      return;
    }
    if (!labelField) {
      toast.error('فیلد برچسب انتخاب نشده است');
      return;
    }
    setIsProcessing(true);
    setTimeout(() => {
      toast.success(`برچسب‌ها با فیلد ${labelField} برای ${filteredFeatures.length} فیچر اعمال شد`);
      setIsProcessing(false);
    }, 500);
  }, [labelField, filteredFeatures, hasFeatures]);

  const resetSettings = useCallback(() => {
    setSelectedField('Shape_Area');
    setColor('#4CAF50');
    setLabelField('Name');
    toast.info('تنظیمات ریست شد');
  }, [setSelectedField, setColor, setLabelField]);

  /* ---------------- tooltip & tickers (unchanged) ---------------- */
  const SimpleTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload || {};
    return (
      <div style={{
        background: '#1f2937',
        color: '#f9fafb',
        padding: 8,
        borderRadius: 6,
        fontSize: 13,
        minWidth: 80,
        textAlign: 'center'
      }}>
        <div style={{ fontWeight: 600 }}>مقدار</div>
        <div style={{ marginTop: 4 }}>{String(data.value)}</div>
      </div>
    );
  };

  const CustomTick = ({ x, y, payload }) => {
    const item = groupedChartData.find(d => String(d.group) === String(payload.value));
    const groupText = payload.value;
    const firstNameText = item ? item.firstName : '';
    return (
      <g transform={`translate(${x},${y + 4})`}>
        <text x={0} y={0} textAnchor="middle" fill="#6b7280" fontSize={12}>
          <tspan x="0" dy="0">{groupText}</tspan>
          {firstNameText ? <tspan x="0" dy="16" fontSize={11} fill="#9CA3AF">{firstNameText}</tspan> : null}
        </text>
      </g>
    );
  };

  const xFieldLabel = useMemo(() => {
    if (!xField) return '';
    const labelMap = { trafic: 'trafic' };
    return labelMap[xField] || xField;
  }, [xField]);

  const commonXVal = useMemo(() => {
    if (!modalData || !xField) return null;
    const vals = (modalData.features || []).map(f => {
      const p = f.properties || {};
      const v = p[xField];
      return v === undefined || v === null ? null : String(v);
    }).filter(v => v !== null);
    const unique = Array.from(new Set(vals));
    if (unique.length === 0) return '-';
    if (unique.length === 1) return unique[0];
    return 'متفاوت';
  }, [modalData, xField]);

  /* ---------------- bar click opens modal (set pos/size) ---------------- */
  const handleBarClick = (data, index, event) => {
    const payload = data?.payload;
    if (!payload) return;
    setModalData(payload);

    if (!isMobile) {
      // Desktop: center the modal
      const w = Math.max(MIN_WIDTH, Math.min(modalSize.width, MAX_WIDTH));
      const h = Math.max(MIN_HEIGHT, Math.min(modalSize.height, MAX_HEIGHT));
      setModalSize({ width: w, height: h });
      setModalPos({
        left: Math.max(12, (window.innerWidth - w) / 2),
        top: Math.max(12, (window.innerHeight - h) / 2)
      });
    }
    // For mobile, no position/size logic needed as it's handled by CSS/Style
    setModalOpen(true);
  };
  
    /* ---------------- drag handlers for modal ---------------- */
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setLastMouse({ x: e.clientX, y: e.clientY });
      setModalPos(prev => {
        const newLeft = Math.min(window.innerWidth - 40, Math.max(0, (prev.left ?? 0) + dx));
        const newTop = Math.min(window.innerHeight - 40, Math.max(0, (prev.top ?? 0) + dy));
        return { left: newLeft, top: newTop };
      });
    };

    const onMouseUp = () => {
      if (isDragging) setIsDragging(false);
      if (isResizing) setIsResizing(false);
    };
    if(!isMobile){
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('mouseleave', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseleave', onMouseUp);
    };
  }, [isDragging, lastMouse, isResizing, isMobile]);

  const startDrag = (e) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  /* ---------------- resize handlers for modal ---------------- */
  const startResize = (e) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const onResizeMove = (e) => {
      if (!isResizing) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setLastMouse({ x: e.clientX, y: e.clientY });
      setModalSize(prev => {
        let newW = prev.width + dx;
        let newH = prev.height + dy;
        newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newW));
        newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newH));
        return { width: newW, height: newH };
      });
    };

    const onResizeEnd = () => {
      if (isResizing) setIsResizing(false);
    };
    if(!isMobile){
      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', onResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
    };
  }, [isResizing, lastMouse, isMobile]);


  /* ---------------- keyboard Esc closes modal ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSize = () => {
    if (isMobile) return;
    setModalSize(prev => {
      if (prev.width <= 520) {
        const w = Math.min(900, MAX_WIDTH);
        const h = Math.min(520, MAX_HEIGHT);
        setModalPos(pos => ({
          left: Math.max(12, (window.innerWidth - w) / 2),
          top: Math.max(12, (window.innerHeight - h) / 2)
        }));
        return { width: w, height: h };
      } else {
        const w = 520, h = 320;
        setModalPos(pos => ({
          left: Math.max(12, (window.innerWidth - w) / 2),
          top: Math.max(12, window.innerHeight - h - 80)
        }));
        return { width: w, height: h };
      }
    });
  };

  /* ---------------- prevent body scroll while modal open ---------------- */
  useEffect(() => {
    if (modalOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [modalOpen]);

  // ... (main render of the page component is unchanged) ...
  /* ---------------- main render ---------------- */
  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 font-vazir">
        {isProcessing && (
          <div className="fixed top-4 right-4 z-[1002] bg-white dark:bg-gray-800 p-2 rounded-full shadow-lg">
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

        <div
          ref={scrollRef}
          className="max-w-10/10 mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 max-h-[80vh] overflow-y-scroll overflow-x-hidden custom-scrollbar"
        >
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">نقشه موضوعی</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              تعداد فیچرها: {filteredFeatures.length}
            </p>
          </div>

          {/* settings blocks (optimized for mobile) */}
          <motion.div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">تنظیمات نمادگذاری</h4>
            <div className="flex flex-col gap-4">
              <select
                value={selectedField}
                onChange={e => setSelectedField(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                aria-label="انتخاب فیلد برای نقشه موضوعی"
                disabled={!hasFeatures}
              >
                <option value="">انتخاب فیلد</option>
                {fields.map(field => <option key={field} value={field}>{field}</option>)}
              </select>
              <div className="flex w-full items-center gap-4">
                <div className="relative">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-12 h-12 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer" aria-label="انتخاب رنگ نمادگذاری" disabled={!hasFeatures} />
                  <SwatchIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 absolute -right-2 -top-2" />
                </div>
                <button onClick={applySymbology} disabled={isProcessing || !hasFeatures || !selectedField} className="flex-grow px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center" aria-label="اعمال نمادگذاری">
                  <SwatchIcon className="w-4 h-4 ml-2" /> اعمال نمادگذاری
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">تنظیمات برچسب‌گذاری</h4>
            <div className="flex flex-col gap-4">
              <select value={labelField} onChange={e => setLabelField(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="انتخاب فیلد برای برچسب‌گذاری" disabled={!hasFeatures}>
                <option value="">انتخاب فیلد برچسب</option>
                {fields.map(field => <option key={field} value={field}>{field}</option>)}
              </select>
              <button onClick={applyLabels} disabled={isProcessing || !hasFeatures || !labelField} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center" aria-label="اعمال برچسب‌ها">
                <TagIcon className="w-4 h-4 ml-2" /> اعمال برچسب‌ها
              </button>
            </div>
          </motion.div>

          <motion.div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            <button onClick={resetSettings} disabled={isProcessing || (!selectedField && !labelField && color === '#4CAF50')} className="w-full px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-md hover:from-gray-600 hover:to-gray-700 focus:ring-2 focus:ring-gray-500 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center" aria-label="ریست تنظیمات">
              <ArrowPathIcon className="w-4 h-4 ml-2" /> ریست تنظیمات
            </button>
          </motion.div>

          {hasFeatures ? (
            <motion.div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center mb-4">
                <label className="text-sm text-gray-700 dark:text-gray-300 mb-1 sm:mb-0">انتخاب فیلد نام:</label>
                <select value={nameField} onChange={e => setNameField(e.target.value)} className="w-full sm:w-auto p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" aria-label="انتخاب فیلد نام فیچر">
                  {allFields.map(field => <option key={field} value={field}>{field}</option>)}
                </select>
              </div>

              <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">نمایش نقشه موضوعی</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupedChartData}>
                  <XAxis dataKey="group" stroke="#6b7280" tick={<CustomTick />} height={50} />
                  <YAxis stroke="#6b7280" />
                  <Tooltip content={<SimpleTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="value"
                    fill={color}
                    onClick={(data, index, event) => handleBarClick(data, index, event)}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                نمایش گروه‌بندی‌شده بر اساس مقدار فیلد انتخابی — فیچرهایی که مقدار برابر دارند یک ستون مشترک دارند.
                <br />
                برای دیدن جزئیات (تعداد و لیست فیچرها) روی ستون مورد نظر کلیک کنید.
              </div>
            </motion.div>
          ) : (
            <motion.p className="text-sm text-red-600 dark:text-red-400 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              هیچ فیچری برای نمایش نقشه موضوعی وجود ندارد
            </motion.p>
          )}
        </div>
      </div>


      {/* ------------------ MODAL (Portal) - Now Responsive ------------------ */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {modalOpen && modalData && (
            <>
              {/* Overlay - Darker for better focus */}
              <motion.div
                onClick={() => setModalOpen(false)}
                className="fixed inset-0 bg-black/40 z-[1999]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />

              {/* Modal Content */}
              <motion.div
                key="group-modal"
                className="fixed z-[2000] pointer-events-auto"
                // --- Responsive Animation ---
                initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
                animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
                exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                // --- Responsive Styling ---
                style={isMobile ? {
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '85vh',
                } : {
                  left: modalPos.left,
                  top: modalPos.top,
                  width: modalSize.width,
                  height: modalSize.height,
                }}
              >
                <div
                  className={`relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden w-full h-full flex flex-col
                    ${isMobile ? 'rounded-t-2xl' : 'rounded-lg shadow-xl'}`} // <-- Responsive border radius
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div
                    onMouseDown={startDrag}
                    className={`px-4 py-3 flex items-center justify-between bg-gray-100 dark:bg-gray-900/40 shrink-0
                      ${!isMobile ? 'cursor-move' : ''}`} // <-- Conditional cursor
                    style={{ userSelect: 'none' }}
                  >
                    <div>
                      <div className="text-base font-semibold text-gray-800 dark:text-gray-100">جزئیات گروه</div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-4 mt-1">
                        <span>مقدار: <strong>{String(modalData.value)}</strong></span>
                        {xField && <span>{xFieldLabel}: <strong>{commonXVal ?? '-'}</strong></span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                      {!isMobile && ( // <-- Hide on mobile
                        <button onClick={toggleSize} title="کوچک/بزرگ" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          <ArrowsPointingOutIcon className="w-5 h-5" />
                        </button>
                      )}
                      <button onClick={() => setModalOpen(false)} title="بستن" className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 flex-1 overflow-y-auto bg-white dark:bg-gray-800 text-sm">
                    <div className="mb-3 text-gray-700 dark:text-gray-200">تعداد فیچرها: <strong>{modalData.count ?? 0}</strong></div>
                    <div className="space-y-3">
                      {modalData.features?.length > 0 ? modalData.features.map((feat, i) => {
                        const props = feat.properties || {};
                        const xVal = xField ? String(props[xField] ?? '-') : null;
                        const yVal = String(props[selectedField] ?? '-');
                        const displayName = props[nameField] ?? `فیچر ${i + 1}`;
                        return (
                          // --- Responsive list item ---
                          <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-200 dark:border-gray-700 last:border-b-0 pb-3 gap-1">
                            <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{displayName}</div>
                            <div className="text-gray-600 dark:text-gray-300 whitespace-nowrap text-left sm:text-right shrink-0">
                              {xField && <span className="ml-4">{xFieldLabel}: <strong>{xVal}</strong></span>}
                              <span>{selectedField}: <strong>{yVal}</strong></span>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="text-gray-500 dark:text-gray-400">هیچ فیچری یافت نشد</div>
                      )}
                    </div>
                  </div>

                  {/* Footer (Resize Handle) */}
                  {!isMobile && ( // <-- Hide on mobile
                    <div className="h-6 flex items-center justify-end px-2 bg-gray-50 dark:bg-gray-900/30 shrink-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mr-auto pl-2">قابل جابه‌جایی و تغییر اندازه</div>
                      <div
                        onMouseDown={startResize}
                        className="w-5 h-5 cursor-se-resize rounded-sm flex items-center justify-center"
                        title="تغییر اندازه"
                        style={{ userSelect: 'none' }}
                      >
                         <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-gray-500 dark:text-gray-300">
                           <path d="M14 16V9.5a.5.5 0 0 0-1 0V14h-4.5a.5.5 0 0 0 0 1H14a.5.5 0 0 0 .5-.5zM2 0v6.5a.5.5 0 0 0 1 0V2h4.5a.5.5 0 0 0 0-1H2a.5.5 0 0 0-.5.5z"/>
                         </svg>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default React.memo(VisualMapping);