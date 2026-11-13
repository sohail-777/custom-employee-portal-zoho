const db = require('../config/database');
const { audit } = require('../services/accessService');

exports.list = async (req, res) => {
  try {
    const [names] = await db.query(
      "SELECT DISTINCT department AS name FROM users WHERE department <> '' UNION SELECT DISTINCT department FROM department_permissions ORDER BY name");
    const [dp] = await db.query('SELECT department, permission_id FROM department_permissions');
    res.json({ departments: names.map((d) => ({ name: d.name, permissionIds: dp.filter((x) => x.department === d.name).map((x) => x.permission_id) })) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
};

exports.updatePermissions = async (req, res) => {
  try {
    const name = req.params.name;
    const { permissionIds } = req.body || {};
    if (!Array.isArray(permissionIds)) return res.status(400).json({ message: 'permissionIds must be an array' });
    if (name === req.user.department) { // no self-escalation
      await audit(req.user.id, `Blocked permission change on own department ${name}`, 'DENIED');
      return res.status(403).json({ message: 'You cannot change permissions of your own department' });
    }
    await db.query('DELETE FROM department_permissions WHERE department = ?', [name]);
    for (const pid of permissionIds) await db.query('INSERT IGNORE INTO department_permissions VALUES (?, ?)', [name, pid]);
    await audit(req.user.id, `Updated department permissions: ${name}`);
    res.json({ message: 'Department permissions updated' });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
};
