/**
 * db.js — Модуль для роботи з базою даних Cloudflare D1
 *
 * Централізовані функції для доступу до даних.
 * Використовується всіма маршрутами для запитів до БД.
 *
 * Приклад використання:
 *   import { getSetting, getLocations } from './lib/db.js';
 *
 *   const locations = await getLocations(c.env.DB);
 *   const stripeKey = await getSetting(c.env.DB, 'stripe_secret_key');
 */

/**
 * Отримати всі активні локації
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
export async function getLocations(db) {
  const { results } = await db.prepare(
    'SELECT id, name, slug, lat, lng, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();
  return results;
}

/**
 * Отримати локацію за ID
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function getLocationById(db, id) {
  return db.prepare(
    'SELECT * FROM locations WHERE id = ?'
  ).bind(id).first();
}

/**
 * Отримати весь активний інвентар
 * @param {D1Database} db
 * @returns {Promise<Array>}
 */
export async function getActiveInventory(db) {
  const { results } = await db.prepare(`
    SELECT id, model_name, slug, description, max_weight_kg,
           price_2h, price_half_day, price_full_day, price_multi_day,
           deposit_amount, image_url
    FROM inventory WHERE is_active = 1
    ORDER BY price_2h ASC
  `).all();
  return results;
}

/**
 * Отримати інвентар за ID
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function getInventoryById(db, id) {
  return db.prepare(
    'SELECT * FROM inventory WHERE id = ? AND is_active = 1'
  ).bind(id).first();
}

/**
 * Отримати ціну для конкретного типу тривалості
 * @param {Object} inventory - Рядок інвентарю з БД
 * @param {string} durationType - '2h' | 'half_day' | 'full_day' | 'multi_day'
 * @returns {number}
 */
export function getPriceForDuration(inventory, durationType) {
  const priceKey = {
    '2h': 'price_2h',
    'half_day': 'price_half_day',
    'full_day': 'price_full_day',
    'multi_day': 'price_multi_day'
  }[durationType];
  return inventory[priceKey];
}

/**
 * Перевірити доступність інвентарю на конкретну дату
 * @param {D1Database} db
 * @param {number} inventoryId
 * @param {string} startTime
 * @param {string} endTime
 * @returns {Promise<Object>} { available, total_units, booked }
 */
export async function checkAvailability(db, inventoryId, startTime, endTime) {
  const inv = await db.prepare(
    'SELECT total_units FROM inventory WHERE id = ?'
  ).bind(inventoryId).first();

  if (!inv) return { available: 0, total_units: 0, booked: 0, exists: false };

  const booked = await db.prepare(`
    SELECT COALESCE(SUM(bi.quantity), 0) as total_booked
    FROM booking_items bi
    JOIN bookings b ON bi.booking_id = b.id
    WHERE bi.inventory_id = ?
      AND b.payment_status != 'failed'
      AND b.start_time < ?
      AND b.end_time > ?
  `).bind(inventoryId, endTime, startTime).first();

  const bookedCount = booked.total_booked || 0;
  return {
    available: Math.max(0, inv.total_units - bookedCount),
    total_units: inv.total_units,
    booked: bookedCount,
    exists: true
  };
}

/**
 * Отримати всі відгуки (активні)
 * @param {D1Database} db
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getReviews(db, limit = 50) {
  const { results } = await db.prepare(`
    SELECT customer_name, rating, comment, photo_url, created_at
    FROM reviews WHERE is_visible = 1
    ORDER BY created_at DESC LIMIT ?
  `).bind(limit).all();
  return results;
}

/**
 * Отримати документ за типом та мовою
 * @param {D1Database} db
 * @param {string} type
 * @param {string} lang
 * @returns {Promise<Object|null>}
 */
export async function getDocument(db, type, lang) {
  return db.prepare(`
    SELECT title, content_html, pdf_url
    FROM documents
    WHERE doc_type = ? AND lang_code = ? AND is_active = 1
  `).bind(type, lang).first();
}

/**
 * Отримати переклади для мови
 * @param {D1Database} db
 * @param {string} lang
 * @returns {Promise<Object>} Dictionary { key: value }
 */
export async function getTranslations(db, lang) {
  const { results } = await db.prepare(
    'SELECT translation_key, translation_value FROM translations WHERE lang_code = ?'
  ).bind(lang).all();

  const dict = {};
  results.forEach(r => dict[r.translation_key] = r.translation_value);
  return dict;
}

/**
 * Отримати налаштування за ключем
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getSetting(db, key) {
  const row = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first();
  return row?.value ?? null;
}

/**
 * Отримати налаштування з перевіркою секретного ключа
 * Якщо ключ не знайдено або не є секретом — кидає помилку
 * @param {D1Database} db
 * @param {string} key
 * @returns {Promise<string>}
 * @throws {Error} Якщо налаштування не знайдено
 */
export async function getRequiredSetting(db, key) {
  const row = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first();

  if (!row || !row.value) {
    throw new Error(`Required setting "${key}" is not configured`);
  }
  return row.value;
}

/**
 * Встановити або оновити налаштування (upsert)
 * @param {D1Database} db
 * @param {string} key
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function setSetting(db, key, value) {
  await db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(key, value).run();
}

/**
 * Отримати всі налаштування з маскуванням секретів
 * @param {D1Database} db
 * @returns {Promise<Object>}
 */
export async function getAllSettingsMasked(db) {
  const { results } = await db.prepare(
    'SELECT key, value, is_secret FROM settings'
  ).all();

  const settings = {};
  results.forEach(r => {
    settings[r.key] = r.is_secret && r.value
      ? '••••••••' + r.value.slice(-4)
      : r.value;
  });
  return settings;
}

/**
 * Створити клієнта
 * @param {D1Database} db
 * @param {Object} customer
 * @returns {Promise<number>} ID створеного клієнта
 */
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

/**
 * Створити бронювання
 * @param {D1Database} db
 * @param {Object} bookingData
 * @returns {Promise<number>} ID створеного бронювання
 */
export async function createBooking(db, bookingData) {
  const res = await db.prepare(`
    INSERT INTO bookings (
      booking_code, customer_id, location_id, start_time, end_time,
      duration_type, subtotal, delivery_fee, deposit_total, total_amount,
      payment_method, legal_agreement
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    bookingData.booking_code,
    bookingData.customer_id,
    bookingData.location_id,
    bookingData.start_time,
    bookingData.end_time,
    bookingData.duration_type,
    bookingData.subtotal,
    bookingData.delivery_fee,
    bookingData.deposit_total,
    bookingData.total_amount,
    bookingData.payment_method || 'stripe',
    bookingData.legal_agreement ? 1 : 0
  ).run();
  return res.meta.last_row_id;
}

/**
 * Додати позицію бронювання
 * @param {D1Database} db
 * @param {number} bookingId
 * @param {number} inventoryId
 * @param {number} quantity
 * @param {number} priceAtBooking
 */
export async function addBookingItem(db, bookingId, inventoryId, quantity, priceAtBooking) {
  await db.prepare(`
    INSERT INTO booking_items (booking_id, inventory_id, quantity, price_at_booking)
    VALUES (?, ?, ?, ?)
  `).bind(bookingId, inventoryId, quantity, priceAtBooking).run();
}

/**
 * Оновити статус оплати бронювання
 * @param {D1Database} db
 * @param {number} bookingId
 * @param {string} status
 */
export async function updateBookingPaymentStatus(db, bookingId, status) {
  await db.prepare(
    'UPDATE bookings SET payment_status = ? WHERE id = ?'
  ).bind(status, bookingId).run();
}

/**
 * Зберегти stripe_session_id для бронювання
 * @param {D1Database} db
 * @param {number} bookingId
 * @param {string} sessionId
 */
export async function setBookingStripeSession(db, bookingId, sessionId) {
  await db.prepare(
    'UPDATE bookings SET stripe_session_id = ? WHERE id = ?'
  ).bind(sessionId, bookingId).run();
}

/**
 * Отримати бронювання за ID з даними клієнта та локації
 * @param {D1Database} db
 * @param {number} bookingId
 * @returns {Promise<Object|null>}
 */
export async function getBookingWithDetails(db, bookingId) {
  return db.prepare(`
    SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN locations l ON b.location_id = l.id
    WHERE b.id = ?
  `).bind(bookingId).first();
}

/**
 * Отримати список бронювань (для адмінки)
 * @param {D1Database} db
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
export async function getBookingsList(db, limit = 100) {
  const { results } = await db.prepare(`
    SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN locations l ON b.location_id = l.id
    ORDER BY b.created_at DESC LIMIT ?
  `).bind(limit).all();
  return results;
}

/**
 * Розрахунок статистики для дашборду
 * @param {D1Database} db
 * @returns {Promise<Object>}
 */
export async function getDashboardStats(db) {
  const totalBookings = await db.prepare(
    'SELECT COUNT(*) as count FROM bookings'
  ).first();
  const paidBookings = await db.prepare(
    "SELECT COUNT(*) as count, SUM(total_amount) as revenue FROM bookings WHERE payment_status = 'paid'"
  ).first();
  const pendingBookings = await db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'unpaid'"
  ).first();

  return {
    total_bookings: totalBookings.count,
    paid_bookings: paidBookings.count,
    revenue: paidBookings.revenue || 0,
    pending_bookings: pendingBookings.count
  };
}
