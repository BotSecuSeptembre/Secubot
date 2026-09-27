const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { embed, truncate } = require('../../utils/embed');

const IMPORTANT = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages',
  'ManageWebhooks', 'MentionEveryone', 'ManageNicknames', 'ViewAuditLog', 'ViewChannel', 'SendMessages', 'AttachFiles', 'EmbedLinks', 'Connect', 'Speak', 'MoveMembers',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perms')
    .setDescription("Affiche les permissions réelles d'un membre (dans un salon)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (sinon : permissions du serveur)')),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply({ content: "Ce membre n'est pas sur le serveur.", ephemeral: true });
    const channel = interaction.options.getChannel('salon');
    const perms = channel ? channel.permissionsFor(member) : member.permissions;
    const admin = perms.has(PermissionFlagsBits.Administrator);
    const line = (p) => `${perms.has(PermissionsBitField.Flags[p]) ? '✅' : '❌'} ${p}`;
    const all = perms.toArray().filter((p) => !IMPORTANT.includes(p));
    return interaction.reply({
      ephemeral: true,
      embeds: [
        embed(interaction.guild.id)
          .setAuthor({ name: `Permissions de ${member.user.tag}`, iconURL: member.user.displayAvatarURL() })
          .setDescription(`${channel ? `Dans ${channel}` : 'Sur le serveur'}${admin ? '\n⚠️ **Administrateur** : a TOUTES les permissions partout.' : ''}`)
          .addFields(
            { name: 'Permissions importantes', value: IMPORTANT.map(line).join('\n') },
            { name: 'Autres permissions accordées', value: truncate(all.join(', ') || 'aucune') },
          ),
      ],
    });
  },
};
