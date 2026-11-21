import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';

// Fix default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Helper component to re-center map dynamically
function MapController({ center, zoom, selectedFeature }) {
  const map = useMap();

  useEffect(() => {
    if (selectedFeature && selectedFeature.geometry) {
      try {
        const geojsonLayer = L.geoJSON(selectedFeature);
        const bounds = geojsonLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
        }
      } catch (e) {
        console.warn('Could not fit bounds to selected feature:', e);
      }
    }
  }, [selectedFeature, map]);

  return null;
}

export default function MapComponent({
  layers,
  selectedFeature,
  onFeatureSelect,
  analysisResult,
  choroplethSettings,
  drawMode,
  onFeatureDrawn
}) {
  const mapCenter = [35.6892, 51.3890]; // Center on metropolitan sample area
  const mapZoom = 15;

  const getFeatureStyle = (feature, layerMeta) => {
    // Check if thematic choropleth applies
    if (choroplethSettings && choroplethSettings.layerName === layerMeta.name) {
      const val = feature.properties?.[choroplethSettings.property];
      if (val !== undefined && choroplethSettings.getColor) {
        return {
          fillColor: choroplethSettings.getColor(val),
          weight: 2,
          opacity: 1,
          color: '#ffffff',
          fillOpacity: 0.7,
        };
      }
    }

    const isSelected = selectedFeature?.id === feature.id;
    return {
      fillColor: isSelected ? '#ec4899' : (layerMeta.color || '#3b82f6'),
      weight: isSelected ? 3 : 2,
      opacity: layerMeta.opacity ?? 0.8,
      color: isSelected ? '#f43f5e' : (layerMeta.color || '#1e40af'),
      fillOpacity: isSelected ? 0.6 : (layerMeta.opacity ? layerMeta.opacity * 0.5 : 0.4),
    };
  };

  const onEachFeature = (feature, layer) => {
    layer.on({
      click: () => {
        if (onFeatureSelect) onFeatureSelect(feature);
      },
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ weight: 3, fillOpacity: 0.8 });
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle({ weight: 2, fillOpacity: 0.5 });
      }
    });

    if (feature.properties) {
      const title = feature.properties.name || feature.properties.parcel_code || feature.id || 'Feature';
      const propsList = Object.entries(feature.properties)
        .slice(0, 6)
        .map(([k, v]) => `<div class="flex justify-between gap-3 text-xs py-0.5"><span class="text-slate-400 capitalize">${k.replace(/_/g, ' ')}:</span><span class="font-medium text-slate-100">${v}</span></div>`)
        .join('');

      layer.bindPopup(`
        <div class="p-1 min-w-[180px]">
          <h4 class="font-bold text-sm text-blue-400 border-b border-slate-700 pb-1 mb-2">${title}</h4>
          <div>${propsList}</div>
        </div>
      `, { className: 'custom-popup' });
    }
  };

  return (
    <div className="relative w-full h-full flex-1">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapController center={mapCenter} zoom={mapZoom} selectedFeature={selectedFeature} />

        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Dark Map (CartoDB)">
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite Imagery">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* GIS Vector Layers */}
        {layers
          .filter((l) => l.visible !== false)
          .map((layer) => {
            if (!layer.data || !layer.data.features) return null;
            return (
              <GeoJSON
                key={`${layer.name}-${layer.updatedAt || ''}-${layer.color}-${layer.opacity}`}
                data={layer.data}
                style={(feature) => getFeatureStyle(feature, layer)}
                onEachFeature={onEachFeature}
              />
            );
          })}

        {/* Spatial Analysis Overlay Result */}
        {analysisResult && (
          <GeoJSON
            key={`analysis-${Date.now()}`}
            data={analysisResult}
            style={{
              color: '#10b981',
              fillColor: '#34d399',
              fillOpacity: 0.5,
              weight: 3,
              dashArray: '4, 4'
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
