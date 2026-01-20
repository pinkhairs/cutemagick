import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('🌙 Starting Cute Magick development servers...\n');

// Debug: verify paths exist
const inputPath = path.join(ROOT, 'src/dashboard/app.css');
const outputPath = path.join(ROOT, 'src/dashboard/assets/css/style.css');

console.log('Building Tailwind CSS...');

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const tailwind = spawn(
  'npx',
  [
    '@tailwindcss/cli',
    '-i', inputPath,
    '-o', outputPath
    // No --watch!
  ],
  {
    stdio: 'pipe',
    cwd: ROOT,
    shell: true
  }
);

tailwind.stdout.on('data', (data) => {
  console.log(`[Tailwind] ${data.toString().trim()}`);
});

tailwind.stderr.on('data', (data) => {
  console.log(`[Tailwind] ${data.toString().trim()}`);
});

tailwind.on('exit', (code) => {
  if (code === 0) {
    console.log('✓ Tailwind CSS built successfully\n');
  } else {
    console.error(`✗ Tailwind build failed with code ${code}\n`);
  }
  
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
});