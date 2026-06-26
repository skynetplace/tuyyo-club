/**
 * Cloudflare Pages Function — Проксі для Admin API
 *
 * Перенаправляє запити з /admin/api/* на Worker
 */

export async function onRequest({ request, env, params }) {
  // Базовий URL для API Worker
  const apiBase = 'https://tuyyo-api.sashka-desire.workers.dev';

  // Формуємо новий URL
  const url = new URL(request.url);
  const path = params.path || '';
  const apiUrl = `${apiBase}/admin/api/${path}`;

  // Копіюємо заголовки
  const headers = new Headers(request.headers);
  headers.set('Host', 'tuyyo-api.sashka-desire.workers.dev');

  // Виконуємо запит до Worker
  const response = await fetch(apiUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  });

  return response;
}
