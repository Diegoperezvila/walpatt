const { createHash, randomBytes } = require('node:crypto');
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../lib/db');
const { send, methodNotAllowed } = require('../lib/http');
const { currentSession } = require('../lib/session');

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const hashCode = (code) => createHash('sha256').update(String(code).toUpperCase()).digest('hex');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, 'GET, POST, DELETE');
  const session = currentSession(req);
  if (!session || !ObjectId.isValid(session.sub)) return send(res, 401, { error: 'Inicia sesión para vincular Telegram.' });

  try {
    const db = await getDatabase();
    const users = db.collection('users');
    const userId = new ObjectId(session.sub);
    const user = await users.findOne({ _id: userId }, { projection: { telegramId: 1, telegramUsername: 1, telegramFirstName: 1 } });
    if (!user) return send(res, 401, { error: 'La cuenta ya no existe.' });
    const codes = db.collection('telegramLinkCodes');

    if (req.method === 'GET') {
      return send(res, 200, {
        linked: typeof user.telegramId === 'string',
        telegramUsername: user.telegramUsername || null,
        telegramFirstName: user.telegramFirstName || null,
        botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
        configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET)
      });
    }

    if (req.method === 'DELETE') {
      await users.updateOne({ _id: userId }, { $unset: { telegramId: '', telegramUsername: '', telegramFirstName: '' }, $set: { updatedAt: new Date() } });
      await codes.deleteMany({ userId });
      return send(res, 200, { linked: false });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return send(res, 503, { error: 'Telegram todavía no está configurado en Vercel.' });
    if (user.telegramId) return send(res, 409, { error: 'Ya tienes una cuenta de Telegram vinculada. Desvincúlala primero si quieres cambiarla.' });

    await codes.createIndex({ userId: 1 }, { unique: true });
    await codes.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await codes.deleteMany({ userId });
    const code = randomBytes(16).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);
    await codes.insertOne({ userId, codeHash: hashCode(code), expiresAt, createdAt: new Date() });
    return send(res, 200, { code, expiresAt, botUsername: process.env.TELEGRAM_BOT_USERNAME || null });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error al crear el código de Telegram:', error.message);
    return send(res, 500, { error: 'No se pudo preparar la vinculación con Telegram.' });
  }
};
