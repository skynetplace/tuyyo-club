/**
 * webhooks.js — Маршрути для вебхуків
 *
 * Обробляє вебхуки від Stripe:
 * - Валідація підпису через stripe.js модуль
 * - Обробка подій: checkout.session.completed, expired, payment_failed
 * - Оновлення статусу оплати в БД
 * - Надсилання сповіщень після успішної оплати
 */

import { Hono } from 'hono';
import { handleStripeWebhook } from '../lib/stripe.js';

export const webhookRoutes = new Hono();

/**
 * POST /api/webhooks/stripe
 *
 * Обробник Stripe вебхуків.
 * Присилає raw body для перевірки підпису.
 *
 * Відповіді:
 * - 200 { received: true } — вебхук оброблено
 * - 400 { error: string } — помилка валідації
 */
webhookRoutes.post('/stripe', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');

  // Перевірка наявності підпису
  if (!signature) {
    console.warn('Webhook received without signature');
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  // Обробка вебхука через stripe.js модуль
  const result = await handleStripeWebhook(
    { DB: c.env.DB, STRIPE_SECRET_KEY: c.env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: c.env.STRIPE_WEBHOOK_SECRET, executionCtx: c.executionCtx },
    body,
    signature
  );

  if (!result.received) {
    return c.json({ error: result.error || 'Webhook processing failed' }, 400);
  }

  // Логуємо якщо була помилка обробки (але підпис валідний)
  if (result.error) {
    console.error(`Webhook handling error for ${result.type}:`, result.error);
  }

  return c.json({ received: true, type: result.type });
});
