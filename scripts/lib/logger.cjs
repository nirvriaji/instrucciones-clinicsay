/**
 * Simple console logger with levels.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = LEVELS.info;

function setLevel(level) {
  currentLevel = LEVELS[level] ?? LEVELS.info;
}

function log(level, message) {
  if (LEVELS[level] >= currentLevel) {
    const prefix = `[${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  }
}

module.exports = { setLevel, debug: (m) => log('debug', m), info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m) };
