// End-to-end smoke test. Start the API first (npm start), then run:  npm test
// WARNING: run against a freshly seeded database (npm run seed).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert');
const db = require('../config/database');
const totp = require('../services/totpService');
const { decrypt } = require('../services/cryptoService');
const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

let passed = 0;
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const ok = (name, cond) => { assert.ok(cond, `FAILED: ${name}`); passed++; console.log('  ✓', name); };
const login = async (email, pw) => (await call('POST', '/auth/login', { email, password: pw })).data;

(async () => {
  console.log('Authentication & RBAC');
  const users = { admin: ['admin@test.com', 'Admin@123', []], rahul: ['rahul@test.com', 'Rahul@123', ['people']], amit: ['amit@test.com', 'Amit@123', ['crm']],
    priya: ['priya@test.com', 'Priya@123', ['desk']], john: ['john@test.com', 'John@123', ['books']], meera: ['meera@test.com', 'Meera@123', []] };
  const s = {};
  for (const [k, [e, p, apps]] of Object.entries(users)) {
    s[k] = await login(e, p);
    const d = await call('GET', '/dashboard', null, s[k].token);
    const got = d.data.applications.map((a) => a.key).sort().join(',');
    const want = (k === 'admin' ? ['people', 'crm', 'desk', 'books'] : apps).sort().join(',');
    ok(`${k} sees apps [${want}]`, got === want);
  }
  ok('wrong password -> 401', (await call('POST', '/auth/login', { email: 'rahul@test.com', password: 'x' })).status === 401);
  ok('unknown email -> 401', (await call('POST', '/auth/login', { email: 'no@test.com', password: 'x' })).status === 401);
  ok('missing credentials -> 400', (await call('POST', '/auth/login', {})).status === 400);
  ok('password never returned', !JSON.stringify(s.rahul).includes('password'));
  ok('no token -> 401', (await call('GET', '/dashboard')).status === 401);
  ok('HR opens Zoho People -> 200', (await call('POST', '/applications/people/access', null, s.rahul.token)).status === 200);
  ok('HR opens Zoho CRM -> 403', (await call('POST', '/applications/crm/access', null, s.rahul.token)).status === 403);
  ok('HR GET /users -> 403', (await call('GET', '/users', null, s.rahul.token)).status === 403);
  ok('HR GET /audit-logs -> 403', (await call('GET', '/audit-logs', null, s.rahul.token)).status === 403);
  const logs = (await call('GET', '/audit-logs', null, s.admin.token)).data.logs;
  ok('unauthorized attempts audited', logs.some((l) => l.status === 'DENIED' && l.action.includes('Zoho CRM')));

  console.log('Admin: users, roles, departments');
  ok('admin lists users', (await call('GET', '/users', null, s.admin.token)).data.users.length >= 6);
  const roles = (await call('GET', '/roles', null, s.admin.token)).data.roles;
  const perms = (await call('GET', '/roles/permissions', null, s.admin.token)).data.permissions;
  const role = (n) => roles.find((r) => r.name === n);
  const perm = (n) => perms.find((p) => p.name === n).id;
  const c = await call('POST', '/users', { name: 'Test User', email: 'test.user@test.com', password: 'Secret1!', department: 'QA', roleIds: [role('Sales').id] }, s.admin.token);
  ok('admin creates user', c.status === 201);
  ok('duplicate email -> 409', (await call('POST', '/users', { name: 'X', email: 'test.user@test.com', password: 'Secret1!' }, s.admin.token)).status === 409);
  ok('new user can log in', !!(await login('test.user@test.com', 'Secret1!')).token);
  ok('admin cannot change own role', (await call('PUT', `/users/${s.admin.user.id}`, { roleIds: [] }, s.admin.token)).status === 403);
  ok('admin cannot edit Admin permissions', (await call('PUT', `/roles/${role('Admin').id}/permissions`, { permissionIds: [] }, s.admin.token)).status === 403);
  ok('admin creates role', (await call('POST', '/roles', { role_name: 'Auditor', permissionIds: [perm('view_audit_logs')] }, s.admin.token)).status === 201);
  ok('manager role gets Zoho Books', (await call('PUT', `/roles/${role('Manager').id}/permissions`, { permissionIds: [perm('view_zoho_books')] }, s.admin.token)).status === 200);
  ok('permission change is immediate', (await call('POST', '/applications/books/access', null, s.meera.token)).status === 200);
  await call('PUT', `/roles/${role('Manager').id}/permissions`, { permissionIds: [] }, s.admin.token);
  ok('department-level grant', (await call('PUT', '/departments/Operations/permissions', { permissionIds: [perm('view_zoho_desk')] }, s.admin.token)).status === 200
    && (await call('POST', '/applications/desk/access', null, s.meera.token)).status === 200);
  await call('PUT', '/departments/Operations/permissions', { permissionIds: [] }, s.admin.token);
  ok('department grant removed', (await call('POST', '/applications/desk/access', null, s.meera.token)).status === 403);
  ok('non-admin cannot manage departments', (await call('GET', '/departments', null, s.rahul.token)).status === 403);

  console.log('Provisioning & deprovisioning');
  const b = await call('POST', '/users/bulk', { users: [{ name: 'Bulk One', email: 'bulk1@test.com', department: 'Ops', role: 'HR' }, { name: 'Bad', email: 'bad@test.com', role: 'Nope' }] }, s.admin.token);
  ok('bulk import (1 created, 1 failed)', b.data.results[0].status === 'created' && b.data.results[1].status === 'failed');
  ok('bulk-generated password works', !!(await login('bulk1@test.com', b.data.results[0].password)).token);
  process.env.DEPROVISION_INACTIVE_DAYS = '30';
  await db.query("UPDATE users SET last_login = DATE_SUB(NOW(), INTERVAL 60 DAY) WHERE email IN ('priya@test.com','admin@test.com')");
  ok('auto-deprovision runs', (await require('../services/provisioningService').run()) >= 1);
  ok('deprovisioned user blocked', (await call('POST', '/auth/login', { email: 'priya@test.com', password: 'Priya@123' })).status === 403);
  ok('old session of deprovisioned user rejected', (await call('GET', '/dashboard', null, s.priya.token)).status === 401);
  ok('admins are never auto-deprovisioned', (await call('GET', '/dashboard', null, s.admin.token)).status === 200);

  console.log('Refresh-token rotation');
  const r1 = (await call('POST', '/auth/refresh', { refreshToken: s.rahul.refreshToken })).data;
  ok('refresh returns new token pair', r1.token && r1.refreshToken && r1.refreshToken !== s.rahul.refreshToken);
  ok('reused old refresh token -> 401', (await call('POST', '/auth/refresh', { refreshToken: s.rahul.refreshToken })).status === 401);
  ok('reuse revokes whole session family', (await call('POST', '/auth/refresh', { refreshToken: r1.refreshToken })).status === 401);

  console.log('MFA (TOTP)');
  const j = await login('john@test.com', 'John@123');
  const setup = await call('POST', '/auth/mfa/setup', null, j.token);
  ok('MFA setup returns secret + QR', setup.data.secret && setup.data.qr.startsWith('data:image/png'));
  ok('enable with wrong code -> 400', (await call('POST', '/auth/mfa/enable', { code: '000000' }, j.token)).status === 400);
  ok('enable with valid code', (await call('POST', '/auth/mfa/enable', { code: totp.currentCode(setup.data.secret) }, j.token)).status === 200);
  const step1 = await login('john@test.com', 'John@123');
  ok('login now requires MFA (no session yet)', step1.mfaRequired && !step1.token);
  ok('MFA token is not a session', (await call('GET', '/dashboard', null, step1.mfaToken)).status === 401);
  ok('wrong MFA code -> 401', (await call('POST', '/auth/mfa/verify', { mfaToken: step1.mfaToken, code: '123456' })).status === 401);
  const v = await call('POST', '/auth/mfa/verify', { mfaToken: step1.mfaToken, code: totp.currentCode(setup.data.secret) });
  ok('valid MFA code -> session', v.status === 200 && !!v.data.token);
  ok('MFA disable', (await call('POST', '/auth/mfa/disable', { password: 'John@123', code: totp.currentCode(setup.data.secret) }, v.data.token)).status === 200);

  console.log('Logout, Zoho, live activity');
  const lo = await login('amit@test.com', 'Amit@123');
  await call('POST', '/auth/logout', { refreshToken: lo.refreshToken }, lo.token);
  ok('token rejected after logout', (await call('GET', '/dashboard', null, lo.token)).status === 401);
  ok('refresh token dead after logout', (await call('POST', '/auth/refresh', { refreshToken: lo.refreshToken })).status === 401);
  ok('Zoho status (admin)', (await call('GET', '/zoho/status', null, s.admin.token)).data.connected === false);
  ok('Zoho connect without credentials -> 400', (await call('GET', '/zoho/connect', null, s.admin.token)).status === 400);
  ok('Zoho demo resource for permitted app', (await call('GET', '/zoho/people/resource?path=forms', null, s.rahul.token)).data.mode === 'demo');
  ok('Zoho resource denied for other app', (await call('GET', '/zoho/crm/resource', null, s.rahul.token)).status === 403);
  ok('Zoho path traversal rejected', (await call('GET', '/zoho/people/resource?path=../x', null, s.rahul.token)).status === 400);
  ok('Zoho status denied for non-admin', (await call('GET', '/zoho/status', null, s.rahul.token)).status === 403);
  const ctrl = new AbortController();
  const sse = await fetch(`${BASE}/activity/stream`, { headers: { Authorization: `Bearer ${s.admin.token}` }, signal: ctrl.signal });
  const chunk = new TextDecoder().decode((await sse.body.getReader().read()).value);
  ctrl.abort();
  ok('live activity stream sends events', sse.status === 200 && chunk.startsWith('data: '));
  ok('live activity denied for non-admin', (await call('GET', '/activity/stream', null, s.rahul.token)).status === 403);
  ok('SSO disabled by default', (await call('GET', '/auth/sso/config')).data.enabled === false);

  console.log(`\nAll ${passed} checks passed.`);
  process.exit(0);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
