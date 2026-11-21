import React, { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/solid';
import StatisticalAnalysis from './PostFilterComponents/StatisticalAnalysis';
import DataEditing from './PostFilterComponents/DataEditing';
import DataExport from './PostFilterComponents/DataExport';
import SpatialAnalysis from './PostFilterComponents/SpatialAnalysis';
import VisualMapping from './PostFilterComponents/VisualMapping';
import NetworkAnalysis from './PostFilterComponents/NetworkAnalysis';
import DataJoining from './PostFilterComponents/DataJoining';
import AdvancedModeling from './PostFilterComponents/AdvancedModeling';

// Tabs.optimized.jsx
// شامل بهینه‌سازی‌های اسکرول: سبک‌های سفارشی، شانس استفاده از smooth بومی برای دستگاه‌های لمسی، و
// یک پیاده‌سازی requestAnimationFrame برای اسکرول نرم و پیوسته روی رویداد wheel (ویندوز/لینوکس).

const Tabs = ({ filteredFeatures, activeLayerName, onRefresh, layers, setAnalysisResult, setFilteredFeatures }) => {
  const [spatialBufferRadius, setSpatialBufferRadius] = useState(1000);
  const [spatialSelectedLayer, setSpatialSelectedLayer] = useState('');
  const [statsNameField, setStatsNameField] = useState('Name');
  const [statsValueField, setStatsValueField] = useState('Shape_Area');
  const [networkStartPoint, setNetworkStartPoint] = useState('');
  const [networkEndPoint, setNetworkEndPoint] = useState('');
  const [networkServiceRadius, setNetworkServiceRadius] = useState(1000);
  const [networkStartNameField, setNetworkStartNameField] = useState('Name');
  const [networkEndNameField, setNetworkEndNameField] = useState('Name');
  const [activeTab, setActiveTab] = useState('stats');
  const [isTabOpen, setIsTabOpen] = useState(true);
  const userTools = JSON.parse(localStorage.getItem('tools') || '[]');
  const [editedProperties, setEditedProperties] = useState({});
  const [fieldFormula, setFieldFormula] = useState('');
  const [selectedField, setSelectedField] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchField, setSearchField] = useState('');
  const [groupByField, setGroupByField] = useState('Name');
  const [colorMode, setColorMode] = useState('uniform');
  const [colorField, setColorField] = useState('');
  const [visualSelectedField, setVisualSelectedField] = useState('Shape_Area');
  const [visualColor, setVisualColor] = useState('#4CAF50');
  const [visualLabelField, setVisualLabelField] = useState('Name');
  const [visualNameField, setVisualNameField] = useState('Name');
  const [bufferRadius, setBufferRadius] = useState(1000);
  const [modelSteps, setModelSteps] = useState(['buffer', 'intersect']);
  const [modelResult, setModelResult] = useState([]);
  const [showMap, setShowMap] = useState(true);
  const [featureColors, setFeatureColors] = useState({});
  const [categoryColors, setCategoryColors] = useState({});
  const [filters, setFilters] = useState({});
  const [expandedSections, setExpandedSections] = useState({
    modelSettings: true,
    categoryColors: false,
    filters: true,
    featureColors: false,
  });

  const scrollRef = useRef(null);
  const rafRef = useRef(null);
  const targetScrollRef = useRef(0);
  const currentScrollRef = useRef(0);
  const isRunningRef = useRef(false);
  const touchStartYRef = useRef(null);

  // inject small CSS for custom scrollbar + overscroll behaviour
  useEffect(() => {
    const styleId = 'tabs-optimized-scroll-style';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      .tabs-optimized-scroll {
        -webkit-overflow-scrolling: touch; /* smooth scrolling on iOS */
        overscroll-behavior: contain;   /* avoid body/page scroll on edges */
        scroll-behavior: smooth; /* native smooth for non-wheel interactions */
        will-change: transform; /* hint to browser to use GPU */
      }
      .tabs-optimized-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .tabs-optimized-scroll::-webkit-scrollbar-thumb { background: rgba(100,100,100,0.45); border-radius: 6px; }
      .tabs-optimized-scroll::-webkit-scrollbar-track { background: transparent; }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;

    // initialize refs
    targetScrollRef.current = sc.scrollTop;
    currentScrollRef.current = sc.scrollTop;

    // LERP factor controls smoothness (0..1). Lower => smoother & slower.
    const LERP = 0.5;

    const clampTarget = (v) => {
      const max = sc.scrollHeight - sc.clientHeight;
      if (v < 0) return 0;
      if (v > max) return max;
      return v;
    };

    const step = () => {
      const target = targetScrollRef.current;
      let current = currentScrollRef.current;
      const delta = target - current;
      if (Math.abs(delta) < 0.5) {
        // small enough -> snap and stop
        sc.scrollTop = target;
        currentScrollRef.current = target;
        isRunningRef.current = false;
        rafRef.current = null;
        return;
      }
      current += delta * LERP;
      sc.scrollTop = current;
      currentScrollRef.current = current;
      rafRef.current = requestAnimationFrame(step);
    };

    const startRafIfNeeded = () => {
      if (!isRunningRef.current) {
        isRunningRef.current = true;
        rafRef.current = requestAnimationFrame(step);
      }
    };

    // Wheel handler (desktop). We prevent default and drive our smooth scroller.
    const onWheel = (e) => {
      // if container does not overflow, allow propagation
      if (sc.scrollHeight <= sc.clientHeight) return;

      // normalize delta for different devices
      const delta = e.deltaY;
      e.preventDefault();

      // scale factor: reduce sensitivity
      const SCALE = 1;
      targetScrollRef.current = clampTarget(targetScrollRef.current + delta * SCALE);
      startRafIfNeeded();
    };

    // Touch handlers (mobile): translate touch moves into targetScroll changes
    const onTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
        e.stopPropagation(); // اضافه کردن این خط برای جلوگیری از انتشار رویداد
      }
    };
    const onTouchMove = (e) => {
      if (!touchStartYRef.current) return;
      if (e.touches && e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation(); // اضافه کردن این خط برای جلوگیری از انتشار رویداد
        const y = e.touches[0].clientY;
        const dy = touchStartYRef.current - y; // positive -> scroll down
        // scale down sensitivity for smoother feel
        const SCALE_TOUCH = 0.9;
        targetScrollRef.current = clampTarget(targetScrollRef.current + dy * SCALE_TOUCH);
        touchStartYRef.current = y;
        startRafIfNeeded();
      }
    };

    const onTouchEnd = () => {
      touchStartYRef.current = null;
    };

    // passive:false needed to call preventDefault on wheel/touchmove
    sc.addEventListener('wheel', onWheel, { passive: false });
    sc.addEventListener('touchstart', onTouchStart, { passive: true });
    sc.addEventListener('touchmove', onTouchMove, { passive: true });
    sc.addEventListener('touchend', onTouchEnd, { passive: true });

    // cleanup
    return () => {
      sc.removeEventListener('wheel', onWheel, { passive: false });
      sc.removeEventListener('touchstart', onTouchStart);
      sc.removeEventListener('touchmove', onTouchMove);
      sc.removeEventListener('touchend', onTouchEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const tabs = [
    {
      id: 'stats', label: 'تحلیل آماری', component: (
        <StatisticalAnalysis
          filteredFeatures={filteredFeatures}
          nameField={statsNameField}
          setNameField={setStatsNameField}
          valueField={statsValueField}
          setValueField={setStatsValueField}
        />
      )
    },
    {
      id: 'edit', label: 'ویرایش داده‌ها', component: (
        <DataEditing
          filteredFeatures={filteredFeatures}
          activeLayerName={activeLayerName}
          onRefresh={onRefresh}
          editedProperties={editedProperties}
          setEditedProperties={setEditedProperties}
          fieldFormula={fieldFormula}
          setFieldFormula={setFieldFormula}
          selectedField={selectedField}
          setSelectedField={setSelectedField}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchField={searchField}
          setSearchField={setSearchField}
          groupByField={groupByField}
          setGroupByField={setGroupByField}
          colorMode={colorMode}
          setColorMode={setColorMode}
          colorField={colorField}
          setColorField={setColorField}
        />
      )
    },
    { id: 'export', label: 'خروجی گرفتن', component: <DataExport filteredFeatures={filteredFeatures} activeLayerName={activeLayerName} onRefresh={onRefresh} /> },
    {
      id: 'spatial', label: 'تحلیل مکانی', component: (
        <SpatialAnalysis
          filteredFeatures={filteredFeatures}
          layers={layers}
          setAnalysisResult={setAnalysisResult}
          bufferRadius={spatialBufferRadius}
          setBufferRadius={setSpatialBufferRadius}
          selectedLayer={spatialSelectedLayer}
          setSelectedLayer={setSpatialSelectedLayer}
        />
      )
    },
    {
      id: 'visual', label: 'نقشه موضوعی', component: (
        <VisualMapping
          filteredFeatures={filteredFeatures}
          selectedField={visualSelectedField}
          setSelectedField={setVisualSelectedField}
          color={visualColor}
          setColor={setVisualColor}
          labelField={visualLabelField}
          setLabelField={setVisualLabelField}
          nameField={visualNameField}
          setNameField={setVisualNameField}
        />
      )
    },
    {
      id: 'network', label: 'تحلیل شبکه', component: (
        <NetworkAnalysis
          filteredFeatures={filteredFeatures}
          setAnalysisResult={setAnalysisResult}
          startPoint={networkStartPoint}
          setStartPoint={setNetworkStartPoint}
          endPoint={networkEndPoint}
          setEndPoint={setNetworkEndPoint}
          serviceRadius={networkServiceRadius}
          setServiceRadius={setNetworkServiceRadius}
          startNameField={networkStartNameField}
          setStartNameField={setNetworkStartNameField}
          endNameField={networkEndNameField}
          setEndNameField={setNetworkEndNameField}
        />
      )
    },
    { id: 'join', label: 'اتصال داده‌ها', component: <DataJoining filteredFeatures={filteredFeatures} layers={layers} /> },
    {
      id: 'modeling', label: 'مدلسازی پیشرفته', component: (
        <AdvancedModeling
          filteredFeatures={filteredFeatures}
          setAnalysisResult={setAnalysisResult}
          onFilterToMap={setFilteredFeatures}
          bufferRadius={bufferRadius}
          setBufferRadius={setBufferRadius}
          modelSteps={modelSteps}
          setModelSteps={setModelSteps}
          modelResult={modelResult}
          setModelResult={setModelResult}
          showMap={showMap}
          setShowMap={setShowMap}
          featureColors={featureColors}
          setFeatureColors={setFeatureColors}
          categoryColors={categoryColors}
          setCategoryColors={setCategoryColors}
          filters={filters}
          setFilters={setFilters}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
        />
      )
    },
  ].filter((tab) => userTools.length > 0 ? userTools.includes(tab.id) : true);

  return (
    <div
      ref={scrollRef}
      // --- MOBILE: Full-width on small screens, margined on larger screens ---
      className={`fixed bottom-0 left-0 right-0 sm:left-4 sm:right-4 bg-gray-50 dark:bg-gray-900 shadow-2xl rounded-t-xl z-[1010] max-h-[50vh] overflow-y-auto overflow-x-hidden tabs-optimized-scroll transition-all duration-300 ${isTabOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3rem)]'}`}
      role="region"
      aria-label="پنل ابزارها"
    >
      {/* --- MOBILE: Reduced padding on small screens --- */}
      <div className="flex items-center justify-between p-2 sm:p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-gray-50/80 dark:bg-gray-900/80 z-[1010] backdrop-blur-sm">
        <button
          onClick={() => setIsTabOpen(!isTabOpen)}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
          aria-label={isTabOpen ? 'بستن تب‌ها' : 'باز کردن تب‌ها'}
        >
          <ChevronDownIcon className={`w-6 h-6 transform transition-transform ${isTabOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex gap-2 overflow-x-auto mx-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              // --- MOBILE: Reduced horizontal padding on tab buttons ---
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              aria-label={`فعال‌سازی تب ${tab.label}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilteredFeatures([])}
          className="bg-red-600 text-white rounded-full p-2 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-transform hover:scale-110"
          aria-label="بستن پنل و پاک کردن فیلتر"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {isTabOpen && (
        // --- MOBILE: Reduced padding on content area ---
        <div className="p-2 sm:p-4 max-w-full mx-auto">{tabs.find((tab) => tab.id === activeTab)?.component}</div>
      )}
    </div>
  );
};

export default Tabs;