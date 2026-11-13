const { EventEmitter } = require('events');
const db = require('../config/database');

const bus = new EventEmitter(); // feeds the real-time activity stream
bus.setMaxListeners(100);

// Effective permissions = role permissions + department-level permissions (fresh from DB on every request)
async function getAccess(userId) {
  const [roles] = await db.query(
    'SELECT r.id, r.role_name AS name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?', [userId]);
  const [perms] = await db.query(
    `SELECT p.permission_name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id WHERE ur.user_id = ?
     UNION
     SELECT p.permission_name FROM permissions p
       JOIN department_permissions dp ON dp.permission_id = p.id
       JOIN users u ON u.department = dp.department WHERE u.id = ?`, [userId, userId]);
  return { roles, permissions: perms.map((p) => p.permission_name) };
}

async function audit(userId, action, status = 'SUCCESS') {
  try {
    const [r] = await db.query('INSERT INTO audit_logs (user_id, action, status) VALUES (?,?,?)', [userId || null, action, status]);
    let name = 'Unknown';
    if (userId) { const [u] = await db.query('SELECT name FROM users WHERE id = ?', [userId]); name = u[0]?.name || 'Unknown'; }
    bus.emit('activity', { id: r.insertId, user_name: name, action, status, timestamp: new Date().toISOString() });
  } catch (e) { console.error('Audit log failed:', e.message); }
}

const revokeUserSessions = (userId) => db.query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);

module.exports = { getAccess, audit, revokeUserSessions, bus };
