// Real-time activity monitoring via Server-Sent Events
const router = require('express').Router();
const db = require('../config/database');
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const { bus } = require('../services/accessService');

router.get('/stream', auth, need('view_activity'), async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const [recent] = await db.query(
    `SELECT a.id, COALESCE(u.name, 'Unknown') AS user_name, a.action, a.status, a.timestamp
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 20`);
  recent.reverse().forEach(send);
  bus.on('activity', send);
  const beat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { bus.off('activity', send); clearInterval(beat); });
});

module.exports = router;
