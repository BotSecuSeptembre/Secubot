const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { embed, replyError, replySuccess } = require('../../utils/embed');

// Rôles qu'on ne doit JAMAIS pouvoir s'auto-attribuer
const DANGEROUS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageNicknames,
];

const builder = new SlashCommandBuilder()
  .setName('rolepanel')
  .setDescription('Crée un panneau de rôles à cliquer (notifications, jeux, pronoms...)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addChannelOption((o) => o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText))
  .addStringOption((o) => o.setName('titre').setDescription('Titre du panneau').setRequired(true).setMaxLength(200))
  .addRoleOption((o) => o.setName('role1').setDescription('Rôle 1').setRequired(true));
for (let i = 2; i <= 10; i++) builder.addRoleOption((o) => o.setName(`role${i}`).setDescription(`Rôle ${i}`));
builder.addStringOption((o) => o.setName('description').setDescription('Texte du panneau (\\n = retour à la ligne)').setMaxLength(1500));

module.exports = {
  DANGEROUS,
  data: builder,
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon');
    const roles = [];
    for (let i = 1; i <= 10; i++) {
      const role = interaction.options.getRole(`role${i}`);
      if (role && !roles.some((r) => r.id === role.id)) roles.push(role);
    }
    for (const role of roles) {
      if (role.managed || role.id === interaction.guild.id || !role.editable) return replyError(interaction, `Je ne peux pas gérer ${role}.`);
      if (role.permissions.any(DANGEROUS)) return replyError(interaction, `Par sécurité, ${role} a des permissions de modération : il ne peut pas être en libre-service.`);
      if (interaction.user.id !== interaction.guild.ownerId && role.position >= interaction.member.roles.highest.position) {
        return replyError(interaction, `${role} est supérieur ou égal à ton rôle le plus haut.`);
      }
    }
    const rows = [];
    for (let i = 0; i < roles.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          roles.slice(i, i + 5).map((r) => new ButtonBuilder().setCustomId(`selfrole:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)),
        ),
      );
    }
    const description = (interaction.options.getString('description') ?? 'Clique sur un bouton pour obtenir ou retirer le rôle correspondant.').replace(/\\n/g, '\n');
    await channel.send({
      embeds: [embed(interaction.guild.id).setTitle(interaction.options.getString('titre')).setDescription(`${description}\n\n${roles.map((r) => `• ${r}`).join('\n')}`)],
      components: rows,
    });
    return replySuccess(interaction, `Panneau de rôles envoyé dans ${channel}.`, true);
  },
};
