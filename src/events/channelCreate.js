const { Events } = require('discord.js');
const { onChannelCreate } = require('../utils/jail');

/** Les nouveaux salons sont automatiquement cachés aux membres en prison. */
module.exports = {
  name: Events.ChannelCreate,
  execute: (channel) => onChannelCreate(channel),
};
