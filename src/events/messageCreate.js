const { Events, ChannelType } = require('discord.js');
const db = require('../database');
const { handleDM, handleStaffMessage } = require('../utils/modmail');
const { runAutomod } = require('../utils/automod');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || message.system) return;

    if (message.channel.type === ChannelType.DM) {
      if (db.global.blacklist.includes(message.author.id)) return;
      return handleDM(message, client);
    }
    if (!message.guild) return;

    if (message.channel.isThread()) {
      const cfg = db.config(message.guild.id).modmail;
      if (cfg.enabled && (message.channel.parentId === cfg.channelId)) {
        return handleStaffMessage(message);
      }
    }

    await runAutomod(message);
  },
};
