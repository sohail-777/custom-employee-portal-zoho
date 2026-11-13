const { audit } = require('../services/accessService');

// Allows the request if the user holds ANY of the listed permissions; otherwise 403 + audit entry
exports.requirePermission = (...required) => async (req, res, next) => {
  if (required.some((p) => req.user.permissions.includes(p))) return next();
  await audit(req.user.id, `Unauthorized access attempt: ${req.method} ${req.originalUrl}`, 'DENIED');
  res.status(403).json({ message: 'Forbidden: you do not have permission for this action' });
};
