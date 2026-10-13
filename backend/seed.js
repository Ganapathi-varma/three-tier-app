// Ensures a demo user exists so you can log in immediately.
// Runs once at backend startup. The password is hashed with bcrypt here,
// which is why we don't put the user in init.sql.
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEMO_USER = process.env.DEMO_USER || 'admin';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'password123';

async function seedDemoUser() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  // Insert only if the username is not already present.
  await db.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO NOTHING`,
    [DEMO_USER, hash]
  );
  console.log(`Demo user ensured: "${DEMO_USER}"`);
}

module.exports = { seedDemoUser };
