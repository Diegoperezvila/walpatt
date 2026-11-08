const { createHash, timingSafeEqual } = require('node:crypto');
const { ObjectId } = require('mongodb');
const { getDatabase } = require('../lib/db');
const { send, methodNotAllowed, readBody } = require('../lib/http');
const basePokemon = require('../../data/pokemon.json');
const pokemonForms = require('../../data/pokemon-forms.json');
const costumesCatalog = require('../../data/costumes.json');

const pokemonCatalog = [...basePokemon, ...pokemonForms];
const defaultLists = [
  { id: 'perfect', name: '100 IV', shiny: false },
  { id: 'shiny', name: 'Shiny', shiny: true }
];
const hashCode = (code) => createHash('sha256').update(String(code).toUpperCase()).digest('hex');
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function telegramRequest(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Telegram ${method} returned ${response.status}`);
  return response.json();
}

async function reply(chatId, text) {
  if (!text) return;
  await telegramRequest('sendMessage', { chat_id: chatId, text: String(text).slice(0, 4000) });
}

function commandParts(text) {
  const match = String(text || '').trim().match(/^\/([^\s@]+)(?:@[^\s]+)?(?:\s+([\s\S]*))?$/i);
  return match ? { command: normalize(match[1]).replace(/[^a-z0-9_]/g, ''), args: (match[2] || '').trim() } : null;
}

function eligibleForList(list) {
  return pokemonCatalog.filter(item => item.available && (!list.shiny || item.shinyAvailable));
}

function eligibleCostumesForList(list) {
  return costumesCatalog.filter(item => item.available && (!list.shiny || item.shinyAvailable));
}

function findPokemon(query, list) {
  const term = normalize(query);
  if (!term) return [];
  return eligibleForList(list).filter(item => [item.name, item.pokemonName, item.formName]
    .some(name => name && normalize(name).includes(term)));
}

function findCostumes(query, list) {
  const term = normalize(query);
  if (!term) return [];
  return eligibleCostumesForList(list).filter(item => [item.name, item.pokemonName, item.costumeName]
    .some(name => name && normalize(name).includes(term)));
}

function parseListAndRest(args, lists) {
  const quoted = args.match(/^"([^"]+)"(?:\s+([\s\S]*))?$/);
  if (quoted) {
    const target = normalize(quoted[1]);
    return { list: lists.find(item => normalize(item.name) === target), rest: (quoted[2] || '').trim() };
  }
  const ordered = [...lists].sort((a, b) => b.name.length - a.name.length);
  for (const list of ordered) {
    const prefix = args.slice(0, list.name.length);
    if (normalize(prefix) === normalize(list.name) && (args.length === list.name.length || /\s/.test(args[list.name.length]))) {
      return { list, rest: args.slice(list.name.length).trim() };
    }
  }
  return { list: null, rest: '' };
}

function splitCostumeAddQuery(query) {
  const marker = query.match(/^(.*?)\s+disfraz\s+([\s\S]+)$/i);
  if (!marker) return null;
  const cleanPart = value => value.trim().replace(/^"|"$/g, '');
  return { pokemon: cleanPart(marker[1]), costume: cleanPart(marker[2]) };
}

async function connectTelegram(db, message, code) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(cleanCode)) {
    await reply(message.chat.id, 'El código no parece válido. En Walpatt genera un código nuevo y vuelve a intentarlo.');
    return;
  }
  const codes = db.collection('telegramLinkCodes');
  const pending = await codes.findOne({ codeHash: hashCode(cleanCode), expiresAt: { $gt: new Date() } });
  if (!pending) {
    await reply(message.chat.id, 'Ese código ha caducado o ya se utilizó. Genera uno nuevo desde tu perfil de Walpatt.');
    return;
  }
  const users = db.collection('users');
  await users.createIndex({ telegramId: 1 }, { unique: true, partialFilterExpression: { telegramId: { $type: 'string' } } });
  const telegramId = String(message.from.id);
  const existing = await users.findOne({ telegramId }, { projection: { _id: 1 } });
  if (existing && !existing._id.equals(pending.userId)) {
    await reply(message.chat.id, 'Esta cuenta de Telegram ya está vinculada a otro perfil de Walpatt. Desvincúlala desde ese perfil primero.');
    return;
  }
  const user = await users.findOne({ _id: pending.userId }, { projection: { username: 1, telegramId: 1 } });
  if (!user) {
    await codes.deleteOne({ _id: pending._id });
    await reply(message.chat.id, 'No se encontró la cuenta de Walpatt. Genera un código nuevo desde tu perfil.');
    return;
  }
  if (user.telegramId && user.telegramId !== telegramId) {
    await reply(message.chat.id, 'Este perfil de Walpatt ya tiene otro Telegram vinculado. Desvincúlalo desde el perfil antes de cambiarlo.');
    return;
  }
  await users.updateOne({ _id: pending.userId }, { $set: {
    telegramId,
    telegramUsername: typeof message.from.username === 'string' ? message.from.username.slice(0, 32) : null,
    telegramFirstName: typeof message.from.first_name === 'string' ? message.from.first_name.slice(0, 100) : null,
    updatedAt: new Date()
  } });
  await codes.deleteOne({ _id: pending._id });
  await reply(message.chat.id, `¡Cuenta vinculada con Walpatt, ${user.username}! Ya puedes usar /listas, /tengo, /faltan y /anadir.`);
}

async function handleLinkedCommand(db, message, linkedUser, parsed) {
  const chatId = message.chat.id;
  const collection = db.collection('collections');
  let record = await collection.findOne({ userId: linkedUser._id });
  if (!record) {
    const data = { lists: defaultLists, owned: {}, trading: { offers: [], wanted: [] } };
    await collection.insertOne({ userId: linkedUser._id, data, updatedAt: new Date() });
    record = { data };
  }
  const data = record.data || {};
  const lists = Array.isArray(data.lists) && data.lists.length ? data.lists : defaultLists;

  if (parsed.command === 'listas') {
    await reply(chatId, `Tus listas de Walpatt:\n${lists.map(list => `• ${list.name}${list.shiny ? ' · shiny' : ''}`).join('\n')}\n\nPokémon: /tengo "Nombre de lista" [búsqueda]\nDisfraces: /tengo "Nombre de lista" disfraces [Pokémon]`);
    return;
  }

  if (parsed.command === 'tengo' || parsed.command === 'faltan' || parsed.command === 'anadir') {
    const { list, rest } = parseListAndRest(parsed.args, lists);
    if (!list) {
      await reply(chatId, 'No reconozco esa lista. Usa /listas para ver los nombres y escribe el nombre entre comillas. Ejemplo: /faltan "100 IV" Pikachu');
      return;
    }
    if (parsed.command === 'anadir') {
      const costumeQuery = splitCostumeAddQuery(rest);
      const isCostume = !!costumeQuery;
      const ownedMap = data.owned?.[`${isCostume ? 'costumes' : 'pokemon'}:${list.id}`] || {};
      let choices;
      if (isCostume) {
        choices = costumeQuery.pokemon && costumeQuery.costume ? findCostumes(costumeQuery.costume, list).filter(item =>
          [item.pokemonName, item.name].some(name => name && normalize(name).includes(normalize(costumeQuery.pokemon)))
        ) : [];
      } else {
        choices = findPokemon(rest, list);
      }
      if (!rest || !choices.length) {
        await reply(chatId, isCostume
          ? 'No encontré ese disfraz. Usa /anadir "100 IV" Pikachu disfraz "Gorro de fiesta".'
          : 'Indica el Pokémon que quieres añadir. Ejemplo: /anadir "100 IV" Pikachu');
        return;
      }
      if (choices.length > 1) {
        await reply(chatId, `Hay varias coincidencias. Escribe el nombre completo:\n${choices.slice(0, 10).map(item => `• ${item.name}`).join('\n')}`);
        return;
      }
      const item = choices[0];
      if (ownedMap[String(item.id)]) {
        await reply(chatId, `${item.name} ya está marcado en «${list.name}».`);
        return;
      }
      const ownershipKey = `${isCostume ? 'costumes' : 'pokemon'}:${list.id}`;
      await collection.updateOne({ userId: linkedUser._id }, { $set: { [`data.owned.${ownershipKey}.${String(item.id)}`]: true, updatedAt: new Date() } });
      await reply(chatId, `Añadido: ${item.name} → «${list.name}».`);
      return;
    }

    const costumeCommand = rest.match(/^disfraces?(?:\s+([\s\S]*))?$/i);
    const isCostume = !!costumeCommand;
    const query = isCostume ? (costumeCommand[1] || '').trim() : rest;
    const catalog = isCostume ? eligibleCostumesForList(list) : eligibleForList(list);
    const ownershipKey = `${isCostume ? 'costumes' : 'pokemon'}:${list.id}`;
    const ownedMap = data.owned?.[ownershipKey] || {};
    const matches = query
      ? catalog.filter(item => [item.name, item.pokemonName, item.formName, item.costumeName]
        .some(name => name && normalize(name).includes(normalize(query))))
      : catalog;
    const owned = matches.filter(item => !!ownedMap[String(item.id)]);
    const missing = matches.filter(item => !ownedMap[String(item.id)]);

    const selected = parsed.command === 'tengo' ? owned : missing;
    const title = parsed.command === 'tengo' ? 'Tienes' : 'Te faltan';
    const heading = `${title} ${selected.length} de ${matches.length} ${isCostume ? 'disfraces' : 'Pokémon'} en «${list.name}»${query ? ` para «${query}»` : ''}.`;
    if (!selected.length) {
      await reply(chatId, `${heading}\n${parsed.command === 'tengo' ? `Todavía no hay ${isCostume ? 'disfraces' : 'Pokémon'} marcados.` : '¡Lista completada para esa búsqueda!'}`);
      return;
    }
    const limit = 35;
    const names = selected.slice(0, limit).map(item => `• ${item.name}`).join('\n');
    const tail = selected.length > limit ? `\n… y ${selected.length - limit} más. Refina la búsqueda: /${parsed.command} "${list.name}" ${isCostume ? 'disfraces ' : ''}nombre` : '';
    await reply(chatId, `${heading}\n${names}${tail}`);
    return;
  }

  await reply(chatId, 'Comando no reconocido. Usa /ayuda para ver cómo consultar o añadir Pokémon.');
}

async function handleMessage(db, message) {
  if (!message?.chat?.id || !message.from || message.from.is_bot) return;
  if (message.chat.type !== 'private') {
    await reply(message.chat.id, 'Por privacidad, usa Walpatt conmigo en un chat privado.');
    return;
  }
  const rawText = String(message.text || '').trim();
  if (/^[A-F0-9]{32}$/i.test(rawText)) {
    await connectTelegram(db, message, rawText);
    return;
  }
  const parsed = commandParts(rawText);
  if (!parsed) {
    await reply(message.chat.id, 'Usa /ayuda para ver los comandos disponibles.');
    return;
  }
  const startCode = parsed.command === 'start' ? parsed.args.match(/^link[_-]([A-F0-9]{32})$/i)?.[1] : null;
  if (parsed.command === 'vincular' || startCode) {
    const code = parsed.command === 'vincular' ? parsed.args : startCode;
    if (!code) {
      await reply(message.chat.id, 'Para vincular, genera un código desde Perfil en Walpatt y envíame /vincular CODIGO.');
      return;
    }
    await connectTelegram(db, message, code);
    return;
  }
  if (parsed.command === 'ayuda' || parsed.command === 'start') {
    await reply(message.chat.id, 'Walpatt en Telegram\n\n/vincular CODIGO — conectar tu cuenta\n/listas — ver tus listas\n/tengo "100 IV" [Pokémon] — consultar Pokémon\n/faltan "Shiny" [Pokémon] — consultar Pokémon pendientes\n/tengo "100 IV" disfraces [Pokémon] — consultar disfraces\n/faltan "100 IV" disfraces [Pokémon] — consultar disfraces pendientes\n/anadir "100 IV" Pikachu — marcar un Pokémon\n/anadir "100 IV" Pikachu disfraz "Gorro de fiesta" — marcar un disfraz\n\nSi tu lista tiene otro nombre, sustituye el texto entre comillas. Los nombres de Pokémon y disfraz pueden ser parciales; si hay varias coincidencias, el bot te mostrará opciones.');
    return;
  }
  if (parsed.command === 'desvincular') {
    const result = await db.collection('users').updateOne({ telegramId: String(message.from.id) }, { $unset: { telegramId: '', telegramUsername: '', telegramFirstName: '' }, $set: { updatedAt: new Date() } });
    await reply(message.chat.id, result.modifiedCount ? 'Telegram se ha desvinculado de Walpatt.' : 'Este Telegram no está vinculado a una cuenta.');
    return;
  }
  const linkedUser = await db.collection('users').findOne({ telegramId: String(message.from.id) }, { projection: { username: 1 } });
  if (!linkedUser) {
    await reply(message.chat.id, 'Tu Telegram no está vinculado. Abre Perfil en Walpatt, genera un código y envíame /vincular CODIGO.');
    return;
  }
  await handleLinkedCommand(db, message, linkedUser, parsed);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return send(res, 503, { error: 'El bot de Telegram no está configurado.' });
  if (!sameSecret(req.headers['x-telegram-bot-api-secret-token'], process.env.TELEGRAM_WEBHOOK_SECRET)) return send(res, 401, { error: 'Webhook no autorizado.' });
  try {
    const update = await readBody(req);
    if (!update.message) return send(res, 200, { ok: true });
    const db = await getDatabase();
    await handleMessage(db, update.message);
    return send(res, 200, { ok: true });
  } catch (error) {
    if (error.status) return send(res, error.status, { error: error.message });
    console.error('Error al procesar actualización de Telegram:', error.message);
    return send(res, 200, { ok: true });
  }
};
