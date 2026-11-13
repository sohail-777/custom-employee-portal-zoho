// RFC 6238 TOTP (Google Authenticator / Microsoft Authenticator compatible), no external library
const crypto = require('crypto');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const b32encode = (buf) => {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};
const b32decode = (s) => {
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += ALPHA.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const hotp = (secret, counter) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
};

exports.generateSecret = () => b32encode(crypto.randomBytes(20));
exports.currentCode = (secret) => hotp(secret, Math.floor(Date.now() / 30000));
exports.verify = (secret, code) => {
  const c = Math.floor(Date.now() / 30000);
  return /^\d{6}$/.test(String(code).trim()) && [-1, 0, 1].some((d) => hotp(secret, c + d) === String(code).trim());
};
exports.otpauthUrl = (email, secret) =>
  `otpauth://totp/EmployeePortal:${encodeURIComponent(email)}?secret=${secret}&issuer=EmployeePortal`;
