const { Events } = require('discord.js');
const { sendLog } = require('../utils/logger');
const { embed, truncate } = require('../utils/embed');
const { colors } = require('../config');
const db = require('../database');
const { botDeleted } = require('../utils/automod');

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
    // Ghost ping : message avec mention supprimé peu après l'envoi
    const cfg = db.config(message.guild.id).automod;
    const mentioned = message.mentions.users.filter((u) => !u.bot && u.id !== message.author.id);
    if (cfg.antiGhostPing && !botDeleted.has(message.id) && (mentioned.size || message.mentions.roles.size) && Date.now() - message.createdTimestamp < 60_000) {
      const targets = [...mentioned.values()].map((u) => u.toString()).concat(message.mentions.roles.map((r) => r.toString()));
      const notice = await message.channel
        .send({
          embeds: [
            embed(message.guild.id)
              .setColor(colors.warning)
              .setAuthor({ name: `👻 Ghost ping de ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
              .setDescription(`${message.author} a mentionné ${targets.slice(0, 10).join(', ')} puis a supprimé son message.\n> ${truncate(message.content || '*vide*', 500)}`),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => null), 60_000);
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
