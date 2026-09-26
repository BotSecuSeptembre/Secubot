const { Events } = require('discord.js');
const { onInviteDelete } = require('../utils/invites');

module.exports = {
  name: Events.InviteDelete,
  execute: (invite) => onInviteDelete(invite),
};
