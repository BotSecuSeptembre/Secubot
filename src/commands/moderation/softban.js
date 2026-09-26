const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy, notifyUser, logCase } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Bannit puis débannit un membre pour effacer ses messages (7 jours)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const error = checkHierarchy(interaction.member, member, 'softban');
    if (error) return replyError(interaction, error);
    await notifyUser(member.user, interaction.guild, 'softban', reason);
    await member.ban({ reason: `Softban : ${reason} (par ${interaction.user.tag})`, deleteMessageSeconds: 604800 });
    await interaction.guild.members.unban(member.id, 'Softban : levée automatique');
    const record = await logCase(interaction.guild, { type: 'softban', target: member.user, moderator: interaction.user, reason });
    return replySuccess(interaction, `**${member.user.tag}** a été softban (messages supprimés). (Cas #${record.id})`);
  },
};
