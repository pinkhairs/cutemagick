import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export async function ensureGitIdentity(repoPath) {
  try {
    await exec('git', ['config', 'user.name'], { cwd: repoPath });
    await exec('git', ['config', 'user.email'], { cwd: repoPath });
    return;
  } catch {
    // not set
  }

  await exec('git', ['config', 'user.name', 'Cute Magick Bot'], {
    cwd: repoPath
  });
  await exec('git', ['config', 'user.email', 'bot@cutemagick.local'], {
    cwd: repoPath
  });
}
