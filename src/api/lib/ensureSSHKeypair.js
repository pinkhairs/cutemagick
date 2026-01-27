import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const SSH_DIR = '/app/.ssh';
const PRIVATE_KEY = path.join(SSH_DIR, 'id_ed25519');
const PUBLIC_KEY  = `${PRIVATE_KEY}.pub`;

export function ensureSSHKeypair() {
  fs.mkdirSync(SSH_DIR, { recursive: true });

  if (fs.existsSync(PRIVATE_KEY)) return;

  execFileSync('ssh-keygen', [
    '-t', 'ed25519',
    '-f', PRIVATE_KEY,
    '-N', '',
    '-C', 'cute-magick'
  ], { stdio: 'ignore' });

  fs.chmodSync(PRIVATE_KEY, 0o600);
  fs.chmodSync(PUBLIC_KEY, 0o644);
}
