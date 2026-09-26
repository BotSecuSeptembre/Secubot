const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database');
const { replySuccess } = require('../../utils/embed');

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder().setName('dnd').setDescription('👑 Met le bot en statut « Ne pas déranger »'),
  async execute(interaction, client) {
    db.global.presence = { ...(db.global.presence ?? {}), status: 'dnd' };
    db.save();
    require('../../events/ready').applyPresence(client);
    return replySuccess(interaction, 'Statut défini sur ⛔ **Ne pas déranger**.', true);
  },
};
