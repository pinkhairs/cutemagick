import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const isDev = process.env.NODE_ENV === 'development';
/* -------------------------------------------------
   Paths
-------------------------------------------------- */
const APP_ROOT = '/app';
const INPUT_CSS = path.join(
  APP_ROOT,
  'src',
  'dashboard',
  'app.css'
);
const OUTPUT_CSS = path.join(
  APP_ROOT,
  'data',
  'assets',
  'style.css'
);
const OUTPUT_DIR = path.dirname(OUTPUT_CSS);
/* -------------------------------------------------
   Helpers
-------------------------------------------------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function buildTailwindOnce() {
  execSync(
    `npx @tailwindcss/cli -i ${INPUT_CSS} -o ${OUTPUT_CSS}`,
    { stdio: 'inherit' }
  );
}
/* -------------------------------------------------
   Startup
-------------------------------------------------- */
// ALWAYS ensure directories exist (dev AND prod)
// console.log('ensuring css output directory');
// ensureDir(OUTPUT_DIR);
if (isDev) {
  console.log('[dev] building tailwind (one-time)');
  buildTailwindOnce();
  console.log('[dev] starting tailwind watch');
  const tailwind = spawn(
    'npx',
    [
      '@tailwindcss/cli',
      '-i', INPUT_CSS,
      '-o', OUTPUT_CSS,
      '--watch',
      '--poll'
    ],
    { stdio: 'inherit', shell: true }
  );
  console.log('[dev] starting app');
  const app = spawn(
    'node',
    ['--watch', 'src/index.js'],
    { stdio: 'inherit' }
  );
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    tailwind.kill();
    app.kill();
    process.exit();
  });
} else {
  console.log('[prod] building tailwind (one-time)');
  buildTailwindOnce();
  console.log('[prod] running app');
  const app = spawn('node', ['src/index.js'], { stdio: 'inherit' });
  
  // Keep the process alive and handle exit
  app.on('exit', (code) => {
    console.log(`App exited with code ${code}`);
    process.exit(code);
  });
  
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    app.kill('SIGTERM');
  });
}