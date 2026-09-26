const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy, notifyUser, logCase } = require('../../utils/moderation');
const { parseDuration, formatDuration } = require('../../utils/time');

const MAX = 28 * 86_400_000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Rend un membre muet (timeout Discord, 28 jours max)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption((o) => o.setName('duree').setDescription('Durée (ex: 10m, 2h, 7j)').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    const duration = parseDuration(interaction.options.getString('duree'));
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    if (!duration || duration > MAX) return replyError(interaction, 'Durée invalide (max 28 jours). Exemples : `10m`, `2h`, `7j`.');
    const error = checkHierarchy(interaction.member, member, 'mute');
    if (error) return replyError(interaction, error);
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return replyError(interaction, 'Impossible de mute un administrateur.');
    await member.timeout(duration, `${reason} (par ${interaction.user.tag})`);
    const dmed = await notifyUser(member.user, interaction.guild, 'timeout', reason, duration);
    const record = await logCase(interaction.guild, { type: 'timeout', target: member.user, moderator: interaction.user, reason, duration });
    return replySuccess(interaction, `**${member.user.tag}** est muet pour **${formatDuration(duration)}**. (Cas #${record.id})${dmed ? '' : '\n*MP non délivré*'}`);
  },
};
