import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  root: 'src/dashboard',
  server: {
    port: 5173
  },
  build: {
    outDir: '../../public',
    emptyOutDir: true
  },
  logLevel: 'info'
});