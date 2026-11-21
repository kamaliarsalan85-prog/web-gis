import React, { useState, useEffect, useCallback } from 'react';
import api from './services/api';
import Navbar from './components/Navbar';
import MapComponent from './components/MapComponent';
import LayerManager from './components/LayerManager';
import AttributeTable from './components/AttributeTable';
import SpatialAnalysisTool from './components/SpatialAnalysisTool';
import VisualMappingTool from './components/VisualMappingTool';
import GeometryEditorTool from './components/GeometryEditorTool';
import AdminPanel from './components/AdminPanel';
import Login from './components/Login';
import { useAuth } from './context/AuthContext';
import { io } from 'socket.io-client';

export default function App() {
  const { user } = useAuth();
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState('layers'); // 'layers', 'table', 'spatial', 'visual', 'draw', 'admin'
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [choroplethSettings, setChoroplethSettings] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogin, setShowLogin] = useState(false);

  // Fetch full layers with GeoJSON
  const fetchLayers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/layers');
      const rawLayers = res.data.layers || [];
      const seen = new Set();
      const layerSummaries = rawLayers.filter((l) => {
        if (!l?.name || seen.has(l.name)) return false;
        seen.add(l.name);
        return true;
      });

      // Fetch each layer's full GeoJSON
      const fullLayers = await Promise.all(
        layerSummaries.map(async (l) => {
          try {
            const detailRes = await api.get(`/layers/${l.name}`);
            return {
              ...l,
              data: detailRes.data.layer?.data || { type: 'FeatureCollection', features: [] }
            };
          } catch (e) {
            return l;
          }
        })
      );
      setLayers(fullLayers);
    } catch (err) {
      console.error('Failed to load layers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  // Real-time Socket.IO connection
  useEffect(() => {
    const socket = io();
    socket.on('layer_created', () => fetchLayers());
    socket.on('layer_updated', () => fetchLayers());
    socket.on('layer_deleted', () => fetchLayers());
    socket.on('feature_added', () => fetchLayers());
    socket.on('feature_deleted', () => fetchLayers());

    return () => {
      socket.disconnect();
    };
  }, [fetchLayers]);

  // Layer Visibility & Style Toggles
  const handleToggleLayer = (layerName) => {
    setLayers((prev) =>
      prev.map((l) => (l.name === layerName ? { ...l, visible: l.visible === false ? true : false } : l))
    );
  };

  const handleUpdateLayerStyle = async (layerName, newStyle) => {
    setLayers((prev) =>
      prev.map((l) => (l.name === layerName ? { ...l, ...newStyle } : l))
    );
    try {
      await api.put(`/layers/${layerName}`, newStyle);
    } catch (e) {
      console.warn('Could not persist layer style change:', e);
    }
  };

  const handleAddLayer = async (layerData) => {
    try {
      const res = await api.post('/layers', layerData);
      setLayers((prev) => [...prev, res.data.layer]);
    } catch (err) {
      alert(`Add layer failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDeleteLayer = async (layerName) => {
    if (confirm(`Delete layer "${layerName}"?`)) {
      try {
        await api.delete(`/layers/${layerName}`);
        setLayers((prev) => prev.filter((l) => l.name !== layerName));
      } catch (err) {
        alert(err.response?.data?.error || err.message);
      }
    }
  };

  // Feature manipulation
  const handleAddFeatureToLayer = async (layerName, feature) => {
    try {
      const res = await api.post(`/layers/${layerName}/features`, feature);
      setLayers((prev) =>
        prev.map((l) => {
          if (l.name === layerName) {
            return {
              ...l,
              data: {
                ...l.data,
                features: [...(l.data?.features || []), res.data.feature]
              }
            };
          }
          return l;
        })
      );
      setSelectedFeature(res.data.feature);
    } catch (err) {
      alert(`Could not add feature: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDeleteFeature = async (layerName, featureId) => {
    try {
      await api.delete(`/layers/${layerName}/features/${featureId}`);
      setLayers((prev) =>
        prev.map((l) => {
          if (l.name === layerName) {
            return {
              ...l,
              data: {
                ...l.data,
                features: (l.data?.features || []).filter((f) => f.id !== featureId && f.properties?.id !== featureId)
              }
            };
          }
          return l;
        })
      );
      if (selectedFeature?.id === featureId) {
        setSelectedFeature(null);
      }
    } catch (err) {
      alert(`Could not delete feature: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleUpdateFeature = (updatedFeature) => {
    setSelectedFeature(updatedFeature);
    // Update locally in layer
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        data: {
          ...l.data,
          features: (l.data?.features || []).map((f) =>
            f.id === updatedFeature.id ? updatedFeature : f
          )
        }
      }))
    );
  };

  // Search feature across layers
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const term = searchQuery.toLowerCase();
    for (const layer of layers) {
      const match = layer.data?.features?.find((f) => {
        const props = JSON.stringify(f.properties || {}).toLowerCase();
        return props.includes(term);
      });
      if (match) {
        setSelectedFeature(match);
        return;
      }
    }
    alert(`No features found matching "${searchQuery}"`);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 overflow-hidden select-none">
      {/* Top Navbar */}
      <Navbar
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onOpenLogin={() => setShowLogin(true)}
        onOpenAdmin={() => setActivePanel(activePanel === 'admin' ? null : 'admin')}
      />

      {/* Main Map Canvas Area */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <MapComponent
          layers={layers}
          selectedFeature={selectedFeature}
          onFeatureSelect={(f) => setSelectedFeature(f)}
          analysisResult={analysisResult}
          choroplethSettings={choroplethSettings}
        />

        {/* Selected Feature Card Pill */}
        {selectedFeature && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700 shadow-xl flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse" />
            <div className="text-xs">
              <span className="font-semibold text-slate-100">
                {selectedFeature.properties?.name || selectedFeature.properties?.parcel_code || selectedFeature.id}
              </span>
              <span className="text-slate-400 ml-2">
                Type: {selectedFeature.geometry?.type}
              </span>
            </div>
            <button
              onClick={() => setSelectedFeature(null)}
              className="text-slate-400 hover:text-white text-xs ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* Panels */}
        {activePanel === 'layers' && (
          <LayerManager
            layers={layers}
            onToggleLayer={handleToggleLayer}
            onUpdateLayerStyle={handleUpdateLayerStyle}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'table' && (
          <AttributeTable
            layers={layers}
            selectedFeature={selectedFeature}
            onSelectFeature={(f) => setSelectedFeature(f)}
            onDeleteFeature={handleDeleteFeature}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'spatial' && (
          <SpatialAnalysisTool
            layers={layers}
            selectedFeature={selectedFeature}
            onSetAnalysisResult={setAnalysisResult}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'visual' && (
          <VisualMappingTool
            layers={layers}
            choroplethSettings={choroplethSettings}
            onApplyChoropleth={setChoroplethSettings}
            onClearChoropleth={() => setChoroplethSettings(null)}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'draw' && (
          <GeometryEditorTool
            layers={layers}
            selectedFeature={selectedFeature}
            onAddFeatureToLayer={handleAddFeatureToLayer}
            onUpdateFeature={handleUpdateFeature}
            onClose={() => setActivePanel(null)}
          />
        )}

        {activePanel === 'admin' && (
          <AdminPanel
            layers={layers}
            onClose={() => setActivePanel(null)}
          />
        )}

        {showLogin && (
          <Login onClose={() => setShowLogin(false)} />
        )}
      </div>
    </div>
  );
}
