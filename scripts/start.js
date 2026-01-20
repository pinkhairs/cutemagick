import { spawn } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';

console.log(`Starting in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);

if (isDev) {
  console.log('Starting Tailwind CSS watcher...');
  
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

  tailwind.stdout.on('data', (data) => {
    console.log(`[Tailwind] ${data.toString()}`);
  });

  tailwind.stderr.on('data', (data) => {
    console.log(`[Tailwind] ${data.toString()}`);
  });

  tailwind.on('error', (error) => {
    console.error('[Tailwind Error]', error);
  });

  tailwind.on('exit', (code) => {
    console.log(`[Tailwind] Exited with code ${code}`);
  });

  const app = spawn('node', ['src/index.js'], { stdio: 'inherit' });

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