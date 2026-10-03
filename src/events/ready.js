const { Events, ActivityType } = require('discord.js');
const db = require('../database');
const config = require('../config');
const { cacheGuildInvites } = require('../utils/invites');
const { startScheduler } = require('../utils/scheduler');
const { restoreTimers: restoreJailTimers } = require('../utils/jail');

/** Applique la présence enregistrée (stream, dnd...) */
function applyPresence(client) {
  const p = db.global.presence;
  if (!p) {
    client.user.setPresence({ status: 'online', activities: [{ name: '🛡️ /help • Sécurité', type: ActivityType.Watching }] });
    return;
  }
  const a = p.activity;
  const activities = !a
    ? []
    : a.type === ActivityType.Custom
      ? [{ name: 'Custom Status', state: a.name, type: ActivityType.Custom }]
      : [{ name: a.name, type: a.type, url: a.url ?? undefined }];
  client.user.setPresence({ status: p.status ?? 'online', activities });
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  applyPresence,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag} sur ${client.guilds.cache.size} serveur(s)`);

    // Enregistrement des commandes slash
    const body = client.commands.map((c) => c.data.toJSON());
    try {
      if (config.devGuildId) {
        await client.application.commands.set(body, config.devGuildId);
        console.log(`📌 ${body.length} commandes enregistrées sur le serveur de dev ${config.devGuildId}`);
      } else {
        await client.application.commands.set(body);
        console.log(`📌 ${body.length} commandes globales enregistrées`);
      }
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement des commandes', err);
    }

    applyPresence(client);

    for (const guild of client.guilds.cache.values()) {
      db.guild(guild.id);
      await cacheGuildInvites(guild);
      // Charger les membres (nécessaire pour la détection de doubles comptes)
      if (guild.memberCount < 50_000) await guild.members.fetch().catch(() => null);
    }

    restoreJailTimers(client);
    startScheduler(client);
  },
};
