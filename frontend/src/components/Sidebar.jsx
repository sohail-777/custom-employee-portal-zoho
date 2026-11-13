import { NavLink } from 'react-router-dom';

export default function Sidebar({ auth, isAdmin, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="brand">Employee Portal</div>
      <nav>
        <NavLink to="/" end>My applications</NavLink>
        <NavLink to="/security">Security</NavLink>
        {isAdmin && <NavLink to="/admin">Administration</NavLink>}
      </nav>
      <div className="side-foot">
        <strong>{auth.user.name}</strong>
        <span className="muted">{auth.roles.map((r) => r.name).join(', ') || 'No role'}</span>
        <button className="btn ghost" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}
