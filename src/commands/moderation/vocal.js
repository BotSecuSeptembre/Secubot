const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');
const { checkHierarchy } = require('../../utils/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vocal')
    .setDescription('Modération des salons vocaux')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addSubcommand((s) =>
      s.setName('deconnecter').setDescription("Déconnecte un membre du vocal").addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('mute')
        .setDescription('Rend un membre muet / sourd dans les vocaux (ou l\'inverse)')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addBooleanOption((o) => o.setName('actif').setDescription('Activer ?').setRequired(true))
        .addBooleanOption((o) => o.setName('sourd').setDescription('Aussi sourd (n\'entend plus)')),
    )
    .addSubcommand((s) =>
      s
        .setName('deplacer_tous')
        .setDescription("Déplace tout le monde d'un vocal à un autre")
        .addChannelOption((o) => o.setName('de').setDescription('Salon de départ').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
        .addChannelOption((o) => o.setName('vers').setDescription("Salon d'arrivée").setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)),
    )
    .addSubcommand((s) =>
      s
        .setName('vider')
        .setDescription('Déconnecte tout le monde d\'un salon vocal')
        .addChannelOption((o) => o.setName('salon').setDescription('Salon vocal').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)),
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const reason = `Par ${interaction.user.tag}`;

    if (sub === 'deplacer_tous' || sub === 'vider') {
      const from = interaction.options.getChannel(sub === 'vider' ? 'salon' : 'de');
      const to = sub === 'vider' ? null : interaction.options.getChannel('vers');
      let n = 0;
      for (const m of from.members.values()) if (await m.voice.setChannel(to, reason).then(() => true).catch(() => false)) n++;
      return replySuccess(interaction, sub === 'vider' ? `**${n}** membre(s) déconnecté(s) de ${from}.` : `**${n}** membre(s) déplacé(s) de ${from} vers ${to}.`);
    }

    const member = interaction.options.getMember('membre');
    if (!member) return replyError(interaction, "Ce membre n'est pas sur le serveur.");
    const error = checkHierarchy(interaction.member, member, 'modérer');
    if (error) return replyError(interaction, error);
    if (!member.voice.channel) return replyError(interaction, "Ce membre n'est pas en vocal.");

    if (sub === 'deconnecter') {
      await member.voice.disconnect(reason);
      return replySuccess(interaction, `${member} a été déconnecté du vocal.`);
    }
    const on = interaction.options.getBoolean('actif');
    await member.voice.setMute(on, reason);
    if (interaction.options.getBoolean('sourd') !== null || !on) await member.voice.setDeaf(on && Boolean(interaction.options.getBoolean('sourd')), reason);
    return replySuccess(interaction, `${member} est ${on ? 'muet' : 'de nouveau audible'} en vocal.`);
  },
};
