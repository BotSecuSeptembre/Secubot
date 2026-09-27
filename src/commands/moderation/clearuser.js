const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { embed, replyError } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearuser')
    .setDescription("Supprime les messages récents d'un utilisateur dans TOUS les salons (nettoyage après raid)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur (même parti du serveur)').setRequired(true))
    .addIntegerOption((o) => o.setName('heures').setDescription('Messages des X dernières heures (défaut : 24, max 336)').setMinValue(1).setMaxValue(336)),
  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur');
    const hours = interaction.options.getInteger('heures') ?? 24;
    const since = Date.now() - hours * 3_600_000;
    await interaction.deferReply({ ephemeral: true });

    const channels = interaction.guild.channels.cache.filter(
      (c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.PublicThread].includes(c.type) &&
        c.permissionsFor(interaction.guild.members.me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory]),
    );
    let deleted = 0;
    let touched = 0;
    for (const channel of channels.values()) {
      let before;
      let count = 0;
      for (let page = 0; page < 5; page++) {
        const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch?.size) break;
        before = batch.last().id;
        const mine = batch.filter((m) => m.author.id === user.id && m.createdTimestamp >= since);
        if (mine.size) {
          const res = await channel.bulkDelete(mine, true).catch(() => null);
          count += res?.size ?? 0;
        }
        if (batch.last().createdTimestamp < since) break;
      }
      if (count) touched++;
      deleted += count;
    }
    if (!deleted) return replyError(interaction, `Aucun message de ${user.tag} trouvé sur les dernières ${hours}h.`);
    await sendLog(interaction.guild, 'mod', embed(interaction.guild.id).setDescription(`🧹 ${interaction.user} a supprimé **${deleted}** message(s) de ${user} (\`${user.id}\`) dans ${touched} salon(s) (dernières ${hours}h).`));
    return interaction.editReply({ embeds: [embed(interaction.guild.id).setDescription(`🧹 **${deleted}** message(s) de ${user} supprimé(s) dans **${touched}** salon(s).`)] });
  },
};
