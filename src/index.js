import app from './server.js';

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV === 'development';

app.listen(PORT, () => {
  console.log(`\n🌙 Cute Magick running on http://localhost:${PORT}`);
  
  if (isDev) {
    console.log(`   Dashboard: http://localhost:${PORT}/admin`);
    console.log(`   (Vite dev server on :5173 with HMR)\n`);
  } else {
    console.log(`   Dashboard: http://localhost:${PORT}/admin\n`);
  }
});