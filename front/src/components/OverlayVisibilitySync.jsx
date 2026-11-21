import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const OverlayVisibilitySync = ({ setLayers }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const onOverlayAdd = (e) => {
      const name = e.name || e.layer?.options?.name;
      if (!name) return;
      setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible: true } : l)));
    };
    const onOverlayRemove = (e) => {
      const name = e.name || e.layer?.options?.name;
      if (!name) return;
      setLayers((prev) => prev.map((l) => (l.name === name ? { ...l, visible: false } : l)));
    };

    map.on('overlayadd', onOverlayAdd);
    map.on('overlayremove', onOverlayRemove);

    return () => {
      map.off('overlayadd', onOverlayAdd);
      map.off('overlayremove', onOverlayRemove);
    };
  }, [map, setLayers]);

  return null;
};

export default OverlayVisibilitySync;