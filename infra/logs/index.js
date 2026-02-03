const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL = process.env.LOG_LEVEL || 'info';

function normalizeLevel(level) {
  return LEVELS[level] ?? LEVELS.info;
}

const ACTIVE_LEVEL = normalizeLevel(DEFAULT_LEVEL);

function shouldLog(level) {
  return normalizeLevel(level) >= ACTIVE_LEVEL;
}

function formatPrefix(level, scope) {
  const tag = scope ? `[${scope}]` : '';
  return `${level.toUpperCase()}${tag}`;
}

function logAt(level, scope, args) {
  if (!shouldLog(level)) return;

  const prefix = formatPrefix(level, scope);

  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
      ? console.warn
      : console.log;

  fn(prefix, ...args);
}

function createLogger(scope) {
  return {
    debug: (...args) => logAt('debug', scope, args),
    info: (...args) => logAt('info', scope, args),
    warn: (...args) => logAt('warn', scope, args),
    error: (...args) => logAt('error', scope, args),
  };
}

const log = createLogger();

export default log;
export { createLogger };
