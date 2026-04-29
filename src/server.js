require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Joi = require('joi');
const redis = require('redis');
const amqp = require('amqplib');

const app = express();
app.use(express.json());
const pool = new Pool();

// ==========================================
// KONFIGURASI REDIS (Caching)
// ==========================================
const redisClient = redis.createClient({
    socket: { host: process.env.REDIS_HOST || '127.0.0.1' }
});
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

const setCache = async (key, value) => {
    await redisClient.set(key, JSON.stringify(value), { EX: 3600 });
};
const getCache = async (key) => {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
};
const clearCache = async (key) => {
    await redisClient.del(key);
};

// ==========================================
// KONFIGURASI RABBITMQ (Message Queue)
// ==========================================
let mqChannel;
const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect(`amqp://${process.env.RABBITMQ_USER}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
        mqChannel = await connection.createChannel();
        await mqChannel.assertQueue('application_queue', { durable: true });
        console.log('✅ RabbitMQ Terhubung');
    } catch (error) {
        console.error('❌ RabbitMQ Gagal Terhubung:', error.message);
    }
};
connectRabbitMQ();

// ==========================================
// KONFIGURASI MULTER (Untuk Upload Documents)
// ==========================================
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}${path.extname(file.originalname)}`)
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('File is required to be PDF'), false);
        }
    }
});

const uploadMiddleware = (req, res, next) => {
    upload.single('document')(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return next({ status: 400, message: 'File is required and max size is 5MB' });
        }
        if (err) return next({ status: 400, message: err.message });
        next();
    });
};

app.use('/uploads', express.static('uploads'));

// ==========================================
// 1. SCHEMAS VALIDATION (Joi)
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

const RefreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required()
});

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/users', validate(UserSchema), async (req, res, next) => {
    const { name, email, password, role } = req.body;
    try {
        const id = `user-${Date.now()}`;
        await pool.query('INSERT INTO users(id, name, email, password, role) VALUES($1, $2, $3, $4, $5)', [id, name, email, password, role || 'user']);
        res.status(201).json({ status: 'success', data: { id } });
    } catch (e) { next({ status: 400, message: 'Email sudah digunakan' }); }
});

app.get('/users/:id', async (req, res, next) => {
    const cacheKey = `users:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: cached });
    }

    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'User not found' });
    
    await setCache(cacheKey, result.rows[0]);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

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

app.put('/authentications', validate(RefreshTokenSchema), async (req, res, next) => {
    const { refreshToken } = req.body;
    const check = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
    if (!check.rows[0]) return next({ status: 400, message: 'Token tidak valid di database' });
    
    try {
        const { id } = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
        const accessToken = jwt.sign({ id }, process.env.ACCESS_TOKEN_KEY, { expiresIn: '3h' });
        res.status(200).json({ status: 'success', data: { accessToken } });
    } catch (e) { next({ status: 400, message: 'Token kadaluwarsa atau tidak valid' }); }
});

app.get('/companies', async (req, res) => {
    const result = await pool.query('SELECT id, name, location, description, owner, created_at FROM companies');
    res.status(200).json({ status: 'success', data: { companies: result.rows } });
});

app.get('/companies/:id', async (req, res, next) => {
    const cacheKey = `companies:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: cached });
    }

    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    
    await setCache(cacheKey, result.rows[0]);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

app.get('/categories', async (req, res) => {
    const result = await pool.query('SELECT id, name, created_at, updated_at FROM categories');
    res.status(200).json({ status: 'success', data: { categories: result.rows } });
});

app.get('/categories/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

app.get('/jobs', async (req, res) => {
    const { title } = req.query;
    const companyName = req.query['company-name'];
    
    let queryText = `
        SELECT j.id, j.company_id, j.category_id, j.title, j.job_type, j.experience_level, 
               j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, j.status, 
               c.name as company_name 
        FROM jobs j JOIN companies c ON j.company_id = c.id WHERE 1=1`;
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

app.get('/documents', async (req, res) => {
    const result = await pool.query('SELECT id, user_id, filename, url FROM documents');
    res.status(200).json({ status: 'success', data: { documents: result.rows } });
});

app.get('/documents/:id', async (req, res, next) => {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    
    const document = result.rows[0];
    const filePath = path.join(process.cwd(), 'uploads', document.filename);

    if (!fs.existsSync(filePath)) {
        return next({ status: 404, message: 'File fisik tidak ditemukan di: ' + filePath });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.filename}"`);
    res.sendFile(filePath);
});
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROTECTED ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/profile', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

app.get('/profile/applications', authenticateToken, async (req, res) => {
    const query = `
        SELECT a.id, a.user_id, a.job_id, a.status, 
               j.category_id, j.title, j.description, j.job_type, j.experience_level, 
               j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, 
               c.name as company_name 
        FROM applications a 
        JOIN jobs j ON a.job_id = j.id 
        JOIN companies c ON j.company_id = c.id 
        WHERE a.user_id = $1`;
        
    const result = await pool.query(query, [req.user.id]);
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});

app.get('/profile/bookmarks', authenticateToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM bookmarks WHERE user_id = $1', [req.user.id]);
    res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
});

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
    await clearCache(`companies:${req.params.id}`);
    res.status(200).json({ status: 'success', message: 'Updated' });
});

app.delete('/companies/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT id FROM companies WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    await clearCache(`companies:${req.params.id}`);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

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

app.post('/jobs', authenticateToken, validate(JobSchema), async (req, res, next) => {
    const { company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status } = req.body;
    
    const compCheck = await pool.query('SELECT id FROM companies WHERE id = $1', [company_id]);
    if (!compCheck.rows[0]) return next({ status: 404, message: 'Company not found' });
    
    const id = `job-${Date.now()}`;
    await pool.query(
        'INSERT INTO jobs (id, company_id, category_id, title, description, job_type, experience_level, location_type, location_city, salary_min, salary_max, is_salary_visible, status) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', 
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

app.post('/applications', authenticateToken, async (req, res, next) => {
    const { job_id } = req.body;
    
    const jobCheck = await pool.query('SELECT id FROM jobs WHERE id = $1', [job_id]);
    if (!jobCheck.rows[0]) return next({ status: 404, message: 'Job not found' });

    const duplicateCheck = await pool.query('SELECT id FROM applications WHERE job_id = $1 AND user_id = $2', [job_id, req.user.id]);
    if (duplicateCheck.rows[0]) return next({ status: 400, message: 'Application already exists' });

    const id = `app-${Date.now()}`;
    await pool.query('INSERT INTO applications(id, job_id, user_id) VALUES($1, $2, $3)', [id, job_id, req.user.id]);
    
    await clearCache(`applications:user:${req.user.id}`);
    await clearCache(`applications:job:${job_id}`);

    if (mqChannel) {
        mqChannel.sendToQueue('application_queue', Buffer.from(JSON.stringify({ application_id: id })));
    }

    res.status(201).json({ status: 'success', data: { id, job_id, user_id: req.user.id, status: 'pending' } });
});

app.get('/applications', authenticateToken, async (req, res) => {
    const query = `
        SELECT a.id, a.user_id, a.job_id, a.status, 
               j.title, j.job_type, j.experience_level, j.location_type, j.location_city, 
               j.salary_min, j.salary_max, j.is_salary_visible, j.category_id
        FROM applications a 
        JOIN jobs j ON a.job_id = j.id`;
    const result = await pool.query(query);
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});

app.get('/applications/:id', authenticateToken, async (req, res, next) => {
    const cacheKey = `applications:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: cached });
    }

    const result = await pool.query('SELECT * FROM applications WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });

    await setCache(cacheKey, result.rows[0]);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

app.get('/applications/user/:userId', authenticateToken, async (req, res) => {
    const cacheKey = `applications:user:${req.params.userId}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { applications: cached } });
    }

    const result = await pool.query('SELECT * FROM applications WHERE user_id = $1', [req.params.userId]);
    await setCache(cacheKey, result.rows);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});

app.get('/applications/job/:jobId', authenticateToken, async (req, res) => {
    const cacheKey = `applications:job:${req.params.jobId}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { applications: cached } });
    }

    const result = await pool.query('SELECT * FROM applications WHERE job_id = $1', [req.params.jobId]);
    await setCache(cacheKey, result.rows);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: { applications: result.rows } });
});

app.put('/applications/:id', authenticateToken, async (req, res, next) => {
    const appInfo = await pool.query('SELECT user_id, job_id FROM applications WHERE id = $1', [req.params.id]);
    if (!appInfo.rows[0]) return next({ status: 404, message: 'Not found' });

    await pool.query('UPDATE applications SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    
    await clearCache(`applications:${req.params.id}`);
    await clearCache(`applications:user:${appInfo.rows[0].user_id}`);
    await clearCache(`applications:job:${appInfo.rows[0].job_id}`);

    res.status(200).json({ status: 'success', message: 'Updated' });
});

app.delete('/applications/:id', authenticateToken, async (req, res, next) => {
    const appInfo = await pool.query('SELECT user_id, job_id FROM applications WHERE id = $1', [req.params.id]);
    if (!appInfo.rows[0]) return next({ status: 404, message: 'Not found' });

    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);

    await clearCache(`applications:${req.params.id}`);
    await clearCache(`applications:user:${appInfo.rows[0].user_id}`);
    await clearCache(`applications:job:${appInfo.rows[0].job_id}`);

    res.status(200).json({ status: 'success', message: 'Deleted' });
});

app.post('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
    const id = `bm-${Date.now()}`;
    await pool.query('INSERT INTO bookmarks VALUES($1, $2, $3)', [id, req.user.id, req.params.jobId]);
    await clearCache(`bookmarks:user:${req.user.id}`);
    res.status(201).json({ status: 'success', data: { id } });
});

app.get('/jobs/:jobId/bookmark/:id', authenticateToken, async (req, res, next) => {
    const result = await pool.query('SELECT * FROM bookmarks WHERE id = $1 AND job_id = $2', [req.params.id, req.params.jobId]);
    if (!result.rows[0]) return next({ status: 404, message: 'Not found' });
    res.status(200).json({ status: 'success', data: result.rows[0] });
});

app.delete('/jobs/:jobId/bookmark', authenticateToken, async (req, res) => {
    await pool.query('DELETE FROM bookmarks WHERE user_id = $1 AND job_id = $2', [req.user.id, req.params.jobId]);
    await clearCache(`bookmarks:user:${req.user.id}`);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

app.get('/bookmarks', authenticateToken, async (req, res) => {
    const cacheKey = `bookmarks:user:${req.user.id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
        res.set('X-Data-Source', 'cache');
        return res.status(200).json({ status: 'success', data: { bookmarks: cached } });
    }

    const query = `
        SELECT b.id, b.user_id, b.job_id, 
               j.company_id, j.category_id, j.title, j.description, j.job_type, j.experience_level, 
               j.location_type, j.location_city, j.salary_min, j.salary_max, j.is_salary_visible, j.status, 
               c.name as company_name, c.location as company_location, c.description as company_description 
        FROM bookmarks b 
        JOIN jobs j ON b.job_id = j.id 
        JOIN companies c ON j.company_id = c.id 
        WHERE b.user_id = $1`;
        
    const result = await pool.query(query, [req.user.id]);
    await setCache(cacheKey, result.rows);
    res.set('X-Data-Source', 'database');
    res.status(200).json({ status: 'success', data: { bookmarks: result.rows } });
});

app.post('/documents', authenticateToken, uploadMiddleware, async (req, res, next) => {
    if (!req.file) return next({ status: 400, message: 'File is required' });
    
    const id = `doc-${Date.now()}`;
    const url = `http://${req.hostname}:${process.env.PORT || 3000}/uploads/${req.file.filename}`;
    
    await pool.query('INSERT INTO documents VALUES($1, $2, $3, $4)', [id, req.user.id, req.file.filename, url]);
    
    res.status(201).json({ 
        status: 'success', 
        data: { 
            documentId: id, 
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size
        } 
    });
});

app.delete('/documents/:id', authenticateToken, async (req, res, next) => {
    const check = await pool.query('SELECT filename FROM documents WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return next({ status: 404, message: 'Not found' });
    
    const filePath = path.join(process.cwd(), 'uploads', check.rows[0].filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.status(200).json({ status: 'success', message: 'Deleted' });
});

app.delete('/authentications', authenticateToken, validate(RefreshTokenSchema), async (req, res, next) => {
    const { refreshToken } = req.body;
    const check = await pool.query('SELECT token FROM authentications WHERE token = $1', [refreshToken]);
    if (!check.rows[0]) return next({ status: 400, message: 'Refresh token tidak ditemukan di database' });

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