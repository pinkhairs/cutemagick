import { spawn } from 'child_process';

console.log('🌙 Starting Cute Magick development servers...\n');

// Start Vite with explicit config
const vite = spawn('vite', ['--config', 'vite.config.js'], {
  stdio: 'inherit',
  shell: true
});

setTimeout(() => {
  const express = spawn('nodemon', ['--watch', 'src', '--ignore', 'src/dashboard', 'src/index.js'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  process.on('SIGINT', () => {
    console.log('\n\n🌙 Shutting down...');
    vite.kill();
    express.kill();
    process.exit();
  });

  express.on('exit', () => {
    vite.kill();
    process.exit();
  });

  vite.on('exit', () => {
    express.kill();
    process.exit();
  });
}, 1000);