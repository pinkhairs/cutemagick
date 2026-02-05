import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

const JWT_SECRET = process.env.JWT_SECRET;

export default function auth(req, res, next) {
  // Allow login page
  if (req.path === '/admin/login') {
    return next();
  }

  // Allow public assets
  if (
    req.path.startsWith('/css') ||
    req.path.startsWith('/js') ||
    req.path.startsWith('/images') ||
    req.path.startsWith('/fonts') ||
    req.path === '/favicon.ico'
  ) {
    return next();
  }

  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return unauth(req, res);
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return unauth(req, res);
  }
}

/* ----------------------------
   Helpers
----------------------------- */

function unauth(req, res) {
  // HTMX / fetch / JSON → do NOT redirect
  if (
    req.headers['hx-request'] ||
    req.headers.accept?.includes('application/json')
  ) {
    return res.sendStatus(401);
  }

  // Full page navigation → redirect OK
  return res.redirect('/admin/login');
}
