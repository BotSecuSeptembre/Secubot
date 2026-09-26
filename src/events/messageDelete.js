const { Events } = require('discord.js');
const { sendLog } = require('../utils/logger');
const { embed, truncate } = require('../utils/embed');
const { colors } = require('../config');

/** Snipe : dernier message supprimé par salon (utilisé par /snipe) */
const snipes = new Map();

module.exports = {
  name: Events.MessageDelete,
  snipes,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    if (message.partial && !message.content) {
      return sendLog(message.guild, 'messages', embed(message.guild.id).setColor(colors.error).setDescription(`🗑️ Un message non mis en cache a été supprimé dans ${message.channel}.`));
    }
    snipes.set(message.channel.id, { content: message.content, author: message.author, at: Date.now(), attachments: message.attachments.map((a) => a.url) });
    const e = embed(message.guild.id)
      .setColor(colors.error)
      .setAuthor({ name: `Message supprimé • ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setDescription(truncate(message.content || '*aucun texte*', 4000))
      .addFields({ name: 'Salon', value: `${message.channel}`, inline: true }, { name: 'Auteur', value: `${message.author} (\`${message.author.id}\`)`, inline: true })
      .setTimestamp();
    if (message.attachments.size) e.addFields({ name: 'Pièces jointes', value: truncate(message.attachments.map((a) => a.url).join('\n')) });
    await sendLog(message.guild, 'messages', e);
  },
};
