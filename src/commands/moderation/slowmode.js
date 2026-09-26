const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { parseDuration, formatDuration } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription("Définit le mode lent d'un salon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) => o.setName('duree').setDescription('Durée (ex: 5s, 1m, 2h) ou 0 pour désactiver').setRequired(true))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildVoice)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const input = interaction.options.getString('duree');
    const ms = input === '0' ? 0 : parseDuration(input);
    if (ms === null || ms > 6 * 3_600_000) return replyError(interaction, 'Durée invalide (max 6h).');
    await channel.setRateLimitPerUser(Math.floor(ms / 1000), `Par ${interaction.user.tag}`);
    return replySuccess(interaction, ms ? `Mode lent de ${channel} réglé sur **${formatDuration(ms)}**.` : `Mode lent de ${channel} désactivé.`);
  },
};
