//  INIT
// ════════════════════════════════════════════
(async () => {
  const syncEl  = document.getElementById('sync-overlay');
  const syncMsg = document.getElementById('sync-msg');

  try {
    syncMsg.textContent = 'Sincronizando datos…';
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
    await Promise.race([loadFromSupabase(), timeout]);
    syncMsg.textContent = 'Listo';
  } catch(e) {
    syncMsg.textContent = 'Sin conexión — usando datos locales';
  }

  syncEl.classList.add('hidden');
  applyToolbarGap();

  // Modo preview: "Ver como" abierto desde org chart del master
  const _isPreview = await _initPreviewMode();

  await seedDefaultAdmin();
  await seedAlexanderAgents();
  await seedAlexanderAgentsV2();
  refreshBoards();
  seedTestLeads();
  // show org name on login screen
  const _loginOrgEl = document.getElementById('login-org-name');
  if (_loginOrgEl) _loginOrgEl.textContent = loadAppName();
  if (!_isPreview) initGoogleSignIn();
  const _session = getSession();
  if (_session) {
    document.getElementById('login-screen').classList.add('hidden');
    initApp(_session);
    updatePendingBadge();
    updateFeedbackBadge();
    // Handle Zoom OAuth callback if redirected back from Zoom
    if (window.location.search.includes('code=')) _handleZoomOAuthCallback();
    // Pre-load Zoom status for call buttons
    _loadZoomStatus();
  } else {
    // Handle Zoom OAuth callback before login — unlikely but safe
    if (window.location.search.includes('code=')) {
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
    populateAgentFilter();
    populateLeadFilter();
  }
})();
