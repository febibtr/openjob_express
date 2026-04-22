require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// Konfigurasi Database
const pool = new Pool();

// Cek Koneksi Database
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database Gagal Terhubung!', err.stack);
  } else {
    console.log('Database Terhubung.');
  }
});

// ==========================================
// MIDDLEWARE AUTHENTICATION
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ status: 'failed', message: 'Token diperlukan' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ status: 'failed', message: 'Token tidak valid' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// 1. PUBLIC ENDPOINTS (Users & Auth)
// ==========================================

// Register User
app.post('/users', async (req, res) => {
  const { username, password, fullname } = req.body;
  if (!username || !password || !fullname) {
    return res.status(400).json({ status: 'failed', message: 'Mohon lengkapi semua field' });
  }

  try {
    const id = `user-${Math.random().toString(36).substr(2, 9)}`;
    await pool.query(
      'INSERT INTO users(id, username, password, fullname) VALUES($1, $2, $3, $4)',
      [id, username, password, fullname]
    );
    res.status(201).json({ status: 'success', data: { userId: id } });
  } catch (error) {
    res.status(400).json({ status: 'failed', message: 'Username sudah digunakan' });
  }
});

// Login
app.post('/authentications', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT id, password FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0 || result.rows[0].password !== password) {
      return res.status(401).json({ status: 'failed', message: 'Kredensial salah' });
    }

    const { id } = result.rows[0];
    const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
    const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_KEY);

    await pool.query('INSERT INTO authentications(token) VALUES($1)', [refreshToken]);
    res.status(201).json({ status: 'success', data: { accessToken, refreshToken } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server Error' });
  }
});

// Refresh Token
app.put('/authentications', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ status: 'failed', message: 'Refresh token harus ada' });

  try {
    const checkToken = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
    if (checkToken.rows.length === 0) {
      return res.status(400).json({ status: 'failed', message: 'Refresh token tidak valid' });
    }

    const { id } = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
    const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });

    res.status(200).json({ status: 'success', data: { accessToken } });
  } catch (error) {
    res.status(400).json({ status: 'failed', message: 'Token tidak valid' });
  }
});

// ==========================================
// 2. PUBLIC ENDPOINTS (Public Data)
// ==========================================

app.get('/jobs', async (req, res) => {
  const { title } = req.query;
  try {
    let query = 'SELECT * FROM jobs';
    let values = [];
    if (title) {
      query += ' WHERE title ILIKE $1';
      values.push(`%${title}%`);
    }
    const result = await pool.query(query, values);
    res.status(200).json({ status: 'success', data: { jobs: result.rows } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/companies', async (req, res) => {
  const result = await pool.query('SELECT * FROM companies');
  res.status(200).json({ status: 'success', data: { companies: result.rows } });
});

// ==========================================
// 3. PROTECTED ENDPOINTS (Auth Required)
// ==========================================

app.get('/profile', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT id, username, fullname FROM users WHERE id = $1', [req.user.id]);
  res.json({ status: 'success', data: { user: result.rows[0] } });
});

app.post('/companies', authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    const id = `company-${Date.now()}`;
    await pool.query('INSERT INTO companies(id, name, owner) VALUES($1, $2, $3)', [id, name, req.user.id]);
    res.status(201).json({ status: 'success', data: { companyId: id } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Gagal tambah company' });
  }
});

app.post('/jobs', authenticateToken, async (req, res) => {
  const { title, company_id, category_id } = req.body;
  try {
    const id = `job-${Date.now()}`;
    await pool.query('INSERT INTO jobs(id, title, company_id, category_id) VALUES($1, $2, $3, $4)', 
      [id, title, company_id, category_id]);
    res.status(201).json({ status: 'success', data: { jobId: id } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Gagal tambah job' });
  }
});

// Logout
app.delete('/authentications', async (req, res) => {
  const { refreshToken } = req.body;
  try {
    await pool.query('DELETE FROM authentications WHERE token = $1', [refreshToken]);
    res.status(200).json({ status: 'success', message: 'Logout berhasil' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Server Error' });
  }
});

// Server Start
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server berjalan di http://${process.env.HOST || 'localhost'}:${port}`);
});