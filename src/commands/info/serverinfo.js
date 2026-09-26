const { SlashCommandBuilder, ChannelType, GuildVerificationLevel } = require('discord.js');
const { embed } = require('../../utils/embed');
const { ts } = require('../../utils/time');

const LEVELS = {
  [GuildVerificationLevel.None]: 'Aucun',
  [GuildVerificationLevel.Low]: 'Faible',
  [GuildVerificationLevel.Medium]: 'Moyen',
  [GuildVerificationLevel.High]: 'Élevé',
  [GuildVerificationLevel.VeryHigh]: 'Très élevé',
};

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Informations sur le serveur'),
  async execute(interaction) {
    const guild = interaction.guild;
    const channels = guild.channels.cache;
    const members = guild.members.cache;
    const bots = members.filter((m) => m.user.bot).size;
    return interaction.reply({
      embeds: [
        embed(guild.id)
          .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
          .setThumbnail(guild.iconURL({ size: 256 }))
          .addFields(
            { name: 'ID', value: `\`${guild.id}\``, inline: true },
            { name: 'Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Créé', value: ts(guild.createdTimestamp, 'R'), inline: true },
            { name: 'Membres', value: `${guild.memberCount} (${bots} bots)`, inline: true },
            { name: 'Rôles', value: String(guild.roles.cache.size), inline: true },
            { name: 'Emojis', value: String(guild.emojis.cache.size), inline: true },
            {
              name: 'Salons',
              value: `💬 ${channels.filter((c) => c.type === ChannelType.GuildText).size} • 🔊 ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} • 📁 ${channels.filter((c) => c.type === ChannelType.GuildCategory).size}`,
              inline: true,
            },
            { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (niveau ${guild.premiumTier})`, inline: true },
            { name: 'Vérification', value: LEVELS[guild.verificationLevel] ?? '?', inline: true },
            { name: '2FA modération', value: guild.mfaLevel ? '✅' : '❌', inline: true },
            { name: 'URL perso', value: guild.vanityURLCode ?? '—', inline: true },
          )
          .setImage(guild.bannerURL({ size: 1024 })),
      ],
    });
  },
};
