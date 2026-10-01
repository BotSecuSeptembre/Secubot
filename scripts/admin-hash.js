/**
 * Génère l'empreinte d'un nouveau mot de passe pour l'espace d'administration.
 * Usage : npm run admin-hash
 * Copier ensuite la ligne obtenue dans la variable ADMIN_PASSWORD_HASH (Railway > Variables).
 */
const readline = require('node:readline');
const { hashPassword } = require('../src/web/admin/auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Nouveau mot de passe (12 caractères minimum) : ', (password) => {
  rl.close();
  if (password.length < 12) {
    console.error('Mot de passe trop court.');
    process.exit(1);
  }
  console.log(`\nADMIN_PASSWORD_HASH=${hashPassword(password)}`);
});
