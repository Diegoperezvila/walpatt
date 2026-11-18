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
    if (list.isPublic !== undefined && typeof list.isPublic !== 'boolean') return false;
    ids.add(list.id);
  }
  if (Object.keys(data.owned).length > 100) return false;
  if (data.trading !== undefined) {
    const { offers, wanted } = data.trading || {};
    if (!Array.isArray(offers) || offers.length > 500 || !Array.isArray(wanted) || wanted.length > 500) return false;
    const validItem = item => item && typeof item === 'object' && typeof item.id === 'string' && item.id.length <= 80 && (item.kind === undefined || ['pokemon', 'costume'].includes(item.kind)) && (item.shiny === undefined || typeof item.shiny === 'boolean');
    if (offers.some(item => !validItem(item) || (item.quantity != null && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)))) return false;
    if (wanted.some(item => !(typeof item === 'string' && item.length <= 80) && !validItem(item))) return false;
  }
  return true;
}

function tradeItemKey(item) {
  const value = typeof item === 'string' ? { id: item } : item || {};
  return `${value.kind === 'costume' ? 'costume' : 'pokemon'}:${value.id}:${value.shiny === true ? 'shiny' : 'normal'}`;
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
    const previous = await collection.findOne({ userId }, { projection: { 'data.trading.offers': 1 } });
    const oldOfferKeys = new Set((previous?.data?.trading?.offers || []).map(tradeItemKey));
    const newOfferKeys = new Set((body.data.trading?.offers || []).map(tradeItemKey));
    const removedOfferKeys = [...oldOfferKeys].filter(key => !newOfferKeys.has(key));
    if (removedOfferKeys.length) {
      await db.collection('tradeLikes').deleteMany({ ownerId: userId, itemKey: { $in: removedOfferKeys } });
    }
    await collection.updateOne({ userId }, { $set: { data: body.data, updatedAt: new Date() } }, { upsert: true });
    return send(res, 200, { ok: true });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error de colección:', error.message);
    return send(res, 500, { error: 'No se pudo guardar la colección en MongoDB.' });
  }
};
