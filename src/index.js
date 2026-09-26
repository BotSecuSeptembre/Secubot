const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');

if (!config.token) {
  console.error('❌ DISCORD_TOKEN manquant. Ajoute-le dans les variables d\'environnement (Railway > Variables).');
  process.exit(1);
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers, // privilégié : à activer dans le Developer Portal
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, // privilégié : à activer dans le Developer Portal
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildWebhooks,
  GatewayIntentBits.GuildEmojisAndStickers,
  GatewayIntentBits.DirectMessages,
];
if (config.enablePresences) intents.push(GatewayIntentBits.GuildPresences);

const client = new Client({
  intents,
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.commands = new Collection();
client.components = [];

// ---------- Chargement des commandes ----------
const commandsDir = path.join(__dirname, 'commands');
for (const category of fs.readdirSync(commandsDir)) {
  for (const file of fs.readdirSync(path.join(commandsDir, category)).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsDir, category, file));
    command.category = category;
    client.commands.set(command.data.name, command);
  }
}

// ---------- Chargement des composants (boutons, menus, modals) ----------
const componentsDir = path.join(__dirname, 'components');
for (const file of fs.readdirSync(componentsDir).filter((f) => f.endsWith('.js'))) {
  client.components.push(require(path.join(componentsDir, file)));
}

// ---------- Chargement des événements ----------
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  const run = (...args) =>
    Promise.resolve(event.execute(...args, client)).catch((err) => console.error(`[event:${event.name}]`, err));
  if (event.once) client.once(event.name, run);
  else client.on(event.name, run);
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

client.login(config.token);
