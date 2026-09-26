const { Events } = require('discord.js');
const db = require('../database');
const { cacheGuildInvites } = require('../utils/invites');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    console.log(`➕ Ajouté sur ${guild.name} (${guild.id}) — ${guild.memberCount} membres`);
    if (db.global.blacklistedGuilds?.includes(guild.id)) return guild.leave();
    db.guild(guild.id);
    await cacheGuildInvites(guild);
    if (guild.memberCount < 50_000) await guild.members.fetch().catch(() => null);
  },
};
