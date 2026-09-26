const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy, notifyUser, logCase } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const error = checkHierarchy(interaction.member, member, 'expulser');
    if (error) return replyError(interaction, error);
    const dmed = await notifyUser(member.user, interaction.guild, 'kick', reason);
    await member.kick(`${reason} (par ${interaction.user.tag})`);
    const record = await logCase(interaction.guild, { type: 'kick', target: member.user, moderator: interaction.user, reason });
    return replySuccess(interaction, `**${member.user.tag}** a été expulsé. (Cas #${record.id})${dmed ? '' : '\n*MP non délivré*'}`);
  },
};
