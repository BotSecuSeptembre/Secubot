const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { embed } = require('../../utils/embed');

const CATEGORIES = {
  security: { label: 'Sécurité', emoji: '🛡️', description: 'Vérification, modmail, automod, antiraid, antinuke' },
  moderation: { label: 'Modération', emoji: '🔨', description: 'Sanctions, avertissements, purge, historique' },
  config: { label: 'Configuration', emoji: '⚙️', description: 'Thème, logs, setup automatique' },
  utility: { label: 'Utilitaires', emoji: '🧰', description: 'Annonces, panneau de rôles, invitations' },
  context: { label: 'Clic droit', emoji: '🖱️', description: 'Actions via clic droit > Applications' },
  info: { label: 'Informations', emoji: 'ℹ️', description: 'Infos utilisateur, serveur, bot' },
  owner: { label: 'Propriétaire', emoji: '👑', description: 'Réservé aux propriétaires du bot' },
};

function describe(command) {
  const json = command.data.toJSON();
  if (json.type === 2) return [`🖱️ Clic droit sur un **membre** > Applications > **${json.name}**`];
  if (json.type === 3) return [`🖱️ Clic droit sur un **message** > Applications > **${json.name}**`];
  const subs = (json.options ?? []).filter((o) => o.type === 1);
  if (!subs.length) return [`\`/${json.name}\` — ${json.description}`];
  return subs.map((s) => `\`/${json.name} ${s.name}\` — ${s.description}`);
}

module.exports = {
  guildOnly: false,
  data: new SlashCommandBuilder().setName('help').setDescription('Liste des commandes du bot'),
  async execute(interaction, client) {
    const byCategory = {};
    for (const command of client.commands.values()) (byCategory[command.category] ??= []).push(command);

    const home = embed(interaction.guildId)
      .setAuthor({ name: `${client.user.username} — Aide`, iconURL: client.user.displayAvatarURL() })
      .setDescription(
        [
          'Bot de **sécurité** tout-en-un pour Discord.',
          '',
          ...Object.entries(CATEGORIES).map(([key, c]) => `${c.emoji} **${c.label}** (${byCategory[key]?.length ?? 0}) — ${c.description}`),
          '',
          '🚀 **Démarrage rapide :** `/setup securite` → `/logs auto` → `/setup verification` → `/modmail setup`',
        ].join('\n'),
      )
      .setFooter({ text: 'Choisis une catégorie dans le menu ci-dessous' });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('help:menu')
      .setPlaceholder('Choisis une catégorie')
      .addOptions(
        { label: 'Accueil', value: 'home', emoji: '🏠' },
        ...Object.entries(CATEGORIES).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji, description: c.description.slice(0, 100) })),
      );

    await interaction.reply({ embeds: [home], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300_000 });
    collector.on('collect', async (i) => {
      const value = i.values[0];
      if (value === 'home') return i.update({ embeds: [home] });
      const c = CATEGORIES[value];
      const lines = (byCategory[value] ?? []).flatMap(describe);
      const e = embed(interaction.guildId)
        .setTitle(`${c.emoji} ${c.label}`)
        .setDescription(lines.join('\n').slice(0, 4000) || 'Aucune commande.');
      return i.update({ embeds: [e] });
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
  },
};
