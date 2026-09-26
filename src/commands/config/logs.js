const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, reply } = require('../../utils/embed');

const TYPES = [
  { name: 'Modération (sanctions, automod, tickets)', value: 'mod' },
  { name: 'Messages (suppressions, modifications)', value: 'messages' },
  { name: 'Membres (arrivées, départs, rôles, pseudos)', value: 'members' },
  { name: 'Serveur (salons, rôles, antiraid, antinuke)', value: 'server' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure les salons de logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Définit le salon pour un type de logs')
        .addStringOption((o) => o.setName('type').setDescription('Type de logs').setRequired(true).addChoices(...TYPES))
        .addChannelOption((o) => o.setName('salon').setDescription('Salon').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((s) =>
      s
        .setName('disable')
        .setDescription('Désactive un type de logs')
        .addStringOption((o) => o.setName('type').setDescription('Type de logs').setRequired(true).addChoices(...TYPES)),
    )
    .addSubcommand((s) => s.setName('auto').setDescription('Crée automatiquement une catégorie privée avec tous les salons de logs'))
    .addSubcommand((s) => s.setName('voir').setDescription('Affiche la configuration des logs')),
  async execute(interaction) {
    const guild = interaction.guild;
    const logs = db.config(guild.id).logs;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const type = interaction.options.getString('type');
      const channel = interaction.options.getChannel('salon');
      logs[type] = channel.id;
      db.save();
      return replySuccess(interaction, `Logs **${type}** → ${channel}`);
    }
    if (sub === 'disable') {
      const type = interaction.options.getString('type');
      logs[type] = null;
      db.save();
      return replySuccess(interaction, `Logs **${type}** désactivés.${type !== 'mod' && logs.mod ? ' (ils seront envoyés dans le salon de modération)' : ''}`);
    }
    if (sub === 'auto') {
      await interaction.deferReply();
      const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
      ];
      const category = await guild.channels.create({ name: '🔒 Logs', type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
      const names = { mod: '📕-logs-modération', messages: '💬-logs-messages', members: '👥-logs-membres', server: '⚙️-logs-serveur' };
      for (const [type, name] of Object.entries(names)) {
        const channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites });
        logs[type] = channel.id;
      }
      db.save();
      return replySuccess(interaction, `Catégorie ${category} créée avec 4 salons de logs (visibles uniquement par les admins). Ajoute ton rôle staff à la catégorie si besoin.`);
    }
    return reply(interaction, {
      embeds: [
        embed(guild.id)
          .setTitle('📜 Salons de logs')
          .setDescription(TYPES.map((t) => `**${t.name}** : ${logs[t.value] ? `<#${logs[t.value]}>` : '❌'}`).join('\n')),
      ],
    });
  },
};
