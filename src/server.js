require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const pool = new Pool();

// --- MIDDLEWARE AUTHENTICATION ---
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

// 1. PUBLIC ENDPOINTS (No Auth Required)

// USERS & AUTH
app.post('/users', async (req, res) => { /* Logika Register */ });
app.get('/users/:id', async (req, res) => { /* Logika Get Profile */ });
app.post('/authentications', async (req, res) => { /* Logika Login */ });
app.put('/authentications', async (req, res) => { /* Logika Refresh Token */ });

// COMPANIES & JOBS (GET is Public)
app.get('/companies', async (req, res) => {
  const result = await pool.query('SELECT * FROM companies');
  res.json({ status: 'success', data: { companies: result.rows } });
});

app.get('/jobs', async (req, res) => {
  // Tambahkan logika query ?title= di sini untuk poin Advanced
  const { title } = req.query;
  let query = 'SELECT * FROM jobs';
  if (title) query += ` WHERE title ILIKE '%${title}%'`;
  const result = await pool.query(query);
  res.json({ status: 'success', data: { jobs: result.rows } });
});

// CATEGORIES & DOCUMENTS (GET is Public)
app.get('/categories', async (req, res) => { /* List Categories */ });
app.get('/documents', async (req, res) => { /* List Documents */ });

// 2. PROTECTED ENDPOINTS (Auth Required)


// PROFILE (Khusus user login)
app.get('/profile', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT id, username, fullname FROM users WHERE id = $1', [req.user.id]);
  res.json({ status: 'success', data: { user: result.rows[0] } });
});

// COMPANIES (Write access)
app.post('/companies', authenticateToken, async (req, res) => { /* Create Company */ });
app.put('/companies/:id', authenticateToken, async (req, res) => { /* Update Company */ });
app.delete('/companies/:id', authenticateToken, async (req, res) => { /* Delete Company */ });

// JOBS (Write access)
app.post('/jobs', authenticateToken, async (req, res) => {
  const { title, company_id, category_id } = req.body;
  const id = `job-${Date.now()}`;
  await pool.query('INSERT INTO jobs VALUES($1, $2, $3, $4)', [id, title, company_id, category_id]);
  res.status(201).json({ status: 'success', data: { jobId: id } });
});

// APPLICATIONS & BOOKMARKS
app.post('/applications', authenticateToken, async (req, res) => { /* Apply Job */ });
app.post('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => { /* Bookmark Job */ });

// LOGOUT
app.delete('/authentications', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;
  await pool.query('DELETE FROM authentications WHERE token = $1', [refreshToken]);
  res.json({ status: 'success', message: 'Logout berhasil' });
});

// SERVER START
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server berjalan di http://${process.env.HOST}:${port}`);
});