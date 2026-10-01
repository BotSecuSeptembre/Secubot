(function () {
  'use strict';
  var state = document.getElementById('choice-state');
  function show() {
    var c = window.Site.choice();
    state.textContent = c === true ? 'Images Discord acceptées.' : c === false ? 'Images Discord refusées.' : 'Aucun choix enregistré.';
  }
  document.getElementById('choice-accept').addEventListener('click', function () {
    window.Site.setChoice(true);
  });
  document.getElementById('choice-refuse').addEventListener('click', function () {
    window.Site.setChoice(false);
  });
  window.Site.onChoice(show);
  show();
})();
