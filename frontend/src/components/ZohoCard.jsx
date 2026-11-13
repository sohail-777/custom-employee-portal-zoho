export default function ZohoCard({ app, onOpen, busy }) {
  return (
    <div className="card app-card">
      <div className="app-icon" aria-hidden="true">{app.icon}</div>
      <h3>{app.name}</h3>
      <p className="muted">{app.description}</p>
      <button className="btn" onClick={() => onOpen(app)} disabled={busy}>Open app</button>
    </div>
  );
}
