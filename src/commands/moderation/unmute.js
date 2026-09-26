const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { logCase } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription("Retire le mute (timeout) d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    if (!member.isCommunicationDisabled()) return replyError(interaction, "Ce membre n'est pas muet.");
    await member.timeout(null, `${reason} (par ${interaction.user.tag})`);
    const record = await logCase(interaction.guild, { type: 'untimeout', target: member.user, moderator: interaction.user, reason });
    return replySuccess(interaction, `**${member.user.tag}** peut de nouveau parler. (Cas #${record.id})`);
  },
};
