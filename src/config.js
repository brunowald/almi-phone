require('dotenv').config();

const required = ['VOICE_CHANNEL_URL'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Error: falta la variable de entorno ${key}`);
    console.error('Copia .env.example a .env y completa los valores.');
    process.exit(1);
  }
}

module.exports = {
  discord: {
    voiceChannelUrl: process.env.VOICE_CHANNEL_URL,
  },
  button: {
    mode: process.env.BUTTON_MODE || 'keyboard',
    gpioPin: parseInt(process.env.GPIO_PIN || '17', 10),
  },
  userDataDir: process.env.USER_DATA_DIR || './discord-session',
  logLevel: process.env.LOG_LEVEL || 'info',
};
