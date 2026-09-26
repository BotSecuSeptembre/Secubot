const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy, addWarn } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setRequired(true).setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const error = checkHierarchy(interaction.member, member, 'avertir');
    if (error) return replyError(interaction, error);
    const { count, applied } = await addWarn(interaction.guild, member, interaction.user, reason);
    return replySuccess(
      interaction,
      `**${member.user.tag}** a reçu un avertissement (**${count}** au total).${applied ? `\n⚙️ Sanction automatique : **${applied}**` : ''}`,
    );
  },
};
