const { getDatabase } = require('../lib/db');
const { send, methodNotAllowed, readBody } = require('../lib/http');
const { verifyPassword, sign, cookieHeader } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  try {
    const { username, password } = await readBody(req);
    const cleanUsername = typeof username === 'string' ? username.trim().toLocaleLowerCase('en-US') : '';
    if (!cleanUsername || typeof password !== 'string') return send(res, 400, { error: 'Introduce nombre de usuario y contraseña.' });
    const db = await getDatabase();
    const user = await db.collection('users').findOne({ usernameNormalized: cleanUsername });
    if (!user || !await verifyPassword(password, user.passwordHash)) return send(res, 401, { error: 'Nombre de usuario o contraseña incorrectos.' });
    return send(res, 200, { user: { username: user.username, email: user.email } }, { 'Set-Cookie': cookieHeader(sign(user)) });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error de inicio de sesión:', error.message);
    return send(res, 500, { error: 'No se pudo iniciar sesión. Revisa la conexión de MongoDB.' });
  }
};
