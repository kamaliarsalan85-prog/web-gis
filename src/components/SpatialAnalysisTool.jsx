import React, { useState } from 'react';
import * as turf from '@turf/turf';
import {
  VariableIcon,
  XMarkIcon,
  SparklesIcon,
  TrashIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export default function SpatialAnalysisTool({
  layers,
  selectedFeature,
  onSetAnalysisResult,
  onClose
}) {
  const [targetLayerName, setTargetLayerName] = useState(() => layers[0]?.name || '');
  const [operation, setOperation] = useState('buffer');
  const [bufferDistance, setBufferDistance] = useState(150); // meters
  const [bufferUnits, setBufferUnits] = useState('meters');
  const [analysisStats, setAnalysisStats] = useState(null);

  const currentLayer = layers.find((l) => l.name === targetLayerName) || layers[0];

  const runAnalysis = () => {
    try {
      let geojsonToAnalyze = null;
      if (selectedFeature) {
        geojsonToAnalyze = selectedFeature;
      } else if (currentLayer && currentLayer.data) {
        geojsonToAnalyze = currentLayer.data;
      }

      if (!geojsonToAnalyze) {
        alert('Please select a feature or layer to analyze.');
        return;
      }

      let result = null;
      let stats = null;

      if (operation === 'buffer') {
        result = turf.buffer(geojsonToAnalyze, bufferDistance, { units: bufferUnits });
        const areaVal = turf.area(result);
        stats = {
          title: `Buffer (${bufferDistance} ${bufferUnits})`,
          details: `Generated buffer envelope. Total buffered area: ${Math.round(areaVal).toLocaleString()} m² (${(areaVal / 10000).toFixed(2)} ha).`
        };
      } else if (operation === 'centroid') {
        const features = geojsonToAnalyze.type === 'FeatureCollection' ? geojsonToAnalyze.features : [geojsonToAnalyze];
        const centroids = features.map(f => turf.centroid(f));
        result = turf.featureCollection(centroids);
        stats = {
          title: 'Centroid Calculation',
          details: `Calculated geometric centroids for ${centroids.length} features.`
        };
      } else if (operation === 'bbox') {
        const bbox = turf.bbox(geojsonToAnalyze);
        const bboxPolygon = turf.bboxPolygon(bbox);
        result = bboxPolygon;
        const areaVal = turf.area(bboxPolygon);
        stats = {
          title: 'Bounding Box (BBOX)',
          details: `Computed outer bounding envelope. Area: ${Math.round(areaVal).toLocaleString()} m². [${bbox.map(n => n.toFixed(4)).join(', ')}]`
        };
      } else if (operation === 'convex') {
        const convexHull = turf.convex(geojsonToAnalyze);
        if (!convexHull) {
          alert('Could not compute convex hull (requires at least 3 points).');
          return;
        }
        result = convexHull;
        const areaVal = turf.area(convexHull);
        stats = {
          title: 'Convex Hull',
          details: `Computed outer convex boundary. Area: ${Math.round(areaVal).toLocaleString()} m².`
        };
      } else if (operation === 'area') {
        const totalArea = turf.area(geojsonToAnalyze);
        stats = {
          title: 'Area & Perimeter Calculation',
          details: `Total geometric area: ${Math.round(totalArea).toLocaleString()} m² (${(totalArea / 10000).toFixed(2)} hectares).`
        };
      }

      if (result) {
        onSetAnalysisResult(result);
      }
      setAnalysisStats(stats);
    } catch (err) {
      alert(`Spatial operation error: ${err.message}`);
    }
  };

  const clearAnalysis = () => {
    onSetAnalysisResult(null);
    setAnalysisStats(null);
  };

  return (
    <div className="absolute top-16 right-4 z-20 w-84 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <VariableIcon className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Spatial Analysis (Turf)</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 text-xs">
        {/* Input Target */}
        <div>
          <label className="block text-slate-400 mb-1">Target Geometry</label>
          <div className="p-2 bg-slate-800/80 rounded-lg border border-slate-700">
            {selectedFeature ? (
              <p className="text-blue-400 font-medium truncate">
                Selected Feature: {selectedFeature.properties?.name || selectedFeature.properties?.parcel_code || selectedFeature.id}
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-slate-400 text-[11px]">Entire Layer:</p>
                <select
                  value={targetLayerName}
                  onChange={(e) => setTargetLayerName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-1 text-slate-200"
                >
                  {layers.map((l, idx) => (
                    <option key={l.id || `${l.name}-${idx}`} value={l.name}>
                      {l.title || l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Operation */}
        <div>
          <label className="block text-slate-400 mb-1">Operation</label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="buffer">Buffer Zone (Proximity)</option>
            <option value="centroid">Calculate Geometric Centroid</option>
            <option value="bbox">Bounding Box Envelope</option>
            <option value="convex">Convex Hull Polygon</option>
            <option value="area">Calculate Area & Metrics</option>
          </select>
        </div>

        {/* Buffer Options */}
        {operation === 'buffer' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">Distance</label>
              <input
                type="number"
                min="1"
                max="50000"
                value={bufferDistance}
                onChange={(e) => setBufferDistance(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Units</label>
              <select
                value={bufferUnits}
                onChange={(e) => setBufferUnits(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 text-slate-200"
              >
                <option value="meters">Meters</option>
                <option value="kilometers">Kilometers</option>
                <option value="miles">Miles</option>
                <option value="feet">Feet</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={runAnalysis}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-sm transition-colors"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>Compute</span>
          </button>
          <button
            onClick={clearAnalysis}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-xl border border-slate-700 transition-colors"
            title="Clear Results"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Results Box */}
        {analysisStats && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircleIcon className="w-4 h-4" />
              <span>{analysisStats.title}</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {analysisStats.details}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
