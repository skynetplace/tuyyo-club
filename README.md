# 🏄 TUYYO CLUB — SUP Rental Platform

Преміальна платформа оренди SUP-бордів на Costa Blanca.
Побудована на Cloudflare Workers + D1 + Pages + R2.

## 🚀 Швидкий старт

### 1. Встановлення залежностей
```bash
cd api && npm install
cd ../web && npm install
```

### 2. Авторизація в Cloudflare
```bash
wrangler login
```

### 3. Створення D1 бази даних
```bash
cd api
wrangler d1 create tuyyo-db-prod
# Скопіюйте database_id у wrangler.toml
```

### 4. Ініціалізація схеми БД
```bash
wrangler d1 execute tuyyo-db-prod --remote --file=./db/schema.sql
```

### 5. Створення R2 Bucket
```bash
wrangler r2 bucket create tuyyo-media
```

### 6. Встановлення секретів
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ADMIN_API_KEY
```

### 7. Локальна розробка
```bash
# API (порт 8787)
cd api && npm run dev

# Frontend (порт 3000)
cd web && npm run dev
```

### 8. Деплой
```bash
# Автоматично через GitHub Actions при push в main
# Або вручну:
cd api && npm run deploy
cd ../web && npm run deploy
```

## 📋 Повна інструкція з розгортання

### Крок 1: Підготовка Cloudflare
```bash
npm install -g wrangler
wrangler login
```

### Крок 2: Створення D1 бази
```bash
cd api
wrangler d1 create tuyyo-db-prod
# Скопіюйте database_id у wrangler.toml
```

### Крок 3: Ініціалізація БД
```bash
wrangler d1 execute tuyyo-db-prod --remote --file=./db/schema.sql
```

### Крок 4: Створення R2 Bucket
```bash
wrangler r2 bucket create tuyyo-media
```

### Крок 5: Встановлення секретів
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put ADMIN_API_KEY
```

### Крок 6: Деплой API
```bash
cd api
npm install
npm run deploy
```

### Крок 7: Деплой Frontend
```bash
cd web
npm run deploy
# або
wrangler pages deploy public --project-name=tuyyo-club
```

### Крок 8: Налаштування DNS
У Cloudflare Dashboard → Websites → tuyyo.com → DNS:
- `tuyyo.com` → CNAME → `tuyyo-club.pages.dev` (proxied)
- `api.tuyyo.com` → CNAME → `tuyyo-api.<your-subdomain>.workers.dev` (proxied)
- `media.tuyyo.com` → CNAME → R2 bucket (custom domain)

### Крок 9: Cloudflare Zero Trust для адмінки
1. Zero Trust → Access → Applications → Add
2. Application domain: `tuyyo.com/admin/*`
3. Policy: Allow → Include → Emails: `owner@tuyyo.com`

### Крок 10: Stripe Webhook
У Stripe Dashboard → Webhooks → Add endpoint:
- URL: `https://api.tuyyo.com/api/webhooks/stripe`
- Events: `checkout.session.completed`
- Скопіювати webhook secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`

## 🔐 Адмін-панель

Адмінка захищена Cloudflare Zero Trust.
URL: `https://tuyyo.com/admin/`

Налаштування Zero Trust:
1. Cloudflare Dashboard → Zero Trust → Access → Applications
2. Add Application → Self-hosted
3. Domain: `tuyyo.com/admin/*`
4. Policy: Allow → Emails: `owner@tuyyo.com`

## 🌍 Змінні оточення

### Production (api/wrangler.toml)
- `ENVIRONMENT=production`
- `FRONTEND_URL=https://tuyyo.com`
- `API_URL=https://api.tuyyo.com`

### Secrets (через wrangler secret)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_API_KEY`

## 📁 Структура проекту

```
tuyyo-club/
├── api/                      # Cloudflare Worker (Backend API)
│   ├── src/
│   │   ├── index.js          # Точка входу, Hono роутер
│   │   ├── routes/           # API маршрути
│   │   └── lib/              # Допоміжні модулі
│   ├── db/
│   │   └── schema.sql        # Схема БД
│   ├── wrangler.toml         # Конфіг Worker
│   └── package.json
│
├── web/                      # Cloudflare Pages (Frontend)
│   └── public/               # Статичні HTML файли
│       ├── index.html        # Головна
│       ├── booking.html      # Бронювання
│       ├── success.html      # Підтвердження
│       └── admin/            # Адмін-панель
│
└── .github/workflows/        # CI/CD
    └── deploy.yml
```

## 🛠 Технологічний стек

- **Frontend:** HTML5 + Bootstrap 5.3 + HTMX 2.0
- **Backend:** Cloudflare Workers + Hono
- **Database:** Cloudflare D1 (Edge SQLite)
- **Media Storage:** Cloudflare R2
- **Hosting:** Cloudflare Pages
- **Payments:** Stripe Checkout
- **Notifications:** Resend (Email), Telegram Bot API

## 📄 Ліцензія

© 2024 TUYYO CLUB. All rights reserved.
