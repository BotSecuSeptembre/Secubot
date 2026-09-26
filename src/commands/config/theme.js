const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { replyError, reply } = require('../../utils/embed');
const { defaultColor } = require('../../config');

const NAMED = {
  rouge: 0xed4245,
  vert: 0x57f287,
  bleu: 0x3498db,
  blurple: 0x5865f2,
  jaune: 0xfee75c,
  orange: 0xe67e22,
  violet: 0x9b59b6,
  rose: 0xeb459e,
  noir: 0x23272a,
  blanc: 0xffffff,
  gris: 0x95a5a6,
  cyan: 0x1abc9c,
  or: 0xf1c40f,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('theme')
    .setDescription('Change la couleur des embeds du bot sur ce serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('couleur')
        .setDescription('Code hexadécimal (#ff0000), nom (rouge, bleu, violet...) ou "reset"')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    return interaction.respond(
      ['reset', ...Object.keys(NAMED)]
        .filter((n) => n.includes(focused))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n })),
    );
  },
  async execute(interaction) {
    const input = interaction.options.getString('couleur').trim().toLowerCase();
    let color;
    if (input === 'reset' || input === 'défaut' || input === 'defaut') color = null;
    else if (NAMED[input] !== undefined) color = NAMED[input];
    else if (/^#?[0-9a-f]{6}$/.test(input)) color = parseInt(input.replace('#', ''), 16);
    else if (/^#?[0-9a-f]{3}$/.test(input)) color = parseInt(input.replace('#', '').replace(/(.)/g, '$1$1'), 16);
    else return replyError(interaction, `Couleur invalide. Exemples : \`#ff0000\`, \`rouge\`, \`reset\`.\nNoms disponibles : ${Object.keys(NAMED).join(', ')}`);

    db.config(interaction.guild.id).theme = color;
    db.save();
    const final = color ?? defaultColor;
    return reply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor(final)
          .setTitle('🎨 Thème mis à jour')
          .setDescription(`Les embeds du bot utilisent maintenant la couleur **#${final.toString(16).padStart(6, '0').toUpperCase()}**.`),
      ],
    });
  },
};
