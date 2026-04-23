require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');


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

const RefreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required()
});

// ==========================================
// KONFIGURASI MULTER (Upload Documents)
// ==========================================
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });
app.use('/uploads', express.static('uploads'));

// ==========================================
// VALIDATION (Joi)
// ==========================================
const UserSchema = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('admin', 'user').optional()
});

const AuthSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const CompanySchema = Joi.object({
    name: Joi.string().required(),
    location: Joi.string().required(),
    description: Joi.string().optional()
});

const CategorySchema = Joi.object({
    name: Joi.string().required()
});

const JobSchema = Joi.object({
    company_id: Joi.string().required(),
    category_id: Joi.string().required(),
    title: Joi.string().required(),
    description: Joi.string().optional(),
    job_type: Joi.string().optional(),
    experience_level: Joi.string().optional(),
    location_type: Joi.string().optional(),
    location_city: Joi.string().optional(),
    salary_min: Joi.number().optional(),
    salary_max: Joi.number().optional(),
    is_salary_visible: Joi.boolean().optional(),
    status: Joi.string().optional()
});

// Middleware Validasi Joi
const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) return next({ status: 400, message: error.details[0].message });
        next();
    };
};

// ==========================================
// MIDDLEWARE AUTHENTICATION
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'failed', message: 'Token diperlukan' });

    jwt.verify(token, process.env.ACCESS_TOKEN_KEY, (err, user) => {
        if (err) return res.status(401).json({ status: 'failed', message: 'Token tidak valid' });
        req.user = user;
        next();
    });
};

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// --- USERS ---
app.post('/users', validate(UserSchema), async (req, res, next) => {
    const { name, email, password, role } = req.body;
    try {
        const id = `user-${Date.now()}`;
        await pool.query('INSERT INTO users(id, name, email, password, role) VALUES($1, $2, $3, $4, $5)', [id, name, email, password, role || 'user']);
        res.status(201).json({ status: 'success', data: { id } });
    } catch (e) { next({ status: 400, message: 'Email sudah digunakan' }); }
});

app.get('/users/:id', async (req, res, next) => {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'User not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

// --- AUTHENTICATIONS ---
app.post('/authentications', validate(AuthSchema), async (req, res, next) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT id, password FROM users WHERE email = $1', [email]);
    if (!result.rows[0] || result.rows[0].password !== password) return next({ status: 401, message: 'Kredensial salah' });
    
    const id = result.rows[0].id;
    const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
    const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_KEY);
    await pool.query('INSERT INTO authentications VALUES($1)', [refreshToken]);
    res.status(200).json({ status: 'success', data: { accessToken, refreshToken } });
});

app.put('/authentications', async (req, res, next) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return next({ status: 400, message: 'Refresh token diperlukan' });
    
    const check = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
    if (!check.rows[0]) return next({ status: 400, message: 'Token tidak valid di database' });
    
    try {
        const { id } = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
        const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
        res.status(200).json({ status: 'success', data: { accessToken } });
    } catch (e) { next({ status: 400, message: 'Token kadaluwarsa atau tidak valid' }); }
});

// --- COMPANIES ---
app.get('/companies', async (req, res) => {
    const result = await pool.query('SELECT * FROM companies');
    res.status(200).json({ status: 'success', data: { companies: result.rows } });
});
app.get('/companies/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

// --- CATEGORIES ---
app.get('/categories', async (req, res) => {
    const result = await pool.query('SELECT * FROM categories');
    res.status(200).json({ status: 'success', data: { categories: result.rows } });
});
app.get('/categories/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

// --- JOBS ---
app.get('/jobs', async (req, res) => {
    const { title } = req.query;
    const companyName = req.query['company-name'];
    let queryText = 'SELECT j.*, c.name as company_name FROM jobs j JOIN companies c ON j.company_id = c.id WHERE 1=1';
    let params = [];
    if (title) { params.push(`%${title}%`); queryText += ` AND j.title ILIKE $${params.length}`; }
    if (companyName) { params.push(`%${companyName}%`); queryText += ` AND c.name ILIKE $${params.length}`; }
    
    const result = await pool.query(queryText, params);
    res.status(200).json({ status: 'success', data: { jobs: result.rows } });
});
app.get('/jobs/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});
app.get('/jobs/company/:companyId', async (req, res) => {
    const result = await pool.query('SELECT * FROM jobs WHERE company_id = $1', [req.params.companyId]);
    res.status(200).json({ status: 'success', data: { jobs: result.rows } });
});
app.get('/jobs/category/:categoryId', async (req, res) => {
    const result = await pool.query('SELECT * FROM jobs WHERE category_id = $1', [req.params.categoryId]);
    res.status(200).json({ status: 'success', data: { jobs: result.rows } });
});

// --- DOCUMENTS (Public) ---
app.get('/documents', async (req, res) => {
    const result = await pool.query('SELECT * FROM documents');
    res.status(200).json({ status: 'success', data: { documents: result.rows } });
});
app.get('/documents/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});


// ==========================================
// PROTECTED ENDPOINTS 
// ==========================================

// --- PROFILE ---
app.get('/profile', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
});
app.get('/profile/applications', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});
app.get('/profile/bookmarks', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
});

// --- COMPANIES ---
app.post('/companies', authenticateToken, validate(CompanySchema), async (req, res) => {
    const { name, location, description } = req.body;
    const id = `company-${Date.now()}`;
    await pool.query('INSERT INTO companies VALUES($1, $2, $3, $4, $5)', [id, name, location, description, req.user.id]);
    res.status(201).json({ status: 'success', data: { id } });
});
app.put('/companies/:id', authenticateToken, validate(CompanySchema), async (req, res, next) => {
    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('UPDATE companies SET name = $1, location = $2, description = $3 WHERE id = $4', [req.body.name, req.body.location, req.body.description, req.params.id]);
    res.status(200).json({ status: 'success', message: 'Updated' });
});
app.delete('/companies/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

// --- CATEGORIES ---
app.post('/categories', authenticateToken, validate(CategorySchema), async (req, res) => {
    const id = `cat-${Date.now()}`;
    await pool.query('INSERT INTO categories VALUES($1, $2)', [id, req.body.name]);
    res.status(201).json({ status: 'success', data: { id } });
});
app.put('/categories/:id', authenticateToken, validate(CategorySchema), async (req, res, next) => {
    const check = await pool.query('SELECT id FROM categories WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('UPDATE categories SET name = $1 WHERE id = $2', [req.body.name, req.params.id]);
    res.status(200).json({ status: 'success', message: 'Updated' });
});
app.delete('/categories/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM categories WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

// --- JOBS ---
app.post('/jobs', authenticateToken, validate(JobSchema), async (req, res) => {
    const { company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status } = req.body;
    const id = `job-${Date.now()}`;
    await pool.query(
        'INSERT INTO jobs VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', 
        [id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status || 'open']
    );
    res.status(201).json({ status: 'success', data: { id } });
});
app.put('/jobs/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM jobs WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('UPDATE jobs SET title = $1, description = $2, salary_max = $3 WHERE id = $4', [req.body.title, req.body.description, req.body.salary_max, req.params.id]);
    res.status(200).json({ status: 'success', message: 'Updated' });
});
app.delete('/jobs/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM jobs WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('DELETE FROM jobs WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

// --- APPLICATIONS ---
app.post('/applications', authenticateToken, async (req, res) => {
    const { job_id } = req.body;
    const id = `app-${Date.now()}`;
    await pool.query('INSERT INTO applications(id, job_id, user_id) VALUES($1, $2, $3)', [id, job_id, req.user.id]);
    res.status(201).json({ status: 'success', data: { id } });
});
app.get('/applications', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM applications');
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});
app.get('/applications/:id', authenticateToken, async (req, res, next) => {
    const result = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});
app.get('/applications/user/:userId', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.params.userId]);
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});
app.get('/applications/job/:jobId', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM applications WHERE job_id = $1', [req.params.jobId]);
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});
app.put('/applications/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM applications WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('UPDATE applications SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    res.status(200).json({ status: 'success', message: 'Updated' });
});
app.delete('/applications/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM applications WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

// --- BOOKMARKS ---
app.post('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
    const id = `bm-${Date.now()}`;
    await pool.query('INSERT INTO bookmarks VALUES($1, $2, $3)', [id, req.user.id, req.params.jobId]);
    res.status(201).json({ status: 'success', data: { id } });
});
app.get('/jobs/:jobId/bookmark/:id', authenticateToken, async (req, res, next) => {
    const result = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND job_id = $2', [req.params.id, req.params.jobId]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});
app.delete('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
    await pool.query('DELETE FROM bookmarks WHERE user_id = $1 AND job_id = $2', [req.user.id, req.params.jobId]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});
app.get('/bookmarks', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
});

// --- DOCUMENTS (Protected) ---
app.post('/documents', authenticateToken, upload.single('document'), async (req, res, next) => {
    if (!req.file) return next({ status: 400, message: 'File wajib diunggah' });
    const id = `doc-${Date.now()}`;
    const url = `http://${req.hostname}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
    
    await pool.query('INSERT INTO documents VALUES($1, $2, $3, $4)', [id, req.user.id, req.file.filename, url]);
    res.status(201).json({ status: 'success', data: { id, url } });
});
app.delete('/documents/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT filename FROM documents WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    
    fs.unlink(path.join(__dirname, 'uploads', check.rows[0].filename), (err) => { if(err) console.error(err) });
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

// --- AUTHENTICATIONS (Logout) ---
app.delete('/authentications', authenticateToken, validate(RefreshTokenSchema), async (req, res, next) => {
    const { refreshToken } = req.body;

    // Cek apakah token tersebut memang ada di database
    const check = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
    
    // Jika tidak ada (karena invalid/ngasal), kembalikan error 400
    if (!check.rows[0]) {
        return next({ status: 400, message: 'Refresh token tidak valid di database' });
    }

    // Jika ada, baru hapus dari database
    await pool.query('DELETE FROM authentications WHERE token = $1', [refreshToken]);
    res.status(200).json({ status: 'success', message: 'Logout berhasil' });
});

// ==========================================
// MIDDLEWARE ERROR HANDLING 
// ==========================================
app.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    res.status(statusCode).json({
        status: statusCode >= 500 ? 'error' : 'failed',
        message: err.message || 'Terjadi kesalahan pada server'
    });
});

// ==========================================
// SERVER START
// ==========================================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 API berjalan di http://localhost:${port}`));