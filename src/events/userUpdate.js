const { Events } = require('discord.js');
const { trackUser } = require('../utils/analysis');

/** Mémorise les anciens pseudos / avatars (utile pour repérer les doubles comptes). */
module.exports = {
  name: Events.UserUpdate,
  async execute(oldUser, newUser) {
    if (oldUser.tag !== newUser.tag || oldUser.avatar !== newUser.avatar) trackUser(newUser);
  },
};
