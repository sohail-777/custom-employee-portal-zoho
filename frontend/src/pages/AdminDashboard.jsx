import { useEffect, useState } from 'react';
import { get, post, put, del, getToken } from '../services/api.js';

const has = (auth, p) => auth.permissions.includes(p);
const label = (s) => s.replace(/_/g, ' ');

const TABS = [
  ['users', 'Users', ['view_users']],
  ['roles', 'Roles and permissions', ['view_roles', 'manage_roles']],
  ['departments', 'Departments', ['manage_departments']],
  ['audit', 'Audit logs', ['view_audit_logs']],
  ['live', 'Live activity', ['view_activity']],
  ['zoho', 'Zoho connection', ['connect_zoho']],
];

export default function AdminDashboard({ auth }) {
  const tabs = TABS.filter((t) => t[2].some((p) => has(auth, p)));
  const [tab, setTab] = useState(new URLSearchParams(window.location.search).get('zoho') ? 'zoho' : tabs[0]?.[0]);
  return (
    <>
      <h1>Administration</h1>
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'users' && <UsersTab auth={auth} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'live' && <LiveTab />}
      {tab === 'zoho' && <ZohoTab />}
    </>
  );
}

const emptyForm = { name: '', email: '', password: '', department: '', status: 'Active', roleId: '' };

function UsersTab({ auth }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const isSelf = editId === auth.user.id;

  const load = () => {
    get('/users').then((d) => setUsers(d.users)).catch((e) => setMsg(e.message));
    get('/roles').then((d) => setRoles(d.roles)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    const body = { name: form.name, email: form.email, department: form.department };
    if (form.password) body.password = form.password;
    if (!isSelf) { body.status = form.status; body.roleIds = form.roleId ? [Number(form.roleId)] : []; }
    try {
      if (editId) await put(`/users/${editId}`, body); else await post('/users', body);
      setForm(emptyForm); setEditId(null); setMsg('User saved.'); load();
    } catch (err) { setMsg(err.message); }
  };
  const edit = (u) => { setEditId(u.id); setMsg(''); setForm({ name: u.name, email: u.email, password: '', department: u.department || '', status: u.status, roleId: u.roles[0]?.id || '' }); };
  const deactivate = async (u) => {
    if (!window.confirm(`Deactivate ${u.name}?`)) return;
    try { await del(`/users/${u.id}`); setMsg('User deactivated.'); load(); } catch (err) { setMsg(err.message); }
  };

  return (
    <>
      {msg && <div className="alert info">{msg}</div>}
      <form className="card form-row" onSubmit={submit}>
        <h3>{editId ? 'Edit employee' : 'Add employee'}</h3>
        <input placeholder="Name" value={form.name} onChange={set('name')} required />
        <input placeholder="Email" type="email" value={form.email} onChange={set('email')} required />
        <input placeholder={editId ? 'New password (optional)' : 'Password (min 6 characters)'} type="password" value={form.password} onChange={set('password')} required={!editId} />
        <input placeholder="Department" value={form.department} onChange={set('department')} />
        <select value={form.roleId} onChange={set('roleId')} disabled={isSelf}>
          <option value="">No role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={form.status} onChange={set('status')} disabled={isSelf}>
          <option>Active</option><option>Inactive</option>
        </select>
        <div>
          <button className="btn">{editId ? 'Save changes' : 'Add employee'}</button>{' '}
          {editId && <button type="button" className="btn ghost" onClick={() => { setEditId(null); setForm(emptyForm); }}>Cancel</button>}
        </div>
      </form>
      {has(auth, 'create_users') && <BulkImport onDone={load} />}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td><td>{u.department}</td>
                <td>{u.roles.map((r) => r.name).join(', ') || '—'}</td>
                <td><span className={`pill ${u.status === 'Active' ? 'ok' : 'off'}`}>{u.status}</span></td>
                <td className="actions">
                  {has(auth, 'edit_users') && <button className="link" onClick={() => edit(u)}>Edit</button>}
                  {has(auth, 'delete_users') && u.id !== auth.user.id && u.status === 'Active' && <button className="link danger" onClick={() => deactivate(u)}>Deactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [sel, setSel] = useState('');
  const [checked, setChecked] = useState([]);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const [r, p] = await Promise.all([get('/roles'), get('/roles/permissions')]);
      setRoles(r.roles); setPerms(p.permissions);
      return r.roles;
    } catch (e) { setMsg(e.message); return []; }
  };
  useEffect(() => { load(); }, []);

  const pick = (id) => { setSel(id); setMsg(''); setChecked(roles.find((r) => r.id === Number(id))?.permissionIds || []); };
  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const save = async () => {
    try { await put(`/roles/${sel}/permissions`, { permissionIds: checked }); await load(); setMsg('Permissions saved.'); }
    catch (e) { setMsg(e.message); }
  };
  const create = async (e) => {
    e.preventDefault();
    try { await post('/roles', { role_name: newName }); setNewName(''); await load(); setMsg('Role created.'); }
    catch (err) { setMsg(err.message); }
  };

  const apps = perms.filter((p) => p.name.startsWith('view_zoho'));
  const admin = perms.filter((p) => !p.name.startsWith('view_zoho'));
  const box = (p) => (
    <label key={p.id} className="check">
      <input type="checkbox" checked={checked.includes(p.id)} onChange={() => toggle(p.id)} /> {label(p.name)}
    </label>
  );

  return (
    <>
      {msg && <div className="alert info">{msg}</div>}
      <form className="card form-row" onSubmit={create}>
        <h3>Create role</h3>
        <input placeholder="Role name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <div><button className="btn">Create role</button></div>
      </form>
      <section className="card">
        <h3>Edit permissions</h3>
        <select value={sel} onChange={(e) => pick(e.target.value)}>
          <option value="">Select a role…</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {sel && (
          <>
            <h4>Application access</h4><div className="checks">{apps.map(box)}</div>
            <h4>Administration</h4><div className="checks">{admin.map(box)}</div>
            <button className="btn" onClick={save}>Save permissions</button>
          </>
        )}
      </section>
    </>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { get('/audit-logs').then((d) => setLogs(d.logs)).catch((e) => setErr(e.message)); }, []);
  return (
    <>
      {err && <div className="alert">{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Activity</th><th>Date and time</th><th>Status</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.user_name}</td><td>{l.action}</td><td>{new Date(l.timestamp).toLocaleString()}</td>
                <td><span className={`pill ${l.status === 'SUCCESS' ? 'ok' : 'off'}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BulkImport({ onDone }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const run = async () => {
    setErr('');
    const users = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, email, department, role, password] = l.split(',').map((x) => x.trim());
      return { name, email, department, role, password };
    });
    try { setResults((await post('/users/bulk', { users })).results); onDone(); } catch (e) { setErr(e.message); }
  };
  return (
    <details className="card">
      <summary>Bulk import employees</summary>
      <p className="muted small">One employee per line: name, email, department, role, password (optional). Generated passwords are shown once below.</p>
      <textarea className="area" rows="4" value={text} onChange={(e) => setText(e.target.value)} placeholder="Asha Rao, asha@test.com, Sales, Sales" />
      <button className="btn" onClick={run} disabled={!text.trim()}>Import employees</button>
      {err && <div className="alert">{err}</div>}
      {results && (
        <table>
          <thead><tr><th>Email</th><th>Result</th><th>Temporary password</th></tr></thead>
          <tbody>{results.map((r, i) => (
            <tr key={i}><td>{r.email}</td><td>{r.status === 'created' ? 'Created' : `Failed: ${r.error}`}</td><td>{r.password || ''}</td></tr>
          ))}</tbody>
        </table>
      )}
    </details>
  );
}

function DepartmentsTab() {
  const [depts, setDepts] = useState([]);
  const [perms, setPerms] = useState([]);
  const [sel, setSel] = useState('');
  const [checked, setChecked] = useState([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    try {
      const [d, p] = await Promise.all([get('/departments'), get('/roles/permissions')]);
      setDepts(d.departments); setPerms(p.permissions); return d.departments;
    } catch (e) { setMsg(e.message); return []; }
  };
  useEffect(() => { load(); }, []);
  const pick = (name) => { setSel(name); setMsg(''); setChecked(depts.find((d) => d.name === name)?.permissionIds || []); };
  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const save = async () => {
    try { await put(`/departments/${encodeURIComponent(sel)}/permissions`, { permissionIds: checked }); await load(); setMsg('Department permissions saved.'); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <>
      {msg && <div className="alert info">{msg}</div>}
      <section className="card">
        <h3>Department access</h3>
        <p className="muted">Permissions ticked here are added to every employee in the department, on top of their role.</p>
        <select value={sel} onChange={(e) => pick(e.target.value)}>
          <option value="">Select a department…</option>
          {depts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        {sel && (
          <>
            <div className="checks">{perms.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={checked.includes(p.id)} onChange={() => toggle(p.id)} /> {label(p.name)}
              </label>
            ))}</div>
            <button className="btn" onClick={save}>Save department permissions</button>
          </>
        )}
      </section>
    </>
  );
}

function LiveTab() {
  const [events, setEvents] = useState([]);
  const [state, setState] = useState('Connecting…');
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/activity/stream', { headers: { Authorization: `Bearer ${getToken()}` }, signal: ctrl.signal });
        if (!res.ok) throw new Error('denied');
        setState('Live');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const p of parts) if (p.startsWith('data: ')) setEvents((ev) => [JSON.parse(p.slice(6)), ...ev].slice(0, 100));
        }
        setState('Disconnected');
      } catch { if (!ctrl.signal.aborted) setState('Disconnected'); }
    })();
    return () => ctrl.abort();
  }, []);
  return (
    <section className="card">
      <h3>Live activity <span className={`pill ${state === 'Live' ? 'ok' : 'off'}`}>{state}</span></h3>
      {events.length === 0 && <p className="muted">Waiting for activity…</p>}
      <ul className="feed">
        {events.map((e) => (
          <li key={`${e.id}`}>
            <span className={`pill ${e.status === 'SUCCESS' ? 'ok' : 'off'}`}>{e.status}</span>{' '}
            <strong>{e.user_name}</strong> {e.action} <span className="muted small">{new Date(e.timestamp).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ZohoTab() {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState(() => {
    const z = new URLSearchParams(window.location.search).get('zoho');
    return z === 'connected' ? 'Zoho connected.' : z === 'error' ? 'Zoho connection failed. Check the redirect URI and scopes, then try again.' : '';
  });
  const load = () => get('/zoho/status').then(setSt).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  const connect = async () => { try { window.location.href = (await get('/zoho/connect')).url; } catch (e) { setMsg(e.message); } };
  const disconnect = async () => { try { await del('/zoho/connect'); setMsg('Zoho disconnected.'); load(); } catch (e) { setMsg(e.message); } };
  return (
    <>
      {msg && <div className="alert info">{msg}</div>}
      <section className="card">
        <h3>Zoho OAuth connection</h3>
        {!st ? <p className="muted">Loading…</p> : (
          <>
            <p>Client credentials configured: <strong>{st.oauthConfigured ? 'Yes' : 'No'}</strong> (data centre: {st.dataCenter})</p>
            <p>Connection: <strong>{st.connected ? `Connected (${st.source})` : 'Not connected'}</strong></p>
            {!st.oauthConfigured && <p className="muted">Add ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET to backend/.env, then restart the API.</p>}
            <button className="btn" onClick={connect} disabled={!st.oauthConfigured}>{st.connected ? 'Reconnect Zoho' : 'Connect Zoho'}</button>{' '}
            {st.source === 'database' && <button className="btn ghost" onClick={disconnect}>Disconnect</button>}
          </>
        )}
      </section>
    </>
  );
}
