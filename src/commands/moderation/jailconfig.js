const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../database');
const { embed, replySuccess, reply } = require('../../utils/embed');
const { ensureJailRole, canJail } = require('../../utils/jail');
const { ts } = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jailconfig')
    .setDescription('Configuration de la prison (/jail)')
    .addSubcommand((s) => s.setName('voir').setDescription('Configuration et membres actuellement en prison'))
    .addSubcommand((s) =>
      s
        .setName('salon')
        .setDescription('Définit le salon prison')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon prison').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)),
    )
    .addSubcommand((s) =>
      s
        .setName('autoriser')
        .setDescription('Autorise / retire un utilisateur (non admin) à utiliser /jail')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('duree_defaut')
        .setDescription('Durée par défaut de /jail')
        .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true).setMinValue(1).setMaxValue(43200)),
    ),
  async execute(interaction) {
    const guild = interaction.guild;
    const g = db.guild(guild.id);
    const cfg = g.config.jail;
    const sub = interaction.options.getSubcommand();

    if (sub === 'voir') {
      if (!canJail(interaction.member)) return reply(interaction, { content: "❌ Tu n'as pas la permission.", ephemeral: true });
      const jailed = Object.entries(g.jails).filter(([, j]) => !j.released);
      return reply(interaction, {
        ephemeral: true,
        embeds: [
          embed(guild.id)
            .setTitle('⛓️ Prison')
            .addFields(
              { name: 'Salon prison', value: guild.channels.cache.has(cfg.channelId) ? `<#${cfg.channelId}>` : `❌ introuvable (\`${cfg.channelId}\`)`, inline: true },
              { name: 'Rôle prison', value: cfg.roleId ? `<@&${cfg.roleId}>` : 'créé au premier /jail', inline: true },
              { name: 'Durée par défaut', value: `${cfg.defaultMinutes} min`, inline: true },
              { name: 'Peuvent utiliser /jail', value: `Administrateurs${cfg.allowedUsers.length ? ` + ${cfg.allowedUsers.map((id) => `<@${id}>`).join(' ')}` : ''}` },
              { name: `En prison (${jailed.length})`, value: jailed.map(([id, j]) => `<@${id}> • sortie ${ts(j.until, 'R')} • ${j.reason}`).join('\n').slice(0, 1024) || 'Personne.' },
            ),
        ],
      });
    }

    // Modifications réservées aux administrateurs
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return reply(interaction, { content: '❌ Réservé aux administrateurs.', ephemeral: true });
    }

    if (sub === 'salon') {
      const channel = interaction.options.getChannel('salon');
      cfg.channelId = channel.id;
      db.save();
      await interaction.deferReply();
      if (cfg.roleId) await ensureJailRole(guild);
      return replySuccess(interaction, `Salon prison : ${channel}.`);
    }

    if (sub === 'autoriser') {
      const user = interaction.options.getUser('utilisateur');
      const i = cfg.allowedUsers.indexOf(user.id);
      if (i >= 0) cfg.allowedUsers.splice(i, 1);
      else cfg.allowedUsers.push(user.id);
      db.save();
      return replySuccess(interaction, `${user} ${i >= 0 ? 'ne peut plus' : 'peut maintenant'} utiliser /jail.`);
    }

    cfg.defaultMinutes = interaction.options.getInteger('minutes');
    db.save();
    return replySuccess(interaction, `Durée par défaut de /jail : **${cfg.defaultMinutes} min**.`);
  },
};
