import { useEffect, useState } from 'react';
import { get, post } from '../services/api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(new URLSearchParams(window.location.search).get('error') || '');
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [sso, setSso] = useState(false);

  useEffect(() => { get('/auth/sso/config').then((d) => setSso(d.enabled)).catch(() => {}); }, []);

  const handle = (d) => { if (d.mfaRequired) setMfaToken(d.mfaToken); else onLogin(d); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mfaToken) {
      if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your authenticator app.');
      setBusy(true);
      try { onLogin(await post('/auth/mfa/verify', { mfaToken, code })); }
      catch (err) { setError(err.message); }
      finally { setBusy(false); }
      return;
    }
    if (!email.trim() || !password) return setError('Enter both your email and password.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    setBusy(true);
    try { handle(await post('/auth/login', { email, password })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} noValidate>
        <h1>Employee Portal</h1>
        {mfaToken ? (
          <>
            <p className="muted">Enter the 6-digit code from your authenticator app.</p>
            <label>Authentication code<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="one-time-code" /></label>
          </>
        ) : (
          <>
            <p className="muted">Sign in to open the applications assigned to your role.</p>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          </>
        )}
        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : mfaToken ? 'Verify code' : 'Sign in'}</button>
        {mfaToken && <button type="button" className="btn ghost" onClick={() => { setMfaToken(''); setCode(''); setError(''); }}>Back</button>}
        {sso && !mfaToken && <a className="btn ghost center" href="/api/auth/sso/login">Sign in with company SSO</a>}
      </form>
    </div>
  );
}
