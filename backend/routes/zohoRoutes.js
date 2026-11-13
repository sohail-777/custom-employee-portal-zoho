const router = require('express').Router();
const jwt = require('jsonwebtoken');
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const { audit } = require('../services/accessService');
const zoho = require('../services/zohoService');

const CLIENT = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Zoho redirects the browser here (no Authorization header) - the signed `state` proves who started the flow
router.get('/callback', async (req, res) => {
  try {
    const p = jwt.verify(String(req.query.state), process.env.JWT_SECRET);
    if (p.purpose !== 'zoho' || req.query.error || !req.query.code) throw new Error(req.query.error || 'bad callback');
    await zoho.exchangeAndStore(req.query.code, p.uid);
    await audit(p.uid, 'Connected Zoho account (OAuth)');
    res.redirect(`${CLIENT()}/admin?zoho=connected`);
  } catch (e) { console.error('Zoho callback error:', e.message); res.redirect(`${CLIENT()}/admin?zoho=error`); }
});

router.use(auth);

router.get('/status', need('connect_zoho'), async (req, res) => res.json(await zoho.status()));

router.get('/connect', need('connect_zoho'), (req, res) => {
  if (!zoho.oauthConfigured()) return res.status(400).json({ message: 'Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in backend/.env first' });
  const state = jwt.sign({ purpose: 'zoho', uid: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.json({ url: zoho.authorizationUrl(state) });
});

router.delete('/connect', need('connect_zoho'), async (req, res) => {
  await zoho.disconnect();
  await audit(req.user.id, 'Disconnected Zoho account');
  res.json({ message: 'Disconnected' });
});

router.get('/:key/resource', async (req, res) => {
  const app = zoho.APPLICATIONS[req.params.key];
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (!req.user.permissions.includes(app.permission)) {
    await audit(req.user.id, `Unauthorized Zoho API attempt: ${app.name}`, 'DENIED');
    return res.status(403).json({ message: `Forbidden: you are not allowed to access ${app.name}` });
  }
  try {
    const result = await zoho.fetchResource(app.key, req.query.path || '');
    await audit(req.user.id, `Zoho API request: ${app.name}`);
    res.json(result);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

module.exports = router;
