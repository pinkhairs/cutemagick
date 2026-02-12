import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer
      .from(header.slice(6), 'base64')
      .toString('utf8');

    const sep = decoded.indexOf(':');
    if (sep === -1) return null;

    return {
      username: decoded.slice(0, sep),
      password: decoded.slice(sep + 1)
    };
  } catch {
    return null;
  }
}

function isAuthenticatedAdmin(req) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;

  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export default function httpBasic(req, res, next) {
  const site = req.site;
  if (!site) return next();

  if (!site.username || !site.password) {
    return next();
  }

  // Skip HTTP Basic auth for authenticated admins on admin routes
  // This allows iframes to work smoothly (browsers don't show auth prompts in iframes)
  // Admins can test the auth prompt by opening URLs in incognito/new session
  if (isAuthenticatedAdmin(req)) {
    if (req.baseUrl === '/iframe/site' || req.baseUrl === '/admin/preview') {
      return next();
    }
  }

  const auth = parseBasicAuth(req.headers.authorization);

  if (
    !auth ||
    !safeEqual(auth.username, site.username) ||
    !safeEqual(auth.password, site.password)
  ) {
    return challenge(res, site);
  }

  return next();
}

function challenge(res, site) {
  const realm = site?.name || 'Cute Magick Site';
  res.set('WWW-Authenticate', `Basic realm="${realm}"`);
  res.status(401).send('Authentication required');
}
