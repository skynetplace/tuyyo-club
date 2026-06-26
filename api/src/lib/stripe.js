/**
 * stripe.js — Модуль для інтеграції з Stripe
 *
 * Централізована логіка роботи з Stripe:
 * - Ініціалізація Stripe клієнта
 * - Створення Checkout Session
 * - Валідація підпису вебхука
 * - Обробка подій вебхука
 *
 * Приклад використання:
 *   import { createCheckoutSession, handleStripeWebhook } from './lib/stripe.js';
 *
 *   const session = await createCheckoutSession(env, { bookingCode, totalAmount, ... });
 *   const event = await handleStripeWebhook(env, body, signature);
 */

// Динамічний імпорт Stripe (щоб не було помилок якщо пакет не встановлений)
let _stripeModule = null;

async function getStripeModule() {
  if (!_stripeModule) {
    try {
      _stripeModule = await import('stripe');
    } catch (err) {
      throw new Error('Stripe package not installed. Run: npm install stripe');
    }
  }
  return _stripeModule;
}

/**
 * Отримати екземпляр Stripe клієнта
 * @param {Object} env - Environment з секретами
 * @returns {Promise<Stripe>}
 */
async function getClient(env) {
  const Stripe = await getStripeModule();
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(stripeKey);
}

/**
 * Створити Stripe Checkout Session для оплати бронювання
 *
 * @param {Object} env - Environment (FRONTEND_URL, API_URL, STRIPE_SECRET_KEY)
 * @param {Object} params
 * @param {string} params.bookingCode - Код бронювання
 * @param {number} params.totalAmount - Сума в євро
 * @param {string} [params.customerEmail] - Email клієнта
 * @param {number} params.bookingId - ID бронювання
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function createCheckoutSession(env, { bookingCode, totalAmount, customerEmail, bookingId }) {
  const stripe = await getClient(env);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `SUP Rental — ${bookingCode}`,
          description: 'TUYYO CLUB — SUP Board Rental'
        },
        unit_amount: Math.round(totalAmount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${env.FRONTEND_URL}/success.html?code=${bookingCode}`,
    cancel_url: `${env.FRONTEND_URL}/booking.html?canceled=1`,
    customer_email: customerEmail || undefined,
    metadata: {
      booking_id: bookingId.toString(),
      booking_code: bookingCode
    }
  });

  return { id: session.id, url: session.url };
}

/**
 * Обробити Stripe Webhook
 *
 * Перевіряє підпис, розбирає подію та викликає відповідний обробник.
 *
 * @param {Object} env - Environment (DB, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
 * @param {string} body - Raw body вебхука
 * @param {string} signature - Заголовок stripe-signature
 * @returns {Promise<{ received: boolean, type?: string, error?: string }>}
 */
export async function handleStripeWebhook(env, body, signature) {
  const Stripe = await getStripeModule();

  // Отримуємо секрети
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return { received: false, error: 'Webhook secret not configured' };
  }

  if (!signature) {
    return { received: false, error: 'Missing stripe-signature header' };
  }

  // Ініціалізуємо Stripe для перевірки підпису
  let stripe;
  try {
    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { received: false, error: 'STRIPE_SECRET_KEY not configured' };
    }
    stripe = new Stripe(stripeKey);
  } catch (err) {
    console.error('Stripe init error:', err);
    return { received: false, error: 'Stripe initialization failed' };
  }

  // Перевіряємо підпис
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { received: false, error: `Invalid signature: ${err.message}` };
  }

  // Обробка події
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const bookingId = session.metadata?.booking_id;

        if (bookingId) {
          // Оновлюємо статус оплати
          await env.DB.prepare(
            "UPDATE bookings SET payment_status = 'paid' WHERE id = ?"
          ).bind(parseInt(bookingId)).run();

          // Надсилаємо сповіщення (async)
          const { sendNotifications } = await import('./notify.js');
          if (sendNotifications) {
            env.executionCtx?.waitUntil?.(
              sendNotifications(env, parseInt(bookingId))
            );
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const bookingId = session.metadata?.booking_id;
        if (bookingId) {
          await env.DB.prepare(
            "UPDATE bookings SET payment_status = 'expired' WHERE id = ?"
          ).bind(parseInt(bookingId)).run();
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata?.booking_id;
        if (bookingId) {
          await env.DB.prepare(
            "UPDATE bookings SET payment_status = 'failed' WHERE id = ?"
          ).bind(parseInt(bookingId)).run();
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return { received: true, type: event.type };
  } catch (err) {
    console.error(`Webhook handling error for ${event.type}:`, err);
    return { received: true, type: event.type, error: err.message };
  }
}

/**
 * Отримати деталі сесії (для перевірки статусу)
 * @param {Object} env
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function getCheckoutSession(env, sessionId) {
  const stripe = await getClient(env);
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent']
  });
}
