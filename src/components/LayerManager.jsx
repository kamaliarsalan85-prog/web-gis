import React, { useState } from 'react';
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowDownTrayIcon,
  PlusIcon,
  TrashIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

export default function LayerManager({
  layers,
  onToggleLayer,
  onUpdateLayerStyle,
  onAddLayer,
  onDeleteLayer,
  onClose
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerTitle, setNewLayerTitle] = useState('');
  const [newLayerColor, setNewLayerColor] = useState('#3b82f6');
  const [geoJsonInput, setGeoJsonInput] = useState('');

  const handleCreateLayer = (e) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(geoJsonInput);
      if (!parsed.type || !parsed.features) {
        alert('Invalid GeoJSON format. Must be a FeatureCollection.');
        return;
      }
      onAddLayer({
        name: newLayerName.toLowerCase().replace(/\s+/g, '-'),
        title: newLayerTitle || newLayerName,
        category: 'Custom Upload',
        color: newLayerColor,
        data: parsed
      });
      setShowAddModal(false);
      setNewLayerName('');
      setNewLayerTitle('');
      setGeoJsonInput('');
    } catch (err) {
      alert(`JSON Parse Error: ${err.message}`);
    }
  };

  const exportLayer = (layer, format) => {
    if (!layer.data) return;
    if (format === 'geojson') {
      const blob = new Blob([JSON.stringify(layer.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${layer.name}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      // Export properties as CSV
      const features = layer.data.features || [];
      if (features.length === 0) return;
      const headers = Object.keys(features[0].properties || {});
      const rows = features.map(f => headers.map(h => JSON.stringify(f.properties?.[h] ?? '')).join(','));
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${layer.name}-attributes.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="absolute top-16 left-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col max-h-[calc(100vh-5rem)]">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <AdjustmentsHorizontalIcon className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-semibold text-slate-100">Layer Manager</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddModal(true)}
            className="p-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors"
            title="Import Layer"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto space-y-3 pt-3">
        {layers.map((layer, idx) => (
          <div
            key={layer.id || `${layer.name}-${idx}`}
            className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 space-y-2 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={layer.color || '#3b82f6'}
                  onChange={(e) => onUpdateLayerStyle(layer.name, { color: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                />
                <div>
                  <h3 className="text-xs font-semibold text-slate-200">{layer.title || layer.name}</h3>
                  <p className="text-[10px] text-slate-400">
                    {layer.featureCount || layer.data?.features?.length || 0} features &bull; {layer.category || 'General'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleLayer(layer.name)}
                  className={`p-1 rounded-lg transition-colors ${
                    layer.visible !== false ? 'text-blue-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-700'
                  }`}
                  title={layer.visible !== false ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible !== false ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => exportLayer(layer, 'geojson')}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Export GeoJSON"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                {layer.category === 'Custom Upload' && (
                  <button
                    onClick={() => onDeleteLayer(layer.name)}
                    className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Delete Layer"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-slate-400">Opacity:</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={layer.opacity ?? 0.8}
                onChange={(e) => onUpdateLayerStyle(layer.name, { opacity: parseFloat(e.target.value) })}
                className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[10px] text-slate-400 w-7 text-right">
                {Math.round((layer.opacity ?? 0.8) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Layer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Upload GeoJSON Layer</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLayer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Layer ID / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. water-utilities"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Display Title</label>
                <input
                  type="text"
                  placeholder="e.g. Municipal Water Lines"
                  value={newLayerTitle}
                  onChange={(e) => setNewLayerTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newLayerColor}
                    onChange={(e) => setNewLayerColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-slate-300 font-mono">{newLayerColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Paste GeoJSON (FeatureCollection)</label>
                <textarea
                  required
                  rows={6}
                  placeholder='{"type": "FeatureCollection", "features": [...]}'
                  value={geoJsonInput}
                  onChange={(e) => setGeoJsonInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 font-medium"
                >
                  Add Layer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
