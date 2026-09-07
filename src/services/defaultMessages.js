const DEFAULT_WELCOME_MESSAGE = 'Bienvenue {membre} sur **{serveur}** ! Tu es notre **{nombre}e membre** 🎉';
const DEFAULT_LEAVE_MESSAGE = '**{membre}** a quitté **{serveur}**. Nous sommes maintenant **{nombre} membres**.';
const DEFAULT_BIRTHDAY_MESSAGE = 'Joyeux anniversaire {membres} ! Toute la communauté de **{serveur}** te souhaite une excellente journée 🎉';

function configuredMessage(value, fallback) {
  const message = String(value || '').trim();
  return message || fallback;
}

module.exports = {
  DEFAULT_BIRTHDAY_MESSAGE,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  configuredMessage,
};
