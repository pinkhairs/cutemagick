import fs from 'fs';
import { SSH_PUBLIC_KEY_PATH, SSH_DIR } from '../../config/index.js';

export function getPublicSSHKey() {
  if (!fs.existsSync(SSH_PUBLIC_KEY_PATH)) {
    console.error('[SSH] missing public key, dir contents:',
      fs.existsSync(SSH_DIR) ? fs.readdirSync(SSH_DIR) : '(no dir)'
    );
    throw new Error('Public SSH key not found');
  }

  return fs.readFileSync(SSH_PUBLIC_KEY_PATH, 'utf8').trim();
}
