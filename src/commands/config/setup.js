const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../../database');
const { embed, replyError } = require('../../utils/embed');
const { panelEmbed, panelComponents } = require('../../utils/verification');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configuration automatique')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('verification')
        .setDescription('Crée rôle + salons de vérification et cache le serveur aux non-vérifiés')
        .addRoleOption((o) => o.setName('role_staff').setDescription('Rôle du staff qui valide les membres').setRequired(true))
        .addRoleOption((o) => o.setName('role_verifie').setDescription('Rôle vérifié existant (sinon il sera créé)'))
        .addBooleanOption((o) => o.setName('cacher_serveur').setDescription('Cacher tous les salons aux non-vérifiés (recommandé, défaut : oui)'))
        .addBooleanOption((o) => o.setName('verifier_membres_actuels').setDescription('Donner le rôle vérifié à tous les membres déjà présents (défaut : oui)')),
    )
    .addSubcommand((s) => s.setName('securite').setDescription('Active une configuration de sécurité recommandée (automod, antiraid, antinuke, logs)')),
  async execute(interaction) {
    const guild = interaction.guild;
    const cfg = db.config(guild.id);
    const sub = interaction.options.getSubcommand();
    const me = guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.Administrator) && !me.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels])) {
      return replyError(interaction, "J'ai besoin des permissions **Gérer les rôles** et **Gérer les salons** (ou Administrateur).");
    }
    await interaction.deferReply();

    if (sub === 'verification') {
      const staffRole = interaction.options.getRole('role_staff');
      const hide = interaction.options.getBoolean('cacher_serveur') ?? true;
      const everyone = guild.roles.everyone;
      const steps = [];

      let verified = interaction.options.getRole('role_verifie');
      if (!verified) {
        verified = await guild.roles.create({
          name: '✅ Vérifié',
          color: 0x57f287,
          permissions: new PermissionsBitField(everyone.permissions).add(PermissionFlagsBits.ViewChannel),
          reason: 'Setup vérification',
        });
        steps.push(`Rôle ${verified} créé (avec les permissions actuelles de @everyone)`);
      } else if (!verified.editable) {
        return interaction.editReply(`❌ Je ne peux pas gérer ${verified} : place mon rôle au-dessus.`);
      } else if (!verified.permissions.has(PermissionFlagsBits.ViewChannel)) {
        await verified.setPermissions(new PermissionsBitField(verified.permissions).add(PermissionFlagsBits.ViewChannel));
      }

      const category = await guild.channels.create({
        name: '🪪 Vérification',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads] },
          { id: verified.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        ],
      });
      const panel = await guild.channels.create({ name: '🪪-vérification', type: ChannelType.GuildText, parent: category.id });
      await panel.lockPermissions().catch(() => null);
      const staffChannel = await guild.channels.create({
        name: '📋-vérifications-staff',
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
        ],
      });
      steps.push(`Salons ${panel} (public) et ${staffChannel} (staff) créés`);

      if (hide) {
        if (everyone.permissions.has(PermissionFlagsBits.ViewChannel)) {
          await everyone.setPermissions(new PermissionsBitField(everyone.permissions).remove(PermissionFlagsBits.ViewChannel), 'Setup vérification : serveur caché aux non-vérifiés');
          steps.push('Permission **Voir les salons** retirée à @everyone');
        }
        // Les salons qui autorisent explicitement @everyone contourneraient la vérification
        let fixed = 0;
        for (const channel of guild.channels.cache.values()) {
          if (channel.id === category.id || channel.parentId === category.id || !channel.permissionOverwrites) continue;
          const ow = channel.permissionOverwrites.cache.get(everyone.id);
          if (ow?.allow.has(PermissionFlagsBits.ViewChannel)) {
            await channel.permissionOverwrites.edit(everyone, { ViewChannel: null }).catch(() => null);
            await channel.permissionOverwrites.edit(verified, { ViewChannel: true }).catch(() => null);
            fixed++;
          }
        }
        if (fixed) steps.push(`${fixed} salon(s) qui autorisaient @everyone corrigé(s)`);
      }

      Object.assign(cfg.verification, {
        enabled: true,
        panelChannelId: panel.id,
        staffChannelId: staffChannel.id,
        verifiedRoleId: verified.id,
        staffRoleId: staffRole.id,
      });
      const msg = await panel.send({ embeds: [panelEmbed(guild)], components: [...panelComponents()] });
      cfg.verification.panelMessageId = msg.id;
      db.save();
      steps.push('Panneau de vérification envoyé');

      const giveExisting = interaction.options.getBoolean('verifier_membres_actuels') ?? true;
      await interaction.editReply({
        embeds: [
          embed(guild.id)
            .setTitle('✅ Vérification prête')
            .setDescription(
              `${steps.map((s) => `• ${s}`).join('\n')}\n\n${
                giveExisting
                  ? `⏳ Attribution du rôle ${verified} aux membres déjà présents en cours (peut prendre plusieurs minutes)...`
                  : `⚠️ Pense à donner le rôle ${verified} aux membres déjà présents (et au staff) avec \`/verification verifier\`.`
              }`,
            ),
        ],
      });
      if (giveExisting) {
        const members = await guild.members.fetch().catch(() => guild.members.cache);
        let given = 0;
        for (const member of members.values()) {
          if (member.user.bot || member.roles.cache.has(verified.id)) continue;
          const ok = await member.roles.add(verified, 'Setup vérification : membre déjà présent').then(() => true).catch(() => false);
          if (ok) given++;
        }
        await interaction.followUp({ embeds: [embed(guild.id).setDescription(`✅ Rôle ${verified} donné à **${given}** membre(s) déjà présent(s).`)] }).catch(() => null);
      }
      return;
    }

    if (sub === 'securite') {
      cfg.automod.enabled = true;
      cfg.automod.action = 'warn';
      cfg.antiraid.enabled = true;
      cfg.antiraid.minAccountAgeDays = cfg.antiraid.minAccountAgeDays || 3;
      cfg.antiraid.minAgeAction = 'flag';
      cfg.antinuke.enabled = true;
      if (!cfg.warnThresholds.length) {
        cfg.warnThresholds = [
          { count: 3, action: 'timeout', duration: 3_600_000 },
          { count: 5, action: 'kick', duration: null },
          { count: 7, action: 'ban', duration: null },
        ];
      }
      db.save();
      return interaction.editReply({
        embeds: [
          embed(guild.id)
            .setTitle('🛡️ Sécurité recommandée activée')
            .setDescription(
              [
                '• **Automod** activé (spam, doublons, invitations, @everyone, mentions, zalgo) → avertissement',
                '• **Paliers** : 3 warns = mute 1h, 5 = kick, 7 = ban',
                '• **Antiraid** activé : 8 arrivées/10s = mode raid, comptes < 3 jours signalés, bots non autorisés expulsés',
                '• **Antinuke** activé : 3 actions destructrices/10s = retrait des rôles',
                '',
                'Étapes suivantes :',
                '• `/logs auto` pour créer les salons de logs',
                '• `/setup verification` pour la vérification manuelle',
                '• `/modmail setup` pour le modmail',
                '• `/antinuke whitelist` pour tes admins de confiance',
              ].join('\n'),
            ),
        ],
      });
    }
  },
};
