const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { embed, truncate } = require('./embed');
const { sendLog } = require('./logger');
const { addWarn, logCase } = require('./moderation');
const { colors } = require('../config');

/** guildId:userId -> [{ t, content }] */
const history = new Map();

const INVITE_REGEX = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite|dsc\.gg|\.gg\/)\/?[a-z0-9-]+/i;
const LINK_REGEX = /https?:\/\/([^\s/]+)/gi;
const EMOJI_REGEX = /(<a?:\w+:\d+>|\p{Extended_Pictographic})/gu;
const ZALGO_REGEX = /[̀-ͯ҃-҉᷀-᷿⃐-⃿︠-︯]{4,}/;

/** Retourne la raison de l'infraction ou null. */
function detect(message, cfg) {
  const content = message.content ?? '';
  const lower = content.toLowerCase();
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();

  // Historique pour spam / doublons
  const list = (history.get(key) ?? []).filter((m) => now - m.t < 30_000);
  list.push({ t: now, content: lower });
  history.set(key, list);

  if (cfg.antiSpam.enabled) {
    const recent = list.filter((m) => now - m.t < cfg.antiSpam.seconds * 1000);
    if (recent.length >= cfg.antiSpam.messages) return { reason: `Spam (${recent.length} messages en ${cfg.antiSpam.seconds}s)`, purge: true };
  }
  if (cfg.antiDuplicate.enabled && lower.length > 0) {
    const same = list.filter((m) => m.content === lower).length;
    if (same >= cfg.antiDuplicate.count) return { reason: `Message répété ${same} fois`, purge: true };
  }
  if (cfg.antiInvite && INVITE_REGEX.test(content)) return { reason: "Lien d'invitation Discord" };
  if (cfg.antiLink) {
    for (const match of content.matchAll(LINK_REGEX)) {
      const host = match[1].toLowerCase().replace(/^www\./, '');
      if (!cfg.allowedDomains.some((d) => host === d || host.endsWith(`.${d}`))) return { reason: `Lien non autorisé (${host})` };
    }
  }
  if (cfg.antiEveryone && (content.includes('@everyone') || content.includes('@here')) && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
    return { reason: 'Tentative de mention @everyone/@here' };
  }
  if (cfg.antiMassMention.enabled) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions >= cfg.antiMassMention.limit) return { reason: `Mentions de masse (${mentions})` };
  }
  if (cfg.badWords.length) {
    const normalized = lower.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const word = cfg.badWords.find((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(normalized));
    if (word) return { reason: `Mot interdit (${word})` };
  }
  if (cfg.antiCaps.enabled && content.length >= cfg.antiCaps.minLength) {
    const letters = content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    const caps = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
    if (letters.length >= cfg.antiCaps.minLength && (caps / letters.length) * 100 >= cfg.antiCaps.percent) return { reason: 'Abus de majuscules' };
  }
  if (cfg.antiEmoji.enabled) {
    const count = (content.match(EMOJI_REGEX) || []).length;
    if (count >= cfg.antiEmoji.limit) return { reason: `Trop d'emojis (${count})` };
  }
  if (cfg.antiZalgo && ZALGO_REGEX.test(content)) return { reason: 'Texte zalgo' };
  if (cfg.antiNewlines.enabled && content.split('\n').length > cfg.antiNewlines.limit) return { reason: 'Trop de retours à la ligne' };
  return null;
}

/** Vérifie un message. Renvoie true si une infraction a été traitée. */
async function runAutomod(message) {
  const cfg = db.config(message.guild.id).automod;
  if (!cfg.enabled || !message.member) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (cfg.ignoredChannels.includes(message.channel.id) || cfg.ignoredChannels.includes(message.channel.parentId)) return false;
  if (message.member.roles.cache.some((r) => cfg.ignoredRoles.includes(r.id))) return false;

  const hit = detect(message, cfg);
  if (!hit) return false;

  const guild = message.guild;
  const me = guild.members.me;
  await message.delete().catch(() => null);
  if (hit.purge) {
    // supprime aussi les messages récents du spammeur dans ce salon
    const recent = await message.channel.messages.fetch({ limit: 30 }).catch(() => null);
    const toDelete = recent?.filter((m) => m.author.id === message.author.id && Date.now() - m.createdTimestamp < 30_000);
    if (toDelete?.size) await message.channel.bulkDelete(toDelete, true).catch(() => null);
    history.delete(`${guild.id}:${message.author.id}`);
  }

  let actionText = 'message supprimé';
  if (cfg.action === 'warn') {
    const res = await addWarn(guild, message.member, me.user, `[Automod] ${hit.reason}`);
    actionText = `avertissement #${res.count}${res.applied ? ` → ${res.applied}` : ''}`;
  } else if (cfg.action === 'timeout' && message.member.moderatable) {
    const duration = cfg.timeoutMinutes * 60_000;
    await message.member.timeout(duration, `[Automod] ${hit.reason}`).catch(() => null);
    await logCase(guild, { type: 'timeout', target: message.member, moderator: me.user, reason: `[Automod] ${hit.reason}`, duration });
    actionText = `mute ${cfg.timeoutMinutes} min`;
  }

  const notice = await message.channel
    .send({ content: `${message.author}`, embeds: [embed(guild.id).setColor(colors.warning).setDescription(`🤖 **Automod** : ${hit.reason} (${actionText})`)] })
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 6000);

  await sendLog(
    guild,
    'mod',
    embed(guild.id)
      .setColor(colors.warning)
      .setAuthor({ name: `Automod • ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .addFields(
        { name: 'Membre', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
        { name: 'Salon', value: `${message.channel}`, inline: true },
        { name: 'Infraction', value: hit.reason, inline: true },
        { name: 'Action', value: actionText, inline: true },
        { name: 'Message', value: truncate(message.content || '*vide*') },
      )
      .setTimestamp(),
  );
  return true;
}

// Nettoyage mémoire
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of history) if (!list.some((m) => now - m.t < 30_000)) history.delete(key);
}, 60_000).unref();

module.exports = { runAutomod };
