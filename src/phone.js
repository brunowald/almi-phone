const { chromium } = require('playwright');
const logger = require('./utils/logger');

/**
 * Maneja el ciclo de vida de la "llamada" en Discord.
 * Estados: IDLE → CONNECTING → CONNECTED → HANGING_UP → IDLE
 *
 * Login: la primera vez el navegador queda abierto en la pantalla de Discord
 * y el usuario inicia sesion manualmente. La sesion se guarda en userDataDir
 * y las siguientes ejecuciones no necesitan login.
 */
async function createPhone({ voiceChannelUrl, userDataDir }) {
  let state = 'IDLE';
  let page = null;
  let context = null;

  const debugMode = process.env.DEBUG_MODE === 'true';

  logger.info('Iniciando navegador...');

  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    permissions: ['microphone'],
    slowMo: debugMode ? 500 : 0,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') logger.debug('[browser]', msg.text());
  });

  // Verificar si ya hay sesion activa
  async function _isLoggedIn() {
    try {
      await page.goto('https://discord.com/app', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      return !page.url().includes('/login');
    } catch {
      return false;
    }
  }

  // Si no hay sesion, mostrar la pagina de login y esperar a que el usuario
  // inicie sesion manualmente. Timeout de 5 minutos.
  async function _ensureLoggedIn() {
    if (await _isLoggedIn()) {
      logger.info('Sesion activa encontrada');
      return;
    }

    logger.info('================================================');
    logger.info('PRIMERA VEZ: inicia sesion en el navegador.');
    logger.info('La sesion se guardara automaticamente.');
    logger.info('Las proximas veces no hara falta hacer esto.');
    logger.info('================================================');

    await page.goto('https://discord.com/login');

    // Esperar hasta 5 minutos a que el usuario inicie sesion manualmente
    await page.waitForURL('**/channels/**', { timeout: 300000 });

    logger.info('Sesion iniciada correctamente — guardada para el futuro');
  }

  // Inicializar: asegurarse de tener sesion antes de que el boton funcione
  await _ensureLoggedIn();
  logger.info('almi-phone listo — presiona el boton para llamar');

  // Vuelca al terminal todos los data-list-item-id encontrados en la pagina.
  // Util para identificar el selector correcto del canal de voz.
  async function _debugDumpChannels() {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[data-list-item-id]')]
        .map((el) => el.getAttribute('data-list-item-id'))
    );
    if (ids.length === 0) {
      logger.warn('[DEBUG] No se encontro ningun elemento con data-list-item-id');
    } else {
      logger.info(`[DEBUG] data-list-item-id encontrados (${ids.length}):`);
      ids.forEach((id) => logger.info(`  → ${id}`));
    }
    return ids;
  }

  // Hace click en el canal de voz en el sidebar de Discord.
  // Discord identifica los canales con data-list-item-id="channels___CHANNEL_ID".
  async function _joinVoiceChannel() {
    const channelId = voiceChannelUrl.split('/').pop();
    const selector = `[data-list-item-id="channels___${channelId}"]`;

    if (debugMode) {
      logger.info(`[DEBUG] URL del canal: ${voiceChannelUrl}`);
      logger.info(`[DEBUG] Buscando selector: ${selector}`);
      await _debugDumpChannels();
      logger.info('[DEBUG] Abriendo Playwright Inspector — usa el selector de arriba para probar');
      await page.pause(); // abre el inspector visual
    }

    try {
      const el = page.locator(selector).first();
      await el.waitFor({ state: 'visible', timeout: 5000 });
      await el.click();
      logger.debug(`Click en canal: channels___${channelId}`);

      // Discord puede mostrar un boton "Unirse a la voz" / "Join Voice" luego de
      // navegar al canal. Intentar clickearlo si aparece.
      await page.waitForTimeout(1500);
      const joinBtn = page.locator(
        'button:has-text("Unirse a la voz"), button:has-text("Join Voice"), [class*="joinButton"]'
      ).first();
      if (await joinBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await joinBtn.click();
        logger.debug('Click en boton "Unirse a la voz"');
      }

      await page.waitForTimeout(500);
      return true;
    } catch (err) {
      logger.error(`No se encontro el canal en el sidebar (${selector}):`, err.message);
      if (debugMode) {
        logger.info('[DEBUG] Dump de IDs al momento del error:');
        await _debugDumpChannels();
        logger.info('[DEBUG] Pausa para inspeccionar — cierra el inspector para continuar');
        await page.pause();
      }
      return false;
    }
  }

  async function connect() {
    if (state !== 'IDLE') {
      logger.warn(`connect() ignorado — estado actual: ${state}`);
      return;
    }

    state = 'CONNECTING';
    logger.info('Conectando al canal de voz...');

    try {
      await page.goto(voiceChannelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Si por alguna razon expiro la sesion
      if (page.url().includes('/login')) {
        logger.warn('Sesion expirada, re-logueando...');
        await _ensureLoggedIn();
        await page.goto(voiceChannelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      }

      // Esperar a que cargue el sidebar de Discord
      await page.waitForSelector('[class*="sidebar"], [class*="guilds"], nav', { timeout: 10000 });
      await page.waitForTimeout(1500);

      const joined = await _joinVoiceChannel();
      if (!joined) {
        throw new Error('No se pudo encontrar ni hacer click en el canal de voz');
      }

      state = 'CONNECTED';
      logger.info('Conectado al canal de voz');
    } catch (err) {
      state = 'IDLE';
      logger.error('Error al conectar:', err.message);
      throw err;
    }
  }

  async function disconnect() {
    if (state !== 'CONNECTED') {
      logger.warn(`disconnect() ignorado — estado actual: ${state}`);
      return;
    }

    state = 'HANGING_UP';
    logger.info('Desconectando del canal de voz...');

    try {
      // Discord pone el boton de desconectar en la barra inferior de la llamada
      // El aria-label puede variar segun idioma
      const disconnectSelectors = [
        '[aria-label="Desconectar"]',
        '[aria-label="Disconnect"]',
        'button[aria-label*="isconnect"]',
        'button[aria-label*="esconect"]',
        // Icono de colgar (SVG con path conocido de Discord)
        'button[class*="hangup"], button[class*="disconnect"]',
      ];
      for (const selector of disconnectSelectors) {
        try {
          const btn = page.locator(selector).first();
          if (await btn.isVisible({ timeout: 800 })) {
            await btn.click();
            logger.debug(`Click en desconectar: ${selector}`);
            break;
          }
        } catch {
          // No encontrado
        }
      }

      await page.waitForTimeout(500);
    } catch (err) {
      logger.warn('Error al desconectar:', err.message);
    } finally {
      state = 'IDLE';
      logger.info('Desconectado');
    }
  }

  async function toggle() {
    if (state === 'IDLE') {
      await connect();
    } else if (state === 'CONNECTED') {
      await disconnect();
    } else {
      logger.warn(`toggle() ignorado — operacion en curso (estado: ${state})`);
    }
  }

  async function cleanup() {
    logger.info('Cerrando navegador...');
    try {
      await context.close();
    } catch {
      // Ignorar errores al cerrar
    }
  }

  return { connect, disconnect, toggle, cleanup, getState: () => state };
}

module.exports = { createPhone };
