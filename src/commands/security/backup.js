const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const backup = require('../../utils/backup');
const { embed, replyError, replySuccess, reply } = require('../../utils/embed');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Sauvegarde / restauration de la structure du serveur (rôles, salons, permissions)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName('creer').setDescription('Crée une sauvegarde maintenant').addStringOption((o) => o.setName('nom').setDescription('Nom de la sauvegarde').setMaxLength(60)),
    )
    .addSubcommand((s) => s.setName('liste').setDescription('Liste les sauvegardes'))
    .addSubcommand((s) =>
      s
        .setName('charger')
        .setDescription('Restaure une sauvegarde (rien n\'est jamais supprimé)')
        .addStringOption((o) => o.setName('id').setDescription('ID de la sauvegarde').setRequired(true).setAutocomplete(true))
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('Que restaurer ? (défaut : manquants)')
            .addChoices(
              { name: 'Manquants : recrée seulement les rôles/salons supprimés', value: 'missing' },
              { name: 'Complet : recrée + remet les permissions des rôles/salons modifiés', value: 'full' },
            ),
        )
        .addBooleanOption((o) => o.setName('reglages').setDescription('Restaurer les réglages du serveur (vérification, filtre, perms @everyone...)'))
        .addBooleanOption((o) => o.setName('emojis').setDescription('Recréer les emojis supprimés'))
        .addBooleanOption((o) => o.setName('bannis').setDescription('Re-bannir les utilisateurs bannis au moment de la sauvegarde')),
    )
    .addSubcommand((s) =>
      s
        .setName('info')
        .setDescription("Détail d'une sauvegarde")
        .addStringOption((o) => o.setName('id').setDescription('ID de la sauvegarde').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('supprimer')
        .setDescription('Supprime une sauvegarde')
        .addStringOption((o) => o.setName('id').setDescription('ID de la sauvegarde').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('auto')
        .setDescription('Sauvegarde automatique quotidienne')
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      backup
        .list(interaction.guild.id)
        .filter((b) => b.id.includes(focused) || b.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((b) => ({ name: `${b.name} — ${new Date(b.createdAt).toLocaleString('fr-FR')} (${b.id})`.slice(0, 100), value: b.id })),
    );
  },
  async execute(interaction) {
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();

    if (sub === 'creer') {
      await interaction.deferReply();
      const data = await backup.create(guild, interaction.options.getString('nom'));
      return replySuccess(
        interaction,
        `Sauvegarde **${data.name}** créée (\`${data.id}\`) : ${data.roles.length} rôles, ${data.channels.length} salons, ${data.emojis.length} emojis, ${data.bans.length} bannis.`,
      );
    }

    if (sub === 'liste') {
      const all = backup.list(guild.id);
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`💾 Sauvegardes (${all.length})`)
            .setDescription(
              all.map((b) => `\`${b.id}\` • **${b.name}**${b.auto ? ' 🤖' : ''} • ${ts(b.createdAt, 'R')} • ${b.roles} rôles, ${b.channels} salons, ${b.emojis} emojis, ${b.bans} bannis`).join('\n') ||
                'Aucune sauvegarde. Utilise `/backup creer`.',
            )
            .setFooter({ text: `Sauvegarde auto : ${db.config(guild.id).autoBackup ? 'activée' : 'désactivée'} • 15 sauvegardes max` }),
        ],
      });
    }

    if (sub === 'auto') {
      db.config(guild.id).autoBackup = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Sauvegarde automatique quotidienne **${db.config(guild.id).autoBackup ? 'activée' : 'désactivée'}**.`);
    }

    const id = interaction.options.getString('id');
    if (sub === 'supprimer') {
      return backup.remove(guild.id, id) ? replySuccess(interaction, `Sauvegarde \`${id}\` supprimée.`) : replyError(interaction, 'Sauvegarde introuvable.');
    }

    if (sub === 'info') {
      const data = backup.load(guild.id, id);
      if (!data) return replyError(interaction, 'Sauvegarde introuvable.');
      const names = (arr) => arr.map((x) => x.name).join(', ').slice(0, 1000) || 'aucun';
      const missingRoles = data.roles.filter((r) => !guild.roles.cache.has(r.id) && !guild.roles.cache.some((x) => x.name === r.name));
      const missingChannels = data.channels.filter((c) => !guild.channels.cache.has(c.id) && !guild.channels.cache.some((x) => x.name === c.name && x.type === c.type));
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`💾 ${data.name}${data.auto ? ' 🤖' : ''}`)
            .setDescription(`ID \`${data.id}\` • ${ts(data.createdAt, 'f')} (${ts(data.createdAt, 'R')})`)
            .addFields(
              { name: `🎭 Rôles (${data.roles.length})`, value: names([...data.roles].reverse()) },
              { name: `📁 Salons (${data.channels.length})`, value: names(data.channels) },
              { name: '😀 Emojis / 🔨 Bannis', value: `${data.emojis?.length ?? 0} emojis • ${data.bans?.length ?? 0} bannis` },
              {
                name: '⚠️ Manquants aujourd\'hui',
                value: `${missingRoles.length} rôle(s) : ${names(missingRoles).slice(0, 400)}\n${missingChannels.length} salon(s) : ${names(missingChannels).slice(0, 400)}`,
              },
            ),
        ],
      });
    }

    // charger : réservé au propriétaire du serveur, avec confirmation
    if (interaction.user.id !== guild.ownerId) return replyError(interaction, 'Seul le propriétaire du serveur peut restaurer une sauvegarde.');
    const data = backup.load(guild.id, id);
    if (!data) return replyError(interaction, 'Sauvegarde introuvable.');
    const options = {
      full: interaction.options.getString('mode') === 'full',
      settings: interaction.options.getBoolean('reglages') ?? false,
      emojis: interaction.options.getBoolean('emojis') ?? false,
      bans: interaction.options.getBoolean('bannis') ?? false,
    };
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm').setLabel('Restaurer').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      ephemeral: true,
      components: [row],
      embeds: [
        embed(guild.id)
          .setTitle('⚠️ Restaurer la sauvegarde ?')
          .setDescription(
            [
              `**${data.name}** du ${ts(data.createdAt, 'f')}`,
              '',
              '• Les rôles et salons **manquants** seront recréés avec leurs permissions',
              options.full ? '• Les rôles et salons **existants** retrouveront leurs permissions de la sauvegarde' : null,
              options.settings ? '• Les **réglages du serveur** seront remis' : null,
              options.emojis ? `• Les **emojis** supprimés seront recréés (${data.emojis?.length ?? 0} sauvegardés)` : null,
              options.bans ? `• Les **bannis** de la sauvegarde seront re-bannis (${data.bans?.length ?? 0})` : null,
              '',
              'Rien ne sera supprimé.',
            ]
              .filter((l) => l !== null)
              .join('\n'),
          ),
      ],
    });
    const msg = await interaction.fetchReply();
    const click = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 60_000 }).catch(() => null);
    if (!click || click.customId === 'cancel') return interaction.editReply({ content: 'Restauration annulée.', embeds: [], components: [] });
    await click.update({ content: '⏳ Restauration en cours...', embeds: [], components: [] });
    const s = await backup.restore(guild, data, `Restauration de la sauvegarde ${data.id} par ${interaction.user.tag}`, options);
    const lines = [
      `✅ **Restauration terminée**`,
      `• ${s.roles} rôle(s) et ${s.channels} salon(s) recréé(s)`,
      options.full ? `• ${s.rolesReset} rôle(s) et ${s.channelsReset} salon(s) remis à l'identique` : null,
      options.settings ? `• Réglages du serveur : ${s.settings ? 'restaurés' : 'échec'}` : null,
      options.emojis ? `• ${s.emojis} emoji(s) recréé(s)` : null,
      options.bans ? `• ${s.bans} utilisateur(s) re-banni(s)` : null,
      s.errors ? `⚠️ ${s.errors} erreur(s) (souvent : rôle au-dessus du bot ou emoji introuvable)` : null,
    ];
    const text = lines.filter(Boolean).join('\n');
    return interaction.editReply(text).catch(() => interaction.user.send(text).catch(() => null));
  },
};
