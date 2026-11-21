// FeatureFilter.jsx (اصلاح‌شده)
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import * as turf from '@turf/turf';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { motion } from 'framer-motion';
import { FunnelIcon, MapPinIcon, ArrowPathIcon, CursorArrowRippleIcon, ChevronRightIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';

/**
 props:
  - layers: array of layer objects
  - onFilter: function(filteredFeatures)
  - map: leaflet map instance (useMap پاس داده شود)
*/

const FeatureFilter = ({ layers = [], onFilter, map }) => {
  const [filterValues, setFilterValues] = useState({});
  const [operators, setOperators] = useState({});
  const [spatialFilter, setSpatialFilter] = useState({ type: null, params: { radius: 100 } });
  const [definitionQuery, setDefinitionQuery] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVisible, setIsVisible] = useState(true); // <-- state جدید برای کنترل نمایش

  // اندازه و موقعیت پنل
  const [boxSize, setBoxSize] = useState({ width: 420, height: 520 });
  const [boxPos, setBoxPos] = useState(() => ({ left: 64, top: 30 }));

  // حالت mount: داخل DOM نقشه یا بیرون (portal)
  const [mountInsideMap, setMountInsideMap] = useState(false);

  // drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragLast = useRef({ x: 0, y: 0 });
  const currentPosRef = useRef({ left: 64, top: 30 }); // ref برای موقعیت موقت درگ (smooth)

  // محدودیت اندازه
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 300;
  const MAX_WIDTH = 900;
  const MAX_HEIGHT = 900;

  const spatialFilterRef = useRef(spatialFilter);
  useEffect(() => { spatialFilterRef.current = spatialFilter; }, [spatialFilter]);

  const boxRef = useRef(null);
  const spatialDropdownRef = useRef(null);
  const overlayRef = useRef(null);

  /* ------------------ sync ref با state در شروع ------------------ */
  useEffect(() => {
    currentPosRef.current = { ...boxPos };
  }, [boxPos]);

  /* ------------------ وقتی پنل mount میشه: نقشه نباید pan بشه ------------------ */
  useEffect(() => {
    if (!map) return;
    try { map.dragging && map.dragging.disable && map.dragging.disable(); } catch (e) {}
    return () => {
      try { map.dragging && map.dragging.enable && map.dragging.enable(); } catch (e) {}
    };
  }, [map]);

  /* وقتی کاربر در حال درگ پنل است، مطمئن شو نقشه پَنگ نمی‌شود */
  useEffect(() => {
    if (!map) return;
    try {
      if (isDragging) map.dragging && map.dragging.disable && map.dragging.disable();
      else map.dragging && map.dragging.enable && map.dragging.enable();
    } catch (e) {}
  }, [isDragging, map]);

  /* ------------------ geoman controls و handlers ------------------ */
  useEffect(() => {
    if (!map || !map.pm) return;
    try {
      map.pm.addControls({
        position: 'topleft',
        drawMarker: true,
        drawPolygon: true,
        drawCircle: true,
        drawRectangle: true,
        editMode: false,
        removalMode: false,
        dragMode: false,
      });
    } catch (err) { /* ignore */ }

    const handleDrawCreate = (e) => {
      const geometry = e.layer?.toGeoJSON?.()?.geometry;
      if (!geometry) {
        try { map.removeLayer(e.layer); } catch (err) {}
        toast.error('هندسه نامعتبر است!');
        return;
      }

      const currentFilter = spatialFilterRef.current || {};
      if (currentFilter.type === 'distance' && geometry.type === 'Point') {
        const nxt = { ...currentFilter, params: { ...currentFilter.params, center: geometry } };
        setSpatialFilter(nxt);
        spatialFilterRef.current = nxt;
        toast.success('مرکز انتخاب شد!');
      } else if (
        (currentFilter.type === 'within' || currentFilter.type === 'within_rectangle') &&
        (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
      ) {
        const nxt = { ...currentFilter, params: { ...currentFilter.params, geometry } };
        setSpatialFilter(nxt);
        spatialFilterRef.current = nxt;
        toast.success('محدوده انتخاب شد!');
      }

      try { map.pm.disableDraw(); } catch (err) {}
      try { map.removeLayer(e.layer); } catch (err) {}
    };

    const handleMapClick = (e) => {
      if (spatialFilterRef.current.type !== 'select_from_map') return;

      const activeLayer = layers.find(layer => layer.visible);
      if (!activeLayer) {
        toast.error('لطفاً یک لایه فعال کنید!');
        return;
      }

      const features = activeLayer.data?.features || [];
      const clickPoint = turf.point([e.latlng.lng, e.latlng.lat]);

      const matchingFeatures = features
        .map((feature, index) => {
          if (!feature.geometry) return null;
          const featureGeom = turf.feature(feature.geometry);
          try {
            if (featureGeom.geometry.type === 'Point') {
              const featurePoint = turf.point(featureGeom.geometry.coordinates);
              const distance = turf.distance(clickPoint, featurePoint, { units: 'meters' });
              if (distance < 10) {
                return { feature, index, zIndex: feature.properties?.zIndex || index };
              }
            } else if (turf.booleanPointInPolygon(clickPoint, featureGeom)) {
              return { feature, index, zIndex: feature.properties?.zIndex || index };
            }
            return null;
          } catch (err) {
            return null;
          }
        })
        .filter(f => f !== null);

      if (matchingFeatures.length > 0) {
        setIsProcessing(true);
        try {
          const selectedFeature = matchingFeatures.reduce((prev, curr) =>
            (prev.zIndex || 0) > (curr.zIndex || 0) ? prev : curr
          ).feature;

          onFilter([selectedFeature]);
          toast.success(`فیچر "${selectedFeature.properties?.Name || 'نامشخص'}" انتخاب شد!`);
          setSpatialFilter({ type: null, params: { radius: 100 } });
          spatialFilterRef.current = { type: null, params: { radius: 100 } };
          toast.info('حالت انتخاب فیچر غیرفعال شد.');
        } catch (err) {
          toast.error('خطا در انتخاب فیچر');
        } finally {
          setIsProcessing(false);
          // بعد از انتخاب از روی نقشه، پنل را دوباره به حالت portal ببریم
          setMountInsideMap(false);
        }
      } else {
        toast.warn('هیچ فیچری در این مکان یافت نشد!');
      }
    };

    map.on('pm:create', handleDrawCreate);
    map.on('click', handleMapClick);

    return () => {
      map.off('pm:create', handleDrawCreate);
      map.off('click', handleMapClick);
      try { map.pm.removeControls(); } catch (err) {}
    };
  }, [map, layers, onFilter]);

  /* ------------------ helpers ------------------ */
  const activeLayer = useMemo(() => {
    const active = layers.filter(layer => layer.visible);
    return active.length === 1 ? active[0] : null;
  }, [layers]);

  const fields = useMemo(() => {
    if (!activeLayer) return [];
    const all = (activeLayer.data?.features || []).flatMap(f => Object.keys(f.properties || {}));
    return Array.from(new Set(all));
  }, [activeLayer]);

  const spatialOptions = useMemo(() => [
    { value: '', label: 'هیچکدام' },
    { value: 'within', label: 'داخل محدوده' },
    { value: 'within_rectangle', label: 'داخل مستطیل' },
    { value: 'distance', label: 'فاصله کمتر از' },
    { value: 'select_from_map', label: 'انتخاب از روی نقشه' },
  ], []);

  const normalizeDigits = useCallback((s = '') =>
    String(s)
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '0123456789'[parseInt(d)]),
  [],);

  const getPropValue = useCallback((feature, key) => {
    const props = feature.properties || {};
    if (key.toLowerCase() === 'id') {
      const idKey = Object.keys(props).find(k => k.toLowerCase() === 'id');
      return idKey ? props[idKey] : feature.id ?? props.id;
    }
    const foundKey = Object.keys(props).find(k => k.toLowerCase() === key.toLowerCase());
    return foundKey ? props[foundKey] : props[key];
  }, []);

  const matchesValue = useCallback((propRaw, valueStr, operator) => {
    if (valueStr == null || valueStr === '') return true;
    const values = String(valueStr)
      .split(',')
      .map(v => normalizeDigits(v).trim())
      .filter(v => v !== '');
    if (values.length === 0) return true;

    const propCandidates = Array.isArray(propRaw) ? propRaw : [propRaw];
    for (const pc of propCandidates) {
      const pcNorm = normalizeDigits(pc == null ? '' : String(pc)).trim();
      for (const v of values) {
        if (operator === 'range') {
          if (/^\s*-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?\s*$/.test(v)) {
            const [start, end] = v.split('-').map(x => Number(x.trim()));
            const pNum = Number(pcNorm);
            if (!Number.isNaN(pNum) && !Number.isNaN(start) && !Number.isNaN(end)) {
              if (pNum >= Math.min(start, end) && pNum <= Math.max(start, end)) return true;
            }
          }
          continue;
        }
        const vNum = Number(v);
        const pNum = Number(pcNorm);
        switch (operator) {
          case 'equals':
            if (!Number.isNaN(vNum) && !Number.isNaN(pNum)) {
              if (vNum === pNum) return true;
            } else if (pcNorm.toLowerCase() === v.toLowerCase()) return true;
            break;
          case 'greater':
            if (!Number.isNaN(vNum) && !Number.isNaN(pNum) && pNum > vNum) return true;
            break;
          case 'less':
            if (!Number.isNaN(vNum) && !Number.isNaN(pNum) && pNum < vNum) return true;
            break;
          case 'like':
            if (pcNorm.toLowerCase().includes(v.toLowerCase())) return true;
            break;
          case 'in':
            if (values.some(val => pcNorm.toLowerCase() === val.toLowerCase())) return true;
            break;
          case 'not_in':
            if (!values.some(val => pcNorm.toLowerCase() === val.toLowerCase())) return true;
            break;
          default:
            break;
        }
      }
    }
    return operator === 'not_in';
  }, [normalizeDigits]);

  const geomToFeature = useCallback((geom) => {
    try { return turf.feature(geom); } catch (err) {
      if (geom && geom.type && geom.coordinates) return { type: 'Feature', geometry: geom, properties: {} };
      return null;
    }
  }, []);

  const applySpatialFilter = useCallback((feature) => {
    if (!spatialFilter.type) return true;
    if (!feature || !feature.geometry) return false;
    const featureFeat = geomToFeature(feature.geometry);
    if (!featureFeat) return false;
    const params = spatialFilter.params || {};
    switch (spatialFilter.type) {
      case 'within':
      case 'within_rectangle':
        if (!params.geometry) return false;
        {
          const polyFeat = geomToFeature(params.geometry);
          if (!polyFeat) return false;
          try { return turf.booleanWithin(featureFeat, polyFeat); } catch (err) { return false; }
        }
      case 'distance':
        if (!params.center || params.radius == null) return false;
        try {
          const centerPt = turf.point(params.center.coordinates);
          const centroid = turf.centroid(featureFeat);
          const dist = turf.distance(centroid, centerPt, { units: 'meters' });
          return dist <= Number(params.radius);
        } catch (err) { return false; }
      case 'select_from_map':
        return true;
      default:
        return true;
    }
  }, [spatialFilter, geomToFeature]);

  /* ------------------ کنترل چرخ موس در پنل ------------------ */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const handleWheel = (e) => {
      e.stopPropagation();
      box.scrollTop += e.deltaY;
      e.preventDefault && e.preventDefault();
    };
    box.addEventListener('wheel', handleWheel, { passive: false });
    return () => box.removeEventListener('wheel', handleWheel);
  }, []);

  /* ------------------ درگ پنل (اصلاح‌شده برای smooth) ------------------ */
  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging || !boxRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
      const dx = clientX - dragLast.current.x;
      const dy = clientY - dragLast.current.y;

      // به‌روزرسانی ref موقت
      currentPosRef.current.left += dx;
      currentPosRef.current.top += dy;

      // اعمال مستقیم transform روی DOM (بدون re-render)
      const newLeft = Math.max(0, Math.min(window.innerWidth - boxSize.width - 40, currentPosRef.current.left));
      const newTop = Math.max(0, Math.min(window.innerHeight - boxSize.height - 40, currentPosRef.current.top));
      boxRef.current.style.transform = `translate(${newLeft - boxPos.left}px, ${newTop - boxPos.top}px)`;

      dragLast.current = { x: clientX, y: clientY };
    };

    const onUp = (e) => {
      if (isDragging) {
        e && e.stopPropagation && e.stopPropagation();
        // commit موقعیت نهایی به state (فقط یک re-render)
        const finalLeft = Math.max(0, Math.min(window.innerWidth - boxSize.width - 40, currentPosRef.current.left));
        const finalTop = Math.max(0, Math.min(window.innerHeight - boxSize.height - 40, currentPosRef.current.top));
        setBoxPos({ left: finalLeft, top: finalTop });
        currentPosRef.current = { left: finalLeft, top: finalTop };
        // reset transform
        if (boxRef.current) {
          boxRef.current.style.transform = '';
        }
        setIsDragging(false);
      }
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
  }, [isDragging, boxSize.width, boxSize.height, boxPos.left, boxPos.top]);

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!boxRef.current) return;
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
    dragLast.current = { x: clientX, y: clientY };
    // sync ref با موقعیت فعلی state
    currentPosRef.current = { ...boxPos };
    // reset transform در شروع
    boxRef.current.style.transform = '';
    setIsDragging(true);
  };

  /* ------------------ تغییر نوع فیلتر مکانی ------------------ */
  const handleSpatialFilterChange = useCallback((type, params = {}) => {
    try { map?.pm?.disableDraw(); } catch (err) {}
    const newSF = { type, params: { ...(spatialFilter.params || { radius: 100 }), ...params } };
    setSpatialFilter(newSF);
    spatialFilterRef.current = newSF;

    // وقتی کاربر یک spatial filter انتخاب می‌کند، موقتاً پنل را داخل DOM نقشه mount کن
    if (type) setMountInsideMap(true);

    if (type === 'select_from_map') {
      toast.info('لطفاً روی یک فیچر در نقشه کلیک کنید.');
    } else if (type === 'within') {
      toast.info('لطفاً یک پلی‌گان یا دایره روی نقشه رسم کنید.');
      try { map?.pm?.enableDraw('Polygon'); } catch (err) {}
    } else if (type === 'within_rectangle') {
      toast.info('لطفاً یک مستطیل روی نقشه رسم کنید.');
      try { map?.pm?.enableDraw('Rectangle'); } catch (err) {}
    } else if (type === 'distance') {
      toast.info('لطفاً یک نقطه روی نقشه انتخاب کنید.');
      try { map?.pm?.enableDraw('Marker'); } catch (err) {}
    } else {
      try { map?.pm?.disableDraw(); } catch (err) {}
    }
  }, [map, spatialFilter.params]);

  /* ------------------ اعمال فیلتر ------------------ */
  const handleSubmit = useCallback(() => {
    if (!activeLayer) {
      const activeCount = layers.filter(l => l.visible).length;
      toast.error(activeCount === 0 ? 'لطفاً یک لایه را فعال کنید!' : 'فقط یک لایه باید فعال باشد!');
      return;
    }
    if (spatialFilter.type === 'select_from_map') {
      toast.info('لطفاً یک فیچر از روی نقشه انتخاب کنید.');
      return;
    }
    setIsProcessing(true);
    try {
      const features = activeLayer.data?.features || [];
      const filteredFeatures = features.filter((feature) => {
        for (const [key, value] of Object.entries(filterValues)) {
          if (value === '' || value == null) continue;
          const prop = getPropValue(feature, key);
          if (prop === undefined) return false;
          if (!matchesValue(prop, value, operators[key] || 'equals')) return false;
        }
        return applySpatialFilter(feature);
      });

      if (filteredFeatures.length === 0) {
        const missingFields = Object.keys(filterValues).filter(key => {
          return !features.some(f => getPropValue(f, key) !== undefined);
        });
        toast.warn(
          missingFields.length > 0
            ? `فیلدهای ${missingFields.join(', ')} در داده‌ها وجود ندارند.`
            : 'هیچ فیچری با معیارهای وارد شده یافت نشد.'
        );
      } else {
        toast.success(`${filteredFeatures.length} فیچر پیدا شد.`);
      }

      if (typeof onFilter === 'function') onFilter(filteredFeatures);
    } catch (err) {
      console.error('خطا در اعمال فیلتر:', err);
      toast.error(`خطا در اعمال فیلتر: ${err.message}`);
    } finally {
      setIsProcessing(false);
      // بعد از فیلتر کردن، پنل را دوباره به حالت portal (خارج از DOM نقشه) برگردان
      setMountInsideMap(false);
    }
  }, [activeLayer, filterValues, operators, layers, onFilter, getPropValue, matchesValue, applySpatialFilter, spatialFilter.type]);

  const handleClearAll = () => {
    setFilterValues({});
    setOperators({});
    setSpatialFilter({ type: null, params: { radius: 100 } });
    if (typeof onFilter === 'function') onFilter([]);
    try { map?.pm?.disableDraw(); } catch (e) {}
    toast.info('فیلترها پاک شدند.');
    // برگشت به portal
    setMountInsideMap(false);
  };

  const handleSaveDefinitionQuery = useCallback(() => {
    setDefinitionQuery({ filterValues, operators, spatialFilter });
    toast.success('فیلتر به‌عنوان Definition Query ذخیره شد.');
  }, [filterValues, operators, spatialFilter]);

  useEffect(() => {
    if (definitionQuery && activeLayer && definitionQuery.spatialFilter.type !== 'select_from_map') {
      setIsProcessing(true);
      try {
        const features = activeLayer.data?.features || [];
        const filtered = features.filter((feature) => {
          for (const [key, value] of Object.entries(definitionQuery.filterValues)) {
            if (value === '' || value == null) continue;
            const prop = getPropValue(feature, key);
            if (prop === undefined) return false;
            if (!matchesValue(prop, value, definitionQuery.operators[key] || 'equals')) return false;
          }
          const orig = spatialFilter;
          setSpatialFilter(definitionQuery.spatialFilter);
          const res = applySpatialFilter(feature);
          setSpatialFilter(orig);
          return res;
        });
        if (typeof onFilter === 'function') onFilter(filtered);
      } catch (err) {
        console.error('خطا در اعمال Definition Query:', err);
        toast.error(`خطا در اعمال Definition Query: ${err.message}`);
      } finally {
        setIsProcessing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitionQuery, activeLayer, onFilter]);

  /* ------------------ container styling: fixed (outside) vs absolute (داخل) + transform support ------------------ */
  const containerStyle = mountInsideMap
    ? {
        position: 'absolute',
        left: boxPos.left,
        top: boxPos.top,
        zIndex: 1001,
        width: boxSize.width,
        height: boxSize.height,
        touchAction: 'none',
        transform: 'translate(0px, 0px)', // برای smooth drag
        transition: 'none' // بدون transition در درگ
      }
    : {
        position: 'fixed',
        left: boxPos.left,
        top: boxPos.top,
        zIndex: 1001,
        width: boxSize.width,
        height: boxSize.height,
        touchAction: 'none',
        transform: 'translate(0px, 0px)', // برای smooth drag
        transition: 'none' // بدون transition در درگ
      };

  /* ------------------ render (portal conditional) ------------------ */
  const panelJSX = (
    <>
      {/* overlay (only when visible) */}
      {isVisible && (
        <div
          ref={overlayRef}
          style={{
            position: mountInsideMap ? 'absolute' : 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'transparent',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); }}
        />
      )}

      {isVisible ? (
        <div className="transition-all duration-300" style={containerStyle}>
          <Resizable
            width={boxSize.width}
            height={boxSize.height}
            onResize={(e, data) => {
              const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(data.size.width)));
              const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(data.size.height)));
              setBoxSize({ width: w, height: h });
              setBoxPos(prev => {
                const maxLeft = Math.max(12, window.innerWidth - w - 12);
                const maxTop = Math.max(12, window.innerHeight - h - 12);
                return { left: Math.min(prev.left, maxLeft), top: Math.min(prev.top, maxTop) };
              });
            }}
            minConstraints={[MIN_WIDTH, MIN_HEIGHT]}
            maxConstraints={[MAX_WIDTH, MAX_HEIGHT]}
            resizeHandles={['se']}
          >
            <motion.div
              ref={boxRef}
              className="bg-gray-900 border border-gray-700 p-4 rounded-xl shadow-2xl w-full h-full overflow-hidden flex flex-col gap-4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.12 }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onTouchStart={(e) => { e.stopPropagation(); }}
              style={{ willChange: 'transform' }} // بهینه‌سازی برای smooth drag
            >
              <div
                className="flex justify-between items-center pb-2 border-b border-gray-800 cursor-move"
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                style={{ userSelect: 'none' }}
              >
                <div className="flex items-center gap-2">
                  <FunnelIcon className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-lg font-semibold text-cyan-300 select-none">فیلتر فیچرها</h4>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400 select-none">
                    فیچرها: {activeLayer?.data?.features?.length || 0} | فیلدها: {fields.length}
                  </p>
                  <button
                    onClick={() => setIsVisible(false)}
                    className="text-gray-500 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700"
                    title="مخفی کردن پنل"
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto pr-1" style={{ fontSize: 13 }}>
                {/* Attribute Filters */}
                <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 mb-3">
                  <div className="flex items-center gap-2 mb-3 text-sm text-cyan-200">
                    <FunnelIcon className="w-4 h-4" />
                    <div className="font-medium">فیلتر بر اساس ویژگی‌ها</div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                    {fields.map(key => (
                      <div key={key} className="space-y-2 mb-3">
                        <label className="block text-xs font-medium text-gray-300">{key}:</label>
                        <div className="relative">
                          <select
                            value={operators[key] || 'equals'}
                            onChange={e => setOperators(prev => ({ ...prev, [key]: e.target.value }))}
                            className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
                            disabled={isProcessing}
                          >
                            <option value="equals">=</option>
                            <option value="greater">&gt;</option>
                            <option value="less">&lt;</option>
                            <option value="like">LIKE</option>
                            <option value="in">IN</option>
                            <option value="not_in">NOT IN</option>
                            <option value="range">بازه</option>
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <FunnelIcon className="w-4 h-4 text-gray-500" />
                          </div>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={filterValues[key] || ''}
                            onChange={e => setFilterValues(prev => ({ ...prev, [key]: normalizeDigits(e.target.value).trim() }))}
                            className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-gray-500"
                            placeholder={`مثال: 29,36 یا 20-30`}
                            disabled={isProcessing}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <FunnelIcon className="w-4 h-4 text-gray-500" />
                          </div>
                        </div>
                      </div>
                    ))}

                    {!fields.includes('id') && (
                      <div className="space-y-2 mb-3">
                        <label className="block text-xs font-medium text-gray-300">ID:</label>
                        <div className="relative">
                          <select
                            value={operators['id'] || 'equals'}
                            onChange={e => setOperators(prev => ({ ...prev, id: e.target.value }))}
                            className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
                            disabled={isProcessing}
                          >
                            <option value="equals">=</option>
                            <option value="in">IN</option>
                            <option value="not_in">NOT IN</option>
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <FunnelIcon className="w-4 h-4 text-gray-500" />
                          </div>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={filterValues['id'] || ''}
                            onChange={e => setFilterValues(prev => ({ ...prev, id: normalizeDigits(e.target.value).trim() }))}
                            className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-gray-500"
                            placeholder="مثال: 29,36"
                            disabled={isProcessing}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <FunnelIcon className="w-4 h-4 text-gray-500" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Spatial Filters (select) */}
                <div className="p-3 bg-gray-800/40 rounded-lg border border-gray-700 mb-3">
                  <div className="flex items-center gap-2 mb-3 text-sm text-cyan-200">
                    <MapPinIcon className="w-4 h-4" />
                    <div className="font-medium">فیلتر بر اساس ترسیم</div>
                  </div>

                  <div ref={spatialDropdownRef} className="relative mb-2" onClick={(e) => e.stopPropagation()}>
                    <label htmlFor="spatial-select" className="sr-only">نوع فیلتر مکانی</label>
                    <select
                      id="spatial-select"
                      value={spatialFilter.type || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleSpatialFilterChange(val);
                      }}
                      className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 flex justify-between items-center focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                      disabled={isProcessing}
                      aria-label="انتخاب فیلتر مکانی"
                    >
                      {spatialOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {spatialFilter.type === 'distance' && (
                    <div className="space-y-2 mt-2">
                      <div className="relative">
                        <input
                          type="number"
                          value={spatialFilter.params.radius || 100}
                          onChange={e => {
                            const newSF = { ...spatialFilter, params: { ...(spatialFilter.params || {}), radius: Number(e.target.value) || 100 } };
                            setSpatialFilter(newSF);
                            spatialFilterRef.current = newSF;
                          }}
                          min="1"
                          className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          disabled={isProcessing}
                        />
                        <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs">متر</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info('لطفاً یک نقطه روی نقشه انتخاب کنید.');
                          try { map?.pm?.enableDraw('Marker'); } catch (err) {}
                        }}
                        className="w-full p-2 bg-gradient-to-r from-cyan-600 to-teal-600  text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                        disabled={isProcessing}
                      >
                        <MapPinIcon className="w-4 h-4 inline ml-1" />
                        انتخاب مرکز
                      </button>
                    </div>
                  )}

                  {spatialFilter.type === 'within' && (
                    <div className="mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info('لطفاً یک پلی‌گان یا دایره رسم کنید.');
                          try { map?.pm?.enableDraw('Polygon'); } catch (err) {}
                        }}
                        className="w-full p-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                        disabled={isProcessing}
                      >
                        <MapPinIcon className="w-4 h-4 inline ml-1" />
                        رسم محدوده
                      </button>
                    </div>
                  )}

                  {spatialFilter.type === 'within_rectangle' && (
                    <div className="mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info('لطفاً یک مستطیل رسم کنید.');
                          try { map?.pm?.enableDraw('Rectangle'); } catch (err) {}
                        }}
                        className="w-full p-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                        disabled={isProcessing}
                      >
                        <MapPinIcon className="w-4 h-4 inline ml-1" />
                        رسم مستطیل
                      </button>
                    </div>
                  )}

                  {spatialFilter.type === 'select_from_map' && (
                    <div className="mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toast.info('روی یک فیچر کلیک کنید.'); }}
                        className="w-full p-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
                        disabled={isProcessing}
                      >
                        <CursorArrowRippleIcon className="w-4 h-4 inline ml-1" />
                        انتخاب فیچر
                      </button>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-gray-800 mt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSubmit(); setIsVisible(false);}}
                      disabled={isProcessing || !activeLayer}
                      className="flex-1 p-2 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <FunnelIcon className="w-4 h-4" />
                      فیلتر
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClearAll(); }}
                      className="flex-1 p-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition flex items-center justify-center gap-1"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      پاک کردن
                    </button>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveDefinitionQuery(); }}
                      className="hidden flex-1 p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition text-sm"
                    >
                      ذخیره به‌عنوان Definition Query
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </Resizable>
        </div>
      ) : (
        <motion.button
          onClick={() => setIsVisible(true)}
          className="fixed top-160 left-1 z-[1002] w-8 h-16 bg-gray-900/80 backdrop-blur-sm text-white rounded-r-lg flex items-center justify-center shadow-lg border-y border-r border-gray-700 hover:bg-gray-800 transition-colors"
          style={{ transform: 'translateY(-50%)' }}
          title="نمایش پنل فیلتر"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </motion.button>
      )}
    </>
  );

  return mountInsideMap ? panelJSX : createPortal(panelJSX, document.body);
};

export default React.memo(FeatureFilter);