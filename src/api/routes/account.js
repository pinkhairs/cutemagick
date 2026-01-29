import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import express from 'express';
import auth from '../middleware/auth.js'

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  const email = req.body.email?.trim().toLowerCase();

  if (!email || !password) {
    return res.redirect('/login');
  }

  const hash = crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');

  const validUser =
    email === process.env.LOGIN_EMAIL &&
    hash === process.env.PASSWORD;

  if (!validUser) {
    return res.redirect('/login');
  }

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' && req.secure,
    path: '/',
  });

  res.redirect('/');
});

router.post('/logout', auth, (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.redirect('/login');
});

export default router;
