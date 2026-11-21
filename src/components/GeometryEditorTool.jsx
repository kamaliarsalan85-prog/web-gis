import React, { useState } from 'react';
import * as turf from '@turf/turf';
import {
  PencilSquareIcon,
  XMarkIcon,
  PlusCircleIcon,
  WrenchScrewdriverIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';

export default function GeometryEditorTool({
  layers,
  selectedFeature,
  onAddFeatureToLayer,
  onUpdateFeature,
  onClose
}) {
  const { isEditor } = useAuth();
  const [targetLayerName, setTargetLayerName] = useState(() => layers[0]?.name || '');
  const [geomType, setGeomType] = useState('Polygon');
  const [featureName, setFeatureName] = useState('');
  const [customCoordStr, setCustomCoordStr] = useState('');
  const [operationMessage, setOperationMessage] = useState('');

  // Sample quick coordinates around Tehran area
  const presets = {
    Polygon: '[[51.3895, 35.6885], [51.3925, 35.6885], [51.3925, 35.6875], [51.3895, 35.6875], [51.3895, 35.6885]]',
    LineString: '[[51.3860, 35.6900], [51.3920, 35.6900], [51.3960, 35.6870]]',
    Point: '[51.3905, 35.6890]'
  };

  const handleSelectType = (type) => {
    setGeomType(type);
    setCustomCoordStr(presets[type]);
  };

  const handleCreateFeature = (e) => {
    e.preventDefault();
    if (!isEditor) {
      alert('You need editor permissions to add new geometries.');
      return;
    }
    try {
      const coords = JSON.parse(customCoordStr || presets[geomType]);
      let geometry = null;
      if (geomType === 'Polygon') {
        geometry = { type: 'Polygon', coordinates: Array.isArray(coords[0][0]) ? coords : [coords] };
      } else if (geomType === 'LineString') {
        geometry = { type: 'LineString', coordinates: coords };
      } else if (geomType === 'Point') {
        geometry = { type: 'Point', coordinates: coords };
      }

      const newFeature = {
        type: 'Feature',
        id: `feat-${Date.now()}`,
        properties: {
          id: `f-${Math.floor(Math.random() * 10000)}`,
          name: featureName || `New ${geomType}`,
          created_at: new Date().toISOString(),
          status: 'Custom Added'
        },
        geometry
      };

      onAddFeatureToLayer(targetLayerName, newFeature);
      setOperationMessage(`Successfully added feature to layer "${targetLayerName}".`);
      setFeatureName('');
    } catch (err) {
      alert(`Invalid coordinates format: ${err.message}`);
    }
  };

  // Geometric cleanups on selected feature
  const handleSimplify = () => {
    if (!selectedFeature) {
      alert('Please select a feature first to simplify.');
      return;
    }
    try {
      const simplified = turf.simplify(selectedFeature, { tolerance: 0.0005, highQuality: true });
      onUpdateFeature(simplified);
      setOperationMessage('Geometry simplified using Douglas-Peucker algorithm.');
    } catch (err) {
      alert(`Simplify error: ${err.message}`);
    }
  };

  const handleCleanCoords = () => {
    if (!selectedFeature) {
      alert('Please select a feature first to clean.');
      return;
    }
    try {
      const cleaned = turf.cleanCoords(selectedFeature);
      onUpdateFeature(cleaned);
      setOperationMessage('Removed duplicate/redundant coordinate vertices.');
    } catch (err) {
      alert(`Clean coordinates error: ${err.message}`);
    }
  };

  const handleUnkink = () => {
    if (!selectedFeature || selectedFeature.geometry?.type !== 'Polygon') {
      alert('Unkink requires a Polygon feature.');
      return;
    }
    try {
      const unkinked = turf.unkinkPolygon(selectedFeature);
      if (unkinked.features.length > 0) {
        onUpdateFeature(unkinked.features[0]);
        setOperationMessage(`Resolved self-intersections into ${unkinked.features.length} simple polygons.`);
      }
    } catch (err) {
      alert(`Unkink error: ${err.message}`);
    }
  };

  return (
    <div className="absolute top-16 right-4 z-20 w-84 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <PencilSquareIcon className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-100">Geometry Editor</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Geometry Cleanup Operations */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium">
          <WrenchScrewdriverIcon className="w-4 h-4 text-blue-400" />
          <span>Topological Fixes (Selected Feature)</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={handleSimplify}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-center"
          >
            Simplify
          </button>
          <button
            onClick={handleCleanCoords}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-center"
          >
            Clean Coords
          </button>
          <button
            onClick={handleUnkink}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors text-center"
          >
            Unkink
          </button>
        </div>
      </div>

      {/* Add New Feature Section */}
      <form onSubmit={handleCreateFeature} className="space-y-3 text-xs border-t border-slate-800 pt-3">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium">
          <PlusCircleIcon className="w-4 h-4 text-amber-400" />
          <span>Create & Add Feature</span>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Target Layer</label>
          <select
            value={targetLayerName}
            onChange={(e) => setTargetLayerName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
          >
            {layers.map((l, idx) => (
              <option key={l.id || `${l.name}-${idx}`} value={l.name}>
                {l.title || l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Geometry Type</label>
          <div className="grid grid-cols-3 gap-1">
            {['Polygon', 'LineString', 'Point'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSelectType(type)}
                className={`py-1 rounded-lg border text-center font-medium transition-all ${
                  geomType === type
                    ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Feature Label / Name</label>
          <input
            type="text"
            placeholder="e.g. Parcel 106 Expansion"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Coordinates [lng, lat]</label>
          <textarea
            rows={3}
            value={customCoordStr || presets[geomType]}
            onChange={(e) => setCustomCoordStr(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 font-mono text-[10px] text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl shadow-sm transition-colors"
        >
          Add Feature to Layer
        </button>

        {operationMessage && (
          <p className="text-[11px] text-emerald-400 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/40">
            {operationMessage}
          </p>
        )}
      </form>
    </div>
  );
}
