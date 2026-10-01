const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { replyError, replySuccess } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('site')
    .setDescription('Site public du serveur')
    .addSubcommand((s) => s.setName('lien').setDescription('Adresse du site du serveur'))
    .addSubcommand((s) =>
      s
        .setName('masquer')
        .setDescription('Ne plus apparaître sur le site (ou masquer un membre : staff)')
        .addUserOption((o) => o.setName('membre').setDescription('Membre à masquer (réservé au staff)')),
    )
    .addSubcommand((s) =>
      s
        .setName('afficher')
        .setDescription('Réapparaître sur le site (ou réafficher un membre : staff)')
        .addUserOption((o) => o.setName('membre').setDescription('Membre à réafficher (réservé au staff)')),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'lien') {
      if (!config.siteUrl) return replyError(interaction, 'Le site n\'a pas encore d\'adresse publique (variable `SITE_URL`).');
      return replySuccess(interaction, `Site du serveur : ${config.siteUrl}`, true);
    }

    const target = interaction.options.getUser('membre') ?? interaction.user;
    const self = target.id === interaction.user.id;
    if (!self && !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return replyError(interaction, 'Seul le staff peut masquer ou réafficher un autre membre.');
    }

    const site = db.guild(interaction.guild.id).site;
    const hidden = new Set(site.hidden);
    if (sub === 'masquer') hidden.add(target.id);
    else hidden.delete(target.id);
    site.hidden = [...hidden];
    db.save();
    interaction.client.emit('siteUpdate', interaction.guild.id);

    const who = self ? 'Tu' : `${target}`;
    return replySuccess(
      interaction,
      sub === 'masquer'
        ? `${who} n'apparais${self ? '' : 't'} plus sur le site. Le changement est immédiat.`
        : `${who} apparais${self ? '' : 't'} de nouveau sur le site.`,
      true,
    );
  },
};
