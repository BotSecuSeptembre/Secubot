const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { embed, truncate } = require('./embed');
const { ts, formatDuration } = require('./time');
const { colors } = require('../config');
const { sendLog } = require('./logger');

/** Messages en attente du choix du serveur : userId -> Message */
const pendingChoice = new Map();

const closeButton = (userId) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`modmail:close:${userId}`).setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );

/** Serveur où l'utilisateur a déjà un ticket ouvert. */
function findOpenTicket(client, userId) {
  for (const guild of client.guilds.cache.values()) {
    const ticket = db.guild(guild.id).modmail[userId];
    if (ticket?.open) return { guild, ticket };
  }
  return null;
}

/** Trouve le ticket associé à un fil de modmail. */
function findTicketByThread(guildId, threadId) {
  const tickets = db.guild(guildId).modmail;
  for (const [userId, ticket] of Object.entries(tickets)) {
    if (ticket.open && ticket.threadId === threadId) return { userId, ticket };
  }
  return null;
}

function attachmentsText(message) {
  return message.attachments.map((a) => `[${a.name}](${a.url})`).join('\n');
}

/** Transfère un MP de l'utilisateur dans le fil du ticket. */
async function relayToStaff(guild, ticket, message) {
  const thread = await guild.channels.fetch(ticket.threadId).catch(() => null);
  if (!thread) return false;
  if (thread.archived) await thread.setArchived(false).catch(() => null);
  const e = new EmbedBuilder()
    .setColor(colors.info)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(truncate(message.content || '*[pas de texte]*', 4000))
    .setFooter({ text: `ID : ${message.author.id}` })
    .setTimestamp();
  const files = attachmentsText(message);
  if (files) e.addFields({ name: 'Pièces jointes', value: truncate(files) });
  const image = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (image) e.setImage(image.url);
  await thread.send({ embeds: [e] });
  ticket.lastMessage = Date.now();
  db.save();
  return true;
}

/** Ouvre un nouveau ticket dans le serveur choisi. */
async function openTicket(guild, user, firstMessage) {
  const cfg = db.config(guild.id).modmail;
  const channel = guild.channels.cache.get(cfg.channelId);
  if (!channel) throw new Error('Salon modmail introuvable');

  const member = await guild.members.fetch(user.id).catch(() => null);
  const g = db.guild(guild.id);
  const cases = g.cases.filter((c) => c.targetId === user.id);
  const previousTickets = g.modmail[user.id]?.count ?? 0;

  const info = embed(guild.id)
    .setTitle('📩 Nouveau ticket Modmail')
    .setThumbnail(user.displayAvatarURL())
    .setDescription(`${user} • \`${user.tag}\` • \`${user.id}\``)
    .addFields(
      { name: 'Compte créé', value: `${ts(user.createdTimestamp, 'R')} (${formatDuration(Date.now() - user.createdTimestamp)})`, inline: true },
      { name: 'Arrivé sur le serveur', value: member?.joinedTimestamp ? ts(member.joinedTimestamp, 'R') : 'non membre', inline: true },
      { name: 'Tickets précédents', value: String(previousTickets), inline: true },
      { name: 'Sanctions', value: String(cases.length), inline: true },
      {
        name: 'Rôles',
        value: truncate(member ? member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.toString()).join(' ') || 'aucun' : '—'),
      },
      {
        name: 'Comment répondre',
        value: "Écris simplement dans ce fil : ton message est transmis en MP.\nCommence par `!` ou `//` pour une note interne (non transmise).\n`/modmail reply` pour répondre anonymement • `/modmail close` pour fermer.",
      },
    )
    .setTimestamp();

  const ping = cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : undefined;
  let thread;
  if (channel.type === ChannelType.GuildForum) {
    thread = await channel.threads.create({
      name: `📩 ${user.username}`.slice(0, 100),
      message: { content: ping, embeds: [info], components: [closeButton(user.id)] },
    });
  } else {
    const starter = await channel.send({ content: ping, embeds: [info], components: [closeButton(user.id)] });
    thread = await starter.startThread({ name: `📩 ${user.username}`.slice(0, 100), autoArchiveDuration: 10080 });
  }

  g.modmail[user.id] = {
    open: true,
    threadId: thread.id,
    openedAt: Date.now(),
    lastMessage: Date.now(),
    count: previousTickets + 1,
  };
  db.save();

  if (!firstMessage) return thread; // ticket ouvert par le staff (/modmail contact)
  await relayToStaff(guild, g.modmail[user.id], firstMessage);
  await user
    .send({
      embeds: [
        embed(guild.id)
          .setTitle(`📨 Ticket ouvert — ${guild.name}`)
          .setDescription("Ton message a été transmis à l'équipe de modération. Tu recevras la réponse ici.\nTous tes prochains messages seront ajoutés au ticket.")
          .setThumbnail(guild.iconURL()),
      ],
    })
    .catch(() => null);
  return thread;
}

/** Gestion d'un MP reçu par le bot. */
async function handleDM(message, client) {
  const user = message.author;
  const open = findOpenTicket(client, user.id);
  if (open) {
    if (db.config(open.guild.id).modmail.blocked.includes(user.id)) return;
    const ok = await relayToStaff(open.guild, open.ticket, message);
    if (ok) return message.react('✅').catch(() => null);
    open.ticket.open = false; // fil supprimé : on ouvrira un nouveau ticket
    db.save();
  }

  // Serveurs disponibles
  const guilds = [];
  for (const guild of client.guilds.cache.values()) {
    const cfg = db.config(guild.id).modmail;
    if (!cfg.enabled || !cfg.channelId || cfg.blocked.includes(user.id)) continue;
    const member = guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));
    if (member) guilds.push(guild);
  }

  if (!guilds.length) {
    return message.reply("❌ Aucun serveur en commun n'a le modmail activé.").catch(() => null);
  }
  if (guilds.length === 1) {
    await openTicket(guilds[0], user, message).catch((err) => {
      console.error('[modmail]', err);
      return message.reply("❌ Impossible d'ouvrir le ticket (salon modmail mal configuré).");
    });
    return message.react('✅').catch(() => null);
  }

  pendingChoice.set(user.id, message);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('modmail:guild')
    .setPlaceholder('Choisis le serveur à contacter')
    .addOptions(guilds.slice(0, 25).map((g) => ({ label: g.name.slice(0, 100), value: g.id })));
  return message.reply({ content: '📨 À quel serveur veux-tu envoyer ce message ?', components: [new ActionRowBuilder().addComponents(menu)] });
}

/** Message écrit par le staff dans un fil de ticket. */
async function handleStaffMessage(message) {
  const found = findTicketByThread(message.guild.id, message.channel.id);
  if (!found) return;
  const content = message.content.trim();
  if (content.startsWith('!') || content.startsWith('//')) return; // note interne
  await sendStaffReply(message.guild, found.userId, message.member, content, [...message.attachments.values()], db.config(message.guild.id).modmail.anonymous)
    .then(() => message.react('📨'))
    .catch(() => message.react('❌'));
}

/** Envoie une réponse du staff à l'utilisateur. */
async function sendStaffReply(guild, userId, member, content, attachments = [], anonymous = false) {
  const user = await guild.client.users.fetch(userId);
  const e = embed(guild.id)
    .setAuthor(
      anonymous
        ? { name: `Équipe de ${guild.name}`, iconURL: guild.iconURL() ?? undefined }
        : { name: `${member.displayName} — ${guild.name}`, iconURL: member.displayAvatarURL() },
    )
    .setDescription(truncate(content || '*[pièce jointe]*', 4000))
    .setTimestamp();
  const image = attachments.find((a) => a.contentType?.startsWith('image/'));
  if (image) e.setImage(image.url);
  const others = attachments.filter((a) => a !== image).map((a) => `[${a.name}](${a.url})`).join('\n');
  if (others) e.addFields({ name: 'Pièces jointes', value: truncate(others) });
  await user.send({ embeds: [e] });
  return e;
}

/** Ferme un ticket. */
async function closeTicket(guild, userId, closer, reason) {
  const g = db.guild(guild.id);
  const ticket = g.modmail[userId];
  if (!ticket?.open) return false;
  ticket.open = false;
  ticket.closedAt = Date.now();
  db.save();

  const user = await guild.client.users.fetch(userId).catch(() => null);
  await user
    ?.send({
      embeds: [
        embed(guild.id)
          .setTitle(`🔒 Ticket fermé — ${guild.name}`)
          .setDescription(`${reason ? `Raison : ${reason}\n\n` : ''}Envoie un nouveau message pour ouvrir un autre ticket.`),
      ],
    })
    .catch(() => null);

  const thread = await guild.channels.fetch(ticket.threadId).catch(() => null);
  if (thread) {
    await thread.send({ embeds: [embed(guild.id).setDescription(`🔒 Ticket fermé par ${closer}${reason ? ` — ${reason}` : ''}`)] }).catch(() => null);
    await thread.setLocked(true).catch(() => null);
    await thread.setArchived(true).catch(() => null);
  }
  await sendLog(
    guild,
    'mod',
    embed(guild.id).setDescription(`📪 Ticket modmail de <@${userId}> fermé par ${closer}${reason ? ` — ${truncate(reason, 500)}` : ''}${thread ? ` (${thread})` : ''}`),
  );
  return true;
}

module.exports = { handleDM, handleStaffMessage, openTicket, closeTicket, sendStaffReply, findTicketByThread, pendingChoice, closeButton };
