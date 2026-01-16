import app from './server.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🌙 Cute Magick running on http://localhost:${PORT}\n`);
});
