import { execSync } from 'child_process';
import log from '../logs/index.js';

export function ensureGitIdentity(repoPath) {
  // Check for repo-local identity
  try {
    execSync('git config user.name', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.email', { cwd: repoPath, stdio: 'ignore' });
    return;
  } catch {
    // No repo-local identity set
  }

  log.debug('[git]', 'No repo-local identity found; ensuring bot identity');

  execSync('git config --global user.name "Cute Magick Bot"');
  execSync('git config --global user.email "bot@cutemagick.local"');
}
