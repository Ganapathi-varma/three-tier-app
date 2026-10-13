// JWT helpers and the authentication middleware.
const jwt = require('jsonwebtoken');

// In production this MUST come from a secret, never hard-coded.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Express middleware that protects routes.
// Expects an "Authorization: Bearer <token>" header.
function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const parts = header.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    req.user = decoded; // attach user info for downstream handlers
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signToken, authenticate, JWT_SECRET };
