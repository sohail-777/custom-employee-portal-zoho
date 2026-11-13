// Enterprise SSO via OpenID Connect (authorization-code flow). Works with Okta, Azure AD/Entra, Google Workspace,
// Zoho Directory (OIDC), Keycloak, etc. Users are matched by verified email; optional just-in-time provisioning.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { audit } = require('../services/accessService');
const { issueSession } = require('./authController');

const cfg = () => ({
  issuer: process.env.OIDC_ISSUER, clientId: process.env.OIDC_CLIENT_ID, secret: process.env.OIDC_CLIENT_SECRET,
  redirect: process.env.OIDC_REDIRECT_URI || 'http://localhost:5000/api/auth/sso/callback',
});
const enabled = () => { const c = cfg(); return !!(c.issuer && c.clientId && c.secret); };
const CLIENT = () => process.env.CLIENT_URL || 'http://localhost:5173';
const back = (res, msg) => res.redirect(`${CLIENT()}/login?error=${encodeURIComponent(msg)}`);

let disco = null;
async function discovery() {
  if (!disco) {
    const r = await fetch(`${cfg().issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!r.ok) throw new Error('OIDC discovery failed');
    disco = await r.json();
  }
  return disco;
}

exports.config = (req, res) => res.json({ enabled: enabled() });

exports.login = async (req, res) => {
  if (!enabled()) return res.status(404).json({ message: 'SSO is not configured' });
  try {
    const d = await discovery();
    const state = jwt.sign({ purpose: 'sso', n: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const u = new URL(d.authorization_endpoint);
    u.search = new URLSearchParams({ response_type: 'code', client_id: cfg().clientId, redirect_uri: cfg().redirect, scope: 'openid email profile', state }).toString();
    res.redirect(u.toString());
  } catch (e) { console.error(e.message); back(res, 'SSO is unavailable right now'); }
};

exports.callback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (jwt.verify(state, process.env.JWT_SECRET).purpose !== 'sso') throw new Error('bad state');
    const d = await discovery();
    const tr = await fetch(d.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg().redirect, client_id: cfg().clientId, client_secret: cfg().secret }),
    });
    const t = await tr.json();
    if (!t.access_token) throw new Error('token exchange failed');
    const info = await (await fetch(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    const email = String(info.email || '').toLowerCase();
    if (!email || info.email_verified === false) throw new Error('identity provider returned no verified email');

    let [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows[0]) {
      if (process.env.SSO_AUTO_PROVISION !== 'true') {
        await audit(null, `SSO login rejected (no portal account): ${email}`, 'DENIED');
        return back(res, 'No portal account exists for your identity. Contact an administrator.');
      }
      const [ins] = await db.query("INSERT INTO users (name, email, password, department, auth_source) VALUES (?,?,?,?, 'sso')",
        [info.name || email, email, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), info.department || '']);
      if (process.env.SSO_DEFAULT_ROLE) {
        const [r] = await db.query('SELECT id FROM roles WHERE role_name = ?', [process.env.SSO_DEFAULT_ROLE]);
        if (r[0]) await db.query('INSERT INTO user_roles VALUES (?, ?)', [ins.insertId, r[0].id]);
      }
      await audit(ins.insertId, `Auto-provisioned via SSO: ${email}`);
      [rows] = await db.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
    }
    const user = rows[0];
    if (user.status !== 'Active') {
      await audit(user.id, 'SSO login blocked (inactive account)', 'DENIED');
      return back(res, 'Access denied: your account is inactive');
    }
    const s = await issueSession(user);
    await audit(user.id, 'Login (SSO)');
    res.redirect(`${CLIENT()}/sso-callback#token=${s.token}&refresh=${s.refreshToken}`);
  } catch (e) { console.error('SSO callback error:', e.message); back(res, 'SSO sign-in failed'); }
};
