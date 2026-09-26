const { SlashCommandBuilder, ActivityType } = require('discord.js');
const db = require('../../database');
const { replySuccess } = require('../../utils/embed');

const TYPES = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

module.exports = {
  ownerOnly: true,
  guildOnly: false,
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('👑 Change le statut et/ou l\'activité du bot')
    .addStringOption((o) =>
      o
        .setName('statut')
        .setDescription('Statut du bot')
        .addChoices(
          { name: '🟢 En ligne', value: 'online' },
          { name: '🌙 Inactif', value: 'idle' },
          { name: '⛔ Ne pas déranger', value: 'dnd' },
          { name: '⚫ Invisible', value: 'invisible' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription("Type d'activité")
        .addChoices(
          { name: 'Joue à', value: 'playing' },
          { name: 'Regarde', value: 'watching' },
          { name: 'Écoute', value: 'listening' },
          { name: 'Participe à', value: 'competing' },
          { name: 'Statut personnalisé', value: 'custom' },
        ),
    )
    .addStringOption((o) => o.setName('texte').setDescription("Texte de l'activité").setMaxLength(128))
    .addBooleanOption((o) => o.setName('reset').setDescription('Remettre la présence par défaut')),
  async execute(interaction, client) {
    if (interaction.options.getBoolean('reset')) {
      db.global.presence = null;
      db.save();
      require('../../events/ready').applyPresence(client);
      return replySuccess(interaction, 'Présence réinitialisée.', true);
    }
    const status = interaction.options.getString('statut');
    const type = interaction.options.getString('type');
    const text = interaction.options.getString('texte');
    const presence = { status: 'online', activity: null, ...(db.global.presence ?? {}) };
    if (status) presence.status = status;
    if (text) presence.activity = { name: text, type: TYPES[type ?? 'playing'] };
    db.global.presence = presence;
    db.save();
    require('../../events/ready').applyPresence(client);
    return replySuccess(interaction, `Présence mise à jour : statut **${presence.status}**${presence.activity ? `, activité **${presence.activity.name}**` : ''}.`, true);
  },
};
