import express from 'express';
import { getPublicSSHKey } from '../../../infra/ssh/index.js';

const router = express.Router();

/* ----------------------------
   Routes
----------------------------- */

/**
 * POST /connect/public-key
 * Returns the public SSH key (plaintext)
 */
router.post('/public-key', (req, res) => {
  try {
    const key = getPublicSSHKey();
    res.type('text/plain').send(key);
  } catch (err) {
    res.status(500).send('Failed to read public SSH key');
  }
});

export default router;
