const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const configLevel = process.env.LOG_LEVEL || 'info';
const minLevel = LEVELS[configLevel] ?? 1;

function log(level, ...args) {
  if (LEVELS[level] < minLevel) return;
  const ts = new Date().toLocaleTimeString('es-AR');
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

module.exports = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
