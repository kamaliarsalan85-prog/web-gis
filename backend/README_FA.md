# سرور GIS با مقاوم‌سازی خودکار

## مقدمه
سرور Node.js/Express برای مدیریت لایه‌های جغرافیایی (GIS) با قابلیت **Fallback خودکار** و **جداسازی از API خارجی**. در صورت قطع‌شدن API خارجی، سرور به‌جای خطا، از داده‌های کش‌شده یا لایه‌های خالی استفاده می‌کند.

## ویژگی‌های اصلی
✅ **مقاوم‌سازی کامل**: هرگز خطای 502 یا Network Error برنمی‌گردانید
✅ **کش هوشمند**: داده‌های خارجی در فایل‌های JSON ذخیره می‌شود
✅ **Pre-seeding خودکار**: فایل‌های کش اولیه به‌طور خودکار ایجاد می‌شود
✅ **Graceful Shutdown**: خروج مرتب از برنامه بدون از دست دادن اتصالات
✅ **احراز هویت JWT**: سطوح دسترسی (admin/editor/user)
✅ **Socket.IO**: ارتباط دوطرفه به‌صورت Real-time

## ساختار پروژه
```
backend/
├── server.js              # فایل اصلی سرور
├── .env                   # متغیرهای محیطی
├── package.json           # وابستگی‌های npm
├── cache/                 # فایل‌های کش (خودکار ایجاد می‌شود)
│   ├── main-parcels-cache.json
│   ├── main-mahalles-cache.json
│   └── main-mabar-cache.json
└── data/                  # لایه‌های محلی (GeoJSON)
```

## راه‌اندازی

### 1️⃣ نصب وابستگی‌ها
```bash
npm install
```

### 2️⃣ تنظیم متغیرهای محیطی
فایل `.env` را بررسی کنید و در صورت لزوم ویرایش کنید:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/hominex_db
DATABASE_SSL=false
JWT_SECRET=your_very_secure_jwt_secret_min_32_chars_12345
PORT=5000
CORS_ORIGIN=http://localhost:5173,http://localhost:5000
EXTERNAL_API_BASE=https://hominex-backend.ir
CACHE_TTL_MS=30000
```

### 3️⃣ اطمینان از PostgreSQL
```bash
# PostgreSQL باید روی localhost:5432 اجرا شود و دیتابیس hominex_db ساخته شده باشد
```

### 4️⃣ اجرای سرور
```bash
node server.js
```

سرور روی `http://localhost:5000` اجرا می‌شود.

## متغیرهای محیطی

| متغیر | توضیح | مقدار پیش‌فرض |
|------|-------|-------------|
| `DATABASE_URL` | آدرس PostgreSQL | postgresql://postgres:password@localhost:5432/hominex_db |
| `DATABASE_SSL` | فعال‌سازی SSL دیتابیس | false |
| `JWT_SECRET` | کلید امنیت JWT | ❌ الزامی |
| `PORT` | پورت سرور | 5000 |
| `CORS_ORIGIN` | اصول CORS مجاز | http://localhost:5173 |
| `EXTERNAL_API_BASE` | URL API خارجی | https://hominex-backend.ir |
| `CACHE_TTL_MS` | مدت ذخیره‌سازی عمومی | 30000 (۳۰ ثانیه) |
| `PARCELS_TTL_MS` | مدت کش قطعات | 300000 (۵ دقیقه) |
| `MAHALLES_TTL_MS` | مدت کش محله‌ها | 300000 |
| `MABAR_TTL_MS` | مدت کش مابر | 300000 |

## Endpoints API

### 🔐 احراز هویت (بدون نیاز به توکن)
- `POST /api/login` - ورود کاربر
  ```json
  {"username": "admin", "password": "pass123"}
  ```

### 🗺️ لایه‌ها (نیاز به توکن)
- `GET /api/layers?storage=db` - لیست تمام لایه‌ها
- `GET /api/parcels-geojson` - قطعات زمین (خارجی)
- `GET /api/mahalles` - محله‌ها (خارجی)
- `GET /api/mabar` - مابر (خارجی)
- `POST /api/add-layer` - افزودن لایه جدید (admin)
- `PUT /api/update-layer/:id` - ویرایش لایه (admin)
- `DELETE /api/delete-layer/:id` - حذف لایه (admin)

### 👥 کاربران (admin)
- `GET /api/users` - لیست کاربران
- `POST /api/register` - ثبت کاربر جدید
- `PUT /api/users/:id` - ویرایش کاربر
- `DELETE /api/users/:id` - حذف کاربر

## مدیریت کش

### فایل‌های کش اولیه
پس از اولین اجرای سرور، سه فایل کش به‌صورت خودکار در پوشه `cache/` ایجاد می‌شود:

```json
{
  "meta": {
    "etag": null,
    "lastModified": null,
    "updatedAt": 1652000000000
  },
  "data": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

### Fallback خودکار
اگر API خارجی دسترس‌پذیر نباشد:

1. **کش معتبر**: داده‌های کش‌شده برگشت داده می‌شود
2. **کش منقضی**: داده‌های قدیمی با هدر `X-Cache: STALE` برگشت داده می‌شود
3. **کش خالی**: یک FeatureCollection خالی با هدر `X-Cache: EMPTY` برگشت داده می‌شود

هرگز خطای ۵۰۲ برنمی‌گردد! ✅

## هدرهای پاسخ

| هدر | مقدار | معنی |
|-----|-------|------|
| `X-Cache` | HIT, MISS, STALE, EMPTY, ERROR | وضعیت کش |
| `X-Fallback` | true | استفاده از Fallback |
| `Cache-Control` | public, max-age=... | سیاست کش مرورگر |
| `ETag` | hash | شناسه نسخه |

## تست کردن Fallback

### سناریو 1: قطع API خارجی
```bash
# قطع اینترنت یا بسته کردن API

curl http://localhost:5000/api/parcels-geojson
# پاسخ:
{
  "type": "FeatureCollection",
  "features": [],
  "_fallback": true,
  "_message": "External API unavailable, returning empty cache"
}
```

### سناریو 2: بررسی وضعیت کش
```bash
curl -i http://localhost:5000/api/mahalles
# ابررها: X-Cache: HIT (یا MISS, STALE, EMPTY)
```

## خروج مرتب
سرور برای خروج مرتب از سیگنال‌های `SIGTERM` و `SIGINT` پشتیبانی می‌کند:

```bash
# فشار دادن Ctrl+C
# سرور:
# 1. اتصال PostgreSQL را می‌بندد
# 2. سرور HTTP را می‌بندد
# 3. خروج مرتب (فرآیند صفر)
```

## رفع اشکال

### ❌ خطای "DATABASE_URL is not set"
→ اطمینان حاصل کنید `.env` فایل `DATABASE_URL` دارد

### ❌ خطای "Cannot GET /api/..."
→ اطمینان حاصل کنید توکن Authorization ارسال کرده‌اید:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/layers?storage=db
```

### ❌ خطای CORS
→ متغیر `CORS_ORIGIN` در `.env` را تنظیم کنید:
```env
CORS_ORIGIN=http://localhost:5173
```

### ⚠️ فایل‌های کش خالی
→ این طبیعی است! لایه‌های خارجی تا زمان‌ی که API موجود باشد، خودکار بارگذاری می‌شود.

## امنیت
- 🔒 تمام درخواست‌های نوشتاری نیاز به احراز هویت و دسترسی admin دارند
- 🔒 رمزهای عبور با `bcryptjs` رمزگذاری می‌شود
- 🔒 توکن‌های JWT صادر شده برای ۷ روز معتبر هستند
- 🔒 مسیر عمومی ثبت‌نام (`/api/_tmp_register_admin`) حذف شده است

## لاگ‌های سرور
```
🚀 GIS Server running on http://localhost:5000
📍 External API: https://hominex-backend.ir
📁 Cache directory: /path/to/cache
✅ External API is reachable.
Loaded parcels cache from disk
Fetched parcels (200) in 120ms
```

## نسخه و وابستگی‌ها
- **Node.js**: ۱۸+ (ES modules)
- **Express**: ۴.x
- **PostgreSQL**: ۱۴+
- **PostGIS**: برای توسعه قابلیت‌های مکانی آینده توصیه می‌شود
- **Socket.IO**: ۴.x

## تماس و پشتیبانی
برای گزارش مشکلات یا پیشنهادات، لطفاً issue ایجاد کنید.

---
**نسخه**: ۲.۰  
**آخرین بروزرسانی**: May 2026
