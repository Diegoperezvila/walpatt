const { getDatabase } = require('../lib/db');
const { send, methodNotAllowed, readBody } = require('../lib/http');
const { hashPassword, sign, cookieHeader } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  try {
    const { username, email, password } = await readBody(req);
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const usernameNormalized = cleanUsername.toLocaleLowerCase('en-US');
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(cleanUsername)) return send(res, 400, { error: 'El nombre de usuario debe tener entre 3 y 24 caracteres: letras, números, punto, guion o guion bajo.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) return send(res, 400, { error: 'Escribe un correo válido.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return send(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
    const db = await getDatabase();
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ usernameNormalized: 1 }, { unique: true, partialFilterExpression: { usernameNormalized: { $type: 'string' } } });
    const user = { username: cleanUsername, usernameNormalized, email: cleanEmail, passwordHash: await hashPassword(password), createdAt: new Date() };
    const result = await users.insertOne(user);
    user._id = result.insertedId;
    const data = { lists: [{ id: 'perfect', name: '100 IV', kind: 'perfect', emoji: '💯', shiny: false }, { id: 'shiny', name: 'Shiny', kind: 'shiny', emoji: '✨', shiny: true }], owned: {} };
    await db.collection('collections').insertOne({ userId: result.insertedId, data, updatedAt: new Date() });
    return send(res, 201, { user: { username: user.username } }, { 'Set-Cookie': cookieHeader(sign(user)) });
  } catch (error) {
    if (error.code === 11000) return send(res, 409, { error: error.keyPattern?.usernameNormalized ? 'Ese nombre de usuario ya está ocupado.' : 'Ya existe una cuenta con ese correo.' });
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error de registro:', error.message);
    return send(res, 500, { error: 'No se pudo crear la cuenta. Revisa la conexión de MongoDB.' });
  }
};
