// GeometryEditor.jsx
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useMap, FeatureGroup } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import axios from 'axios';
import area from '@turf/area';
import booleanEqual from '@turf/boolean-equal';
import kinks from '@turf/kinks';
import unkinkPolygon from '@turf/unkink-polygon';
import cleanCoords from '@turf/clean-coords';
import { union } from '@turf/turf';
import { toast } from 'react-toastify';

// ✅ Bases from ENV (fallback to same-origin)
const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? '' : '');
const MAHALLE_API_ROOT = API_BASE;


const GeometryEditor = ({ layer, selectedFeature, onUpdate, onClose, onLayerUpdate }) => {
  const map = useMap();
  const featureGroupRef = useRef();
  const editedLayerRef = useRef(null);
  const initialGeometryRef = useRef(null);
  const isSavingRef = useRef(false);
  const isClosingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const updateTimeoutRef = useRef(null);

  // Stable props
  const stableLayerName = useMemo(() => layer?.name || '', [layer?.name]);
  const stableFeatureObjectId = useMemo(() => {
    const oid = selectedFeature?.properties?.OBJECTID ?? selectedFeature?.id;
    if (!oid) {
      console.warn('No OBJECTID or id found for selectedFeature', selectedFeature);
      return '';
    }
    return String(oid);
  }, [selectedFeature]);

  // Debounce utility
  const debounce = (func, wait) => {
    return (...args) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        func(...args);
      }, wait);
    };
  };

  // Fix geometry
  const fixGeometry = useCallback((feature) => {
    try {
      let updated = cleanCoords(feature);
      const invalid = kinks(updated);

      if (invalid.features.length > 0) {
        const fixed = unkinkPolygon(updated);
        updated = fixed.features.length > 1 ? union(...fixed.features) : fixed.features[0];
      }

      updated = {
        type: 'Feature',
        geometry: updated.geometry,
        properties: feature.properties,
      };
      updated.properties.Shape_Area = area(updated);
      return updated;
    } catch (error) {
      console.error('Error fixing geometry', error);
      toast.error('خطا در اصلاح هندسه');
      return feature;
    }
  }, []);

  // Save geometry (debounced) - Updated for main-parcels, main-mahalles, and main-mabar
  const saveGeometry = useCallback(
    debounce((updatedFeature, callback) => {
      if (isSavingRef.current) {
        console.log('saveGeometry skipped: already saving');
        callback?.(false);
        return;
      }
      isSavingRef.current = true;

      console.log('saveGeometry started:', { layerName: stableLayerName, objectId: stableFeatureObjectId });

      const fixedFeature = fixGeometry(updatedFeature);

      // Ensure OBJECTID is present
      const objectId = fixedFeature.properties?.OBJECTID ?? fixedFeature.id;
      if (!objectId) {
        toast.error('OBJECTID موجود نیست — عملیات ذخیره متوقف شد.');
        isSavingRef.current = false;
        callback?.(false);
        return;
      }

      const token = localStorage.getItem('token');

      // ✅ پشتیبانی از main-mabar
      if (stableLayerName === 'main-mabar') {
        const payload = {
          mabar_id: Number(objectId),
          geometry: fixedFeature.geometry,
        };

        axios
          .post(
            `${MAHALLE_API_ROOT}/api/mabar/update-geometry/`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then((response) => {
            console.log('main-mabar geometry update success:', response.data);
            toast.success('تغییرات هندسه در main-mabar ذخیره شد');
            initialGeometryRef.current = JSON.parse(JSON.stringify(fixedFeature.geometry));

            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = setTimeout(() => {
              if (onLayerUpdate) {
                onLayerUpdate(
                  (prevLayers) => {
                    return prevLayers.map((l) =>
                      l.name === stableLayerName
                        ? {
                            ...l,
                            data: {
                              ...l.data,
                              features: l.data.features.map((f) =>
                                String(f.properties?.OBJECTID ?? f.id) === String(objectId)
                                  ? { ...f, geometry: fixedFeature.geometry, properties: { ...f.properties, Shape_Area: fixedFeature.properties.Shape_Area } }
                                  : f
                              ),
                            },
                            version: Date.now(),
                          }
                        : l
                    );
                  },
                  `ویرایش هندسه فیچر ${objectId} در لایه ${stableLayerName}`
                );
              }
              // REMOVED: setTimeout(() => onUpdate && onUpdate(), 500);
            }, 300);

            callback?.(true);
          })
          .catch((error) => {
            console.error('Error saving geometry to main-mabar:', error);
            toast.error('خطا در ذخیره هندسه main-mabar: ' + (error.response?.data?.error || error.message));
            callback?.(false);
          })
          .finally(() => {
            isSavingRef.current = false;
            console.log('main-mabar saveGeometry finished');
          });
      }
      // --- main-parcels ---
      else if (stableLayerName === 'main-parcels') {
        const payload = {
          parcel_id: Number(objectId),
          geometry: fixedFeature.geometry,
        };

        axios
          .post(
            `${MAHALLE_API_ROOT}/api/parcel/update-geometry/`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then((response) => {
            console.log('main-parcels geometry update success:', response.data);
            toast.success('تغییرات هندسه در main-parcels ذخیره شد');
            initialGeometryRef.current = JSON.parse(JSON.stringify(fixedFeature.geometry));

            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = setTimeout(() => {
              if (onLayerUpdate) {
                onLayerUpdate(
                  (prevLayers) => {
                    return prevLayers.map((l) =>
                      l.name === stableLayerName
                        ? {
                            ...l,
                            data: {
                              ...l.data,
                              features: l.data.features.map((f) =>
                                String(f.properties?.OBJECTID ?? f.id) === String(objectId)
                                  ? { ...f, geometry: fixedFeature.geometry, properties: { ...f.properties, Shape_Area: fixedFeature.properties.Shape_Area } }
                                  : f
                              ),
                            },
                            version: Date.now(),
                          }
                        : l
                    );
                  },
                  `ویرایش هندسه فیچر ${objectId} در لایه ${stableLayerName}`
                );
              }
              // REMOVED: setTimeout(() => onUpdate && onUpdate(), 500);
            }, 300);

            callback?.(true);
          })
          .catch((error) => {
            console.error('Error saving geometry to main-parcels:', error);
            toast.error('خطا در ذخیره هندسه main-parcels: ' + (error.response?.data?.error || error.message));
            callback?.(false);
          })
          .finally(() => {
            isSavingRef.current = false;
            console.log('main-parcels saveGeometry finished');
          });
      }
      // --- main-mahalles ---
      else if (stableLayerName === 'main-mahalles') {
        const payload = {
          mahalle_id: Number(objectId),
          geometry: fixedFeature.geometry,
        };

        axios
          .post(
            `${MAHALLE_API_ROOT}/api/mahalle/update-geometry/`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then((response) => {
            console.log('main-mahalles geometry update success:', response.data);
            toast.success('تغییرات هندسه در main-mahalles ذخیره شد');
            initialGeometryRef.current = JSON.parse(JSON.stringify(fixedFeature.geometry));

            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = setTimeout(() => {
              if (onLayerUpdate) {
                onLayerUpdate(
                  (prevLayers) => {
                    return prevLayers.map((l) =>
                      l.name === stableLayerName
                        ? {
                            ...l,
                            data: {
                              ...l.data,
                              features: l.data.features.map((f) =>
                                String(f.properties?.OBJECTID ?? f.id) === String(objectId)
                                  ? { ...f, geometry: fixedFeature.geometry, properties: { ...f.properties, Shape_Area: fixedFeature.properties.Shape_Area } }
                                  : f
                              ),
                            },
                            version: Date.now(),
                          }
                        : l
                    );
                  },
                  `ویرایش هندسه فیچر ${objectId} در لایه ${stableLayerName}`
                );
              }
              // REMOVED: setTimeout(() => onUpdate && onUpdate(), 500);
            }, 300);

            callback?.(true);
          })
          .catch((error) => {
            console.error('Error saving geometry to main-mahalles:', error);
            toast.error('خطا در ذخیره هندسه main-mahalles: ' + (error.response?.data?.error || error.message));
            callback?.(false);
          })
          .finally(() => {
            isSavingRef.current = false;
            console.log('main-mahalles saveGeometry finished');
          });
      }
      // --- سایر لایه‌ها (local DB) ---
      else {
        // Ensure OBJECTID is present and set as feature.id for server matching
        fixedFeature.properties.OBJECTID = String(objectId);
        fixedFeature.id = String(objectId);

        const payload = {
          layerName: stableLayerName,
          updatedFeature: fixedFeature,
          expectedVersion: layer?.version,
          storage: 'local'
        };

        axios
          .post(
            `${API_BASE}/api/update-feature`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then((response) => {
            console.log('saveGeometry success:', response.data);
            toast.success('تغییرات هندسه ذخیره شد');
            initialGeometryRef.current = JSON.parse(JSON.stringify(fixedFeature.geometry));

            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
            }
            updateTimeoutRef.current = setTimeout(() => {
              if (onLayerUpdate && response.data?.layer) {
                onLayerUpdate(
                  (prevLayers) => {
                    return prevLayers.map((l) =>
                      l.name === stableLayerName
                        ? {
                            ...l,
                            data: {
                              ...l.data,
                              features: l.data.features.map((f) =>
                                String(f.properties?.OBJECTID ?? f.id) === String(fixedFeature.properties.OBJECTID)
                                  ? fixedFeature
                                  : f
                              ),
                            },
                            version: response.data.layer.version ?? Date.now(),
                          }
                        : l
                    );
                  },
                  `ویرایش هندسه فیچر ${fixedFeature.properties.OBJECTID} در لایه ${stableLayerName}`
                );
              }
              // REMOVED: setTimeout(() => onUpdate && onUpdate(), 500);
            }, 300);

            callback?.(true);
          })
          .catch((error) => {
            console.error('Error saving geometry:', error);
            if (error.response?.status === 409) {
              toast.error('تداخل نسخه: لایه در سرور جدیدتر است.');
              if (onLayerUpdate && error.response?.data?.layer) {
                onLayerUpdate(
                  (prevLayers) =>
                    prevLayers.map((l) =>
                      l.name === error.response.data.layer.name
                        ? { ...l, data: error.response.data.layer.data, version: error.response.data.layer.version, updatedAt: error.response.data.layer.updatedAt }
                        : l
                    ),
                  `رفع تعارض نسخه برای لایه ${stableLayerName}`
                );
              }
            } else {
              toast.error('خطا در ذخیره هندسه: ' + (error.response?.data?.error || error.message));
            }
            callback?.(false);
          })
          .finally(() => {
            isSavingRef.current = false;
            console.log('saveGeometry finished');
          });
      }
    }, 800),
    [stableLayerName, stableFeatureObjectId, fixGeometry, onLayerUpdate, onUpdate, layer?.version]
  );

  // Stable handleRemove: only respond if OBJECTID matches selected feature
  const handleRemove = useCallback(
    (e) => {
      if (isClosingRef.current) {
        console.log('handleRemove ignored: closing');
        return;
      }
      if (!e?.layer?.feature) {
        console.log('handleRemove: no layer.feature present in event');
        return;
      }
      const eventObjectId = String(e.layer.feature.properties?.OBJECTID ?? e.layer.feature.id ?? '');
      console.log('handleRemove triggered for OBJECTID:', eventObjectId, 'Expected:', stableFeatureObjectId);
      if (!eventObjectId || eventObjectId !== String(stableFeatureObjectId)) {
        console.log('handleRemove: OBJECTID mismatch — ignoring');
        return;
      }

      const token = localStorage.getItem('token');

      // Decide endpoint & payload based on layer name
      let endpoint = null;
      let payload = null;

      if (stableLayerName === 'main-parcels') {
        endpoint = `${MAHALLE_API_ROOT}/api/parcel/delete`;
        payload = { parcel_id: Number(eventObjectId) };
      } else if (stableLayerName === 'main-mahalles') {
        endpoint = `${MAHALLE_API_ROOT}/api/mahalle/delete/`;
        payload = { mahalle_id: Number(eventObjectId) };
      } else if (stableLayerName === 'main-mabar') {
        endpoint = `${MAHALLE_API_ROOT}/api/mabar/delete`;
        payload = { mabar_id: Number(eventObjectId) };
      } else {
        // fallback to local delete api
        endpoint = `${API_BASE}/api/delete-feature`;
        payload = { layerName: stableLayerName, featureId: eventObjectId, storage: 'local' };
      }

      console.log('Deleting feature via endpoint:', endpoint, 'payload:', payload);

      axios
        .post(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
          console.log('Feature delete success response:', response.data);
          toast.success('فیچر با موفقیت حذف شد');

          // Update the layer in the app state
          if (onLayerUpdate) {
            const updatedLayer = {
              ...layer,
              data: {
                ...layer.data,
                features: layer.data.features.filter((f) => String(f.properties?.OBJECTID ?? f.id) !== String(eventObjectId)),
              },
              version: Date.now(),
            };
            onLayerUpdate(
              (prevLayers) => prevLayers.map((l) => (l.name === stableLayerName ? updatedLayer : l)),
              `حذف فیچر ${eventObjectId} از لایه ${stableLayerName}`
            );
          }

          // Ensure feature removed from featureGroup
          try {
            if (featureGroupRef.current && editedLayerRef.current) {
              featureGroupRef.current.removeLayer(editedLayerRef.current);
              editedLayerRef.current = null;
            }
          } catch (err) {
            console.warn('Error removing layer from FeatureGroup after delete:', err);
          }

          // REMOVED: setTimeout(() => onUpdate && onUpdate(), 500);
          onClose && onClose();
        })
        .catch((error) => {
          console.error('Error removing feature:', error);
          const msg = error.response?.data?.error || error.message || 'خطا در حذف فیچر';
          toast.error('خطا در حذف فیچر: ' + msg);
        });
    },
    [stableFeatureObjectId, stableLayerName, onLayerUpdate, onUpdate, onClose, layer]
  );

  // Mount: prepare FeatureGroup + PM controls
  React.useEffect(() => {
    if (!stableLayerName || !stableFeatureObjectId || stableFeatureObjectId === '' || !selectedFeature?.properties) {
      console.log('Invalid layer or feature:', { stableLayerName, stableFeatureObjectId });
      toast.error('لایه یا فیچر انتخاب‌شده نامعتبر است');
      onClose && onClose();
      return;
    }

    console.log('GeometryEditor mount:', stableLayerName, stableFeatureObjectId);
    isClosingRef.current = false;
    initialGeometryRef.current = JSON.parse(JSON.stringify(selectedFeature?.geometry || {}));

    // Cleanup previous
    if (featureGroupRef.current) {
      try {
        featureGroupRef.current.clearLayers();
      } catch (err) { }
    }

    // Add feature to FeatureGroup
    if (featureGroupRef.current && selectedFeature) {
      const featureCopy = JSON.parse(JSON.stringify(selectedFeature));
      featureCopy.properties = featureCopy.properties || {};
      featureCopy.properties.OBJECTID = String(featureCopy.properties.OBJECTID ?? featureCopy.id ?? Date.now());
      featureCopy.id = String(featureCopy.properties.OBJECTID);

      const leafletLayer = L.geoJSON(featureCopy, { interactive: true });
      let added = false;
      leafletLayer.eachLayer((l) => {
        if (!added) {
          featureGroupRef.current.addLayer(l);
          editedLayerRef.current = l;
          added = true;
        }
      });
    } else {
      console.warn('FeatureGroup or selectedFeature not available');
      toast.error('نمی‌توان فیچر را بارگذاری کرد');
      onClose && onClose();
      return;
    }

    // Add PM controls and make sure removal tool is visible (unhidden)
    try {
      map.pm.addControls({
        position: 'topleft',
        drawPolygon: false,
        drawRectangle: false,
        drawCircle: false,
        drawMarker: false,
        drawPolyline: false,
        drawCircleMarker: false,
        editControls: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: true, // <-- unhide/enable removal tool so user can delete
      });
    } catch (err) {
      console.warn('pm.addControls failed or already added:', err);
    }

    // Enable editing/removal only on the specific edited layer
    if (editedLayerRef.current && editedLayerRef.current.pm) {
      try {
        try {
          editedLayerRef.current.off('pm:remove', handleRemove);
        } catch (_) { }
        editedLayerRef.current.on('pm:remove', handleRemove);

        try {
          if (typeof editedLayerRef.current.pm.enable === 'function') {
            editedLayerRef.current.pm.enable({ snappable: false, allowSelfIntersection: false, draggable: true });
          }
        } catch (err) {
          console.warn('pm.enable failed on layer', err);
        }

        try {
          if (typeof editedLayerRef.current.pm.enableRemoval === 'function') {
            editedLayerRef.current.pm.enableRemoval();
          }
        } catch (err) {
          console.warn('pm.enableRemoval failed', err);
        }

        console.log('Local pm:remove listener attached to editedLayer');
      } catch (err) {
        console.warn('Attaching pm handlers error:', err);
      }
    }

    return () => {
      console.log('GeometryEditor unmount - cleanup');
      isClosingRef.current = true;

      if (editedLayerRef.current && editedLayerRef.current.off) {
        try {
          editedLayerRef.current.off('pm:remove', handleRemove);
          console.log('Local pm:remove listener removed from editedLayer');
        } catch (err) {
          console.warn('Error removing pm:remove listener:', err);
        }
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      try {
        map.pm.disableGlobalRemovalMode && map.pm.disableGlobalRemovalMode();
        map.pm.disableGlobalEditMode && map.pm.disableGlobalEditMode();
        map.pm.removeControls && map.pm.removeControls();
      } catch (err) {
        console.warn('Error disabling PM controls:', err);
      }

      map.eachLayer((l) => {
        if (l.pm && l.pm.disable) {
          try {
            l.pm.disable();
          } catch (err) {
            console.warn('Error disabling PM for layer:', err);
          }
        }
      });

      if (featureGroupRef.current) {
        try {
          featureGroupRef.current.clearLayers();
        } catch (err) { }
      }
    };
  }, [map, stableLayerName, stableFeatureObjectId, selectedFeature, handleRemove, onClose]);

  return (
    <FeatureGroup ref={featureGroupRef}>
      <div 
      className='z-[1005] flex flex-col md:flex-row gap-3 absolute right-3 md:right-120 top-90 md:top-6' 
      >
        <button
          type="button"
          onClick={() => {
            console.log('Closing GeometryEditor requested');
            isClosingRef.current = true;
            if (!editedLayerRef.current) {
              console.warn('No edited layer to save');
              onClose && onClose();
              return;
            }

            try {
              const updatedFeature = editedLayerRef.current.toGeoJSON();
              updatedFeature.properties = { ...(selectedFeature.properties || {}), ...(updatedFeature.properties || {}) };
              updatedFeature.properties.Shape_Area = area(updatedFeature);
              updatedFeature.properties.OBJECTID = String(updatedFeature.properties.OBJECTID ?? updatedFeature.id ?? selectedFeature.properties?.OBJECTID ?? selectedFeature.id ?? '');

              console.log('Checking geometry change:', {
                updated: updatedFeature.geometry,
                initial: initialGeometryRef.current,
              });

              if (!booleanEqual(updatedFeature.geometry, initialGeometryRef.current)) {
                saveGeometry(updatedFeature, (success) => {
                  console.log('Save geometry callback:', success);
                  onClose && onClose();
                });
              } else {
                console.log('No geometry changes detected');
                onClose && onClose();
              }
            } catch (err) {
              console.error('Error processing geometry on close:', err);
              toast.error('خطا در پردازش هندسه هنگام بستن');
              onClose && onClose();
            }
          }}
          style={{
            padding: '8px 12px',
            backgroundColor: '#FF1F1F',
            border: '0px solid #ccc',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#fff'
          }}
        >
          بستن ویرایشگر هندسه
        </button>

        {/* Visible delete button to help users (also removal tool is unhidden) */}
        <button
          type="button"
          onClick={() => {
            // Make sure PM removal tool is visible and removal enabled on this layer
            try {
              if (editedLayerRef.current && editedLayerRef.current.pm && typeof editedLayerRef.current.pm.enableRemoval === 'function') {
                editedLayerRef.current.pm.enableRemoval();
              }
              // Also enable global removal mode so user can click the layer to delete if they prefer
              if (map.pm && typeof map.pm.enableGlobalRemovalMode === 'function') {
                map.pm.enableGlobalRemovalMode();
              }
            } catch (err) {
              console.warn('Error enabling removal mode via button:', err);
            }

            // If user wants to directly trigger deletion without clicking the layer,
            // we call our handleRemove flow directly using the current editedLayer feature.
            try {
              if (editedLayerRef.current && editedLayerRef.current.toGeoJSON) {
                const fakeEvent = { layer: editedLayerRef.current };
                // Call handleRemove which will call backend and update app state.
                handleRemove(fakeEvent);
              } else {
                toast.error('فیچر برای حذف آماده نیست');
              }
            } catch (err) {
              console.error('Error while attempting direct delete:', err);
              toast.error('خطا در حذف فیچر');
            } finally {
              // disable global removal mode after attempting delete
              setTimeout(() => {
                try {
                  if (map.pm && typeof map.pm.disableGlobalRemovalMode === 'function') {
                    map.pm.disableGlobalRemovalMode();
                  }
                } catch (err) {}
              }, 500);
            }
          }}
          style={{
            padding: '8px 12px',
            backgroundColor: '#c62828',
            border: '0px solid #ccc',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#fff'
          }}
        >
          حذف فیچر
        </button>
      </div>
    </FeatureGroup>
  );
};

export default GeometryEditor;
