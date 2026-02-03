import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import express from 'express';
import auth from '../middleware/auth.js'

const router = express.Router();

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const email = req.body.email?.trim().toLowerCase();

  if (!email || !password) {
    return res.redirect('/admin/login');
  }

  const emailValid = email === process.env.LOGIN_EMAIL;
  const passwordValid = emailValid && await bcrypt.compare(password, process.env.PASSWORD);

  if (!emailValid || !passwordValid) {
    return res.redirect('/admin/login');
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

  res.redirect('/admin');
});

router.post('/logout', auth, (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.redirect('/admin/login');
});

export default router;
