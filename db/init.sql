-- ============================================================
-- CRM CSKH DATABASE INITIALIZATION
-- Production-ready schema with Users, RBAC, Indices & Audit Logs
-- ============================================================

-- 1. USERS & ROLES
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    company VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Lead')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CONTACTS
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50) DEFAULT 'Email',
    note TEXT,
    contact_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. INTERACTIONS
CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL DEFAULT 'Tư vấn',
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDICES FOR OPTIMIZATION (Checklist 3: Database)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_date ON contacts(contact_date DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions(status);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- ============================================================
-- SEED DATA
-- Default Passwords:
-- admin: Admin@123
-- staff: Staff@123
-- viewer: Viewer@123
-- ============================================================
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin', '$2b$10$VKbc5La5fSdQhqyHaX2.euzsbHdVtyN54dE9NhCr3NPd0kEhjNZ/q', 'Quản trị viên Hệ Thống', 'admin'),
('staff', '$2b$10$6fXeJhFco.hp91wL2vtgWuKrS.PK1RsFOgwm6M/kJXQwAnALK9cSW', 'Nhân Viên CSKH', 'staff'),
('viewer', '$2b$10$Z.dwpy2mmUfK0s5KrK20pO8h8JHKKXYDuLVOKiEHsP3/V9xKlnX/O', 'Chuyên viên Phân Tích (Viewer)', 'viewer')
ON CONFLICT (username) DO NOTHING;

INSERT INTO customers (name, email, phone, company, status) VALUES
('Nguyễn Văn An', 'an.nguyen@example.com', '0912345678', 'FPT Software', 'Active'),
('Trần Thị Bình', 'binh.tran@example.com', '0987654321', 'Viettel Solutions', 'Active'),
('Lê Hoàng Long', 'long.le@example.com', '0905123456', 'VNG Corp', 'Active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO interactions (customer_id, interaction_type, content, status) VALUES
(1, 'Tư vấn', 'Khách hàng quan tâm giải pháp CRM Cloud gói Doanh nghiệp', 'Completed'),
(2, 'Báo giá', 'Đã gửi báo giá 10 user bản quyền phần mềm', 'Pending')
ON CONFLICT DO NOTHING;

INSERT INTO contacts (customer_id, channel, note) VALUES
(1, 'Email', 'Gửi tài liệu giới thiệu giải pháp'),
(2, 'Hotline', 'Gọi điện xác nhận lịch hẹn demo')
ON CONFLICT DO NOTHING;
