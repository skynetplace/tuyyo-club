# 📦 РЕАЛІЗАЦІЯ ПРОЄКТУ TUYYO CLUB (Актуальна версія)

> **⚠️ Цей файл містить актуальну версію коду з усіма виправленнями.**
> **Дата останнього оновлення:** 2026-06-26

---

## 📁 Структура файлів

```
tuyyo-club/
├── README.md
├── .github/workflows/deploy.yml
├── api/
│   ├── wrangler.toml
│   ├── package.json
│   ├── db/
│   │   └── schema.sql
│   └── src/
│       ├── index.js          ← Актуальний (CORS для всіх маршрутів)
│       ├── routes/
│       │   ├── public.js
│       │   ├── booking.js    ← Актуальний (з GET /step-1)
│       │   ├── admin.js      ← Актуальний (з валідацією)
│       │   └── webhooks.js   ← Актуальний (з stripe.js модулем)
│       └── lib/
│           ├── db.js         ← Актуальний (25+ функцій)
│           ├── stripe.js     ← Актуальний (Checkout + Webhooks)
│           └── notify.js     ← Актуальний (Telegram + Email)
└── web/
    ├── package.json
    └── public/
        ├── index.html        ← Актуальний (без HTMX на hero-title)
        ├── booking.html      ← Актуальний
        ├── success.html
        └── admin/
            └── index.html    ← Актуальний (з Authorization header)
```

---

## 🔗 Важливі посилання

- **Frontend:** https://tuyyo-club.pages.dev
- **API:** https://tuyyo-api.sashka-desire.workers.dev
- **Адмінка:** https://tuyyo-club.pages.dev/admin/
- **GitHub:** https://github.com/skynetplace/tuyyo-club

---

## ⚠️ Критичні виправлення (обов'язково для роботи)

### 1. CORS має бути для ВСІХ маршрутів

```javascript
// api/src/index.js — ПРАВИЛЬНО
app.use('*', cors({  // ← '*' а не '/api/*'
  origin: (origin, c) => {
    const allowed = [
      'https://tuyyo-club.pages.dev',
      'http://localhost:3000'
    ];
    if (origin && allowed.includes(origin)) return origin;
    return allowed[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
```

**Чому це важливо:** Якщо використовувати `'/api/*'`, то запити до `/admin/api/*` не будуть мати CORS заголовків і браузер заблокує їх.

---

### 2. API URL в HTML файлах

```javascript
// web/public/booking.html — ПРАВИЛЬНО
const API = 'https://tuyyo-api.sashka-desire.workers.dev/api';

// web/public/admin/index.html — ПРАВИЛЬНО
const API = 'https://tuyyo-api.sashka-desire.workers.dev/admin/api';
const ADMIN_KEY = 'your-admin-key';  // Замініть на реальний ключ
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ADMIN_KEY}`
};
```

---

### 3. Адмінка вимагає Authorization header

```javascript
// web/public/admin/index.html
const ADMIN_KEY = 'tuyyo-admin-2026-secure-key';  // Ваш ключ
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ADMIN_KEY}`
};

async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { ...HEADERS, ...opts.headers } });
  return res.json();
}
```

**Якщо не хочете використовувати Authorization header**, закоментуйте middleware в `api/src/routes/admin.js`:

```javascript
// adminRoutes.use('*', async (c, next) => {
//   ... перевірка ключа ...
//   await next();
// });
```

---

### 4. Ендпоінт /api/booking/step-1

```javascript
// api/src/routes/booking.js — Додано GET /step-1
bookingRoutes.get('/step-1', async (c) => {
  const db = c.env.DB;
  const { results: locations } = await db.prepare(
    'SELECT id, name, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // ... повертаємо HTML для кроку 1
});
```

---

## 🚀 Інструкція з розгортання

### Крок 1: Підготовка Cloudflare
```bash
npm install -g wrangler
wrangler login
```

### Крок 2: Створення D1 бази
```bash
cd api
wrangler d1 create tuyyo-db-prod
# Скопіюйте database_id → вставити в wrangler.toml
```

### Крок 3: Ініціалізація БД
```bash
wrangler d1 execute tuyyo-db-prod --remote --file=./db/schema.sql
```

### Крок 4: Встановлення секретів
```bash
echo "your-admin-key" | wrangler secret put ADMIN_API_KEY
echo "sk_live_xxx" | wrangler secret put STRIPE_SECRET_KEY
echo "whsec_xxx" | wrangler secret put STRIPE_WEBHOOK_SECRET
echo "re_xxx" | wrangler secret put RESEND_API_KEY
echo "123456:ABC-xxx" | wrangler secret put TELEGRAM_BOT_TOKEN
```

### Крок 5: Деплой API
```bash
cd api
npm install
npx wrangler deploy
```

### Крок 6: Деплой Frontend
```bash
cd web
npx wrangler pages deploy public --project-name=tuyyo-club
```

### Крок 7: Налаштування DNS
У Cloudflare Dashboard → DNS:
- `tuyyo.com` → CNAME → `tuyyo-club.pages.dev` (proxied)
- `api.tuyyo.com` → CNAME → `tuyyo-api.<subdomain>.workers.dev` (proxied)

---

## 🔐 Адмін-панель

Адмінка захищена через:
1. **Authorization header** (простий спосіб для розробки)
2. **Cloudflare Zero Trust** (для production — налаштуйте в Dashboard)

### Як отримати доступ:
1. Відкрийте `https://tuyyo-club.pages.dev/admin/`
2. Введіть ADMIN_API_KEY в налаштуваннях
3. Або налаштуйте Zero Trust в Cloudflare Dashboard

---

## 📋 Чеклист розробника

- [ ] Cloudflare API Token має права: `D1: Edit`, `Workers Scripts: Edit`, `Pages: Edit`
- [ ] Створено D1 базу, виконано `schema.sql`
- [ ] Встановлено секрети: `ADMIN_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] CORS налаштований для `https://tuyyo-club.pages.dev`
- [ ] API URL в HTML файлах вказано правильно
- [ ] Адмінка передає Authorization header
- [ ] Lighthouse показує Performance > 95, SEO > 95

---

## ⚠️ Відомі обмеження

1. **R2 Bucket** — потребує оплати, закоментований у wrangler.toml
2. **Custom Domain** — `tuyyo.com` потрібно додати в Cloudflare Dashboard
3. **Zero Trust** — потрібен токен з правами `Access:Edit`

---

*Цей документ є актуальною версією реалізації проекту TUYYO CLUB. Для отримання коду конкретного файлу, відкрийте його безпосередньо в проекті.*
