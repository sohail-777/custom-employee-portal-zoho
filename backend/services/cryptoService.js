const crypto = require('crypto');

const key = () => crypto.createHash('sha256').update(process.env.TOKEN_ENC_KEY || process.env.JWT_SECRET).digest();

// AES-256-GCM: used for MFA secrets and Zoho tokens stored in the database
exports.encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
};
exports.decrypt = (payload) => {
  const [iv, tag, enc] = payload.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
};
exports.sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
