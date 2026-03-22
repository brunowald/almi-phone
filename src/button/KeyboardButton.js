const logger = require('../utils/logger');

/**
 * Botón de teclado para desarrollo en desktop.
 * Spacebar = toggle (conectar/desconectar).
 * Ctrl+C = salir.
 */
class KeyboardButton {
  constructor() {
    this._pressCallback = null;
    this._active = false;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
      // Ctrl+C
      if (key === '\u0003') {
        process.exit();
      }
      // Spacebar
      if (key === ' ') {
        logger.debug('Tecla spacebar presionada');
        this._pressCallback?.();
      }
    });

    logger.info('Modo teclado activo — presioná ESPACIO para conectar/desconectar');
  }

  onPress(callback) {
    this._pressCallback = callback;
  }

  destroy() {
    process.stdin.pause();
  }
}

module.exports = { KeyboardButton };
