// Zoho integration module (OAuth 2.0 authorization-code flow + refresh tokens).
// Tokens are stored encrypted in the zoho_tokens table and never leave the backend.
// Without ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET the API proxy returns a labelled demo response.
const db = require('../config/database');
const { encrypt, decrypt } = require('./cryptoService');

const dc = () => process.env.ZOHO_DC || 'com';
const accountsUrl = () => `https://accounts.zoho.${dc()}`;
const apiHost = () => `https://www.zohoapis.${dc()}`;

const APPLICATIONS = {
  people: { key: 'people', name: 'Zoho People', description: 'Employee management', permission: 'view_zoho_people',
    url: 'https://www.zoho.com/people/', icon: '👥', apiBase: () => `https://people.zoho.${dc()}/people/api` },
  crm: { key: 'crm', name: 'Zoho CRM', description: 'Customer management', permission: 'view_zoho_crm',
    url: 'https://www.zoho.com/crm/', icon: '🤝', apiBase: () => `${apiHost()}/crm/v6` },
  desk: { key: 'desk', name: 'Zoho Desk', description: 'Ticket management', permission: 'view_zoho_desk',
    url: 'https://www.zoho.com/desk/', icon: '🎧', apiBase: () => `https://desk.zoho.${dc()}/api/v1` },
  books: { key: 'books', name: 'Zoho Books', description: 'Accounting', permission: 'view_zoho_books',
    url: 'https://www.zoho.com/books/', icon: '📒', apiBase: () => `${apiHost()}/books/v3` },
};
const publicApp = ({ key, name, description, url, icon }) => ({ key, name, description, url, icon });

const oauthConfigured = () => !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);

async function storedRow() {
  const [rows] = await db.query('SELECT *, (expires_at IS NOT NULL AND expires_at > DATE_ADD(NOW(), INTERVAL 60 SECOND)) AS fresh FROM zoho_tokens WHERE id = 1');
  return rows[0];
}

async function status() {
  const row = await storedRow();
  const env = !!process.env.ZOHO_REFRESH_TOKEN;
  return { oauthConfigured: oauthConfigured(), connected: oauthConfigured() && (!!row || env),
    source: row ? 'database' : env ? 'env' : null, connectedAt: row ? row.updated_at : null, dataCenter: dc() };
}

// Step 1: URL the admin is sent to so they can grant the integration access
function authorizationUrl(state) {
  const u = new URL(`${accountsUrl()}/oauth/v2/auth`);
  u.search = new URLSearchParams({
    scope: process.env.ZOHO_SCOPES || 'ZohoCRM.modules.READ', client_id: process.env.ZOHO_CLIENT_ID,
    response_type: 'code', access_type: 'offline', prompt: 'consent',
    redirect_uri: process.env.ZOHO_REDIRECT_URI, state,
  }).toString();
  return u.toString();
}

// Step 2: exchange the authorization code for access + refresh tokens and store them encrypted
async function exchangeAndStore(code, userId) {
  const res = await fetch(`${accountsUrl()}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({
    code, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET,
    redirect_uri: process.env.ZOHO_REDIRECT_URI, grant_type: 'authorization_code' }) });
  const t = await res.json();
  if (!t.refresh_token) throw new Error(t.error || 'Zoho did not return a refresh token');
  await db.query(
    'REPLACE INTO zoho_tokens (id, refresh_token, access_token, expires_at, connected_by) VALUES (1, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)',
    [encrypt(t.refresh_token), t.access_token ? encrypt(t.access_token) : null, t.expires_in || 3600, userId]);
}

async function disconnect() { await db.query('DELETE FROM zoho_tokens WHERE id = 1'); }

// Step 3: always hand out a valid access token, refreshing it when it has expired
let envCache = { token: null, exp: 0 };
async function getAccessToken() {
  const row = await storedRow();
  if (row?.fresh && row.access_token) return decrypt(row.access_token);
  if (!row && envCache.token && Date.now() < envCache.exp - 60000) return envCache.token;
  const refresh = row ? decrypt(row.refresh_token) : process.env.ZOHO_REFRESH_TOKEN;
  if (!refresh) throw new Error('Zoho is not connected');
  const res = await fetch(`${accountsUrl()}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({
    refresh_token: refresh, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, grant_type: 'refresh_token' }) });
  const t = await res.json();
  if (!t.access_token) throw new Error(t.error || 'Could not refresh Zoho access token');
  if (row) await db.query('UPDATE zoho_tokens SET access_token = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = 1', [encrypt(t.access_token), t.expires_in || 3600]);
  else envCache = { token: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 };
  return t.access_token;
}

// Backend proxy: the portal permission was already checked by the route
async function fetchResource(appKey, resourcePath = '') {
  const app = APPLICATIONS[appKey];
  if (!/^[A-Za-z0-9_\/-]*$/.test(resourcePath) || resourcePath.includes('..')) throw new Error('Invalid resource path');
  const url = `${app.apiBase()}/${resourcePath}`;
  const st = await status();
  if (!st.connected) {
    return { mode: 'demo', app: app.name, wouldCall: url,
      message: 'Zoho is not connected. Configure ZOHO_CLIENT_ID/SECRET and use Administration > Zoho connection to authorize.' };
  }
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await getAccessToken()}` } });
  return { mode: 'live', app: app.name, status: res.status, data: await res.json().catch(() => null) };
}

module.exports = { APPLICATIONS, publicApp, status, authorizationUrl, exchangeAndStore, disconnect, fetchResource, oauthConfigured };
