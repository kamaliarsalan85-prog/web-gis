# راهنمای سریع بک‌اند GIS

## پیش‌نیازها
- Node.js 18+
- PostgreSQL 14+ با افزونه PostGIS
- فایل `.env` داخل پوشه `backend`

## اجرا
```bash
cd backend
node server.js
```

برای انتقال داده‌های موجود از MongoDB به PostgreSQL، پس از آماده‌سازی هر دو اتصال اجرا کنید:

```bash
npm run migrate:mongo-to-postgres
```

## ساختار مهم
- `server.js`: سرور Express، JWT، Socket.IO، fallback و endpointها
- `cache/`: کش سه لایه اصلی با فایل‌های JSON
- `data/`: لایه‌های محلی GeoJSON مثل `main-mabar.geojson`
- `README.md`: همین راهنمای سریع

## متغیرهای محیطی
- `DATABASE_URL`: رشته اتصال PostgreSQL
- `DATABASE_SSL`: در محیط ابری `true`، به‌صورت پیش‌فرض `false`
- `MONGO_URI`: فقط برای اسکریپت انتقال اولیه از MongoDB
- `JWT_SECRET`: کلید JWT
- `PORT`: پورت سرور، پیش‌فرض `5000`
- `CORS_ORIGIN`: مبداهای مجاز، با `,` جدا شوند
- `EXTERNAL_API_BASE`: آدرس API خارجی
- `CACHE_TTL_MS`, `PARCELS_TTL_MS`, `MAHALLES_TTL_MS`, `MABAR_TTL_MS`: TTL کش
- `ENABLE_TMP_REGISTER`: اگر `true` باشد مسیر موقت ثبت ادمین فعال می‌شود

## رفتار fallback
- ترتیب داده برای لایه‌های اصلی: API خارجی → فایل کش → PostgreSQL/GeoJSON محلی → `FeatureCollection` خالی
- اگر upstream قطع باشد، پاسخ `200` با هدر `X-Cache: EMPTY` یا داده fallback برمی‌گردد

## تست fallback
1. سرور را با `node server.js` اجرا کنید.
2. اینترنت یا دسترسی به `https://hominex-backend.ir` را قطع کنید.
3. مسیرهای `/api/parcels-geojson`، `/api/mahalles` و `/api/mabar` را صدا بزنید.
4. باید `200` بگیرید و اپ بدون crash بالا بماند.
