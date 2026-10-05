CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    company VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50) DEFAULT 'Email',
    note TEXT,
    contact_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50),
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO customers (name, email, phone, company) VALUES
('Nguyễn Văn An', 'an.nguyen@example.com', '0912345678', 'FPT Software'),
('Trần Thị Bình', 'binh.tran@example.com', '0987654321', 'Viettel Solutions'),
('Lê Hoàng Long', 'long.le@example.com', '0905123456', 'VNG Corp');

INSERT INTO interactions (customer_id, interaction_type, content, status) VALUES
(1, 'Tư vấn', 'Khách hàng quan tâm giải pháp CRM Cloud gói Doanh nghiệp', 'Completed'),
(2, 'Báo giá', 'Đã gửi báo giá 10 user bản quyền phần mềm', 'Pending');
