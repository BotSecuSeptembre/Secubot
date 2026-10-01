# 🛡️ BotSecu — Bot Discord de sécurité

Bot Discord tout-en-un pour sécuriser un serveur : **vérification manuelle avec détection de doubles comptes**, **modmail**, **automodération**, **antiraid**, **antinuke**, **modération complète** et **logs**.

- discord.js v14, Node.js ≥ 20, commandes slash (`/`)
- Aucune base de données externe : stockage JSON (compatible Volume Railway)
- Tout est en français

---

## 🚀 Installation

### 1. Créer le bot sur Discord

1. Va sur <https://discord.com/developers/applications> → **New Application**.
2. Onglet **Bot** → **Reset Token** → copie le token (c'est ton `DISCORD_TOKEN`).
3. Toujours dans **Bot**, active les **Privileged Gateway Intents** :
   - ✅ **Server Members Intent** (obligatoire)
   - ✅ **Message Content Intent** (obligatoire : automod + modmail)
   - ☑️ **Presence Intent** (optionnel : statut / appareil du membre dans la fiche de vérification → mettre `ENABLE_PRESENCES=true`)
4. Onglet **OAuth2 → URL Generator** : coche `bot` + `applications.commands`, puis la permission **Administrator** (le plus simple pour un bot de sécurité). Ouvre l'URL pour inviter le bot.
5. Dans les paramètres de ton serveur → **Rôles**, place le rôle du bot **tout en haut** (sinon il ne pourra pas sanctionner les membres au-dessus de lui).

### 2. Déployer sur Railway (depuis GitHub)

1. Sur <https://railway.com> → **New Project** → **Deploy from GitHub repo** → choisis ce dépôt.
2. Onglet **Variables** du service, ajoute :

   | Variable | Valeur |
   |---|---|
   | `DISCORD_TOKEN` | le token du bot |
   | `OWNER_IDS` | ton ID Discord (plusieurs : séparés par des virgules) |
   | `DATA_DIR` | `/data` |
   | `ENABLE_PRESENCES` | `true` seulement si l'intent Presence est activé |
   | `DEV_GUILD_ID` | *(optionnel)* ID d'un serveur de test : les commandes y apparaissent instantanément, mais **uniquement** là |

3. **Important — persistance :** clic droit sur le service → **Attach Volume** → mount path `/data`.
   Sans volume, la configuration (logs, vérification, warns…) est **effacée à chaque redéploiement**.
4. Railway lance automatiquement `npm start` (voir `railway.json`). Chaque `git push` redéploie le bot.

> Les commandes slash globales peuvent mettre quelques minutes à apparaître la première fois. Si elles n'apparaissent pas, fais `Ctrl+R` dans Discord.

### 3. En local (optionnel)

```bash
cp .env.example .env   # puis remplis DISCORD_TOKEN et OWNER_IDS
npm install
npm run check          # vérifie que toutes les commandes se chargent
npm start
```

---

## ⚡ Configuration rapide (dans l'ordre)

1. `/setup securite` → active automod + antiraid + antinuke + paliers de warns recommandés
2. `/logs auto` → crée une catégorie privée avec les salons de logs et de signalements
3. `/setup verification role_staff:@Modo` → crée le rôle **✅ Vérifié**, le salon public de vérification, le salon staff, cache le serveur aux non-vérifiés et donne le rôle aux membres déjà présents
4. `/modmail setup salon:#modmail role_staff:@Modo`
5. `/antinuke whitelist` → ajoute tes admins/bots de confiance
6. `/backup auto actif:True` → sauvegarde quotidienne de la structure du serveur
7. `/theme couleur:#ff0000` → couleur des embeds

Tu peux tout revoir avec `/config`.

---

## 🪪 Vérification (anti-raid & anti-doubles comptes)

**Parcours :**
1. Le nouveau membre arrive **sans rôle** : il ne voit que le salon de vérification.
2. Il clique sur **« Se faire vérifier »**.
3. Le bot envoie dans le salon staff une **fiche complète** avec un **score de risque /100** et les boutons :
   **✅ Accepter** · **👢 Refuser (kick)** · **🔨 Bannir** · **💬 Poser une question** (en MP) · **🔄 Actualiser**
4. Si accepté, il reçoit le rôle vérifié et a accès au serveur. Le membre reçoit la décision en MP.

**Informations contenues dans la fiche :**

| Catégorie | Détails |
|---|---|
| Identité | mention, ID, nom d'utilisateur, nom affiché, surnom, avatar, bannière |
| Compte | date de création, âge, délai **création → arrivée**, délai **arrivée → clic** (réflexe de bot) |
| Profil | avatar par défaut ?, avatar animé, bannière, décoration, couleur, indices Nitro, bot ? |
| Badges | tous les badges, **et les drapeaux « Spammeur » / « Quarantaine » posés par Discord** |
| Invitation | code utilisé + **qui a invité** (ou URL personnalisée) |
| Historique local | nombre d'arrivées (quitte/revient), sanctions, avertissements, onboarding, drapeau « a déjà été membre » |
| Hors serveur | serveurs en commun avec le bot, **sanctions sur d'autres serveurs** équipés du bot, anciens pseudos |
| Présence *(optionnel)* | statut, appareils (PC / mobile / web), activités, lien de pub dans le statut |
| **Doubles comptes** | **même avatar** qu'un membre, **même avatar** qu'un compte déjà vu, **pseudo ressemblant à un banni** (contournement de ban), pseudo quasi identique à un **membre du staff** (usurpation), comptes **créés en même temps et arrivés ensemble** (vague), même invitation |
| Contexte | nombre d'arrivées autour de la sienne, mode raid actif |

Le **score de risque** combine tous ces signaux (🟢 faible · 🟡 moyen · 🟠 élevé · 🔴 critique) avec le détail des points.

Autres commandes : `/verification scan` (fiche d'un membre à tout moment), `/verification attente`, `/verification verifier`, `/verification retirer`, `/verification options autokick_heures:24` (expulse les non-vérifiés après X heures).

---

## 📬 Modmail

- Un membre envoie un **MP au bot** → un **fil** est créé dans le salon modmail avec ses infos (âge du compte, sanctions, rôles, tickets précédents).
- Si le membre partage plusieurs serveurs avec le bot, un menu lui demande lequel contacter.
- Le staff répond **en écrivant dans le fil** (transmis en MP). Les messages commençant par `!` ou `//` sont des **notes internes**.
- `/modmail reply` (option **anonyme**), `/modmail close`, bouton 🔒, `/modmail contact` (le staff contacte un membre), `/modmail block`.

---

## 🌐 Site du serveur

Le bot sert aussi un site public qui affiche **en direct** le serveur : membres (statut, rôles, boosts), membres en vocal, salons publics, rôles, équipe, arrivées et départs récents. Aucune dépendance supplémentaire, aucun dépôt séparé : le site tourne dans le même processus que le bot.

- **Activer sur Railway :** onglet **Settings → Networking → Generate Domain**. Railway fournit `PORT` automatiquement. Ajoute ensuite `SITE_URL` avec l'adresse obtenue.
- **Variables :** `SITE_GUILD_ID` (serveur affiché), `SITE_INVITE_URL` (bouton « Rejoindre »), `SITE_CONTACT`, `SITE_ENABLED=false` pour le couper. Voir `.env.example`.
- **Temps réel :** mises à jour poussées au navigateur (Server Sent Events) au plus toutes les 1,5 s. Les statuts en ligne exigent `ENABLE_PRESENCES=true` ; sinon le site affiche le nombre approximatif fourni par Discord.
- **Vie privée :** seuls les salons visibles par un membre ordinaire (rôle vérifié si la vérification est active) sont affichés. Aucun cookie, aucun outil d'audience, aucun script tiers, aucun journal des visites. Les images hébergées par Discord (avatars, icône, emojis) ne se chargent qu'après accord du visiteur ; sinon, initiales. Pages **Confidentialité**, **CGU** et **Cookies** incluses.
- **Administration** (lien en bas de chaque page, adresse `/admin`) : espace protégé par mot de passe pour gérer le bot depuis le navigateur. Tableau de bord (latence, mémoire, modules de protection à activer ou couper, mode raid, lockdown), fiche complète de chaque membre (compte, rôles, permissions, invitation, anciens noms, avertissements, cas, notes) avec actions (avertir, rendre muet, expulser, bannir, renommer, rôles, note, message privé), envoi de messages et d'encadrés dans un salon, purge, mode lent, verrouillage, historique des sanctions et des bannis, journaux en direct (console du bot et logs du serveur) et statut du bot. Chaque action est tracée dans le salon de logs de modération.
- **Sécurité de l'administration :** seul un hachage scrypt du mot de passe est dans le code, connexion limitée à 5 essais par IP et 30 au total toutes les 15 minutes, cookie de session `HttpOnly`, `Secure` et `SameSite=Strict`, déconnexion après 1 h d'inactivité, requêtes venant d'un autre site refusées. Pour changer de mot de passe sans toucher au code : `npm run admin-hash` puis variable `ADMIN_PASSWORD_HASH` sur Railway.
- **`/site masquer`** : un membre se retire du site (le staff peut masquer quelqu'un d'autre) · **`/site afficher`** · **`/site lien`** (administrateurs uniquement).

---

## 📋 Liste des commandes

### 👑 Propriétaire du bot (`OWNER_IDS`)
| Commande | Description |
|---|---|
| `/stream [texte] [url]` | Activité « En stream » (lien Twitch/YouTube) — vide = retirer |
| `/dnd` | Statut « Ne pas déranger » |
| `/status` | Statut (en ligne, inactif, dnd, invisible) + activité (joue, regarde, écoute, statut perso) |
| `/serverlist` | Liste paginée des serveurs du bot |
| `/leaveserver <id>` | Quitter un serveur |
| `/blacklist user/server/list` | Liste noire globale |

### ⚙️ Configuration
`/theme <couleur>` · `/logs set/disable/auto/voir` · `/setup securite` · `/setup verification` · `/config` · `/warnconfig ajouter/retirer/voir`

### 🛡️ Sécurité
| Commande | Description |
|---|---|
| `/verification …` | setup, panel, toggle, options, verifier, retirer, attente, scan |
| `/modmail …` | setup, toggle, reply, close, contact, block |
| `/automod …` | status, toggle, filtre, sanction, mots, domaines, ignorer |
| `/antiraid …` | status, toggle, detection, age_minimum, sans_avatar, bots, raidmode |
| `/antinuke …` | status, toggle, config, whitelist (modifiable seulement par le propriétaire du serveur) |
| `/lockdown on/off` | Verrouille tous les salons |
| `/massban` | Ban en masse par IDs ou « tous les arrivés depuis X minutes » |

| `/audit` | Note de sécurité /100 : réglages Discord, permissions dangereuses, bots admin, protections actives |
| `/backup creer/liste/info/charger/supprimer/auto` | Sauvegarde rôles, salons, permissions, emojis, bannis et réglages. Restauration : mode **manquants** (recrée ce qui a été supprimé) ou **complet** (remet aussi les permissions modifiées) + options réglages / emojis / bannis. Rien n'est jamais supprimé. Propriétaire du serveur seulement |
| `/quarantaine ajouter/retirer/liste` | Isole un membre suspect : ses rôles sont mis de côté puis rendus |
| `/suspects recents/avatars/nouveaux_comptes` | Analyse de risque des arrivées, groupes d'avatars identiques, comptes très récents |
| `/arrivees` | Dernières arrivées (âge du compte, invitation, vérifié ou non) |

### 🔨 Modération
`/ban` (avec durée = tempban) · `/unban` · `/kick` · `/softban` · `/mute` · `/unmute` · `/mutes` · `/warn` · `/warnings list/remove/clear` · `/purge` (filtres : membre, bots, liens, invitations, pièces jointes, texte) · `/slowmode` · `/lock` · `/hide` · `/nuke` · `/nick` · `/dehoist` · `/role` · `/roleall` · `/banlist` · `/case voir/raison` · `/modlogs` · `/modstats` · `/note` · `/snipe` · `/clearuser` (messages d'un utilisateur dans tous les salons) · `/temprole` · `/vocal` · `/prune` · `/export` (CSV pour Excel)

### 🧰 Utilitaires
`/annonce` (formulaire multi-lignes, image, couleur, mention) · `/say` · `/rolepanel` (jusqu'à 10 rôles à cliquer ; les rôles avec permissions de modération sont refusés) · `/invites membre/classement/codes` · `/sondage` · `/rappel`

### 🖱️ Clic droit (Applications)
- **Signaler le message** (tout le monde) : envoie le message au staff avec les boutons « Supprimer » / « Traité ». Salon : `/logs set type:Signalements` (sinon logs de modération).
- **Scanner le membre** (staff) : fiche d'analyse complète du membre.

### ℹ️ Informations
`/help` · `/changelog` · `/site` · `/perms` · `/userinfo` · `/serverinfo` · `/roleinfo` · `/avatar` · `/botinfo` · `/ping`

---

## 🤖 Détails des protections

**Automod** (le staff avec « Gérer les messages » est ignoré) : spam, messages répétés, invitations Discord, liens (avec liste blanche de domaines), mentions de masse, @everyone/@here, majuscules, emojis, zalgo, retours à la ligne, mots interdits, alerte **ghost ping**. Sanction : suppression, avertissement ou mute. S'applique aussi aux messages modifiés.

**Paliers d'avertissements** : ex. 3 warns → mute 1h, 5 → kick, 7 → ban (`/warnconfig`).

**Antiraid** : X arrivées en Y secondes → **mode raid** (nouvelles arrivées expulsées/bannies, niveau de vérification du serveur au maximum, désactivation auto après 30 min de calme). Âge minimum des comptes, comptes sans avatar, bots ajoutés par des non-autorisés. Un membre muté qui quitte puis revient est **re-muté**.

**Antinuke** (via les logs d'audit) : un utilisateur (ou bot) qui supprime/crée en masse salons, rôles, webhooks, emojis, ou qui ban/kick en masse → ses rôles sont retirés (ou kick/ban). Protection **immédiate** si quelqu'un ajoute des permissions dangereuses à un rôle, donne un rôle administrateur ou change l'URL personnalisée. Le propriétaire reçoit un MP.

**Logs** : sanctions (avec numéro de cas), messages supprimés/modifiés/purgés, arrivées (âge du compte, invitation), départs (rôles), changements de pseudo/rôles/mute, salons/rôles/webhooks/serveur modifiés avec l'auteur.

---

## 🗂️ Structure

```
src/
├── index.js            # démarrage, chargement des commandes / événements / composants
├── config.js           # variables d'environnement
├── database.js         # stockage JSON (DATA_DIR/database.json)
├── changelog.js        # historique affiché par /changelog  ← à compléter à chaque mise à jour
├── commands/           # commandes slash par catégorie
├── components/         # boutons / menus / formulaires (vérification, modmail)
├── events/             # événements Discord (arrivées, messages, logs d'audit…)
├── web/                # site public en direct (serveur HTTP, pages, styles)
└── utils/              # analyse de risque, automod, antiraid, modmail, logs…
```

**Ajouter une mise à jour au changelog :** ajoute une entrée en haut du tableau dans `src/changelog.js` et change `version` dans `package.json`.

---

## ❓ Problèmes fréquents

- **« Used disallowed intents »** au démarrage → active *Server Members* et *Message Content* dans le Developer Portal (et *Presence* si `ENABLE_PRESENCES=true`).
- **Le bot ne peut pas sanctionner quelqu'un** → son rôle doit être au-dessus de celui de la cible.
- **La config disparaît après un redéploiement** → il manque le Volume Railway monté sur `/data` avec `DATA_DIR=/data`.
- **L'antinuke ne réagit pas** → le bot a besoin de la permission *Voir les logs d'audit*.
- **Les membres voient encore des salons sans être vérifiés** → un salon autorise explicitement `@everyone` : relance `/setup verification` ou retire cette permission.
