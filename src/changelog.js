/**
 * Historique des mises à jour affiché par /changelog.
 * Ajoute les nouvelles versions EN HAUT de la liste.
 */
module.exports = [
  {
    version: '1.4.0',
    date: '2026-10-01',
    title: 'Espace d\'administration sur le site',
    changes: [
      '🔐 Espace « Administration » protégé par mot de passe (empreinte scrypt, essais limités, session sécurisée)',
      '🛠️ Gestion du bot depuis le navigateur : protections, mode raid, lockdown, messages et encadrés, purge, mode lent, verrouillage, statut du bot',
      '👤 Fiche complète de chaque membre avec actions : avertir, rendre muet, expulser, bannir, renommer, rôles, note, message privé',
      '📜 Journaux en direct (console du bot et logs du serveur) et historique complet des sanctions et des bannis',
      '🔗 /site lien est réservé aux administrateurs',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-01',
    title: 'Site du serveur en direct',
    changes: [
      '🌐 Site public intégré au bot : membres, statuts, vocal, salons publics, rôles et équipe mis à jour en temps réel',
      '✨ Design soigné : typographie auto-hébergée, en-tête du serveur, courbes d\'évolution sur 24 h, fiche membre détaillée',
      '🔒 Aucun cookie ni traceur, images Discord chargées seulement avec l\'accord du visiteur, pages Confidentialité, CGU et Cookies',
      '🙈 /site masquer et /site afficher : chaque membre choisit d\'apparaître ou non sur le site',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-27',
    title: 'Audit de sécurité, backup complet et outils de nettoyage',
    changes: [
      '🔍 /audit : note de sécurité /100 du serveur, permissions dangereuses, points à corriger',
      '💾 /backup : sauvegarde aussi les emojis, les bannis et les réglages ; mode « complet » qui remet les permissions des rôles/salons modifiés ; /backup info',
      '🧹 /clearuser : supprime les messages d\'un utilisateur dans tous les salons',
      '👻 Alerte ghost ping (mention puis suppression du message)',
      '⏳ /temprole : rôles temporaires • ⏰ /rappel : rappels en MP',
      '🎙️ /vocal : déconnecter, mute/sourd, déplacer ou vider un salon vocal',
      '🧽 /prune : expulse les inactifs sans rôle • 🔑 /perms : permissions réelles d\'un membre',
      '📊 /sondage (sondage Discord natif) • 📄 /export : sanctions, warns et notes en fichier Excel/CSV',
    ],
  },
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
