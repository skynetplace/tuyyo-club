/**
 * booking.js — Маршрути для бронювання
 *
 * Обробляє запити:
 * - POST /api/booking/calculate — розрахунок вартості
 * - POST /api/booking/create — створення бронювання
 *
 * Використовує модулі:
 * - db.js — для роботи з БД
 * - stripe.js — для оплати через Stripe
 * - notify.js — для сповіщень
 */

import { Hono } from 'hono';
import { getLocationById, getInventoryById, getPriceForDuration, getSetting, checkAvailability, createCustomer, createBooking, addBookingItem, setBookingStripeSession, getDashboardStats } from '../lib/db.js';
import { createCheckoutSession } from '../lib/stripe.js';
import { sendNotifications } from '../lib/notify.js';

export const bookingRoutes = new Hono();

/**
 * GET /api/booking/step-1
 * Повертає HTML для першого кроку бронювання (дата, час, локація)
 */
bookingRoutes.get('/step-1', async (c) => {
  const db = c.env.DB;
  const { results: locations } = await db.prepare(
    'SELECT id, name, delivery_fee FROM locations WHERE is_active = 1 ORDER BY name'
  ).all();

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const timeOptions = Array.from({length: 13}, (_, i) => i + 7)
    .map(h => `<option value="${String(h).padStart(2,'0')}:00">${String(h).padStart(2,'0')}:00</option>`)
    .join('');

  return c.html(`
    <h3>Step 1: Date & Location</h3>
    <div class="mb-3">
      <label class="form-label">Start Date</label>
      <input type="date" id="inp-date" class="form-control" min="${minDate}" required>
    </div>
    <div class="mb-3">
      <label class="form-label">Start Time</label>
      <select id="inp-time" class="form-select">${timeOptions}</select>
    </div>
    <div class="mb-3">
      <label class="form-label">Duration</label>
      <select id="inp-duration" class="form-select">
        <option value="2h">2 Hours</option>
        <option value="half_day">Half Day (~5h)</option>
        <option value="full_day">Full Day (~10h)</option>
        <option value="multi_day">Multiple Days</option>
      </select>
    </div>
    <div class="mb-3">
      <label class="form-label">Delivery Location</label>
      <select id="inp-location" class="form-select">
        ${locations.map(l => `<option value="${l.id}" data-fee="${l.delivery_fee}">${l.name} (+${l.delivery_fee}€)</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-tuyyo btn-lg w-100" onclick="goStep2()">
      Next: Select Boards <i class="bi bi-arrow-right"></i>
    </button>
  `);
});

// Мапінг duration_type → ключ ціни
const PRICE_KEY_MAP = {
  '2h': 'price_2h',
  'half_day': 'price_half_day',
  'full_day': 'price_full_day',
  'multi_day': 'price_multi_day'
};

// Мапінг duration_type → години
const DURATION_HOURS = {
  '2h': 2,
  'half_day': 5,
  'full_day': 10,
  'multi_day': 24
};

/**
 * POST /api/booking/calculate
 * Розрахунок вартості без створення бронювання
 *
 * Body: { items: [{inventory_id, quantity}], location_id, duration_type }
 * Response: { items, subtotal, delivery_fee, deposit_total, total_amount }
 */
bookingRoutes.post('/calculate', async (c) => {
  const body = await c.req.json();
  const { items, location_id, duration_type } = body;

  // Валідація
  if (!items?.length || !location_id || !duration_type) {
    return c.json({ error: 'Missing required fields: items, location_id, duration_type' }, 400);
  }

  if (!PRICE_KEY_MAP[duration_type]) {
    return c.json({ error: `Invalid duration_type: ${duration_type}` }, 400);
  }

  const location = await getLocationById(c.env.DB, location_id);
  if (!location) {
    return c.json({ error: 'Location not found' }, 404);
  }

  let subtotal = 0;
  let depositTotal = 0;
  const itemDetails = [];

  for (const item of items) {
    const inv = await getInventoryById(c.env.DB, item.inventory_id);
    if (!inv) continue;

    const unitPrice = getPriceForDuration(inv, duration_type);
    const lineTotal = unitPrice * item.quantity;
    const lineDeposit = inv.deposit_amount * item.quantity;

    subtotal += lineTotal;
    depositTotal += lineDeposit;

    itemDetails.push({
      inventory_id: inv.id,
      model_name: inv.model_name,
      quantity: item.quantity,
      unit_price: unitPrice,
      line_total: lineTotal
    });
  }

  const deliveryFee = location.delivery_fee;
  const totalAmount = subtotal + deliveryFee;

  return c.json({
    items: itemDetails,
    subtotal,
    delivery_fee: deliveryFee,
    deposit_total: depositTotal,
    total_amount: totalAmount
  });
});

/**
 * POST /api/booking/create
 * Створення бронювання
 *
 * Body: { customer, items, location_id, duration_type, start_time, end_time, payment_method, legal_agreement }
 * Response: { success, booking_code, redirect_url? } або { success, booking_code, payment_method, message }
 */
bookingRoutes.post('/create', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json();

  const {
    customer, items, location_id, duration_type,
    start_time, end_time, payment_method = 'stripe',
    legal_agreement
  } = body;

  // ─── Валідація ───
  if (!customer?.full_name || !customer?.phone) {
    return c.json({ error: 'Customer name and phone are required' }, 400);
  }

  if (!items?.length) {
    return c.json({ error: 'At least one item is required' }, 400);
  }

  if (!location_id || !duration_type || !start_time || !end_time) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (!legal_agreement) {
    return c.json({ error: 'Legal agreement required' }, 400);
  }

  if (!PRICE_KEY_MAP[duration_type]) {
    return c.json({ error: `Invalid duration_type: ${duration_type}` }, 400);
  }

  // ─── Перевірка правила мінімального часу ───
  const minAdvanceHours = parseInt(
    (await getSetting(db, 'booking_min_hours_advance')) || '24'
  );

  const startTime = new Date(start_time);
  const now = new Date();
  const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);

  if (hoursUntilStart < minAdvanceHours) {
    return c.json({
      error: `Booking must be made at least ${minAdvanceHours} hours in advance`,
      code: 'TOO_SOON'
    }, 400);
  }

  // ─── Транзакція ───
  await db.prepare('BEGIN IMMEDIATE').run();

  try {
    // Перевірка доступності кожної дошки
    for (const item of items) {
      const avail = await checkAvailability(db, item.inventory_id, start_time, end_time);

      if (!avail.exists) {
        await db.prepare('ROLLBACK').run();
        return c.json({ error: `Inventory ${item.inventory_id} not found` }, 404);
      }

      if (avail.available < item.quantity) {
        await db.prepare('ROLLBACK').run();
        return c.json({
          error: `Only ${avail.available} units available`,
          code: 'OVERBOOKING'
        }, 409);
      }
    }

    // Розрахунок вартості (inline щоб не робити HTTP запит самому собі)
    const location = await getLocationById(db, location_id);
    if (!location) {
      await db.prepare('ROLLBACK').run();
      return c.json({ error: 'Location not found' }, 404);
    }

    let subtotal = 0;
    let depositTotal = 0;
    const itemDetails = [];

    for (const item of items) {
      const inv = await getInventoryById(db, item.inventory_id);
      if (!inv) continue;

      const unitPrice = getPriceForDuration(inv, duration_type);
      const lineTotal = unitPrice * item.quantity;
      const lineDeposit = inv.deposit_amount * item.quantity;

      subtotal += lineTotal;
      depositTotal += lineDeposit;

      itemDetails.push({
        inventory_id: inv.id,
        model_name: inv.model_name,
        quantity: item.quantity,
        unit_price: unitPrice,
        line_total: lineTotal
      });
    }

    const deliveryFee = location.delivery_fee;
    const totalAmount = subtotal + deliveryFee;

    // Генерація унікального коду бронювання
    const bookingCode = 'TY-' + Date.now().toString(36).toUpperCase();

    // Створення клієнта
    const customerId = await createCustomer(db, customer);

    // Створення бронювання
    const bookingId = await createBooking(db, {
      booking_code: bookingCode,
      customer_id: customerId,
      location_id,
      start_time,
      end_time,
      duration_type,
      subtotal,
      delivery_fee: deliveryFee,
      deposit_total: depositTotal,
      total_amount: totalAmount,
      payment_method,
      legal_agreement
    });

    // Додавання позицій
    for (const item of items) {
      const inv = await getInventoryById(db, item.inventory_id);
      const priceKey = PRICE_KEY_MAP[duration_type];
      await addBookingItem(db, bookingId, item.inventory_id, item.quantity, inv[priceKey]);
    }

    await db.prepare('COMMIT').run();

    // ─── Обробка оплати ───
    if (payment_method === 'stripe') {
      const stripeKey = c.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return c.json({ error: 'Stripe not configured' }, 500);
      }

      const session = await createCheckoutSession(c.env, {
        bookingCode,
        totalAmount,
        customerEmail: customer.email,
        bookingId
      });

      await setBookingStripeSession(db, bookingId, session.id);

      return c.json({
        success: true,
        booking_code: bookingCode,
        redirect_url: session.url
      });
    }

    // Cash / Bizum — одразу підтверджуємо
    await db.prepare(
      "UPDATE bookings SET payment_status = 'confirmed' WHERE id = ?"
    ).bind(bookingId).run();

    // Надсилання сповіщень (async, не блокуємо відповідь)
    c.executionCtx.waitUntil(sendNotifications(c.env, bookingId));

    return c.json({
      success: true,
      booking_code: bookingCode,
      payment_method,
      message: 'Booking confirmed. Please follow payment instructions.'
    });

  } catch (err) {
    await db.prepare('ROLLBACK').run();
    console.error('Booking error:', err);
    return c.json({ error: err.message || 'Internal error' }, 500);
  }
});
