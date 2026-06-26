/**
 * index.js — Головний файл API (Cloudflare Worker)
 *
 * Маршрути:
 * - /api/* — публічний API (локації, інвентар, відгуки, документи)
 * - /api/booking/* — бронювання (розрахунок, створення)
 * - /api/webhooks/* — вебхуки (Stripe)
 * - /admin/api/* — адмін-панель (потребує авторизації)
 *
 * Обробка помилок:
 * - 404 — Not Found
 * - 4xx — Помилки клієнта (валідація)
 * - 5xx — Помилки сервера
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { publicRoutes } from './routes/public.js';
import { bookingRoutes } from './routes/booking.js';
import { adminRoutes } from './routes/admin.js';
import { webhookRoutes } from './routes/webhooks.js';

const app = new Hono();

// 📝 Logger — логуємо всі запити
app.use('*', logger());

// CORS — тільки для нашого фронтенду
app.use('/api/*', cors({
  origin: (origin, c) => {
    const allowed = [
      c.env.FRONTEND_URL,
      'https://tuyyo.com',
      'https://www.tuyyo.com',
      'http://localhost:3000'
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
    service: 'tuyyo-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Публічні маршрути (каталог, локації, відгуки)
app.route('/api', publicRoutes);

// Бронювання
app.route('/api/booking', bookingRoutes);

// Webhooks (Stripe тощо)
app.route('/api/webhooks', webhookRoutes);

// Адмін-панель
app.route('/admin/api', adminRoutes);

// 404
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
    method: c.req.method
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);

  // Визначаємо статус код
  const status = err.status || err.statusCode || 500;

  // Для 5xx — не розкриваємо деталі клієнту
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
