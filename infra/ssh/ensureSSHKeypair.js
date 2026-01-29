import fs from 'fs';
import { execFileSync } from 'child_process';

import log from '../logs/index.js';
import {
  SSH_DIR,
  SSH_PRIVATE_KEY_PATH,
  SSH_PUBLIC_KEY_PATH,
} from '../../config/index.js';

/* ----------------------------
   Ensure SSH keypair
----------------------------- */

export function ensureSSHKeypair() {
  log.debug('[ssh]', 'ensureSSHKeypair called');
  log.debug('[ssh]', 'SSH_DIR:', SSH_DIR);
  log.debug('[ssh]', 'PRIVATE_KEY:', SSH_PRIVATE_KEY_PATH);
  log.debug('[ssh]', 'PUBLIC_KEY:', SSH_PUBLIC_KEY_PATH);

  // Ensure directory exists
  if (!fs.existsSync(SSH_DIR)) {
    log.info('[ssh]', 'creating ssh directory', SSH_DIR);
    fs.mkdirSync(SSH_DIR, { recursive: true });
  }

  // Idempotent: key already exists
  if (fs.existsSync(SSH_PRIVATE_KEY_PATH)) {
    log.debug('[ssh]', 'ssh key already exists');
    return;
  }

  log.info('[ssh]', 'generating ssh keypair');

  execFileSync(
    'ssh-keygen',
    [
      '-t', 'ed25519',
      '-f', SSH_PRIVATE_KEY_PATH,
      '-N', '',
      '-C', 'cute-magick',
    ],
    { stdio: 'ignore' }
  );

  // Lock down permissions
  fs.chmodSync(SSH_PRIVATE_KEY_PATH, 0o600);
  fs.chmodSync(SSH_PUBLIC_KEY_PATH, 0o644);

  log.info('[ssh]', 'ssh keypair generated');
}
