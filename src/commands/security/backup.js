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
        .setDescription('Recrée les rôles et salons MANQUANTS (rien n\'est supprimé)')
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
      const data = backup.create(guild, interaction.options.getString('nom'));
      return replySuccess(interaction, `Sauvegarde **${data.name}** créée (\`${data.id}\`) : ${data.roles.length} rôles, ${data.channels.length} salons.`);
    }

    if (sub === 'liste') {
      const all = backup.list(guild.id);
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle(`💾 Sauvegardes (${all.length})`)
            .setDescription(
              all.map((b) => `\`${b.id}\` • **${b.name}**${b.auto ? ' 🤖' : ''} • ${ts(b.createdAt, 'R')} • ${b.roles} rôles, ${b.channels} salons`).join('\n') ||
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

    // charger : réservé au propriétaire du serveur, avec confirmation
    if (interaction.user.id !== guild.ownerId) return replyError(interaction, 'Seul le propriétaire du serveur peut restaurer une sauvegarde.');
    const data = backup.load(guild.id, id);
    if (!data) return replyError(interaction, 'Sauvegarde introuvable.');
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
          .setDescription(`**${data.name}** du ${ts(data.createdAt, 'f')}\n\nLes rôles et salons **manquants** seront recréés avec leurs permissions. Rien ne sera supprimé.`),
      ],
    });
    const msg = await interaction.fetchReply();
    const click = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 60_000 }).catch(() => null);
    if (!click || click.customId === 'cancel') return interaction.editReply({ content: 'Restauration annulée.', embeds: [], components: [] });
    await click.update({ content: '⏳ Restauration en cours...', embeds: [], components: [] });
    const summary = await backup.restore(guild, data, `Restauration de la sauvegarde ${data.id} par ${interaction.user.tag}`);
    return interaction.editReply(`✅ Restauration terminée : **${summary.roles}** rôle(s) et **${summary.channels}** salon(s) recréé(s)${summary.errors ? `, ${summary.errors} erreur(s)` : ''}.`);
  },
};
