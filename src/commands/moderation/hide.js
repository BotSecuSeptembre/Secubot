const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { replySuccess } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('Cache ou affiche un salon pour @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: '🙈 Cacher', value: 'hide' }, { name: '👀 Afficher', value: 'show' }))
    .addChannelOption((o) =>
      o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildCategory, ChannelType.GuildAnnouncement),
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const hide = interaction.options.getString('action') === 'hide';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: hide ? false : null }, { reason: `Par ${interaction.user.tag}` });
    return replySuccess(interaction, `${channel} est maintenant ${hide ? 'caché 🙈' : 'visible 👀'} pour @everyone.`, true);
  },
};
