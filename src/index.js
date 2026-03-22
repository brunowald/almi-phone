const config = require('./config');
const { createPhone } = require('./phone');
const { KeyboardButton } = require('./button/KeyboardButton');
const { GpioButton } = require('./button/GpioButton');
const logger = require('./utils/logger');

async function main() {
  // Crear el controlador del telefono (abre el navegador)
  const phone = await createPhone({
    voiceChannelUrl: config.discord.voiceChannelUrl,
    userDataDir: config.userDataDir,
  });

  // Seleccionar el tipo de boton segun la configuracion
  const button = config.button.mode === 'gpio'
    ? new GpioButton(config.button.gpioPin)
    : new KeyboardButton();

  // Cada vez que se presiona el boton, alternar conectado/desconectado
  button.onPress(async () => {
    try {
      await phone.toggle();
    } catch (err) {
      logger.error('Error en toggle:', err.message);
    }
  });

  // Limpieza al salir
  async function shutdown() {
    logger.info('Apagando...');
    button.destroy();
    await phone.cleanup();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('almi-phone listo');
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err.message);
  process.exit(1);
});
