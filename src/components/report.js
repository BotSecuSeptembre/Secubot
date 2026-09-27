const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { embed, replyError, replySuccess, truncate } = require('../utils/embed');
const { colors } = require('../config');

const cooldown = new Map();

module.exports = {
  prefix: 'report',
  async execute(interaction) {
    const [, action, channelId, messageId] = interaction.customId.split(':');
    const guild = interaction.guild;

    if (action === 'submit') {
      const last = cooldown.get(interaction.user.id) ?? 0;
      if (Date.now() - last < 60_000) return replyError(interaction, 'Attends une minute avant de faire un autre signalement.');
      cooldown.set(interaction.user.id, Date.now());

      const logs = db.config(guild.id).logs;
      const target = guild.channels.cache.get(logs.reports || logs.mod);
      if (!target) return replyError(interaction, "Les signalements ne sont pas configurés sur ce serveur (`/logs set type:Signalements`).");
      const channel = guild.channels.cache.get(channelId);
      const message = await channel?.messages.fetch(messageId).catch(() => null);
      if (!message) return replyError(interaction, 'Message introuvable (déjà supprimé ?).');

      const e = embed(guild.id)
        .setColor(colors.warning)
        .setTitle('🚩 Nouveau signalement')
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(truncate(message.content || '*[pas de texte]*', 2000))
        .addFields(
          { name: 'Auteur', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
          { name: 'Salon', value: `${channel} • [aller au message](${message.url})`, inline: true },
          { name: 'Signalé par', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
          { name: 'Raison', value: truncate(interaction.fields.getTextInputValue('reason')) },
        )
        .setTimestamp();
      const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
      if (img) e.setImage(img.url);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`report:delete:${channelId}:${messageId}`).setLabel('Supprimer le message').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`report:done:${channelId}:${messageId}`).setLabel('Traité').setEmoji('✅').setStyle(ButtonStyle.Success),
      );
      await target.send({ embeds: [e], components: [row] });
      return replySuccess(interaction, 'Merci, ton signalement a été transmis au staff.', true);
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return replyError(interaction, 'Réservé au staff.');
    let note = `✅ Traité par ${interaction.user.tag}`;
    if (action === 'delete') {
      const message = await guild.channels.cache.get(channelId)?.messages.fetch(messageId).catch(() => null);
      const ok = message ? await message.delete().then(() => true).catch(() => false) : false;
      note = ok ? `🗑️ Message supprimé par ${interaction.user.tag}` : `⚠️ Message déjà supprimé — traité par ${interaction.user.tag}`;
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('report:closed').setLabel(note.slice(0, 80)).setStyle(ButtonStyle.Secondary).setDisabled(true));
    return interaction.update({ components: [row] });
  },
};
