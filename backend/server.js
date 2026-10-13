// Three-tier learning app — Backend API
// Exposes JWT login and protected product CRUD endpoints.
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { signToken, authenticate } = require('./auth');
const { seedDemoUser } = require('./seed');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());            // allow the frontend (different origin) to call us
app.use(express.json());    // parse JSON request bodies

// ---------------------------------------------------------------------------
// Health check — used by docker-compose and Kubernetes probes.
// ---------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db-unavailable' });
  }
});

// ---------------------------------------------------------------------------
// Auth: POST /auth/login  ->  { token }
// Looks up the user, verifies the password hash, and returns a JWT.
// ---------------------------------------------------------------------------
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const result = await db.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ sub: user.id, username: user.username });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Products CRUD — every route below requires a valid JWT.
// ---------------------------------------------------------------------------

// CREATE
app.post('/products', authenticate, async (req, res) => {
  const { name, description, price } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO products (name, description, price)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, price, created_at`,
      [name, description || null, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create product error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ ALL
app.get('/products', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, price, created_at FROM products ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List products error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ ONE
app.get('/products/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, description, price, created_at FROM products WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE
app.put('/products/:id', authenticate, async (req, res) => {
  const { name, description, price } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'name and price are required' });
  }

  try {
    const result = await db.query(
      `UPDATE products
       SET name = $1, description = $2, price = $3
       WHERE id = $4
       RETURNING id, name, description, price, created_at`,
      [name, description || null, price, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE
app.delete('/products/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Startup: wait for the database, ensure the demo user exists, then listen.
// The DB container may still be initializing when we start, so we retry.
// ---------------------------------------------------------------------------
async function waitForDb(retries = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`Waiting for database (attempt ${attempt}/${retries})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Database did not become available in time');
}

async function start() {
  try {
    await waitForDb();
    await seedDemoUser();
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start();
