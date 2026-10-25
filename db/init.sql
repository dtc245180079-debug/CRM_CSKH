-- ============================================================
-- CRM CSKH DATABASE INITIALIZATION
-- ============================================================

-- 1. BANG USERS: Luu tai khoan nguoi dung
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. BANG CUSTOMERS: Luu thong tin khach hang
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    company VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 3. BANG CONTACTS: Luu lich su lien he
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50) DEFAULT 'Email',
    note TEXT,
    contact_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. BANG INTERACTIONS: Luu noi dung tuong tac
CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) DEFAULT 'Tư vấn',
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. BANG AUDIT_LOGS: Luu lich su hoat dong
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDICES FOR OPTIMIZATION
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);

-- 6. THEM TAI KHOAN MAU
INSERT INTO users (id, username, password_hash, full_name, role)
VALUES
(1, 'admin', 'admin123', 'Quan tri vien', 'admin'),
(2, 'staff', 'staff123', 'Nhan vien CSKH', 'staff'),
(3, 'viewer', 'viewer123', 'Chuyen vien phan tich', 'viewer')
ON CONFLICT (id) DO UPDATE 
SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, role = EXCLUDED.role;

-- 7. THEM KHACH HANG MAU
INSERT INTO customers (id, name, email, phone, company, status)
VALUES
(1, 'Nguyen Van An', 'an@example.com', '0912345678', 'FPT Software', 'Active'),
(2, 'Tran Thi Binh', 'binh@example.com', '0987654321', 'Viettel Solutions', 'Active'),
(3, 'Le Hoang Long', 'long@example.com', '0905123456', 'VNG Corp', 'Active')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, company = EXCLUDED.company, status = EXCLUDED.status;

-- 8. THEM LICH SU TUONG TAC
INSERT INTO interactions (id, customer_id, interaction_type, content, status)
VALUES
(1, 1, 'Tu van', 'Khach hang can tu van san pham', 'Completed'),
(2, 2, 'Bao gia', 'Khach hang yeu cau bao gia', 'Pending')
ON CONFLICT (id) DO UPDATE
SET interaction_type = EXCLUDED.interaction_type, content = EXCLUDED.content, status = EXCLUDED.status;

-- 9. THEM LICH SU LIEN HE
INSERT INTO contacts (id, customer_id, channel, note)
VALUES
(1, 1, 'Email', 'Gui tai lieu cho khach hang'),
(2, 2, 'Hotline', 'Goi dien cho khach hang')
ON CONFLICT (id) DO UPDATE
SET channel = EXCLUDED.channel, note = EXCLUDED.note;

-- Dong bo Sequence ID sau khi nap mau
SELECT setval(pg_get_serial_sequence('users', 'id'), coalesce(max(id), 1)) FROM users;
SELECT setval(pg_get_serial_sequence('customers', 'id'), coalesce(max(id), 1)) FROM customers;
SELECT setval(pg_get_serial_sequence('contacts', 'id'), coalesce(max(id), 1)) FROM contacts;
SELECT setval(pg_get_serial_sequence('interactions', 'id'), coalesce(max(id), 1)) FROM interactions;
SELECT setval(pg_get_serial_sequence('audit_logs', 'id'), coalesce(max(id), 1)) FROM audit_logs;
