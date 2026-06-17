// ── HASH NAVIGATION ─────────────────────────────────────────
// Keeps the URL in sync so reloading lands on the same section.

let _hashPaused = false;

function _setHash(h) {
  if (_hashPaused) return;
  history.replaceState(null, '', '#' + h);
}

function _restoreHash() {
  const hash = (location.hash || '').replace('#', '').trim();
  if (!hash) return;
  const [section, sub] = hash.split('/');
  try {
    if (section === 'tablero' && sub) { selectBoard(sub); return; }
    if (section === 'configuracion') {
      showSettingsPage();
      if (sub) switchSettingsTab(sub);
      return;
    }
    if (section === 'papelera')    { showTrashPage();         return; }
    if (section === 'scripts')     { showScriptsPage();       return; }
    if (section === 'mensajes')    { showConversationsPage(); return; }
    if (section === 'actividad')   { showActivityPage();      return; }
    if (section === 'calendario')  { showCalendarPage();      return; }
    if (section === 'estadisticas'){ showStatsPage();         return; }
    if (section === 'reconciliar') { showReconcilePage();     return; }
  } catch(e) { console.warn('hash restore error', e); }
}

// Patch each navigation function to update hash
(function() {
  const orig = {};

  function wrap(name, hashFn) {
    if (typeof window[name] !== 'function') return;
    orig[name] = window[name];
    window[name] = function(...args) {
      const result = orig[name].apply(this, args);
      _setHash(hashFn(...args));
      return result;
    };
  }

  wrap('selectBoard',          id  => 'tablero/' + id);
  wrap('showTrashPage',        ()  => 'papelera');
  wrap('showScriptsPage',      ()  => 'scripts');
  wrap('showConversationsPage',()  => 'mensajes');
  wrap('showActivityPage',     ()  => 'actividad');
  wrap('showCalendarPage',     ()  => 'calendario');
  wrap('showStatsPage',        ()  => 'estadisticas');
  wrap('showReconcilePage',    ()  => 'reconciliar');

  // Settings: patch switchSettingsTab (called inside showSettingsPage)
  if (typeof switchSettingsTab === 'function') {
    const origTab = switchSettingsTab;
    window.switchSettingsTab = function(tab) {
      const result = origTab.apply(this, arguments);
      _setHash('configuracion/' + tab);
      return result;
    };
  }

  // Hook initApp to restore hash after app loads
  if (typeof initApp === 'function') {
    const origInit = initApp;
    window.initApp = function(user) {
      const result = origInit.apply(this, arguments);
      // Small delay so all show/select calls from initApp settle first
      setTimeout(_restoreHash, 120);
      return result;
    };
  }
})();
