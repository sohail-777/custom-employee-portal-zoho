import { useState } from 'react';
import { post } from '../services/api.js';

export default function Security({ auth, reload }) {
  const enabled = auth.user.mfaEnabled;
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const say = (text, bad = false) => setMsg({ text, bad });

  const start = async () => { try { setSetup(await post('/auth/mfa/setup')); say(''); } catch (e) { say(e.message, true); } };
  const enable = async (e) => {
    e.preventDefault();
    try { await post('/auth/mfa/enable', { code }); setSetup(null); setCode(''); say('Two-factor authentication is on.'); reload(); }
    catch (err) { say(err.message, true); }
  };
  const disable = async (e) => {
    e.preventDefault();
    try { await post('/auth/mfa/disable', { password, code }); setPassword(''); setCode(''); say('Two-factor authentication is off.'); reload(); }
    catch (err) { say(err.message, true); }
  };

  return (
    <>
      <h1>Security</h1>
      {msg.text && <div className={`alert ${msg.bad ? '' : 'info'}`} role="status">{msg.text}</div>}
      <section className="card">
        <h3>Two-factor authentication</h3>
        <p className="muted">Status: <strong>{enabled ? 'On' : 'Off'}</strong>. Use an authenticator app such as Google Authenticator or Microsoft Authenticator.</p>
        {!enabled && !setup && <button className="btn" onClick={start}>Set up two-factor authentication</button>}
        {!enabled && setup && (
          <form onSubmit={enable} className="stack">
            <p>Scan this QR code, then enter the 6-digit code it shows.</p>
            <img src={setup.qr} alt="Authenticator QR code" width="180" height="180" />
            <p className="muted small">Cannot scan? Enter this key manually: <code>{setup.secret}</code></p>
            <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <div><button className="btn">Turn on</button></div>
          </form>
        )}
        {enabled && (
          <form onSubmit={disable} className="stack">
            <input type="password" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <div><button className="btn ghost">Turn off</button></div>
          </form>
        )}
      </section>
    </>
  );
}
