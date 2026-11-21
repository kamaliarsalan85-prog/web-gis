import React, { useState } from 'react';
import {
  PaintBrushIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export default function VisualMappingTool({
  layers,
  choroplethSettings,
  onApplyChoropleth,
  onClearChoropleth,
  onClose
}) {
  const [selectedLayerName, setSelectedLayerName] = useState(() => layers[0]?.name || '');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [colorRamp, setColorRamp] = useState('blues');

  const currentLayer = layers.find((l) => l.name === selectedLayerName) || layers[0];
  const features = currentLayer?.data?.features || [];

  // Extract numeric properties
  const numericProperties = React.useMemo(() => {
    if (!features.length) return [];
    const keys = new Set();
    features.forEach((f) => {
      if (f.properties) {
        Object.entries(f.properties).forEach(([k, v]) => {
          if (typeof v === 'number') {
            keys.add(k);
          }
        });
      }
    });
    return Array.from(keys);
  }, [features]);

  // Set default property
  React.useEffect(() => {
    if (numericProperties.length && !numericProperties.includes(selectedProperty)) {
      setSelectedProperty(numericProperties[0]);
    }
  }, [numericProperties]);

  const colorPalettes = {
    blues: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
    greens: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'],
    warm: ['#fef3c7', '#fcd34d', '#f97316', '#dc2626', '#7f1d1d'],
    purples: ['#faf5ff', '#e9d5ff', '#c084fc', '#9333ea', '#581c87'],
  };

  const handleApply = () => {
    if (!selectedProperty) return;

    // Determine min and max
    const values = features
      .map((f) => f.properties?.[selectedProperty])
      .filter((v) => typeof v === 'number');

    if (!values.length) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const palette = colorPalettes[colorRamp] || colorPalettes.blues;

    const getColor = (val) => {
      if (val === undefined || max === min) return palette[2];
      const normalized = Math.max(0, Math.min(1, (val - min) / (max - min)));
      const index = Math.min(palette.length - 1, Math.floor(normalized * palette.length));
      return palette[index];
    };

    onApplyChoropleth({
      layerName: selectedLayerName,
      property: selectedProperty,
      min,
      max,
      palette,
      getColor
    });
  };

  return (
    <div className="absolute top-16 right-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <PaintBrushIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">Thematic Choropleth</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <div>
          <label className="block text-slate-400 mb-1">Target Layer</label>
          <select
            value={selectedLayerName}
            onChange={(e) => setSelectedLayerName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
          >
            {layers.map((l, idx) => (
              <option key={l.id || `${l.name}-${idx}`} value={l.name}>
                {l.title || l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Attribute Field (Numeric)</label>
          {numericProperties.length > 0 ? (
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 capitalize"
            >
              {numericProperties.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-slate-500 italic p-2 bg-slate-800/50 rounded-lg">
              No numeric attributes in this layer.
            </p>
          )}
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Color Palette Ramp</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(colorPalettes).map(([name, colors]) => (
              <button
                key={name}
                type="button"
                onClick={() => setColorRamp(name)}
                className={`p-2 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  colorRamp === name
                    ? 'border-indigo-500 bg-indigo-950/40'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <span className="text-[11px] capitalize font-medium text-slate-300">{name}</span>
                <div className="flex h-3 w-full rounded overflow-hidden">
                  {colors.map((c, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleApply}
            disabled={!numericProperties.length}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-sm transition-colors"
          >
            Apply Choropleth
          </button>
          <button
            onClick={onClearChoropleth}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-colors"
            title="Reset Default Style"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        {choroplethSettings && (
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-300 capitalize">
              Legend: {choroplethSettings.property?.replace(/_/g, ' ')}
            </span>
            <div className="flex h-3.5 w-full rounded overflow-hidden">
              {choroplethSettings.palette?.map((c, i) => (
                <div key={i} className="flex-1" style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{Math.round(choroplethSettings.min).toLocaleString()}</span>
              <span>{Math.round(choroplethSettings.max).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
