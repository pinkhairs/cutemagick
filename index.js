const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Cute Magick - Check the README</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          max-width: 600px;
          margin: 80px auto;
          padding: 20px;
          line-height: 1.6;
          color: #333;
        }
        h1 {
          font-size: 2em;
          margin-bottom: 0.5em;
        }
        a {
          color: #7c3aed;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .note {
          background: #f9f9f9;
          padding: 20px;
          border-radius: 8px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <h1>✨ Cute Magick</h1>
      <p>This is a placeholder server. The real code is being developed on the <code>dev</code> branch.</p>
      <div class="note">
        <p><strong>Please check the README.md for information about the project.</strong></p>
        <p>Active development happens on the <code>dev</code> branch. The <code>main</code> branch will receive stable releases starting February 2026.</p>
        <p>Visit <a href="https://cutemagick.com">cutemagick.com</a> or email <a href="mailto:me@diana.nu">me@diana.nu</a> for updates.</p>
      </div>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`Placeholder server running on port ${PORT}`);
  console.log('Check the README.md for project information');
  console.log('Development happens on the dev branch');
});