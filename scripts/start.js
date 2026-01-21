import { spawn } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  // Development: run Tailwind watch + app
  const tailwind = spawn('npx', [
    '@tailwindcss/cli',
    '-i', 'src/dashboard/app.css',
    '-o', 'src/dashboard/assets/css/style.css',
    '--watch'
  ], { 
    stdio: 'pipe',  // Changed from 'inherit' to capture output
    shell: true 
  });

  const app = spawn('node', ['--watch', 'src/index.js'], { stdio: 'inherit' });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    tailwind.kill();
    app.kill();
    process.exit();
  });
} else {
  // Production: just run the app (CSS already built)
  console.log('Running app (production mode)');
  spawn('node', ['src/index.js'], { stdio: 'inherit' });
}