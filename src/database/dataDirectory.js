const fs = require('node:fs');
const path = require('node:path');

function getDataDirectory() {
  const configuredDirectory = process.env.FYXBOT_DATA_DIR?.trim()
    || process.env.NEXORA_DATA_DIR?.trim()
    || process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  const dataDirectory = configuredDirectory
    ? path.resolve(configuredDirectory)
    : path.join(__dirname, '..', '..', 'data');

  fs.mkdirSync(dataDirectory, { recursive: true });
  try { fs.chmodSync(dataDirectory, 0o700); } catch { /* Certains volumes Windows ne prennent pas en charge chmod. */ }
  return dataDirectory;
}

module.exports = { getDataDirectory };
