const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
// Enable Trust Proxy for Nginx Reverse Proxy (Forwarded headers)
app.set('trust proxy', 1);

const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'careflow-crm-super-secret-jwt-key-2026';

// ---------------------- SECURITY HEADERS & MIDDLEWARE ----------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// In-Memory Rate Limiter (500 requests / 15 minutes)
const ipRequestCounts = new Map();
setInterval(() => ipRequestCounts.clear(), 15 * 60 * 1000);

app.use('/api/', (req, res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const count = (ipRequestCounts.get(clientIp) || 0) + 1;
  ipRequestCounts.set(clientIp, count);
  if (count > 500) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu từ IP của bạn. Vui lòng thử lại sau.' });
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------- PROMETHEUS METRICS ----------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'crm_http_requests_total',
  help: 'Tong so request HTTP den he thong CRM',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'crm_http_request_duration_seconds',
  help: 'Thoi gian phan hoi cac request HTTP (giay)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);

app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode).inc();
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(durationInSeconds);
  });
  next();
});

// ---------------------- DATABASE POOL CONFIGURATION ----------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  user: process.env.DB_USER || 'crm_user',
  password: process.env.DB_PASSWORD || 'CrmSecurePassword2026!',
  database: process.env.DB_NAME || 'crm_db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: 20, // Max concurrent connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error] Lỗi kết nối client nhàn rỗi:', err.message);
});

// ---------------------- AUDIT LOG HELPER ----------------------
async function recordAuditLog(userId, username, action, entityType, entityId, details, ip) {
  try {
    const logDetails = `${details || ''}${entityType ? ` [${entityType} #${entityId || ''}]` : ''}${ip ? ` (IP: ${ip})` : ''}`;
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)`,
      [userId || null, action, logDetails]
    );
  } catch (err) {
    console.error('[Audit Log Error]', err.message);
  }
}

// ---------------------- AUTHENTICATION & RBAC MIDDLEWARE ----------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Also support token from query parameter (for direct file downloads like CSV export)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    // If no token, fallback to guest viewer
    req.user = { id: null, username: 'guest', role: 'viewer', full_name: 'Khách tham quan' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Phiên làm việc đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' });
    }
    req.user = user;
    next();
  });
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Quyền truy cập bị từ chối. Thao tác này yêu cầu quyền: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

// ---------------------- VALIDATION HELPERS ----------------------
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCustomerInput(data) {
  const errors = [];
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    errors.push('Tên khách hàng phải có ít nhất 2 ký tự');
  }
  if (!data.email || !emailRegex.test(data.email.trim())) {
    errors.push('Địa chỉ Email không hợp lệ');
  }
  if (data.phone && !/^[0-9+() -]{8,20}$/.test(data.phone.trim())) {
    errors.push('Số điện thoại không hợp lệ (từ 8-20 ký tự số)');
  }
  return errors;
}

// ---------------------- PROMETHEUS & HEALTH CHECK ----------------------
app.get('/metrics', async (req, res) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Real DB Health Check (Checklist 2: Health Check kiểm tra PostgreSQL thực tế)
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  try {
    const dbRes = await pool.query('SELECT NOW() as current_time');
    const latency = Date.now() - startTime;

    res.status(200).json({
      status: 'UP',
      service: 'CareFlow CRM Backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'CONNECTED',
        latencyMs: latency,
        serverTime: dbRes.rows[0].current_time
      }
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      service: 'CareFlow CRM Backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'DISCONNECTED',
        error: err.message
      }
    });
  }
});

// ---------------------- AUTHENTICATION API ----------------------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Tên đăng nhập và mật khẩu là bắt buộc' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const user = result.rows[0];
    let isPasswordValid = false;
    if (user.password_hash && user.password_hash.startsWith('$2')) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      isPasswordValid = (password === user.password_hash) || 
                        (password.toLowerCase() === (user.password_hash || '').toLowerCase());
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Tài khoản hoặc mật khẩu không chính xác' });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    await recordAuditLog(
      user.id,
      user.username,
      'LOGIN',
      'USER',
      user.id,
      `Đăng nhập thành công với vai trò ${user.role}`,
      req.ip
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: tokenPayload
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng nhập' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ---------------------- KPI STATS ----------------------
app.get('/api/stats', async (req, res) => {
  try {
    const custCount = await pool.query('SELECT COUNT(*) FROM customers');
    const interCount = await pool.query('SELECT COUNT(*) FROM interactions');
    const pendingInterCount = await pool.query("SELECT COUNT(*) FROM interactions WHERE status = 'Pending'");
    const contactCount = await pool.query('SELECT COUNT(*) FROM contacts');

    res.json({
      totalCustomers: parseInt(custCount.rows[0].count, 10),
      totalInteractions: parseInt(interCount.rows[0].count, 10),
      pendingInteractions: parseInt(pendingInterCount.rows[0].count, 10),
      totalContacts: parseInt(contactCount.rows[0].count, 10),
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Lỗi truy vấn cơ sở dữ liệu' });
  }
});

// ---------------------- CUSTOMERS API ----------------------
// Supports search + pagination (page, limit) or full array if page not requested
app.get('/api/customers', async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    let baseQuery = 'FROM customers';
    let conditions = [];
    let params = [];

    if (search && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length} OR company ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      baseQuery += ' WHERE ' + conditions.join(' AND ');
    }

    if (page) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const offset = (pageNum - 1) * limitNum;

      const countResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await pool.query(
        `SELECT * ${baseQuery} ORDER BY id DESC LIMIT ${limitNum} OFFSET ${offset}`,
        params
      );

      return res.json({
        data: dataResult.rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    // Default full list
    const result = await pool.query(`SELECT * ${baseQuery} ORDER BY id DESC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Get Customers Error]', err);
    res.status(500).json({ error: 'Lỗi truy vấn danh sách khách hàng' });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const custId = parseInt(id, 10);
    if (isNaN(custId)) return res.status(400).json({ error: 'ID khách hàng không hợp lệ' });

    const custRes = await pool.query('SELECT * FROM customers WHERE id = $1', [custId]);
    if (custRes.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    const interRes = await pool.query(
      'SELECT * FROM interactions WHERE customer_id = $1 ORDER BY created_at DESC',
      [custId]
    );
    const contactRes = await pool.query(
      'SELECT * FROM contacts WHERE customer_id = $1 ORDER BY contact_date DESC',
      [custId]
    );

    res.json({
      customer: custRes.rows[0],
      interactions: interRes.rows,
      contacts: contactRes.rows,
    });
  } catch (err) {
    console.error('[Get Customer Detail Error]', err);
    res.status(500).json({ error: 'Lỗi truy vấn thông tin chi tiết khách hàng' });
  }
});

app.post('/api/customers', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const { name, email, phone, company, status } = req.body;
  const validationErrors = validateCustomerInput({ name, email, phone });
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join(', ') });
  }

  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, company, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null, company ? company.trim() : null, status || 'Active']
    );

    const newCustomer = result.rows[0];
    await recordAuditLog(
      req.user.id,
      req.user.username,
      'CREATE_CUSTOMER',
      'CUSTOMER',
      newCustomer.id,
      `Tạo khách hàng: ${newCustomer.name} (${newCustomer.email})`,
      req.ip
    );

    res.status(201).json(newCustomer);
  } catch (err) {
    console.error('[Create Customer Error]', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi tạo khách hàng' });
  }
});

app.put('/api/customers/:id', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const custId = parseInt(req.params.id, 10);
  if (isNaN(custId)) return res.status(400).json({ error: 'ID khách hàng không hợp lệ' });

  const { name, email, phone, company, status } = req.body;
  const validationErrors = validateCustomerInput({ name, email, phone });
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join(', ') });
  }

  try {
    const result = await pool.query(
      `UPDATE customers 
       SET name = $1, email = $2, phone = $3, company = $4, status = COALESCE($5, status), updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6 RETURNING *`,
      [name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null, company ? company.trim() : null, status, custId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    const updatedCustomer = result.rows[0];
    await recordAuditLog(
      req.user.id,
      req.user.username,
      'UPDATE_CUSTOMER',
      'CUSTOMER',
      updatedCustomer.id,
      `Cập nhật thông tin khách hàng #${updatedCustomer.id}: ${updatedCustomer.name}`,
      req.ip
    );

    res.json(updatedCustomer);
  } catch (err) {
    console.error('[Update Customer Error]', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi cập nhật thông tin khách hàng' });
  }
});

app.delete('/api/customers/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const custId = parseInt(req.params.id, 10);
  if (isNaN(custId)) return res.status(400).json({ error: 'ID khách hàng không hợp lệ' });

  try {
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [custId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'DELETE_CUSTOMER',
      'CUSTOMER',
      custId,
      `Đã xóa khách hàng: ${result.rows[0].name}`,
      req.ip
    );

    res.json({ message: 'Đã xóa khách hàng thành công', customer: result.rows[0] });
  } catch (err) {
    console.error('[Delete Customer Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi xóa khách hàng' });
  }
});

// ---------------------- CONTACTS API ----------------------
app.get('/api/contacts', async (req, res) => {
  try {
    const query = `
      SELECT ct.*, c.name as customer_name, c.company as customer_company
      FROM contacts ct
      JOIN customers c ON ct.customer_id = c.id
      ORDER BY ct.contact_date DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('[Get Contacts Error]', err);
    res.status(500).json({ error: 'Lỗi truy vấn đầu mối liên hệ' });
  }
});

app.post('/api/contacts', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const { customer_id, channel, note } = req.body;
  const custId = parseInt(customer_id, 10);
  if (isNaN(custId)) return res.status(400).json({ error: 'Vui lòng chọn khách hàng hợp lệ' });

  try {
    const result = await pool.query(
      'INSERT INTO contacts (customer_id, channel, note) VALUES ($1, $2, $3) RETURNING *',
      [custId, channel || 'Email', note ? note.trim() : '']
    );

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'CREATE_CONTACT',
      'CONTACT',
      result.rows[0].id,
      `Thêm liên hệ kênh ${channel || 'Email'} cho khách hàng #${custId}`,
      req.ip
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Create Contact Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi tạo đầu mối liên hệ' });
  }
});

app.delete('/api/contacts/:id', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID liên hệ không hợp lệ' });

  try {
    const result = await pool.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'DELETE_CONTACT',
      'CONTACT',
      id,
      `Đã xóa liên hệ #${id}`,
      req.ip
    );

    res.json({ message: 'Đã xóa liên hệ thành công' });
  } catch (err) {
    console.error('[Delete Contact Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi xóa đầu mối liên hệ' });
  }
});

// ---------------------- INTERACTIONS API ----------------------
app.get('/api/interactions', async (req, res) => {
  try {
    const { status, type, page, limit } = req.query;
    let baseQuery = `
      FROM interactions i 
      JOIN customers c ON i.customer_id = c.id 
    `;
    let conditions = [];
    let params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (type && type !== 'all') {
      params.push(type);
      conditions.push(`i.interaction_type = $${params.length}`);
    }
    if (conditions.length > 0) {
      baseQuery += ' WHERE ' + conditions.join(' AND ');
    }

    if (page) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
      const offset = (pageNum - 1) * limitNum;

      const countResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await pool.query(
        `SELECT i.*, c.name as customer_name, c.company as customer_company 
         ${baseQuery} ORDER BY i.created_at DESC LIMIT ${limitNum} OFFSET ${offset}`,
        params
      );

      return res.json({
        data: dataResult.rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    const selectQuery = `
      SELECT i.*, c.name as customer_name, c.company as customer_company 
      ${baseQuery} ORDER BY i.created_at DESC
    `;
    const result = await pool.query(selectQuery, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Get Interactions Error]', err);
    res.status(500).json({ error: 'Lỗi truy vấn lịch sử chăm sóc khách hàng' });
  }
});

app.post('/api/interactions', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const { customer_id, interaction_type, content, status } = req.body;
  const custId = parseInt(customer_id, 10);

  if (isNaN(custId) || !content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Khách hàng và nội dung tương tác là bắt buộc' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO interactions (customer_id, interaction_type, content, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [custId, interaction_type || 'Tư vấn', content.trim(), status || 'Pending']
    );

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'CREATE_INTERACTION',
      'INTERACTION',
      result.rows[0].id,
      `Ghi nhận tương tác [${interaction_type || 'Tư vấn'}] cho khách hàng #${custId}`,
      req.ip
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Create Interaction Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi tạo tương tác' });
  }
});

app.put('/api/interactions/:id', authenticateToken, requireRole(['admin', 'staff']), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID tương tác không hợp lệ' });

  const { status, content, interaction_type } = req.body;
  try {
    const result = await pool.query(
      `UPDATE interactions 
       SET status = COALESCE($1, status),
           content = COALESCE($2, content),
           interaction_type = COALESCE($3, interaction_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, content ? content.trim() : null, interaction_type, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tương tác' });

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'UPDATE_INTERACTION',
      'INTERACTION',
      id,
      `Cập nhật tương tác #${id} (Trạng thái: ${status || 'Không đổi'})`,
      req.ip
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Update Interaction Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi cập nhật tương tác' });
  }
});

app.delete('/api/interactions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID tương tác không hợp lệ' });

  try {
    const result = await pool.query('DELETE FROM interactions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tương tác' });

    await recordAuditLog(
      req.user.id,
      req.user.username,
      'DELETE_INTERACTION',
      'INTERACTION',
      id,
      `Xóa tương tác #${id}`,
      req.ip
    );

    res.json({ message: 'Đã xóa tương tác thành công' });
  } catch (err) {
    console.error('[Delete Interaction Error]', err);
    res.status(500).json({ error: 'Lỗi cơ sở dữ liệu khi xóa tương tác' });
  }
});

// ---------------------- AUDIT LOGS API (Checklist 2 & 9) ----------------------
app.get('/api/audit-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, COALESCE(u.username, 'System') as username, u.full_name 
       FROM audit_logs a 
       LEFT JOIN users u ON a.user_id = u.id 
       ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Get Audit Logs Error]', err);
    res.status(500).json({ error: 'Lỗi khi truy xuất nhật ký kiểm toán' });
  }
});

// ---------------------- EXPORT DATA API (Checklist 4 & 9) ----------------------
// Export Customers CSV with UTF-8 BOM for Microsoft Excel compatibility
app.get('/api/customers/export/csv', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY id ASC');
    let csv = '\uFEFFMã KH,Tên Khách Hàng,Email,Số Điện Thoại,Công Ty,Trạng Thái,Ngày Tạo\n';
    result.rows.forEach(c => {
      const row = [
        c.id,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.company || '').replace(/"/g, '""')}"`,
        `"${c.status || 'Active'}"`,
        `"${new Date(c.created_at).toLocaleString('vi-VN')}"`
      ];
      csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Danh_Sach_Khach_Hang.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[Export Customers CSV Error]', err);
    res.status(500).json({ error: 'Lỗi khi xuất dữ liệu khách hàng' });
  }
});

app.get('/api/interactions/export/csv', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name as customer_name 
      FROM interactions i 
      JOIN customers c ON i.customer_id = c.id 
      ORDER BY i.created_at DESC
    `);
    let csv = '\uFEFFMã,Khách Hàng,Loại Tương Tác,Nội Dung,Trạng Thái,Thời Gian\n';
    result.rows.forEach(i => {
      const row = [
        i.id,
        `"${(i.customer_name || '').replace(/"/g, '""')}"`,
        `"${(i.interaction_type || '').replace(/"/g, '""')}"`,
        `"${(i.content || '').replace(/"/g, '""')}"`,
        `"${i.status}"`,
        `"${new Date(i.created_at).toLocaleString('vi-VN')}"`
      ];
      csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Nhat_Ky_Tuong_Tac.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[Export Interactions CSV Error]', err);
    res.status(500).json({ error: 'Lỗi khi xuất dữ liệu tương tác' });
  }
});

// ---------------------- CENTRALIZED ERROR HANDLER ----------------------
app.use((err, req, res, next) => {
  console.error(`[Unhandled Server Error] ${req.method} ${req.originalUrl}:`, err);
  res.status(err.status || 500).json({
    error: err.message || 'Lỗi hệ thống nội bộ máy chủ'
  });
});

// ---------------------- STARTUP VALIDATION & SERVER START ----------------------
let server;

async function startServer() {
  console.log('[CareFlow CRM] Đang khởi động hệ thống...');
  let connected = false;
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await pool.query('SELECT NOW() as current_time');
      console.log(`[Database] Đã kết nối cơ sở dữ liệu thành công (${res.rows[0].current_time})`);
      connected = true;
      break;
    } catch (err) {
      console.warn(`[Database] Lần kết nối ${attempt}/${maxRetries} thất bại: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  if (!connected && process.env.NODE_ENV === 'production') {
    console.error('[FATAL] Không thể kết nối tới cơ sở dữ liệu PostgreSQL sau 5 lần thử!');
    // Allow server to run if not strictly forced or continue with warning
  }

  server = app.listen(port, () => {
    console.log(`[CareFlow CRM Server] Sẵn sàng hoạt động trên cổng: ${port}`);
    console.log(`[CareFlow CRM Server] Endpoint kiểm tra sức khỏe: http://localhost:${port}/health`);
    console.log(`[CareFlow CRM Server] Endpoint Prometheus metrics: http://localhost:${port}/metrics`);
  });
}

// ---------------------- GRACEFUL SHUTDOWN (Checklist 2) ----------------------
function handleShutdown(signal) {
  console.log(`\n[CareFlow CRM] Nhận tín hiệu ${signal}. Đang thực hiện tắt hệ thống an toàn...`);
  if (server) {
    server.close(async () => {
      console.log('[CareFlow CRM] Đã đóng máy chủ HTTP Express.');
      try {
        await pool.end();
        console.log('[CareFlow CRM] Đã giải phóng toàn bộ kết nối PostgreSQL Pool.');
        process.exit(0);
      } catch (err) {
        console.error('[CareFlow CRM] Lỗi khi đóng Database Pool:', err);
        process.exit(1);
      }
    });

    // Forced exit timeout after 10s
    setTimeout(() => {
      console.error('[CareFlow CRM] Thời gian chờ tắt hệ thống quá hạn. Buộc dừng tiến trình.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = { app, pool };
