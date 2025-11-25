require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.set('trust proxy', 1);

const {
  PORT = 4000,
  JWT_SECRET = 'change-me',
  DB_HOST = '192.168.0.81',
  DB_PORT = 5432,
  DB_USER = 'postgres',
  DB_PASSWORD = 'postgres',
  DB_NAME = 'modulo',
  FRONT_ORIGIN = 'https://modulo.apexstudiocodes.co.uk',
} = process.env;

app.use(
  cors({
    origin: FRONT_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  })
);
app.use(express.json());

// --- Configuration ---
const {
  // already destructured above
} = process.env;

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

// --- Helpers ---
function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0];
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS modules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// --- Routes ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ message: 'User already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [email.toLowerCase(), passwordHash, firstName || null, lastName || null]
    );
    const user = rows[0];
    const token = signToken(user);
    return res.json({ token, message: 'Account created', redirectTo: 'dashboard.html' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    return res.json({ token, message: 'Logged in', redirectTo: 'dashboard.html' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

app.get('/api/modules', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT payload FROM modules WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [
      req.user.sub,
    ]);
    const payload = rows[0]?.payload || { modules: [] };
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to load modules' });
  }
});

app.post('/api/modules', authRequired, async (req, res) => {
  try {
    const { type = 'note' } = req.body || {};
    const { rows } = await pool.query('SELECT payload, id FROM modules WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [
      req.user.sub,
    ]);
    const existing = rows[0];
    const modules = existing?.payload?.modules || [];
    modules.push({ type, title: `New ${type}`, size: 'medium', items: [] });
    if (existing) {
      await pool.query('UPDATE modules SET payload = $1, updated_at = now() WHERE id = $2', [{ modules }, existing.id]);
    } else {
      await pool.query('INSERT INTO modules (user_id, payload) VALUES ($1, $2)', [req.user.sub, { modules }]);
    }
    return res.json({ modules, message: 'Module added' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to add module' });
  }
});

app.put('/api/modules', authRequired, async (req, res) => {
  try {
    const modules = req.body?.modules;
    if (!Array.isArray(modules)) return res.status(400).json({ message: 'modules must be an array' });

    const { rows } = await pool.query('SELECT id FROM modules WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [
      req.user.sub,
    ]);
    const existing = rows[0];

    if (existing) {
      await pool.query('UPDATE modules SET payload = $1, updated_at = now() WHERE id = $2', [{ modules }, existing.id]);
    } else {
      await pool.query('INSERT INTO modules (user_id, payload) VALUES ($1, $2)', [req.user.sub, { modules }]);
    }
    return res.json({ modules, message: 'Modules saved' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Unable to save modules' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- Start ---
app.listen(PORT, async () => {
  await ensureTables();
  console.log(`API running on http://0.0.0.0:${PORT}`);
});
