const { ObjectId } = require('mongodb');
const { getDatabase } = require('../lib/db');
const { send, methodNotAllowed } = require('../lib/http');
const { currentSession } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  try {
    const session = currentSession(req);
    if (!session || !ObjectId.isValid(session.sub)) return send(res, 200, { user: null });
    const db = await getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(session.sub) }, { projection: { username: 1, email: 1, avatar: 1 } });
    return user ? send(res, 200, { user: { username: user.username, email: user.email, avatar: user.avatar || null } }) : send(res, 200, { user: null });
  } catch (error) {
    console.error('Error de sesión:', error.message);
    return send(res, 500, { error: 'No se pudo comprobar la sesión.' });
  }
};
