const { createHmac, randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);
const COOKIE = 'pokelist_session';
const WEEK = 7 * 24 * 60 * 60;

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.');
  return process.env.SESSION_SECRET;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), username: user.username, iat: now, exp: now + WEEK })).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verify(token) {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}

function cookieHeader(token, maxAge = WEEK) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function tokenFromRequest(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const value = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${COOKIE}=`));
  return value ? decodeURIComponent(value.slice(COOKIE.length + 1)) : null;
}

function currentSession(req) { return verify(tokenFromRequest(req)); }

module.exports = { hashPassword, verifyPassword, sign, currentSession, cookieHeader };
