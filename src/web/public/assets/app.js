(function () {
  'use strict';

  var Site = window.Site;
  var icon = Site.icon;
  var main = document.getElementById('main');
  var liveEl = document.getElementById('live');
  var brandIcon = document.getElementById('brand-icon');
  var brandName = document.getElementById('brand-name');

  var data = null;
  var etag = null;
  var route = 'apercu';
  var membersById = new Map();
  var rolesById = new Map();
  var ui = { query: '', status: 'all', role: '', limit: 240 };

  var ROUTES = { apercu: 'Aperçu', membres: 'Membres', salons: 'Salons', roles: 'Rôles' };
  var VERIFICATION = ['Aucun', 'Faible', 'Moyen', 'Élevé', 'Très élevé'];
  var STATUS_LABEL = { online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', offline: 'Hors ligne' };
  var AVATAR_TONES = ['#5b6b7a', '#6b705c', '#7a5c58', '#4f6d63', '#6a5f7a', '#80694f', '#4f647a'];

  var nf = new Intl.NumberFormat('fr-FR');
  var df = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  var rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  var collator = new Intl.Collator('fr', { sensitivity: 'base' });

  // ---------- Utilitaires DOM ----------

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        var value = attrs[key];
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
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

  function fmt(n) {
    return n == null ? '' : nf.format(n);
  }

  function ago(ts) {
    var diff = (ts - Date.now()) / 1000;
    var abs = Math.abs(diff);
    if (abs < 60) return 'à l\'instant';
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  }

  function initial(name) {
    var match = String(name || '').match(/[\p{L}\p{N}]/u);
    return match ? match[0] : '?';
  }

  function tone(id) {
    var sum = 0;
    for (var i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 997;
    return AVATAR_TONES[sum % AVATAR_TONES.length];
  }

  // Image hébergée par Discord : chargée seulement avec l'accord du visiteur, remplacée en cas d'échec
  function media(url, alt, cls, fallback) {
    if (!url || !Site.mediaAllowed()) return null;
    var img = h('img', { src: url, alt: alt || '', class: cls, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', function () {
      if (fallback) img.replaceWith(fallback());
      else img.remove();
    });
    return img;
  }

  function avatar(person, size, withStatus) {
    var box = h('span', { class: 'avatar' + (size ? ' ' + size : '') });
    var initials = function () {
      var el = h('span', { class: 'initials', 'aria-hidden': 'true', text: initial(person.n) });
      el.style.backgroundColor = tone(person.id || person.n || '');
      return el;
    };
    box.append(media(person.a, '', null, initials) || initials());
    if (withStatus && data.presences && person.s) {
      box.append(h('span', { class: 'status ' + person.s, title: STATUS_LABEL[person.s] }));
    }
    return box;
  }

  function panel(title, iconName, countText, body) {
    return h(
      'section',
      { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h3', null, iconName ? icon(iconName) : null, title), countText != null ? h('span', { class: 'count', text: countText }) : null),
      body,
    );
  }

  function swatch(color) {
    var s = h('span', { class: 'swatch', 'aria-hidden': 'true' });
    if (color) s.style.backgroundColor = color;
    return s;
  }

  // ---------- Courbe d'évolution (24 h glissantes, en mémoire côté bot) ----------

  var SVG = 'http://www.w3.org/2000/svg';
  var tf = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function svg(tag, attrs) {
    var el = document.createElementNS(SVG, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function sparkline(key, unit) {
    var points = (data.history || []).filter(function (p) {
      return p[key] != null;
    });
    if (points.length < 2) return h('div', { class: 'spark-empty', text: 'Évolution disponible sous peu' });

    var W = 100;
    var H = 40;
    var values = points.map(function (p) { return p[key]; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var t0 = points[0].t;
    var t1 = points[points.length - 1].t;
    var x = function (p) { return ((p.t - t0) / (t1 - t0 || 1)) * W; };
    var y = function (p) { return 3 + (1 - (p[key] - min) / (max - min)) * (H - 6); };
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(p).toFixed(2) + ' ' + y(p).toFixed(2); }).join(' ');

    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Évolution sur ' + (t1 - t0 > 36e5 ? Math.round((t1 - t0) / 36e5) + ' heures' : 'la dernière heure') });
    root.append(svg('path', { class: 'area', d: d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z' }), svg('path', { class: 'line', d: d }));
    var cursor = svg('line', { class: 'cursor', x1: 0, x2: 0, y1: 0, y2: H, visibility: 'hidden' });
    root.append(cursor);

    var box = h('div', { class: 'spark' }, root);
    var dot = null;
    var tip = null;
    var hide = function () {
      cursor.setAttribute('visibility', 'hidden');
      if (dot) dot.remove();
      if (tip) tip.remove();
      dot = tip = null;
    };
    box.addEventListener('pointermove', function (e) {
      var rect = box.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      var target = t0 + ratio * (t1 - t0);
      var p = points.reduce(function (best, q) { return Math.abs(q.t - target) < Math.abs(best.t - target) ? q : best; });
      var px = (x(p) / W) * rect.width;
      var py = (y(p) / H) * rect.height;
      cursor.setAttribute('x1', x(p));
      cursor.setAttribute('x2', x(p));
      cursor.setAttribute('visibility', 'visible');
      if (!dot) box.append((dot = h('span', { class: 'dot' })));
      if (!tip) box.append((tip = h('div', { class: 'spark-tip' })));
      dot.style.left = px + 'px';
      dot.style.top = py + 'px';
      tip.style.left = Math.min(rect.width - 50, Math.max(50, px)) + 'px';
      tip.replaceChildren(h('strong', { text: fmt(p[key]) }), ' ' + unit + ' à ' + tf.format(p.t));
    });
    box.addEventListener('pointerleave', hide);
    return box;
  }

  // ---------- Fiche membre ----------

  var sheet = null;

  function openMember(m) {
    if (!sheet) {
      sheet = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
      sheet.addEventListener('click', function (e) {
        if (e.target === sheet) sheet.close();
      });
      document.body.append(sheet);
    }
    var top = m.r
      .map(function (id) { return rolesById.get(id); })
      .filter(Boolean)
      .sort(function (a, b) { return data.roles.indexOf(a) - data.roles.indexOf(b); });
    var coverEl = h('div', { class: 'sheet-cover' + (m.c ? ' colored' : '') });
    if (m.c) coverEl.style.backgroundColor = m.c;

    var handle = h('div', { class: 'handle' }, h('span', { text: m.u }));
    if (m.b) handle.append(h('span', { class: 'tag' }, icon('bot'), 'Bot'));
    if (data.presences && m.s) handle.append(h('span', { text: STATUS_LABEL[m.s] }));

    var facts = h('div', { class: 'facts' });
    if (m.j) facts.append(h('div', { class: 'fact' }, h('span', { text: 'Membre depuis' }), h('strong', { text: df.format(m.j) })));
    if (m.p) facts.append(h('div', { class: 'fact' }, h('span', { text: 'Booste depuis' }), h('strong', { text: df.format(m.p) })));

    var close = h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Fermer', onclick: function () { sheet.close(); } }, icon('close'));
    sheet.replaceChildren(
      coverEl,
      h(
        'div',
        { class: 'sheet-body' },
        h('div', { class: 'sheet-head' }, avatar(m, 'xl', true), close),
        h('h3', { id: 'sheet-title', text: m.n }),
        handle,
        facts.childNodes.length ? h('div', { class: 'sheet-section' }, facts) : null,
        h(
          'div',
          { class: 'sheet-section' },
          h('div', { class: 'sheet-label', text: top.length ? 'Rôles · ' + top.length : 'Rôles' }),
          top.length
            ? h('div', { class: 'chips' }, top.map(function (r) { return h('span', { class: 'chip' }, swatch(r.c), r.n); }))
            : h('p', { class: 'muted', text: 'Aucun rôle.' }),
        ),
      ),
    );
    if (!sheet.open) sheet.showModal();
  }

  // ---------- Vues ----------

  function viewOverview() {
    var g = data.guild;
    var s = data.stats;
    var nodes = [];

    var heroFallback = function () {
      return h('div', { class: 'hero-icon initials', 'aria-hidden': 'true', text: initial(g.name) });
    };
    var heroIcon = media(g.icon, '', 'hero-icon', heroFallback) || heroFallback();
    var meta = h(
      'div',
      { class: 'hero-meta' },
      h('span', null, icon('calendar'), 'Créé le ' + df.format(g.createdAt)),
      g.owner ? h('span', null, icon('crown'), g.owner) : null,
    );
    var cover = h('div', { class: 'hero-cover' }, media(g.banner, ''));
    nodes.push(
      h(
        'section',
        { class: 'hero-card' },
        cover,
        h(
          'div',
          { class: 'hero-body' },
          heroIcon,
          h('div', { class: 'hero-text' }, h('h1', { text: g.name }), g.description ? h('p', { class: 'lead', text: g.description }) : null, meta),
          g.invite ? h('div', { class: 'hero-actions' }, h('a', { class: 'button primary', href: g.invite, target: '_blank', rel: 'noopener noreferrer' }, 'Rejoindre le serveur', icon('external'))) : null,
        ),
      ),
    );

    var stat = function (iconName, label, value, sub, key, unit) {
      return h(
        'div',
        { class: 'stat' },
        h('div', { class: 'stat-label' }, icon(iconName), label),
        h('div', { class: 'stat-value', text: value == null ? 'n.c.' : fmt(value) }),
        sub ? h('div', { class: 'stat-sub', text: sub }) : null,
        key ? sparkline(key, unit) : null,
      );
    };
    nodes.push(
      h(
        'div',
        { class: 'stats' },
        stat('users', 'Membres', s.members, fmt(s.humans) + ' humains, ' + fmt(s.bots) + ' bots', 'm', 'membres'),
        stat('online', 'En ligne', s.online, s.members && s.online != null ? Math.round((s.online / s.members) * 100) + ' % des membres' : null, 'o', 'en ligne'),
        stat('volume', 'En vocal', s.inVoice, s.inVoice ? 'En ce moment' : 'Personne pour le moment'),
        stat('zap', 'Boosts', g.boosts, g.tier ? 'Niveau ' + g.tier : 'Aucun niveau atteint'),
      ),
    );

    // Activité
    var feedBody = data.feed.length
      ? h(
          'div',
          { class: 'panel-body' },
          data.feed.map(function (f) {
            var labels = { join: 'a rejoint le serveur', leave: 'a quitté le serveur', boost: 'a boosté le serveur' };
            var iconName = f.t === 'boost' ? 'zap' : f.t;
            return h(
              'div',
              { class: 'row' },
              avatar(f, 'sm'),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', { class: 'text', text: f.n })), h('div', { class: 'row-sub', text: labels[f.t] })),
              h('span', { class: 'feed-icon ' + f.t, title: labels[f.t] }, icon(iconName)),
              h('time', { class: 'row-aside', datetime: new Date(f.at).toISOString(), text: ago(f.at) }),
            );
          }),
        )
      : h('p', { class: 'empty', text: 'Aucune arrivée ni départ récent.' });

    // Vocal
    var voice = [];
    data.channels.forEach(function (group) {
      group.c.forEach(function (c) {
        if (c.v && c.v.length) voice.push(c);
      });
    });
    var voiceBody = voice.length
      ? h('div', { class: 'panel-body' }, voice.map(channelRow))
      : h('p', { class: 'empty', text: 'Aucun salon vocal occupé.' });

    // Équipe
    var staff = data.staff
      .map(function (st) {
        var m = membersById.get(st.id);
        return m ? { m: m, role: st.role } : null;
      })
      .filter(Boolean);
    var staffBody = staff.length
      ? h(
          'div',
          { class: 'panel-body' },
          staff.slice(0, 12).map(function (st) {
            return h(
              'div',
              { class: 'row' },
              avatar(st.m, 'sm', true),
              h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, h('span', { class: 'text', text: st.m.n })), h('div', { class: 'row-sub', text: st.role })),
            );
          }),
        )
      : h('p', { class: 'empty', text: 'Aucun membre du staff visible.' });

    var info = h(
      'dl',
      { class: 'info' },
      h('dt', { text: 'Salons' }),
      h('dd', { text: fmt(s.channels) }),
      h('dt', { text: 'Rôles' }),
      h('dd', { text: fmt(s.roles) }),
      h('dt', { text: 'Emojis' }),
      h('dd', { text: fmt(s.emojis) }),
      h('dt', { text: 'Vérification' }),
      h('dd', { text: VERIFICATION[g.verification] || 'Inconnue' }),
      g.vanity ? h('dt', { text: 'Invitation' }) : null,
      g.vanity ? h('dd', { text: 'discord.gg/' + g.vanity }) : null,
    );

    var right = [panel('Équipe', 'shield', fmt(staff.length), staffBody), panel('Informations', 'info', null, info)];
    if (data.emojis.length && Site.mediaAllowed()) {
      right.push(
        panel(
          'Emojis',
          'smile',
          fmt(s.emojis),
          h(
            'div',
            { class: 'emoji-grid' },
            data.emojis.map(function (e) {
              return h('img', { src: e.u, alt: ':' + e.n + ':', title: ':' + e.n + ':', loading: 'lazy', referrerpolicy: 'no-referrer' });
            }),
          ),
        ),
      );
    }

    nodes.push(
      h(
        'div',
        { class: 'columns' },
        h('div', { class: 'stack' }, panel('Activité', 'users', null, feedBody), panel('En vocal', 'volume', fmt(s.inVoice), voiceBody)),
        h('div', { class: 'stack' }, right),
      ),
    );
    return nodes;
  }

  // Membres : la barre d'outils est créée une seule fois pour garder le focus pendant la saisie
  var membersToolbar = null;
  var membersList = h('div');
  var roleSelect = null;
  var statusButtons = [];

  function buildMembersToolbar() {
    var input = h('input', {
      type: 'search',
      placeholder: 'Rechercher un membre',
      'aria-label': 'Rechercher un membre',
      autocomplete: 'off',
      spellcheck: 'false',
      oninput: function (e) {
        ui.query = e.target.value;
        ui.limit = 240;
        renderMembersList();
      },
    });
    roleSelect = h('select', {
      class: 'select',
      'aria-label': 'Filtrer par rôle',
      onchange: function (e) {
        ui.role = e.target.value;
        ui.limit = 240;
        renderMembersList();
      },
    });
    var seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filtrer par statut' });
    statusButtons = [
      ['all', 'Tous'],
      ['online', 'En ligne'],
      ['offline', 'Hors ligne'],
    ].map(function (pair) {
      var b = h('button', {
        type: 'button',
        'aria-pressed': String(ui.status === pair[0]),
        text: pair[1],
        onclick: function () {
          ui.status = pair[0];
          ui.limit = 240;
          statusButtons.forEach(function (x) {
            x.setAttribute('aria-pressed', String(x === b));
          });
          renderMembersList();
        },
      });
      seg.append(b);
      return b;
    });
    membersToolbar = h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), input, h('span', { class: 'kbd', 'aria-hidden': 'true', text: '/' })), seg, roleSelect);
    membersToolbar.input = input;
    membersToolbar.statusGroup = seg;
  }

  function syncRoleOptions() {
    var current = ui.role;
    var options = [h('option', { value: '', text: 'Tous les rôles' })];
    data.roles.forEach(function (r) {
      if (r.k) options.push(h('option', { value: r.id, text: r.n + ' (' + fmt(r.k) + ')' }));
    });
    roleSelect.replaceChildren.apply(roleSelect, options);
    if (current && !rolesById.has(current)) ui.role = '';
    roleSelect.value = ui.role;
  }

  function memberCard(m) {
    var title = h('div', { class: 'row-title' }, h('span', { class: 'text', text: m.n }));
    if (m.b) title.append(h('span', { class: 'tag' }, icon('bot'), 'Bot'));
    if (m.p) title.append(h('span', { class: 'boost', title: 'Booste le serveur depuis le ' + df.format(m.p) }, icon('zap', 'Booster')));
    var card = h(
      'button',
      { type: 'button', class: 'member', onclick: function () { openMember(m); } },
      avatar(m, null, true),
      h('div', { class: 'row-main' }, title, h('div', { class: 'row-sub', text: m.u })),
    );
    if (m.c) card.querySelector('.text').style.color = m.c;
    return card;
  }

  function renderMembersList() {
    var q = ui.query.trim().toLowerCase();
    var list = data.members.filter(function (m) {
      if (q && m.n.toLowerCase().indexOf(q) === -1 && m.u.toLowerCase().indexOf(q) === -1) return false;
      if (ui.role && m.r.indexOf(ui.role) === -1) return false;
      if (data.presences && ui.status !== 'all') {
        var on = m.s && m.s !== 'offline';
        if ((ui.status === 'online') !== on) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      return collator.compare(a.n, b.n);
    });

    // Regroupement façon Discord : rôles affichés séparément, puis membres en ligne, puis hors ligne
    var groups = new Map();
    var keyOf = function (m) {
      if (data.presences && (!m.s || m.s === 'offline')) return 'offline';
      return m.h && rolesById.has(m.h) ? m.h : 'members';
    };
    list.forEach(function (m) {
      var k = keyOf(m);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    });
    var order = data.roles
      .filter(function (r) { return r.h; })
      .map(function (r) { return r.id; })
      .concat(['members', 'offline']);

    var shown = 0;
    var nodes = [];
    order.forEach(function (k) {
      var items = groups.get(k);
      if (!items || shown >= ui.limit) return;
      var role = rolesById.get(k);
      var label = role ? role.n : k === 'offline' ? 'Hors ligne' : data.presences ? 'En ligne' : 'Membres';
      var slice = items.slice(0, ui.limit - shown);
      shown += slice.length;
      nodes.push(
        h(
          'section',
          { class: 'group' },
          h('h3', { class: 'group-head' }, swatch(role && role.c), label, h('span', { class: 'count', text: fmt(items.length) })),
          h('div', { class: 'member-grid' }, slice.map(memberCard)),
        ),
      );
    });

    if (!list.length) nodes.push(h('div', { class: 'state' }, icon('search'), h('p', { text: 'Aucun membre ne correspond à cette recherche.' })));
    if (list.length > shown) {
      nodes.push(
        h(
          'div',
          { class: 'more' },
          h('button', {
            type: 'button',
            class: 'button',
            text: 'Afficher plus (' + fmt(list.length - shown) + ' restants)',
            onclick: function () {
              ui.limit += 480;
              renderMembersList();
            },
          }),
        ),
      );
    }
    membersList.replaceChildren.apply(membersList, nodes);
    document.getElementById('members-count').textContent = fmt(list.length);
  }

  function viewMembers() {
    if (!membersToolbar) buildMembersToolbar();
    membersToolbar.statusGroup.hidden = !data.presences;
    syncRoleOptions();
    var hiddenCount = data.stats.members - data.members.length;
    var head = h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        null,
        h('h2', null, 'Membres ', h('span', { class: 'count', id: 'members-count' })),
        h('p', { class: 'lead', text: hiddenCount > 0 ? fmt(hiddenCount) + ' membres ne sont pas listés (choix personnel ou chargement en cours).' : 'Liste mise à jour en direct.' }),
      ),
    );
    var nodes = [head, membersToolbar, membersList];
    // renderMembersList a besoin que le compteur soit dans le document
    queueMicrotask(renderMembersList);
    return nodes;
  }

  var CHANNEL_ICON = { text: 'hash', news: 'news', forum: 'forum', voice: 'volume', stage: 'stage' };
  var CHANNEL_LABEL = { text: 'Salon textuel', news: 'Salon d\'annonces', forum: 'Forum', voice: 'Salon vocal', stage: 'Salon de conférence' };

  function channelRow(c) {
    var body = h('div', { class: 'row-main' }, h('div', { class: 'channel-name', text: c.n }));
    if (c.t) body.append(h('div', { class: 'channel-topic', text: c.t }));
    var aside = null;
    if (c.v) {
      if (c.v.length || c.l) aside = h('span', { class: 'row-aside', text: fmt(c.v.length) + (c.l ? ' / ' + fmt(c.l) : '') });
      var people = c.v
        .map(function (id) { return membersById.get(id); })
        .filter(Boolean);
      if (people.length) {
        body.append(
          h(
            'div',
            { class: 'voice-members' },
            people.map(function (m) {
              return h('div', { class: 'voice-member' }, avatar(m, 'xs'), h('span', { text: m.n }));
            }),
          ),
        );
      }
    }
    return h('div', { class: 'channel' }, icon(CHANNEL_ICON[c.k], CHANNEL_LABEL[c.k]), body, aside);
  }

  function viewChannels() {
    var total = data.channels.reduce(function (n, g) { return n + g.c.length; }, 0);
    return [
      h(
        'div',
        { class: 'page-head' },
        h('div', null, h('h2', null, 'Salons ', h('span', { class: 'count', text: fmt(total) })), h('p', { class: 'lead', text: 'Salons accessibles à tous les membres. Les salons privés ne sont pas affichés.' })),
      ),
      total
        ? h(
            'div',
            { class: 'channel-groups' },
            data.channels.map(function (g) {
              return panel(g.n || 'Sans catégorie', null, fmt(g.c.length), h('div', null, g.c.map(channelRow)));
            }),
          )
        : h('div', { class: 'state' }, icon('hash'), h('p', { text: 'Aucun salon public.' })),
    ];
  }

  function viewRoles() {
    var max = Math.max.apply(null, data.roles.map(function (r) { return r.k; }).concat([1]));
    var rows = data.roles.map(function (r) {
      var name = h('div', { class: 'role-name' }, swatch(r.c), media(r.i, ''), r.e && !r.i ? h('span', { text: r.e }) : null, h('span', { text: r.n }));
      var fill = h('span');
      fill.style.width = Math.max(r.k ? 2 : 0, Math.round((r.k / max) * 100)) + '%';
      if (r.c) fill.style.backgroundColor = r.c;
      var flags = h('div', { class: 'flags' });
      if (r.s) flags.append(h('span', { class: 'tag', title: 'Permissions de modération' }, icon('shield'), 'Staff'));
      if (r.m) flags.append(h('span', { class: 'tag', title: 'Rôle géré par une intégration' }, icon('bot'), 'Intégration'));
      return h(
        'tr',
        null,
        h('td', null, name),
        h('td', { class: 'col-bar' }, h('div', { class: 'bar', 'aria-hidden': 'true' }, fill)),
        h('td', { class: 'col-flags' }, flags),
        h('td', { class: 'num', text: fmt(r.k) }),
      );
    });
    return [
      h('div', { class: 'page-head' }, h('div', null, h('h2', null, 'Rôles ', h('span', { class: 'count', text: fmt(data.roles.length) })), h('p', { class: 'lead', text: 'Du plus haut au plus bas dans la hiérarchie.' }))),
      h(
        'section',
        { class: 'panel' },
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, h('th', { text: 'Rôle' }), h('th', { class: 'col-bar' }, h('span', { class: 'sr-only', text: 'Répartition' })), h('th', null, h('span', { class: 'sr-only', text: 'Type' })), h('th', { class: 'num', text: 'Membres' }))),
            h('tbody', null, rows),
          ),
        ),
      ),
    ];
  }

  var VIEWS = { apercu: viewOverview, membres: viewMembers, salons: viewChannels, roles: viewRoles };

  // ---------- Rendu ----------

  function renderShell() {
    document.querySelectorAll('.nav a').forEach(function (a) {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (!data) return;
    var g = data.guild;
    brandName.textContent = g.name;
    document.title = (route === 'apercu' ? '' : ROUTES[route] + ' · ') + g.name;
    var brandFallback = function () {
      return h('span', { class: 'brand-icon brand-fallback', 'aria-hidden': 'true', text: initial(g.name) });
    };
    brandIcon.replaceChildren(media(g.icon, '', 'brand-icon', brandFallback) || brandFallback());
  }

  function render() {
    renderShell();
    if (!data) return;
    membersById = new Map(data.members.map(function (m) { return [m.id, m]; }));
    rolesById = new Map(data.roles.map(function (r) { return [r.id, r]; }));
    var nodes = VIEWS[route]();
    var wrap = h('div', { class: 'wrap' }, nodes);
    main.replaceChildren(wrap);
  }

  function showState(iconName, text) {
    main.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'state' }, icon(iconName), h('p', { text: text }))));
  }

  function setLive(state) {
    liveEl.dataset.state = state;
    liveEl.textContent = state === 'live' ? 'En direct' : 'Reconnexion';
  }

  // ---------- Données ----------

  var loading = false;
  var again = false;

  function load() {
    if (loading) {
      again = true;
      return;
    }
    loading = true;
    var headers = etag ? { 'If-None-Match': etag } : {};
    fetch('/api/snapshot', { headers: headers, cache: 'no-cache' })
      .then(function (res) {
        if (res.status === 304) return null;
        if (!res.ok) throw new Error(res.status);
        etag = res.headers.get('ETag');
        return res.json();
      })
      .then(function (json) {
        if (json) {
          var first = !data;
          data = json;
          if (first || route !== 'membres' || !membersToolbar) render();
          else refreshMembers();
        }
      })
      .catch(function () {
        if (!data) showState('offline', 'Le serveur démarre. Nouvel essai dans quelques secondes.');
        setTimeout(load, 4000);
      })
      .finally(function () {
        loading = false;
        if (again) {
          again = false;
          load();
        }
      });
  }

  // Sur la page Membres, on ne reconstruit que la liste pour ne pas perdre la saisie
  function refreshMembers() {
    renderShell();
    membersById = new Map(data.members.map(function (m) { return [m.id, m]; }));
    rolesById = new Map(data.roles.map(function (r) { return [r.id, r]; }));
    if (!document.body.contains(membersToolbar)) return render();
    syncRoleOptions();
    renderMembersList();
  }

  function connect() {
    if (!window.EventSource) {
      setInterval(load, 15000);
      setLive('live');
      return;
    }
    var source = new EventSource('/api/events');
    source.addEventListener('open', function () {
      setLive('live');
    });
    source.addEventListener('update', function () {
      setLive('live');
      load();
    });
    source.addEventListener('error', function () {
      setLive('offline');
    });
  }

  function readRoute() {
    var key = location.hash.replace('#', '');
    route = ROUTES[key] ? key : 'apercu';
  }

  window.addEventListener('hashchange', function () {
    readRoute();
    render();
    window.scrollTo(0, 0);
  });

  Site.onChoice(render);

  // « / » ouvre la recherche de membres
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (sheet && sheet.open)) return;
    e.preventDefault();
    if (route !== 'membres') location.hash = 'membres';
    setTimeout(function () {
      if (membersToolbar) membersToolbar.input.focus();
    }, 0);
  });

  // Met à jour les durées relatives (« il y a 3 minutes ») sans recharger les données
  setInterval(function () {
    document.querySelectorAll('time[datetime]').forEach(function (t) {
      t.textContent = ago(Date.parse(t.getAttribute('datetime')));
    });
  }, 30000);

  readRoute();
  renderShell();
  load();
  connect();
})();
