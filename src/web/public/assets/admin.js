(function () {
  'use strict';

  var Site = window.Site;
  var icon = Site.icon;
  var main = document.getElementById('main');
  var nav = document.getElementById('admin-nav');
  var logoutBtn = document.getElementById('logout');
  var toasts = document.getElementById('toasts');

  var route = 'tableau';
  var state = { overview: null, members: null, memberQuery: '', memberFilter: 'all', memberLimit: 200, caseTab: 'cases' };
  var logCursor = { console: 0, discord: 0, lines: [], events: [] };
  var logTimer = null;

  var ROUTES = { tableau: 'Tableau de bord', membres: 'Membres', messages: 'Salons', sanctions: 'Sanctions', journaux: 'Journaux', bot: 'Bot' };
  var STATUS = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', offline: 'Hors ligne', invisible: 'Invisible' };
  var CASE_TYPES = { warn: 'Avertissement', timeout: 'Mute', untimeout: 'Fin de mute', kick: 'Expulsion', ban: 'Bannissement', tempban: 'Ban temporaire', softban: 'Softban', unban: 'Débannissement', note: 'Note', automod: 'Automod', antiraid: 'Antiraid', antinuke: 'Antinuke', verification: 'Vérification', quarantine: 'Quarantaine', unquarantine: 'Fin de quarantaine' };
  var MODULES = { automod: 'Automodération', antiraid: 'Antiraid', antinuke: 'Antinuke', verification: 'Vérification', modmail: 'Modmail', autoBackup: 'Sauvegarde automatique' };
  var VERIF = ['Aucun', 'Faible', 'Moyen', 'Élevé', 'Très élevé'];
  var PERMS = { Administrator: 'Administrateur', ManageGuild: 'Gérer le serveur', ManageRoles: 'Gérer les rôles', ManageChannels: 'Gérer les salons', BanMembers: 'Bannir', KickMembers: 'Expulser', ModerateMembers: 'Exclure temporairement', ManageMessages: 'Gérer les messages', MentionEveryone: 'Mentionner @everyone', ManageWebhooks: 'Gérer les webhooks', ViewAuditLog: 'Voir les logs d\'audit', ManageNicknames: 'Gérer les pseudos' };
  var ACTIVITY = ['Joue à', 'Stream', 'Écoute', 'Regarde', 'Statut', 'Participe à'];

  var nf = new Intl.NumberFormat('fr-FR');
  var df = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  var dtf = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var tf = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var collator = new Intl.Collator('fr', { sensitivity: 'base' });

  // ---------- DOM ----------

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        var value = attrs[key];
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'value') el.value = value;
        else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(el, c); });
    else el.append(child instanceof Node ? child : String(child));
  }

  var fmt = function (n) { return n == null ? 'n.c.' : nf.format(n); };
  var date = function (t) { return t ? df.format(t) : 'n.c.'; };
  var datetime = function (t) { return t ? dtf.format(t) : 'n.c.'; };

  function duration(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    var hh = Math.floor((s % 86400) / 3600);
    var mm = Math.floor((s % 3600) / 60);
    return (d ? d + ' j ' : '') + (hh ? hh + ' h ' : '') + mm + ' min';
  }

  function age(t) {
    var days = Math.floor((Date.now() - t) / 86400000);
    if (days < 1) return 'moins d\'un jour';
    if (days < 60) return days + ' jours';
    var months = Math.floor(days / 30.4);
    if (months < 24) return months + ' mois';
    return Math.floor(days / 365) + ' ans';
  }

  function swatch(color) {
    var s = h('span', { class: 'swatch', 'aria-hidden': 'true' });
    if (color) s.style.backgroundColor = color;
    return s;
  }

  function avatar(url, name, size) {
    var box = h('span', { class: 'avatar' + (size ? ' ' + size : '') });
    var fallback = function () {
      var el = h('span', { class: 'initials', 'aria-hidden': 'true', text: (String(name || '?').match(/[\p{L}\p{N}]/u) || ['?'])[0] });
      el.style.backgroundColor = '#5b6b7a';
      return el;
    };
    if (url && Site.mediaAllowed()) {
      var img = h('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', function () { img.replaceWith(fallback()); });
      box.append(img);
    } else box.append(fallback());
    return box;
  }

  function panel(title, iconName, aside, body) {
    return h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, h('h3', null, iconName ? icon(iconName) : null, title), aside), body);
  }

  function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control, hint ? h('span', { class: 'field-hint', text: hint }) : null);
  }

  function input(attrs) {
    return h('input', Object.assign({ class: 'input', type: 'text', autocomplete: 'off' }, attrs));
  }

  function select(options, attrs) {
    return h('select', Object.assign({ class: 'input select-input' }, attrs), options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
  }

  function toast(text, error) {
    var el = h('div', { class: 'toast' + (error ? ' error' : '') }, icon(error ? 'info' : 'shield'), h('span', { text: text }));
    toasts.append(el);
    setTimeout(function () { el.remove(); }, error ? 7000 : 4500);
  }

  // ---------- API ----------

  function api(method, path, body) {
    return fetch('/admin/api/' + path, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && path !== 'login') {
          showLogin('Session expirée. Reconnecte toi.');
          throw new Error('auth');
        }
        if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
        return data;
      });
    });
  }

  /** Lance une action, affiche le résultat et rafraîchit la vue. */
  function act(payload, confirmText, button) {
    if (confirmText && !window.confirm(confirmText)) return Promise.resolve();
    if (button) button.disabled = true;
    return api('POST', 'action', payload)
      .then(function (data) {
        toast(data.message);
        return refresh();
      })
      .catch(function (err) {
        if (err.message !== 'auth') toast(err.message, true);
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  }

  // ---------- Connexion ----------

  function showLogin(message) {
    stopLogs();
    nav.hidden = true;
    logoutBtn.hidden = true;
    var pwd = input({ type: 'password', id: 'password', autocomplete: 'current-password', required: true, 'aria-describedby': 'login-error' });
    var error = h('p', { class: 'form-error', id: 'login-error', role: 'alert', text: message || '' });
    var submit = h('button', { type: 'submit', class: 'button primary wide', text: 'Se connecter' });
    var form = h(
      'form',
      {
        class: 'login-card',
        onsubmit: function (e) {
          e.preventDefault();
          submit.disabled = true;
          error.textContent = '';
          api('POST', 'login', { password: pwd.value })
            .then(function () {
              pwd.value = '';
              start();
            })
            .catch(function (err) {
              error.textContent = err.message;
              pwd.select();
            })
            .finally(function () { submit.disabled = false; });
        },
      },
      h('span', { class: 'login-icon' }, icon('lock')),
      h('h1', { text: 'Administration' }),
      h('p', { class: 'lead', text: 'Espace réservé à l\'équipe du serveur. Toutes les actions sont enregistrées dans les logs.' }),
      field('Mot de passe', pwd),
      error,
      submit,
    );
    main.replaceChildren(h('div', { class: 'wrap login-wrap' }, form));
    pwd.focus();
  }

  logoutBtn.addEventListener('click', function () {
    api('POST', 'logout', {}).catch(function () {}).then(function () { showLogin('Tu es déconnecté.'); });
  });

  // ---------- Tableau de bord ----------

  function switchRow(key, label, on) {
    var btn = h('button', {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(on),
      'aria-label': label,
      onclick: function () { act({ type: 'module', module: key, enabled: !on }, null, btn); },
    });
    return h('div', { class: 'switch-row' }, h('span', { text: label }), h('span', { class: 'switch-state', text: on ? 'Activé' : 'Désactivé' }), btn);
  }

  function viewDashboard() {
    var o = state.overview;
    var b = o.bot;
    var reason = input({ placeholder: 'Raison (facultatif)', maxlength: 300 });

    var stat = function (label, value, sub) {
      return h('div', { class: 'stat' }, h('div', { class: 'stat-label', text: label }), h('div', { class: 'stat-value', text: value }), sub ? h('div', { class: 'stat-sub', text: sub }) : null);
    };

    var raidBtn = h('button', {
      type: 'button',
      class: 'button ' + (o.raidMode ? '' : 'danger'),
      text: o.raidMode ? 'Désactiver le mode raid' : 'Activer le mode raid',
      onclick: function () { act({ type: 'raidmode', enabled: !o.raidMode, reason: reason.value }, o.raidMode ? null : 'Activer le mode raid ? Les nouvelles arrivées seront sanctionnées.', raidBtn); },
    });
    var lockBtn = h('button', {
      type: 'button',
      class: 'button ' + (o.lockdown ? '' : 'danger'),
      text: o.lockdown ? 'Lever le lockdown' : 'Verrouiller tout le serveur',
      onclick: function () { act({ type: 'lockdown', enabled: !o.lockdown, reason: reason.value }, o.lockdown ? 'Déverrouiller tous les salons ?' : 'Verrouiller tous les salons textuels du serveur ?', lockBtn); },
    });

    return [
      h('div', { class: 'page-head' }, h('div', null, h('h2', { text: 'Tableau de bord' }), h('p', { class: 'lead', text: 'Connecté au bot ' + b.tag + ' sur ' + o.guild.name + '.' }))),
      h('div', { class: 'stats' }, stat('Latence', typeof b.ping === 'number' && b.ping >= 0 ? b.ping + ' ms' : 'n.c.', 'Connexion à Discord'), stat('En ligne depuis', duration(b.uptime), 'Version ' + b.version), stat('Mémoire', Math.round(b.memory / 1048576) + ' Mo', 'Node ' + b.node), stat('Membres', fmt(o.guild.members), b.guilds + ' serveur(s), ' + b.commands + ' commandes')),
      h(
        'div',
        { class: 'columns' },
        h(
          'div',
          { class: 'stack' },
          panel('Protections', 'shield', null, h('div', { class: 'switch-list' }, Object.keys(MODULES).map(function (k) { return switchRow(k, MODULES[k], k === 'autoBackup' ? o.autoBackup : o.modules[k]); }))),
          panel(
            'Urgence',
            'info',
            null,
            h(
              'div',
              { class: 'panel-pad form-stack' },
              h('p', { class: 'muted small', text: 'Mode raid : ' + (o.raidMode ? 'actif depuis ' + datetime(o.raidModeSince) : 'inactif') + '. Lockdown : ' + (o.lockdown ? o.lockdown + ' salon(s) verrouillé(s)' : 'inactif') + '.' }),
              field('Raison', reason),
              h('div', { class: 'button-row' }, raidBtn, lockBtn),
            ),
          ),
        ),
        h(
          'div',
          { class: 'stack' },
          panel(
            'Serveur',
            'info',
            null,
            h(
              'dl',
              { class: 'info' },
              h('dt', { text: 'Propriétaire' }), h('dd', { text: o.guild.owner }),
              h('dt', { text: 'Vérification Discord' }), h('dd', { text: VERIF[o.guild.verificationLevel] || 'n.c.' }),
              h('dt', { text: 'Rôle du bot' }), h('dd', { text: (b.topRole || 'n.c.') + (b.admin ? ' (administrateur)' : '') }),
              h('dt', { text: 'Statuts des membres' }), h('dd', { text: b.presences ? 'Activés' : 'Désactivés' }),
            ),
          ),
          panel(
            'Historique',
            'list',
            null,
            h(
              'dl',
              { class: 'info' },
              h('dt', { text: 'Cas de modération' }), h('dd', { text: fmt(o.counts.cases) }),
              h('dt', { text: 'Avertissements' }), h('dd', { text: fmt(o.counts.warns) }),
              h('dt', { text: 'Notes' }), h('dd', { text: fmt(o.counts.notes) }),
              h('dt', { text: 'En quarantaine' }), h('dd', { text: fmt(o.counts.quarantine) }),
              h('dt', { text: 'Bans temporaires' }), h('dd', { text: fmt(o.counts.tempbans) }),
            ),
          ),
          panel(
            'Salons de logs',
            'hash',
            null,
            h('dl', { class: 'info' }, Object.keys(o.logChannels).map(function (k) {
              return [h('dt', { text: { mod: 'Modération', messages: 'Messages', members: 'Membres', server: 'Serveur', reports: 'Signalements' }[k] || k }), h('dd', { text: o.logChannels[k] ? '#' + o.logChannels[k] : 'Non configuré' })];
            })),
          ),
        ),
      ),
    ];
  }

  // ---------- Membres ----------

  var membersList = h('div');
  var membersCount = h('span', { class: 'count' });
  var membersToolbar = null;

  function buildMembersToolbar() {
    var search = input({
      type: 'search',
      placeholder: 'Nom, pseudo ou identifiant',
      'aria-label': 'Rechercher un membre',
      oninput: function (e) {
        state.memberQuery = e.target.value;
        state.memberLimit = 200;
        renderMembers();
      },
    });
    var filter = select(
      [['all', 'Tous les membres'], ['humans', 'Humains'], ['bots', 'Bots'], ['muted', 'Muets'], ['warned', 'Avertis'], ['quarantine', 'En quarantaine'], ['new', 'Comptes de moins de 30 jours'], ['pending', 'Règlement non accepté'], ['hidden', 'Masqués sur le site']],
      {
        'aria-label': 'Filtre',
        onchange: function (e) {
          state.memberFilter = e.target.value;
          state.memberLimit = 200;
          renderMembers();
        },
      },
    );
    var banId = input({ placeholder: 'Identifiant à bannir', inputmode: 'numeric', 'aria-label': 'Bannir par identifiant' });
    var banBtn = h('button', {
      type: 'button',
      class: 'button',
      text: 'Bannir par ID',
      onclick: function () {
        var id = banId.value.trim();
        if (!/^\d{15,21}$/.test(id)) return toast('Identifiant invalide.', true);
        act({ type: 'ban', userId: id, reason: 'Bannissement par identifiant' }, 'Bannir l\'utilisateur ' + id + ' ?', banBtn).then(function () { banId.value = ''; });
      },
    });
    membersToolbar = h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), search), filter, h('div', { class: 'inline-form' }, banId, banBtn));
  }

  function renderMembers() {
    var q = state.memberQuery.trim().toLowerCase();
    var now = Date.now();
    var list = state.members.filter(function (m) {
      if (q && m.display.toLowerCase().indexOf(q) === -1 && m.tag.toLowerCase().indexOf(q) === -1 && m.id.indexOf(q) === -1) return false;
      switch (state.memberFilter) {
        case 'humans': return !m.bot;
        case 'bots': return m.bot;
        case 'muted': return Boolean(m.timeoutUntil);
        case 'warned': return m.warns > 0;
        case 'quarantine': return m.quarantined;
        case 'new': return now - m.createdAt < 30 * 86400000;
        case 'pending': return m.pending;
        case 'hidden': return m.hidden;
        default: return true;
      }
    });
    list.sort(function (a, b) { return collator.compare(a.display, b.display); });
    membersCount.textContent = fmt(list.length);

    var rows = list.slice(0, state.memberLimit).map(function (m) {
      var flags = h('span', { class: 'flags' });
      if (m.bot) flags.append(h('span', { class: 'tag' }, 'Bot'));
      if (m.timeoutUntil) flags.append(h('span', { class: 'tag warn' }, 'Muet'));
      if (m.quarantined) flags.append(h('span', { class: 'tag warn' }, 'Quarantaine'));
      if (m.warns) flags.append(h('span', { class: 'tag' }, m.warns + ' avert.'));
      if (m.hidden) flags.append(h('span', { class: 'tag' }, 'Masqué'));
      if (now - m.createdAt < 7 * 86400000) flags.append(h('span', { class: 'tag warn' }, 'Compte récent'));
      return h(
        'tr',
        { class: 'clickable', tabindex: '0', onclick: function () { openMember(m.id); }, onkeydown: function (e) { if (e.key === 'Enter') openMember(m.id); } },
        h('td', null, h('div', { class: 'role-name' }, avatar(m.avatar, m.display, 'sm'), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', { class: 'text', text: m.display })), h('div', { class: 'row-sub', text: m.tag })))),
        h('td', { class: 'col-hide', text: m.topRole || '' }),
        h('td', { class: 'col-hide', text: date(m.joinedAt) }),
        h('td', { class: 'col-hide', text: age(m.createdAt) }),
        h('td', null, flags),
      );
    });

    var nodes = [
      h(
        'section',
        { class: 'panel' },
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, h('th', { text: 'Membre' }), h('th', { class: 'col-hide', text: 'Rôle principal' }), h('th', { class: 'col-hide', text: 'Arrivé le' }), h('th', { class: 'col-hide', text: 'Âge du compte' }), h('th', { text: 'Signalements' }))),
            h('tbody', null, rows),
          ),
        ),
      ),
      list.length > state.memberLimit
        ? h('div', { class: 'more' }, h('button', { type: 'button', class: 'button', text: 'Afficher plus (' + fmt(list.length - state.memberLimit) + ' restants)', onclick: function () { state.memberLimit += 300; renderMembers(); } }))
        : null,
      list.length ? null : h('div', { class: 'state' }, icon('search'), h('p', { text: 'Aucun membre ne correspond.' })),
    ].filter(Boolean);
    membersList.replaceChildren.apply(membersList, nodes);
  }

  function viewMembers() {
    if (!membersToolbar) buildMembersToolbar();
    var view = [h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Membres ', membersCount), h('p', { class: 'lead', text: 'Clique sur un membre pour voir sa fiche complète et agir.' }))), membersToolbar, membersList];
    queueMicrotask(renderMembers);
    return view;
  }

  // ---------- Fiche membre ----------

  var sheet = null;
  var openedId = null;

  function openMember(id) {
    openedId = id;
    if (!sheet) {
      sheet = h('dialog', { class: 'sheet wide', 'aria-label': 'Fiche membre' });
      sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); });
      sheet.addEventListener('close', function () { openedId = null; });
      document.body.append(sheet);
    }
    sheet.replaceChildren(h('div', { class: 'sheet-body' }, h('div', { class: 'state' }, h('p', { text: 'Chargement de la fiche' }))));
    if (!sheet.open) sheet.showModal();
    return api('GET', 'member?id=' + encodeURIComponent(id))
      .then(function (d) { if (openedId === id) renderSheet(d); })
      .catch(function (err) {
        if (err.message !== 'auth') sheet.replaceChildren(h('div', { class: 'sheet-body' }, h('p', { class: 'form-error', text: err.message })));
      });
  }

  function facts(pairs) {
    return h('div', { class: 'facts' }, pairs.filter(function (p) { return p[1] != null && p[1] !== ''; }).map(function (p) {
      return h('div', { class: 'fact' }, h('span', { text: p[0] }), h('strong', { text: String(p[1]) }));
    }));
  }

  function section(label, content) {
    return h('div', { class: 'sheet-section' }, h('div', { class: 'sheet-label', text: label }), content);
  }

  function historyList(items, render) {
    if (!items.length) return h('p', { class: 'muted small', text: 'Rien.' });
    return h('ul', { class: 'history' }, items.slice().reverse().map(render));
  }

  function renderSheet(d) {
    var reason = input({ placeholder: 'Raison (facultatif)', maxlength: 400 });
    var b = function (text, payload, confirmText, cls) {
      var btn = h('button', {
        type: 'button',
        class: 'button small ' + (cls || ''),
        text: text,
        onclick: function () {
          act(Object.assign({ userId: d.id, reason: reason.value }, payload()), confirmText, btn).then(function () { if (openedId === d.id) openMember(d.id); });
        },
      });
      return btn;
    };

    var muteDuration = input({ placeholder: '10m, 2h, 1j', maxlength: 20, value: '1h', 'aria-label': 'Durée du mute' });
    var banDuration = input({ placeholder: 'Vide = définitif', maxlength: 20, 'aria-label': 'Durée du ban' });
    var banDays = select([['0', 'Garder les messages'], ['1', 'Supprimer 24 h'], ['7', 'Supprimer 7 jours']], { 'aria-label': 'Messages à supprimer' });
    var nick = input({ placeholder: 'Nouveau pseudo (vide = réinitialiser)', maxlength: 32, value: d.nickname || '' });
    var roleOptions = (state.overview ? state.overview.roles : []).filter(function (r) { return r.editable; });
    var roleSelect = select(roleOptions.map(function (r) { return [r.id, r.name]; }), { 'aria-label': 'Rôle' });
    var noteText = h('textarea', { class: 'input', rows: '2', maxlength: '1000', placeholder: 'Note interne visible par le staff' });
    var dmText = h('textarea', { class: 'input', rows: '2', maxlength: '2000', placeholder: 'Message privé envoyé par le bot' });

    var cover = h('div', { class: 'sheet-cover' + (d.accentColor ? ' colored' : '') });
    if (d.accentColor) cover.style.backgroundColor = d.accentColor;
    if (d.banner && Site.mediaAllowed()) {
      cover.classList.add('colored');
      cover.append(h('img', { src: d.banner, alt: '', referrerpolicy: 'no-referrer' }));
    }

    var statusLine = h('div', { class: 'handle' }, h('span', { text: d.tag }), h('span', { class: 'mono', text: d.id }));
    if (d.bot) statusLine.append(h('span', { class: 'tag' }, 'Bot'));
    if (!d.inServer) statusLine.append(h('span', { class: 'tag warn' }, d.banned ? 'Banni' : 'Hors du serveur'));
    if (d.presence) statusLine.append(h('span', { text: STATUS[d.presence.status] + (d.presence.devices.length ? ' (' + d.presence.devices.join(', ') + ')' : '') }));

    var actions = d.inServer
      ? [
          section('Sanction', h('div', { class: 'form-stack' }, field('Raison', reason), h('div', { class: 'button-row' },
            b('Avertir', function () { return { type: 'warn' }; }),
            d.timeoutUntil ? b('Retirer le mute', function () { return { type: 'untimeout' }; }) : null,
            d.voice ? b('Déconnecter du vocal', function () { return { type: 'voiceDisconnect' }; }) : null,
            b('Expulser', function () { return { type: 'kick' }; }, 'Expulser ' + d.tag + ' ?', 'danger'),
          ), h('div', { class: 'inline-form' }, muteDuration, b('Rendre muet', function () { return { type: 'timeout', duration: muteDuration.value }; })),
          h('div', { class: 'inline-form' }, banDuration, banDays, b('Bannir', function () { return { type: 'ban', duration: banDuration.value, deleteDays: banDays.value }; }, 'Bannir ' + d.tag + ' ?', 'danger')))),
          section('Profil', h('div', { class: 'form-stack' },
            h('div', { class: 'inline-form' }, nick, b('Renommer', function () { return { type: 'nick', nick: nick.value }; })),
            roleOptions.length ? h('div', { class: 'inline-form' }, roleSelect, b('Ajouter', function () { return { type: 'roleAdd', roleId: roleSelect.value }; }), b('Retirer', function () { return { type: 'roleRemove', roleId: roleSelect.value }; })) : null,
            h('div', { class: 'button-row' }, d.hidden ? b('Afficher sur le site', function () { return { type: 'siteShow' }; }) : b('Masquer du site public', function () { return { type: 'siteHide' }; })),
          )),
        ]
      : [
          section('Sanction', h('div', { class: 'form-stack' }, field('Raison', reason), h('div', { class: 'button-row' },
            d.banned ? b('Débannir', function () { return { type: 'unban' }; }, 'Débannir ' + d.tag + ' ?') : b('Bannir', function () { return { type: 'ban' }; }, 'Bannir ' + d.tag + ' ?', 'danger'),
          ))),
        ];

    sheet.replaceChildren(
      cover,
      h(
        'div',
        { class: 'sheet-body' },
        h('div', { class: 'sheet-head' }, avatar(d.avatar, d.display, 'xl'), h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Fermer', onclick: function () { sheet.close(); } }, icon('close'))),
        h('h3', { text: d.display }),
        statusLine,
        section('Compte', facts([
          ['Compte créé le', date(d.createdAt) + ' (' + age(d.createdAt) + ')'],
          ['Arrivé le', d.joinedAt ? date(d.joinedAt) : null],
          ['Booste depuis', d.boostSince ? date(d.boostSince) : null],
          ['Muet jusqu\'au', d.timeoutUntil ? datetime(d.timeoutUntil) : null],
          ['Arrivées sur le serveur', d.local.joinCount],
          ['Invitation', d.local.vanity ? 'Lien personnalisé' : d.local.inviteCode ? d.local.inviteCode + (d.local.inviter ? ' par ' + d.local.inviter : '') : null],
          ['Vocal', d.voice ? d.voice.channel : null],
          ['Avatars différents vus', d.history.avatarsSeen || null],
          ['Sanctions ailleurs', d.history.otherServerSanctions || null],
          ['Règlement accepté', d.inServer ? (d.pending ? 'Non' : 'Oui') : null],
          ['Motif du ban', d.banned ? d.banned.reason || 'Aucun' : null],
        ])),
        d.roles.length ? section('Rôles · ' + d.roles.length, h('div', { class: 'chips' }, d.roles.map(function (r) { return h('span', { class: 'chip' }, swatch(r.color), r.name); }))) : null,
        d.permissions.length ? section('Permissions sensibles', h('div', { class: 'chips' }, d.permissions.filter(function (p) { return PERMS[p]; }).map(function (p) { return h('span', { class: 'chip' }, PERMS[p]); }).concat(d.permissions.some(function (p) { return PERMS[p]; }) ? [] : [h('span', { class: 'muted small', text: 'Aucune' })]))) : null,
        d.presence && d.presence.activities.length ? section('Activités', h('ul', { class: 'history' }, d.presence.activities.map(function (a) { return h('li', null, h('strong', { text: (ACTIVITY[a.type] || 'Activité') + ' ' }), [a.name, a.details, a.state].filter(Boolean).join(' · ')); }))) : null,
        d.history.names.length > 1 ? section('Anciens noms', h('div', { class: 'chips' }, d.history.names.map(function (n) { return h('span', { class: 'chip', text: n }); }))) : null,
        d.quarantine ? section('Quarantaine', h('p', { class: 'muted small', text: 'Depuis le ' + datetime(d.quarantine.at) + ' · ' + (d.quarantine.reason || '') })) : null,
        actions,
        section('Message et note', h('div', { class: 'form-stack' },
          h('div', { class: 'inline-form' }, dmText, b('Envoyer en MP', function () { return { type: 'dm', text: dmText.value }; }, 'Envoyer ce message privé de la part du bot ?')),
          h('div', { class: 'inline-form' }, noteText, b('Ajouter la note', function () { return { type: 'note', text: noteText.value }; })),
        )),
        section('Avertissements · ' + d.warns.length, historyList(d.warns, function (w) { return h('li', null, h('strong', { text: '#' + w.id + ' ' }), w.reason, h('span', { class: 'muted', text: ' · ' + datetime(w.timestamp) })); })),
        section('Cas de modération · ' + d.cases.length, historyList(d.cases, function (c) { return h('li', null, h('strong', { text: '#' + c.id + ' ' + (CASE_TYPES[c.type] || c.type) + ' ' }), c.reason, h('span', { class: 'muted', text: ' · ' + (c.moderatorTag || '') + ' · ' + datetime(c.timestamp) })); })),
        section('Notes · ' + d.notes.length, historyList(d.notes, function (n) { return h('li', null, h('strong', { text: '#' + n.id + ' ' }), n.text, h('span', { class: 'muted', text: ' · ' + datetime(n.timestamp) })); })),
      ),
    );
  }

  // ---------- Salons ----------

  function viewMessages() {
    var o = state.overview;
    var channelOptions = o.channels.filter(function (c) { return !c.forum; }).map(function (c) { return [c.id, '#' + c.name + (c.parent ? ' (' + c.parent + ')' : '')]; });
    var allOptions = o.channels.map(function (c) { return [c.id, '#' + c.name + (c.forum ? ' (forum)' : '') + (c.locked ? ' · verrouillé' : '') + (c.slowmode ? ' · lent ' + c.slowmode + ' s' : '')]; });

    var sendChannel = select(channelOptions, { 'aria-label': 'Salon' });
    var content = h('textarea', { class: 'input', rows: '4', maxlength: '2000', placeholder: 'Texte du message' });
    var embedTitle = input({ maxlength: 256, placeholder: 'Titre de l\'encadré (facultatif)' });
    var embedDesc = h('textarea', { class: 'input', rows: '4', maxlength: '4000', placeholder: 'Contenu de l\'encadré (facultatif)' });
    var embedColor = h('input', { class: 'input color-input', type: 'color', value: '#1d6b4f', 'aria-label': 'Couleur de l\'encadré' });
    var mentions = h('input', { type: 'checkbox' });
    var sendBtn = h('button', {
      type: 'submit',
      class: 'button primary',
      text: 'Envoyer',
    });
    var sendForm = h(
      'form',
      {
        class: 'panel-pad form-stack',
        onsubmit: function (e) {
          e.preventDefault();
          act({ type: 'send', channelId: sendChannel.value, content: content.value, embedTitle: embedTitle.value, embedDescription: embedDesc.value, embedColor: embedColor.value, mentions: mentions.checked }, null, sendBtn).then(function () {
            content.value = '';
            embedTitle.value = '';
            embedDesc.value = '';
          });
        },
      },
      field('Salon', sendChannel),
      field('Message', content),
      field('Encadré', h('div', { class: 'form-stack' }, h('div', { class: 'inline-form' }, embedTitle, embedColor), embedDesc)),
      h('label', { class: 'check' }, mentions, h('span', { text: 'Autoriser les mentions (@everyone, rôles, membres)' })),
      h('div', { class: 'button-row' }, sendBtn),
    );

    var toolChannel = select(allOptions, { 'aria-label': 'Salon' });
    var purgeCount = input({ type: 'number', min: '1', max: '100', value: '20', 'aria-label': 'Nombre de messages' });
    var slow = select([['0', 'Désactivé'], ['5', '5 s'], ['10', '10 s'], ['30', '30 s'], ['60', '1 min'], ['300', '5 min'], ['900', '15 min'], ['3600', '1 h']], { 'aria-label': 'Mode lent' });
    var tool = function (text, payload, confirmText, cls) {
      var btn = h('button', { type: 'button', class: 'button ' + (cls || ''), text: text, onclick: function () { act(Object.assign({ channelId: toolChannel.value }, payload()), confirmText && confirmText(), btn); } });
      return btn;
    };

    return [
      h('div', { class: 'page-head' }, h('div', null, h('h2', { text: 'Salons' }), h('p', { class: 'lead', text: 'Parle au nom du bot et gère les salons.' }))),
      h(
        'div',
        { class: 'columns' },
        panel('Envoyer un message', 'forum', null, sendForm),
        panel(
          'Outils de salon',
          'hash',
          null,
          h(
            'div',
            { class: 'panel-pad form-stack' },
            field('Salon', toolChannel),
            field('Supprimer des messages', h('div', { class: 'inline-form' }, purgeCount, tool('Supprimer', function () { return { type: 'purge', count: purgeCount.value }; }, function () { return 'Supprimer les ' + purgeCount.value + ' derniers messages ?'; }, 'danger')), '100 maximum, messages de moins de 14 jours.'),
            field('Mode lent', h('div', { class: 'inline-form' }, slow, tool('Appliquer', function () { return { type: 'slowmode', seconds: slow.value }; }))),
            field('Écriture', h('div', { class: 'button-row' }, tool('Verrouiller', function () { return { type: 'lock' }; }), tool('Déverrouiller', function () { return { type: 'unlock' }; }))),
          ),
        ),
      ),
    ];
  }

  // ---------- Sanctions ----------

  var casesData = null;
  var bansData = null;

  function viewSanctions() {
    var tabs = [['cases', 'Cas'], ['warns', 'Avertissements'], ['notes', 'Notes'], ['bans', 'Bannis'], ['quarantine', 'Quarantaine'], ['tempbans', 'Bans temporaires']];
    var seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Catégorie' }, tabs.map(function (t) {
      return h('button', { type: 'button', 'aria-pressed': String(state.caseTab === t[0]), text: t[1], onclick: function () { state.caseTab = t[0]; render(); } });
    }));
    var body = h('div', null, h('div', { class: 'state' }, h('p', { text: 'Chargement' })));

    var userCell = function (id, tag) {
      return h('button', { type: 'button', class: 'linklike strong', text: tag || id, onclick: function () { openMember(id); } });
    };
    var table = function (headers, rows) {
      if (!rows.length) return h('div', { class: 'state' }, icon('list'), h('p', { text: 'Rien à afficher.' }));
      return h('section', { class: 'panel' }, h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, headers.map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rows))));
    };

    var fill = function () {
      var c = casesData;
      var t = state.caseTab;
      var content;
      if (t === 'cases') content = table(['N°', 'Type', 'Membre', 'Raison', 'Par', 'Date'], c.cases.map(function (x) { return h('tr', null, h('td', { text: '#' + x.id }), h('td', { text: CASE_TYPES[x.type] || x.type }), h('td', null, userCell(x.targetId, x.targetTag)), h('td', { text: x.reason }), h('td', { text: x.moderatorTag || '' }), h('td', { text: datetime(x.timestamp) })); }));
      else if (t === 'warns') content = table(['N°', 'Membre', 'Raison', 'Date'], c.warns.map(function (x) { return h('tr', null, h('td', { text: '#' + x.id }), h('td', null, userCell(x.userId)), h('td', { text: x.reason }), h('td', { text: datetime(x.timestamp) })); }));
      else if (t === 'notes') content = table(['N°', 'Membre', 'Note', 'Date'], c.notes.map(function (x) { return h('tr', null, h('td', { text: '#' + x.id }), h('td', null, userCell(x.userId)), h('td', { text: x.text }), h('td', { text: datetime(x.timestamp) })); }));
      else if (t === 'quarantine') content = table(['Membre', 'Raison', 'Depuis'], c.quarantine.map(function (x) { return h('tr', null, h('td', null, userCell(x.id, x.tag)), h('td', { text: x.reason || '' }), h('td', { text: datetime(x.at) })); }));
      else if (t === 'tempbans') content = table(['Utilisateur', 'Fin du ban'], c.tempbans.map(function (x) { return h('tr', null, h('td', null, userCell(x.userId)), h('td', { text: datetime(x.until) })); }));
      else if (t === 'bans') {
        if (!bansData) {
          api('GET', 'bans').then(function (d) { bansData = d.bans; if (state.caseTab === 'bans') fill(); }).catch(function (err) { if (err.message !== 'auth') body.replaceChildren(h('p', { class: 'form-error', text: err.message })); });
          content = h('div', { class: 'state' }, h('p', { text: 'Chargement des bannis' }));
        } else {
          content = table(['Utilisateur', 'Raison', ''], bansData.map(function (x) {
            var btn = h('button', { type: 'button', class: 'button small', text: 'Débannir', onclick: function () { act({ type: 'unban', userId: x.id, reason: 'Débannissement depuis le site' }, 'Débannir ' + x.tag + ' ?', btn).then(function () { bansData = null; render(); }); } });
            return h('tr', null, h('td', null, h('div', { class: 'role-name' }, avatar(x.avatar, x.tag, 'xs'), userCell(x.id, x.tag))), h('td', { text: x.reason || 'Aucune' }), h('td', { class: 'num' }, btn));
          }));
        }
      }
      body.replaceChildren(content);
    };

    api('GET', 'cases').then(function (d) { casesData = d; fill(); }).catch(function (err) { if (err.message !== 'auth') body.replaceChildren(h('p', { class: 'form-error', text: err.message })); });
    return [h('div', { class: 'page-head' }, h('div', null, h('h2', { text: 'Sanctions' }), h('p', { class: 'lead', text: 'Historique complet de la modération.' }))), h('div', { class: 'toolbar' }, seg), body];
  }

  // ---------- Journaux ----------

  var consoleBox = null;
  var discordBox = null;

  function pollLogs() {
    api('GET', 'logs?after=' + logCursor.console + '&dafter=' + logCursor.discord)
      .then(function (d) {
        if (d.console.length) {
          logCursor.console = d.console[d.console.length - 1].id;
          logCursor.lines = logCursor.lines.concat(d.console).slice(-500);
        }
        if (d.discord.length) {
          logCursor.discord = d.discord[d.discord.length - 1].id;
          logCursor.events = logCursor.events.concat(d.discord).slice(-300);
        }
        if (route === 'journaux') drawLogs(d.console.length > 0, d.discord.length > 0);
      })
      .catch(function () {});
  }

  function drawLogs(newConsole, newDiscord) {
    if (!consoleBox) return;
    if (newConsole || !consoleBox.childNodes.length) {
      var stick = consoleBox.scrollHeight - consoleBox.scrollTop - consoleBox.clientHeight < 40;
      consoleBox.replaceChildren.apply(consoleBox, logCursor.lines.length ? logCursor.lines.map(function (l) {
        return h('div', { class: 'log-line ' + l.level }, h('span', { class: 'log-time', text: tf.format(l.at) }), h('span', { class: 'log-text', text: l.text }));
      }) : [h('p', { class: 'muted small', text: 'Aucune ligne depuis le démarrage.' })]);
      if (stick) consoleBox.scrollTop = consoleBox.scrollHeight;
    }
    if (newDiscord || !discordBox.childNodes.length) {
      discordBox.replaceChildren.apply(discordBox, logCursor.events.length ? logCursor.events.slice().reverse().map(function (e) {
        var card = h('article', { class: 'log-card' }, h('header', null, h('strong', { text: e.title }), h('span', { class: 'muted', text: ' · ' + ({ mod: 'Modération', messages: 'Messages', members: 'Membres', server: 'Serveur', reports: 'Signalements' }[e.type] || e.type) + ' · ' + tf.format(e.at) })), e.description ? h('p', { text: e.description }) : null, e.fields.length ? h('dl', null, e.fields.map(function (f) { return [h('dt', { text: f.name }), h('dd', { text: f.value })]; })) : null);
        if (e.color) card.style.borderLeftColor = '#' + e.color.toString(16).padStart(6, '0');
        return card;
      }) : [h('p', { class: 'muted small', text: 'Aucun log Discord depuis le démarrage.' })]);
    }
  }

  function viewLogs() {
    consoleBox = h('div', { class: 'console', role: 'log', 'aria-label': 'Console du bot' });
    discordBox = h('div', { class: 'log-cards' });
    queueMicrotask(function () { drawLogs(true, true); });
    return [
      h('div', { class: 'page-head' }, h('div', null, h('h2', { text: 'Journaux' }), h('p', { class: 'lead', text: 'Mis à jour toutes les 3 secondes. Conservés en mémoire depuis le dernier démarrage du bot.' }))),
      h('div', { class: 'columns logs' }, panel('Console du bot', 'list', null, consoleBox), panel('Logs du serveur', 'shield', null, discordBox)),
    ];
  }

  function startLogs() {
    if (logTimer) return;
    pollLogs();
    logTimer = setInterval(pollLogs, 3000);
  }

  function stopLogs() {
    clearInterval(logTimer);
    logTimer = null;
  }

  // ---------- Bot ----------

  function viewBot() {
    var p = state.overview.bot.presence;
    var status = select([['online', 'En ligne'], ['idle', 'Absent'], ['dnd', 'Ne pas déranger'], ['invisible', 'Invisible']], { 'aria-label': 'Statut' });
    status.value = p.status;
    var type = select([['', 'Aucune activité'], ['playing', 'Joue à'], ['watching', 'Regarde'], ['listening', 'Écoute'], ['competing', 'Participe à'], ['streaming', 'En stream'], ['custom', 'Statut personnalisé']], { 'aria-label': 'Activité' });
    type.value = p.type || '';
    var text = input({ maxlength: 128, value: p.text, placeholder: 'Texte de l\'activité' });
    var url = input({ maxlength: 200, value: p.url, placeholder: 'https://twitch.tv/...' });
    var urlField = field('Lien du stream', url, 'Twitch ou YouTube.');
    var syncUrl = function () { urlField.hidden = type.value !== 'streaming'; };
    type.addEventListener('change', syncUrl);
    syncUrl();
    var save = h('button', { type: 'submit', class: 'button primary', text: 'Enregistrer' });
    var b = state.overview.bot;
    return [
      h('div', { class: 'page-head' }, h('div', null, h('h2', { text: 'Bot' }), h('p', { class: 'lead', text: b.tag + ' · identifiant ' + b.id }))),
      h(
        'div',
        { class: 'columns' },
        panel(
          'Statut et activité',
          'online',
          null,
          h('form', { class: 'panel-pad form-stack', onsubmit: function (e) { e.preventDefault(); act({ type: 'presence', status: status.value, activity: type.value, text: text.value, url: url.value }, null, save); } }, field('Statut', status), field('Activité', type), field('Texte', text), urlField, h('div', { class: 'button-row' }, save)),
        ),
        panel(
          'Informations',
          'bot',
          null,
          h('dl', { class: 'info' },
            h('dt', { text: 'Version' }), h('dd', { text: b.version }),
            h('dt', { text: 'Node' }), h('dd', { text: b.node }),
            h('dt', { text: 'Serveurs' }), h('dd', { text: fmt(b.guilds) }),
            h('dt', { text: 'Commandes' }), h('dd', { text: fmt(b.commands) }),
            h('dt', { text: 'Latence' }), h('dd', { text: typeof b.ping === 'number' && b.ping >= 0 ? b.ping + ' ms' : 'n.c.' }),
            h('dt', { text: 'En ligne depuis' }), h('dd', { text: duration(b.uptime) }),
          ),
        ),
      ),
    ];
  }

  // ---------- Rendu ----------

  var VIEWS = { tableau: viewDashboard, membres: viewMembers, messages: viewMessages, sanctions: viewSanctions, journaux: viewLogs, bot: viewBot };

  function render() {
    nav.querySelectorAll('a').forEach(function (a) {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = ROUTES[route] + ' · Administration';
    if (route === 'journaux') startLogs();
    else stopLogs();
    main.replaceChildren(h('div', { class: 'wrap' }, VIEWS[route]()));
  }

  function refresh() {
    var jobs = [api('GET', 'overview').then(function (d) { state.overview = d; })];
    if (route === 'membres' || state.members) jobs.push(api('GET', 'members').then(function (d) { state.members = d.members; }));
    return Promise.all(jobs).then(function () {
      bansData = null;
      if (route === 'membres' && membersToolbar && document.body.contains(membersToolbar)) renderMembers();
      else if (route !== 'journaux') render();
    });
  }

  function start() {
    nav.hidden = false;
    logoutBtn.hidden = false;
    main.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'state' }, h('p', { text: 'Chargement des données du bot' }))));
    Promise.all([api('GET', 'overview'), api('GET', 'members')])
      .then(function (r) {
        state.overview = r[0];
        state.members = r[1].members;
        render();
      })
      .catch(function (err) {
        if (err.message !== 'auth') main.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'state' }, icon('offline'), h('p', { text: err.message }))));
      });
  }

  function readRoute() {
    var key = location.hash.replace('#', '');
    route = ROUTES[key] ? key : 'tableau';
  }

  window.addEventListener('hashchange', function () {
    readRoute();
    if (state.overview) {
      render();
      window.scrollTo(0, 0);
    }
  });

  readRoute();
  api('GET', 'session')
    .then(function (d) {
      if (d.authenticated) start();
      else showLogin();
    })
    .catch(function () { showLogin(); });
})();
