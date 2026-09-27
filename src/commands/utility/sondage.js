const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError, replySuccess } = require('../../utils/embed');

const builder = new SlashCommandBuilder()
  .setName('sondage')
  .setDescription('Crée un sondage Discord natif')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) => o.setName('question').setDescription('Question').setRequired(true).setMaxLength(300))
  .addStringOption((o) => o.setName('choix1').setDescription('Choix 1').setRequired(true).setMaxLength(55))
  .addStringOption((o) => o.setName('choix2').setDescription('Choix 2').setRequired(true).setMaxLength(55));
for (let i = 3; i <= 8; i++) builder.addStringOption((o) => o.setName(`choix${i}`).setDescription(`Choix ${i}`).setMaxLength(55));
builder
  .addIntegerOption((o) => o.setName('heures').setDescription('Durée en heures (défaut : 24, max 768)').setMinValue(1).setMaxValue(768))
  .addBooleanOption((o) => o.setName('choix_multiples').setDescription('Autoriser plusieurs réponses'));

module.exports = {
  data: builder,
  async execute(interaction) {
    const answers = [];
    for (let i = 1; i <= 8; i++) {
      const text = interaction.options.getString(`choix${i}`);
      if (text) answers.push({ text });
    }
    try {
      await interaction.channel.send({
        poll: {
          question: { text: interaction.options.getString('question') },
          answers,
          duration: interaction.options.getInteger('heures') ?? 24,
          allowMultiselect: interaction.options.getBoolean('choix_multiples') ?? false,
        },
      });
    } catch (err) {
      return replyError(interaction, `Impossible de créer le sondage : \`${err.message}\``);
    }
    return replySuccess(interaction, 'Sondage publié.', true);
  },
};
