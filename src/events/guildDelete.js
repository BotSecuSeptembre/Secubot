const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    console.log(`➖ Retiré de ${guild.name ?? guild.id} (${guild.id})`);
  },
};
