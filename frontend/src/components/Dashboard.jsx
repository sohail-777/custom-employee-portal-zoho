import { useEffect, useState } from 'react';
import { get, post } from '../services/api.js';
import ZohoCard from './ZohoCard.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => { get('/dashboard').then(setData).catch((e) => setError(e.message)); }, []);

  // Backend re-validates permission, then tells us where to go
  const openApp = async (app) => {
    setError(''); setBusyKey(app.key);
    try {
      const r = await post(`/applications/${app.key}/access`);
      window.open(r.application.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e.message); }
    finally { setBusyKey(''); }
  };

  if (error && !data) return <div className="alert">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;
  const roles = data.roles.map((r) => r.name).join(', ') || 'No role assigned';

  return (
    <>
      <h1>Welcome, {data.user.name}</h1>
      <section className="card profile">
        <div><span className="muted">Role</span><strong>{roles}</strong></div>
        <div><span className="muted">Department</span><strong>{data.user.department || '—'}</strong></div>
        <div><span className="muted">Email</span><strong>{data.user.email}</strong></div>
      </section>
      <h2>Your applications</h2>
      {error && <div className="alert" role="alert">{error}</div>}
      {data.applications.length === 0
        ? <p className="muted">No applications are assigned to your role yet. Ask an administrator for access.</p>
        : <div className="grid">{data.applications.map((a) => <ZohoCard key={a.key} app={a} onOpen={openApp} busy={busyKey === a.key} />)}</div>}
      <p className="muted small">These open public Zoho pages. You may need to sign in to Zoho separately unless SSO is configured.</p>
    </>
  );
}
