// FeatureEditor.jsx
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { io } from 'socket.io-client';
import { redirectToLogin, API_BASE_URL } from '../services/api';

const API_BASE = API_BASE_URL;
const MAHALLE_API_ROOT = API_BASE;

const FeatureEditor = ({ feature, layerName, layerVersion = null, storage, onSave, onClose }) => {
  const [properties, setProperties] = useState({ ...feature.properties });
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldType, setNewFieldType] = useState('string');
  const [loading, setLoading] = useState(false);
  const [newFieldsMap, setNewFieldsMap] = useState({});
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [processingDelete, setProcessingDelete] = useState(false);
  const boxRef = useRef(null);

  console.debug('FeatureEditor render', { layerName, loading, deleteMode });



  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    // برای رویدادهای اسکرول دسکتاپ (wheel)
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.scrollTop += e.deltaY;
    };

    // برای رویدادهای لمسی موبایل
    let touchStartY = 0;
    let isDragging = false;

    const handleTouchStart = (e) => {
      // فقط برای یک انگشت
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        isDragging = false;
        e.stopPropagation();
      }
    };

    const handleTouchMove = (e) => {
      // اگر بیش از یک انگشت استفاده شود، خروج
      if (e.touches.length !== 1) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;

      // اگر حرکت کافی باشد، آن را اسکرول در نظر بگیر
      if (Math.abs(deltaY) > 5) {
        isDragging = true;
        e.preventDefault(); // جلوگیری از رفتار پیش‌فرض (حرکت نقشه)
        e.stopPropagation();

        box.scrollTop += deltaY;
        touchStartY = touchY;
      }
    };

    const handleTouchEnd = (e) => {
      // اگر فقط کلیک شده باشد (نه اسکرول)، رویداد را متوقف کن
      if (!isDragging) {
        e.stopPropagation();
      }
    };

    // اضافه کردن رویدادهای اسکرول و لمس
    box.addEventListener('wheel', handleWheel, { passive: false });
    box.addEventListener('touchstart', handleTouchStart, { passive: false });
    box.addEventListener('touchmove', handleTouchMove, { passive: false });
    box.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      box.removeEventListener('wheel', handleWheel);
      box.removeEventListener('touchstart', handleTouchStart);
      box.removeEventListener('touchmove', handleTouchMove);
      box.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const handleChange = (key, value) => {
    setProperties((prev) => ({ ...prev, [key]: value }));
  };

  // Mahalle-specific helpers
  const mahalleAddField = async (mahalleId, key, value) => {
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
  };

  const mahalleUpdateFeature = async (mahalleId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mahalle_id: String(mahalleId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mahalle/update-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    return resp;
  };

  const mahalleDeleteField = async (mahalleId, key) => {
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
  };

  // Mabar-specific helpers
  const mabarAddField = async (mabaarId, key, value) => {
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
  };

  const mabarUpdateFeature = async (mabaarId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mabar_id: Number(mabaarId), key, value };
    const url = `${MAHALLE_API_ROOT}/api/mabar/update-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    return resp;
  };

  const mabarDeleteField = async (mabaarId, key) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { mabar_id: Number(mabaarId), key };
    const url = `${MAHALLE_API_ROOT}/api/mabar/delete-feature/`;
    const resp = await axios.post(url, payload, { headers, validateStatus: null });
    if (resp.status >= 400 || resp.data?.status !== 'success') {
      throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
    }
    return resp.data;
  };

  // Existing parcels helper
  const addFieldToExternal = async (parcelId, key, value) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('لطفاً دوباره وارد شوید');

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const payload = { parcel_id: String(parcelId), key, value };

    const response = await axios.post(`${API_BASE}/api/add-parcel-property`, payload, { headers, validateStatus: null });
    if (response.status >= 400 || response.data?.status !== 'success') {
      throw new Error(response.data?.error || `Upstream error ${response.status}`);
    }
    return response.data;
  };

  const pLimit = (limit) => {
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
  };

  const buildUpdatesForMainParcels = () => {
    const updatedFields = {};
    const original = feature.properties || {};
    for (const [key, val] of Object.entries(properties)) {
      const origVal = original[key];
      const changed =
        (origVal === undefined && newFieldsMap[key]) ||
        (origVal !== undefined && String(origVal) !== String(val));
      if (changed) {
        updatedFields[key] = val;
      }
    }
    return updatedFields;
  };

  const handleAddField = async () => {
    if (!newFieldName) {
      toast.warn('نام فیلد را وارد کنید');
      return;
    }
    if (newFieldName in properties) {
      toast.warn('این نام فیلد قبلاً وجود دارد');
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

    const featureId = feature.properties?.OBJECTID ?? feature.id ?? feature.properties?.mahalle_ID;
    if (featureId == null || featureId === '') {
      toast.error('فیچر فاقد شناسه معتبر است');
      return;
    }

    setLoading(true);
    try {
      if (layerName === 'main-mabar') {
        await mabarAddField(featureId, newFieldName, parsedValue);
        toast.success(`فیلد ${newFieldName} به سرور mabar اضافه شد`);
      } else if (layerName === 'main-mahalles') {
        await mahalleAddField(featureId, newFieldName, parsedValue);
        toast.success(`فیلد ${newFieldName} به سرور mahalle اضافه شد`);
      } else if (layerName === 'main-parcels') {
        await addFieldToExternal(featureId, newFieldName, parsedValue);
        toast.success(`فیلد ${newFieldName} به سرور اصلی اضافه شد`);
      } else {
        // برای لایه‌های local، فیلد را به properties اضافه کن و با handleSave ذخیره کن
        setProperties((prev) => ({ ...prev, [newFieldName]: parsedValue }));
        setNewFieldsMap((prev) => ({ ...prev, [newFieldName]: true }));
        await handleSave();
        return; // نیازی به ادامه نیست چون handleSave خودش toast و onClose را مدیریت می‌کند
      }

      setProperties((prev) => ({ ...prev, [newFieldName]: parsedValue }));
      setNewFieldsMap((prev) => ({ ...prev, [newFieldName]: true }));
      setNewFieldName('');
      setNewFieldValue('');
      setNewFieldType('string');
      toast.success(`فیلد ${newFieldName} اضافه شد`);
    } catch (error) {
      console.error(`خطا در افزودن فیلد (${layerName}):`, error);
      toast.error(`خطا: ${error.message || 'نامشخص'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (loading) return;
    setLoading(true);

    try {
      if (!layerName) {
        toast.error('نام لایه مشخص نیست');
        setLoading(false);
        return;
      }

      const featureId = feature.properties?.OBJECTID ?? feature.id ?? feature.properties?.mahalle_ID;
      if (featureId == null || featureId === '') {
        toast.error('فیچر فاقد شناسه معتبر است');
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('لطفاً دوباره وارد شوید');
        redirectToLogin();
        setLoading(false);
        return;
      }

      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // main-mabar
      if (layerName === 'main-mabar') {
        const updates = buildUpdatesForMainParcels();
        if (Object.keys(updates).length === 0) {
          toast.info('هیچ تغییری برای ذخیره نیست');
          setLoading(false);
          return;
        }

        const limit = pLimit(8);
        const tasks = Object.entries(updates).map(([k, v]) =>
          limit(async () => {
            try {
              const resp = await mabarUpdateFeature(featureId, k, v);
              return { key: k, resp };
            } catch (err) {
              return { key: k, err };
            }
          })
        );

        const results = await Promise.all(tasks);
        const successes = [];
        const failures = [];

        for (const r of results) {
          if (r.err) {
            failures.push({ key: r.key, error: r.err });
            continue;
          }
          const resp = r.resp;
          const status = resp?.status;
          const data = resp?.data;
          if ((status === 200 && data?.status === 'success') || (status >= 200 && status < 300 && data?.status === 'success')) {
            successes.push({ key: r.key, data });
          } else {
            failures.push({ key: r.key, data: data || { status } });
          }
        }

        if (failures.length > 0 && successes.length === 0) {
          toast.error('به‌روزرسانی mabar ناموفق بود');
          setLoading(false);
          return;
        }

        const summary = {
          status: failures.length === 0 ? 'success' : 'partial',
          results: { successes, failures },
        };

        onSave(
          properties,
          summary,
          (prevLayers) =>
            prevLayers.map((l) =>
              l.name === layerName
                ? { ...l, version: Date.now(), updatedAt: new Date().toISOString() }
                : l
            ),
          `ویرایش فیچر ${featureId} در لایه ${layerName}`
        );

        if (summary.status === 'success') {
          toast.success('ویژگی‌ها با موفقیت در mabar به‌روز شدند');
        } else {
          toast.warn('برخی از مقادیر به‌روزرسانی نشدند (partial). لاگ کنسول را بررسی کنید');
        }

        setLoading(false);
        onClose();
        return;
      }

      // main-mahalles
      if (layerName === 'main-mahalles') {
        const updates = buildUpdatesForMainParcels();
        if (Object.keys(updates).length === 0) {
          toast.info('هیچ تغییری برای ذخیره نیست');
          setLoading(false);
          return;
        }

        const limit = pLimit(8);
        const tasks = Object.entries(updates).map(([k, v]) =>
          limit(async () => {
            try {
              const resp = await mahalleUpdateFeature(featureId, k, v);
              return { key: k, resp };
            } catch (err) {
              return { key: k, err };
            }
          })
        );

        const results = await Promise.all(tasks);
        const successes = [];
        const failures = [];

        for (const r of results) {
          if (r.err) {
            failures.push({ key: r.key, error: r.err });
            continue;
          }
          const resp = r.resp;
          const status = resp?.status;
          const data = resp?.data;
          if ((status === 200 && data?.status === 'success') || (status >= 200 && status < 300 && data?.status === 'success')) {
            successes.push({ key: r.key, data });
          } else {
            failures.push({ key: r.key, data: data || { status } });
          }
        }

        if (failures.length > 0 && successes.length === 0) {
          toast.error('به‌روزرسانی mahalle ناموفق بود');
          setLoading(false);
          return;
        }

        const summary = {
          status: failures.length === 0 ? 'success' : 'partial',
          results: { successes, failures },
        };

        onSave(
          properties,
          summary,
          (prevLayers) =>
            prevLayers.map((l) =>
              l.name === layerName
                ? { ...l, version: Date.now(), updatedAt: new Date().toISOString() }
                : l
            ),
          `ویرایش فیچر ${featureId} در لایه ${layerName}`
        );

        if (summary.status === 'success') {
          toast.success('ویژگی‌ها با موفقیت در mahalle به‌روز شدند');
        } else {
          toast.warn('برخی از مقادیر به‌روزرسانی نشدند (partial). لاگ کنسول را بررسی کنید');
        }

        setLoading(false);
        onClose();
        return;
      }

      // main-parcels and local layers
      const updates = buildUpdatesForMainParcels();
      if (Object.keys(updates).length === 0) {
        toast.info('هیچ تغییری برای ذخیره نیست');
        setLoading(false);
        return;
      }

      const payload = {
        id: String(featureId),
        layerName,
        properties: { ...properties, mahalle_ID: feature.properties?.mahalle_ID ?? featureId },
        ...(layerVersion ? { expectedVersion: layerVersion } : {}),
      };

      if (layerName !== 'main-parcels') {
        payload.storage = storage || 'local';
      }

      const resp = await axios.post(`${API_BASE}/api/update-feature`, payload, { headers, validateStatus: null });

      if (resp.status >= 400) {
        throw new Error(resp.data?.error || `Upstream error ${resp.status}`);
      }

      if (resp.data.status === 'success' && resp.data.layer) {
        onSave(
          properties,
          resp.data,
          (prevLayers) =>
            prevLayers.map((l) =>
              l.name === layerName
                ? {
                  ...l,
                  data: resp.data.layer.data || l.data,
                  version: resp.data.layer.version ?? Date.now(),
                  updatedAt: resp.data.layer.updatedAt || new Date().toISOString(),
                }
                : l
            ),
          `ویرایش فیچر ${featureId} در لایه ${layerName}`
        );
        toast.success('ویژگی‌ها ذخیره شد');
        onClose();
      } else if (resp.data.status === 'partial') {
        toast.warn('بعضی ویژگی‌ها ذخیره شد، اما خطایی رخ داد');
        onSave(properties, resp.data);
        onClose();
      } else {
        throw new Error(resp.data.error || 'پاسخ سرور نامعتبر');
      }
    } catch (error) {
      console.error('خطا در ذخیره:', error);
      const status = error.response?.status;
      const errorData = error.response?.data;

      if (status === 409) {
        toast.error('تداخل نسخه: لایه در سرور به‌روزتر است');
        onSave(
          properties,
          { conflict: true, serverLayer: errorData?.layer ?? errorData },
          (prevLayers) =>
            prevLayers.map((l) =>
              l.name === layerName
                ? {
                  ...l,
                  data: errorData?.layer?.data ?? errorData?.data ?? l.data,
                  version: errorData?.layer?.version ?? errorData?.version ?? l.version,
                  updatedAt: errorData?.layer?.updatedAt ?? errorData?.updatedAt ?? l.updatedAt,
                }
                : l
            ),
          `رفع تداخل برای لایه ${layerName}`
        );
        onClose();
      } else if (status === 401) {
        toast.error('لطفاً دوباره وارد شوید');
        redirectToLogin();
      } else {
        toast.error(`خطا در ذخیره: ${errorData?.error || error.message || 'نامشخص'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleDeleteMode = () => {
    if (!deleteMode) {
      setDeleteMode(true);
      setSelectedToDelete({});
      return;
    }

    const keys = Object.keys(selectedToDelete).filter((k) => selectedToDelete[k]);
    if (keys.length === 0) {
      setDeleteMode(false);
      toast.info('هیچ فیلدی برای حذف انتخاب نشده است');
      return;
    }

    setShowReviewModal(true);
  };

  const toggleSelectField = (field) => {
    setSelectedToDelete((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleConfirmDelete = async () => {
    const keysToDelete = Object.keys(selectedToDelete).filter((k) => selectedToDelete[k]);
    if (keysToDelete.length === 0) {
      toast.info('هیچ فیلدی برای حذف انتخاب نشده است');
      setShowReviewModal(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('لطفاً دوباره وارد شوید');
      redirectToLogin();
      return;
    }

    const featureId = feature.properties?.OBJECTID ?? feature.id ?? feature.properties?.mahalle_ID;
    if (featureId == null || featureId === '') {
      toast.error('فیچر فاقد شناسه معتبر است');
      setShowReviewModal(false);
      return;
    }

    setProcessingDelete(true);

    try {
      if (layerName === 'main-mabar') {
        const promises = keysToDelete.map((key) =>
          mabarDeleteField(featureId, key)
            .then((resp) => ({ key, resp }))
            .catch((err) => ({ key, err }))
        );

        const results = await Promise.all(promises);
        const failed = results.filter((r) => r.err || r.resp?.status >= 400 || r.resp?.status === 'error');

        if (failed.length > 0) {
          console.error('Some mabar deletions failed', failed);
          toast.error(`${failed.length} حذف موفق نبود(ند) — لاگ کنسول را بررسی کنید`);
          const successKeys = results
            .filter((r) => !r.err && r.resp && (r.resp.status === 'success' || r.resp.status < 400))
            .map((r) => r.key);
          setProperties((prev) => {
            const copy = { ...prev };
            successKeys.forEach((k) => delete copy[k]);
            return copy;
          });
        } else {
          setProperties((prev) => {
            const copy = { ...prev };
            keysToDelete.forEach((k) => delete copy[k]);
            return copy;
          });
          toast.success('فیلد(ها) با موفقیت حذف شدند (mabar)');
        }
      } else if (layerName === 'main-mahalles') {
        const promises = keysToDelete.map((key) =>
          mahalleDeleteField(featureId, key)
            .then((resp) => ({ key, resp }))
            .catch((err) => ({ key, err }))
        );

        const results = await Promise.all(promises);
        const failed = results.filter((r) => r.err || r.resp?.status >= 400 || r.resp?.status === 'error');

        if (failed.length > 0) {
          console.error('Some mahalle deletions failed', failed);
          toast.error(`${failed.length} حذف موفق نبود(ند) — لاگ کنسول را بررسی کنید`);
          const successKeys = results
            .filter((r) => !r.err && r.resp && (r.resp.status === 'success' || r.resp.status < 400))
            .map((r) => r.key);
          setProperties((prev) => {
            const copy = { ...prev };
            successKeys.forEach((k) => delete copy[k]);
            return copy;
          });
        } else {
          setProperties((prev) => {
            const copy = { ...prev };
            keysToDelete.forEach((k) => delete copy[k]);
            return copy;
          });
          toast.success('فیلد(ها) با موفقیت حذف شدند (mahalles)');
        }
      } else if (layerName === 'main-parcels') {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const promises = keysToDelete.map((key) =>
          axios.post(`${API_BASE}/api/delete-parcel-property`, { parcel_id: String(featureId), key }, { headers, validateStatus: null })
            .then((resp) => ({ key, resp }))
            .catch((err) => ({ key, err }))
        );

        const results = await Promise.all(promises);
        const failed = results.filter((r) => r.err || r.resp?.status >= 400 || r.resp?.data?.status !== 'success');

        if (failed.length > 0) {
          console.error('Some deletions failed', failed);
          toast.error(`${failed.length} حذف موفق نبود(ند) — لاگ کنسول را بررسی کنید`);
          const successKeys = results.filter((r) => !r.err && r.resp && r.resp.status < 400 && r.resp.data?.status === 'success').map((r) => r.key);
          setProperties((prev) => {
            const copy = { ...prev };
            successKeys.forEach((k) => {
              if (k in copy) delete copy[k];
            });
            return copy;
          });
        } else {
          setProperties((prev) => {
            const copy = { ...prev };
            keysToDelete.forEach((k) => {
              if (k in copy) delete copy[k];
            });
            return copy;
          });
          toast.success('فیلد(ها) با موفقیت حذف شدند');
        }

        try {
          const refreshResp = await axios.get(`${API_BASE}/api/parcels-geojson`, { validateStatus: null });
        } catch (err) {
          console.warn('Failed to refresh parcels after delete:', err);
        }
      } else {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        const promises = keysToDelete.map((key) =>
          axios.post(`${API_BASE}/api/update-feature`, {
            layerName,
            id: String(featureId),
            properties: { ...properties, [key]: null },
            storage: storage || 'local',
            ...(layerVersion ? { expectedVersion: layerVersion } : {}),
          }, { headers, validateStatus: null })
            .then((resp) => ({ key, resp }))
            .catch((err) => ({ key, err }))
        );

        const results = await Promise.all(promises);
        const failed = results.filter((r) => r.err || r.resp?.status >= 400 || r.resp?.data?.status !== 'success');

        if (failed.length > 0) {
          console.error('Some deletions (local) failed', failed);
          toast.error(`${failed.length} حذف موفق نبود(ند) — لاگ کنسول را بررسی کنید`);
          const successKeys = results.filter((r) => !r.err && r.resp && r.resp.status < 400 && r.resp.data?.status === 'success').map((r) => r.key);
          setProperties((prev) => {
            const copy = { ...prev };
            successKeys.forEach((k) => {
              if (k in copy) delete copy[k];
            });
            return copy;
          });
        } else {
          setProperties((prev) => {
            const copy = { ...prev };
            keysToDelete.forEach((k) => {
              if (k in copy) delete copy[k];
            });
            return copy;
          });
          toast.success('فیلد(ها) با موفقیت حذف شدند (local)');
        }
      }

      setShowReviewModal(false);
      setDeleteMode(false);
      setSelectedToDelete({});
      onSave(
        properties,
        { status: 'deleted', keys: keysToDelete },
        (prevLayers) =>
          prevLayers.map((l) =>
            l.name === layerName
              ? {
                ...l,
                data: l.data,
                version: l.version,
              }
              : l
          ),
        `حذف فیلد(ها) ${keysToDelete.join(', ')} از ${layerName}`
      );
    } catch (err) {
      console.error('Error during delete operation:', err);
      toast.error('خطا در حذف فیلدها — لاگ کنسول را بررسی کنید');
    } finally {
      setProcessingDelete(false);
    }
  };

  const handleCancelDelete = () => {
    setShowReviewModal(false);
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-labelledby="feature-editor-title"
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001] bg-white p-5 rounded-lg shadow-lg w-full max-w-md max-h-[80vh] overflow-y-auto overflow-x-hidden"
    >
      <h3 id="feature-editor-title" className="text-lg font-bold mb-4">ویرایش ویژگی‌ها</h3>

      <div className="mb-6 max-h-[50vh] overflow-y-auto">
        {Object.entries(properties || {}).map(([key, value]) => (
          <div key={key} className="mb-4 flex items-start gap-3">
            {deleteMode && (
              <input
                type="checkbox"
                checked={!!selectedToDelete[key]}
                onChange={() => toggleSelectField(key)}
                className="mt-1"
                aria-label={`انتخاب ${key} برای حذف`}
              />
            )}

            <div className="flex-1">
              <label className={`block mb-2 ${newFieldsMap[key] ? 'bg-blue-100 p-1 rounded' : ''}`}>
                {key}
                {newFieldsMap[key] ? <span className="text-sm text-blue-600 mr-2"> (جدید)</span> : null}
              </label>
              {typeof value === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => handleChange(key, e.target.checked)}
                  className="p-2"
                  disabled={deleteMode || loading}
                />
              ) : (
                <input
                  type={typeof value === 'number' ? 'number' : 'text'}
                  value={value ?? ''}
                  onChange={(e) =>
                    handleChange(
                      key,
                      e.target.type === 'number'
                        ? (e.target.value === '' ? '' : Number(e.target.value))
                        : e.target.value
                    )
                  }
                  className="w-full p-2 border rounded"
                  disabled={deleteMode || loading}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky top-0 bg-white p-4 border-t shadow-md z-10">
        <h4 className="text-md font-semibold mb-2">افزودن فیلد جدید</h4>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="نام فیلد"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            className="flex-1 p-2 border rounded min-w-[100px]"
            disabled={loading || deleteMode}
          />
          <input
            type={newFieldType === 'number' ? 'number' : 'text'}
            placeholder="مقدار فیلد"
            value={newFieldValue}
            onChange={(e) => setNewFieldValue(e.target.value)}
            className="flex-1 p-2 border rounded min-w-[100px]"
            disabled={loading || deleteMode}
          />
          <select
            value={newFieldType}
            onChange={(e) => setNewFieldType(e.target.value)}
            className="flex-1 p-2 border rounded min-w-[100px]"
            disabled={loading || deleteMode}
          >
            <option value="string">رشته</option>
            <option value="number">عدد</option>
            <option value="boolean">بولین</option>
          </select>
          <button
            onClick={handleAddField}
            disabled={loading || deleteMode}
            className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'در حال افزودن...' : 'افزودن'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 justify-end">
        <button
          onClick={handleSave}
          disabled={loading || deleteMode}
          className={`px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? 'در حال ذخیره...' : 'ذخیره'}
        </button>

        <button
          onClick={() => !loading && onClose()}
          disabled={loading || processingDelete}
          className={`px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${loading || processingDelete ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          لغو
        </button>

        <button
          onClick={toggleDeleteMode}
          disabled={processingDelete || loading}
          className={`px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 ${processingDelete ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {!deleteMode ? 'حذف' : Object.values(selectedToDelete).some(Boolean) ? 'حذف فیلدهای انتخاب‌شده' : 'خروج از حالت حذف'}
        </button>
      </div>

      {showReviewModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h4 className="text-lg font-semibold mb-4">بازنگری حذف فیلدها</h4>
            <p className="text-sm text-gray-600 mb-3">فیلدهای زیر برای حذف انتخاب شده‌اند — تیک بزنید/بردارید تا بازنگری کنید:</p>

            <div className="max-h-64 overflow-y-auto mb-4">
              {Object.keys(selectedToDelete).filter(k => selectedToDelete[k]).map((key) => (
                <label key={key} className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={!!selectedToDelete[key]}
                    onChange={() => toggleSelectField(key)}
                  />
                  <span>{key}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                disabled={processingDelete}
              >
                بازگشت
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={processingDelete}
              >
                {processingDelete ? 'در حال حذف...' : 'تأیید حذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatureEditor;
