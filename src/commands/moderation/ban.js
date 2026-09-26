const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy, notifyUser, logCase } = require('../../utils/moderation');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un utilisateur (même absent du serveur), éventuellement temporairement')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur (ou ID)').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(500))
    .addStringOption((o) => o.setName('duree').setDescription('Durée pour un ban temporaire (ex: 1h, 7j)'))
    .addIntegerOption((o) =>
      o
        .setName('supprimer_messages')
        .setDescription('Supprimer les messages des X derniers jours')
        .addChoices({ name: 'Aucun', value: 0 }, { name: '1 heure', value: 3600 }, { name: '1 jour', value: 86400 }, { name: '7 jours', value: 604800 }),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    const durationInput = interaction.options.getString('duree');
    const deleteSeconds = interaction.options.getInteger('supprimer_messages') ?? 0;
    const duration = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && !duration) return replyError(interaction, 'Durée invalide. Exemples : `30m`, `2h`, `7j`.');

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const error = checkHierarchy(interaction.member, member, 'bannir');
    if (error) return replyError(interaction, error);

    await interaction.deferReply();
    const dmed = member ? await notifyUser(user, interaction.guild, duration ? 'tempban' : 'ban', reason, duration) : false;
    await interaction.guild.members.ban(user.id, { reason: `${reason} (par ${interaction.user.tag})`, deleteMessageSeconds: deleteSeconds });

    if (duration) {
      const g = db.guild(interaction.guild.id);
      g.tempbans = g.tempbans.filter((t) => t.userId !== user.id);
      g.tempbans.push({ userId: user.id, until: Date.now() + duration });
      db.save();
    }
    const record = await logCase(interaction.guild, { type: duration ? 'tempban' : 'ban', target: user, moderator: interaction.user, reason, duration });
    return replySuccess(
      interaction,
      `**${user.tag}** a été banni${duration ? ` pour **${formatDuration(duration)}**` : ''}. (Cas #${record.id})${dmed ? '' : '\n*MP non délivré*'}`,
    );
  },
};
