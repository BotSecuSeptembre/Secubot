/**
 * Historique des mises à jour affiché par /changelog.
 * Ajoute les nouvelles versions EN HAUT de la liste.
 */
module.exports = [
  {
    version: '1.0.0',
    date: '2026-09-26',
    title: 'Lancement de BotSecu',
    changes: [
      '🪪 Vérification manuelle avec fiche ultra-détaillée (score de risque, détection de doubles comptes, contournement de ban, invitation utilisée, historique multi-serveurs)',
      '📬 Modmail : les MP au bot créent un fil privé pour le staff (réponses anonymes, notes internes, blocage)',
      '🤖 Automodération : spam, doublons, invitations, liens, mentions, @everyone, majuscules, emojis, zalgo, mots interdits',
      '🛡️ Antiraid : détection des vagues d\'arrivées, mode raid, âge minimum, comptes sans avatar, blocage des bots',
      '☢️ Antinuke : protection contre les admins compromis et les bots malveillants',
      '🔨 Modération complète : ban/tempban/softban/massban, kick, mute, warn + paliers automatiques, purge, lock, lockdown, notes, cas',
      '📜 Logs : modération, messages, membres, serveur',
      '🎨 /theme, /stream, /dnd, /status, /serverlist, /changelog',
    ],
  },
];
