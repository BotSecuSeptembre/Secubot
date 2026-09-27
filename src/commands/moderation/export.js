const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../../database');

const csv = (rows) =>
  rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`).join(';')).join('\n');
const date = (t) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Exporte les données de modération en fichier (tableur)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('donnees')
        .setDescription('Quoi exporter ?')
        .setRequired(true)
        .addChoices({ name: 'Sanctions (cas)', value: 'cases' }, { name: 'Avertissements', value: 'warns' }, { name: 'Notes du staff', value: 'notes' }),
    ),
  async execute(interaction) {
    const g = db.guild(interaction.guild.id);
    const type = interaction.options.getString('donnees');
    let rows;
    if (type === 'cases') {
      rows = [['Cas', 'Date', 'Type', 'Membre', 'ID membre', 'Modérateur', 'ID modérateur', 'Raison', 'Durée (min)'],
        ...g.cases.map((c) => [c.id, date(c.timestamp), c.type, c.targetTag, c.targetId, c.moderatorTag, c.moderatorId, c.reason, c.duration ? Math.round(c.duration / 60000) : ''])];
    } else if (type === 'warns') {
      rows = [['ID', 'Date', 'ID membre', 'ID modérateur', 'Raison'], ...g.warns.map((w) => [w.id, date(w.timestamp), w.userId, w.moderatorId, w.reason])];
    } else {
      rows = [['ID', 'Date', 'ID membre', 'ID modérateur', 'Note'], ...g.notes.map((n) => [n.id, date(n.timestamp), n.userId, n.moderatorId, n.text])];
    }
    // BOM pour qu'Excel lise correctement les accents
    const file = new AttachmentBuilder(Buffer.from(`﻿${csv(rows)}`, 'utf8'), { name: `${type}-${interaction.guild.id}.csv` });
    return interaction.reply({ content: `📄 **${rows.length - 1}** ligne(s) exportée(s). Ouvre le fichier avec Excel, LibreOffice ou Google Sheets.`, files: [file], ephemeral: true });
  },
};
