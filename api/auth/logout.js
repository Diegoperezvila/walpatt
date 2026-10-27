const { send, methodNotAllowed } = require('../lib/http');
const { cookieHeader } = require('../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
};
