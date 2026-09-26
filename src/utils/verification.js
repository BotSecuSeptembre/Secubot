const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatDuration, ts } = require('./time');
const { truncate, themeColor } = require('./embed');
const { ACTION_LABELS } = require('./moderation');

const yesNo = (v) => (v ? '✅ Oui' : '❌ Non');

/** Construit les embeds détaillés de la fiche de vérification. */
function buildVerificationEmbeds(analysis) {
  const { user, member, facts, alts, risk } = analysis;
  const guild = member.guild;

  const identity = new EmbedBuilder()
    .setColor(risk.level.color)
    .setAuthor({ name: `Demande de vérification — ${user.tag}`, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 512 }))
    .setDescription(
      [
        `**Membre :** ${user} • \`${user.id}\``,
        `**Nom d'utilisateur :** \`${user.username}\``,
        `**Nom affiché :** ${user.globalName ? `\`${user.globalName}\`` : '*aucun*'}${member.nickname ? ` • Surnom : \`${member.nickname}\`` : ''}`,
        `**Risque : ${risk.level.emoji} ${risk.level.label} (${risk.score}/100)**`,
      ].join('\n'),
    )
    .addFields(
      {
        name: '📅 Compte',
        value: [
          `Créé : ${ts(user.createdTimestamp, 'f')} (${ts(user.createdTimestamp, 'R')})`,
          `Âge : **${formatDuration(facts.accountAge)}**`,
          `Arrivé : ${member.joinedTimestamp ? `${ts(member.joinedTimestamp, 'f')} (${ts(member.joinedTimestamp, 'R')})` : 'inconnu'}`,
          `Création → arrivée : **${facts.joinDelay != null ? formatDuration(facts.joinDelay) : '?'}**`,
          `Arrivée → clic : **${facts.timeBeforeClick != null ? formatDuration(facts.timeBeforeClick) : '?'}**`,
        ].join('\n'),
      },
      {
        name: '🖼️ Profil',
        value: [
          `Avatar : ${facts.hasAvatar ? `✅${facts.animatedAvatar ? ' (animé)' : ''}` : '❌ par défaut'}`,
          `Bannière : ${yesNo(facts.hasBanner)}`,
          `Décoration : ${yesNo(facts.hasDecoration)}`,
          `Couleur de profil : ${user.hexAccentColor ?? 'aucune'}`,
          `Bot : ${yesNo(user.bot)}`,
          `Indices Nitro : ${facts.nitroHints.length ? facts.nitroHints.join(', ') : 'aucun'}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🏅 Badges',
        value: truncate(facts.badges.length ? facts.badges.join('\n') : 'Aucun'),
        inline: true,
      },
      {
        name: '📨 Invitation',
        value: facts.vanity
          ? `URL personnalisée \`${facts.inviteCode}\``
          : facts.inviteCode
            ? `\`${facts.inviteCode}\`${facts.inviterId ? ` par <@${facts.inviterId}> (\`${facts.inviterId}\`)` : ''}`
            : 'Inconnue',
        inline: true,
      },
      {
        name: '🔁 Historique sur ce serveur',
        value: [
          `Arrivées : **${facts.joinCount}**`,
          `Sanctions : **${facts.localSanctions.length}**${
            facts.localSanctions.length
              ? `\n${facts.localSanctions.slice(-3).map((c) => `• #${c.id} ${ACTION_LABELS[c.type] ?? c.type} — ${truncate(c.reason, 60)}`).join('\n')}`
              : ''
          }`,
          `Avertissements : **${facts.localWarns.length}**`,
          facts.memberFlags.length ? `Drapeaux : ${facts.memberFlags.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        inline: true,
      },
      {
        name: '🌐 Hors de ce serveur',
        value: [
          `Serveurs en commun avec le bot : **${facts.mutualGuilds.length}**${facts.mutualGuilds.length ? ` (${truncate(facts.mutualGuilds.slice(0, 5).join(', '), 200)})` : ''}`,
          `Sanctions ailleurs : **${facts.otherSanctions.length}**`,
          `Anciens pseudos connus : ${facts.previousNames.length ? facts.previousNames.map((n) => `\`${n}\``).join(', ') : 'aucun'}`,
        ].join('\n'),
      },
    )
    .setFooter({ text: `ID : ${user.id}` })
    .setTimestamp();

  if (user.bannerURL()) identity.setImage(user.bannerURL({ size: 1024 }));

  if (facts.presence) {
    identity.addFields({
      name: '🟢 Présence',
      value: truncate(
        [
          `Statut : \`${facts.presence.status}\``,
          `Appareils : ${facts.presence.devices.length ? facts.presence.devices.join(', ') : 'aucun (hors ligne / invisible)'}`,
          facts.presence.activities.length ? `Activités : ${facts.presence.activities.join(' • ')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    });
  }

  const analysisEmbed = new EmbedBuilder()
    .setColor(risk.level.color)
    .setTitle(`${risk.level.emoji} Analyse de risque : ${risk.score}/100`)
    .setDescription(
      truncate(
        risk.reasons.length
          ? risk.reasons.map((r) => `\`${r.points > 0 ? '+' : ''}${r.points}\` ${r.reason}`).join('\n')
          : 'Aucun signal particulier.',
        1500,
      ),
    );

  if (alts.length) {
    analysisEmbed.addFields({
      name: `🕵️ Doubles comptes / correspondances possibles (${alts.length})`,
      value: truncate(alts.map((a) => `• ${a.label} → <@${a.id}> \`${a.tag}\` (\`${a.id}\`)`).join('\n')),
    });
  }
  analysisEmbed.addFields({
    name: '📊 Contexte',
    value: `Arrivées dans les ±10 min : **${facts.recentJoiners}** • Même invitation : **${facts.sameInvite}** • Membres : **${guild.memberCount}**`,
  });

  for (const e of [identity, analysisEmbed]) {
    for (const field of e.data.fields ?? []) field.value = truncate(field.value);
  }
  return [identity, analysisEmbed];
}

function verificationButtons(userId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verify:accept:${userId}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`verify:deny:${userId}`).setLabel('Refuser (kick)').setEmoji('👢').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`verify:ban:${userId}`).setLabel('Bannir').setEmoji('🔨').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verify:question:${userId}`).setLabel('Poser une question').setEmoji('💬').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`verify:refresh:${userId}`).setLabel('Actualiser').setEmoji('🔄').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    ),
  ];
}

function panelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:start').setLabel('Se faire vérifier').setEmoji('🪪').setStyle(ButtonStyle.Success),
    ),
  ];
}

function panelEmbed(guild) {
  return new EmbedBuilder()
    .setColor(themeColor(guild.id))
    .setTitle('🪪 Vérification')
    .setThumbnail(guild.iconURL())
    .setDescription(
      [
        `Bienvenue sur **${guild.name}** !`,
        '',
        "Pour accéder au reste du serveur, clique sur le bouton ci-dessous. Ta demande sera examinée par l'équipe de modération.",
        '',
        '> ⏳ La vérification est manuelle : merci de patienter.',
        '> 📩 Garde tes MP ouverts pour recevoir la réponse.',
      ].join('\n'),
    );
}

module.exports = { buildVerificationEmbeds, verificationButtons, panelComponents, panelEmbed };
