import { execFile } from 'child_process';
import { promisify } from 'util';
import log from '../logs/index.js';

const execFileAsync = promisify(execFile);

/**
 * Run an external process safely.
 *
 * @param {string} command - executable name (e.g. 'git')
 * @param {string[]} args - argument list
 * @param {object} options
 * @param {string} [options.cwd] - working directory
 * @param {object} [options.env] - env overrides
 * @param {boolean} [options.allowFailure=false] - do not throw on non-zero exit
 */
export async function runProcess(
  command,
  args = [],
  {
    cwd,
    env,
    allowFailure = false,
  } = {}
) {
  log.debug('[process]', command, args.join(' '));

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      env,
    });

    if (stderr) {
      log.debug('[process:stderr]', stderr.trim());
    }

    return {
      stdout: stdout?.toString() ?? '',
      stderr: stderr?.toString() ?? '',
    };
  } catch (err) {
    if (allowFailure) {
      log.warn('[process]', 'command failed but allowed', command);
      return {
        stdout: err.stdout?.toString() ?? '',
        stderr: err.stderr?.toString() ?? err.message,
        error: err,
      };
    }

    log.error('[process]', command, 'failed');
    log.error('[process]', err.stderr?.toString() || err.message);
    throw err;
  }
}
