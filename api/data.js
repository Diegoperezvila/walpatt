const { ObjectId } = require('mongodb');
const { getDatabase } = require('./lib/db');
const { send, methodNotAllowed, readBody } = require('./lib/http');
const { currentSession } = require('./lib/session');

function validData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.lists) || data.lists.length > 32) return false;
  if (!data.owned || typeof data.owned !== 'object' || Array.isArray(data.owned)) return false;
  const ids = new Set();
  for (const list of data.lists) {
    if (!list || typeof list.id !== 'string' || list.id.length > 80 || ids.has(list.id)) return false;
    if (typeof list.name !== 'string' || !list.name.trim() || list.name.length > 32) return false;
    ids.add(list.id);
  }
  return Object.keys(data.owned).length <= 100;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) return methodNotAllowed(res, 'GET, PUT');
  const session = currentSession(req);
  if (!session || !ObjectId.isValid(session.sub)) return send(res, 401, { error: 'Inicia sesión para acceder a tu colección.' });
  try {
    const db = await getDatabase();
    const userId = new ObjectId(session.sub);
    const collection = db.collection('collections');
    if (req.method === 'GET') {
      let record = await collection.findOne({ userId });
      if (!record) {
        const data = { lists: [{ id: 'perfect', name: '100 IV', kind: 'perfect', emoji: '💯', shiny: false }, { id: 'shiny', name: 'Shiny', kind: 'shiny', emoji: '✨', shiny: true }], owned: {} };
        await collection.insertOne({ userId, data, updatedAt: new Date() });
        record = { data };
      }
      return send(res, 200, { data: record.data });
    }
    const body = await readBody(req);
    if (!validData(body.data)) return send(res, 400, { error: 'Los datos de la colección no tienen un formato válido.' });
    await collection.updateOne({ userId }, { $set: { data: body.data, updatedAt: new Date() } }, { upsert: true });
    return send(res, 200, { ok: true });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error de colección:', error.message);
    return send(res, 500, { error: 'No se pudo guardar la colección en MongoDB.' });
  }
};
