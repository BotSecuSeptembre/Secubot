const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { defaultColor, colors } = require('../config');

/** Couleur d'embed du serveur (définie par /theme) ou couleur par défaut. */
function themeColor(guildId) {
  if (!guildId) return defaultColor;
  return db.config(guildId).theme ?? defaultColor;
}

/** Embed aux couleurs du thème du serveur. */
function embed(guildId) {
  return new EmbedBuilder().setColor(themeColor(guildId));
}

const success = (description) => new EmbedBuilder().setColor(colors.success).setDescription(`✅ ${description}`);
const error = (description) => new EmbedBuilder().setColor(colors.error).setDescription(`❌ ${description}`);
const warning = (description) => new EmbedBuilder().setColor(colors.warning).setDescription(`⚠️ ${description}`);

/** Répond (ou suit) une interaction sans planter si elle a déjà été traitée. */
async function reply(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  try {
    if (interaction.deferred || interaction.replied) return await interaction.followUp(data);
    return await interaction.reply(data);
  } catch (err) {
    if (err.code !== 10062) console.error('[reply]', err);
  }
}

const replyError = (interaction, text) => reply(interaction, { embeds: [error(text)], ephemeral: true });
const replySuccess = (interaction, text, ephemeral = false) => reply(interaction, { embeds: [success(text)], ephemeral });

/** Tronque une chaîne pour respecter les limites des embeds. */
const truncate = (text, max = 1024) => {
  const str = String(text ?? '');
  return str.length > max ? `${str.slice(0, max - 3)}...` : str || '​';
};

module.exports = { themeColor, embed, success, error, warning, reply, replyError, replySuccess, truncate };
