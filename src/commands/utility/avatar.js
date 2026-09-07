const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l’avatar d’un utilisateur.')
    .addUserOption((option) => option.setName('utilisateur').setDescription('Utilisateur concerné')),

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur') || interaction.user;
    const url = user.displayAvatarURL({ extension: 'png', size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(`Avatar de ${user.tag}`)
      .setImage(url)
      .setDescription(`[Télécharger l’avatar](${url})`);
    await interaction.reply({ embeds: [embed] });
  },
};
