/**
 * Historique des mises à jour affiché par /changelog.
 * Ajoute les nouvelles versions EN HAUT de la liste.
 */
module.exports = [
  {
    version: '1.1.0',
    date: '2026-09-27',
    title: 'Sauvegardes, quarantaine, détection de suspects et outils',
    changes: [
      '💾 /backup : sauvegarde des rôles, salons et permissions, restauration de ce qui manque après une attaque, sauvegarde automatique quotidienne',
      '🔒 /quarantaine : isole un membre suspect (rôles mis de côté puis rendus, persiste s\'il quitte et revient)',
      '🕵️ /suspects : analyse de risque des arrivées récentes, groupes d\'avatars identiques, comptes très récents',
      '🚪 /arrivees : dernières arrivées avec âge du compte, invitation et statut de vérification',
      '🔗 /invites : qui a invité qui, classement, invitations actives',
      '🖱️ Clic droit : « Signaler le message » (membres → staff) et « Scanner le membre » (staff)',
      '🔨 /banlist, /mutes, /modstats, /roleall, /hide, /nuke',
      '🧰 /annonce (formulaire multi-lignes), /say, /rolepanel (rôles à cliquer, rôles dangereux bloqués)',
      '📜 Nouveau type de logs « Signalements »',
    ],
  },
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
