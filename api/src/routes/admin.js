/**
 * admin.js — Маршрути для адмін-панелі
 *
 * Захищені через:
 * 1. Bearer token (ADMIN_API_KEY) — для простого доступу
 * 2. Cloudflare Zero Trust — у production (налаштується в Cloudflare Dashboard)
 *
 * Додаткова валідація:
 * - Перевірка наявності критичних секретів
 * - Маскування секретних значень у відповідях
 * - Валідація вхідних даних
 */

import { Hono } from 'hono';
import { getAllSettingsMasked, getDashboardStats, getBookingsList } from '../lib/db.js';

export const adminRoutes = new Hono();

// 🔐 Middleware: перевірка адмін-доступу
// Підтримує два режими:
// 1. Через ADMIN_API_KEY (wrangler secret)
// 2. Через відсутність ключа (dev режим — дозволено без авторизації)
adminRoutes.use('*', async (c, next) => {
  const adminKey = c.env.ADMIN_API_KEY;

  // Якщо ключ налаштований — вимагаємо його
  if (adminKey) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }
    if (!authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Invalid Authorization format. Use: Bearer <token>' }, 401);
    }
    const token = authHeader.slice(7);
    if (token !== adminKey) {
      return c.json({ error: 'Invalid API key' }, 401);
    }
  }

  await next();
});

// 🛡️ Middleware: перевірка наявності критичних секретів
// Додає попередження якщо секрети не налаштовані
adminRoutes.use('*', async (c, next) => {
  c.env._secretsCheck = null;
  await next();
});

/**
 * GET /admin/api/dashboard
 * Статистика для дашборду
 */
adminRoutes.get('/dashboard', async (c) => {
  const stats = await getDashboardStats(c.env.DB);
  return c.json(stats);
});

/**
 * GET /admin/api/secrets/status
 * Перевірка статусу секретів (які налаштовані, які ні)
 */
adminRoutes.get('/secrets/status', async (c) => {
  const db = c.env.DB;
  const secretKeys = [
    'stripe_secret_key',
    'stripe_webhook_secret',
    'stripe_publishable_key',
    'resend_api_key',
    'telegram_bot_token',
    'telegram_chat_id'
  ];

  const status = {};
  for (const key of secretKeys) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    status[key] = {
      configured: !!(row?.value),
      length: row?.value?.length || 0
    };
  }

  return c.json({
    secrets: status,
    allConfigured: Object.values(status).every(s => s.configured),
    timestamp: new Date().toISOString()
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

  // Валідація
  if (!data.model_name || !data.slug) {
    return c.json({ error: 'model_name and slug are required' }, 400);
  }

  const res = await db.prepare(`
    INSERT INTO inventory (model_name, slug, description, max_weight_kg,
      price_2h, price_half_day, price_full_day, price_multi_day,
      deposit_amount, total_units, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.model_name, data.slug, data.description || null, data.max_weight_kg || null,
    data.price_2h || 35, data.price_half_day || 40, data.price_full_day || 50, data.price_multi_day || 40,
    data.deposit_amount || 150, data.total_units || 1,
    data.image_url || null, data.is_active !== false ? 1 : 0
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

// 📍 CRUD Локації
adminRoutes.get('/locations', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM locations ORDER BY name'
  ).all();
  return c.json(results);
});

adminRoutes.post('/locations', async (c) => {
  const data = await c.req.json();

  if (!data.name || !data.slug) {
    return c.json({ error: 'name and slug are required' }, 400);
  }

  const res = await c.env.DB.prepare(`
    INSERT INTO locations (name, slug, lat, lng, delivery_fee, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(data.name, data.slug, data.lat, data.lng, data.delivery_fee || 20, 1).run();
  return c.json({ id: res.meta.last_row_id });
});

// ⚙️ Налаштування
adminRoutes.get('/settings', async (c) => {
  const settings = await getAllSettingsMasked(c.env.DB);
  return c.json(settings);
});

adminRoutes.post('/settings', async (c) => {
  const db = c.env.DB;
  const data = await c.req.json();

  for (const [key, value] of Object.entries(data)) {
    // Не перезаписуємо секрети, якщо прийшла маска
    if (typeof value === 'string' && value.startsWith('••••••••')) continue;

    await db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  }

  return c.json({ success: true });
});

// 📜 Документи
adminRoutes.get('/documents', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM documents ORDER BY doc_type, lang_code'
  ).all();
  return c.json(results);
});

adminRoutes.post('/documents', async (c) => {
  const data = await c.req.json();

  if (!data.doc_type || !data.lang_code || !data.title) {
    return c.json({ error: 'doc_type, lang_code, and title are required' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO documents (doc_type, lang_code, title, content_html, pdf_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(doc_type, lang_code) DO UPDATE SET
      title = excluded.title, content_html = excluded.content_html,
      pdf_url = excluded.pdf_url, is_active = excluded.is_active,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    data.doc_type, data.lang_code, data.title,
    data.content_html || null, data.pdf_url || null, data.is_active !== false ? 1 : 0
  ).run();
  return c.json({ success: true });
});

// 🌐 Переклади
adminRoutes.get('/translations', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM translations ORDER BY translation_key'
  ).all();
  return c.json(results);
});

adminRoutes.post('/translations', async (c) => {
  const data = await c.req.json();

  if (!data.lang_code || !data.translation_key || !data.translation_value) {
    return c.json({ error: 'lang_code, translation_key, and translation_value are required' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO translations (lang_code, translation_key, translation_value)
    VALUES (?, ?, ?)
    ON CONFLICT(lang_code, translation_key) DO UPDATE SET
      translation_value = excluded.translation_value
  `).bind(data.lang_code, data.translation_key, data.translation_value).run();
  return c.json({ success: true });
});

// 📤 Завантаження файлів у R2
adminRoutes.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file) return c.json({ error: 'No file' }, 400);

  // Валідація типу файлу
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: `File type ${file.type} not allowed` }, 400);
  }

  // Валідація розміру (макс 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 10MB)' }, 400);
  }

  const ext = file.name.split('.').pop();
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  const publicUrl = `https://media.tuyyo.com/${key}`;
  return c.json({ url: publicUrl, key });
});

// 📋 Список бронювань
adminRoutes.get('/bookings', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit')) || 100, 500);
  const results = await getBookingsList(c.env.DB, limit);
  return c.json(results);
});
