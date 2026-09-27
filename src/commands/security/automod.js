const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, replyError, reply, truncate } = require('../../utils/embed');

const on = (v) => (v ? '✅' : '❌');

const FILTERS = [
  { name: 'Anti-spam', value: 'antiSpam' },
  { name: 'Anti-doublons', value: 'antiDuplicate' },
  { name: 'Anti-invitations Discord', value: 'antiInvite' },
  { name: 'Anti-liens', value: 'antiLink' },
  { name: 'Anti-mentions de masse', value: 'antiMassMention' },
  { name: 'Anti-@everyone', value: 'antiEveryone' },
  { name: 'Anti-majuscules', value: 'antiCaps' },
  { name: 'Anti-emojis', value: 'antiEmoji' },
  { name: 'Anti-zalgo', value: 'antiZalgo' },
  { name: 'Anti-retours à la ligne', value: 'antiNewlines' },
  { name: 'Alerte ghost ping', value: 'antiGhostPing' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription("Configure l'automodération")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('status').setDescription("Affiche la configuration de l'automod"))
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription("Active / désactive l'automod")
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('filtre')
        .setDescription('Active / désactive un filtre')
        .addStringOption((o) => o.setName('filtre').setDescription('Filtre').setRequired(true).addChoices(...FILTERS))
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true))
        .addIntegerOption((o) => o.setName('limite').setDescription('Seuil (messages, mentions, emojis, %, lignes...)').setMinValue(1).setMaxValue(100))
        .addIntegerOption((o) => o.setName('secondes').setDescription('Fenêtre en secondes (anti-spam)').setMinValue(1).setMaxValue(60)),
    )
    .addSubcommand((s) =>
      s
        .setName('sanction')
        .setDescription('Sanction appliquée en cas d\'infraction')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Action')
            .setRequired(true)
            .addChoices(
              { name: 'Supprimer le message', value: 'delete' },
              { name: 'Supprimer + avertir', value: 'warn' },
              { name: 'Supprimer + mute', value: 'timeout' },
            ),
        )
        .addIntegerOption((o) => o.setName('minutes').setDescription('Durée du mute').setMinValue(1).setMaxValue(40320)),
    )
    .addSubcommand((s) =>
      s
        .setName('mots')
        .setDescription('Gère la liste des mots interdits')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Action')
            .setRequired(true)
            .addChoices({ name: 'Ajouter', value: 'add' }, { name: 'Retirer', value: 'remove' }, { name: 'Lister', value: 'list' }, { name: 'Vider', value: 'clear' }),
        )
        .addStringOption((o) => o.setName('mots').setDescription('Mot(s), séparés par des virgules')),
    )
    .addSubcommand((s) =>
      s
        .setName('domaines')
        .setDescription("Domaines autorisés par l'anti-liens")
        .addStringOption((o) =>
          o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Ajouter', value: 'add' }, { name: 'Retirer', value: 'remove' }, { name: 'Lister', value: 'list' }),
        )
        .addStringOption((o) => o.setName('domaine').setDescription('ex: youtube.com')),
    )
    .addSubcommand((s) =>
      s
        .setName('ignorer')
        .setDescription("Ajoute / retire un salon ou un rôle des exceptions de l'automod")
        .addChannelOption((o) => o.setName('salon').setDescription('Salon ou catégorie').addChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory, ChannelType.GuildForum, ChannelType.GuildVoice))
        .addRoleOption((o) => o.setName('role').setDescription('Rôle')),
    ),
  async execute(interaction) {
    const cfg = db.config(interaction.guild.id).automod;
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const val = (key) => (typeof cfg[key] === 'object' ? cfg[key].enabled : cfg[key]);
      return reply(interaction, {
        embeds: [
          embed(interaction.guild.id)
            .setTitle(`🤖 Automod ${cfg.enabled ? '— ACTIVÉ' : '— DÉSACTIVÉ'}`)
            .setDescription(
              [
                `**Sanction :** ${cfg.action === 'delete' ? 'suppression' : cfg.action === 'warn' ? 'suppression + avertissement' : `suppression + mute ${cfg.timeoutMinutes} min`}`,
                '',
                `${on(val('antiSpam'))} Anti-spam (${cfg.antiSpam.messages} msg / ${cfg.antiSpam.seconds}s)`,
                `${on(val('antiDuplicate'))} Anti-doublons (${cfg.antiDuplicate.count}×)`,
                `${on(cfg.antiInvite)} Anti-invitations`,
                `${on(cfg.antiLink)} Anti-liens (autorisés : ${cfg.allowedDomains.join(', ') || 'aucun'})`,
                `${on(val('antiMassMention'))} Anti-mentions (${cfg.antiMassMention.limit}+)`,
                `${on(cfg.antiEveryone)} Anti-@everyone`,
                `${on(val('antiCaps'))} Anti-majuscules (${cfg.antiCaps.percent}%)`,
                `${on(val('antiEmoji'))} Anti-emojis (${cfg.antiEmoji.limit}+)`,
                `${on(cfg.antiZalgo)} Anti-zalgo`,
                `${on(val('antiNewlines'))} Anti-retours à la ligne (${cfg.antiNewlines.limit}+)`,
                `${on(cfg.antiGhostPing)} Alerte ghost ping (mention puis suppression)`,
                `📝 Mots interdits : **${cfg.badWords.length}**`,
                '',
                `**Salons ignorés :** ${cfg.ignoredChannels.map((id) => `<#${id}>`).join(' ') || 'aucun'}`,
                `**Rôles ignorés :** ${cfg.ignoredRoles.map((id) => `<@&${id}>`).join(' ') || 'aucun'}`,
                '*Les membres avec la permission « Gérer les messages » sont toujours ignorés.*',
              ].join('\n'),
            ),
        ],
      });
    }

    if (sub === 'toggle') {
      cfg.enabled = interaction.options.getBoolean('actif');
      db.save();
      return replySuccess(interaction, `Automod **${cfg.enabled ? 'activé' : 'désactivé'}**.`);
    }

    if (sub === 'filtre') {
      const key = interaction.options.getString('filtre');
      const active = interaction.options.getBoolean('actif');
      const limit = interaction.options.getInteger('limite');
      const seconds = interaction.options.getInteger('secondes');
      if (typeof cfg[key] === 'object') {
        cfg[key].enabled = active;
        if (limit) {
          if (key === 'antiSpam') cfg[key].messages = limit;
          else if (key === 'antiDuplicate') cfg[key].count = limit;
          else if (key === 'antiCaps') cfg[key].percent = limit;
          else cfg[key].limit = limit;
        }
        if (seconds && key === 'antiSpam') cfg[key].seconds = seconds;
      } else {
        cfg[key] = active;
      }
      db.save();
      const label = FILTERS.find((f) => f.value === key).name;
      return replySuccess(interaction, `${label} **${active ? 'activé' : 'désactivé'}**${limit ? ` (seuil : ${limit})` : ''}.${cfg.enabled ? '' : '\n⚠️ L\'automod est globalement désactivé : `/automod toggle actif:True`'}`);
    }

    if (sub === 'sanction') {
      cfg.action = interaction.options.getString('action');
      const minutes = interaction.options.getInteger('minutes');
      if (minutes) cfg.timeoutMinutes = minutes;
      db.save();
      return replySuccess(interaction, `Sanction de l'automod : **${cfg.action}**${cfg.action === 'timeout' ? ` (${cfg.timeoutMinutes} min)` : ''}.`);
    }

    if (sub === 'mots') {
      const action = interaction.options.getString('action');
      const words = (interaction.options.getString('mots') ?? '')
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      if (action === 'list') {
        return reply(interaction, {
          ephemeral: true,
          embeds: [embed(interaction.guild.id).setTitle('📝 Mots interdits').setDescription(truncate(cfg.badWords.map((w) => `||${w}||`).join(', ') || 'Aucun', 4000))],
        });
      }
      if (action === 'clear') {
        cfg.badWords = [];
        db.save();
        return replySuccess(interaction, 'Liste des mots interdits vidée.');
      }
      if (!words.length) return replyError(interaction, 'Indique au moins un mot.');
      if (action === 'add') cfg.badWords = [...new Set([...cfg.badWords, ...words])];
      else cfg.badWords = cfg.badWords.filter((w) => !words.includes(w));
      db.save();
      return replySuccess(interaction, `${words.length} mot(s) ${action === 'add' ? 'ajouté(s)' : 'retiré(s)'}. Total : **${cfg.badWords.length}**.`, true);
    }

    if (sub === 'domaines') {
      const action = interaction.options.getString('action');
      const domain = interaction.options.getString('domaine')?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (action === 'list') return replySuccess(interaction, `Domaines autorisés : ${cfg.allowedDomains.join(', ') || 'aucun'}`, true);
      if (!domain) return replyError(interaction, 'Indique un domaine.');
      if (action === 'add' && !cfg.allowedDomains.includes(domain)) cfg.allowedDomains.push(domain);
      if (action === 'remove') cfg.allowedDomains = cfg.allowedDomains.filter((d) => d !== domain);
      db.save();
      return replySuccess(interaction, `Domaine \`${domain}\` ${action === 'add' ? 'autorisé' : 'retiré'}.`);
    }

    if (sub === 'ignorer') {
      const channel = interaction.options.getChannel('salon');
      const role = interaction.options.getRole('role');
      if (!channel && !role) return replyError(interaction, 'Indique un salon ou un rôle.');
      const out = [];
      for (const [item, list] of [[channel, cfg.ignoredChannels], [role, cfg.ignoredRoles]]) {
        if (!item) continue;
        const i = list.indexOf(item.id);
        if (i >= 0) list.splice(i, 1);
        else list.push(item.id);
        out.push(`${item} ${i >= 0 ? "n'est plus ignoré" : 'est maintenant ignoré'}`);
      }
      db.save();
      return replySuccess(interaction, out.join('\n'));
    }
  },
};
