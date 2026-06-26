#!/bin/bash
set -e

echo "🚀 TUYYO CLUB — Complete Setup Script"
echo "======================================"

# Перевірка env
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN не встановлено!"
  echo "Експортуйте: export CLOUDFLARE_API_TOKEN=your_token_here"
  exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "❌ CLOUDFLARE_ACCOUNT_ID не встановлено!"
  exit 1
fi

# Отримати ZONE_ID
echo "🔍 Отримую ZONE_ID для tuyyo.com..."
ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=tuyyo.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id')
echo "✅ ZONE_ID: $ZONE_ID"

# КРОК 1: R2
echo ""
echo "📦 КРОК 1: Створення R2 Bucket..."
cd api
wrangler r2 bucket create tuyyo-media || echo "⚠️ Bucket вже існує"
cd ..

# КРОК 2: Pages Project
echo ""
echo "🌐 КРОК 2: Створення Pages Project..."
cd api
wrangler pages project create tuyyo-club --production-branch main || echo "⚠️ Project вже існує"
cd ..

# КРОК 3: Deploy Frontend
echo ""
echo "📤 КРОК 3: Deploy Frontend..."
cd web
wrangler pages deploy public --project-name=tuyyo-club --branch=main
cd ..

# КРОК 4: Секрети (placeholders)
echo ""
echo "🔐 КРОК 4: Встановлення секретів (placeholders)..."
cd api
echo "PLACEHOLDER_STRIPE_SECRET" | wrangler secret put STRIPE_SECRET_KEY
echo "PLACEHOLDER_WEBHOOK_SECRET" | wrangler secret put STRIPE_WEBHOOK_SECRET
echo "PLACEHOLDER_RESEND_KEY" | wrangler secret put RESEND_API_KEY
echo "PLACEHOLDER_TELEGRAM_TOKEN" | wrangler secret put TELEGRAM_BOT_TOKEN
echo "✅ Секрети встановлено (замініть пізніше через Dashboard)"
cd ..

# КРОК 5: DNS Records
echo ""
echo "🌍 КРОК 5: Налаштування DNS..."

create_dns() {
  local name=$1
  local content=$2
  local proxied=$3

  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$content\",\"proxied\":$proxied}" | jq -r '.success'
}

create_dns "tuyyo.com" "tuyyo-club.pages.dev" "true"
create_dns "api.tuyyo.com" "tuyyo-api.sashka-desire.workers.dev" "true"
create_dns "media.tuyyo.com" "tuyyo-media.r2.cloudflarestorage.com" "false"

# КРОК 6: Custom Domains
echo ""
echo "🔗 КРОК 6: Custom Domains..."
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/tuyyo-club/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"tuyyo.com"}' | jq '.'

# КРОК 7: Zero Trust
echo ""
echo "🛡️ КРОК 7: Cloudflare Zero Trust..."
APP_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/applications" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "TUYYO Admin Panel",
    "domain": "tuyyo.com/admin/*",
    "type": "self_hosted",
    "session_duration": "24h"
  }')
APP_ID=$(echo $APP_RESPONSE | jq -r '.result.id')
echo "✅ Access Application ID: $APP_ID"

curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/applications/$APP_ID/policies" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Allow Owner",
    "precedence": 1,
    "decision": "allow",
    "includes": [{"emails": ["owner@tuyyo.com"]}]
  }' | jq '.'

# КРОК 8: Фінальна перевірка
echo ""
echo "🔍 КРОК 8: Фінальна перевірка..."
sleep 10  # Чекаємо поки DNS розповсюдиться

echo ""
echo "======================================"
echo "✅ SETUP COMPLETE!"
echo "======================================"
echo ""
echo "📍 URLs:"
echo "  Frontend: https://tuyyo.com"
echo "  API:      https://api.tuyyo.com/api/locations"
echo "  Admin:    https://tuyyo.com/admin/"
echo "  Media:    https://media.tuyyo.com"
echo ""
echo "⚠️  Наступні кроки ВРУЧНУ:"
echo "  1. Замінити placeholder секрети в Cloudflare Dashboard → Workers → tuyyo-api → Settings → Variables"
echo "  2. Додати Webhook URL в Stripe Dashboard: https://api.tuyyo.com/api/webhooks/stripe"
echo "  3. Замінити owner@tuyyo.com на реальний email в Zero Trust Policy"
echo ""
