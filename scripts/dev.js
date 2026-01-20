import { spawn } from 'child_process';

console.log('🌙 Starting Cute Magick development servers...\n');

// Start Tailwind CSS watcher
const tailwind = spawn(
  'npm',
  [
    'exec',
    '@tailwindcss/cli',
    '--',
    '-i', 'src/dashboard/app.css',
    '-o', 'src/dashboard/assets/css/style.css',
    '--watch'
  ],
  {
    stdio: 'inherit',
    shell: true
  }
);

// Start Express with nodemon
const express = spawn('nodemon', [
  '--watch', 'src',
  '--ext', 'js,html,css',
  'src/index.js'
], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_ENV: 'development' }
});

process.on('SIGINT', () => {
  console.log('\n\n🌙 Shutting down...');
  tailwind.kill();
  express.kill();
  process.exit();
});

express.on('exit', () => {
  tailwind.kill();
  process.exit();
});

tailwind.on('exit', () => {
  express.kill();
  process.exit();
});