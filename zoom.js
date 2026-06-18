// ════════════════════════════════════════════
//  ZOOM INTEGRATION
// ════════════════════════════════════════════
function _isZoomDev() {
  const s = getSession();
  return s?.email === 'gonzalezluis@grupoelitework.com';
}

// Any logged-in non-master user can connect and use Zoom
function _canUseZoom() {
  const s = getSession();
  return !!(s && s.role !== 'master');
}

// Show call button only when the current user has Zoom connected
function _zoomConnected() {
  return !!(_zoomStatus?.connected);
}

async function pingConnections() {
  const setDot = (id, msId, state, ms) => {
    const dot = document.getElementById(id);
    const msEl = document.getElementById(msId);
    if (!dot) return;
    dot.style.background = state === 'ok' ? '#22c55e' : state === 'checking' ? '#f59e0b' : '#ef4444';
    if (msEl) msEl.textContent = ms != null ? ms + ' ms' : state === 'checking' ? '…' : 'error';
  };

  setDot('conn-dot-supa', 'conn-ms-supa', 'checking', null);
  setDot('conn-dot-gh',   'conn-ms-gh',   'checking', null);

  // Ping Supabase
  try {
    const t0 = Date.now();
    const r = await fetch(`${SUPA_URL}/rest/v1/kv_store?limit=1`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const ms = Date.now() - t0;
    setDot('conn-dot-supa', 'conn-ms-supa', r.ok ? 'ok' : 'error', ms);
  } catch { setDot('conn-dot-supa', 'conn-ms-supa', 'error', null); }

  // Ping GitHub
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.github.com', { method: 'HEAD', mode: 'no-cors' });
    const ms = Date.now() - t0;
    // no-cors always "succeeds" if reachable — treat as ok
    setDot('conn-dot-gh', 'conn-ms-gh', 'ok', ms);
  } catch { setDot('conn-dot-gh', 'conn-ms-gh', 'error', null); }
}

let _connPingInterval = null;
function startConnectionPing() {
  pingConnections();
  if (_connPingInterval) clearInterval(_connPingInterval);
  _connPingInterval = setInterval(pingConnections, 60_000);
}

function showConnectionsPage() {
  showBoardView();
  document.getElementById('connections-page').style.display = 'flex';
  document.getElementById('table-wrap').style.display  = 'none';
  document.getElementById('toolbar').style.display     = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.querySelectorAll('.board-item,.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-connections').classList.add('active');
  checkAllConnections();
}

async function checkAllConnections() {
  const grid = document.getElementById('connections-grid');
  if (!grid) return;

  const now = () => new Date().toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  const services = [
    { id:'supa',       icon:'🗄️',  bg:'#1a3a5c', name:'Supabase',         url: SUPA_URL },
    { id:'github',     icon:'🐙',  bg:'#24292f', name:'GitHub',            url:'https://github.com/gonzalezluis-png/GrupoEliteWork-CRM' },
    { id:'zoom',       icon:'📹',  bg:'#2D5BE3', name:'Zoom Phone',        url:'https://zoom.us' },
    { id:'twilio',     icon:'💬',  bg:'#e53935', name:'Twilio',            url:'https://twilio.com' },
    { id:'stripe',     icon:'💳',  bg:'#635bff', name:'Stripe',            url:'https://stripe.com' },
    { id:'anthropic',  icon:'✨',  bg:'#5436DA', name:'Claude (Anthropic)',url:'https://anthropic.com' },
  ];

  // Render skeleton cards first
  grid.innerHTML = services.map(s => `
    <div class="conn-card" id="conn-card-${s.id}">
      <div class="conn-card-header">
        <div class="conn-card-icon" style="background:${s.bg}">${s.icon}</div>
        <div style="min-width:0;flex:1">
          <div class="conn-card-title">${s.name}</div>
          <div class="conn-card-url">${s.url}</div>
        </div>
        <div class="conn-status-badge chk" id="conn-badge-${s.id}">● Verificando…</div>
      </div>
      <div class="conn-card-body" id="conn-body-${s.id}">
        <div style="color:var(--text2);font-size:12px">Conectando…</div>
      </div>
      <div class="conn-card-footer">
        <span class="conn-latency" id="conn-latency-${s.id}">—</span>
        <span class="conn-last-checked" id="conn-time-${s.id}">—</span>
      </div>
    </div>`).join('');

  const setStatus = (id, ok, ms, details) => {
    const badge   = document.getElementById(`conn-badge-${id}`);
    const latency = document.getElementById(`conn-latency-${id}`);
    const timeEl  = document.getElementById(`conn-time-${id}`);
    const body    = document.getElementById(`conn-body-${id}`);
    if (badge) {
      badge.className = `conn-status-badge ${ok ? 'ok' : 'err'}`;
      badge.textContent = ok ? '● En línea' : '● Sin conexión';
    }
    if (latency) latency.textContent = ms != null ? `${ms} ms` : '';
    if (timeEl)  timeEl.textContent  = `Verificado ${now()}`;
    if (body && details) {
      body.innerHTML = details.map(d =>
        `<div class="conn-detail-row"><span class="conn-detail-label">${d.label}</span><span class="conn-detail-val">${d.value}</span></div>`
      ).join('');
    }
  };

  // ── Supabase ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch(`${SUPA_URL}/rest/v1/kv_store?limit=1`, {
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
      });
      const ms = Date.now() - t0;
      const rows = await r.json();
      setStatus('supa', r.ok, ms, [
        { label:'Proyecto',  value: SUPA_URL.split('//')[1].split('.')[0] },
        { label:'URL',       value: SUPA_URL },
        { label:'Registros', value: Array.isArray(rows) ? `${rows.length} row(s) en kv_store` : 'OK' },
        { label:'Latencia',  value: ms + ' ms' },
      ]);
    } catch(e) { setStatus('supa', false, null, [{ label:'Error', value: e.message }]); }
  })();

  // ── GitHub ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch('https://api.github.com/repos/gonzalezluis-png/GrupoEliteWork-CRM', { mode:'cors' });
      const ms = Date.now() - t0;
      const d  = await r.json();
      setStatus('github', r.ok, ms, [
        { label:'Repo',        value: d.full_name || 'gonzalezluis-png/GrupoEliteWork-CRM' },
        { label:'Branch',      value: d.default_branch || 'main' },
        { label:'Último push', value: d.pushed_at ? new Date(d.pushed_at).toLocaleString('es-US') : '—' },
        { label:'Visibilidad', value: d.private ? 'Privado 🔒' : 'Público 🌐' },
      ]);
    } catch(e) { setStatus('github', false, null, [{ label:'Error', value: e.message }]); }
  })();

  // ── Zoom (status page) ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch('https://status.zoom.us/api/v2/status.json');
      const ms = Date.now() - t0;
      const d  = await r.json();
      const ok = d.status?.indicator === 'none' || d.status?.indicator === 'minor';
      setStatus('zoom', ok, ms, [
        { label:'Estado',      value: d.status?.description || '—' },
        { label:'Indicador',   value: d.status?.indicator   || '—' },
        { label:'App OAuth',   value: ZOOM_CLIENT_ID },
        { label:'Redirect',    value: ZOOM_REDIRECT },
      ]);
    } catch(e) { setStatus('zoom', false, null, [{ label:'Error', value: e.message }]); }
  })();

  // ── Twilio (status page) ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch('https://status.twilio.com/api/v2/status.json');
      const ms = Date.now() - t0;
      const d  = await r.json();
      const ok = d.status?.indicator === 'none' || d.status?.indicator === 'minor';
      setStatus('twilio', ok, ms, [
        { label:'Estado',    value: d.status?.description || '—' },
        { label:'Indicador', value: d.status?.indicator   || '—' },
        { label:'Webhook',   value: `${SUPA_FN_URL}/twilio-webhook` },
        { label:'Mensajes',  value: 'SMS / Conversations API' },
      ]);
    } catch(e) { setStatus('twilio', false, null, [{ label:'Error', value: e.message }]); }
  })();

  // ── Stripe (status page) ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch('https://status.stripe.com/api/v2/status.json');
      const ms = Date.now() - t0;
      const d  = await r.json();
      const ok = d.status?.indicator === 'none' || d.status?.indicator === 'minor';
      setStatus('stripe', ok, ms, [
        { label:'Estado',    value: d.status?.description || '—' },
        { label:'Indicador', value: d.status?.indicator   || '—' },
        { label:'Checkout',  value: `${SUPA_FN_URL}/create-checkout` },
        { label:'Uso',       value: 'Facturación / auto-recarga' },
      ]);
    } catch(e) { setStatus('stripe', false, null, [{ label:'Error', value: e.message }]); }
  })();

  // ── Anthropic/Claude ──
  (async () => {
    try {
      const t0 = Date.now();
      const r = await fetch(`${SUPA_FN_URL}/claude-enrich`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ task:'complete_addresses', data:[{ idx:0, direccion:'77001', ubicacion:'' }] }),
      });
      const ms = Date.now() - t0;
      const d  = await r.json();
      const ok = r.ok && !d.error;
      setStatus('anthropic', ok, ms, [
        { label:'Modelo',    value: 'claude-haiku-4-5-20251001' },
        { label:'Función',   value: `${SUPA_FN_URL}/claude-enrich` },
        { label:'Uso',       value: 'Completar direcciones con IA' },
        { label:'Estado API',value: ok ? 'Respondiendo ✓' : (d.error || 'Error') },
      ]);
    } catch(e) { setStatus('anthropic', false, null, [{ label:'Error', value: e.message }]); }
  })();
}
const ZOOM_CLIENT_ID  = 'XW9e43_3Ro2nY8dcHl_BUg';
const ZOOM_REDIRECT   = 'https://lead.grupoelitework.com';
const SUPA_FN_URL     = 'https://vpwbczzmonboirjckpmy.supabase.co/functions/v1';
let _zoomStatus = null; // { connected, email, name, phone }

async function _loadZoomStatus() {
  const session = getSession();
  if (!session || session.role === 'master') { _zoomStatus = { connected: false }; return; }
  try {
    const { data } = await supa.from('kv_store').select('value')
      .eq('key', `gew_zoom_token_${session.id}`).maybeSingle();
    if (data?.value) {
      const t = JSON.parse(data.value);
      _zoomStatus = { connected: true, email: t.zoom_email, name: t.zoom_name, phone: t.zoom_phone };
    } else {
      _zoomStatus = { connected: false };
    }
  } catch(_) { _zoomStatus = { connected: false }; }
}

function connectZoom() {
  const session = getSession();
  if (!session) return;
  const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${ZOOM_CLIENT_ID}&redirect_uri=${encodeURIComponent(ZOOM_REDIRECT)}&state=${session.id}`;
  window.location.href = url;
}

async function disconnectZoom() {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${SUPA_FN_URL}/zoom-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', userId: session.id }),
    });
    _zoomStatus = { connected: false };
    _renderZoomCard();
    showToast('Zoom desconectado', 'success');
  } catch(e) { showToast('Error al desconectar', 'error'); }
}

async function _handleZoomOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  if (!code) return;
  history.replaceState(null, '', window.location.pathname + window.location.hash);
  const session = getSession();
  if (!session) { showToast('Inicia sesión primero para conectar Zoom', 'error'); return; }
  showToast('Conectando con Zoom…', 'success');
  try {
    const res  = await fetch(`${SUPA_FN_URL}/zoom-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, userId: session.id }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error');
    _zoomStatus = { connected: true, email: data.zoom_email, name: data.zoom_name, phone: data.zoom_phone };
    showToast(`✅ Zoom conectado: ${data.zoom_email}`, 'success');
    _renderZoomCard();
  } catch(e) { showToast('Error conectando Zoom: ' + e.message, 'error'); }
}

function _renderZoomCard() {
  const el = document.getElementById('zoom-card-body');
  if (!el) return;
  if (_zoomStatus?.connected) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:10px;background:#2D8CFF;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📹</div>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${esc(_zoomStatus.name || _zoomStatus.email)}</div>
          <div style="font-size:11px;color:var(--text2)">${esc(_zoomStatus.email)}</div>
          <div style="font-size:11px;color:${_zoomStatus.phone ? 'var(--green)' : 'var(--yellow)'}">${_zoomStatus.phone ? esc(_zoomStatus.phone) : 'Sin número Zoom Phone asignado'}</div>
        </div>
        <span style="margin-left:auto;background:rgba(0,200,117,.1);color:var(--green);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">● Conectado</span>
      </div>
      <button onclick="disconnectZoom()" style="background:transparent;border:1px solid var(--border);color:var(--red);border-radius:8px;padding:6px 14px;font-family:var(--font);font-size:11px;font-weight:600;cursor:pointer">Desconectar Zoom</button>`;
  } else {
    el.innerHTML = `
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6">
        Conecta tu cuenta Zoom para hacer llamadas directamente desde el CRM y recibir logs automáticos (duración, resultado, hora).
      </div>
      <button onclick="connectZoom()" style="background:#2D8CFF;border:none;color:#fff;border-radius:8px;padding:8px 18px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px">
        <span>📹</span> Conectar mi cuenta Zoom
      </button>`;
  }
}

async function zoomCall(leadId, phoneNumber, boardId) {
  const session = getSession();
  if (!session) return;
  if (!_zoomStatus?.connected) {
    showToast('Ve a Configuración → Mi Cuenta → Conectar Zoom primero', 'error'); return;
  }
  showToast(`📞 Iniciando llamada a ${phoneNumber}…`, 'success');
  try {
    const lead = loadLeads(boardId).find(l => l.id === leadId);
    const res  = await fetch(`${SUPA_FN_URL}/zoom-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.id, phoneNumber, leadId, leadName: lead?.nombre || '', boardId }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error');
    showToast(`📞 Zoom está marcando a ${phoneNumber}`, 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function zoomCallFromPanel() {
  const lead = _notesBoardId ? loadLeads(_notesBoardId).find(l => l.id === _notesLeadId) : null;
  if (!lead?.telefono) return;
  const ph = lead.telefono.replace(/\D/g,'').replace(/^(\d{10})$/,'+1$1').replace(/^1(\d{10})$/,'+1$1') || lead.telefono;
  window.location.href = `zoomus://zoom.us/call?callee=${encodeURIComponent(ph)}`;
}

function _renderCallsPane() {
  const lead = _notesBoardId ? loadLeads(_notesBoardId).find(l => l.id === _notesLeadId) : null;
  const calls = lead ? JSON.parse(lead._calls || '[]') : [];
  const journal = document.getElementById('calls-journal');
  const status  = document.getElementById('zoom-call-status');
  if (status) status.textContent = _zoomStatus?.connected ? `Conectado: ${_zoomStatus.email}` : '⚠ Zoom no conectado — ve a Mi Cuenta';
  if (!journal) return;
  if (calls.length === 0) {
    journal.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:12px;padding:32px 20px">Sin llamadas registradas aún</div>`;
    return;
  }
  const COLORS = { 'Conectó':'var(--green)', 'No contestó':'var(--yellow)', 'Buzón de voz':'#a78bfa', 'Ocupado':'var(--red)', 'Cancelado':'var(--text2)' };
  journal.innerHTML = calls.map(c => {
    const date  = c.date ? new Date(c.date).toLocaleString('es', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    const dur   = c.duration != null ? (Math.floor(c.duration/60) + 'm ' + (c.duration%60) + 's') : '—';
    const color = COLORS[c.result] || 'var(--text2)';
    return `<div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700;color:${color}">📞 ${esc(c.result || '—')}</span>
        <span style="font-size:11px;color:var(--text2)">${date}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);display:flex;flex-wrap:wrap;gap:10px">
        <span>⏱ ${dur}</span>
        <span>${c.direction === 'outbound' ? '↗ Saliente' : '↙ Entrante'}</span>
        ${c.autoLogged ? '<span style="color:var(--green)">✓ Auto-registrado</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function initApp(user) {
  logActivity('login', 'Inicio de sesión', `Accedió como ${({ master:'Desarrollador', admin:'Administrador', manager:'GA', master_manager:'MGA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' }[user.role] || user.role)}`);
  if (typeof showWelcomeSplash === 'function') showWelcomeSplash(user);
  renderTopbarUser(user);
  applyAppName();
  // restore persisted column widths
  const _cwCfg = loadColConfig();
  if (_cwCfg.widths) Object.assign(COL_WIDTHS, _cwCfg.widths);
  refreshBoards();
  document.getElementById('btn-scripts-panel').style.display = 'inline-flex';
  if (user.role === 'agent') {
    document.getElementById('sidebar').style.display = '';
    document.getElementById('board-list').style.display = 'none';
    document.getElementById('f-asignado').style.display = 'none';
    document.getElementById('sidebar-agent').style.display = 'block';
    document.getElementById('sidebar-scripts').style.display = 'block';
    const _navRefAg = document.getElementById('nav-referidos-agent');
    if (_navRefAg) _navRefAg.style.display = '';
    showAgentView();
  } else {
    document.getElementById('sidebar').style.display = '';
    loadNewLeadsFlags().then(() => { renderSidebar(); showNewLeadsNotification(); });
    populateAgentFilter();
    populateLeadFilter();
    if (user.role === 'admin' || user.role === 'master') {
      document.getElementById('sidebar-admin').style.display = 'block';
      document.getElementById('assign-strip').classList.remove('hidden');
    }
    // MGA/GA/SA: show sidebar-admin but hide admin-only items
    if (user.role === 'master_manager' || user.role === 'manager' || user.role === 'supervisor_agent') {
      document.getElementById('sidebar-admin').style.display = 'block';
      ['nav-trash','nav-activity','nav-credits'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
      });
      document.getElementById('assign-strip').classList.add('hidden');
    }
    // Caller: sees boards but NO admin sidebar, NO assign strip
    if (user.role === 'caller') {
      document.getElementById('assign-strip').classList.add('hidden');
    }
    // Digitalización de Referidos visible for all non-agent roles via sidebar-admin item
    const _navRefAdmin = document.getElementById('nav-referidos-admin');
    if (_navRefAdmin) _navRefAdmin.style.display = '';
    // All non-agent roles see Scripts de Llamada
    document.getElementById('sidebar-scripts').style.display = 'block';
    if (user.role === 'master') {
      document.getElementById('sidebar-master').style.display = 'block';
    }
    if (user.role === 'master') {
      document.getElementById('conn-status-widget').style.display = 'block';
      startConnectionPing();
      document.getElementById('sidebar-conversations').style.display = 'block';
      document.body.classList.add('show-emblems');
      const navCrd = document.getElementById('nav-credits');
      if (navCrd) navCrd.style.display = '';
      const navRec = document.getElementById('nav-reconcile');
      if (navRec) navRec.style.display = '';
      const navImp = document.getElementById('nav-import');
      if (navImp) navImp.style.display = '';
      const navRef = document.getElementById('nav-referidos');
      if (navRef) { navRef.style.display = ''; const emb = navRef.querySelector('.emblem-dev'); if (emb) emb.remove(); }
      const navCon = document.getElementById('nav-connections');
      if (navCon) navCon.style.display = '';
      // Dev-only sidebar shortcuts (also show for admin)
      if (_isZoomDev() || user.role === 'admin') {
        const devUsers = document.getElementById('nav-dev-users');
        const devMsg   = document.getElementById('nav-dev-messaging');
        if (devUsers) devUsers.style.display = '';
        if (devMsg)   devMsg.style.display   = '';
      }
    }
    selectBoard('dallas');
  }
  applyToolbarGap();
  initToolbarGapHandle();
  initRealtimeSync();
  // Assign GEW-XXX codes to users that don't have one yet
  if (!SYSTEM_FROZEN) {
    if (user.role === 'master') assignUserCodes().catch(() => {});
    if (user.role === 'master' || user.role === 'admin') _backfillAsignadoId().catch(() => {});
    _backfillTipo().catch(() => {});
  }
  if (typeof _initFreezeUI === 'function') _initFreezeUI();
}

function showAgentView() {
  const session = getSession();
  currentBoardId = '__agent__';
  showBoardView();
  document.getElementById('board-title').textContent = 'Mis Leads';
  document.querySelectorAll('#sidebar-agent .sidebar-item').forEach(el => el.classList.remove('active'));
  const navMl = document.getElementById('nav-mis-leads');
  if (navMl) navMl.classList.add('active');
  const banner = document.getElementById('agent-org-banner');
  if (banner) {
    banner.style.display = 'block';
    document.getElementById('agent-org-name').textContent = loadAppName();
  }
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('btn-new-lead').style.display   = '';
  document.getElementById('btn-export').style.display     = 'none';
  document.getElementById('btn-scripts-panel').style.display = 'inline-flex';
  // build header using default board columns
  const board = BOARDS[0];
  const cols  = getColumns(board);
  const thead = document.getElementById('thead-row');
  thead.innerHTML = cols.map(c =>
    c.key === '_check'
      ? `<th class="th-check" style="width:36px"><input type="checkbox" class="header-checkbox" id="check-all" onchange="toggleSelectAll(this)" /></th>`
      : `<th style="width:${COL_WIDTHS[c.key]||130}px">${c.label}</th>`
  ).join('');
  applyFilters();
}

function loadAppName() {
  return localStorage.getItem('gew_appname') || 'GRUPO ELITE WORK';
}

// ════════════════════════════════════════════
