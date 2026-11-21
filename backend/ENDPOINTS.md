# تمام Endpoints API - سرور GIS

## 🔑 احراز هویت (بدون نیاز به توکن)

### ورود (Login)
```bash
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

# پاسخ:
{
  "status": "success",
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "username": "admin",
    "role": "admin",
    "layers": [],
    "tools": []
  }
}
```

---

## 🗺️ لایه‌ها (Layers)

### لیست تمام لایه‌ها
```bash
GET /api/layers?storage=db
Authorization: Bearer {TOKEN}

# پاسخ:
{
  "status": "success",
  "message": "Layers fetched successfully",
  "layers": [
    {
      "name": "main-parcels",
      "count": 150,
      "storage": "external",
      "data": { "type": "FeatureCollection", "features": [...] },
      "updatedAt": "2026-05-12T18:00:00.000Z"
    },
    ...
  ]
}
```

### لیست لایه‌های محلی
```bash
GET /api/layers?storage=local
Authorization: Bearer {TOKEN}
```

### دریافت قطعات زمین (Parcels - بدون احراز)
```bash
GET /api/parcels-geojson

# هدرهای پاسخ:
X-Cache: HIT|MISS|STALE|EMPTY|ERROR
X-Fallback: true (در صورت استفاده از Fallback)
```

### دریافت محله‌ها (Mahalles - بدون احراز)
```bash
GET /api/mahalles

# خروجی: FeatureCollection
```

### دریافت مابر (Mabar - بدون احراز)
```bash
GET /api/mabar

# خروجی: FeatureCollection
```

### افزودن لایه جدید (Admin)
```bash
POST /api/add-layer
Authorization: Bearer {TOKEN}
Content-Type: multipart/form-data

name: "my_layer"
file: geojson_file

# پاسخ:
{
  "status": "success",
  "layer": { ... }
}
```

### ویرایش لایه (Admin)
```bash
PUT /api/update-layer/:id
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "updated_name",
  "data": { "type": "FeatureCollection", "features": [...] }
}
```

### حذف لایه (Admin)
```bash
DELETE /api/delete-layer/:id
Authorization: Bearer {TOKEN}

# پاسخ:
{
  "status": "success",
  "message": "Layer deleted"
}
```

---

## 🎨 DrawTool Endpoints

### دریافت شناسهٔ جدید برای Mabar
```bash
GET /api/next-mabar-object-id
Authorization: Bearer {TOKEN}

# پاسخ:
{
  "status": "success",
  "nextId": "1001"
}
```

### ایجاد عارضهٔ Mabar جدید
```bash
POST /api/mabar/create/
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "محله جدید",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[51.3, 35.6], [51.4, 35.6], [51.4, 35.7], [51.3, 35.7], [51.3, 35.6]]]
  },
  "properties": {
    "OBJECTID": "1001",
    "Name": "محله جدید",
    "color": "#FF0000"
  }
}

# پاسخ:
{
  "status": "success",
  "message": "عارضهٔ mabar با موفقیت ایجاد شد",
  "feature": { ... }
}
```

### دریافت شناسهٔ جدید برای Parcels
```bash
GET /api/next-parcel-object-id
Authorization: Bearer {TOKEN}

# پاسخ:
{
  "status": "success",
  "nextId": "2001"
}
```

### ایجاد عارضهٔ Parcel جدید
```bash
POST /api/parcels/create/
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "قطعه جدید",
  "geometry": { ... },
  "properties": { ... }
}
```

### دریافت شناسهٔ جدید برای Mahalles
```bash
GET /api/next-mahalle-object-id
Authorization: Bearer {TOKEN}

# پاسخ:
{
  "status": "success",
  "nextId": "3001"
}
```

### ایجاد عارضهٔ Mahalle جدید
```bash
POST /api/mahalles/create/
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "محله جدید",
  "geometry": { ... },
  "properties": { ... }
}
```

### افزودن عارضه (برای هر لایه)
```bash
POST /api/add-feature
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "layerName": "my_layer",
  "storage": "db",  # یا "local"
  "newFeature": {
    "type": "Feature",
    "id": "feature_1",
    "geometry": { ... },
    "properties": { ... }
  }
}

# پاسخ:
{
  "status": "success",
  "message": "Feature added to layer",
  "feature": { ... }
}
```

### ویرایش عارضه
```bash
POST /api/update-feature
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "layerName": "my_layer",
  "storage": "db",
  "featureId": "feature_1",
  "newFeature": {
    "type": "Feature",
    "id": "feature_1",
    "geometry": { ... },
    "properties": { ... }
  }
}

# پاسخ:
{
  "status": "success",
  "message": "Feature updated",
  "feature": { ... }
}
```

### حذف عارضه
```bash
POST /api/delete-feature
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "layerName": "my_layer",
  "storage": "db",
  "featureId": "feature_1"
}

# پاسخ:
{
  "status": "success",
  "message": "Feature deleted"
}
```

---

## 👥 مدیریت کاربران (Admin)

### ثبت کاربر جدید
```bash
POST /api/register
Authorization: Bearer {ADMIN_TOKEN}
Content-Type: application/json

{
  "username": "newuser",
  "password": "secure_pass",
  "role": "editor",
  "layers": ["layer1", "layer2"],
  "tools": ["edit", "draw"]
}
```

### لیست کاربران
```bash
GET /api/users
Authorization: Bearer {ADMIN_TOKEN}

# پاسخ:
{
  "status": "success",
  "users": [ ... ]
}
```

### ویرایش کاربر
```bash
PUT /api/users/:id
Authorization: Bearer {ADMIN_TOKEN}
Content-Type: application/json

{
  "role": "admin",
  "layers": ["layer1"],
  "tools": ["stats", "export"]
}
```

### حذف کاربر
```bash
DELETE /api/users/:id
Authorization: Bearer {ADMIN_TOKEN}

# پاسخ:
{
  "status": "success",
  "message": "User deleted"
}
```

---

## 🧪 تست سریع با cURL

### ورود
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### دریافت لایه‌ها
```bash
TOKEN="eyJhbGc..."
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/layers?storage=db
```

### ایجاد عارضهٔ Mabar
```bash
TOKEN="eyJhbGc..."
curl -X POST http://localhost:5000/api/mabar/create/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "محله جدید",
    "geometry": {"type":"Point","coordinates":[51.38,35.68]},
    "properties": {"OBJECTID":"1001"}
  }'
```

---

## ⚡ حالات خطا

### خطای احراز هویت (401)
```json
{
  "status": "error",
  "error": "Authentication required. Please provide a valid token."
}
```

### خطای دسترسی (403)
```json
{
  "status": "error",
  "error": "Access denied. Admin privileges required."
}
```

### خطای یافت نشدن (404)
```json
{
  "status": "error",
  "error": "Not found",
  "url": "/api/unknown-endpoint"
}
```

### خطای Server (500)
```json
{
  "status": "error",
  "error": "Failed to add feature",
  "details": "..."
}
```

---

## 📊 Fallback خودکار

اگر API خارجی دسترس‌پذیر نباشد:

```json
{
  "type": "FeatureCollection",
  "features": [],
  "_fallback": true,
  "_message": "External API unavailable, returning empty cache"
}
```

**هدرهای پاسخ:**
- `X-Cache: EMPTY` - کش خالی است
- `X-Fallback: true` - در حالت Fallback
- **وضعیت HTTP: ۲۰۰** - نه ۵۰۲!

---

## 🔄 Socket.IO Events

### لیسن کردن برای تغییرات لایه
```javascript
socket.on('layerUpdated', (data) => {
  console.log(`Layer "${data.layerName}" was updated at ${data.updatedAt}`);
});
```

### ارسال داده (خودکار)
هر زمان که عارضه‌ای اضافه/ویرایش/حذف شود، این event ارسال می‌شود.

