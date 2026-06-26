# 📡 TUYYO CLUB API Documentation

Premium SUP Rental Platform API built on Cloudflare Workers + D1.

## 🌍 Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.tuyyo.com` |
| Local Dev | `http://localhost:8787` |

## 🔐 Authentication

### Public Endpoints
No authentication required.

### Admin Endpoints
Protected via Bearer token (set via `wrangler secret put ADMIN_API_KEY`):

```
Authorization: Bearer <ADMIN_API_KEY>
```

In production, admin routes are also protected by Cloudflare Zero Trust.

### Webhooks
Stripe webhooks are verified via signature (no auth header needed).

---

## 📍 Public API

### GET /api/locations
Get all active delivery locations.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Benidorm",
    "slug": "benidorm",
    "lat": 38.5368,
    "lng": -0.1278,
    "delivery_fee": 20.0
  }
]
```

### GET /api/inventory
Get all active SUP boards.

**Response:**
```json
[
  {
    "id": 1,
    "model_name": "WATTSUP Convertible 10'6",
    "slug": "wattsup-convertible-106",
    "description": null,
    "max_weight_kg": 130,
    "price_2h": 35.0,
    "price_half_day": 40.0,
    "price_full_day": 50.0,
    "price_multi_day": 40.0,
    "deposit_amount": 150.0,
    "image_url": null
  }
]
```

### GET /api/availability
Check board availability for a date.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| date | string | ✅ | Date (YYYY-MM-DD) |
| inventory_id | number | ✅ | Board ID |
| duration_type | string | No | `2h`, `half_day`, `full_day`, `multi_day` (default: `2h`) |

**Response:**
```json
{
  "inventory_id": 1,
  "date": "2024-07-15",
  "total_units": 5,
  "booked": 2,
  "available": 3
}
```

### GET /api/reviews
Get visible reviews.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | number | 50 | Max reviews to return |

### GET /api/documents/:type/:lang
Get document by type and language.

**Parameters:**
| Param | Description |
|-------|-------------|
| type | `rules`, `liability` |
| lang | `en`, `es` |

### GET /api/translations/:lang
Get all translations for a language.

---

## 📝 Booking API

### POST /api/booking/calculate
Calculate booking cost without creating a booking.

**Request Body:**
```json
{
  "items": [
    { "inventory_id": 1, "quantity": 2 }
  ],
  "location_id": 1,
  "duration_type": "2h"
}
```

**Response:**
```json
{
  "items": [
    {
      "inventory_id": 1,
      "model_name": "WATTSUP Convertible 10'6",
      "quantity": 2,
      "unit_price": 35.0,
      "line_total": 70.0
    }
  ],
  "subtotal": 70.0,
  "delivery_fee": 20.0,
  "deposit_total": 300.0,
  "total_amount": 90.0
}
```

### POST /api/booking/create
Create a new booking.

**Request Body:**
```json
{
  "customer": {
    "full_name": "John Doe",
    "phone": "+34600000001",
    "email": "john@example.com",
    "id_document": "X12345678"
  },
  "items": [
    { "inventory_id": 1, "quantity": 1 }
  ],
  "location_id": 1,
  "duration_type": "2h",
  "start_time": "2024-07-15T10:00:00",
  "end_time": "2024-07-15T12:00:00",
  "payment_method": "stripe",
  "legal_agreement": true
}
```

**Response (Stripe):**
```json
{
  "success": true,
  "booking_code": "TY-M1K2N3",
  "redirect_url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Response (Cash/Bizum):**
```json
{
  "success": true,
  "booking_code": "TY-M1K2N3",
  "payment_method": "cash",
  "message": "Booking confirmed. Please follow payment instructions."
}
```

**Error Codes:**
| Code | HTTP | Description |
|------|------|-------------|
| `TOO_SOON` | 400 | Booking must be made at least 24h in advance |
| `OVERBOOKING` | 409 | Not enough units available |

---

## 💳 Webhooks

### POST /api/webhooks/stripe
Stripe webhook endpoint.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| stripe-signature | ✅ | Stripe webhook signature |

**Supported Events:**
| Event | Action |
|-------|--------|
| `checkout.session.completed` | Mark booking as paid, send notifications |
| `checkout.session.expired` | Mark booking as expired |
| `payment_intent.payment_failed` | Mark booking as failed |

---

## 🛠️ Admin API

All admin endpoints require `Authorization: Bearer <ADMIN_API_KEY>`.

### GET /admin/api/dashboard
Get dashboard statistics.

**Response:**
```json
{
  "total_bookings": 42,
  "paid_bookings": 35,
  "revenue": 1750.0,
  "pending_bookings": 7
}
```

### GET /admin/api/secrets/status
Check which secrets are configured.

**Response:**
```json
{
  "secrets": {
    "stripe_secret_key": { "configured": true, "length": 32 },
    "stripe_webhook_secret": { "configured": true, "length": 24 }
  },
  "allConfigured": false,
  "timestamp": "2024-07-01T12:00:00.000Z"
}
```

### GET /admin/api/inventory
List all inventory items.

### POST /admin/api/inventory
Create inventory item.

### PUT /admin/api/inventory/:id
Update inventory item.

### GET /admin/api/locations
List all locations.

### POST /admin/api/locations
Create location.

### GET /admin/api/settings
Get all settings (secrets masked).

### POST /admin/api/settings
Update settings.

### GET /admin/api/documents
List all documents.

### POST /admin/api/documents
Create/update document.

### GET /admin/api/translations
List all translations.

### POST /admin/api/translations
Create/update translation.

### POST /admin/api/upload
Upload file to R2.

**Request:** `multipart/form-data` with `file` field

**Constraints:**
- Max size: 10MB
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`

### GET /admin/api/bookings
List bookings.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | number | 100 | Max results (max 500) |

---

## ⚙️ Environment Variables

Set via `wrangler secret put <NAME>`:

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook secret (whsec_...) |
| `RESEND_API_KEY` | No | Resend email API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `ADMIN_API_KEY` | Recommended | Admin API access key |

## 🚀 Quick Start

```bash
# Install dependencies
cd api && npm install

# Set secrets
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET

# Run locally
npm run dev

# Deploy
npm run deploy
```

## 📊 Rate Limits

- Public API: 100 requests/minute per IP
- Admin API: 60 requests/minute per API key
- Webhooks: 100 requests/minute from Stripe IPs

## 🔗 Frontend Integration

```javascript
const API = 'https://api.tuyyo.com/api';

// Get locations
const locations = await fetch(`${API}/locations`).then(r => r.json());

// Check availability
const avail = await fetch(
  `${API}/availability?date=2024-07-15&inventory_id=1&duration_type=2h`
).then(r => r.json());
```
