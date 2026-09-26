const { SlashCommandBuilder } = require('discord.js');
const { embed, truncate } = require('../../utils/embed');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription("Informations sur un rôle")
    .addRoleOption((o) => o.setName('role').setDescription('Rôle').setRequired(true)),
  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const perms = role.permissions.has('Administrator') ? ['Administrator'] : role.permissions.toArray();
    const e = embed(interaction.guild.id);
    if (role.color) e.setColor(role.color);
    return interaction.reply({
      embeds: [
        e
          .setTitle(`Rôle ${role.name}`)
          .addFields(
            { name: 'ID', value: `\`${role.id}\``, inline: true },
            { name: 'Couleur', value: role.hexColor, inline: true },
            { name: 'Membres', value: String(role.members.size), inline: true },
            { name: 'Position', value: String(role.position), inline: true },
            { name: 'Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
            { name: 'Géré (bot/intégration)', value: role.managed ? 'Oui' : 'Non', inline: true },
            { name: 'Créé', value: ts(role.createdTimestamp, 'R'), inline: true },
            { name: 'Permissions', value: truncate(perms.map((p) => `\`${p}\``).join(', ') || 'aucune') },
          ),
      ],
    });
  },
};
