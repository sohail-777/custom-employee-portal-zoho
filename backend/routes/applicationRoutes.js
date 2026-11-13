// Dashboard, authorized applications, application access validation, Zoho proxy and audit logs.
const router = require('express').Router();
const db = require('../config/database');
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const { audit } = require('../services/accessService');
const zoho = require('../services/zohoService');

router.use(auth);

const allowedApps = (user) =>
  Object.values(zoho.APPLICATIONS).filter((a) => user.permissions.includes(a.permission)).map(zoho.publicApp);

router.get('/dashboard', (req, res) => {
  const { id, name, email, department } = req.user;
  res.json({ user: { id, name, email, department }, roles: req.user.roles,
    permissions: req.user.permissions, applications: allowedApps(req.user) });
});

router.get('/applications', (req, res) => res.json({ applications: allowedApps(req.user) }));

// Re-validates on the server before the frontend is told where to go
router.post('/applications/:key/access', async (req, res) => {
  const app = zoho.APPLICATIONS[req.params.key];
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (!req.user.permissions.includes(app.permission)) {
    await audit(req.user.id, `Unauthorized access attempt: ${app.name}`, 'DENIED');
    return res.status(403).json({ message: `Forbidden: you are not allowed to access ${app.name}` });
  }
  await audit(req.user.id, `Accessed ${app.name}`);
  res.json({ allowed: true, application: zoho.publicApp(app),
    note: 'This is a public Zoho URL. You may need to sign in to Zoho separately unless SSO is configured.' });
});

router.get('/audit-logs', need('view_audit_logs'), async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT a.id, COALESCE(u.name, 'Unknown') AS user_name, a.action, a.status, a.timestamp
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`);
    res.json({ logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
