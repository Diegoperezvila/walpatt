const { ObjectId } = require('mongodb');
const { getDatabase } = require('./lib/db');
const { send, methodNotAllowed, readBody } = require('./lib/http');
const { currentSession } = require('./lib/session');

const usernameKey = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const tradeItemKey = (item) => {
  const value = typeof item === 'string' ? { id: item } : item || {};
  return `${value.kind === 'costume' ? 'costume' : 'pokemon'}:${value.id}:${value.shiny === true ? 'shiny' : 'normal'}`;
};

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, 'GET, POST');
  const session = currentSession(req);
  if (!session || !ObjectId.isValid(session.sub)) return send(res, 401, { error: 'Inicia sesión para usar Amigos.' });

  try {
    const db = await getDatabase();
    const users = db.collection('users');
    const friendships = db.collection('friendships');
    const collections = db.collection('collections');
    const tradeLikes = db.collection('tradeLikes');
    const userId = new ObjectId(session.sub);
    await friendships.createIndex({ requesterId: 1, recipientId: 1 }, { unique: true });
    await friendships.createIndex({ recipientId: 1, status: 1 });
    await friendships.createIndex({ requesterId: 1, status: 1 });
    await tradeLikes.createIndex({ ownerId: 1, friendId: 1, itemKey: 1 }, { unique: true });

    if (req.method === 'GET') {
      const searchName = typeof req.query?.search === 'string' ? usernameKey(req.query.search) : '';
      if (searchName) {
        if (!/^[a-z0-9_.-]{3,24}$/.test(searchName)) return send(res, 400, { error: 'Escribe un nombre de usuario válido.' });
        const target = await users.findOne({ usernameNormalized: searchName }, { projection: { username: 1, avatar: 1 } });
        if (!target) return send(res, 404, { error: 'No se encontró ese usuario.' });
        if (target._id.equals(userId)) return send(res, 400, { error: 'Ese es tu propio nombre de usuario.' });
        const [forward, reverse] = await Promise.all([
          friendships.findOne({ requesterId: userId, recipientId: target._id }),
          friendships.findOne({ requesterId: target._id, recipientId: userId })
        ]);
        const status = forward?.status === 'accepted' || reverse?.status === 'accepted' ? 'friend' :
          forward?.status === 'pending' ? 'sent' : reverse?.status === 'pending' ? 'received' : 'available';
        return send(res, 200, { user: { username: target.username, avatar: target.avatar || null }, status });
      }
      const targetName = typeof req.query?.username === 'string' ? usernameKey(req.query.username) : '';
      if (targetName) {
        const target = await users.findOne({ usernameNormalized: targetName }, { projection: { username: 1, avatar: 1 } });
        if (!target) return send(res, 404, { error: 'No se encontró ese usuario.' });
        if (target._id.equals(userId)) return send(res, 400, { error: 'No puedes ver tu propia colección desde Amigos.' });
        const friendship = await friendships.findOne({ status: 'accepted', $or: [{ requesterId: userId, recipientId: target._id }, { requesterId: target._id, recipientId: userId }] });
        if (!friendship) return send(res, 403, { error: 'Solo puedes ver listas de usuarios que hayas agregado.' });
        const record = await collections.findOne({ userId: target._id }, { projection: { 'data.lists': 1, 'data.owned': 1, 'data.trading': 1 } });
        const data = record?.data || {};
        const lists = (Array.isArray(data.lists) ? data.lists : []).filter((list) => list?.isPublic === true).map((list) => ({
          id: list.id,
          name: list.name,
          emoji: list.emoji || '✦',
          shiny: !!list.shiny,
          pokemon: Object.keys(data.owned?.[`pokemon:${list.id}`] || {}),
          costumes: Object.keys(data.owned?.[`costumes:${list.id}`] || {})
        }));
        const trading = data.trading || {};
        const normalizeTradeItem = item => typeof item === 'string' ? { id: item, kind: 'pokemon', shiny: false } : ({ id: item.id, kind: item.kind === 'costume' ? 'costume' : 'pokemon', shiny: item.shiny === true, quantity: Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : null });
        const offers = Array.isArray(trading.offers) ? trading.offers.filter(item => (typeof item === 'string' && item.length <= 80) || (item && typeof item.id === 'string' && item.id.length <= 80)).slice(0, 500).map(normalizeTradeItem) : [];
        const wanted = Array.isArray(trading.wanted) ? trading.wanted.filter(item => (typeof item === 'string' && item.length <= 80) || (item && typeof item.id === 'string' && item.id.length <= 80)).slice(0, 500).map(normalizeTradeItem) : [];
        const offerKeys = offers.map(tradeItemKey);
        const myLikes = offerKeys.length ? await tradeLikes.find({ ownerId: target._id, friendId: userId, itemKey: { $in: offerKeys } }, { projection: { itemKey: 1 } }).toArray() : [];
        const likedKeys = new Set(myLikes.map(like => like.itemKey));
        const offersWithLikeState = offers.map(item => ({ ...item, itemKey: tradeItemKey(item), likedByMe: likedKeys.has(tradeItemKey(item)) }));
        return send(res, 200, { user: { username: target.username, avatar: target.avatar || null }, lists, trading: { offers: offersWithLikeState, wanted } });
      }

      const [incoming, accepted] = await Promise.all([
        friendships.find({ recipientId: userId, status: 'pending' }).sort({ createdAt: -1 }).limit(100).toArray(),
        friendships.find({ status: 'accepted', $or: [{ requesterId: userId }, { recipientId: userId }] }).sort({ updatedAt: -1 }).limit(200).toArray()
      ]);
      const otherIds = [...incoming.map((item) => item.requesterId), ...accepted.map((item) => item.requesterId.equals(userId) ? item.recipientId : item.requesterId)];
      const acceptedFriendIds = accepted.map(item => item.requesterId.equals(userId) ? item.recipientId : item.requesterId);
      const profiles = await users.find({ _id: { $in: otherIds } }, { projection: { username: 1, avatar: 1 } }).toArray();
      const profileMap = new Map(profiles.map((profile) => [profile._id.toString(), { username: profile.username, avatar: profile.avatar || null }]));
      const ownLikes = acceptedFriendIds.length ? await tradeLikes.find({ ownerId: userId, friendId: { $in: acceptedFriendIds } }).limit(2000).toArray() : [];
      const likesByOffer = new Map();
      ownLikes.forEach(like => {
        const friend = profileMap.get(like.friendId.toString());
        if (!friend) return;
        if (!likesByOffer.has(like.itemKey)) likesByOffer.set(like.itemKey, []);
        likesByOffer.get(like.itemKey).push(friend.username);
      });
      return send(res, 200, {
        incoming: incoming.filter((item) => profileMap.has(item.requesterId.toString())).map((item) => ({ id: item._id.toString(), ...profileMap.get(item.requesterId.toString()) })),
        friends: acceptedFriendIds.filter((id) => profileMap.has(id.toString())).map((id) => ({ id: id.toString(), ...profileMap.get(id.toString()) })),
        tradeLikes: [...likesByOffer].map(([itemKey, usernames]) => ({ itemKey, usernames }))
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

    if (body.action === 'remove') {
      if (!ObjectId.isValid(body.friendId)) return send(res, 400, { error: 'El amigo seleccionado no es válido.' });
      const friendId = new ObjectId(body.friendId);
      if (friendId.equals(userId)) return send(res, 400, { error: 'No puedes eliminarte a ti mismo.' });
      const result = await friendships.deleteOne({
        status: 'accepted',
        $or: [{ requesterId: userId, recipientId: friendId }, { requesterId: friendId, recipientId: userId }]
      });
      if (!result.deletedCount) return send(res, 404, { error: 'La amistad ya no existe.' });
      await tradeLikes.deleteMany({ $or: [{ ownerId: userId, friendId }, { ownerId: friendId, friendId: userId }] });
      return send(res, 200, { ok: true });
    }

    if (body.action === 'setTradeLike') {
      const targetName = usernameKey(body.username);
      if (!/^[a-z0-9_.-]{3,24}$/.test(targetName) || typeof body.itemKey !== 'string' || body.itemKey.length > 120 || typeof body.liked !== 'boolean') {
        return send(res, 400, { error: 'El Pokémon o la acción de me gusta no son válidos.' });
      }
      const target = await users.findOne({ usernameNormalized: targetName }, { projection: { username: 1 } });
      if (!target || target._id.equals(userId)) return send(res, 404, { error: 'No se encontró ese amigo.' });
      const friendship = await friendships.findOne({ status: 'accepted', $or: [{ requesterId: userId, recipientId: target._id }, { requesterId: target._id, recipientId: userId }] });
      if (!friendship) return send(res, 403, { error: 'Solo puedes marcar ofertas de tus amigos.' });
      const record = await collections.findOne({ userId: target._id }, { projection: { 'data.trading.offers': 1 } });
      const offers = Array.isArray(record?.data?.trading?.offers) ? record.data.trading.offers : [];
      if (!offers.some(item => tradeItemKey(item) === body.itemKey)) return send(res, 404, { error: 'Esa oferta ya no está disponible.' });
      if (body.liked) {
        await tradeLikes.updateOne({ ownerId: target._id, friendId: userId, itemKey: body.itemKey }, { $setOnInsert: { ownerId: target._id, friendId: userId, itemKey: body.itemKey, createdAt: new Date() } }, { upsert: true });
      } else {
        await tradeLikes.deleteOne({ ownerId: target._id, friendId: userId, itemKey: body.itemKey });
      }
      return send(res, 200, { ok: true, liked: body.liked });
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
