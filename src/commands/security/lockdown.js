const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, replyError } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Verrouille / déverrouille TOUS les salons textuels du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName('etat').setDescription('État').setRequired(true).addChoices({ name: '🔒 Verrouiller', value: 'on' }, { name: '🔓 Déverrouiller', value: 'off' }),
    )
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(300)),
  async execute(interaction) {
    const guild = interaction.guild;
    const cfg = db.config(guild.id);
    const lock = interaction.options.getString('etat') === 'on';
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    const everyone = guild.roles.everyone;
    await interaction.deferReply();

    let count = 0;
    if (lock) {
      if (cfg.lockedChannels.length) return replyError(interaction, 'Le serveur est déjà en lockdown. Utilise `/lockdown etat:off`.');
      const channels = guild.channels.cache.filter(
        (c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(c.type) && c.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages),
      );
      for (const channel of channels.values()) {
        const ok = await channel.permissionOverwrites
          .edit(everyone, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, AddReactions: false }, { reason: `Lockdown : ${reason}` })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          cfg.lockedChannels.push(channel.id);
          count++;
        }
      }
      db.save();
    } else {
      for (const id of cfg.lockedChannels) {
        const channel = guild.channels.cache.get(id);
        if (!channel) continue;
        const ok = await channel.permissionOverwrites
          .edit(everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, AddReactions: null }, { reason: `Fin du lockdown : ${reason}` })
          .then(() => true)
          .catch(() => false);
        if (ok) count++;
      }
      cfg.lockedChannels = [];
      db.save();
    }

    await sendLog(
      guild,
      'server',
      embed(guild.id)
        .setColor(lock ? colors.danger : colors.success)
        .setTitle(lock ? '🔒 LOCKDOWN DU SERVEUR' : '🔓 Fin du lockdown')
        .setDescription(`Par ${interaction.user} — ${reason}\n${count} salon(s) ${lock ? 'verrouillé(s)' : 'déverrouillé(s)'}.`),
    );
    return replySuccess(interaction, `${lock ? '🔒 Lockdown activé' : '🔓 Lockdown levé'} : **${count}** salon(s). Raison : ${reason}`);
  },
};
