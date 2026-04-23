require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const pool = new Pool();

// Cek Koneksi
const checkConn = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database Terhubung.');
  } catch (err) {
    console.error('❌ Gagal Koneksi:', err.message);
  }
};
checkConn();

// ==========================================
// MIDDLEWARE AUTHENTICATION
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'failed', message: 'Token diperlukan' });

  jwt.verify(token, process.env.ACCESS_TOKEN_KEY, (err, user) => {
    if (err) return res.status(403).json({ status: 'failed', message: 'Token tidak valid' });
    req.user = user;
    next();
  });
};

// ==========================================
// 1. PUBLIC ENDPOINTS (No Auth Required)
// ==========================================

// --- USERS & AUTH ---
app.post('/users', async (req, res) => {
  const { username, password, fullname } = req.body;
  const id = `user-${Date.now()}`;
  try {
    await pool.query('INSERT INTO users VALUES($1, $2, $3, $4)', [id, username, password, fullname]);
    res.status(201).json({ status: 'success', data: { userId: id } });
  } catch (e) { res.status(400).json({ status: 'failed', message: e.message }); }
});

app.get('/users/:id', async (req, res) => {
  const result = await pool.query('SELECT id, username, fullname FROM users WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ status: 'failed', message: 'User not found' });
  res.json({ status: 'success', data: { user: result.rows[0] } });
});

app.post('/authentications', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT id, password FROM users WHERE username = $1', [username]);
  if (!result.rows[0] || result.rows[0].password !== password) return res.status(401).json({ status: 'failed', message: 'Kredensial salah' });
  const id = result.rows[0].id;
  const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
  const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_KEY);
  await pool.query('INSERT INTO authentications VALUES($1)', [refreshToken]);
  res.status(201).json({ status: 'success', data: { accessToken, refreshToken } });
});

app.put('/authentications', async (req, res) => {
  const { refreshToken } = req.body;
  const check = await pool.query('SELECT * FROM authentications WHERE token = $1', [refreshToken]);
  if (!check.rows[0]) return res.status(400).json({ status: 'failed', message: 'Token tidak valid' });
  try {
    const { id } = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
    const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
    res.json({ status: 'success', data: { accessToken } });
  } catch (e) { res.status(400).json({ status: 'failed', message: 'Token expired' }); }
});

// --- COMPANIES, CATEGORIES, JOBS, DOCUMENTS (GET Public) ---
app.get('/companies', async (req, res) => {
  const result = await pool.query('SELECT * FROM companies');
  res.json({ status: 'success', data: { companies: result.rows } });
});

app.get('/companies/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
  res.json({ status: 'success', data: { company: result.rows[0] } });
});

app.get('/categories', async (req, res) => {
  const result = await pool.query('SELECT * FROM categories');
  res.json({ status: 'success', data: { categories: result.rows } });
});

app.get('/categories/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  res.json({ status: 'success', data: { category: result.rows[0] } });
});

app.get('/jobs', async (req, res) => {
  const { title } = req.query;
  const query = title ? { text: 'SELECT * FROM jobs WHERE title ILIKE $1', values: [`%${title}%`] } : 'SELECT * FROM jobs';
  const result = await pool.query(query);
  res.json({ status: 'success', data: { jobs: result.rows } });
});

app.get('/jobs/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
  res.json({ status: 'success', data: { job: result.rows[0] } });
});

app.get('/jobs/company/:companyId', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs WHERE company_id = $1', [req.params.companyId]);
  res.json({ status: 'success', data: { jobs: result.rows } });
});

app.get('/jobs/category/:categoryId', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs WHERE category_id = $1', [req.params.categoryId]);
  res.json({ status: 'success', data: { jobs: result.rows } });
});

app.get('/documents', async (req, res) => {
  const result = await pool.query('SELECT * FROM documents');
  res.json({ status: 'success', data: { documents: result.rows } });
});

app.get('/documents/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  res.json({ status: 'success', data: { document: result.rows[0] } });
});

// ==========================================
// 2. PROTECTED ENDPOINTS (Auth Required)
// ==========================================

// --- PROFILE ---
app.get('/profile', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT id, username, fullname FROM users WHERE id = $1', [req.user.id]);
  res.json({ status: 'success', data: { user: result.rows[0] } });
});

app.get('/profile/applications', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.user.id]);
  res.json({ status: 'success', data: { applications: result.rows } });
});

app.get('/profile/bookmarks', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
  res.json({ status: 'success', data: { bookmarks: result.rows } });
});

// --- CRUD PROTECTED (Companies, Categories, Jobs) ---
app.post('/companies', authenticateToken, async (req, res) => {
  const id = `company-${Date.now()}`;
  await pool.query('INSERT INTO companies VALUES($1, $2, $3)', [id, req.body.name, req.user.id]);
  res.status(201).json({ status: 'success', data: { companyId: id } });
});

app.put('/companies/:id', authenticateToken, async (req, res) => {
  await pool.query('UPDATE companies SET name = $1 WHERE id = $2 AND owner = $3', [req.body.name, req.params.id, req.user.id]);
  res.json({ status: 'success', message: 'Updated' });
});

app.delete('/companies/:id', authenticateToken, async (req, res) => {
  await pool.query('DELETE FROM companies WHERE id = $1 AND owner = $2', [req.params.id, req.user.id]);
  res.json({ status: 'success', message: 'Deleted' });
});

app.post('/categories', authenticateToken, async (req, res) => {
  const id = `cat-${Date.now()}`;
  await pool.query('INSERT INTO categories VALUES($1, $2)', [id, req.body.name]);
  res.status(201).json({ status: 'success', data: { categoryId: id } });
});

app.post('/jobs', authenticateToken, async (req, res) => {
  const id = `job-${Date.now()}`;
  const { title, company_id, category_id } = req.body;
  await pool.query('INSERT INTO jobs(id, title, company_id, category_id) VALUES($1, $2, $3, $4)', [id, title, company_id, category_id]);
  res.status(201).json({ status: 'success', data: { jobId: id } });
});

// --- APPLICATIONS ---
app.post('/applications', authenticateToken, async (req, res) => {
  const id = `app-${Date.now()}`;
  await pool.query('INSERT INTO applications(id, job_id, user_id) VALUES($1, $2, $3)', [id, req.body.job_id, req.user.id]);
  res.status(201).json({ status: 'success', data: { applicationId: id } });
});

app.get('/applications', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM applications');
  res.json({ status: 'success', data: { applications: result.rows } });
});

// --- BOOKMARKS ---
app.post('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
  const id = `bm-${Date.now()}`;
  await pool.query('INSERT INTO bookmarks VALUES($1, $2, $3)', [id, req.user.id, req.params.jobId]);
  res.status(201).json({ status: 'success', data: { bookmarkId: id } });
});

app.get('/bookmarks', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
  res.json({ status: 'success', data: { bookmarks: result.rows } });
});

// --- AUTH (Logout) ---
app.delete('/authentications', authenticateToken, async (req, res) => {
  await pool.query('DELETE FROM authentications WHERE token = $1', [req.body.refreshToken]);
  res.json({ status: 'success', message: 'Logout berhasil' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));