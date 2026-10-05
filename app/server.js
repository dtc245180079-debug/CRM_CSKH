const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Prometheus Metrics Setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'crm_http_requests_total',
  help: 'Tong so request HTTP den he thong CRM',
  labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestCounter);

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestCounter.labels(req.method, req.path, res.statusCode).inc();
  });
  next();
});

// Database Pool
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  user: process.env.DB_USER || 'crm_user',
  password: process.env.DB_PASSWORD || 'CrmSecurePassword2026!',
  database: process.env.DB_NAME || 'crm_db',
  port: 5432,
});

// Prometheus Endpoint
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Health Check
app.get('/health', (req, res) => res.json({ status: 'UP', service: 'CRM Backend' }));

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
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------- CUSTOMERS API ----------------------
app.get('/api/customers', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers';
    let params = [];
    if (search) {
      query += ' WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR company ILIKE $1';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const custRes = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (custRes.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    const interRes = await pool.query(
      'SELECT * FROM interactions WHERE customer_id = $1 ORDER BY created_at DESC',
      [id]
    );
    const contactRes = await pool.query(
      'SELECT * FROM contacts WHERE customer_id = $1 ORDER BY contact_date DESC',
      [id]
    );

    res.json({
      customer: custRes.rows[0],
      interactions: interRes.rows,
      contacts: contactRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/customers', async (req, res) => {
  const { name, email, phone, company } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Tên và Email là bắt buộc' });
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, company) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, company]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, company } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Tên và Email là bắt buộc' });
  try {
    const result = await pool.query(
      'UPDATE customers SET name = $1, email = $2, phone = $3, company = $4 WHERE id = $5 RETURNING *',
      [name, email, phone, company, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    res.json({ message: 'Đã xóa khách hàng thành công', customer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
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
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/contacts', async (req, res) => {
  const { customer_id, channel, note } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'Vui lòng chọn khách hàng' });
  try {
    const result = await pool.query(
      'INSERT INTO contacts (customer_id, channel, note) VALUES ($1, $2, $3) RETURNING *',
      [customer_id, channel || 'Email', note]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    res.json({ message: 'Đã xóa liên hệ thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------- INTERACTIONS API ----------------------
app.get('/api/interactions', async (req, res) => {
  try {
    const { status, type } = req.query;
    let query = `
      SELECT i.*, c.name as customer_name, c.company as customer_company
      FROM interactions i 
      JOIN customers c ON i.customer_id = c.id 
    `;
    let conditions = [];
    let params = [];

    if (status) {
      params.push(status);
      conditions.push(`i.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`i.interaction_type = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY i.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/interactions', async (req, res) => {
  const { customer_id, interaction_type, content, status } = req.body;
  if (!customer_id || !content) {
    return res.status(400).json({ error: 'Khách hàng và nội dung tương tác là bắt buộc' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO interactions (customer_id, interaction_type, content, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [customer_id, interaction_type || 'Tư vấn', content, status || 'Pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/interactions/:id', async (req, res) => {
  const { id } = req.params;
  const { status, content, interaction_type } = req.body;
  try {
    const result = await pool.query(
      `UPDATE interactions 
       SET status = COALESCE($1, status),
           content = COALESCE($2, content),
           interaction_type = COALESCE($3, interaction_type)
       WHERE id = $4 RETURNING *`,
      [status, content, interaction_type, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tương tác' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/interactions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM interactions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy tương tác' });
    res.json({ message: 'Đã xóa tương tác thành công' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`[CRM Server] Đang chạy trên port ${port}`);
});

