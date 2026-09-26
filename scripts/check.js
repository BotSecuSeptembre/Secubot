/**
 * Vérification rapide sans se connecter à Discord :
 * charge toutes les commandes / événements / composants et valide les définitions slash.
 * Usage : npm run check
 */
process.env.DATA_DIR = process.env.DATA_DIR || require('node:path').join(require('node:os').tmpdir(), 'botsecu-check');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
let errors = 0;
const names = new Set();

for (const category of fs.readdirSync(path.join(root, 'commands'))) {
  for (const file of fs.readdirSync(path.join(root, 'commands', category))) {
    try {
      const command = require(path.join(root, 'commands', category, file));
      const json = command.data.toJSON();
      if (names.has(json.name)) throw new Error(`nom dupliqué : ${json.name}`);
      names.add(json.name);
      if (typeof command.execute !== 'function') throw new Error('execute manquant');
    } catch (err) {
      errors++;
      console.error(`❌ commands/${category}/${file} : ${err.message}`);
    }
  }
}

for (const dir of ['events', 'components']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    try {
      const mod = require(path.join(root, dir, file));
      if (typeof mod.execute !== 'function') throw new Error('execute manquant');
      if (dir === 'events' && !mod.name) throw new Error('name manquant');
      if (dir === 'components' && !mod.prefix) throw new Error('prefix manquant');
    } catch (err) {
      errors++;
      console.error(`❌ ${dir}/${file} : ${err.message}`);
    }
  }
}

for (const file of fs.readdirSync(path.join(root, 'utils'))) {
  try {
    require(path.join(root, 'utils', file));
  } catch (err) {
    errors++;
    console.error(`❌ utils/${file} : ${err.message}`);
  }
}

console.log(errors ? `\n${errors} erreur(s)` : `✅ ${names.size} commandes valides, événements et composants OK`);
process.exit(errors ? 1 : 0);
