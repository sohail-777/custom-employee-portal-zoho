# Custom Employee Portal with Zoho One Integration

## Project overview
A centralized employee portal. Employees sign in with portal credentials (not Zoho credentials) and see only the Zoho applications their role (and department) allows. All authorization is enforced by the backend (JWT + RBAC middleware); the React UI only renders what the API returns.

## Technology stack
React 18 (Vite) · Node.js 18+ · Express · MySQL (mysql2) · JWT · bcryptjs · TOTP MFA (built in) · OpenID Connect SSO · Zoho OAuth 2.0 · Server-Sent Events

## Features implemented

**Must-have**
- Login page, Express API, MySQL, users/roles/permissions tables, seeded sample accounts
- JWT authentication, bcrypt password hashing, logout (server-side revocation)
- RBAC middleware (401 unauthenticated / 403 forbidden), backend-validated application access
- Employee dashboard with role-based Zoho application cards (HR, Sales, Support, Finance)

**Good-to-have**
- Admin dashboard: add/edit/deactivate users, role assignment, create roles, edit role permissions
- Audit logging (logins, failures, logout, user/role/permission changes, app access, unauthorized attempts)
- Session expiration, responsive UI (light + dark)
- Zoho OAuth 2.0 and API proxy

**Advanced**
| Feature | How it works |
|---|---|
| Refresh-token rotation | 15-min access JWT + 7-day refresh token. Each refresh issues a new pair and invalidates the old one. Reusing an old token revokes the whole session ("family"). Only SHA-256 hashes are stored. |
| Full Zoho OAuth | Admin > Zoho connection > Connect runs the authorization-code flow (`/api/zoho/connect` -> `/api/zoho/callback`). Tokens are AES-256-GCM encrypted in MySQL, refreshed automatically, never sent to the browser. |
| Enterprise SSO | OpenID Connect authorization-code flow (Okta, Azure AD/Entra, Google Workspace, Keycloak, Zoho Directory...). Matches users by verified email; optional just-in-time provisioning. |
| Multi-factor auth | TOTP (RFC 6238, Google/Microsoft Authenticator). Enable under **Security**. Login becomes a two-step flow. |
| Fine-grained API permissions | 14 permissions, e.g. `view_users`, `create_users`, `edit_users`, `delete_users`, `view_roles`, `manage_roles`, `view_activity`, `connect_zoho`. Every endpoint requires its specific permission. |
| Real-time activity monitoring | Admin > Live activity streams audit events over Server-Sent Events (`GET /api/activity/stream`). |
| Department-level access | Admin > Departments grants permissions to everyone in a department, added to role permissions. |
| Automated provisioning / deprovisioning | Bulk import (UI + `POST /api/users/bulk`), SSO just-in-time provisioning, and a background job that deactivates non-admin users inactive for `DEPROVISION_INACTIVE_DAYS` days and revokes their sessions. |

Safety rules: users cannot change their own role/status/department permissions, the Admin role's permissions are locked, logins are rate-limited (10 failures / 15 min).

## Database design
`users`, `roles`, `permissions`, `user_roles` (many-to-many), `role_permissions` (many-to-many), `department_permissions`, `audit_logs`, `revoked_tokens` (logged-out access tokens), `refresh_tokens`, `zoho_tokens`.
Effective permissions = role permissions UNION department permissions. Schema: `backend/database/schema.sql`. Seed: `backend/database/seed.js`.

## Installation
Requirements: Node.js 18+ and MySQL 8 (or MariaDB 10.5+) running locally.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env      # edit DB_PASSWORD and set a long random JWT_SECRET
npm run seed              # creates the database, tables, demo users (re-running resets all data)
npm start                 # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Run the automated checks (API must be running, database freshly seeded):
```bash
cd backend && npm test    # 56 end-to-end checks
```

## Demo credentials (local testing only)
| Role | Email | Password |
|---|---|---|
| Admin | admin@test.com | Admin@123 |
| HR | rahul@test.com | Rahul@123 |
| Sales | amit@test.com | Amit@123 |
| Support | priya@test.com | Priya@123 |
| Finance | john@test.com | John@123 |
| Manager (no apps by default) | meera@test.com | Meera@123 |

## Configuring Zoho (optional)
1. Open the Zoho API Console for your data centre (https://api-console.zoho.com, or `.in`, `.eu`...) and create a **Server-based Application**.
2. Set the redirect URI to `http://localhost:5000/api/zoho/callback`.
3. In `backend/.env` set `ZOHO_DC` (`in` for India accounts), `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_SCOPES`; restart the API.
4. Sign in as Admin > Administration > Zoho connection > **Connect Zoho** and approve.
5. Test: `GET /api/zoho/people/resource?path=forms` (as an HR user) returns live data; without a connection it returns a labelled demo response.

Zoho Desk calls usually also need an `orgId` header, and scope names differ per product; adjust `ZOHO_SCOPES` and `services/zohoService.js` for the endpoints you use.

**Important:** "Open app" opens public Zoho URLs. Employees may still need to sign in to Zoho themselves unless SSO is configured in your Zoho organization. The portal OAuth connection is a single backend account used for API proxying; it does not create individual Zoho sessions.

## Configuring SSO (optional)
Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` in `backend/.env` and register `http://localhost:5000/api/auth/sso/callback` as the redirect URI at your identity provider. A "Sign in with company SSO" button then appears. Set `SSO_AUTO_PROVISION=true` and `SSO_DEFAULT_ROLE=<role>` for just-in-time account creation. The SSO flow is implemented but needs a real identity provider to test.

## API
| Method | Endpoint | Purpose | Permission |
|---|---|---|---|
| POST | /api/auth/login | Login (may return `mfaRequired`) | public |
| POST | /api/auth/mfa/verify | Second login step | MFA token |
| POST | /api/auth/refresh | Rotate refresh token | refresh token |
| POST | /api/auth/logout | Logout, revoke session | logged in |
| GET | /api/auth/me | Current user | logged in |
| POST | /api/auth/mfa/setup, /enable, /disable | Manage own MFA | logged in |
| GET | /api/auth/sso/config, /sso/login, /sso/callback | OIDC SSO | public |
| GET | /api/dashboard, /api/applications | Authorized apps | logged in |
| POST | /api/applications/:key/access | Validate + audit app access | app permission |
| GET | /api/zoho/:key/resource?path= | Zoho API proxy | app permission |
| GET/DELETE | /api/zoho/status, /connect | Zoho OAuth connection | connect_zoho |
| GET/POST | /api/users | List / create | view_users / create_users |
| POST | /api/users/bulk | Bulk provision | create_users |
| PUT/DELETE | /api/users/:id | Update / deactivate | edit_users / delete_users |
| GET/POST | /api/roles | List / create | view_roles / manage_roles |
| GET | /api/roles/permissions | List permissions | view_roles |
| PUT | /api/roles/:id, /:id/permissions | Rename / set permissions | manage_roles |
| GET/PUT | /api/departments, /:name/permissions | Department access | manage_departments |
| GET | /api/audit-logs | Audit logs | view_audit_logs |
| GET | /api/activity/stream | Live activity (SSE) | view_activity |

## Production notes
Serve over HTTPS; use a strong `JWT_SECRET` and `TOKEN_ENC_KEY`; store tokens in HttpOnly cookies with CSRF protection instead of `localStorage` (this prototype uses `localStorage` for simplicity); put the login rate limiter in a shared store (Redis) when running multiple instances; verify the OIDC ID token signature if you extend SSO beyond the userinfo lookup.
