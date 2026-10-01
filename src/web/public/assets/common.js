/*
 * Éléments communs à toutes les pages : icônes, choix de l'utilisateur sur le contenu Discord.
 *
 * Le site ne dépose aucun cookie. Le seul élément enregistré dans le navigateur est le choix
 * de l'utilisateur (accepté ou refusé), en stockage local, pour ne pas reposer la question
 * à chaque visite. Il n'est jamais envoyé au serveur.
 */
(function () {
  'use strict';

  var ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    online: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    news: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    forum: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    stage: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    crown: '<path d="m2 6 4 12h12l4-12-6 5-4-7-4 7-6-5z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    bot: '<rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8M2 14h2M20 14h2M15 13v2M9 13v2"/>',
    join: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    leave: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11h-6"/>',
    tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    external: '<path d="M7 17 17 7M7 7h10v10"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    offline: '<path d="M2 2l20 20M8.5 16.43a5 5 0 0 1 7 0M5 12.86a10 10 0 0 1 5.17-2.69M19 12.86a10 10 0 0 0-2-1.52M2 8.82a15 15 0 0 1 4.18-2.64M22 8.82a15 15 0 0 0-11.29-3.76M12 20h.01"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  };

  function icon(name, label) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  // ---------- Choix sur le contenu tiers (images hébergées par Discord) ----------
  var KEY = 'choix_images';
  var MAX_AGE = 1000 * 60 * 60 * 24 * 182; // 6 mois, puis la question est reposée

  function readChoice() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (typeof data.media !== 'boolean' || Date.now() - data.at > MAX_AGE) return null;
      return data.media;
    } catch (e) {
      return null;
    }
  }

  var choice = readChoice();
  var listeners = [];

  function setChoice(value) {
    choice = value;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ media: value, at: Date.now() }));
    } catch (e) {
      // Stockage indisponible : le choix vaut pour cette visite seulement
    }
    closeBanner();
    listeners.forEach(function (fn) {
      fn(value);
    });
  }

  var banner = null;

  function closeBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function openBanner() {
    if (banner) return;
    banner = document.createElement('section');
    banner.className = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'consent-title');

    var title = document.createElement('h2');
    title.id = 'consent-title';
    title.textContent = 'Images hébergées par Discord';

    var text = document.createElement('p');
    text.textContent =
      'Ce site n\'utilise ni cookie ni outil de mesure d\'audience. Les avatars et images du serveur sont chargés depuis Discord, ce qui lui transmet votre adresse IP. Sans votre accord, ils sont remplacés par des initiales.';

    var actions = document.createElement('div');
    actions.className = 'consent-actions';

    var more = document.createElement('a');
    more.href = '/cookies';
    more.textContent = 'En savoir plus';

    var refuse = document.createElement('button');
    refuse.type = 'button';
    refuse.className = 'button';
    refuse.textContent = 'Refuser';
    refuse.addEventListener('click', function () {
      setChoice(false);
    });

    var accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'button';
    accept.textContent = 'Accepter';
    accept.addEventListener('click', function () {
      setChoice(true);
    });

    actions.append(more, refuse, accept);
    banner.append(title, text, actions);
    document.body.appendChild(banner);
  }

  function boot() {
    if (choice === null) openBanner();
    document.querySelectorAll('[data-consent-open]').forEach(function (el) {
      el.addEventListener('click', openBanner);
    });
  }

  window.Site = {
    icon: icon,
    mediaAllowed: function () {
      return choice === true;
    },
    choice: function () {
      return choice;
    },
    setChoice: setChoice,
    onChoice: function (fn) {
      listeners.push(fn);
    },
    openBanner: openBanner,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
