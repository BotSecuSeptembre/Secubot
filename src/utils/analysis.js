const { UserFlags, GuildMemberFlags } = require('discord.js');
const db = require('../database');
const { formatDuration } = require('./time');

const DAY = 86_400_000;

const BADGES = {
  Staff: '👨‍💼 Staff Discord',
  Partner: '🤝 Partenaire',
  Hypesquad: '🎉 HypeSquad Events',
  BugHunterLevel1: '🐛 Bug Hunter',
  BugHunterLevel2: '🐞 Bug Hunter Or',
  HypeSquadOnlineHouse1: '🏠 Bravery',
  HypeSquadOnlineHouse2: '🏠 Brilliance',
  HypeSquadOnlineHouse3: '🏠 Balance',
  PremiumEarlySupporter: '💎 Early Supporter',
  VerifiedDeveloper: '🛠️ Dev bot vérifié (early)',
  CertifiedModerator: '🛡️ Modérateur certifié',
  ActiveDeveloper: '🧑‍💻 Développeur actif',
  VerifiedBot: '✔️ Bot vérifié',
  Spammer: '🚫 SIGNALÉ SPAMMEUR PAR DISCORD',
  Quarantined: '🚫 COMPTE EN QUARANTAINE',
};

const SUSPICIOUS_WORDS = [
  'nitro', 'free', 'gift', 'giveaway', 'airdrop', 'crypto', 'discord', 'support', 'admin', 'moderat', 'staff',
  'official', 'steam', 'onlyfans', 'nsfw', 'porn', 'sex', 'raid', 'nuke', 'selfbot', 'token', 'hack',
];

/** Normalise un pseudo pour comparer (minuscules, sans accents, leetspeak basique, sans chiffres/symboles). */
function normalizeName(name = '') {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/[^a-z]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarité 0..1 entre deux pseudos normalisés. */
function similarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length < 4 || nb.length < 4) return na && na === nb ? 1 : 0;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

/** Heuristique "pseudo généré aléatoirement" (ex: xk7qj29fh, user84729123). */
function looksRandom(username) {
  const name = username.toLowerCase();
  const digits = (name.match(/\d/g) || []).length;
  const reasons = [];
  if (digits >= 4 && digits / name.length >= 0.35) reasons.push('beaucoup de chiffres');
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(name.replace(/[^a-z]/g, ''))) reasons.push('suite de consonnes');
  if (/^[a-z]+\d{4,}$/.test(name)) reasons.push('nom + longue suite de chiffres');
  if (/^[a-z0-9]{12,}$/.test(name) && /\d/.test(name) && !/[aeiouy]{1}.*[aeiouy]/.test(name)) reasons.push('chaîne aléatoire');
  return reasons;
}

/** Cache des bannis par serveur (10 min). */
const banCache = new Map();
async function getBans(guild) {
  const cached = banCache.get(guild.id);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.bans;
  try {
    const bans = await guild.bans.fetch({ limit: 1000 });
    banCache.set(guild.id, { at: Date.now(), bans });
    return bans;
  } catch {
    return null;
  }
}
const invalidateBans = (guildId) => banCache.delete(guildId);

/**
 * Analyse complète d'un membre pour la vérification.
 * Renvoie { user, member, facts, alts, risk: { score, level, reasons } }
 */
async function analyzeMember(member) {
  const guild = member.guild;
  const client = guild.client;
  const user = await client.users.fetch(member.id, { force: true }).catch(() => member.user);
  const now = Date.now();
  const reasons = [];
  let score = 0;
  const add = (points, reason) => {
    score += points;
    reasons.push({ points, reason });
  };

  const g = db.guild(guild.id);
  const userData = db.user(user.id);
  const memberData = g.members[user.id] || {};

  // ---------- Âge du compte ----------
  const accountAge = now - user.createdTimestamp;
  if (accountAge < 1 * DAY) add(40, `Compte créé il y a moins de 24h (${formatDuration(accountAge)})`);
  else if (accountAge < 7 * DAY) add(30, `Compte très récent (${formatDuration(accountAge)})`);
  else if (accountAge < 30 * DAY) add(18, `Compte récent (${formatDuration(accountAge)})`);
  else if (accountAge < 90 * DAY) add(8, `Compte de moins de 3 mois`);
  else if (accountAge > 365 * 2 * DAY) add(-10, 'Compte de plus de 2 ans');

  const joinDelay = member.joinedTimestamp ? member.joinedTimestamp - user.createdTimestamp : null;
  if (joinDelay !== null && joinDelay < 60 * 60_000) add(20, `A rejoint le serveur ${formatDuration(joinDelay)} après la création du compte`);

  const timeBeforeClick = member.joinedTimestamp ? now - member.joinedTimestamp : null;
  if (timeBeforeClick !== null && timeBeforeClick < 5000) add(10, `A cliqué en ${formatDuration(timeBeforeClick)} après son arrivée (réflexe de bot ?)`);

  // ---------- Profil ----------
  const hasAvatar = Boolean(user.avatar);
  const animatedAvatar = user.avatar?.startsWith('a_') ?? false;
  const hasBanner = Boolean(user.banner);
  const hasDecoration = Boolean(user.avatarDecorationData);
  const nitroHints = [animatedAvatar && 'avatar animé', hasBanner && 'bannière', member.premiumSince && 'booste le serveur', member.avatar && 'avatar de serveur'].filter(Boolean);
  if (!hasAvatar) add(15, "Pas d'avatar (avatar par défaut)");
  if (nitroHints.length) add(-10, `Indices de Nitro : ${nitroHints.join(', ')}`);
  if (hasDecoration) add(-3, "Décoration d'avatar");

  const flags = user.flags?.toArray?.() ?? [];
  const badges = flags.map((f) => BADGES[f]).filter(Boolean);
  if (user.flags?.has(UserFlags.Spammer)) add(60, 'Compte signalé comme SPAMMEUR par Discord');
  if (user.flags?.has(UserFlags.Quarantined)) add(60, 'Compte mis en QUARANTAINE par Discord');
  const goodBadges = flags.filter((f) => !['Spammer', 'Quarantined', 'VerifiedBot', 'BotHTTPInteractions'].includes(f)).length;
  if (goodBadges) add(-5 * Math.min(goodBadges, 3), `${goodBadges} badge(s) de profil`);

  if (user.bot) add(50, "C'est un BOT");

  const randomHints = looksRandom(user.username);
  if (randomHints.length) add(12, `Pseudo qui semble généré (${randomHints.join(', ')})`);
  const nameBlob = `${user.username} ${user.globalName ?? ''} ${member.nickname ?? ''}`.toLowerCase();
  const suspiciousWords = SUSPICIOUS_WORDS.filter((w) => nameBlob.includes(w));
  if (suspiciousWords.length) add(15, `Mots suspects dans le pseudo : ${suspiciousWords.join(', ')}`);
  if (/[̀-ͯ҉]{3,}/.test(nameBlob) || /[​-‏⁠ㅤᅟ]/.test(nameBlob)) add(10, 'Caractères invisibles / zalgo dans le pseudo');

  // ---------- Historique local ----------
  const joinCount = memberData.joinCount || 1;
  if (joinCount > 1) add(Math.min(5 * (joinCount - 1), 20), `A rejoint le serveur ${joinCount} fois`);
  const localSanctions = g.cases.filter((c) => c.targetId === user.id && c.type !== 'note');
  const localWarns = g.warns.filter((w) => w.userId === user.id);
  if (localSanctions.length) add(Math.min(10 * localSanctions.length, 30), `${localSanctions.length} sanction(s) passée(s) sur ce serveur`);
  const otherSanctions = userData.sanctions.filter((s) => s.guildId !== guild.id);
  if (otherSanctions.length) add(Math.min(8 * otherSanctions.length, 25), `${otherSanctions.length} sanction(s) sur d'autres serveurs équipés du bot`);
  const previousDenials = Object.values(g.verifications[user.id]?.history ?? []).filter((h) => h.status !== 'accepted').length;
  if (previousDenials) add(15 * previousDenials, `${previousDenials} vérification(s) refusée(s) auparavant`);

  // ---------- Serveurs en commun ----------
  const mutualGuilds = client.guilds.cache.filter((gu) => gu.id !== guild.id && gu.members.cache.has(user.id));

  // ---------- Détection de doubles comptes ----------
  const alts = [];
  const pushAlt = (entry) => {
    if (!alts.some((a) => a.id === entry.id && a.type === entry.type)) alts.push(entry);
  };

  // 1) Même avatar qu'un autre membre / un banni / un compte déjà vu
  if (hasAvatar) {
    for (const other of guild.members.cache.values()) {
      if (other.id !== user.id && other.user.avatar === user.avatar) {
        pushAlt({ id: other.id, tag: other.user.tag, type: 'avatar', label: 'Avatar IDENTIQUE à un membre du serveur' });
      }
    }
    for (const [otherId, data] of Object.entries(db.data.users)) {
      if (otherId !== user.id && data.avatars?.includes(user.avatar)) {
        pushAlt({ id: otherId, tag: data.names?.at(-1) ?? otherId, type: 'avatar-history', label: 'Avatar identique à un compte déjà vu par le bot' });
      }
    }
  }

  // 2) Pseudo similaire à un banni (contournement de ban)
  const bans = await getBans(guild);
  if (bans) {
    for (const ban of bans.values()) {
      if (ban.user.id === user.id) continue;
      const sameAvatar = hasAvatar && ban.user.avatar === user.avatar;
      const sim = Math.max(similarity(ban.user.username, user.username), similarity(ban.user.globalName ?? '', user.globalName ?? user.username));
      if (sameAvatar || sim >= 0.85) {
        pushAlt({
          id: ban.user.id,
          tag: ban.user.tag,
          type: 'banned',
          label: `Ressemble à un BANNI (${sameAvatar ? 'même avatar' : `pseudo ${Math.round(sim * 100)}% similaire`})`,
        });
      }
    }
  }

  // 3) Pseudo similaire à un membre existant (usurpation / double compte)
  for (const other of guild.members.cache.values()) {
    if (other.id === user.id || other.user.bot) continue;
    const sim = Math.max(
      similarity(other.user.username, user.username),
      similarity(other.displayName, user.globalName ?? user.username),
    );
    if (sim >= 0.88) {
      const staff = other.permissions.has('ManageMessages');
      pushAlt({
        id: other.id,
        tag: other.user.tag,
        type: staff ? 'impersonation' : 'name',
        label: staff ? `Pseudo quasi identique à un MEMBRE DU STAFF (${Math.round(sim * 100)}%)` : `Pseudo ${Math.round(sim * 100)}% similaire à un membre`,
      });
    }
    if (alts.length > 15) break;
  }

  // 4) Arrivées groupées (vague) : même invitation / comptes créés en même temps
  const recentJoiners = Object.entries(g.members)
    .filter(([id, m]) => id !== user.id && m.lastJoin && Math.abs(m.lastJoin - (member.joinedTimestamp ?? now)) < 10 * 60_000)
    .map(([id, m]) => ({ id, ...m }));
  const sameInvite = memberData.inviteCode ? recentJoiners.filter((m) => m.inviteCode === memberData.inviteCode) : [];
  const createdTogether = recentJoiners.filter((m) => m.createdAt && Math.abs(m.createdAt - user.createdTimestamp) < 2 * 60 * 60_000);
  for (const m of createdTogether) {
    pushAlt({ id: m.id, tag: m.tag ?? m.id, type: 'wave', label: 'Compte créé à moins de 2h du sien et arrivé dans les mêmes 10 min' });
  }

  const altWeights = { avatar: 35, 'avatar-history': 25, banned: 45, impersonation: 35, name: 12, wave: 15 };
  const seenTypes = new Set();
  for (const alt of alts) {
    if (seenTypes.has(alt.type)) continue;
    seenTypes.add(alt.type);
    add(altWeights[alt.type] ?? 10, alt.label);
  }
  if (recentJoiners.length >= 5) add(15, `${recentJoiners.length} autres arrivées dans les 10 min autour de la sienne (raid ?)`);
  if (sameInvite.length >= 3) add(10, `${sameInvite.length} autres personnes arrivées récemment via la même invitation`);

  // ---------- Présence (optionnel) ----------
  let presence = null;
  if (member.presence) {
    const p = member.presence;
    presence = {
      status: p.status,
      devices: Object.keys(p.clientStatus ?? {}),
      activities: p.activities.map((a) => (a.type === 4 ? `Statut perso : ${a.state ?? ''}` : a.name)).filter(Boolean),
    };
    const custom = p.activities.find((a) => a.type === 4)?.state ?? '';
    if (/discord\.gg|\.gg\/|http/i.test(custom)) add(15, 'Lien / pub dans le statut personnalisé');
  }

  // ---------- Onboarding ----------
  const memberFlags = [];
  if (member.flags?.has(GuildMemberFlags.DidRejoin)) memberFlags.push('A déjà été membre');
  if (member.flags?.has(GuildMemberFlags.CompletedOnboarding)) memberFlags.push('Onboarding complété');
  if (member.flags?.has(GuildMemberFlags.BypassesVerification)) memberFlags.push('Contourne le niveau de vérification');
  if (member.pending) memberFlags.push('Règles non acceptées (screening)');

  if (db.config(guild.id).antiraid.raidMode) add(10, 'Le serveur est en MODE RAID');

  score = Math.max(0, Math.min(100, score));
  const level =
    score >= 70 ? { label: 'CRITIQUE', emoji: '🔴', color: 0xed4245 } :
    score >= 45 ? { label: 'ÉLEVÉ', emoji: '🟠', color: 0xf39c12 } :
    score >= 20 ? { label: 'MOYEN', emoji: '🟡', color: 0xfee75c } :
    { label: 'FAIBLE', emoji: '🟢', color: 0x57f287 };

  return {
    user,
    member,
    facts: {
      accountAge,
      joinDelay,
      timeBeforeClick,
      hasAvatar,
      animatedAvatar,
      hasBanner,
      hasDecoration,
      badges,
      nitroHints,
      joinCount,
      inviteCode: memberData.inviteCode ?? null,
      inviterId: memberData.inviterId ?? null,
      vanity: memberData.vanity ?? false,
      previousNames: userData.names.filter((n) => n !== user.tag).slice(-5),
      localSanctions,
      localWarns,
      otherSanctions,
      mutualGuilds: mutualGuilds.map((gu) => gu.name),
      presence,
      memberFlags,
      recentJoiners: recentJoiners.length,
      sameInvite: sameInvite.length,
      randomHints,
      suspiciousWords,
    },
    alts: alts.slice(0, 10),
    risk: { score, level, reasons: reasons.sort((a, b) => b.points - a.points) },
  };
}

/** Met à jour l'historique global de l'utilisateur (pseudos, avatars, arrivées). */
function trackUser(user, guildId) {
  const data = db.user(user.id);
  if (!data.names.includes(user.tag)) data.names.push(user.tag);
  if (data.names.length > 20) data.names.splice(0, data.names.length - 20);
  if (user.avatar && !data.avatars.includes(user.avatar)) data.avatars.push(user.avatar);
  if (data.avatars.length > 10) data.avatars.splice(0, data.avatars.length - 10);
  if (guildId) {
    data.joins.push({ guildId, at: Date.now() });
    if (data.joins.length > 50) data.joins.splice(0, data.joins.length - 50);
  }
  db.save();
}

module.exports = { analyzeMember, trackUser, similarity, normalizeName, looksRandom, getBans, invalidateBans, BADGES };
