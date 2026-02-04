function fail(msg) {
  console.error(`\n❌ Cute Magick misconfiguration:\n- ${msg}\n`);
  process.exit(1);
}

function requireVar(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) fail(`${name} must be defined`);
  return String(v).trim();
}

export function validateEnv() {
  // Required
  const JWT_SECRET = requireVar('JWT_SECRET');
  const LOGIN_EMAIL = requireVar('LOGIN_EMAIL');
  const PASSWORD = requireVar('PASSWORD');

  // Guard against accidental dev secret usage
  if (JWT_SECRET.includes('put-a-long-random-string-here') || JWT_SECRET.length < 16) {
    fail(`JWT_SECRET looks unsafe. Use a long random secret (>= 32 chars recommended).`);
  }

  // bcrypt hash format validation
  if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(PASSWORD)) {
    fail(`PASSWORD must be a bcrypt hash. Example: node -e "console.log(require('bcrypt').hashSync('your_password', 10))"`);
  }

  // LOGIN_EMAIL can be any string; no need to validate format
  return { JWT_SECRET, LOGIN_EMAIL, PASSWORD };
}
