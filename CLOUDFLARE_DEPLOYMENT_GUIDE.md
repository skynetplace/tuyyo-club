# 🚀 Повний гайд з розгортання Full-Stack додатку на Cloudflare

> **Роль:** Senior Full-Stack DevOps Engineer & Cloud Infrastructure Architect
> **Платформа:** Cloudflare Workers + Pages + D1 + R2
> **Мова:** Українська

---

## 📑 Зміст

1. [Архітектура проекту](#1-архітектура-проекту)
2. [Локальна розробка](#2-локальна-розробка)
3. [API Development (Workers)](#3-api-development-workers)
4. [Frontend Development (Pages)](#4-frontend-development-pages)
5. [Інфраструктура Cloudflare](#5-інфраструктура-cloudflare)
6. [Секрети та облікові дані](#6-секрети-та-облікові-дані)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Процес деплою](#8-процес-деплою)
9. [Моніторинг та обслуговування](#9-моніторинг-та-обслуговування)
10. [Траблшутинг](#10-траблшутинг)

---

## 1. Архітектура проекту

### 1.1 Технологічний стек

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   Workers API   │    │  Pages Frontend │    │  D1 Database │ │
│  │   (Hono.js)     │    │  (HTML/HTMX)    │    │  (SQLite)   │ │
│  └────────┬────────┘    └────────┬────────┘    └──────┬──────┘ │
│           │                      │                    │        │
│           └──────────────────────┴────────────────────┘        │
│                                  │                              │
│                          ┌───────┴───────┐                      │
│                          │   R2 Bucket   │                      │
│                          │  (File Store) │                      │
│                          └───────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Backend:**
- **Runtime:** Cloudflare Workers (V8 isolates)
- **Framework:** Hono.js (легкий, швидкий, підтримка middleware)
- **Database:** Cloudflare D1 (Edge SQLite)
- **File Storage:** Cloudflare R2 (S3-сумісне)
- **Payments:** Stripe Checkout
- **Notifications:** Resend (Email), Telegram Bot API

**Frontend:**
- **Hosting:** Cloudflare Pages (Global CDN)
- **Framework:** HTML5 + Bootstrap 5.3 + HTMX 2.0
- **Build:** Статичні файли (без SPA)
- **SEO:** 100/100 PageSpeed завдяки Edge rendering

### 1.2 Структура проекту (Monorepo)

```
my-project/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD pipeline
├── api/                            # 🚀 Cloudflare Worker (Backend)
│   ├── src/
│   │   ├── index.js                # Точка входу, роутер
│   │   ├── routes/
│   │   │   ├── public.js           # Публічні API (каталог, локації)
│   │   │   ├── booking.js          # Бронювання (розрахунок, створення)
│   │   │   ├── admin.js            # Адмін-панель (CRUD)
│   │   │   └── webhooks.js         # Stripe webhooks
│   │   ├── lib/
│   │   │   ├── db.js               # База даних (D1 queries)
│   │   │   ├── stripe.js           # Stripe інтеграція
│   │   │   ├── notify.js           # Сповіщення (Telegram, Email)
│   │   │   └── auth.js             # Авторизація (JWT, API keys)
│   │   └── middleware/
│   │       ├── cors.js             # CORS middleware
│   │       ├── auth.js             # Auth middleware
│   │       └── rate-limit.js       # Rate limiting
│   ├── db/
│   │   ├── schema.sql              # Схема БД
│   │   └── migrations/             # Міграції
│   │       └── 001_initial.sql
│   ├── wrangler.toml               # Конфіг Worker
│   ├── package.json
│   └── .dev.vars                   # Локальні змінні (не комітити!)
├── web/                            # 🎨 Cloudflare Pages (Frontend)
│   ├── public/
│   │   ├── index.html              # Головна
│   │   ├── booking.html            # Бронювання
│   │   ├── success.html            # Підтвердження
│   │   ├── admin/
│   │   │   └── index.html          # Адмін-панель
│   │   └── assets/
│   │       ├── hero.jpg
│   │       └── og-image.jpg
│   ├── wrangler.toml               # Конфіг Pages (опціонально)
│   └── package.json
├── shared/                         # 🔄 Спільний код
│   ├── types/
│   │   └── index.ts                # TypeScript типи
│   └── utils/
│       └── validation.js           # Валідація (Zod schemas)
├── .gitignore
├── .env.example                    # Приклад змінних (без секретів)
└── README.md
```

### 1.3 База даних (D1 Schema)

```sql
-- schema.sql — Повна схема бази даних

-- Локації (зони доставки)
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    delivery_fee REAL DEFAULT 20.0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Інвентар (товари/послуги)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    max_weight_kg INTEGER,
    price_2h REAL NOT NULL DEFAULT 35.0,
    price_half_day REAL NOT NULL DEFAULT 40.0,
    price_full_day REAL NOT NULL DEFAULT 50.0,
    price_multi_day REAL NOT NULL DEFAULT 40.0,
    deposit_amount REAL DEFAULT 150.0,
    total_units INTEGER DEFAULT 5,
    image_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Клієнти
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    id_document TEXT,
    whatsapp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Бронювання
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_code TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_type TEXT NOT NULL,
    subtotal REAL NOT NULL,
    delivery_fee REAL DEFAULT 0.0,
    deposit_total REAL NOT NULL,
    total_amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'stripe',
    payment_status TEXT DEFAULT 'unpaid',
    stripe_session_id TEXT UNIQUE,
    legal_agreement BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Позиції бронювання
CREATE TABLE IF NOT EXISTS booking_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    inventory_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_booking REAL NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

-- Відгуки
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER UNIQUE,
    customer_name TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    photo_url TEXT,
    is_visible BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Налаштування (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Переклади (i18n)
CREATE TABLE IF NOT EXISTS translations (
    lang_code TEXT NOT NULL,
    translation_key TEXT NOT NULL,
    translation_value TEXT NOT NULL,
    PRIMARY KEY (lang_code, translation_key)
);

-- Юридичні документи
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT NOT NULL,
    lang_code TEXT NOT NULL,
    title TEXT NOT NULL,
    content_html TEXT,
    pdf_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doc_type, lang_code)
);

-- Індекси для продуктивності
CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_inv ON booking_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_active ON inventory(is_active);
```

---

## 2. Локальна розробка

### 2.1 Передумови

```bash
# Встановлення Node.js (рекомендовано v20+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Перевірка
node --version  # v20.x.x
npm --version   # 10.x.x

# Встановлення Wrangler CLI
npm install -g wrangler

# Авторизація в Cloudflare
wrangler login
# Відкриється браузер для авторизації
```

### 2.2 Ініціалізація проекту

```bash
# Створення структури
mkdir my-project && cd my-project
mkdir -p api/src/{routes,lib,middleware} api/db/migrations web/public/admin shared/types shared/utils .github/workflows

# Ініціалізація API (Worker)
cd api
npm init -y
npm install hono stripe
npm install -D wrangler

# Ініціалізація Frontend (Pages)
cd ../web
npm init -y
npm install -D wrangler
```

### 2.3 Конфігурація wrangler.toml (API)

```toml
# api/wrangler.toml
name = "my-project-api"
main = "src/index.js"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

# Змінні оточення (не секрети!)
[vars]
ENVIRONMENT = "production"
FRONTEND_URL = "https://my-project.pages.dev"
API_URL = "https://my-project-api.workers.dev"

# Прив'язка D1 бази даних
[[d1_databases]]
binding = "DB"
database_name = "my-project-db"
database_id = "YOUR_D1_DATABASE_ID"  # Отримати після створення

# Прив'язка R2 bucket (якщо потрібно)
[[r2_buckets]]
binding = "R2"
bucket_name = "my-project-media"

# Роутинг (опціонально)
# [routes]
# pattern = "api.example.com/*"
# zone_name = "example.com"
```

### 2.4 Локальні змінні (.dev.vars)

```bash
# api/.dev.vars (НЕ КОМІТИТИ!)
# Ці змінні доступні тільки при wrangler dev
ENVIRONMENT = "development"
FRONTEND_URL = "http://localhost:3000"
API_URL = "http://localhost:8787"
STRIPE_SECRET_KEY = "sk_test_xxxxxxxxxxxx"
ADMIN_API_KEY = "dev-admin-key-123"
```

### 2.5 Запуск локально

```bash
# Термінал 1: API (Worker)
cd api
npx wrangler dev --port 8787

# Термінал 2: Frontend
cd web
npx serve public -l 3000
# або
npx wrangler pages dev public --port 3000
```

### 2.6 Локальна D1 база

```bash
# Створення локальної D1 бази
cd api
npx wrangler d1 create my-project-db --local

# Ініціалізація схеми
npx wrangler d1 execute my-project-db --local --file=./db/schema.sql
```

---

## 3. API Development (Workers)

### 3.1 Головний файл (index.js)

```javascript
// api/src/index.js
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { publicRoutes } from './routes/public.js';
import { bookingRoutes } from './routes/booking.js';
import { adminRoutes } from './routes/admin.js';
import { webhookRoutes } from './routes/webhooks.js';

const app = new Hono();

// 📝 Logger
app.use('*', logger());

// 🔒 CORS — налаштування дозволених доменів
app.use('/api/*', cors({
  origin: (origin, c) => {
    const allowed = [
      'https://my-project.pages.dev',
      'https://www.my-project.pages.dev',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'my-project-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Маршрути
app.route('/api', publicRoutes);
app.route('/api/booking', bookingRoutes);
app.route('/api/webhooks', webhookRoutes);
app.route('/admin/api', adminRoutes);

// 404
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  const status = err.status || err.statusCode || 500;
  const isDev = c.env.ENVIRONMENT !== 'production';
  const message = status >= 500 && !isDev
    ? 'Internal Server Error'
    : err.message || 'Unknown error';

  return c.json({
    error: message,
    ...(isDev && { stack: err.stack }),
    ...(err.code && { code: err.code })
  }, status);
});

export default app;
```

### 3.2 База даний (lib/db.js)

```javascript
// api/src/lib/db.js

// 📍 Локації
export async function getLocations(db) {
  const { results } = await db.prepare(
    'SELECT id, name, slug, lat, lng, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();
  return results;
}

export async function getLocationById(db, id) {
  return await db.prepare(
    'SELECT * FROM locations WHERE id = ?'
  ).bind(id).first();
}

// 🏄 Інвентар
export async function getInventory(db) {
  const { results } = await db.prepare(
    'SELECT * FROM inventory WHERE is_active = 1 ORDER BY price_2h ASC'
  ).all();
  return results;
}

export async function getInventoryById(db, id) {
  return await db.prepare(
    'SELECT * FROM inventory WHERE id = ? AND is_active = 1'
  ).bind(id).first();
}

export function getPriceForDuration(item, durationType) {
  const priceKey = {
    '2h': 'price_2h',
    'half_day': 'price_half_day',
    'full_day': 'price_full_day',
    'multi_day': 'price_multi_day'
  }[durationType];
  return item[priceKey];
}

// 🔍 Перевірка доступності
export async function checkAvailability(db, inventoryId, startTime, endTime) {
  const inv = await db.prepare(
    'SELECT total_units FROM inventory WHERE id = ?'
  ).bind(inventoryId).first();

  if (!inv) return { exists: false, available: 0 };

  const booked = await db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) as total
    FROM booking_items bi
    JOIN bookings b ON bi.booking_id = b.id
    WHERE bi.inventory_id = ?
      AND b.payment_status != 'failed'
      AND b.start_time < ? AND b.end_time > ?
  `).bind(inventoryId, endTime, startTime).first();

  return {
    exists: true,
    available: inv.total_units - (booked.total || 0)
  };
}

// 👤 Клієнти
export async function createCustomer(db, customer) {
  const res = await db.prepare(`
    INSERT INTO customers (full_name, phone, email, id_document, whatsapp)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    customer.full_name,
    customer.phone,
    customer.email || null,
    customer.id_document || null,
    customer.whatsapp || customer.phone
  ).run();
  return res.meta.last_row_id;
}

// 📝 Бронювання
export async function createBooking(db, booking) {
  const res = await db.prepare(`
    INSERT INTO bookings (
      booking_code, customer_id, location_id, start_time, end_time,
      duration_type, subtotal, delivery_fee, deposit_total, total_amount,
      payment_method, legal_agreement
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    booking.booking_code,
    booking.customer_id,
    booking.location_id,
    booking.start_time,
    booking.end_time,
    booking.duration_type,
    booking.subtotal,
    booking.delivery_fee,
    booking.deposit_total,
    booking.total_amount,
    booking.payment_method,
    booking.legal_agreement
  ).run();
  return res.meta.last_row_id;
}

export async function addBookingItem(db, bookingId, inventoryId, quantity, price) {
  await db.prepare(`
    INSERT INTO booking_items (booking_id, inventory_id, quantity, price_at_booking)
    VALUES (?, ?, ?, ?)
  `).bind(bookingId, inventoryId, quantity, price).run();
}

export async function setBookingStripeSession(db, bookingId, sessionId) {
  await db.prepare(
    'UPDATE bookings SET stripe_session_id = ? WHERE id = ?'
  ).bind(sessionId, bookingId).run();
}

// 📊 Статистика
export async function getDashboardStats(db) {
  const total = await db.prepare('SELECT COUNT(*) as count FROM bookings').first();
  const paid = await db.prepare(
    "SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM bookings WHERE payment_status = 'paid'"
  ).first();
  const pending = await db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'unpaid'"
  ).first();

  return {
    total_bookings: total.count,
    paid_bookings: paid.count,
    revenue: paid.revenue || 0,
    pending_bookings: pending.count
  };
}

// ⚙️ Налаштування
export async function getSetting(db, key) {
  const row = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first();
  return row?.value;
}
```

### 3.3 Роутинг (routes/public.js)

```javascript
// api/src/routes/public.js
import { Hono } from 'hono';

export const publicRoutes = new Hono();

// 📍 Локації
publicRoutes.get('/locations', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(
    'SELECT id, name, slug, lat, lng, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();
  return c.json(results);
});

// 🏄 Інвентар
publicRoutes.get('/inventory', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT id, model_name, slug, description, max_weight_kg,
           price_2h, price_half_day, price_full_day, price_multi_day,
           deposit_amount, image_url
    FROM inventory WHERE is_active = 1
    ORDER BY price_2h ASC
  `).all();
  return c.json(results);
});

// 🔍 Доступність
publicRoutes.get('/availability', async (c) => {
  const db = c.env.DB;
  const { date, inventory_id, duration_type } = c.req.query();

  if (!date || !inventory_id) {
    return c.json({ error: 'Missing date or inventory_id' }, 400);
  }

  const durationHours = { '2h': 2, 'half_day': 5, 'full_day': 10, 'multi_day': 24 }[duration_type] || 2;
  const startDateTime = `${date}T00:00:00`;
  const endDateTime = new Date(new Date(startDateTime).getTime() + durationHours * 3600 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  const booked = await db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) as total_booked
    FROM booking_items bi
    JOIN bookings b ON bi.booking_id = b.id
    WHERE bi.inventory_id = ?
      AND b.payment_status != 'failed'
      AND b.start_time < ? AND b.end_time > ?
  `).bind(inventory_id, endDateTime, startDateTime).first();

  const inv = await db.prepare('SELECT total_units FROM inventory WHERE id = ?').bind(inventory_id).first();
  if (!inv) return c.json({ error: 'Inventory not found' }, 404);

  return c.json({
    inventory_id: parseInt(inventory_id),
    date,
    total_units: inv.total_units,
    booked: booked.total_booked || 0,
    available: Math.max(0, inv.total_units - (booked.total_booked || 0))
  });
});

// ⭐ Відгуки
publicRoutes.get('/reviews', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT customer_name, rating, comment, photo_url, created_at
    FROM reviews WHERE is_visible = 1
    ORDER BY created_at DESC LIMIT 50
  `).all();
  return c.json(results);
});

// 🌐 Переклади
publicRoutes.get('/translations/:lang', async (c) => {
  const db = c.env.DB;
  const { lang } = c.req.param();
  const { results } = await db.prepare(
    'SELECT translation_key, translation_value FROM translations WHERE lang_code = ?'
  ).bind(lang).all();

  const dict = {};
  results.forEach(r => dict[r.translation_key] = r.translation_value);
  return c.json(dict);
});
```

### 3.4 Адмін-панель (routes/admin.js)

```javascript
// api/src/routes/admin.js
import { Hono } from 'hono';

export const adminRoutes = new Hono();

// 🔐 Middleware авторизації
adminRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const adminKey = c.env.ADMIN_API_KEY;

  // Якщо ключ не встановлено — пропускаємо (для розробки)
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// 📊 Dashboard
adminRoutes.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const total = await db.prepare('SELECT COUNT(*) as count FROM bookings').first();
  const paid = await db.prepare(
    "SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM bookings WHERE payment_status = 'paid'"
  ).first();
  const pending = await db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'unpaid'"
  ).first();

  return c.json({
    total_bookings: total.count,
    paid_bookings: paid.count,
    revenue: paid.revenue || 0,
    pending_bookings: pending.count
  });
});

// 🏄 CRUD Інвентар
adminRoutes.get('/inventory', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM inventory ORDER BY id DESC'
  ).all();
  return c.json(results);
});

adminRoutes.post('/inventory', async (c) => {
  const db = c.env.DB;
  const data = await c.req.json();

  const res = await db.prepare(`
    INSERT INTO inventory (model_name, slug, description, max_weight_kg,
      price_2h, price_half_day, price_full_day, price_multi_day,
      deposit_amount, total_units, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.model_name, data.slug, data.description, data.max_weight_kg,
    data.price_2h, data.price_half_day, data.price_full_day, data.price_multi_day,
    data.deposit_amount || 150, data.total_units || 1,
    data.image_url, data.is_active !== false ? 1 : 0
  ).run();

  return c.json({ id: res.meta.last_row_id });
});

adminRoutes.put('/inventory/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const data = await c.req.json();

  await db.prepare(`
    UPDATE inventory SET
      model_name = ?, slug = ?, description = ?, max_weight_kg = ?,
      price_2h = ?, price_half_day = ?, price_full_day = ?, price_multi_day = ?,
      deposit_amount = ?, total_units = ?, image_url = ?, is_active = ?
    WHERE id = ?
  `).bind(
    data.model_name, data.slug, data.description, data.max_weight_kg,
    data.price_2h, data.price_half_day, data.price_full_day, data.price_multi_day,
    data.deposit_amount, data.total_units, data.image_url,
    data.is_active ? 1 : 0, id
  ).run();

  return c.json({ success: true });
});

// 📋 Бронювання
adminRoutes.get('/bookings', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN locations l ON b.location_id = l.id
    ORDER BY b.created_at DESC LIMIT 100
  `).all();
  return c.json(results);
});

// ⚙️ Налаштування
adminRoutes.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT key, value, is_secret FROM settings'
  ).all();

  const settings = {};
  results.forEach(r => {
    settings[r.key] = r.is_secret && r.value
      ? '••••••••' + r.value.slice(-4)
      : r.value;
  });
  return c.json(settings);
});

adminRoutes.post('/settings', async (c) => {
  const db = c.env.DB;
  const data = await c.req.json();

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.startsWith('••••••••')) continue;

    await db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  }

  return c.json({ success: true });
});
```

### 3.5 Webhooks (routes/webhooks.js)

```javascript
// api/src/routes/webhooks.js
import { Hono } from 'hono';
import Stripe from 'stripe';

export const webhookRoutes = new Hono();

// 💳 Stripe Webhook
webhookRoutes.post('/stripe', async (c) => {
  const db = c.env.DB;
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');

  const webhookSecret = await db.prepare(
    "SELECT value FROM settings WHERE key = 'stripe_webhook_secret'"
  ).first().then(r => r?.value);

  if (!webhookSecret || !signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const stripeKey = c.env.STRIPE_SECRET_KEY;
  const stripe = new Stripe(stripeKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Обробка подій
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;

      if (bookingId) {
        await db.prepare(
          "UPDATE bookings SET payment_status = 'paid' WHERE id = ?"
        ).bind(parseInt(bookingId)).run();

        // Надсилаємо сповіщення
        c.executionCtx.waitUntil(sendBookingNotification(c.env, parseInt(bookingId)));
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      const bookingId = session.metadata?.booking_id;

      if (bookingId) {
        await db.prepare(
          "UPDATE bookings SET payment_status = 'failed' WHERE id = ?"
        ).bind(parseInt(bookingId)).run();
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      console.error('Payment failed:', paymentIntent.last_payment_error?.message);
      break;
    }
  }

  return c.json({ received: true });
});

// Функція сповіщення (приклад)
async function sendBookingNotification(env, bookingId) {
  try {
    const booking = await env.DB.prepare(`
      SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN locations l ON b.location_id = l.id
      WHERE b.id = ?
    `).bind(bookingId).first();

    if (!booking) return;

    const message = `🏄 NEW BOOKING\nCode: ${booking.booking_code}\nClient: ${booking.full_name}\nPhone: ${booking.phone}\nLocation: ${booking.location_name}\nTotal: €${booking.total_amount}`;

    // Telegram
    const tgToken = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'telegram_bot_token'"
    ).first().then(r => r?.value);

    const tgChatId = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'telegram_chat_id'"
    ).first().then(r => r?.value);

    if (tgToken && tgChatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text: message })
      });
    }
  } catch (err) {
    console.error('Notification error:', err);
  }
}
```

---

## 4. Frontend Development (Pages)

### 4.1 Головна сторінка (index.html)

```html
<!-- web/public/index.html -->
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project — Оренда SUP-бордів</title>
  <meta name="description" content="Преміальна платформа оренди SUP-бордів на Costa Blanca.">

  <!-- SEO -->
  <meta property="og:title" content="My Project — Оренда SUP">
  <meta property="og:description" content="Sea. Sun. Freedom.">
  <meta property="og:type" content="website">

  <!-- Bootstrap 5 -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">

  <style>
    :root {
      --primary: #40E0D0;
      --secondary: #003366;
    }
    body { font-family: 'Inter', system-ui, sans-serif; }
    .btn-primary { background: var(--primary); border: none; }
  </style>
</head>
<body>

<!-- NAVBAR -->
<nav class="navbar navbar-expand-lg navbar-dark bg-dark">
  <div class="container">
    <a class="navbar-brand" href="/">🏄 My Project</a>
    <div class="collapse navbar-collapse">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item"><a class="nav-link" href="/booking.html">Забронювати</a></li>
      </ul>
    </div>
  </div>
</nav>

<!-- HERO -->
<section class="hero text-center text-white d-flex align-items-center">
  <div class="container">
    <h1 class="display-2 fw-bold">Sea. Sun. Freedom.</h1>
    <p class="lead">Досліджуйте Costa Blanca з води</p>
    <a href="/booking.html" class="btn btn-primary btn-lg">Забронювати</a>
  </div>
</section>

<!-- DYNAMIC CONTENT (HTMX) -->
<section class="py-5">
  <div class="container">
    <h2 class="text-center mb-4">Наш інвентар</h2>
    <div id="inventory-list"
         hx-get="https://my-project-api.workers.dev/api/inventory"
         hx-trigger="load"
         hx-swap="innerHTML">
      <div class="text-center"><div class="spinner-border"></div></div>
    </div>
  </div>
</section>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://unpkg.com/htmx.org@2.0.3"></script>
<script>
  // Рендеринг після HTMX swap
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'inventory-list') {
      try {
        const data = JSON.parse(e.detail.xhr.response);
        e.detail.target.innerHTML = data.map(item => `
          <div class="col-md-4 mb-4">
            <div class="card h-100">
              <div class="card-body">
                <h5>${item.model_name}</h5>
                <p>від €${item.price_2h}</p>
                <a href="/booking.html?inv=${item.id}" class="btn btn-primary">Обрати</a>
              </div>
            </div>
          </div>
        `).join('');
      } catch (err) { console.error(err); }
    }
  });
</script>
</body>
</html>
```

### 4.2 Сторінка бронювання (booking.html)

```html
<!-- web/public/booking.html -->
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Бронювання — My Project</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
  <div class="container py-5">
    <h1>Бронювання</h1>
    <div id="booking-wizard">
      <!-- Крок 1 завантажується через JS -->
    </div>
  </div>

  <script>
    // ⚠️ ВАЖЛИВО: Замініть на ваш реальний API URL
    const API = 'https://my-project-api.workers.dev/api';

    document.addEventListener('DOMContentLoaded', loadStep1);

    async function loadStep1() {
      const locRes = await fetch(`${API}/locations`).then(r => r.json());
      const wizard = document.getElementById('booking-wizard');
      const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

      wizard.innerHTML = `
        <h3>Крок 1: Дата та локація</h3>
        <div class="mb-3">
          <label class="form-label">Дата</label>
          <input type="date" id="inp-date" class="form-control" min="${minDate}" required>
        </div>
        <div class="mb-3">
          <label class="form-label">Локація</label>
          <select id="inp-location" class="form-select">
            ${locRes.map(l => `<option value="${l.id}">${l.name} (+${l.delivery_fee}€)</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="goStep2()">Далі</button>
      `;
    }

    async function goStep2() {
      const date = document.getElementById('inp-date').value;
      const locationId = document.getElementById('inp-location').value;

      if (!date) { alert('Оберіть дату'); return; }

      const invRes = await fetch(`${API}/inventory`).then(r => r.json());
      const wizard = document.getElementById('booking-wizard');

      let html = '<h3>Крок 2: Оберіть дошку</h3>';
      for (const item of invRes) {
        const avail = await fetch(
          `${API}/availability?date=${date}&inventory_id=${item.id}&duration_type=2h`
        ).then(r => r.json());

        html += `
          <div class="card mb-3">
            <div class="card-body">
              <h5>${item.model_name}</h5>
              <p>Доступно: ${avail.available} шт.</p>
              <p>Ціна: €${item.price_2h}</p>
            </div>
          </div>
        `;
      }
      wizard.innerHTML = html;
    }
  </script>
</body>
</html>
```

### 4.3 Адмін-панель (admin/index.html)

```html
<!-- web/public/admin/index.html -->
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Адмін — My Project</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    .sidebar { min-height: 100vh; background: #003366; color: white; }
    .sidebar a { color: rgba(255,255,255,0.8); text-decoration: none; padding: 0.75rem 1rem; display: block; }
    .sidebar a:hover, .sidebar a.active { background: rgba(255,255,255,0.1); color: white; }
  </style>
</head>
<body>
  <div class="container-fluid">
    <div class="row">
      <nav class="col-md-2 sidebar p-3">
        <h4>🏄 Адмін</h4>
        <a href="#" class="active" onclick="loadSection('dashboard')">📊 Dashboard</a>
        <a href="#" onclick="loadSection('bookings')">📋 Бронювання</a>
        <a href="#" onclick="loadSection('inventory')">🏄 Інвентар</a>
        <a href="#" onclick="loadSection('settings')">⚙️ Налаштування</a>
      </nav>
      <main class="col-md-10 p-4">
        <div id="admin-content">
          <div class="text-center py-5"><div class="spinner-border"></div></div>
        </div>
      </main>
    </div>
  </div>

  <script>
    // ⚠️ ВАЖЛИВО: Замініть на ваші реальні значення
    const API = 'https://my-project-api.workers.dev/admin/api';
    const ADMIN_KEY = 'YOUR_ADMIN_API_KEY';  // Замініть на реальний ключ

    const HEADERS = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_KEY}`
    };

    async function api(path, opts = {}) {
      const res = await fetch(API + path, { ...opts, headers: { ...HEADERS, ...opts.headers } });
      return res.json();
    }

    async function loadSection(name) {
      document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
      event.target.classList.add('active');

      const content = document.getElementById('admin-content');
      content.innerHTML = '<div class="text-center py-5"><div class="spinner-border"></div></div>';

      if (name === 'dashboard') await renderDashboard(content);
      else if (name === 'bookings') await renderBookings(content);
      else if (name === 'inventory') await renderInventory(content);
      else if (name === 'settings') await renderSettings(content);
    }

    async function renderDashboard(el) {
      const stats = await api('/dashboard');
      el.innerHTML = `
        <h2>Dashboard</h2>
        <div class="row">
          <div class="col-md-3">
            <div class="card">
              <div class="card-body">
                <h3>${stats.total_bookings}</h3>
                <p>Всього бронювань</p>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card bg-success text-white">
              <div class="card-body">
                <h3>€${stats.revenue || 0}</h3>
                <p>Дохід</p>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    async function renderBookings(el) {
      const bookings = await api('/bookings');
      el.innerHTML = `
        <h2>Бронювання</h2>
        <table class="table">
          <thead><tr><th>Код</th><th>Клієнт</th><th>Сума</th><th>Статус</th></tr></thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td>${b.booking_code}</td>
                <td>${b.full_name}</td>
                <td>€${b.total_amount}</td>
                <td><span class="badge bg-${b.payment_status === 'paid' ? 'success' : 'warning'}">${b.payment_status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    async function renderInventory(el) {
      const items = await api('/inventory');
      el.innerHTML = `
        <h2>Інвентар</h2>
        <table class="table">
          <thead><tr><th>Модель</th><th>Ціна 2h</th><th>Одиниціь</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td>${i.model_name}</td>
                <td>€${i.price_2h}</td>
                <td>${i.total_units}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    async function renderSettings(el) {
      const settings = await api('/settings');
      el.innerHTML = `
        <h2>Налаштування</h2>
        <div class="card p-4">
          <pre>${JSON.stringify(settings, null, 2)}</pre>
        </div>
      `;
    }

    // Завантаження dashboard при старті
    loadSection('dashboard');
  </script>
</body>
</html>
```

---

## 5. Інфраструктура Cloudflare

### 5.1 Створення D1 бази даних

```bash
# Створення бази
wrangler d1 create my-project-db

# Результат:
# [[d1_databases]]
# binding = "DB"
# database_name = "my-project-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Збережіть database_id у wrangler.toml
```

### 5.2 Створення R2 bucket

```bash
# Створення bucket
wrangler r2 bucket create my-project-media

# Для публічного доступу (опціонально):
# Налаштуйте CORS через Dashboard → R2 → CORS
```

### 5.3 Налаштування Custom Domain

```bash
# Додавання домену в Cloudflare Dashboard:
# 1. Зайдіть на https://dash.cloudflare.com
# 2. Оберіть ваш домен
# 3. Додайте DNS записи:

# Для Pages:
# Type: CNAME
# Name: @
# Content: my-project.pages.dev
# Proxied: ✅

# Для API:
# Type: CNAME
# Name: api
# Content: my-project-api.workers.dev
# Proxied: ✅
```

### 5.4 Pages Project

```bash
# Створення Pages проекту
wrangler pages project create my-project --production-branch main

# Додавання custom domain
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/my-project/domains" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  --data '{"name":"myproject.com"}'
```

---

## 6. Секрети та облікові дані

### 6.1 Повний список необхідних секретів

```bash
# ⚠️ НІКОЛИ не комітьте ці значення в Git!

# Cloudflare
CF_API_TOKEN=cf_xxxxxxxxxxxx          # API Token з Dashboard → My Profile → API Tokens
CF_ACCOUNT_ID=xxxxxxxxxxxxxxxx        # ID акаунту (з URL в Dashboard)
CF_ZONE_ID=xxxxxxxxxxxxxxxx           # Zone ID (з Dashboard → Domain → API)

# D1 Database
D1_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx  # ID бази (отримується після створення)
D1_DATABASE_NAME=my-project-db          # Назва бази

# API Keys
ADMIN_API_KEY=your-secret-admin-key     # Для адмін-панелі (генеруйте: openssl rand -hex 32)
JWT_SECRET=your-jwt-secret             # Для JWT токенів (якщо використовуєте)

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx  # Секретний ключ Stripe
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx   # Webhook secret з Stripe Dashboard
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxx  # Публічний ключ (для frontend)

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx         # API Key з https://resend.com/api-keys

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-xxx      # Bot Token від @BotFather
TELEGRAM_CHAT_ID=123456789             # Chat ID для сповіщень
```

### 6.2 Як отримати кожен кредішнл

```bash
# 1. Cloudflare API Token
#    → https://dash.cloudflare.com/profile/api-tokens
#    → Create Token → Custom Template:
#       - Workers Scripts: Edit
#       - D1: Edit
#       - Pages: Edit
#       - R2: Edit

# 2. Account ID
#    → https://dash.cloudflare.com
#    → Знаходиться в URL: https://dash.cloudflare.com/{account_id}/...

# 3. Zone ID
#    → Dashboard → Domain → Scroll down → API → Zone ID

# 4. D1 Database ID
#    → Після створення: wrangler d1 create my-project-db

# 5. Admin API Key (генеруйте самі)
openssl rand -hex 32
# Результат: a1b2c3d4e5f6... (64 символи)

# 6. Stripe Keys
#    → https://dashboard.stripe.com/apikeys
#    → Для production: sk_live_xxx, pk_live_xxx
#    → Webhook secret: Dashboard → Developers → Webhooks → Signing secret

# 7. Resend API Key
#    → https://resend.com/api-keys
#    → Create API Key

# 8. Telegram Bot
#    → Telegram: @BotFather → /newbot → отримаєте токен
#    → Chat ID: напишіть боту, потім:
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

### 6.3 Встановлення секретів

```bash
# Встановлення секретів у Worker
cd api

# Інтерактивно (рекомендовано)
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ADMIN_API_KEY

# Через файл (для CI/CD)
echo "sk_live_xxx" | wrangler secret put STRIPE_SECRET_KEY

# Перевірка (не показує значення!)
wrangler secret list
```

### 6.4 Безпека

```bash
# .gitignore — ніколи не комітити!
.dev.vars
.env
.env.local
.env.production
*.pem
*.key

# .env.example — шаблон (без значень!)
cp .env.example .env
# Заповніть .env локально, але НЕ комітте!
```

---

## 7. CI/CD Pipeline

### 7.1 GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: api/package-lock.json

      - name: Install API dependencies
        run: cd api && npm ci

      - name: Lint API
        run: cd api && npm run lint --if-present

  deploy-api:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: api/package-lock.json

      - name: Install dependencies
        run: cd api && npm ci

      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          workingDirectory: 'api'
          command: deploy

      - name: Run D1 migrations
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          workingDirectory: 'api'
          command: d1 execute my-project-db --remote --file=./db/schema.sql

  deploy-web:
    needs: deploy-api
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          workingDirectory: 'web'
          command: pages deploy public --project-name=my-project
```

### 7.2 Налаштування GitHub Secrets

```bash
# У GitHub Repository → Settings → Secrets and variables → Actions → New repository secret

# Додайте ці секрети:
CF_API_TOKEN=cf_xxxxxxxxxxxx
CF_ACCOUNT_ID=xxxxxxxxxxxxxxxx
```

---

## 8. Процес деплою

### 8.1 Деплой API (Workers)

```bash
cd api

# 1. Встановлення залежностей
npm ci

# 2. Локальне тестування
npm run dev

# 3. Деплой
npx wrangler deploy

# Результат:
# Uploaded my-project-api (3.02 sec)
# Deployed my-project-api triggers (1.96 sec)
# https://my-project-api.workers.dev
```

### 8.2 Деплой Frontend (Pages)

```bash
cd web

# 1. Деплой
npx wrangler pages deploy public --project-name=my-project

# Результат:
# Uploaded 4 files (1.78 sec)
# Deployment complete! Take a peek over at https://xxxxx.my-project.pages.dev
```

### 8.3 Пост-деплой перевірка

```bash
# Health check
curl https://my-project-api.workers.dev/

# API ендпоінти
curl https://my-project-api.workers.dev/api/locations
curl https://my-project-api.workers.dev/api/inventory

# Frontend
curl -I https://my-project.pages.dev

# Перевірка в браузері
# Відкрийте: https://my-project.pages.dev
# DevTools → Console → має бути без помилок CORS/404
```

---

## 9. Моніторинг та обслуговування

### 9.1 Cloudflare Analytics

```bash
# Dashboard → Workers & Pages → my-project-api → Metrics
# - Requests per second
# - CPU time
# - Errors

# Dashboard → Workers & Pages → my-project → Analytics
# - Page views
# - Bandwidth
# - Cache hit ratio
```

### 9.2 Logs

```bash
# Real-time logs
wrangler tail my-project-api

# З фільтром
wrangler tail my-project-api --format=json | jq 'select(.log | contains("error"))'
```

### 9.3 Database Backup

```bash
# D1 автоматично робить бекапи, але можна експортувати:
wrangler d1 export my-project-db --output=backup.sql

# Імпорт бекапу
wrangler d1 execute my-project-db --file=backup.sql
```

### 9.4 Ліміти (Free Tier)

```
Workers:
- 100,000 requests/day (free)
- 10ms CPU time per request
- 128 MB memory

D1:
- 5 GB storage (free)
- 100,000 rows read/day
- 1,000 rows written/day

Pages:
- 1 build per minute
- 500 builds/month (free)
- Unlimited bandwidth
```

---

## 10. Траблшутинг

### 10.1 CORS Errors

```
Помилка: Access to fetch at 'https://api...' from origin 'https://pages.dev' has been blocked by CORS

Рішення:
1. Додати https://my-project.pages.dev до CORS в api/src/index.js
2. Перевірити що FRONTEND_URL в wrangler.toml правильний
3. Передеплоїти API
```

### 10.2 404 Not Found

```
Помилка: {"error":"Not Found"}

Рішення:
1. Перевірити маршрут в index.js
2. Перевірити що файл існує
3. Перевірити що деплой успішний
```

### 10.3 Environment Variables Not Loading

```
Помилка: c.env.MY_VAR is undefined

Рішення:
1. Перевірити wrangler.toml [vars]
2. Для секретів — wrangler secret put MY_VAR
3. Передеплоїти після змін
```

### 10.4 D1 Migration Conflicts

```
Помилка: table already exists

Рішення:
Використовувати IF NOT EXISTS в SQL:
CREATE TABLE IF NOT EXISTS ...
```

### 10.5 Cold Start Optimization

```
Проблема: Перший запит повільний (>500ms)

Рішення:
1. Мінімізувати imports
2. Використовувати lazy loading
3. Використовувати D1 prepared statements
```

### 10.6 Build Failures on Pages

```
Рішення:
1. Перевірити шлях до папки (public/)
2. Перевірити назву проекту (--project-name)
3. Перевірити що файли існують
```

---

## 📋 Фінальний чеклист

```bash
# Перед деплоєм:
□ npm ci в api/ та web/
□ Локальне тестування пройшло
□ Всі секрети встановленні
□ D1 міграції виконані
□ CORS налаштований правильно
□ API URL правильний в HTML

# Деплой:
□ cd api && npx wrangler deploy
□ cd web && npx wrangler pages deploy public --project-name=my-project

# Після деплою:
□ Health check повертає 200
□ API ендпоінти працюють
□ Frontend завантажується
□ Немає помилок в консолі браузера
□ Адмін-панель доступна з Authorization
```

---

Цей документ є вичерпним керівництвом для розгортання full-stack додатку на Cloudflare. Кожен крок можна скопіювати та виконати. У разі проблем — дивіться розділ [Траблшутинг](#10-траблшутинг).
