// Automated deprovisioning: deactivates non-admin accounts that have not signed in for N days.
const db = require('../config/database');
const { audit, revokeUserSessions } = require('./accessService');

async function run() {
  const days = Number(process.env.DEPROVISION_INACTIVE_DAYS || 0);
  if (!days) return 0;
  const [rows] = await db.query(
    `SELECT u.id, u.email FROM users u
     WHERE u.status = 'Active' AND COALESCE(u.last_login, u.created_at) < DATE_SUB(NOW(), INTERVAL ? DAY)
       AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.role_name = 'Admin')`, [days]);
  for (const u of rows) {
    await db.query("UPDATE users SET status = 'Inactive' WHERE id = ?", [u.id]);
    await revokeUserSessions(u.id);
    await audit(u.id, `Auto-deprovisioned (inactive for ${days}+ days): ${u.email}`);
  }
  return rows.length;
}

function start() {
  if (!Number(process.env.DEPROVISION_INACTIVE_DAYS || 0)) return;
  const tick = () => run().catch((e) => console.error('Deprovision job failed:', e.message));
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
  console.log(`Auto-deprovisioning enabled (${process.env.DEPROVISION_INACTIVE_DAYS} days)`);
}

module.exports = { run, start };
