const bcrypt = require('bcryptjs');
const db = require('../config/database');
const crypto = require('crypto');
const { audit, revokeUserSessions } = require('../services/accessService');

const fail = (res, e) => { console.error(e); res.status(500).json({ message: 'Internal server error' }); };

async function setRoles(userId, roleIds) {
  await db.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  for (const rid of roleIds) await db.query('INSERT IGNORE INTO user_roles VALUES (?, ?)', [userId, rid]);
}

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.department, u.status, u.created_at,
              GROUP_CONCAT(r.id) AS role_ids, GROUP_CONCAT(r.role_name) AS role_names
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id ORDER BY u.id`);
    const users = rows.map(({ role_ids, role_names, ...u }) => {
      const ids = role_ids ? role_ids.split(',') : [];
      const names = role_names ? role_names.split(',') : [];
      return { ...u, roles: ids.map((id, i) => ({ id: Number(id), name: names[i] })) };
    });
    res.json({ users });
  } catch (e) { fail(res, e); }
};

exports.create = async (req, res) => {
  try {
    const { name, email, password, department = '', status = 'Active', roleIds = [] } = req.body || {};
    if (!name || !email || !password || password.length < 6)
      return res.status(400).json({ message: 'Name, email and a password of at least 6 characters are required' });
    const [r] = await db.query('INSERT INTO users (name, email, password, department, status) VALUES (?,?,?,?,?)',
      [name, email.trim().toLowerCase(), await bcrypt.hash(password, 10), department, status === 'Inactive' ? 'Inactive' : 'Active']);
    await setRoles(r.insertId, roleIds);
    await audit(req.user.id, `Created user ${email}`);
    if (roleIds.length) await audit(req.user.id, `Assigned roles [${roleIds}] to user ${email}`);
    res.status(201).json({ message: 'User created', id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email already exists' });
    fail(res, e);
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, password, department, status, roleIds } = req.body || {};
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    if (id === req.user.id && (roleIds !== undefined || status !== undefined)) {
      await audit(req.user.id, 'Attempted to change own role/status', 'DENIED');
      return res.status(403).json({ message: 'You cannot change your own role or status' });
    }
    if (password && password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const u = rows[0];
    await db.query('UPDATE users SET name=?, email=?, department=?, status=?, password=? WHERE id=?', [
      name ?? u.name, email ? email.trim().toLowerCase() : u.email, department ?? u.department,
      status === 'Inactive' ? 'Inactive' : status === 'Active' ? 'Active' : u.status,
      password ? await bcrypt.hash(password, 10) : u.password, id]);
    await audit(req.user.id, `Updated user ${u.email}`);
    if (status === 'Inactive') await revokeUserSessions(id);
    if (Array.isArray(roleIds)) {
      await setRoles(id, roleIds);
      await audit(req.user.id, `Assigned roles [${roleIds}] to user ${u.email}`);
    }
    res.json({ message: 'User updated' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email already exists' });
    fail(res, e);
  }
};

// "Delete" = deactivate, so audit history stays intact
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ message: 'You cannot deactivate your own account' });
    const [r] = await db.query("UPDATE users SET status = 'Inactive' WHERE id = ?", [id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'User not found' });
    await revokeUserSessions(id);
    await audit(req.user.id, `Deactivated user id ${id}`);
    res.json({ message: 'User deactivated' });
  } catch (e) { fail(res, e); }
};

// Bulk provisioning: [{name,email,department,role,password?}] - missing passwords are generated and returned once
exports.bulk = async (req, res) => {
  const list = req.body && req.body.users;
  if (!Array.isArray(list) || !list.length || list.length > 200) return res.status(400).json({ message: 'Provide 1-200 users' });
  try {
    const [roles] = await db.query('SELECT id, role_name FROM roles');
    const results = [];
    for (const row of list) {
      const email = String(row.email || '').trim().toLowerCase();
      try {
        if (!row.name || !email) throw new Error('name and email are required');
        const role = roles.find((r) => r.role_name.toLowerCase() === String(row.role || '').toLowerCase());
        if (row.role && !role) throw new Error(`unknown role "${row.role}"`);
        const pw = row.password || crypto.randomBytes(6).toString('hex');
        const [r] = await db.query('INSERT INTO users (name, email, password, department) VALUES (?,?,?,?)',
          [row.name, email, await bcrypt.hash(pw, 10), row.department || '']);
        if (role) await setRoles(r.insertId, [role.id]);
        await audit(req.user.id, `Bulk-provisioned user ${email}${role ? ` as ${role.role_name}` : ''}`);
        results.push({ email, status: 'created', password: row.password ? undefined : pw });
      } catch (e) {
        results.push({ email: row.email, status: 'failed', error: e.code === 'ER_DUP_ENTRY' ? 'already exists' : e.message });
      }
    }
    res.json({ results });
  } catch (e) { fail(res, e); }
};
