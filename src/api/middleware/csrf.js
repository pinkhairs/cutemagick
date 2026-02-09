import crypto from 'crypto';

const csrfStore = new Map();

const CSRF_COOKIE = 'cm_csrf_id';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_WRAPPED = Symbol('csrfWrapped');

export default function csrf(req, res, next) {
  ensureToken(req, res);

  req.csrfToken = function () {
    const csrfId = req.cookies?.[CSRF_COOKIE];
    return csrfId && csrfStore.get(csrfId);
  };

  if (!res[CSRF_WRAPPED]) {
    res[CSRF_WRAPPED] = true;
    const originalWriteHead = res.writeHead;
    res.writeHead = function (...args) {
      const token = req.csrfToken?.();
      if (token && !res.headersSent) {
        res.setHeader('X-CSRF-Token', token);
      }
      return originalWriteHead.apply(this, args);
    };
  }

  if (!isSafeMethod(req.method)) {
    const csrfId = req.cookies?.[CSRF_COOKIE];
    const expected = csrfId && csrfStore.get(csrfId);
    const provided =
      req.headers[CSRF_HEADER] ||
      req.body?._csrf;

    if (!expected || !provided || provided !== expected) {
      return res.sendStatus(403);
    }

    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    if (!isMultipart) {
      rotateToken(csrfId);
    }
  }

  next();
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
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/admin',
    });
  }

  res.locals.csrfToken = csrfStore.get(csrfId);
}

function rotateToken(csrfId) {
  const next = randomToken();
  csrfStore.set(csrfId, next);
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isSafeMethod(method) {
  return method === 'GET' ||
         method === 'HEAD' ||
         method === 'OPTIONS';
}
