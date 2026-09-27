const { PermissionFlagsBits } = require('discord.js');
const { embed, replyError, replySuccess } = require('../utils/embed');

module.exports = {
  prefix: 'announce',
  async execute(interaction) {
    const [, channelId, mention, roleId] = interaction.customId.split(':');
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return replyError(interaction, 'Salon introuvable.');
    const perms = channel.permissionsFor(interaction.member);
    if (!perms.has(PermissionFlagsBits.SendMessages)) return replyError(interaction, "Tu ne peux pas écrire dans ce salon.");
    if (mention !== 'none' && !perms.has(PermissionFlagsBits.MentionEveryone)) return replyError(interaction, "Tu n'as pas la permission de mentionner @everyone/@here.");

    const title = interaction.fields.getTextInputValue('title');
    const body = interaction.fields.getTextInputValue('body');
    const image = interaction.fields.getTextInputValue('image');
    const color = interaction.fields.getTextInputValue('color');
    const e = embed(interaction.guild.id).setDescription(body).setFooter({ text: `Annonce de ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
    if (title) e.setTitle(title);
    if (/^https?:\/\/\S+$/i.test(image)) e.setImage(image);
    if (/^#?[0-9a-f]{6}$/i.test(color)) e.setColor(parseInt(color.replace('#', ''), 16));

    const pings = [mention === 'everyone' ? '@everyone' : mention === 'here' ? '@here' : null, roleId !== '0' ? `<@&${roleId}>` : null].filter(Boolean);
    await channel.send({
      content: pings.join(' ') || undefined,
      embeds: [e],
      allowedMentions: { parse: mention !== 'none' ? ['everyone'] : [], roles: roleId !== '0' ? [roleId] : [] },
    });
    return replySuccess(interaction, `Annonce publiée dans ${channel}.`, true);
  },
};
