const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, replyError, reply } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Protection contre la destruction du serveur (admins compromis, bots malveillants)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('status').setDescription("Affiche la configuration de l'antinuke"))
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription("Active / désactive l'antinuke")
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Seuil et sanction')
        .addIntegerOption((o) => o.setName('actions').setDescription("Nombre d'actions destructrices...").setRequired(true).setMinValue(1).setMaxValue(50))
        .addIntegerOption((o) => o.setName('secondes').setDescription('...en X secondes').setRequired(true).setMinValue(1).setMaxValue(600))
        .addStringOption((o) =>
          o
            .setName('sanction')
            .setDescription('Sanction')
            .addChoices({ name: 'Retirer tous ses rôles', value: 'strip' }, { name: 'Expulser', value: 'kick' }, { name: 'Bannir', value: 'ban' }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('whitelist')
        .setDescription('Ajoute / retire un utilisateur ou un bot de confiance')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur ou bot').setRequired(true)),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const cfg = db.config(guild.id).antinuke;
    const sub = interaction.options.getSubcommand();
    const isOwner = interaction.user.id === guild.ownerId;

    if (sub === 'status') {
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setTitle(`☢️ Antinuke ${cfg.enabled ? '— ACTIVÉ' : '— DÉSACTIVÉ'}`)
            .setDescription(
              [
                `**Seuil :** ${cfg.threshold} action(s) en ${cfg.seconds}s`,
                `**Sanction :** ${cfg.punishment === 'strip' ? 'retrait des rôles' : cfg.punishment === 'kick' ? 'expulsion' : 'bannissement'}`,
                '',
                '**Surveillé :** suppression/création de salons et rôles, bans, kicks, purges, webhooks, emojis.',
                '**Protection immédiate :** ajout de permissions dangereuses à un rôle, attribution d\'un rôle admin, modification de l\'URL personnalisée.',
                '',
                `**Whitelist :** ${cfg.whitelist.map((id) => `<@${id}>`).join(' ') || 'aucun'} (+ propriétaire du serveur)`,
                '',
                "⚠️ Le rôle du bot doit être **le plus haut possible** et le bot doit avoir la permission **Voir les logs d'audit**.",
              ].join('\n'),
            ),
        ],
      });
    }

    // Seul le propriétaire du serveur peut modifier l'antinuke (sinon un admin compromis pourrait le couper)
    if (!isOwner) return replyError(interaction, "Seul le propriétaire du serveur peut modifier l'antinuke.");

    if (sub === 'toggle') {
      cfg.enabled = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Antinuke **${cfg.enabled ? 'activé' : 'désactivé'}**.`);
    }

    if (sub === 'config') {
      cfg.threshold = interaction.options.getInteger('actions');
      cfg.seconds = interaction.options.getInteger('secondes');
      cfg.punishment = interaction.options.getString('sanction') ?? cfg.punishment;
      db.save();
      return replySuccess(interaction, `Antinuke : **${cfg.threshold} actions en ${cfg.seconds}s** → ${cfg.punishment}.`);
    }

    if (sub === 'whitelist') {
      const user = interaction.options.getUser('utilisateur');
      const i = cfg.whitelist.indexOf(user.id);
      if (i >= 0) cfg.whitelist.splice(i, 1);
      else cfg.whitelist.push(user.id);
      db.save();
      return replySuccess(interaction, `${user} ${i >= 0 ? 'retiré de' : 'ajouté à'} la whitelist antinuke.`);
    }
  },
};
