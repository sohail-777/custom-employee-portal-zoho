import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Security from './pages/Security.jsx';
import { get, post, getToken, getRefreshToken, setTokens, clearToken } from './services/api.js';

export const ADMIN_PERMS = ['view_users', 'view_roles', 'manage_roles', 'view_audit_logs', 'view_activity', 'manage_departments', 'connect_zoho'];

function SsoCallback({ onTokens }) {
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    if (p.get('token') && p.get('refresh')) onTokens(p.get('token'), p.get('refresh'));
    else window.location.replace('/login?error=SSO%20sign-in%20failed');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <p className="center-msg">Signing you in…</p>;
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const loadMe = () => get('/auth/me').then(setAuth);
  useEffect(() => {
    if (!getToken()) return;
    loadMe().catch(() => clearToken()).finally(() => setLoading(false));
  }, []);

  const onLogin = (d) => { setTokens(d.token, d.refreshToken); setAuth({ user: d.user, roles: d.roles, permissions: d.permissions }); };
  const onSsoTokens = (t, r) => { setTokens(t, r); loadMe().catch(() => clearToken()); };
  const logout = async () => {
    try { await post('/auth/logout', { refreshToken: getRefreshToken() }); } catch { /* ignore */ }
    clearToken(); setAuth(null);
  };

  if (loading) return <p className="center-msg">Loading…</p>;
  const isAdmin = auth?.permissions.some((p) => ADMIN_PERMS.includes(p));

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={auth ? <Navigate to="/" /> : <Login onLogin={onLogin} />} />
        <Route path="/sso-callback" element={auth ? <Navigate to="/" /> : <SsoCallback onTokens={onSsoTokens} />} />
        <Route path="/*" element={!auth ? <Navigate to="/login" /> : (
          <div className="layout">
            <Sidebar auth={auth} isAdmin={isAdmin} onLogout={logout} />
            <main className="content">
              <Routes>
                <Route path="/" element={<EmployeeDashboard />} />
                <Route path="/security" element={<Security auth={auth} reload={loadMe} />} />
                <Route path="/admin" element={isAdmin ? <AdminDashboard auth={auth} /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        )} />
      </Routes>
    </BrowserRouter>
  );
}
