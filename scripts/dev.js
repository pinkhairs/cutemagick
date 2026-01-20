import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('🌙 Starting Cute Magick development servers...\n');

// Start Express after Tailwind finishes
const express = spawn(
  'node',
  ['src/index.js'],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
    cwd: ROOT
  }
);

process.on('SIGINT', () => {
  console.log('\n\n🌙 Shutting down...');
  express.kill();
  process.exit();
});

express.on('exit', () => {
  process.exit();
});