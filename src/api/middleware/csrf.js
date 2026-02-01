import crypto from 'crypto';

/*
  Very small session-like store:
  key = csrf session id (cookie)
  value = csrf token
*/
const csrfStore = new Map();

const CSRF_COOKIE = 'cm_csrf_id';
const CSRF_HEADER = 'x-csrf-token';

export default function csrf(req, res, next) {
  // Safe methods do not require CSRF
  if (isSafeMethod(req.method)) {
    ensureToken(req, res);
    return next();
  }

  const csrfId = req.cookies?.[CSRF_COOKIE];
  const expected = csrfId && csrfStore.get(csrfId);

  const provided =
    req.headers[CSRF_HEADER] ||
    req.body?._csrf;

  if (!expected || !provided || provided !== expected) {
    return res.sendStatus(403);
  }

  // Optional: rotate token after successful write
  rotateToken(csrfId);

  return next();
}

/* ----------------------------
   Helpers
----------------------------- */

function ensureToken(req, res) {
  let csrfId = req.cookies?.[CSRF_COOKIE];

  if (!csrfId || !csrfStore.has(csrfId)) {
    csrfId = crypto.randomUUID();
    csrfStore.set(csrfId, randomToken());

    res.cookie(CSRF_COOKIE, csrfId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  res.locals.csrfToken = csrfStore.get(csrfId);
}

function rotateToken(csrfId) {
  if (csrfId && csrfStore.has(csrfId)) {
    csrfStore.set(csrfId, randomToken());
  }
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isSafeMethod(method) {
  return (
    method === 'GET' ||
    method === 'HEAD' ||
    method === 'OPTIONS'
  );
}
