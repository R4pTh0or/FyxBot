require('dotenv').config();
const { migrateLegacyLocalBackups } = require('../src/services/serverBackup');

migrateLegacyLocalBackups()
  .then((count) => console.log(`[FyxBot] ${count} sauvegarde(s) locale(s) chiffrée(s) et vérifiée(s).`))
  .catch((error) => {
    console.error(`[FyxBot] Migration interrompue : ${error.message}`);
    process.exitCode = 1;
  });
