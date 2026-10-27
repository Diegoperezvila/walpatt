const { ObjectId } = require('mongodb');
const { getDatabase } = require('./lib/db');
const { send, methodNotAllowed, readBody } = require('./lib/http');
const { currentSession } = require('./lib/session');

const usernameKey = (value) => String(value || '').trim().toLocaleLowerCase('en-US');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, 'GET, POST');
  const session = currentSession(req);
  if (!session || !ObjectId.isValid(session.sub)) return send(res, 401, { error: 'Inicia sesión para usar Amigos.' });

  try {
    const db = await getDatabase();
    const users = db.collection('users');
    const friendships = db.collection('friendships');
    const collections = db.collection('collections');
    const userId = new ObjectId(session.sub);
    await friendships.createIndex({ requesterId: 1, recipientId: 1 }, { unique: true });
    await friendships.createIndex({ recipientId: 1, status: 1 });
    await friendships.createIndex({ requesterId: 1, status: 1 });

    if (req.method === 'GET') {
      const searchName = typeof req.query?.search === 'string' ? usernameKey(req.query.search) : '';
      if (searchName) {
        if (!/^[a-z0-9_.-]{3,24}$/.test(searchName)) return send(res, 400, { error: 'Escribe un nombre de usuario válido.' });
        const target = await users.findOne({ usernameNormalized: searchName }, { projection: { username: 1 } });
        if (!target) return send(res, 404, { error: 'No se encontró ese usuario.' });
        if (target._id.equals(userId)) return send(res, 400, { error: 'Ese es tu propio nombre de usuario.' });
        const [forward, reverse] = await Promise.all([
          friendships.findOne({ requesterId: userId, recipientId: target._id }),
          friendships.findOne({ requesterId: target._id, recipientId: userId })
        ]);
        const status = forward?.status === 'accepted' || reverse?.status === 'accepted' ? 'friend' :
          forward?.status === 'pending' ? 'sent' : reverse?.status === 'pending' ? 'received' : 'available';
        return send(res, 200, { user: { username: target.username }, status });
      }
      const targetName = typeof req.query?.username === 'string' ? usernameKey(req.query.username) : '';
      if (targetName) {
        const target = await users.findOne({ usernameNormalized: targetName }, { projection: { username: 1 } });
        if (!target) return send(res, 404, { error: 'No se encontró ese usuario.' });
        if (target._id.equals(userId)) return send(res, 400, { error: 'No puedes ver tu propia colección desde Amigos.' });
        const friendship = await friendships.findOne({ status: 'accepted', $or: [{ requesterId: userId, recipientId: target._id }, { requesterId: target._id, recipientId: userId }] });
        if (!friendship) return send(res, 403, { error: 'Solo puedes ver listas de usuarios que hayas agregado.' });
        const record = await collections.findOne({ userId: target._id }, { projection: { 'data.lists': 1, 'data.owned': 1 } });
        const data = record?.data || {};
        const lists = (Array.isArray(data.lists) ? data.lists : []).filter((list) => list?.isPublic === true).map((list) => ({
          id: list.id,
          name: list.name,
          emoji: list.emoji || '✦',
          shiny: !!list.shiny,
          pokemon: Object.keys(data.owned?.[`pokemon:${list.id}`] || {}),
          costumes: Object.keys(data.owned?.[`costumes:${list.id}`] || {})
        }));
        return send(res, 200, { user: { username: target.username }, lists });
      }

      const [incoming, accepted] = await Promise.all([
        friendships.find({ recipientId: userId, status: 'pending' }).sort({ createdAt: -1 }).limit(100).toArray(),
        friendships.find({ status: 'accepted', $or: [{ requesterId: userId }, { recipientId: userId }] }).sort({ updatedAt: -1 }).limit(200).toArray()
      ]);
      const otherIds = [...incoming.map((item) => item.requesterId), ...accepted.map((item) => item.requesterId.equals(userId) ? item.recipientId : item.requesterId)];
      const profiles = await users.find({ _id: { $in: otherIds } }, { projection: { username: 1 } }).toArray();
      const profileMap = new Map(profiles.map((profile) => [profile._id.toString(), profile.username]));
      return send(res, 200, {
        incoming: incoming.filter((item) => profileMap.has(item.requesterId.toString())).map((item) => ({ id: item._id.toString(), username: profileMap.get(item.requesterId.toString()) })),
        friends: accepted.map((item) => item.requesterId.equals(userId) ? item.recipientId : item.requesterId).filter((id) => profileMap.has(id.toString())).map((id) => ({ id: id.toString(), username: profileMap.get(id.toString()) }))
      });
    }

    const body = await readBody(req);
    if (body.action === 'send') {
      const targetName = usernameKey(body.username);
      if (!/^[a-z0-9_.-]{3,24}$/.test(targetName)) return send(res, 400, { error: 'Escribe un nombre de usuario válido.' });
      const target = await users.findOne({ usernameNormalized: targetName }, { projection: { username: 1 } });
      if (!target) return send(res, 404, { error: 'No se encontró ese usuario.' });
      if (target._id.equals(userId)) return send(res, 400, { error: 'No puedes enviarte una solicitud a ti mismo.' });
      const forward = await friendships.findOne({ requesterId: userId, recipientId: target._id });
      const reverse = await friendships.findOne({ requesterId: target._id, recipientId: userId });
      if (forward?.status === 'accepted' || reverse?.status === 'accepted') return send(res, 409, { error: 'Ya sois amigos.' });
      if (reverse?.status === 'pending') return send(res, 409, { error: 'Este usuario ya te envió una solicitud. Puedes aceptarla en Solicitudes recibidas.' });
      if (forward?.status === 'pending') return send(res, 409, { error: 'Ya enviaste una solicitud a este usuario.' });
      if (forward) await friendships.updateOne({ _id: forward._id }, { $set: { status: 'pending', createdAt: new Date(), updatedAt: new Date() } });
      else if (reverse?.status === 'rejected') await friendships.updateOne({ _id: reverse._id }, { $set: { requesterId: userId, recipientId: target._id, status: 'pending', createdAt: new Date(), updatedAt: new Date() } });
      else await friendships.insertOne({ requesterId: userId, recipientId: target._id, status: 'pending', createdAt: new Date(), updatedAt: new Date() });
      return send(res, 200, { ok: true, message: `Solicitud enviada a ${target.username}.` });
    }

    if (!['accept', 'reject'].includes(body.action) || !ObjectId.isValid(body.requestId)) return send(res, 400, { error: 'La acción o la solicitud no es válida.' });
    const status = body.action === 'accept' ? 'accepted' : 'rejected';
    const result = await friendships.updateOne({ _id: new ObjectId(body.requestId), recipientId: userId, status: 'pending' }, { $set: { status, updatedAt: new Date() } });
    if (!result.matchedCount) return send(res, 404, { error: 'La solicitud ya no está pendiente.' });
    return send(res, 200, { ok: true });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error de Amigos:', error.message);
    return send(res, 500, { error: 'No se pudo completar la acción de amistad.' });
  }
};
