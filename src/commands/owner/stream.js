const { SlashCommandBuilder, ActivityType } = require('discord.js');
const db = require('../../database');
const { replySuccess, replyError } = require('../../utils/embed');

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('stream')
    .setDescription('👑 Définit l\'activité du bot sur « En stream »')
    .addStringOption((o) => o.setName('texte').setDescription('Texte affiché (vide = retirer l\'activité)').setMaxLength(128))
    .addStringOption((o) => o.setName('url').setDescription('Lien Twitch ou YouTube (nécessaire pour le statut violet)')),
  async execute(interaction, client) {
    const text = interaction.options.getString('texte');
    const url = interaction.options.getString('url') || 'https://twitch.tv/discord';
    if (!/^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\//i.test(url)) {
      return replyError(interaction, 'L\'URL doit être un lien Twitch ou YouTube.');
    }
    const current = db.global.presence ?? { status: 'online' };
    db.global.presence = { ...current, activity: text ? { name: text, type: ActivityType.Streaming, url } : null };
    db.save();
    require('../../events/ready').applyPresence(client);
    return replySuccess(interaction, text ? `Activité définie : **En stream ${text}** (${url})` : 'Activité retirée.', true);
  },
};
