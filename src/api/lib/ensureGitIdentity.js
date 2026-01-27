import { execSync } from 'child_process';

export default function ensureGitIdentity(sitePath) {
  const name = process.env.GIT_NAME || 'Cute Magick';
  const email = process.env.GIT_EMAIL || 'cutemagick@local';

  try {
    execSync('git config user.name', { cwd: sitePath });
    execSync('git config user.email', { cwd: sitePath });
    return;
  } catch {
    // identity not set yet
  }
  execSync('git config --global user.name "Cute Magick"');
  execSync('git config --global user.email "cute@magick.local"');
}
