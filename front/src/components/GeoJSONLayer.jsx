// GeoJSONLayer.jsx
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useMap, LayerGroup } from 'react-leaflet';
import { LeafletLayer } from 'deck.gl-leaflet';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import L from 'leaflet';

export default function GeoJSONLayer({
  data,
  name = 'layer',
  color = '#0000ff',
  visible = true,
  onFeatureClick,
  pointOnly = false,
  originalFeatureCount = null,
}) {
  const map = useMap();
  const deckRef = useRef(null);
  const groupRef = useRef(null);
  const hoveredIdRef = useRef(null);
  const lastSigRef = useRef(null);
  const [versionKey, setVersionKey] = useState(0);

  // parse color -> [r,g,b,a]
  const parseColor = (c) => {
    if (Array.isArray(c)) return c.length === 4 ? c : [c[0], c[1], c[2], c[3] ?? 200];
    try {
      const hex = c.replace('#', '');
      const normHex = hex.length === 3 ? hex.split('').map((s) => s + s).join('') : hex;
      const bi = parseInt(normHex, 16);
      const r = (bi >> 16) & 255;
      const g = (bi >> 8) & 255;
      const b = bi & 255;
      return [r, g, b, 200];
    } catch (e) {
      return [0, 0, 255, 200];
    }
  };
  const parsedColor = useMemo(() => parseColor(color), [color]);

  // --- utility: ensure stable OBJECTID for all features ---
  const canonicalizeFeatures = (raw) => {
    if (!raw) return raw;
    let feats = [];
    if (Array.isArray(raw.features)) feats = raw.features.map((f) => ({ ...f }));
    else if (Array.isArray(raw)) feats = raw.map((f) => ({ ...f }));
    else if (raw && raw.features) feats = raw.features.map((f) => ({ ...f }));
    else feats = [];

    return {
      type: 'FeatureCollection',
      features: feats.map((f, idx) => {
        const copy = JSON.parse(JSON.stringify(f || {}));
        if (!copy.properties) copy.properties = {};
        const explicit = copy.properties?.OBJECTID ?? copy.id ?? null;
        const oid = explicit ?? `auto_${Date.now()}_${idx}`;
        copy.properties.OBJECTID = typeof oid === 'string' ? oid : String(oid);
        copy.id = String(copy.properties.OBJECTID);
        return copy;
      }),
    };
  };

  // signature to decide meaningful change
  const computeSignature = (d) => {
    try {
      if (!d) return '';
      const feats = Array.isArray(d.features) ? d.features : Array.isArray(d) ? d : [d];
      return feats
        .slice(0, 200)
        .map((f) => {
          const id = f?.properties?.OBJECTID ?? f?.id ?? '';
          if (id) return String(id);
          const geom = f?.geometry;
          if (!geom) return 'nogeom';
          const coord =
            Array.isArray(geom.coordinates) && geom.coordinates.length
              ? JSON.stringify(
                (geom.coordinates[0] && geom.coordinates[0].slice
                  ? geom.coordinates[0].slice(0, 2)
                  : geom.coordinates
                ).slice?.(0, 2) ?? geom.coordinates
              )
              : String(geom);
          return `${geom.type}:${coord}`.slice(0, 60);
        })
        .join('|');
    } catch (e) {
      return String(d?.features?.length ?? '') + '-' + (d?.type ?? '');
    }
  };

  // clone + canonicalize 'data' once when it changes (prevents mutation sharing)
  const safeData = useMemo(() => {
    if (!data) return null;
    try {
      const cloned = Array.isArray(data)
        ? { type: 'FeatureCollection', features: data.map((f) => JSON.parse(JSON.stringify(f))) }
        : typeof data === 'object'
          ? JSON.parse(JSON.stringify(data))
          : data;
      const canon = canonicalizeFeatures(cloned);
      return canon;
    } catch (e) {
      console.warn('GeoJSONLayer: safeData clone failed', e);
      return data;
    }
  }, [data]);

  useEffect(() => {
    const sig = computeSignature(safeData || data);
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setVersionKey((v) => v + 1);
    }
  }, [safeData]);

  // build deck.gl layers
  const buildLayers = () => {
    const d = safeData;
    if (!d) return [];

    // debug: شمار فیچرها و نمونه فیچر
    try {
      const total = Array.isArray(d.features) ? d.features.length : 0;
      const sample = d.features && d.features.length ? d.features[0] : null;
      console.debug(`[GeoJSONLayer:${name}] total features: ${total}`, sample && sample.geometry?.type ? `sample geometry: ${sample.geometry.type}` : sample);
    } catch (e) { }

    const makePopupAndCallback = (feature, info) => {
      const props = feature?.properties || {};
      const title = props?.Name || 'بدون نام';
      const id = props?.OBJECTID ?? feature?.id ?? 'نامشخص';
      const areaRaw = props?.Shape_Area;
      const area = typeof areaRaw === 'number' ? areaRaw.toFixed(2) : areaRaw ? String(areaRaw) : 'نامشخص';
      const html = `<div style="direction:rtl;padding:8px;font-family:sans-serif">
        <strong>${title}</strong><div>OBJECTID: ${id}</div><div>مساحت: ${area}</div>
      </div>`;
      if (map && info?.coordinate) {
        const [lng, lat] = info.coordinate;
        L.popup({ autoClose: true, closeOnClick: true }).setLatLng([lat, lng]).setContent(html).openOn(map);
      }
      if (typeof onFeatureClick === 'function') onFeatureClick(feature, info);
    };

    const onClick = (info, event) => {
      if (!info || !info.object) return;

      // جلوگیری از رفتار دوگانه در دستگاه‌های هیبریدی
      if (event.type === 'mousedown' && event.pointerType === 'touch') {
        return;
      }

      makePopupAndCallback(info.object, info);
    };


    const onHover = (info) => {
      const id = info?.object ? (info.object.properties?.OBJECTID ?? info.object?.id ?? null) : null;
      if ((id ?? null) !== (hoveredIdRef.current ?? null)) {
        hoveredIdRef.current = id ?? null;
      }
    };

    // اگر فقط نقاط خواسته شده => scatter
    if (pointOnly) {
      const pointData = Array.isArray(d.features) ? d.features : d.features ?? [];
      return [
        new ScatterplotLayer({
          id: `scatter-${name}-${versionKey}`,
          data: pointData,
          pickable: true,
          stroked: false,
          radiusMinPixels: 1,
          radiusMaxPixels: 12,
          getPosition: (f) => {
            const geom = f.geometry || f;
            if (!geom) return null;
            return geom.type === 'Point' ? geom.coordinates : Array.isArray(geom.coordinates) ? geom.coordinates[0] : null;
          },
          getRadius: (f) => f?.properties?.markerRadius ?? 6,
          getFillColor: (f) => {
            const id = f?.properties?.OBJECTID ?? f?.id ?? null;
            if (hoveredIdRef.current && id && String(id) === String(hoveredIdRef.current)) {
              const [r, g, b] = parsedColor;
              return [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40), 255];
            }
            return parsedColor;
          },
          onClick,
          onHover,
          updateTriggers: {
            getFillColor: [parsedColor, versionKey, hoveredIdRef.current],
            data: pointData,
          },
        }),
      ];
    }

    // جدا کردن فیچرها بر اساس نوع هندسه
    const features = Array.isArray(d.features) ? d.features : [];
    const polygons = features.filter((f) => {
      const t = f?.geometry?.type;
      return t === 'Polygon' || t === 'MultiPolygon';
    });
    const lines = features.filter((f) => {
      const t = f?.geometry?.type;
      return t === 'LineString' || t === 'MultiLineString';
    });
    const points = features.filter((f) => {
      const t = f?.geometry?.type;
      return t === 'Point';
    });

    // debug logs
    console.debug(`[GeoJSONLayer:${name}] polygons=${polygons.length}, lines=${lines.length}, points=${points.length}`);

    // determine border width (same logic as قبل)
    let layerFeatureCount = 0;
    if (originalFeatureCount !== null && !isNaN(originalFeatureCount)) {
      layerFeatureCount = originalFeatureCount;
    } else if (d) {
      layerFeatureCount = Array.isArray(d.features) ? d.features.length : 0;
    }
    const borderWidth = layerFeatureCount > 500 ? 1 : 2;
    const lineMinPixels = Math.max(2, borderWidth); // حداقل عرض خط برای دید بهتر

    const layersOut = [];

    // اگر نقاط هم به عنوان فیچر موجود باشن، یک scatter یا geojson point layer اضافه کن
    if (points.length > 0) {
      layersOut.push(
        new ScatterplotLayer({
          id: `points-${name}-${versionKey}`,
          data: points,
          pickable: true,
          stroked: false,
          radiusMinPixels: 1,
          radiusMaxPixels: 12,
          getPosition: (f) => f.geometry?.coordinates ?? null,
          getRadius: (f) => f?.properties?.markerRadius ?? 4,
          getFillColor: (f) => {
            const id = f?.properties?.OBJECTID ?? f?.id ?? null;
            if (hoveredIdRef.current && id && String(id) === String(hoveredIdRef.current)) {
              const [r, g, b] = parsedColor;
              return [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40), 255];
            }
            return parsedColor;
          },
          onClick,
          onHover,
          updateTriggers: {
            getFillColor: [parsedColor, versionKey, hoveredIdRef.current],
            data: points,
          },
        })
      );
    }

    // polygons layer
    if (polygons.length > 0) {
      layersOut.push(
        new GeoJsonLayer({
          id: `polygons-${name}-${versionKey}`,
          data: { type: 'FeatureCollection', features: polygons },
          pickable: true,
          stroked: true,
          filled: true,
          extruded: false,
          wireframe: false,
          fp64: false,
          getLineWidth: borderWidth,
          pointRadiusScale: 1,
          getPointRadius: (f) => f?.properties?.markerRadius ?? 4,
          getLineColor: (f) => {
            const id = f?.properties?.OBJECTID ?? f?.id ?? null;
            if (hoveredIdRef.current && id && String(id) === String(hoveredIdRef.current)) {
              return [255, 255, 255, 255];
            }
            return [0, 0, 0, 255];
          },
          getFillColor: (f) => {
            const id = f?.properties?.OBJECTID ?? f?.id ?? null;
            if (hoveredIdRef.current && id && String(id) === String(hoveredIdRef.current)) {
              const [r, g, b] = parsedColor;
              return [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40), 200];
            }
            return parsedColor;
          },
          onClick,
          onHover,
          updateTriggers: {
            getFillColor: [parsedColor, versionKey, hoveredIdRef.current],
            getLineColor: [parsedColor, versionKey, hoveredIdRef.current],
            getPointRadius: [versionKey],
            data: polygons,
          },
        })
      );
    }

    // lines layer (خط‌ها را جداگانه اضافه می‌کنیم تا مطمئن شویم render مناسب دارند)
    if (lines.length > 0) {
      layersOut.push(
        new GeoJsonLayer({
          id: `lines-${name}-${versionKey}`,
          data: { type: 'FeatureCollection', features: lines },
          pickable: true,
          stroked: true,
          filled: false, // مهم: برای خطوط نباید filled=true باشه
          extruded: false,
          wireframe: false,
          fp64: false,
          // تنظیمات مربوط به عرض خط:
          lineWidthMinPixels: lineMinPixels,
          getLineWidth: (f) => f?.properties?.lineWidth ?? borderWidth,
          // رنگ خط از parsedColor استفاده کن (با hover سفید میشه)
          getLineColor: (f) => {
            const id = f?.properties?.OBJECTID ?? f?.id ?? null;
            if (hoveredIdRef.current && id && String(id) === String(hoveredIdRef.current)) {
              const [r, g, b] = parsedColor;
              return [Math.min(255, r + 40), Math.min(255, g + 40), Math.min(255, b + 40), 255];
            }
            // اگر alpha داخل parsedColor کمتر از 255 باشه، روی خط از 255 استفاده کن تا قابل‌مشاهده باشه
            const [r, g, b, a] = parsedColor;
            return [r, g, b, a ?? 255];
          },
          // بعضی تنظیمات مفید برای خطوط:
          jointRounded: true,
          rounded: true,
          onClick,
          onHover,
          updateTriggers: {
            getLineColor: [parsedColor, versionKey, hoveredIdRef.current],
            getLineWidth: [versionKey],
            data: lines,
          },
        })
      );
    }

    return layersOut;
  };

  useEffect(() => {
    if (!map || !safeData) return;
    const layers = buildLayers();

    if (!deckRef.current) {
      deckRef.current = new LeafletLayer({ layers });
      console.debug('[GeoJSONLayer] created deckRef', name, 'versionKey', versionKey);
    } else {
      try {
        deckRef.current.setProps({ layers });
        console.debug('[GeoJSONLayer] updated deckRef props', name, 'versionKey', versionKey);
      } catch (e) {
        console.warn('[GeoJSONLayer] setProps failed, recreating deckRef', e);
        try {
          deckRef.current && deckRef.current._map && map.removeLayer(deckRef.current);
        } catch (_) { }
        deckRef.current = new LeafletLayer({ layers });
      }
    }

    const group = groupRef.current;
    const isGroupLayer = group && typeof group.addLayer === 'function';

    const groupHasDeck = () => {
      try {
        if (!group) return false;
        if (typeof group.hasLayer === 'function') return group.hasLayer(deckRef.current);
        const children = group.getLayers ? group.getLayers() : [];
        return children && children.indexOf && children.indexOf(deckRef.current) !== -1;
      } catch (e) {
        return false;
      }
    };

    if (isGroupLayer) {
      if (!groupHasDeck()) {
        try {
          group.addLayer(deckRef.current);
          console.debug('[GeoJSONLayer] attached deckRef to group', name);
        } catch (e) {
          console.warn('[GeoJSONLayer] attach to group failed, adding to map', e);
          if (!deckRef.current._map) deckRef.current.addTo(map);
        }
      }
    } else {
      if (!deckRef.current._map) deckRef.current.addTo(map);
      console.debug('[GeoJSONLayer] attached deckRef to map directly', name);
    }

    return () => {
      try {
        if (isGroupLayer) {
          try {
            group.removeLayer && group.removeLayer(deckRef.current);
            console.debug('[GeoJSONLayer] removed deckRef from group (cleanup)', name);
          } catch (e) {
            console.warn('[GeoJSONLayer] removeLayer from group failed', e);
          }
        } else {
          if (deckRef.current && deckRef.current._map) {
            map.removeLayer(deckRef.current);
            console.debug('[GeoJSONLayer] removed deckRef from map (cleanup)', name);
          }
        }
      } catch (e) { /* ignore cleanup errors */ }
    };
  }, [map, safeData, versionKey, color]);

  useEffect(() => {
    if (!map) return;
    if (!visible) {
      try { map.closePopup(); } catch (e) { /* ignore */ }
    }
  }, [map, visible]);

  if (!safeData) {
    return <LayerGroup ref={groupRef} />;
  }

  return <LayerGroup ref={groupRef} />;
}
