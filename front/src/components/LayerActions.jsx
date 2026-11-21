import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { toast } from 'react-toastify';
import axios from 'axios';

// ✅ API base from ENV (fallback to same-origin)
const API = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? '' : '');


const LayerActions = ({ layers, fetchLayers, drawMode, editMode, selectedLayerName }) => {
  const map = useMap();
  const fetchTimerRef = useRef(null);

  const downloadGeoJSON = (layer) => {
    try {
      const dataStr = JSON.stringify(layer.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${layer.name}.geojson`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log(`Exported layer: ${layer.name}`);
      toast.success(`لایه ${layer.name} با موفقیت دانلود شد!`);
    } catch (error) {
      console.error('Error exporting layer:', layer.name, error);
      toast.error('خطا در خروجی گرفتن لایه: ' + error.message);
    }
  };

  const deleteLayer = async (layerName) => {
    if (drawMode) {
      toast.error('نمی‌توان لایه را در حالت ترسیم حذف کرد.');
      return;
    }
    if (editMode && selectedLayerName === layerName) {
      toast.error('نمی‌توان لایه‌ای که در حال ویرایش است را حذف کرد.');
      return;
    }

    if (!window.confirm(`آیا مطمئن هستید که می‌خواهید لایه ${layerName} را حذف کنید؟ این عمل غیرقابل بازگشت است.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`${API}/api/delete-layer`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        data: { layerName },
      });

      if (response.data.success) {
        console.log(`Deleted layer: ${layerName}`);
        toast.success(`لایه ${layerName} با موفقیت حذف شد!`);
        // Delay fetchLayers to avoid conflict with GeometryEditor
        if (fetchTimerRef.current) {
          clearTimeout(fetchTimerRef.current);
        }
        fetchTimerRef.current = setTimeout(() => {
          fetchLayers();
        }, 1000);
      }
    } catch (error) {
      console.error('Error deleting layer:', layerName, error);
      toast.error('خطا در حذف لایه: ' + (error.response?.data?.error || error.message));
    }
  };

  useEffect(() => {
    const layersControl = document.querySelector('.leaflet-control-layers-overlays');
    if (!layersControl) return;

    // Clear existing buttons
    const existingButtons = layersControl.querySelectorAll('.custom-button');
    existingButtons.forEach(btn => btn.remove());

    // Add buttons
    layers.forEach(layer => {
      const layerLabel = Array.from(layersControl.querySelectorAll('label')).find(label =>
        label.textContent.includes(layer.name)
      );
      if (layerLabel) {
        // Export button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'خروجی';
        exportBtn.className = 'custom-button export-button';
        exportBtn.style.marginRight = '5px';
        exportBtn.style.padding = '2px 6px';
        exportBtn.style.background = '#4CAF50';
        exportBtn.style.color = 'white';
        exportBtn.style.border = 'none';
        exportBtn.style.borderRadius = '3px';
        exportBtn.style.cursor = 'pointer';
        exportBtn.style.fontSize = '12px';
        exportBtn.title = `خروجی گرفتن ${layer.name}.geojson`;
        exportBtn.onclick = () => downloadGeoJSON(layer);
        layerLabel.appendChild(exportBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'حذف';
        deleteBtn.className = 'custom-button delete-button';
        deleteBtn.style.marginRight = '5px';
        deleteBtn.style.padding = '2px 6px';
        deleteBtn.style.background = '#ff4d4d';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.borderRadius = '3px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.title = `حذف کامل لایه ${layer.name}`;
        deleteBtn.onclick = () => deleteLayer(layer.name);
        layerLabel.appendChild(deleteBtn);
      }
    });

    return () => {
      const buttons = layersControl.querySelectorAll('.custom-button');
      buttons.forEach(btn => btn.remove());
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
    };
  }, [layers, map, drawMode, editMode, selectedLayerName]);

  return null;
};

export default LayerActions;