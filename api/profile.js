const { ObjectId } = require('mongodb');
const { getDatabase } = require('./lib/db');
const { send, methodNotAllowed, readBody } = require('./lib/http');
const { currentSession, hashPassword, verifyPassword, sign, cookieHeader } = require('./lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') return methodNotAllowed(res, 'PATCH');
  const session = currentSession(req);
  if (!session || !ObjectId.isValid(session.sub)) return send(res, 401, { error: 'Inicia sesión para editar tu perfil.' });
  try {
    const { username, email, currentPassword, newPassword, avatar } = await readBody(req);
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const usernameNormalized = cleanUsername.toLocaleLowerCase('en-US');
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(cleanUsername)) return send(res, 400, { error: 'El nombre de usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) return send(res, 400, { error: 'Escribe un correo válido.' });
    if (newPassword && (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128)) return send(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    const db = await getDatabase();
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ usernameNormalized: 1 }, { unique: true, partialFilterExpression: { usernameNormalized: { $type: 'string' } } });
    const user = await users.findOne({ _id: new ObjectId(session.sub) });
    if (!user) return send(res, 401, { error: 'La cuenta ya no existe.' });
    const changes = { username: cleanUsername, usernameNormalized, email: cleanEmail, updatedAt: new Date() };
    if (avatar !== undefined) {
      if (avatar === null) changes.avatar = null;
      else if (!avatar || typeof avatar !== 'object' || typeof avatar.shiny !== 'boolean' || !/^(?:[1-9]\d{0,3}|form-[a-z0-9-]{1,50})$/.test(String(avatar.id))) return send(res, 400, { error: 'El icono de Pokémon seleccionado no es válido.' });
      else changes.avatar = { id: String(avatar.id), shiny: avatar.shiny };
    }
    if (newPassword) {
      if (typeof currentPassword !== 'string' || !await verifyPassword(currentPassword, user.passwordHash)) return send(res, 400, { error: 'La contraseña actual no es correcta.' });
      changes.passwordHash = await hashPassword(newPassword);
    }
    await users.updateOne({ _id: user._id }, { $set: changes });
    const updated = { ...user, ...changes };
    return send(res, 200, { user: { username: updated.username, email: updated.email, avatar: updated.avatar || null } }, { 'Set-Cookie': cookieHeader(sign(updated)) });
  } catch (error) {
    if (error.code === 11000) return send(res, 409, { error: error.keyPattern?.usernameNormalized ? 'Ese nombre de usuario ya está ocupado.' : 'Ese correo ya está asociado a una cuenta.' });
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error al actualizar el perfil:', error);
    return send(res, 500, { error: 'No se pudo actualizar el perfil. Comprueba la conexión con MongoDB.' });
  }
};
