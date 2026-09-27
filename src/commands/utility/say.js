const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { replySuccess, replyError } = require('../../utils/embed');
const { sendLog } = require('../../utils/logger');
const { embed, truncate } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Fait parler le bot dans un salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('message').setDescription('Message (\\n pour un retour à la ligne)').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui-ci)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.SendMessages)) return replyError(interaction, "Tu ne peux pas écrire dans ce salon.");
    const content = interaction.options.getString('message').replace(/\\n/g, '\n');
    // pas de mentions de masse via le bot
    await channel.send({ content, allowedMentions: { parse: ['users'] } });
    await sendLog(interaction.guild, 'mod', embed(interaction.guild.id).setDescription(`🗣️ ${interaction.user} a fait parler le bot dans ${channel} :\n${truncate(content, 1000)}`));
    return replySuccess(interaction, `Message envoyé dans ${channel}.`, true);
  },
};
