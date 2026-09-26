const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');
const { analyzeMember } = require('../utils/analysis');
const { buildVerificationEmbeds, verificationButtons } = require('../utils/verification');
const { embed, replyError, truncate } = require('../utils/embed');
const { logCase } = require('../utils/moderation');
const { colors } = require('../config');

const DENY_COOLDOWN = 10 * 60_000;

function isVerifier(member, cfg) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId))
  );
}

const statusRow = (label, style) =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:done').setLabel(label.slice(0, 80)).setStyle(style).setDisabled(true));

function reasonModal(action, userId) {
  return new ModalBuilder()
    .setCustomId(`verify:${action}modal:${userId}`)
    .setTitle(action === 'question' ? 'Poser une question au membre' : action === 'ban' ? 'Bannir le membre' : 'Refuser la vérification')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel(action === 'question' ? 'Question (envoyée en MP)' : 'Raison (envoyée en MP)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(action === 'question')
          .setMaxLength(1000),
      ),
    );
}

async function start(interaction) {
  const guild = interaction.guild;
  const g = db.guild(guild.id);
  const cfg = g.config.verification;
  if (!cfg.enabled || !cfg.staffChannelId || !cfg.verifiedRoleId) {
    return replyError(interaction, "La vérification n'est pas configurée sur ce serveur. Préviens un administrateur.");
  }
  const member = interaction.member;
  if (member.roles.cache.has(cfg.verifiedRoleId)) return replyError(interaction, 'Tu es déjà vérifié ! 🎉');

  const record = g.verifications[member.id];
  if (record?.status === 'pending') {
    return replyError(interaction, 'Ta demande est déjà en attente. Merci de patienter, un modérateur va la traiter.');
  }
  const lastDenial = record?.history?.filter((h) => h.status === 'denied').at(-1);
  if (lastDenial && Date.now() - lastDenial.at < DENY_COOLDOWN) {
    return replyError(interaction, 'Ta dernière demande a été refusée récemment. Réessaie plus tard.');
  }

  const staffChannel = guild.channels.cache.get(cfg.staffChannelId);
  if (!staffChannel) return replyError(interaction, 'Le salon de vérification du staff est introuvable. Préviens un administrateur.');

  await interaction.deferReply({ ephemeral: true });
  const analysis = await analyzeMember(member);
  const message = await staffChannel.send({
    content: cfg.staffRoleId ? `<@&${cfg.staffRoleId}> nouvelle demande de vérification` : undefined,
    embeds: buildVerificationEmbeds(analysis),
    components: verificationButtons(member.id),
    allowedMentions: { roles: cfg.staffRoleId ? [cfg.staffRoleId] : [] },
  });

  g.verifications[member.id] = {
    status: 'pending',
    messageId: message.id,
    channelId: staffChannel.id,
    requestedAt: Date.now(),
    score: analysis.risk.score,
    history: record?.history ?? [],
  };
  db.save();

  return interaction.editReply({
    embeds: [
      embed(guild.id)
        .setTitle('📨 Demande envoyée')
        .setDescription("Ta demande de vérification a été transmise à l'équipe de modération.\nTu recevras un MP dès qu'elle sera traitée."),
    ],
  });
}

async function finalize(interaction, userId, status, reason) {
  const guild = interaction.guild;
  const g = db.guild(guild.id);
  const record = g.verifications[userId] ?? (g.verifications[userId] = { history: [] });
  record.status = status;
  record.history = [...(record.history ?? []), { status, by: interaction.user.id, at: Date.now(), reason: reason || null }];
  db.save();

  const labels = {
    accepted: [`✅ Accepté par ${interaction.user.tag}`, ButtonStyle.Success],
    denied: [`👢 Refusé par ${interaction.user.tag}`, ButtonStyle.Secondary],
    banned: [`🔨 Banni par ${interaction.user.tag}`, ButtonStyle.Danger],
  };
  const [label, style] = labels[status];
  const msg = interaction.message ?? (await guild.channels.cache.get(record.channelId)?.messages.fetch(record.messageId).catch(() => null));
  if (msg) {
    const embeds = msg.embeds.map((e) => e.toJSON());
    if (embeds[0]) {
      embeds[0].fields = [
        ...(embeds[0].fields ?? []),
        { name: '⚖️ Décision', value: truncate(`${label}${reason ? `\nRaison : ${reason}` : ''} — <t:${Math.floor(Date.now() / 1000)}:R>`) },
      ];
    }
    await msg.edit({ content: null, embeds, components: [statusRow(label, style)] }).catch(() => null);
  }
}

async function dm(user, guild, title, description, color) {
  const e = embed(guild.id).setTitle(title).setDescription(description).setThumbnail(guild.iconURL());
  if (color) e.setColor(color);
  return user.send({ embeds: [e] }).then(() => true).catch(() => false);
}

module.exports = {
  prefix: 'verify',
  async execute(interaction) {
    const [, action, userId] = interaction.customId.split(':');
    if (action === 'start') return start(interaction);

    const guild = interaction.guild;
    const cfg = db.config(guild.id).verification;
    if (!isVerifier(interaction.member, cfg)) return replyError(interaction, "Tu n'as pas la permission de traiter les vérifications.");

    const member = await guild.members.fetch(userId).catch(() => null);
    const record = db.guild(guild.id).verifications[userId];
    const alreadyHandled = record && record.status !== 'pending';

    // Les boutons ouvrant un formulaire
    if (['deny', 'ban', 'question'].includes(action)) {
      if (alreadyHandled && action !== 'ban') return replyError(interaction, `Cette demande a déjà été traitée (${record.status}).`);
      return interaction.showModal(reasonModal(action, userId));
    }

    if (action === 'refresh') {
      if (!member) return replyError(interaction, "Ce membre n'est plus sur le serveur.");
      await interaction.deferUpdate();
      const analysis = await analyzeMember(member);
      return interaction.message.edit({ embeds: buildVerificationEmbeds(analysis), components: verificationButtons(userId) });
    }

    if (action === 'accept') {
      if (alreadyHandled) return replyError(interaction, `Cette demande a déjà été traitée (${record.status}).`);
      if (!member) return replyError(interaction, "Ce membre n'est plus sur le serveur.");
      try {
        await member.roles.add(cfg.verifiedRoleId, `Vérifié par ${interaction.user.tag}`);
        if (cfg.unverifiedRoleId) await member.roles.remove(cfg.unverifiedRoleId).catch(() => null);
      } catch (err) {
        return replyError(interaction, `Impossible de donner le rôle vérifié (le rôle du bot doit être au-dessus) : \`${err.message}\``);
      }
      await interaction.deferUpdate();
      await finalize(interaction, userId, 'accepted');
      await logCase(guild, { type: 'verification', target: member.user, moderator: interaction.user, reason: 'Vérification acceptée' });
      if (cfg.dmOnDecision) await dm(member.user, guild, '✅ Vérification acceptée', `Bienvenue sur **${guild.name}** ! Tu as maintenant accès au serveur.`, colors.success);
      return;
    }

    if (action === 'denymodal' || action === 'banmodal') {
      const reason = interaction.fields.getTextInputValue('text') || 'Aucune raison fournie';
      const ban = action === 'banmodal';
      if (!ban && !member) return replyError(interaction, "Ce membre n'est plus sur le serveur.");
      if (member && !(ban ? member.bannable : member.kickable)) return replyError(interaction, `Je ne peux pas ${ban ? 'bannir' : 'expulser'} ce membre (hiérarchie des rôles).`);
      await interaction.deferUpdate();
      const user = member?.user ?? (await interaction.client.users.fetch(userId));
      if (cfg.dmOnDecision) {
        await dm(user, guild, ban ? '🔨 Vérification refusée — banni' : '❌ Vérification refusée', `Ta vérification sur **${guild.name}** a été refusée.\nRaison : ${reason}`, colors.error);
      }
      if (ban) await guild.members.ban(userId, { reason: `Vérification : ${reason} (par ${interaction.user.tag})`, deleteMessageSeconds: 86400 });
      else await member.kick(`Vérification refusée : ${reason} (par ${interaction.user.tag})`);
      await finalize(interaction, userId, ban ? 'banned' : 'denied', reason);
      await logCase(guild, { type: ban ? 'ban' : 'kick', target: user, moderator: interaction.user, reason: `Vérification refusée : ${reason}` });
      return;
    }

    if (action === 'questionmodal') {
      const question = interaction.fields.getTextInputValue('text');
      if (!member) return replyError(interaction, "Ce membre n'est plus sur le serveur.");
      const modmailOn = db.config(guild.id).modmail.enabled;
      const sent = await dm(
        member.user,
        guild,
        `💬 Question de l'équipe de ${guild.name}`,
        `${question}\n\n${modmailOn ? '➡️ Réponds simplement à ce message privé : ta réponse sera transmise au staff.' : '➡️ Réponds dans le salon de vérification ou attends la décision du staff.'}`,
      );
      return interaction.reply({
        embeds: [embed(guild.id).setDescription(sent ? `💬 Question envoyée à ${member} par ${interaction.user} :\n> ${truncate(question, 900)}` : `❌ Impossible d'envoyer un MP à ${member} (MP fermés).`)],
      });
    }
  },
};
