import { Hono } from 'hono';

export const publicRoutes = new Hono();

// 📍 Отримати всі активні локації
publicRoutes.get('/locations', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(
    'SELECT id, name, slug, lat, lng, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();
  return c.json(results);
});

// 🏄 Отримати весь інвентар (активні дошки)
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

// 🔍 Перевірка доступності дошок на конкретну дату
publicRoutes.get('/availability', async (c) => {
  const db = c.env.DB;
  const { date, inventory_id, duration_type } = c.req.query();

  if (!date || !inventory_id) {
    return c.json({ error: 'Missing date or inventory_id' }, 400);
  }

  // Обчислюємо часовий діапазон на основі duration_type
  const durationHours = {
    '2h': 2,
    'half_day': 5,
    'full_day': 10,
    'multi_day': 24
  }[duration_type] || 2;

  const startDateTime = `${date}T00:00:00`;
  const endDateTime = new Date(new Date(startDateTime).getTime() + durationHours * 3600 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  // Рахуємо заброньовані одиниці, що перетинаються з обраним інтервалом
  const booked = await db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) as total_booked
    FROM booking_items bi
    JOIN bookings b ON bi.booking_id = b.id
    WHERE bi.inventory_id = ?
      AND b.payment_status != 'failed'
      AND b.start_time < ?
      AND b.end_time > ?
  `).bind(inventory_id, endDateTime, startDateTime).first();

  const inv = await db.prepare(
    'SELECT total_units FROM inventory WHERE id = ?'
  ).bind(inventory_id).first();

  if (!inv) return c.json({ error: 'Inventory not found' }, 404);

  const available = inv.total_units - (booked.total_booked || 0);

  return c.json({
    inventory_id: parseInt(inventory_id),
    date,
    total_units: inv.total_units,
    booked: booked.total_booked || 0,
    available: Math.max(0, available)
  });
});

// ⭐ Відгуки (публічні)
publicRoutes.get('/reviews', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT customer_name, rating, comment, photo_url, created_at
    FROM reviews WHERE is_visible = 1
    ORDER BY created_at DESC LIMIT 50
  `).all();
  return c.json(results);
});

// 📜 Документ за типом та мовою
publicRoutes.get('/documents/:type/:lang', async (c) => {
  const db = c.env.DB;
  const { type, lang } = c.req.param();

  const doc = await db.prepare(`
    SELECT title, content_html, pdf_url
    FROM documents
    WHERE doc_type = ? AND lang_code = ? AND is_active = 1
  `).bind(type, lang).first();

  if (!doc) return c.json({ error: 'Document not found' }, 404);
  return c.json(doc);
});

// 🌐 Переклади для мови
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
