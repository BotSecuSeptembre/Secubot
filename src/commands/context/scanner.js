const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { analyzeMember } = require('../../utils/analysis');
const { buildVerificationEmbeds } = require('../../utils/verification');
const { replyError } = require('../../utils/embed');

/** Clic droit sur un membre > Applications > Scanner le membre */
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Scanner le membre')
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.targetId).catch(() => null);
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    await interaction.deferReply({ ephemeral: true });
    const analysis = await analyzeMember(member);
    return interaction.editReply({ embeds: buildVerificationEmbeds(analysis) });
  },
};
