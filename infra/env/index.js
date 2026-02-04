import log from '../logs/index.js';

const DEFAULTS = {
  LOG_LEVEL: 'info',
  PORT: 3000,
  PREVIEW_TTL_MS: 1000 * 60 * 60 * 24, // 24h
};

function requireVar(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseNumber(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;

  const num = Number(raw);
  if (Number.isNaN(num)) {
    log.warn(
      `[env] Invalid number for ${name}="${raw}", defaulting to ${defaultValue}`
    );
    return defaultValue;
  }

  return num;
}

function parseEnum(name, allowed, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  if (!allowed.includes(raw)) {
    log.warn(
      `[env] Invalid value for ${name}="${raw}", allowed: ${allowed.join(
        ', '
      )}. Defaulting to "${defaultValue}"`
    );
    return defaultValue;
  }

  return raw;
}

export function validateEnv() {
  const jwtSecret = requireVar('JWT_SECRET');
  validateJwtSecret(jwtSecret);

  const logLevel = parseEnum(
    'LOG_LEVEL',
    ['debug', 'info', 'warn', 'error'],
    DEFAULTS.LOG_LEVEL
  );

  const port = parseNumber('PORT', DEFAULTS.PORT);

  log.info('[env] Environment validated', {
    logLevel,
    port,
});
}

export function parseNumberFrom(obj, name, defaultValue) {
  const raw = obj[name];
  if (raw == null || raw === '') return defaultValue;

  const num = Number(raw);
  if (Number.isNaN(num)) {
    log.warn(
      `[env] Invalid number for ${name}="${raw}", defaulting to ${defaultValue}`
    );
    return defaultValue;
  }

  return num;
}

export function parseEnumFrom(obj, name, allowed, defaultValue) {
  const raw = obj[name];
  if (!raw) return defaultValue;

  if (!allowed.includes(raw)) {
    log.warn(
      `[env] Invalid value for ${name}="${raw}", allowed: ${allowed.join(
        ', '
      )}. Defaulting to "${defaultValue}"`
    );
    return defaultValue;
  }

  return raw;
}
