const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replyError, replySuccess, reply, truncate } = require('../../utils/embed');
const { panelEmbed, panelComponents, buildVerificationEmbeds } = require('../../utils/verification');
const { analyzeMember } = require('../../utils/analysis');
const { logCase } = require('../../utils/moderation');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Système de vérification manuelle des nouveaux membres')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Configure la vérification et envoie le panneau')
        .addChannelOption((o) => o.setName('salon_panneau').setDescription('Salon où les nouveaux cliquent pour se faire vérifier').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addChannelOption((o) => o.setName('salon_staff').setDescription('Salon privé où arrivent les fiches de vérification').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addRoleOption((o) => o.setName('role_verifie').setDescription('Rôle donné une fois vérifié (accès au serveur)').setRequired(true))
        .addRoleOption((o) => o.setName('role_staff').setDescription('Rôle pingé et autorisé à valider'))
        .addRoleOption((o) => o.setName('role_non_verifie').setDescription('(Optionnel) Rôle donné à l\'arrivée et retiré après vérification')),
    )
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Renvoie le panneau de vérification')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon (par défaut : celui configuré)').addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription('Active / désactive la vérification')
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('options')
        .setDescription('Options avancées')
        .addIntegerOption((o) => o.setName('autokick_heures').setDescription('Expulser les non-vérifiés après X heures (0 = jamais)').setMinValue(0).setMaxValue(720))
        .addBooleanOption((o) => o.setName('mp_decision').setDescription('Envoyer un MP au membre lors de la décision')),
    )
    .addSubcommand((s) =>
      s
        .setName('verifier')
        .setDescription('Vérifie manuellement un membre (sans passer par le bouton)')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retire la vérification à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('attente').setDescription('Liste les demandes en attente'))
    .addSubcommand((s) =>
      s
        .setName('scan')
        .setDescription("Génère la fiche d'analyse complète d'un membre (risque, doubles comptes...)")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    const cfg = g.config.verification;
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const panel = interaction.options.getChannel('salon_panneau');
      const staff = interaction.options.getChannel('salon_staff');
      const verified = interaction.options.getRole('role_verifie');
      const staffRole = interaction.options.getRole('role_staff');
      const unverified = interaction.options.getRole('role_non_verifie');
      for (const role of [verified, unverified].filter(Boolean)) {
        if (!role.editable || role.managed) return replyError(interaction, `Je ne peux pas gérer le rôle ${role} : place mon rôle au-dessus.`);
      }
      Object.assign(cfg, {
        enabled: true,
        panelChannelId: panel.id,
        staffChannelId: staff.id,
        verifiedRoleId: verified.id,
        staffRoleId: staffRole?.id ?? null,
        unverifiedRoleId: unverified?.id ?? null,
      });
      const msg = await panel.send({ embeds: [panelEmbed(guild)], components: panelComponents() });
      cfg.panelMessageId = msg.id;
      db.save();
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setTitle('✅ Vérification configurée')
            .setDescription(
              [
                `• Panneau : ${panel}`,
                `• Fiches staff : ${staff}`,
                `• Rôle vérifié : ${verified}`,
                staffRole ? `• Rôle staff : ${staffRole}` : null,
                unverified ? `• Rôle non vérifié : ${unverified}` : null,
                '',
                '**⚠️ À faire pour que ce soit efficace :**',
                "1. Retire la permission **Voir les salons** à `@everyone` (Paramètres du serveur > Rôles).",
                `2. Donne **Voir les salons** au rôle ${verified}.`,
                `3. Dans ${panel}, autorise \`@everyone\` à voir le salon (sans pouvoir écrire).`,
                `4. Rends ${staff} visible uniquement par le staff.`,
                '',
                'Astuce : `/setup verification` peut créer et configurer tout ça automatiquement.',
              ]
                .filter((l) => l !== null)
                .join('\n'),
            ),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'panel') {
      const channel = interaction.options.getChannel('salon') ?? guild.channels.cache.get(cfg.panelChannelId);
      if (!channel) return replyError(interaction, 'Aucun salon configuré. Utilise `/verification setup`.');
      const msg = await channel.send({ embeds: [panelEmbed(guild)], components: panelComponents() });
      cfg.panelChannelId = channel.id;
      cfg.panelMessageId = msg.id;
      db.save();
      return replySuccess(interaction, `Panneau envoyé dans ${channel}.`, true);
    }

    if (sub === 'toggle') {
      cfg.enabled = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Vérification **${cfg.enabled ? 'activée' : 'désactivée'}**.`);
    }

    if (sub === 'options') {
      const hours = interaction.options.getInteger('autokick_heures');
      const dm = interaction.options.getBoolean('mp_decision');
      if (hours !== null) cfg.autoKickHours = hours;
      if (dm !== null) cfg.dmOnDecision = dm;
      db.save();
      return replySuccess(interaction, `Options : auto-kick **${cfg.autoKickHours ? `${cfg.autoKickHours}h` : 'désactivé'}**, MP de décision **${cfg.dmOnDecision ? 'oui' : 'non'}**.`);
    }

    if (sub === 'verifier' || sub === 'retirer') {
      const member = interaction.options.getMember('membre');
      if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
      if (!cfg.verifiedRoleId) return replyError(interaction, 'Vérification non configurée.');
      if (sub === 'verifier') {
        await member.roles.add(cfg.verifiedRoleId, `Vérifié manuellement par ${interaction.user.tag}`);
        if (cfg.unverifiedRoleId) await member.roles.remove(cfg.unverifiedRoleId).catch(() => null);
        const record = g.verifications[member.id] ?? { history: [] };
        record.status = 'accepted';
        record.history = [...(record.history ?? []), { status: 'accepted', by: interaction.user.id, at: Date.now(), reason: 'manuel' }];
        g.verifications[member.id] = record;
        db.save();
        await logCase(guild, { type: 'verification', target: member.user, moderator: interaction.user, reason: 'Vérification manuelle' });
        return replySuccess(interaction, `${member} est maintenant vérifié.`);
      }
      await member.roles.remove(cfg.verifiedRoleId, `Vérification retirée par ${interaction.user.tag}`);
      if (cfg.unverifiedRoleId) await member.roles.add(cfg.unverifiedRoleId).catch(() => null);
      if (g.verifications[member.id]) g.verifications[member.id].status = 'revoked';
      db.save();
      return replySuccess(interaction, `La vérification de ${member} a été retirée.`);
    }

    if (sub === 'attente') {
      const pending = Object.entries(g.verifications).filter(([, v]) => v.status === 'pending');
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`⏳ Demandes en attente (${pending.length})`)
            .setDescription(
              truncate(
                pending.length
                  ? pending
                      .map(([id, v]) => `<@${id}> • risque **${v.score ?? '?'}**/100 • ${ts(v.requestedAt, 'R')} • [fiche](https://discord.com/channels/${guild.id}/${v.channelId}/${v.messageId})`)
                      .join('\n')
                  : 'Aucune demande en attente.',
                4000,
              ),
            ),
        ],
      });
    }

    if (sub === 'scan') {
      const member = interaction.options.getMember('membre');
      if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
      await interaction.deferReply({ ephemeral: true });
      const analysis = await analyzeMember(member);
      return interaction.editReply({ embeds: buildVerificationEmbeds(analysis) });
    }
  },
};
