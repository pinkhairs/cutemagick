import jwt from 'jsonwebtoken';

const JWT_SECRET =
  process.env.JWT_SECRET || 'cute-magick-dev-secret-change-in-production';

export default function pageAuth(req, res, next) {
  // Allow login page
  if (req.path === '/login') {
    return next();
  }

  // Allow public assets
  if (
    req.path.startsWith('/css') ||
    req.path.startsWith('/js') ||
    req.path.startsWith('/images') ||
    req.path.startsWith('/fonts')
  ) {
    return next();
  }

  const token =
    req.cookies?.token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.redirect('/login');
  }
}
