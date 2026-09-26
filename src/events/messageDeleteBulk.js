const { Events } = require('discord.js');
const { sendLog } = require('../utils/logger');
const { embed } = require('../utils/embed');
const { colors } = require('../config');

module.exports = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (!channel.guild) return;
    await sendLog(
      channel.guild,
      'messages',
      embed(channel.guild.id).setColor(colors.error).setDescription(`🧹 **${messages.size}** messages supprimés en masse dans ${channel}.`).setTimestamp(),
    );
  },
};
