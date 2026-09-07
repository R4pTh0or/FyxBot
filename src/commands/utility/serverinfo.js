const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Affiche les informations du serveur.'),

  async execute(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: 'Identifiant', value: guild.id, inline: true },
        { name: 'Propriétaire', value: owner ? `${owner}` : 'Inconnu', inline: true },
        { name: 'Membres', value: guild.memberCount.toString(), inline: true },
        { name: 'Salons', value: guild.channels.cache.size.toString(), inline: true },
        { name: 'Rôles', value: guild.roles.cache.size.toString(), inline: true },
        { name: 'Création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: 'FyxBot • Informations du serveur' });
    await interaction.reply({ embeds: [embed] });
  },
};
