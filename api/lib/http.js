function send(res, status, payload, headers = {}) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allow) {
  send(res, 405, { error: 'Método no permitido.' }, { Allow: allow });
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('El contenido no es JSON válido.'), { status: 400 }); }
}

module.exports = { send, methodNotAllowed, readBody };
