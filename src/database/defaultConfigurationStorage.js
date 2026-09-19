const { resolveRuntimeStore } = require('./runtimeStorage');

function selectedStorage() {
  return resolveRuntimeStore('configuration') || require('./database');
}

const defaultStorage = {
  getConfiguration: (...args) => selectedStorage().getConfiguration(...args),
  getGuildConfigurations: (...args) => selectedStorage().getGuildConfigurations(...args),
  replaceGuildConfigurations: (...args) => selectedStorage().replaceGuildConfigurations(...args),
  setConfiguration: (...args) => selectedStorage().setConfiguration(...args),
};

Object.defineProperty(defaultStorage, 'updateConfiguration', {
  get() {
    return resolveRuntimeStore('configuration')?.updateConfiguration;
  },
});

module.exports = defaultStorage;
