const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, reply } = require('../../utils/embed');
const { enableRaidMode, disableRaidMode } = require('../../utils/antiraid');
const { ts } = require('../../utils/time');

const ACTIONS = [
  { name: 'Expulser', value: 'kick' },
  { name: 'Bannir', value: 'ban' },
  { name: 'Signaler seulement', value: 'flag' },
  { name: 'Ne rien faire', value: 'none' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Protection contre les raids')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('status').setDescription("Affiche la configuration de l'antiraid"))
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription("Active / désactive l'antiraid")
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('detection')
        .setDescription('Seuil de détection des vagues d\'arrivées')
        .addIntegerOption((o) => o.setName('arrivees').setDescription("Nombre d'arrivées...").setRequired(true).setMinValue(2).setMaxValue(100))
        .addIntegerOption((o) => o.setName('secondes').setDescription('...en X secondes').setRequired(true).setMinValue(1).setMaxValue(300))
        .addStringOption((o) => o.setName('action').setDescription('Action sur les arrivées pendant le mode raid').addChoices(ACTIONS[0], ACTIONS[1], ACTIONS[3]))
        .addBooleanOption((o) => o.setName('verrouillage_auto').setDescription('Passer le niveau de vérification du serveur au max pendant un raid')),
    )
    .addSubcommand((s) =>
      s
        .setName('age_minimum')
        .setDescription('Âge minimum des comptes (0 = désactivé)')
        .addIntegerOption((o) => o.setName('jours').setDescription('Âge minimum en jours').setRequired(true).setMinValue(0).setMaxValue(365))
        .addStringOption((o) => o.setName('action').setDescription('Action').addChoices(ACTIONS[0], ACTIONS[1], ACTIONS[2])),
    )
    .addSubcommand((s) =>
      s
        .setName('sans_avatar')
        .setDescription('Action sur les comptes sans photo de profil')
        .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(ACTIONS[0], ACTIONS[2], ACTIONS[3])),
    )
    .addSubcommand((s) =>
      s
        .setName('bots')
        .setDescription("Expulse les bots ajoutés par quelqu'un qui n'est pas dans la whitelist antinuke")
        .addBooleanOption((o) => o.setName('bloquer').setDescription('Bloquer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('raidmode')
        .setDescription('Active / désactive manuellement le mode raid')
        .addStringOption((o) => o.setName('etat').setDescription('État').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const ar = db.config(guild.id).antiraid;
    const sub = interaction.options.getSubcommand();
    const label = (v) => ACTIONS.find((a) => a.value === v)?.name ?? v;

    if (sub === 'status') {
      return reply(interaction, {
        embeds: [
          embed(guild.id)
            .setTitle(`🛡️ Antiraid ${ar.enabled ? '— ACTIVÉ' : '— DÉSACTIVÉ'}`)
            .setDescription(
              [
                `**Mode raid :** ${ar.raidMode ? `🚨 ACTIF depuis ${ts(ar.raidModeSince, 'R')}` : '🟢 inactif'}`,
                `**Détection :** ${ar.joinThreshold} arrivées en ${ar.joinSeconds}s → ${label(ar.action)}`,
                `**Verrouillage auto :** ${ar.autoLockdown ? 'oui' : 'non'}`,
                `**Âge minimum :** ${ar.minAccountAgeDays ? `${ar.minAccountAgeDays} jour(s) → ${label(ar.minAgeAction)}` : 'désactivé'}`,
                `**Sans avatar :** ${label(ar.noAvatarAction)}`,
                `**Blocage des bots :** ${ar.blockBots ? 'oui' : 'non'}`,
              ].join('\n'),
            ),
        ],
      });
    }

    if (sub === 'toggle') {
      ar.enabled = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Antiraid **${ar.enabled ? 'activé' : 'désactivé'}**.`);
    }

    if (sub === 'detection') {
      ar.joinThreshold = interaction.options.getInteger('arrivees');
      ar.joinSeconds = interaction.options.getInteger('secondes');
      ar.action = interaction.options.getString('action') ?? ar.action;
      const lock = interaction.options.getBoolean('verrouillage_auto');
      if (lock !== null) ar.autoLockdown = lock;
      db.save();
      return replySuccess(interaction, `Raid détecté à partir de **${ar.joinThreshold} arrivées en ${ar.joinSeconds}s** → ${label(ar.action)}.`);
    }

    if (sub === 'age_minimum') {
      ar.minAccountAgeDays = interaction.options.getInteger('jours');
      ar.minAgeAction = interaction.options.getString('action') ?? ar.minAgeAction;
      db.save();
      return replySuccess(interaction, ar.minAccountAgeDays ? `Comptes de moins de **${ar.minAccountAgeDays} jour(s)** → ${label(ar.minAgeAction)}.` : 'Âge minimum désactivé.');
    }

    if (sub === 'sans_avatar') {
      ar.noAvatarAction = interaction.options.getString('action');
      db.save();
      return replySuccess(interaction, `Comptes sans avatar → ${label(ar.noAvatarAction)}.`);
    }

    if (sub === 'bots') {
      ar.blockBots = interaction.options.getBoolean('bloquer');
      db.save();
      return replySuccess(interaction, `Blocage des bots non autorisés : **${ar.blockBots ? 'oui' : 'non'}**.`);
    }

    if (sub === 'raidmode') {
      if (interaction.options.getString('etat') === 'on') {
        await enableRaidMode(guild, `Activé manuellement par ${interaction.user.tag}`, false);
        return replySuccess(interaction, '🚨 Mode raid **activé**. Les nouvelles arrivées seront sanctionnées.' + (ar.enabled ? '' : "\n⚠️ L'antiraid est désactivé : active-le avec `/antiraid toggle`."));
      }
      await disableRaidMode(guild);
      return replySuccess(interaction, 'Mode raid **désactivé**.');
    }
  },
};
