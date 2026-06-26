/**
 * notify.js — Модуль для сповіщень
 *
 * Централізована логіка надсилання сповіщень:
 * - Telegram повідомлення
 * - Email через Resend API
 * - (майбутні) WhatsApp через WhatsApp Business API
 *
 * Використовує налаштування з таблиці settings для конфігурації.
 *
 * Приклад використання:
 *   import { sendNotifications, sendBookingConfirmation } from './lib/notify.js';
 *
 *   await sendNotifications(env, bookingId);
 *   await sendBookingConfirmation(env, bookingId);
 */

/**
 * Отримати налаштування сповіщень з БД
 * @param {D1Database} db
 * @returns {Promise<Object>}
 */
async function getNotificationSettings(db) {
  const keys = [
    'notify_telegram_enabled',
    'notify_email_enabled',
    'notify_whatsapp_enabled',
    'telegram_bot_token',
    'telegram_chat_id',
    'resend_api_key',
    'site_email',
    'site_name',
    'site_phone'
  ];

  const settings = {};
  for (const key of keys) {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    settings[key] = row?.value || '';
  }
  return settings;
}

/**
 * Надіслати Telegram повідомлення
 * @param {string} token - Bot token
 * @param {string} chatId - Chat ID
 * @param {string} text - Текст повідомлення
 * @returns {Promise<boolean>}
 */
async function sendTelegram(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Telegram send error:', err);
    return false;
  }
}

/**
 * Надіслати Email через Resend API
 * @param {string} apiKey - Resend API key
 * @param {Object} params
 * @param {string} params.from - Відправник
 * @param {string} params.to - Одержувач
 * @param {string} params.subject - Тема
 * @param {string} params.html - HTML тіло листа
 * @returns {Promise<boolean>}
 */
async function sendEmail(apiKey, { from, to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend API error:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
}

/**
 * Форматувати повідомлення про бронювання для Telegram
 * @param {Object} booking - Дані бронювання
 * @returns {string}
 */
function formatBookingTelegramMessage(booking) {
  return `🏄 <b>NEW BOOKING</b>
━━━━━━━━━━━━━━━━━━━━━
📋 Code: <b>${booking.booking_code}</b>
👤 Client: ${booking.full_name}
📞 Phone: ${booking.phone}
📧 Email: ${booking.email || '—'}
📍 Location: ${booking.location_name}
📅 Start: ${booking.start_time}
💰 Total: €${booking.total_amount}
💳 Payment: ${booking.payment_status}`;
}

/**
 * Форматувати email підтвердження бронювання
 * @param {Object} booking - Дані бронювання
 * @param {string} siteEmail - Email сайту
 * @param {string} siteName - Назва сайту
 * @returns {Object} { subject, html }
 */
function formatBookingEmail(booking, siteEmail, siteName) {
  const subject = `Booking confirmed — ${booking.booking_code}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #40E0D0; padding: 20px; text-align: center;">
        <h1 style="color: #003366; margin: 0;">🏄 ${siteName}</h1>
      </div>
      <div style="padding: 30px; background: #fff;">
        <h2 style="color: #003366;">Thank you, ${booking.full_name}!</h2>
        <p>Your booking has been confirmed. Here are the details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Booking Code</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${booking.booking_code}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Location</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.location_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Start</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.start_time}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Total</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">€${booking.total_amount}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 14px;">
          If you have any questions, reply to this email or contact us at ${siteEmail}.
        </p>
      </div>
      <div style="background: #f5f5f5; padding: 15px; text-align: center; color: #999; font-size: 12px;">
        © ${new Date().getFullYear()} ${siteName} · Costa Blanca
      </div>
    </div>
  `;
  return { subject, html };
}

/**
 * Надіслати сповіщення про нове бронювання
 *
 * Надсилає повідомлення на всі налаштовані канали (Telegram, Email).
 * Помилки в одному каналі не впливають на інші.
 *
 * @param {Object} env - Environment (DB binding)
 * @param {number} bookingId - ID бронювання
 * @returns {Promise<void>}
 */
export async function sendNotifications(env, bookingId) {
  try {
    // Отримуємо дані бронювання
    const booking = await env.DB.prepare(`
      SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN locations l ON b.location_id = l.id
      WHERE b.id = ?
    `).bind(bookingId).first();

    if (!booking) {
      console.error(`Booking ${bookingId} not found for notifications`);
      return;
    }

    // Отримуємо налаштування
    const settings = await getNotificationSettings(env.DB);

    // Надсилання паралельно (незалежно)
    const promises = [];

    // Telegram
    if (settings.notify_telegram_enabled === '1' && settings.telegram_bot_token && settings.telegram_chat_id) {
      const text = formatBookingTelegramMessage(booking);
      promises.push(
        sendTelegram(settings.telegram_bot_token, settings.telegram_chat_id, text)
          .then(ok => console.log(`Telegram notification ${ok ? 'sent' : 'failed'} for booking ${bookingId}`))
      );
    }

    // Email
    if (settings.notify_email_enabled === '1' && booking.email && settings.resend_api_key) {
      const { subject, html } = formatBookingEmail(
        booking,
        settings.site_email || 'noreply@tuyyo.com',
        settings.site_name || 'TUYYO CLUB'
      );
      promises.push(
        sendEmail(settings.resend_api_key, {
          from: `${settings.site_name || 'TUYYO CLUB'} <${settings.site_email}>`,
          to: booking.email,
          subject,
          html
        }).then(ok => console.log(`Email notification ${ok ? 'sent' : 'failed'} for booking ${bookingId}`))
      );
    }

    // Очікуємо завершення всіх відправок
    await Promise.allSettled(promises);
  } catch (err) {
    // Помилки сповіщень не повинні ломати основний потік
    console.error('Notification error:', err);
  }
}

/**
 * Надіслати підтвердження оплати
 * @param {Object} env
 * @param {number} bookingId
 * @returns {Promise<void>}
 */
export async function sendPaymentConfirmation(env, bookingId) {
  try {
    const booking = await env.DB.prepare(`
      SELECT b.*, c.full_name, c.phone, c.email, l.name as location_name
      FROM bookings b
      JOIN customers c ON b.customer_id = c.id
      JOIN locations l ON b.location_id = l.id
      WHERE b.id = ?
    `).bind(bookingId).first();

    if (!booking || !booking.email) return;

    const settings = await getNotificationSettings(env.DB);
    if (settings.notify_email_enabled !== '1' || !settings.resend_api_key) return;

    const subject = `Payment confirmed — ${booking.booking_code}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4CAF50; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">✓ Payment Confirmed</h1>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #003366;">Thank you, ${booking.full_name}!</h2>
          <p>Your payment of <strong>€${booking.total_amount}</strong> has been received.</p>
          <p>Booking <strong>${booking.booking_code}</strong> is fully confirmed.</p>
          <p>We'll see you at ${booking.location_name} on ${booking.start_time}!</p>
        </div>
      </div>
    `;

    await sendEmail(settings.resend_api_key, {
      from: `${settings.site_name || 'TUYYO CLUB'} <${settings.site_email}>`,
      to: booking.email,
      subject,
      html
    });
  } catch (err) {
    console.error('Payment confirmation error:', err);
  }
}
