import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SSH_DIR = '/app/.ssh';
const PRIVATE_KEY = path.join(SSH_DIR, 'id_ed25519');
const PUBLIC_KEY = `${PRIVATE_KEY}.pub`;

export function ensureSSHKeypair() {
  if (fs.existsSync(PRIVATE_KEY) && fs.existsSync(PUBLIC_KEY)) {
    return fs.readFileSync(PUBLIC_KEY, 'utf8').trim();
  }

  return generateSSHKeypair();
}

export function rotateSSHKeypair() {
  if (fs.existsSync(PRIVATE_KEY)) fs.unlinkSync(PRIVATE_KEY);
  if (fs.existsSync(PUBLIC_KEY)) fs.unlinkSync(PUBLIC_KEY);

  return generateSSHKeypair();
}

function generateSSHKeypair() {
  fs.mkdirSync(SSH_DIR, { recursive: true });

  execSync(
    `ssh-keygen -t ed25519 -f ${PRIVATE_KEY} -N "" -C "cute-magick"`,
    { stdio: 'ignore' }
  );

  return fs.readFileSync(PUBLIC_KEY, 'utf8').trim();
}
