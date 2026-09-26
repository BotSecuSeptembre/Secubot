const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { replySuccess, embed } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille ou déverrouille un salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) =>
      o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: '🔒 Verrouiller', value: 'lock' }, { name: '🔓 Déverrouiller', value: 'unlock' }),
    )
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(300)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const lock = interaction.options.getString('action') === 'lock';
    const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { SendMessages: lock ? false : null, SendMessagesInThreads: lock ? false : null, CreatePublicThreads: lock ? false : null, AddReactions: lock ? false : null },
      { reason: `${lock ? 'Lock' : 'Unlock'} par ${interaction.user.tag} : ${reason}` },
    );
    if (channel.id !== interaction.channelId) {
      await channel.send({ embeds: [embed(interaction.guild.id).setDescription(`${lock ? '🔒 Salon verrouillé' : '🔓 Salon déverrouillé'} — ${reason}`)] }).catch(() => null);
    }
    await sendLog(interaction.guild, 'mod', embed(interaction.guild.id).setDescription(`${lock ? '🔒' : '🔓'} ${channel} ${lock ? 'verrouillé' : 'déverrouillé'} par ${interaction.user} — ${reason}`));
    return replySuccess(interaction, `${channel} ${lock ? 'verrouillé 🔒' : 'déverrouillé 🔓'}. Raison : ${reason}`);
  },
};
