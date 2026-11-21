import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import axios from 'axios';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MagnifyingGlassIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  CalculatorIcon, 
  ArrowDownTrayIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  Bars3Icon
} from '@heroicons/react/24/solid';
import { API_BASE_URL } from '../../services/api';
const API_BASE = API_BASE_URL;
const MAHALLE_API_ROOT = API_BASE;
const DataEditing = ({
  filteredFeatures = [],
  activeLayerName,
  onRefresh,
  editedProperties, setEditedProperties,
  fieldFormula, setFieldFormula,
  selectedField, setSelectedField,
  searchQuery, setSearchQuery,
  searchField, setSearchField,
  groupByField, setGroupByField,
  colorMode, setColorMode,
  colorField, setColorField,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);
  const [newFieldsMap, setNewFieldsMap] = useState({});
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldType, setNewFieldType] = useState('string');
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditValue, setBulkEditValue] = useState('');
  const [bulkEditField, setBulkEditField] = useState('');
  const boxRef = useRef(null);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  // New: review modal position/size/drag/resize states & refs
  const [reviewModalPos, setReviewModalPos] = useState({ left: null, top: null });
  const [reviewModalSize, setReviewModalSize] = useState({ width: 520, height: 320 });
  const reviewDragRef = useRef(null);
  const reviewResizeRef = useRef(null);
  const [isDraggingReview, setIsDraggingReview] = useState(false);
  const [isResizingReview, setIsResizingReview] = useState(false);
  const [reviewLastMouse, setReviewLastMouse] = useState({ x: 0, y: 0 });
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 180;
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 800;
  // Mahalle-specific helpers (مطابق با FeatureEditor)
  const mahalleAddField = useCallback(async (mahalleId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mahalle_id: String(mahalleId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mahalle/add-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    if (resp.status >= 400 || resp.data?.status !== 'success') {
      throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
    }
    return resp.data;
  }, []);
  const mahalleUpdateFeature = useCallback(async (mahalleId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mahalle_id: String(mahalleId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mahalle/update-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    return resp;
  }, []);
  const mahalleDeleteField = useCallback(async (mahalleId, key) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const url = `${MAHALLE_API_ROOT}/api/mahalle/delete-feature/`;
    const payload = { mahalle_id: String(mahalleId), key };
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    if (resp.status >= 400 || resp.data?.status !== 'success') {
      throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
    }
    return resp.data;
  }, []);
  // Mabar-specific helpers (مطابق با FeatureEditor)
  const mabarAddField = useCallback(async (mabaarId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mabar_id: Number(mabaarId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mabar/add-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    if (resp.status >= 400 || resp.data?.status !== 'success') {
      throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
    }
    return resp.data;
  }, []);
  const mabarUpdateFeature = useCallback(async (mabaarId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mabar_id: Number(mabaarId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mabar/update-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    return resp;
  }, []);
  const mabarDeleteField = useCallback(async (mabaarId, key) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const url = `${MAHALLE_API_ROOT}/api/mabar/delete-feature/`;
    const payload = { mabar_id: Number(mabaarId), key };
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    if (resp.status >= 400 || resp.data?.status !== 'success') {
      throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
    }
    return resp.data;
  }, []);
  // Existing parcels helper (مطابق با FeatureEditor)
  const addFieldToExternal = useCallback(async (parcelId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { parcel_id: String(parcelId), key, value };
    const response = await axios.post(`${API_BASE}/api/add-parcel-property`, payload, { headers, validateStatus: null });
    if (response.status >= 400 || response.data?.status !== 'success') {
      throw new Error(response.data?.error || `Upstream error ${response.status}`);
    }
    return response.data;
  }, []);
  const updateFieldInExternal = useCallback(async (parcelId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { parcel_id: String(parcelId), key, value };
    const response = await axios.post(`${API_BASE}/api/update-parcel-property`, payload, { headers, validateStatus: null });
    if (response.status >= 400 || response.data?.status !== 'success') {
      throw new Error(response.data?.error || `Upstream error ${response.status}`);
    }
    return response.data;
  }, []);
  const deleteFieldFromExternal = useCallback(async (parcelId, key) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { parcel_id: String(parcelId), key };
    const response = await axios.post(`${API_BASE}/api/delete-parcel-property`, payload, { headers, validateStatus: null });
    if (response.status >= 400 || response.data?.status !== 'success') {
      throw new Error(response.data?.error || `Upstream error ${response.status}`);
    }
    return response.data;
  }, []);
  // Socket connection - اتصال سوکت خالی برای نمایش تغییرات
  useEffect(() => {
    if (!activeLayerName) return;
    
    const token = localStorage.getItem('token') || null;
    const socket = io(API_BASE, {
      transports: ['websocket'],
      autoConnect: true,
      auth: token ? { token } : undefined,
    });
    
    // اتصال سوکت برقرار شده اما از به‌روزرسانی خودکار خودداری می‌کنیم
    const onLayerUpdated = (payload) => {
      try {
        if (payload?.layerName === activeLayerName) {
          console.log(`Layer ${activeLayerName} updated via socket`);
          
          // نمایش نوتیفیکیشن با دکمه برای به‌روزرسانی دستی
          toast.info(
            'لایه به‌روزرسانی شد. برای مشاهده تغییرات دکمه "به‌روزرسانی" را بزنید',
            {
              autoClose: false,
              closeOnClick: false,
              onClick: () => onRefresh?.(),
              className: 'cursor-pointer'
            }
          );
        }
      } catch (e) {
        console.error('Socket handler error', e);
      }
    };
    
    socket.on('layerUpdated', onLayerUpdated);
    
    // خالی کردن اتصال سوکت در هنگام unmount
    return () => {
      socket.off('layerUpdated', onLayerUpdated);
      socket.disconnect();
    };
  }, [activeLayerName, onRefresh]);
  
  // Wheel scroll handling
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const handleWheel = (e) => {
      e.stopPropagation();
      box.scrollTop += e.deltaY;
    };
    box.addEventListener('wheel', handleWheel, { passive: true });
    return () => box.removeEventListener('wheel', handleWheel);
  }, []);
  
  // تولید UID یکتا
  const featuresWithUid = useMemo(() => {
    return filteredFeatures.map((f, idx) => {
      const baseId = f.properties?.mahalle_ID ?? f.id ?? `idx-${idx}`;
      return { ...f, __uid: `${baseId}-${idx}` };
    });
  }, [filteredFeatures]);
  
  // فیلتر فیچرها بر اساس جستجو
  const filteredFeaturesByField = useMemo(() => {
    if (!searchQuery) return featuresWithUid;
    return featuresWithUid.filter(f => {
      if (searchField) {
        const value = f.properties?.[searchField] || '';
        return String(value).toLowerCase().includes(searchQuery.toLowerCase());
      }
      return (f.properties?.Name || '').toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [featuresWithUid, searchQuery, searchField]);
  
  // محاسبه رنگ فیچر
  const getFeatureColor = useCallback(
    (feature) => {
      const isMatch = searchQuery && filteredFeaturesByField.some(f => f.__uid === feature.__uid);
      if (!isMatch) return '';
      if (colorMode === 'uniform') {
        return '#ffff99';
      }
      if (!colorField || !feature.properties?.[colorField]) return '#ffff99';
      const values = filteredFeaturesByField
        .map(f => Number(f.properties?.[colorField]))
        .filter(v => !isNaN(v));
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const range = maxValue - minValue || 1;
      const value = Number(feature.properties[colorField]);
      if (isNaN(value)) return '#ffff99';
      if (colorMode === 'gradient') {
        const ratio = (value - minValue) / range;
        const hue = 60;
        const lightness = 80 - ratio * 30;
        return `hsl(${hue}, 100%, ${lightness}%)`;
      }
      if (colorMode === 'intensity') {
        const ratio = (value - minValue) / range;
        const opacity = 0.3 + ratio * 0.7;
        return `rgba(255, 255, 0, ${opacity})`;
      }
      return '#ffff99';
    },
    [colorMode, colorField, searchQuery, filteredFeaturesByField]
  );
  
  // Concurrency limiter (مطابق با FeatureEditor)
  const pLimit = useCallback((limit) => {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active >= limit || queue.length === 0) return;
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn()
        .then((v) => resolve(v))
        .catch((e) => reject(e))
        .finally(() => {
          active--;
          next();
        });
    };
    return (fn) =>
      new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      });
  }, []);
  
  // تغییر ویژگی‌ها
  const handlePropertyChange = useCallback((uid, key, value) => {
    setEditedProperties(prev => ({
      ...prev,
      [uid]: { ...prev[uid], [key]: value },
    }));
  }, [setEditedProperties]);
  
  // افزودن فیلد جدید به تمام فیچرهای فیلتر شده
  const handleBulkAddField = useCallback(async () => {
    if (!newFieldName) {
      toast.warn('نام فیلد را وارد کنید');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(newFieldName) || newFieldName === '_id') {
      toast.warn('نام فیلد معتبر نیست (فقط حروف انگلیسی، عدد، _ یا -، و غیر از _id)');
      return;
    }
    let parsedValue;
    switch (newFieldType) {
      case 'number':
        parsedValue = Number(newFieldValue);
        if (isNaN(parsedValue)) {
          toast.warn('مقدار باید عدد باشد');
          return;
        }
        break;
      case 'boolean':
        parsedValue = String(newFieldValue).toLowerCase() === 'true';
        break;
      case 'string':
      default:
        if (newFieldValue === '') {
          toast.warn('مقدار نمی‌تواند خالی باشد');
          return;
        }
        parsedValue = newFieldValue;
        break;
    }
    if (filteredFeaturesByField.length === 0) {
      toast.info('هیچ فیچری برای افزودن فیلد انتخاب نشده است');
      return;
    }
    setBulkLoading(true);
    try {
      const limit = pLimit(8);
      const tasks = filteredFeaturesByField.map(feature =>
        limit(async () => {
          const featureId = feature.properties?.OBJECTID || feature.id || feature.properties?.mahalle_ID;
          if (!featureId) return { uid: feature.__uid, error: 'شناسه فیچر نامعتبر است' };
          try {
            if (activeLayerName === 'main-mahalles') {
              await mahalleAddField(featureId, newFieldName, parsedValue);
            } else if (activeLayerName === 'main-mabar') {
              await mabarAddField(featureId, newFieldName, parsedValue);
            } else if (activeLayerName === 'main-parcels') {
              await addFieldToExternal(featureId, newFieldName, parsedValue);
            } else {
              const token = localStorage.getItem('token');
              const headers = { 
                Authorization: `Bearer ${token}`, 
                'Content-Type': 'application/json' 
              };
              const payload = { 
                layerName: activeLayerName,
                id: String(featureId),
                properties: { ...feature.properties, [newFieldName]: parsedValue },
                storage: 'local'
              };
              const resp = await axios.post(`${API_BASE}/api/update-feature`, payload, { headers, validateStatus: null });
              if (resp.status >= 400) {
                throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
              }
            }
            return { uid: feature.__uid, result: { status: 'success' } };
          } catch (err) {
            return { uid: feature.__uid, error: err.message || 'خطای ناشناخته' };
          }
        })
      );
      const results = await Promise.all(tasks);
      const successes = results.filter(r => r.result?.status === 'success');
      const failures = results.filter(r => r.error);
      // به روزرسانی وضعیت محلی
      successes.forEach(({ uid }) => {
        handlePropertyChange(uid, newFieldName, parsedValue);
      });
      setNewFieldsMap(prev => ({ ...prev, [newFieldName]: true }));
      setNewFieldName('');
      setNewFieldValue('');
      setNewFieldType('string');
      if (successes.length > 0) {
        toast.success(`${successes.length} فیلد ${newFieldName} با موفقیت اضافه شد`);
      }
      if (failures.length > 0) {
        toast.warn(`${failures.length} خطا در افزودن فیلد ${newFieldName} — لاگ کنسول را بررسی کنید`);
        console.error('Bulk add field failures:', failures);
      }
    } catch (error) {
      console.error('خطا در افزودن فیلدهای bulk:', error);
      toast.error('خطا در افزودن فیلدها');
    } finally {
      setBulkLoading(false);
    }
  }, [
    newFieldName, newFieldValue, newFieldType, 
    filteredFeaturesByField, activeLayerName, 
    handlePropertyChange, pLimit,
    mahalleAddField, mabarAddField, addFieldToExternal
  ]);
  
  // ویرایش bulk
  const handleBulkEdit = useCallback(async () => {
    if (!bulkEditField || bulkEditValue === '') {
      toast.warn('فیلد و مقدار ویرایش bulk را وارد کنید');
      return;
    }
    if (filteredFeaturesByField.length === 0) {
      toast.info('هیچ فیچری برای ویرایش انتخاب نشده است');
      return;
    }
    setBulkLoading(true);
    try {
      const limit = pLimit(8);
      const tasks = filteredFeaturesByField.map(feature =>
        limit(async () => {
          const featureId = feature.properties?.OBJECTID || feature.id || feature.properties?.mahalle_ID;
          if (!featureId) return { uid: feature.__uid, error: 'شناسه فیچر نامعتبر است' };
          try {
            if (activeLayerName === 'main-mahalles') {
              await mahalleUpdateFeature(featureId, bulkEditField, bulkEditValue);
            } else if (activeLayerName === 'main-mabar') {
              await mabarUpdateFeature(featureId, bulkEditField, bulkEditValue);
            } else if (activeLayerName === 'main-parcels') {
              await updateFieldInExternal(featureId, bulkEditField, bulkEditValue);
            } else {
              const token = localStorage.getItem('token');
              const headers = { 
                Authorization: `Bearer ${token}`, 
                'Content-Type': 'application/json' 
              };
              const payload = { 
                layerName: activeLayerName,
                id: String(featureId),
                properties: { ...feature.properties, [bulkEditField]: bulkEditValue },
                storage: 'local'
              };
              const resp = await axios.post(`${API_BASE}/api/update-feature`, payload, { headers, validateStatus: null });
              if (resp.status >= 400) {
                throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
              }
            }
            handlePropertyChange(feature.__uid, bulkEditField, bulkEditValue);
            return { uid: feature.__uid, result: { status: 'success' } };
          } catch (err) {
            return { uid: feature.__uid, error: err.message || 'خطای ناشناخته' };
          }
        })
      );
      const results = await Promise.all(tasks);
      const successes = results.filter(r => !r.error);
      setBulkEditField('');
      setBulkEditValue('');
      if (successes.length > 0) {
        toast.success(`${successes.length} فیچر با موفقیت ویرایش شد`);
      } else {
        toast.error('هیچ فیچری ویرایش نشد');
      }
    } catch (error) {
      console.error('خطا در ویرایش bulk:', error);
      toast.error('خطا در ویرایش bulk');
    } finally {
      setBulkLoading(false);
    }
  }, [
    bulkEditField, bulkEditValue, filteredFeaturesByField, 
    activeLayerName, handlePropertyChange, pLimit,
    mahalleUpdateFeature, mabarUpdateFeature, updateFieldInExternal
  ]);
  
  // جستجو
  const handleSearch = useCallback(() => {
    if (!searchQuery) {
      toast.info('لطفاً عبارت جستجو را وارد کنید');
      return;
    }
    if (filteredFeaturesByField.length === 0) {
      toast.info('موردی یافت نشد');
    } else {
      const firstMatch = filteredFeaturesByField[0];
      const element = document.getElementById(`feature-${firstMatch.__uid}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.transition = 'background-color 0.5s';
        element.style.backgroundColor = getFeatureColor(firstMatch);
        setTimeout(() => (element.style.backgroundColor = ''), 2000);
      }
    }
  }, [searchQuery, filteredFeaturesByField, getFeatureColor]);
  
  // به‌روزرسانی فیچرها
  const updateFeatures = useCallback(async () => {
    if (!activeLayerName) {
      toast.error('لایه فعال یافت نشد!');
      return;
    }
    if (Object.keys(editedProperties).length === 0) {
      toast.info('هیچ تغییری برای ذخیره نیست');
      return;
    }
    setIsProcessing(true);
    try {
      const limit = pLimit(8);
      const tasks = featuresWithUid
        .filter(f => editedProperties[f.__uid])
        .map(feature =>
          limit(async () => {
            const featureId = feature.properties?.OBJECTID || feature.id || feature.properties?.mahalle_ID;
            const updates = editedProperties[feature.__uid];
            try {
              if (activeLayerName === 'main-mahalles') {
                // اجرای چندین آپدیت به صورت موازی برای هر فیلد
                const updateTasks = Object.entries(updates).map(([k, v]) =>
                  mahalleUpdateFeature(featureId, k, v)
                );
                await Promise.all(updateTasks);
              } else if (activeLayerName === 'main-mabar') {
                // اجرای چندین آپدیت به صورت موازی برای هر فیلد
                const updateTasks = Object.entries(updates).map(([k, v]) =>
                  mabarUpdateFeature(featureId, k, v)
                );
                await Promise.all(updateTasks);
              } else if (activeLayerName === 'main-parcels') {
                const updateTasks = Object.entries(updates).map(([k, v]) =>
                  updateFieldInExternal(featureId, k, v)
                );
                await Promise.all(updateTasks);
              } else {
                const token = localStorage.getItem('token');
                const headers = { 
                  Authorization: `Bearer ${token}`, 
                  'Content-Type': 'application/json' 
                };
                const payload = { 
                  layerName: activeLayerName, 
                  id: String(featureId), 
                  properties: { 
                    ...feature.properties, 
                    ...updates,
                    mahalle_ID: feature.properties?.mahalle_ID ?? featureId 
                  },
                  storage: 'local'
                };
                const resp = await axios.post(`${API_BASE}/api/update-feature`, payload, { headers, validateStatus: null });
                if (resp.status >= 400) {
                  throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
                }
              }
              return { uid: feature.__uid, status: 'success' };
            } catch (err) {
              return { uid: feature.__uid, error: err.message || 'خطای ناشناخته' };
            }
          })
        );
      const results = await Promise.all(tasks);
      const successes = results.filter(r => r.status === 'success');
      if (successes.length > 0) {
        toast.success(`${successes.length} فیچر با موفقیت به‌روزرسانی شد`);
        // onRefresh?.(); // این خط حذف شد
        setEditedProperties({});
      } else {
        toast.error('هیچ فیچری به‌روزرسانی نشد');
      }
    } catch (error) {
      console.error(error);
      const msg = error?.response?.data?.error || error?.response?.data?.details || error.message || 'خطا در به‌روزرسانی';
      toast.error(`خطا در به‌روزرسانی فیچرها: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [
    activeLayerName, editedProperties, featuresWithUid, setEditedProperties, 
    pLimit, mahalleUpdateFeature, mabarUpdateFeature, updateFieldInExternal
  ]);
  
  // حذف فیچرها
  const deleteFiltered = useCallback(
    async (keepFiltered = true) => {
      if (!activeLayerName) {
        toast.error('لایه فعال یافت نشد!');
        return;
      }
      if (!confirm(`آیا مطمئن هستید که می‌خواهید ${keepFiltered ? 'فیلترشده‌ها' : 'غیرفیلترشده‌ها'} را حذف کنید؟ (${keepFiltered ? filteredFeaturesByField.length : featuresWithUid.length - filteredFeaturesByField.length} مورد)`)) {
        return;
      }
      setIsProcessing(true);
      try {
        const featuresToDelete = keepFiltered
          ? filteredFeaturesByField
          : featuresWithUid.filter(
              f =>
                !filteredFeaturesByField.some(
                  ff => String(ff.properties?.mahalle_ID ?? ff.id) === String(f.properties?.mahalle_ID ?? f.id)
                )
            );
        const limit = pLimit(8);
        const tasks = featuresToDelete.map(feature =>
          limit(async () => {
            const featureId = feature.properties?.mahalle_ID ?? feature.id;
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
            const payload = { layerName: activeLayerName, featureId: String(featureId) };
            const resp = await axios.post(`${API_BASE}/api/delete-feature`, payload, { headers, validateStatus: null });
            return { uid: feature.__uid, result: resp.data };
          })
        );
        const results = await Promise.all(tasks);
        const successes = results.filter(r => r.result?.status === 'success');
        if (successes.length > 0) {
          toast.success(`${successes.length} فیچر حذف شد`);
          // onRefresh?.(); // این خط حذف شد
        } else {
          toast.error('هیچ فیچری حذف نشد');
        }
      } catch (error) {
        console.error(error);
        const msg = error?.response?.data?.error || error?.response?.data?.details || error.message || 'خطا در حذف';
        toast.error(`خطا در حذف فیچرها: ${msg}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [activeLayerName, filteredFeaturesByField, featuresWithUid, pLimit]
  );
  
  // محاسبه فیلد
  const calculateField = useCallback(() => {
    if (!selectedField || !fieldFormula) {
      toast.error('فیلد و فرمول را وارد کنید!');
      return;
    }
    if (filteredFeaturesByField.length === 0) {
      toast.info('هیچ فیچری با فیلتر انتخاب‌شده یافت نشد');
      return;
    }
    let fn;
    try {
      fn = new Function('value', `return ${fieldFormula};`);
    } catch (err) {
      toast.error('فرمول نامعتبر است');
      return;
    }
    setIsProcessing(true);
    try {
      filteredFeaturesByField.forEach(feature => {
        const originalVal = feature.properties?.[selectedField];
        const numeric = Number(originalVal);
        if (!isNaN(numeric)) {
          const result = fn(numeric);
          if (!Number.isNaN(Number(result))) {
            handlePropertyChange(feature.__uid, selectedField, result);
          }
        }
      });
      toast.success(`فیلد جدید برای ${filteredFeaturesByField.length} فیچر محاسبه شد`);
    } catch (error) {
      console.error(error);
      toast.error('خطا در محاسبه فیلد');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedField, fieldFormula, filteredFeaturesByField, handlePropertyChange]);
  
  // دانلود GeoJSON
  const downloadGeoJSON = useCallback(() => {
    const updatedFeatures = featuresWithUid.map(feature => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { ...feature.properties, ...editedProperties[feature.__uid] },
    }));
    const geojson = {
      type: 'FeatureCollection',
      features: updatedFeatures,
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeLayerName || 'features'}_edited.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('فایل GeoJSON دانلود شد');
  }, [featuresWithUid, editedProperties, activeLayerName]);
  
  // حذف فیلدها (toggle)
  const toggleDeleteMode = useCallback(() => {
    if (!deleteMode) {
      setDeleteMode(true);
      setSelectedToDelete({});
      return;
    }
    const keys = Object.keys(selectedToDelete).filter((k) => selectedToDelete[k]);
    if (keys.length === 0) {
      setDeleteMode(false);
      toast.info('هیچ فیلدی برای حذف انتخاب نشده نیست');
      return;
    }
    // open review modal
    setShowReviewModal(true);
    // position & size
    const w = Math.max(MIN_WIDTH, Math.min(520, MAX_WIDTH));
    const h = Math.max(MIN_HEIGHT, Math.min(320, MAX_HEIGHT));
    setReviewModalSize({ width: w, height: h });
    const bottomGap = -7;
    const left = Math.max(12, (window.innerWidth - w) / 2);
    const top = Math.max(12, window.innerHeight - h - bottomGap);
    setReviewModalPos({ left, top });
  }, [deleteMode, selectedToDelete]);
  
  const toggleSelectField = useCallback((field) => {
    setSelectedToDelete((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);
  
  const handleConfirmDelete = useCallback(async () => {
    const keysToDelete = Object.keys(selectedToDelete).filter((k) => selectedToDelete[k]);
    if (keysToDelete.length === 0) {
      toast.info('هیچ فیلدی برای حذف انتخاب نشده است');
      setShowReviewModal(false);
      return;
    }
    setProcessingDelete(true);
    try {
      const limit = pLimit(8);
      const tasks = filteredFeaturesByField.map(feature =>
        limit(async () => {
          const featureId = feature.properties?.OBJECTID || feature.id || feature.properties?.mahalle_ID;
          if (!featureId) return { uid: feature.__uid, error: 'شناسه نامعتبر' };
          try {
            const deleteResults = [];
            for (const key of keysToDelete) {
              if (activeLayerName === 'main-mahalles') {
                await mahalleDeleteField(featureId, key);
                deleteResults.push({ key, success: true });
              } else if (activeLayerName === 'main-mabar') {
                await mabarDeleteField(featureId, key);
                deleteResults.push({ key, success: true });
              } else if (activeLayerName === 'main-parcels') {
                await deleteFieldFromExternal(featureId, key);
                deleteResults.push({ key, success: true });
              } else {
                const token = localStorage.getItem('token');
                const headers = { 
                  Authorization: `Bearer ${token}`, 
                  'Content-Type': 'application/json' 
                };
                const payload = { 
                  layerName: activeLayerName,
                  id: String(featureId),
                  properties: { [key]: null },
                  storage: 'local'
                };
                const resp = await axios.post(`${API_BASE}/api/update-feature`, payload, { headers, validateStatus: null });
                if (resp.status < 400) {
                  deleteResults.push({ key, success: true });
                } else {
                  deleteResults.push({ key, success: false, error: resp.data?.error || `Error ${resp.status}` });
                }
              }
            }
            // بررسی موفقیت‌های حذف
            const successKeys = deleteResults.filter(r => r.success).map(r => r.key);
            return { uid: feature.__uid, successKeys };
          } catch (err) {
            console.error(`Error deleting fields for feature ${featureId}:`, err);
            return { uid: feature.__uid, successKeys: [] };
          }
        })
      );
      const results = await Promise.all(tasks);
      const totalSuccesses = results.reduce((sum, r) => sum + (r.successKeys?.length || 0), 0);
      if (totalSuccesses > 0) {
        results.forEach(({ uid, successKeys }) => {
          successKeys?.forEach(key => {
            setEditedProperties(prev => {
              const featureEdits = { ...prev[uid] };
              delete featureEdits[key];
              return { ...prev, [uid]: Object.keys(featureEdits).length ? featureEdits : undefined };
            });
          });
        });
        toast.success(`${totalSuccesses} فیلد با موفقیت حذف شد`);
      } else {
        toast.error('هیچ فیچری حذف نشد');
      }
      setShowReviewModal(false);
      setDeleteMode(false);
      setSelectedToDelete({});
    } catch (error) {
      console.error('Error during bulk delete:', error);
      toast.error('خطا در حذف فیلدها');
    } finally {
      setProcessingDelete(false);
    }
  }, [
    selectedToDelete, filteredFeaturesByField, activeLayerName, setEditedProperties, 
    pLimit, mahalleDeleteField, mabarDeleteField, deleteFieldFromExternal
  ]);
  
  const handleCancelDelete = useCallback(() => {
    setShowReviewModal(false);
  }, []);
  
  const fields = featuresWithUid[0] ? Object.keys(featuresWithUid[0].properties || {}) : [];
  const numericFields = fields.filter(field => 
    featuresWithUid.some(f => !isNaN(Number(f.properties?.[field])))
  );
  
  const hasChanges = Object.keys(editedProperties).length > 0;
  const selectedFieldsCount = Object.values(selectedToDelete).filter(Boolean).length;
  
  /* ---------- Review Modal Drag & Resize Handlers ---------- */
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDraggingReview) return;
      e.preventDefault();
      const dx = e.clientX - reviewLastMouse.x;
      const dy = e.clientY - reviewLastMouse.y;
      setReviewLastMouse({ x: e.clientX, y: e.clientY });
      setReviewModalPos(prev => {
        const newLeft = Math.min(window.innerWidth - 40, Math.max(0, (prev.left ?? 0) + dx));
        const newTop = Math.min(window.innerHeight - 40, Math.max(0, (prev.top ?? 0) + dy));
        return { left: newLeft, top: newTop };
      });
    };
    
    const onMouseUp = () => {
      if (isDraggingReview) setIsDraggingReview(false);
      if (isResizingReview) setIsResizingReview(false);
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseleave', onMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseleave', onMouseUp);
    };
  }, [isDraggingReview, reviewLastMouse, isResizingReview]);
  
  const startDragReview = (e) => {
    e.preventDefault();
    setIsDraggingReview(true);
    setReviewLastMouse({ x: e.clientX, y: e.clientY });
  };
  
  useEffect(() => {
    const onResizeMove = (e) => {
      if (!isResizingReview) return;
      e.preventDefault();
      const dx = e.clientX - reviewLastMouse.x;
      const dy = e.clientY - reviewLastMouse.y;
      setReviewLastMouse({ x: e.clientX, y: e.clientY });
      setReviewModalSize(prev => {
        let newW = prev.width + dx;
        let newH = prev.height + dy;
        newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newW));
        newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newH));
        return { width: newW, height: newH };
      });
    };
    
    const onResizeEnd = () => { if (isResizingReview) setIsResizingReview(false); };
    
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    
    return () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
    };
  }, [isResizingReview, reviewLastMouse]);
  
  const startResizeReview = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingReview(true);
    setReviewLastMouse({ x: e.clientX, y: e.clientY });
  };
  
  // quick toggle size for review modal
  const toggleReviewSize = () => {
    setReviewModalSize(prev => {
      if (prev.width <= 520) {
        const w = Math.min(900, MAX_WIDTH);
        const h = Math.min(520, MAX_HEIGHT);
        setReviewModalPos({ left: Math.max(12, (window.innerWidth - w) / 2), top: Math.max(12, (window.innerHeight - h) / 2) });
        return { width: w, height: h };
      } else {
        const w = 520, h = 320;
        setReviewModalPos({ left: Math.max(12, (window.innerWidth - w) / 2), top: Math.max(12, (window.innerHeight - h) / 2) });
        return { width: w, height: h };
      }
    });
  };
  
  /* Close modal on ESC (helps keyboard users and avoids focus trapping) */
  useEffect(() => {
    if (!showReviewModal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowReviewModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showReviewModal]);
  
  /* --------------------------------------------------------- */
  return (
    <div className="max-w-10/10 min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 font-vazir">
      {/* Loading Spinner */}
      {isProcessing && (
        <div className="fixed top-4 right-4 z-[1001] bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700">
          <svg className="animate-spin h-6 w-6 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}
      <div className="max-w-10/10 mx-auto">
        {/* Search & Filter Panel */}
        <motion.div
          className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >          
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-500" />
            جستجو و فیلتر
          </h2>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>نمایش: {filteredFeaturesByField.length}</span>
              <span className="hidden sm:inline">•</span>
              <span>کل: {featuresWithUid.length}</span>
              {hasChanges && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="text-blue-600 dark:text-blue-400">تغییرات: {Object.keys(editedProperties).length}</span>
                </>
              )}
              {deleteMode && selectedFieldsCount > 0 && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="text-red-600 dark:text-red-400">حذف: {selectedFieldsCount}</span>
                </>
              )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                عبارت جستجو
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="جستجو در نام یا فیلدهای مشخص..."
                  className="w-full pr-10 pl-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isProcessing || bulkLoading}
                />
                <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
              </div>
            </div>
            {/* Search Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                فیلد جستجو
              </label>
              <select
                value={searchField}
                onChange={e => setSearchField(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={isProcessing || bulkLoading}
              >
                <option value="">همه فیلدها</option>
                {fields.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </div>
            {/* Search Button */}
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={isProcessing || bulkLoading || !searchQuery}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                جستجو
              </button>
            </div>
          </div>
          {/* Filter Options */}
          {filteredFeaturesByField.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {colorMode !== 'uniform' && (
                  <div className="flex items-center gap-2">
                    <label className="text-gray-700 dark:text-gray-300">فیلد:</label>
                    <select
                      value={colorField}
                      onChange={e => setColorField(e.target.value)}
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={isProcessing || bulkLoading}
                    >
                      <option value="">انتخاب کنید</option>
                      {numericFields.map(field => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
        {/* Main Actions Bar */}
        <motion.div
          className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bars3Icon className="w-5 h-5 text-gray-500" />
            عملیات اصلی
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"> {/* تغییر از 4 به 5 ستون */}
            {/* Save Changes */}
            <button
              onClick={updateFeatures}
              disabled={isProcessing || bulkLoading || !hasChanges}
              className={`px-6 py-3 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all ${
                hasChanges
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500 shadow-md'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>ذخیره تغییرات</span>
              {hasChanges && <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{Object.keys(editedProperties).length}</span>}
            </button>
            
            {/* به‌روزرسانی دستی */}
            <button
              onClick={() => onRefresh?.()}
              disabled={isProcessing || bulkLoading}
              className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 focus:ring-2 focus:ring-gray-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span>به‌روزرسانی</span>
            </button>
            
            {/* Delete Filtered Features */}
            <button
              onClick={() => deleteFiltered(true)}
              disabled={isProcessing || bulkLoading || filteredFeaturesByField.length === 0}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:ring-2 focus:ring-red-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              <TrashIcon className="w-4 h-4" />
              <span>حذف فیلترشده‌ها</span>
              <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{filteredFeaturesByField.length}</span>
            </button>
            {/* Delete Non-Filtered */}
            <button
              onClick={() => deleteFiltered(false)}
              disabled={isProcessing || bulkLoading || featuresWithUid.length === filteredFeaturesByField.length}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 focus:ring-2 focus:ring-red-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              <TrashIcon className="w-4 h-4" />
              <span>حذف غیرفیلتر</span>
              <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                {featuresWithUid.length - filteredFeaturesByField.length}
              </span>
            </button>
            {/* Download GeoJSON */}
            <button
              onClick={downloadGeoJSON}
              disabled={isProcessing || bulkLoading}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 focus:ring-2 focus:ring-indigo-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>دانلود GeoJSON</span>
            </button>
          </div>
          {/* Bulk Operations Toggle */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowBulkPanel(!showBulkPanel)}
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <Bars3Icon className="w-4 h-4" />
              {showBulkPanel ? 'مخفی کردن' : 'نمایش'} عملیات گروهی
            </button>
          </div>
        </motion.div>
        {/* Bulk Operations Panel */}
        <AnimatePresence>
          {showBulkPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                عملیات گروهی
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Add New Field */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <PlusIcon className="w-4 h-4 text-blue-500" />
                    افزودن فیلد جدید
                  </h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="نام فیلد جدید"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={bulkLoading || isProcessing}
                    />
                    <div className="flex gap-2">
                      <input
                        type={newFieldType === 'number' ? 'number' : 'text'}
                        placeholder="مقدار پیش‌فرض"
                        value={newFieldValue}
                        onChange={(e) => setNewFieldValue(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        disabled={bulkLoading || isProcessing}
                      />
                      <select
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value)}
                        className="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        disabled={bulkLoading || isProcessing}
                      >
                        <option value="string">رشته</option>
                        <option value="number">عدد</option>
                        <option value="boolean">بولین</option>
                      </select>
                    </div>
                    <button
                      onClick={handleBulkAddField}
                      disabled={bulkLoading || isProcessing || !newFieldName || !newFieldValue}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {bulkLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          در حال افزودن...
                        </>
                      ) : (
                        <>
                          <PlusIcon className="w-4 h-4" />
                          افزودن به همه
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {/* Bulk Edit */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 text-green-500" />
                    ویرایش گروهی
                  </h3>
                  <div className="space-y-2">
                    <select
                      value={bulkEditField}
                      onChange={(e) => setBulkEditField(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={bulkLoading || isProcessing}
                    >
                      <option value="">انتخاب فیلد</option>
                      {fields.map(field => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="مقدار جدید"
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={bulkLoading || isProcessing}
                    />
                    <button
                      onClick={handleBulkEdit}
                      disabled={bulkLoading || isProcessing || !bulkEditField || !bulkEditValue}
                      className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:ring-2 focus:ring-green-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {bulkLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          در حال ویرایش...
                        </>
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          اعمال به همه
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {/* Field Delete Mode - با مودال داخل */} 
                <div className="space-y-3 relative">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <TrashIcon className="w-4 h-4 text-red-500" />
                    حذف فیلدها
                  </h3>
                  {/* Delete Mode Toggle Button */}
                  <button
                    onClick={toggleDeleteMode}
                    disabled={processingDelete || bulkLoading || isProcessing}
                    className={`w-full px-4 py-2 rounded text-white flex items-center justify-center gap-2 transition-all ${
                      deleteMode 
                        ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500' 
                        : 'bg-rose-600 hover:bg-rose-700 focus:ring-2 focus:ring-rose-500'
                    } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                  >
                    <TrashIcon className="w-4 h-4" />
                    {deleteMode ? `تایید برای حذف` : 'فعال کردن حذف'}
                    {deleteMode && selectedFieldsCount > 0 && (
                      <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{selectedFieldsCount}</span>
                    )}
                  </button>
                  {deleteMode && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 text-center mb-2">
                      {selectedFieldsCount} فیلد انتخاب شده
                    </div>
                  )}
                  {/* Review Modal (draggable & resizable, PORTALLED, no blocking backdrop) */}
                  {showReviewModal && createPortal(
                    <AnimatePresence>
                      <motion.div
                        key="review-modal-wrapper"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2000] pointer-events-none"
                        aria-hidden={false}
                      >
                        {/* The wrapper has pointer-events-none so clicks pass through except the actual modal */}
                        <motion.div
                          key="review-modal"
                          initial={{ scale: 0.98, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.98, opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="pointer-events-auto"
                          style={{
                            position: 'absolute',
                            left: reviewModalPos.left ?? (window.innerWidth - reviewModalSize.width) / 2,
                            top: reviewModalPos.top ?? (window.innerHeight - reviewModalSize.height) / 2,
                            width: reviewModalSize.width,
                            height: reviewModalSize.height,
                          }}
                        >
                          <div
                            ref={reviewDragRef}
                            className="relative bg-white dark:bg-gray-800 rounded-xl p-0 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
                          >
                            {/* Header (drag handle) */}
                            <div
                              onMouseDown={startDragReview}
                              className="px-4 py-2 cursor-move flex items-center justify-between bg-gray-100 dark:bg-gray-900/40"
                              style={{ userSelect: 'none' }}
                            >
                              <div>
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">تأیید حذف فیلدها</div>
                                <div className="text-xs text-gray-600 dark:text-gray-300">
                                  حذف {selectedFieldsCount} فیلد از {filteredFeaturesByField.length} فیچر — قابل جابه‌جایی و تغییر اندازه
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={toggleReviewSize} title="کوچک/بزرگ" className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm">⤢</button>
                                <button onClick={() => setShowReviewModal(false)} title="بستن" className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm">✕</button>
                              </div>
                            </div>
                            {/* Body */}
                            <div className="p-4 flex-1 overflow-auto bg-white dark:bg-gray-800">
                              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                                  این عمل <span className="font-semibold">غیرقابل بازگشت</span> است و{' '}
                                  <span className="font-semibold">{selectedFieldsCount}</span> فیلد از{' '}
                                  <span className="font-semibold">{filteredFeaturesByField.length}</span> فیچر حذف خواهد شد:
                                </p>
                                <div className="max-h-40 overflow-y-auto space-y-2">
                                  {Object.keys(selectedToDelete)
                                    .filter(k => selectedToDelete[k])
                                    .map((key) => (
                                    <div key={key} className="flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded">
                                      <input
                                        type="checkbox"
                                        checked={!!selectedToDelete[key]}
                                        onChange={() => toggleSelectField(key)}
                                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                                      />
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">{key}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Action buttons */}
                              <div className="flex justify-end gap-3 pt-2">
                                <button
                                  onClick={handleCancelDelete}
                                  disabled={processingDelete}
                                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
                                >
                                  <XMarkIcon className="w-4 h-4 inline mr-2" />
                                  انصراف
                                </button>
                                <button
                                  onClick={handleConfirmDelete}
                                  disabled={processingDelete || selectedFieldsCount === 0}
                                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                  {processingDelete ? (
                                    <>
                                      <svg className="animate-spin -mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      در حال حذف...
                                    </>
                                  ) : (
                                    <>
                                      <TrashIcon className="w-4 h-4" />
                                      تأیید حذف ({selectedFieldsCount})
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            {/* Footer: resize handle */}
                            <div className="h-6 flex items-center justify-end px-2 bg-gray-50 dark:bg-gray-900/10">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mr-auto pl-2">کشیدن هدر برای جابجایی — کشیدن گوشه برای تغییر اندازه</div>
                              <div
                                ref={reviewResizeRef}
                                onMouseDown={startResizeReview}
                                className="w-5 h-5 cursor-se-resize rounded-sm flex items-center justify-center"
                                title="تغییر اندازه"
                                style={{ userSelect: 'none' }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-gray-300">
                                  <path d="M21 15v4a2 2 0 0 1-2 2h-4"></path>
                                  <path d="M3 9l6 6"></path>
                                  <path d="M14 3h7v7"></path>
                                </svg>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    </AnimatePresence>,
                    document.body
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Data Table */}
        <div className="max-h-[60vh] overflow-y-auto mb-6" ref={boxRef}>
          <table className="w-full table-auto border-collapse border border-gray-200 dark:border-gray-600">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
                {fields.map(field => (
                  <th 
                    key={field} 
                    className="p-2 text-sm font-semibold text-gray-700 dark:text-gray-100 border border-gray-200 dark:border-gray-600 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span>
                        {field}
                        {newFieldsMap[field] && (
                          <span className="text-xs text-blue-600 ml-1">(جدید)</span>
                        )}
                      </span>
                      {/* Delete checkbox in delete mode */}
                      {deleteMode && (
                        <input
                          type="checkbox"
                          checked={!!selectedToDelete[field]}
                          onChange={() => toggleSelectField(field)}
                          className="ml-2 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <AnimatePresence>
                {filteredFeaturesByField.map(feature => (
                  <motion.tr
                    key={feature.__uid}
                    id={`feature-${feature.__uid}`}
                    style={{ backgroundColor: getFeatureColor(feature) }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {fields.map(key => {
                      const hasValue = feature.properties[key] !== undefined && feature.properties[key] !== null;
                      const currentValue = editedProperties[feature.__uid]?.[key] ?? feature.properties[key];
                      const isEdited = editedProperties[feature.__uid]?.[key] !== undefined && 
                                      editedProperties[feature.__uid]?.[key] !== feature.properties[key];
                      return (
                        <td key={`${feature.__uid}-${key}`} className="p-2 border border-gray-200 dark:border-gray-600 relative">
                          {typeof currentValue === 'boolean' ? (
                            <input
                              type="checkbox"
                              checked={!!currentValue}
                              onChange={e => handlePropertyChange(feature.__uid, key, e.target.checked)}
                              className="p-2 rounded border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500"
                              disabled={deleteMode || isProcessing || bulkLoading}
                            />
                          ) : (
                            <div className="relative">
                              <input
                                type={typeof feature.properties[key] === 'number' ? 'number' : 'text'}
                                value={currentValue ?? ''}
                                onChange={e => handlePropertyChange(
                                  feature.__uid, 
                                  key, 
                                  e.target.type === 'number' 
                                    ? (e.target.value === '' ? '' : Number(e.target.value))
                                    : e.target.value
                                )}
                                className={`w-full p-1 border rounded-md focus:ring-2 focus:ring-blue-500 transition-colors ${
                                  hasValue 
                                    ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700' 
                                    : 'border-dashed border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800 italic text-gray-500'
                                } ${isEdited ? 'ring-2 ring-green-300' : ''} ${deleteMode || isProcessing || bulkLoading ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                placeholder={hasValue ? '' : 'فیلد خالی'}
                                disabled={deleteMode || isProcessing || bulkLoading}
                                aria-label={`ویرایش ${key} برای فیچر ${feature.properties?.[groupByField] || 'بدون مقدار'}`}
                              />
                              {/* Edit indicator */}
                              {isEdited && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
                {filteredFeaturesByField.length === 0 && (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-gray-50 dark:bg-gray-800"
                  >
                    <td colSpan={fields.length} className="p-8 text-center text-gray-500 dark:text-gray-400">
                      {searchQuery ? 'موردی یافت نشد' : 'هیچ فیچری برای نمایش وجود ندارد'}
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {/* Calculate Field Section */}
        {numericFields.length > 0 && (
          <motion.div
            className="mt-6 bg-green-50 dark:bg-green-900/20 rounded-xl p-4 sm:p-6 border border-green-200 dark:border-green-800"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CalculatorIcon className="w-5 h-5 text-green-600" />
              محاسبه خودکار فیلد
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  فیلد مقصد
                </label>
                <select
                  value={selectedField}
                  onChange={e => {
                    setSelectedField(e.target.value);
                    if (!fieldFormula || String(fieldFormula).trim() === '') {
                      setFieldFormula('value');
                    }
                  }}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isProcessing || bulkLoading}
                >
                  <option value="">انتخاب فیلد</option>
                  {numericFields.map(field => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  فرمول محاسبه
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="مثال: value * 2 یا value + 100"
                    value={fieldFormula}
                    onChange={e => setFieldFormula(e.target.value)}
                    className="w-full pr-10 p-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    disabled={isProcessing || bulkLoading}
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                    value
                  </span>
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={calculateField}
                  disabled={isProcessing || bulkLoading || !selectedField || !fieldFormula}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:ring-2 focus:ring-green-500 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CalculatorIcon className="w-4 h-4" />
                  محاسبه ({filteredFeaturesByField.length})
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
export default React.memo(DataEditing);
