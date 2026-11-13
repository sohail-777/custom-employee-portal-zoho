const db = require('../config/database');
const { audit } = require('../services/accessService');

const fail = (res, e) => { console.error(e); res.status(500).json({ message: 'Internal server error' }); };

exports.list = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT id, role_name AS name FROM roles ORDER BY id');
    const [rp] = await db.query('SELECT role_id, permission_id FROM role_permissions');
    res.json({ roles: roles.map((r) => ({ ...r, permissionIds: rp.filter((x) => x.role_id === r.id).map((x) => x.permission_id) })) });
  } catch (e) { fail(res, e); }
};

exports.permissions = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, permission_name AS name FROM permissions ORDER BY id');
    res.json({ permissions: rows });
  } catch (e) { fail(res, e); }
};

async function setPermissions(roleId, ids) {
  await db.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  for (const pid of ids) await db.query('INSERT IGNORE INTO role_permissions VALUES (?, ?)', [roleId, pid]);
}

exports.create = async (req, res) => {
  try {
    const { role_name, permissionIds = [] } = req.body || {};
    if (!role_name || !role_name.trim()) return res.status(400).json({ message: 'Role name is required' });
    const [r] = await db.query('INSERT INTO roles (role_name) VALUES (?)', [role_name.trim()]);
    await setPermissions(r.insertId, permissionIds);
    await audit(req.user.id, `Created role ${role_name.trim()}`);
    res.status(201).json({ message: 'Role created', id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Role already exists' });
    fail(res, e);
  }
};

exports.update = async (req, res) => {
  try {
    const { role_name } = req.body || {};
    if (!role_name || !role_name.trim()) return res.status(400).json({ message: 'Role name is required' });
    const [r] = await db.query('UPDATE roles SET role_name = ? WHERE id = ?', [role_name.trim(), req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Role not found' });
    await audit(req.user.id, `Renamed role id ${req.params.id} to ${role_name.trim()}`);
    res.json({ message: 'Role updated' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Role already exists' });
    fail(res, e);
  }
};

exports.updatePermissions = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { permissionIds } = req.body || {};
    if (!Array.isArray(permissionIds)) return res.status(400).json({ message: 'permissionIds must be an array' });
    const [rows] = await db.query('SELECT role_name FROM roles WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Role not found' });
    // Prevent lock-out and self-escalation
    if (rows[0].role_name === 'Admin' || req.user.roles.some((r) => r.id === id)) {
      await audit(req.user.id, `Blocked permission change on role ${rows[0].role_name}`, 'DENIED');
      return res.status(403).json({ message: 'You cannot change permissions of Admin or of a role you hold' });
    }
    await setPermissions(id, permissionIds);
    await audit(req.user.id, `Updated permissions of role ${rows[0].role_name}`);
    res.json({ message: 'Permissions updated' });
  } catch (e) { fail(res, e); }
};
