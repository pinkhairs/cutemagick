import express from 'express';
import fs from 'fs';
const router = express.Router();

import path from 'path';

const SSH_DIR = '/app/.ssh';
const PUBLIC_KEY_PATH = path.join(SSH_DIR, 'id_ed25519.pub');



function readPublicKey() {
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    throw new Error('Public SSH key not found');
  }
  return fs.readFileSync(PUBLIC_KEY_PATH, 'utf8').trim();
}

/* ----------------------------
   Routes
----------------------------- */

/**
 * POST /connect/public-key
 * Returns the public SSH key (plaintext)
 */
router.post('/public-key', (req, res) => {
  try {
    const key = readPublicKey();
    res.type('text/plain').send(key);
  } catch (err) {
    res.status(500).send('Failed to read public SSH key');
  }
});

export default router;