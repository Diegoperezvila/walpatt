const { send, methodNotAllowed } = require('../lib/http');
const { currentSession } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  try {
    const session = currentSession(req);
    return session ? send(res, 200, { user: { username: session.username } }) : send(res, 200, { user: null });
  } catch (error) {
    console.error('Error de sesión:', error.message);
    return send(res, 500, { error: 'No se pudo comprobar la sesión.' });
  }
};
