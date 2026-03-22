const logger = require('../utils/logger');

/**
 * Botón físico via GPIO para Raspberry Pi.
 * Usa el paquete `onoff`. El botón debe estar conectado entre el pin GPIO y GND.
 * activeLow: true → el pin lee 0 cuando el botón está presionado.
 */
class GpioButton {
  constructor(pin) {
    let Gpio;
    try {
      Gpio = require('onoff').Gpio;
    } catch {
      throw new Error('Paquete onoff no disponible. Solo funciona en Raspberry Pi.');
    }

    this._pressCallback = null;
    this._gpio = new Gpio(pin, 'in', 'rising', {
      debounceTimeout: 50,
      activeLow: true,
    });

    this._gpio.watch((err, value) => {
      if (err) {
        logger.error('Error en GPIO:', err);
        return;
      }
      if (value === 1) {
        logger.debug(`GPIO pin ${pin} activado`);
        this._pressCallback?.();
      }
    });

    logger.info(`Modo GPIO activo — pin BCM ${pin} listo`);
  }

  onPress(callback) {
    this._pressCallback = callback;
  }

  destroy() {
    this._gpio.unexport();
  }
}

module.exports = { GpioButton };
