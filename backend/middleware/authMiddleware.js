const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getAccess } = require('../services/accessService');

// Verifies JWT, rejects revoked/expired tokens and inactive users, attaches req.user
module.exports = async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose || !payload.jti) return res.status(401).json({ message: 'Invalid token' }); // MFA/SSO/Zoho state tokens are not sessions
    const [revoked] = await db.query('SELECT 1 FROM revoked_tokens WHERE jti = ?', [payload.jti]);
    if (revoked.length) return res.status(401).json({ message: 'Session has been logged out' });
    const [rows] = await db.query('SELECT id, name, email, department, status, mfa_enabled FROM users WHERE id = ?', [payload.id]);
    if (!rows[0] || rows[0].status !== 'Active') return res.status(401).json({ message: 'Account unavailable' });
    req.user = { ...rows[0], ...(await getAccess(payload.id)) };
    req.token = { jti: payload.jti, exp: payload.exp };
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
