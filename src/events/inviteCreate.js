const { Events } = require('discord.js');
const { onInviteCreate } = require('../utils/invites');

module.exports = {
  name: Events.InviteCreate,
  execute: (invite) => onInviteCreate(invite),
};
