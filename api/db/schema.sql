-- TUYYO CLUB Database Schema v1.0

-- Локації (зони доставки)
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    delivery_fee REAL DEFAULT 20.0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Інвентар (SUP-борди та інше оснащення)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    max_weight_kg INTEGER,
    price_2h REAL NOT NULL DEFAULT 35.0,
    price_half_day REAL NOT NULL DEFAULT 40.0,
    price_full_day REAL NOT NULL DEFAULT 50.0,
    price_multi_day REAL NOT NULL DEFAULT 40.0,
    deposit_amount REAL DEFAULT 150.0,
    total_units INTEGER DEFAULT 5,
    image_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Клієнти
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    id_document TEXT,
    whatsapp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Бронювання
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_code TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_type TEXT NOT NULL,
    subtotal REAL NOT NULL,
    delivery_fee REAL DEFAULT 0.0,
    deposit_total REAL NOT NULL,
    total_amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'stripe',
    payment_status TEXT DEFAULT 'unpaid',
    stripe_session_id TEXT UNIQUE,
    legal_agreement BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Позиції бронювання
CREATE TABLE IF NOT EXISTS booking_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    inventory_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_booking REAL NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

-- Відгуки
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER UNIQUE,
    customer_name TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    photo_url TEXT,
    is_visible BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Налаштування (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret BOOLEAN DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Переклади
CREATE TABLE IF NOT EXISTS translations (
    lang_code TEXT NOT NULL,
    translation_key TEXT NOT NULL,
    translation_value TEXT NOT NULL,
    PRIMARY KEY (lang_code, translation_key)
);

-- Документи
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_type TEXT NOT NULL,
    lang_code TEXT NOT NULL,
    title TEXT NOT NULL,
    content_html TEXT,
    pdf_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doc_type, lang_code)
);

-- ІНДЕКСИ
CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time, end_time, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_inv ON booking_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_active ON inventory(is_active);

-- ПОЧАТКОВІ ДАНІ

-- Локації
INSERT OR IGNORE INTO locations (name, slug, lat, lng, delivery_fee) VALUES
('Benidorm', 'benidorm', 38.5368, -0.1278, 20.0),
('Altea', 'altea', 38.5990, -0.0500, 25.0),
('Villajoyosa', 'villajoyosa', 38.5072, -0.2333, 20.0),
('Calpe', 'calpe', 38.6453, 0.0439, 30.0),
('Alicante', 'alicante', 38.3452, -0.4810, 35.0);

-- Інвентар (початкові дошки)
INSERT OR IGNORE INTO inventory (model_name, slug, max_weight_kg, price_2h, price_half_day, price_full_day, total_units) VALUES
('WATTSUP Convertible 10''6', 'wattsup-convertible-106', 130, 35, 40, 50, 5),
('WATTSUP 10''2 Manta', 'wattsup-102-manta', 100, 35, 40, 50, 3),
('WATTSUP Silver 11''6', 'wattsup-silver-116', 150, 40, 45, 55, 4);

-- Налаштування (дефолтні)
INSERT OR IGNORE INTO settings (key, value, is_secret) VALUES
('site_name', 'TUYYO CLUB', 0),
('site_phone', '+34600000000', 0),
('site_email', 'tuyyogroup@gmail.com', 0),
('booking_min_hours_advance', '24', 0),
('delivery_base_fee', '20', 0),
('payment_stripe_enabled', '1', 0),
('payment_bizum_enabled', '0', 0),
('payment_cash_enabled', '1', 0),
('notify_telegram_enabled', '0', 0),
('notify_email_enabled', '1', 0),
('notify_whatsapp_enabled', '0', 0),
('stripe_publishable_key', '', 1),
('stripe_secret_key', '', 1),
('stripe_webhook_secret', '', 1),
('telegram_bot_token', '', 1),
('telegram_chat_id', '', 1),
('resend_api_key', '', 1),
('bizum_phone', '', 0);

-- Документи
INSERT OR IGNORE INTO documents (doc_type, lang_code, title, content_html) VALUES
('rules', 'en', 'Safety Rules', '<h2>Safety Rules</h2><ul><li>Always wear the leash</li><li>Use the life jacket</li><li>Do not go beyond 200m from shore</li></ul>'),
('rules', 'es', 'Reglas de Seguridad', '<h2>Reglas de Seguridad</h2><ul><li>Siempre use el leash</li><li>Use el chaleco salvavidas</li><li>No se aleje más de 200m de la orilla</li></ul>'),
('liability', 'en', 'Liability Waiver', '<h2>Liability Waiver</h2><p>By signing this document, you accept full responsibility...</p>'),
('liability', 'es', 'Renuncia de Responsabilidad', '<h2>Renuncia de Responsabilidad</h2><p>Al firmar este documento, acepta la plena responsabilidad...</p>');

-- Переклади (приклад)
INSERT OR IGNORE INTO translations (lang_code, translation_key, translation_value) VALUES
('en', 'hero_title', 'Sea. Sun. Freedom.'),
('en', 'hero_subtitle', 'Explore Costa Blanca from the Water'),
('en', 'btn_book_now', 'Book SUP'),
('es', 'hero_title', 'Mar. Sol. Libertad.'),
('es', 'hero_subtitle', 'Explora el litoral de la Costa Blanca desde el agua'),
('es', 'btn_book_now', 'Reservar Tabla de SUP');
