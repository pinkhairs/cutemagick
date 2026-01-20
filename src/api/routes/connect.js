import express from 'express';
import fs from 'fs';
import path from 'path';
import { rotateSSHKeypair } from '../lib/index.js';

const router = express.Router();

/* ----------------------------
   Helpers
----------------------------- */

// Adjust if your key paths live elsewhere
const SSH_DIR = '/app/.ssh';
const PRIVATE_KEY_PATH = path.join(SSH_DIR, 'id_ed25519');
const PUBLIC_KEY_PATH = `${PRIVATE_KEY_PATH}.pub`;

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

/**
 * POST /connect/rotate-key
 * Regenerates the SSH keypair
 */
router.post('/rotate-key', (req, res) => {
  try {
    rotateSSHKeypair();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Failed to rotate SSH key');
  }
});

export default router;
