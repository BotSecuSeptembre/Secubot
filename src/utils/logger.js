const db = require('../database');

/**
 * Envoie un embed dans le salon de logs configuré.
 * @param {import('discord.js').Guild} guild
 * @param {'mod'|'messages'|'members'|'server'} type
 */
async function sendLog(guild, type, payload) {
  if (!guild) return;
  const logs = db.config(guild.id).logs;
  const channelId = logs[type] || logs.mod;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  const data = payload?.data || payload?.toJSON ? { embeds: [payload] } : payload;
  await channel.send(data).catch(() => null);
}

module.exports = { sendLog };
