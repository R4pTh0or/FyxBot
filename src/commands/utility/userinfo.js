const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Affiche les informations d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné')),

  async execute(interaction) {
    const user = interaction.options.getUser('membre') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const roles = member?.roles.cache
      .filter((role) => role.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .first(10)
      .join(' ') || 'Aucun rôle';
    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0xf97316)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: 'Identifiant', value: user.id, inline: true },
        { name: 'Compte créé', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Arrivée sur le serveur', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Membre absent', inline: true },
        { name: `Rôles${member && member.roles.cache.size > 11 ? ' (10 premiers)' : ''}`, value: roles },
      )
      .setFooter({ text: user.bot ? 'Compte bot' : 'Compte utilisateur' });
    await interaction.reply({ embeds: [embed] });
  },
};
