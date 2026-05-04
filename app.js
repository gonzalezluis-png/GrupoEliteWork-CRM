// ════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════
function getAgents() {
  const users   = loadUsers();
  const session = getSession();
  // Master sees everyone; other roles scoped to their line
  if (!session || session.role === 'master') {
    return users.filter(u => !u.inactive).map(u => u.name);
  }
  let agents = users.filter(u => !u.inactive);
  if (session.role === 'admin') {
    agents = agents.filter(u => u.orgAdminId === session.id);
  } else if (session.role === 'caller') {
    agents = agents.filter(u => u.orgAdminId === session.orgAdminId);
  } else if (session.role === 'master_manager') {
    const names = getMasterManagerAgentNames(session.id);
    agents = agents.filter(u => names.includes(u.name));
  } else if (session.role === 'manager') {
    const names = getManagerAgentNames(session.id);
    agents = agents.filter(u => names.includes(u.name));
  } else if (session.role === 'supervisor_agent') {
    const names = getSupervisorAgentNames(session.id);
    agents = agents.filter(u => names.includes(u.name));
  } else {
    agents = agents.filter(u => u.role === 'agent');
  }
  return agents.map(u => u.name);
}

function getSupervisorAgentNames(supId) {
  return loadUsers()
    .filter(u => u.role === 'agent' && u.orgSupervisorId === supId)
    .map(u => u.name);
}

function getManagerAgentNames(managerId) {
  const users = loadUsers();
  const supIds = users.filter(u => u.role === 'supervisor_agent' && u.orgManagerId === managerId).map(u => u.id);
  return users
    .filter(u => u.role === 'agent' && (u.orgManagerId === managerId || supIds.includes(u.orgSupervisorId)))
    .map(u => u.name);
}
function getMasterManagerAgentNames(mmId) {
  const users  = loadUsers();
  const mgrIds = users.filter(u => u.role === 'manager' && u.orgMasterManagerId === mmId).map(u => u.id);
  const supIds = users.filter(u => u.role === 'supervisor_agent' && (mgrIds.includes(u.orgManagerId) || u.orgMasterManagerId === mmId)).map(u => u.id);
  return users
    .filter(u => u.role === 'agent' && (mgrIds.includes(u.orgManagerId) || u.orgMasterManagerId === mmId || supIds.includes(u.orgSupervisorId)))
    .map(u => u.name);
}
// legacy alias used in some places — replaced dynamically below
const AGENTS = [];
const DEFAULT_LEAD_TYPES = [
  'BIENES DE DISTRIBUCIÓN','GUÍA DE INFORMACIÓN','GUÍA MÉDICO',
  'GUÍA MÉDICO RESGUARDAR','CSKID'
];
function getLeadTypes() {
  try {
    const stored = localStorage.getItem('gew_lead_types');
    if (stored) return JSON.parse(stored);
  } catch(e) {}
  return [...DEFAULT_LEAD_TYPES];
}
function saveLeadTypes(arr) { localStorage.setItem('gew_lead_types', JSON.stringify(arr)); supaSync('gew_lead_types', JSON.stringify(arr)); }
const LEAD_TYPES = DEFAULT_LEAD_TYPES; // legacy alias — use getLeadTypes() for live data
const RESULTADOS = [
  'INTERESADO','NO INTERESADO','NO CONTESTA','NÚMERO EQUIVOCADO',
  'BUZÓN DE VOZ','CITA AGENDADA','CLIENTE ACTIVO','PENDIENTE','SIN RESULTADO','VENDIDO! 🏆'
];

const DEFAULT_BOARDS = [
  { id: 'dallas',     name: 'LEAD DALLAS',              icon: '🏙️',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Dallas'] },
  { id: 'austin',     name: 'LEAD AUSTIN - SAN ANTONIO', icon: '🤠',  hasCaller: false,  hasSolicitudes: false,  ubicaciones: ['Austin','San Antonio'] },
  { id: 'connecticut',name: 'LEAD CONNECTICUT',          icon: '🏛️',  hasCaller: false, hasSolicitudes: false, ubicaciones: ['Connecticut'] },
  { id: 'florida',    name: 'LEAD FLORIDA',              icon: '🌴',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Miami','Orlando','Tampa','Jacksonville','Fort Lauderdale'] },
  { id: 'georgia',    name: 'LEAD GEORGIA',              icon: '🍑',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Atlanta','Savannah','Augusta','Columbus'] },
  { id: 'virginia',   name: 'LEAD VIRGINIA',             icon: '🌿',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Virginia'] },
  { id: 'washington', name: 'LEAD WASHINGTON',           icon: '🌲',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Washington'] },
  { id: 'nebraska',   name: 'LEAD NEBRASKA',             icon: '🌾',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Nebraska'] },
];
let BOARDS = [...DEFAULT_BOARDS];
const VENDIDOS_BOARD = { id: 'vendidos', name: 'LEAD VENDIDOS', icon: '🏆', hidden: true };

const RESULT_PILL = {
  'INTERESADO':       'pill-green',
  'CITA AGENDADA':    'pill-teal',
  'CLIENTE ACTIVO':   'pill-purple',
  'NO INTERESADO':    'pill-red',
  'NO CONTESTA':      'pill-gray',
  'NÚMERO EQUIVOCADO':'pill-gray',
  'BUZÓN DE VOZ':     'pill-yellow',
  'PENDIENTE':        'pill-yellow',
  'SIN RESULTADO':    'pill-gray',
  'VENDIDO! 🏆':     'pill-gold',
};

// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
let currentBoardId = null;
let editingLeadId   = null;
let deleteLeadId    = null;
let filteredLeads   = [];
let assignFilter    = 'all';
let selectedIds     = new Set();
// Lead IDs deleted in this session — prevents server resurrection during merge
const _deletedLeadIds = new Set();
let COL_WIDTHS      = {
  nombre: 160, lead: 185, creacion: 120, hijos: 80,
  email: 160, telefono: 120, direccion: 160, ubicacion: 155,
  entrada: 130, asignado: 150, resultado: 130,
  notas: 160, _actions: 60
};

const ENTRADA_OPTS = ['Solicitud', 'Referido', 'Digitalización'];

function getBoard(id) { return BOARDS.find(b => b.id === id); }

// ── localStorage ──
function normalizeAsignado(val) {
  if (!val) return '';
  return val.trim().toLowerCase() === 'no asignado' ? '' : val;
}
function loadLeads(boardId) {
  try {
    const leads = JSON.parse(localStorage.getItem('gew_leads_' + boardId)) || [];
    leads.forEach(l => {
      l.asignado = normalizeAsignado(l.asignado);
      if (!l.tipo) l.tipo = 'Presencial'; // default for existing & new leads
    });
    return leads;
  } catch { return []; }
}
function setSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (!dot || !lbl) return;
  if (state === 'saving') {
    dot.style.background = 'var(--yellow)'; lbl.textContent = 'Guardando…';
  } else if (state === 'saved') {
    dot.style.background = 'var(--green)'; lbl.textContent = 'Guardado ☁';
  } else {
    dot.style.background = 'var(--red)'; lbl.textContent = 'Error al guardar';
  }
}

// ── Undo / Redo ───────────────────────────────────────────
const _undoStack = [];
const _redoStack = [];
const _MAX_HISTORY = 50;

function _pushHistory(boardId, before, after) {
  _undoStack.push({ boardId, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)) });
  if (_undoStack.length > _MAX_HISTORY) _undoStack.shift();
  _redoStack.length = 0;
  _updateUndoRedoBtns();
}
function _updateUndoRedoBtns() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) { u.disabled = _undoStack.length === 0; u.style.opacity = _undoStack.length ? '1' : '.4'; }
  if (r) { r.disabled = _redoStack.length === 0; r.style.opacity = _redoStack.length ? '1' : '.4'; }
}
async function _applyHistory(boardId, leadsSnapshot) {
  await saveLeads(boardId, leadsSnapshot);
}
async function undoAction() {
  if (_undoStack.length === 0) return;
  const entry = _undoStack.pop();
  _redoStack.push(entry);
  await _applyHistory(entry.boardId, entry.before);
  _updateUndoRedoBtns();
  showToast('Acción deshecha ↩', 'success');
}
async function redoAction() {
  if (_redoStack.length === 0) return;
  const entry = _redoStack.pop();
  _undoStack.push(entry);
  await _applyHistory(entry.boardId, entry.after);
  _updateUndoRedoBtns();
  showToast('Acción rehecha ↪', 'success');
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoAction(); }
});

// Hash of all meaningful fields for change detection (excludes _updatedAt itself)
function _leadHash(l) {
  return `${l.asignado}|${l.asignadoId}|${l.resultado}|${l.notas}|${l.nombre}|${l.telefono}|${l.email}|${l.direccion}|${l.ubicacion}|${l.estado}|${l.lead}|${l.hijos}`;
}

// #4 — In-memory cache for board lead counts (avoids JSON.parse on every sidebar update)
const _boardCountCache = new Map();

// #6 — Debounce timers per board key (collapses rapid saves into one Supabase call)
const _saveDebounceTimers = new Map();
const _SAVE_DEBOUNCE_MS = 500;

function _scheduledSync(key, leads) {
  if (_saveDebounceTimers.has(key)) clearTimeout(_saveDebounceTimers.get(key));
  _saveDebounceTimers.set(key, setTimeout(async () => {
    _saveDebounceTimers.delete(key);
    const ok = await supaSync(key, JSON.stringify(leads));
    setSyncStatus(ok ? 'saved' : 'error');
  }, _SAVE_DEBOUNCE_MS));
}

async function saveLeads(boardId, leads, opts = {}) {
  const session = getSession();
  const isMaster = session && session.role === 'master';
  const key = 'gew_leads_' + boardId;

  // Stamp changed/new leads with _updatedAt before anything else
  const prevRaw = localStorage.getItem(key);
  const prev = prevRaw ? JSON.parse(prevRaw) : [];
  const prevMap = new Map(prev.map(l => [l.id, l]));
  const now = new Date().toISOString();
  leads.forEach(l => {
    const p = prevMap.get(l.id);
    if (!p || !l._updatedAt || _leadHash(l) !== _leadHash(p)) {
      l._updatedAt = now;
    }
  });

  if (!opts.isNote || isMaster) _pushHistory(boardId, prev, leads);

  // Update local state immediately so UI is responsive
  localStorage.setItem(key, JSON.stringify(leads));
  _boardCountCache.set(boardId, leads.length); // #4
  updateSidebarCount(boardId);
  renderSidebar();
  setSyncStatus('saving');

  // #2 + #6 — Direct debounced write, no SELECT round-trip
  _scheduledSync(key, leads);
}
function allBoards() {
  BOARDS.forEach(b => updateSidebarCount(b.id));
}
function updateSidebarCount(boardId) {
  const el = document.querySelector(`.board-item[data-id="${boardId}"] .board-count`);
  if (!el) return;
  // #4 — Use cache when available; only parse localStorage on first access
  if (_boardCountCache.has(boardId)) {
    el.textContent = _boardCountCache.get(boardId);
  } else {
    const count = loadLeads(boardId).length;
    _boardCountCache.set(boardId, count);
    el.textContent = count;
  }
}

// ── ID ──
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Initials ──
function getInitials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

// ── Password hashing (Web Crypto API) ──
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function _isHashed(s) { return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s); }
// Verifies plain-text input against stored value (hash or legacy plain-text).
// Auto-migration: callers that have the users array should rehash after a plain-text match.
async function verifyPass(input, stored) {
  if (!input || !stored) return false;
  if (_isHashed(stored)) return (await sha256(input)) === stored;
  return input === stored;
}

function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Deterministic color from string — used for agent & location cells
function strToTableColor(str) {
  if (!str) return null;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  h = Math.abs(h);
  // Palette of distinct, readable colors (not too dark, not too bright)
  const palette = [
    '#2e7d6b','#1e6fa8','#7b5ea7','#a0522d','#2e6b3e',
    '#8b4560','#1a6b7a','#5a6e1a','#7a4a1a','#1a4a7a',
    '#6b2e6b','#3a7a5a','#6b5a1a','#1a5a6b','#7a2e4a',
    '#3a5a8b','#6b3a2e','#2e5a3a','#8b3a6b','#4a6b2e',
  ];
  return palette[h % palette.length];
}

// ── Date ──
function today() {
  const d = new Date();
  return d.toISOString().split('T')[0]; // stored as YYYY-MM-DD internally
}
function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  if (!y || !m || !d) return str;
  return `${m}/${d}/${y.slice(2)}`; // MM/DD/YY
}

// ════════════════════════════════════════════
//  NEW-LEADS NOTIFICATION
// ════════════════════════════════════════════
window._newLeadsBoards = new Set(); // populated on login and after import

// _newLeadsMap: { boardId: { boardName, count } }
window._newLeadsBoards = new Set();
window._newLeadsMap   = {};

async function loadNewLeadsFlags() {
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_new_leads').maybeSingle();
    const raw = JSON.parse(data?.value || '{}');
    // Support old format (array of strings) → migrate
    if (Array.isArray(raw)) {
      window._newLeadsMap   = Object.fromEntries(raw.map(id => [id, { boardName: id, count: 0 }]));
    } else {
      window._newLeadsMap   = raw;
    }
    window._newLeadsBoards = new Set(Object.keys(window._newLeadsMap));
  } catch(_) {}
}

async function markNewLeads(distribution) {
  // distribution: [{boardId, boardName, count}]
  distribution.forEach(d => {
    const prev = window._newLeadsMap[d.boardId] || { boardName: d.boardName, count: 0 };
    window._newLeadsMap[d.boardId] = { boardName: d.boardName, count: prev.count + d.count };
    window._newLeadsBoards.add(d.boardId);
  });
  try {
    await supa.from('kv_store').upsert({ key:'gew_new_leads', value: JSON.stringify(window._newLeadsMap) });
  } catch(_) {}
  renderSidebar();
}

async function clearNewLeads(boardId) {
  if (!window._newLeadsBoards.has(boardId)) return;
  window._newLeadsBoards.delete(boardId);
  delete window._newLeadsMap[boardId];
  try {
    await supa.from('kv_store').upsert({ key:'gew_new_leads', value: JSON.stringify(window._newLeadsMap) });
  } catch(_) {}
  const el = document.querySelector(`.board-item[data-id="${boardId}"] .board-new-dot`);
  if (el) el.remove();
}

function showNewLeadsNotification() {
  const session = getSession();
  if (!session || session.role === 'agent') return;
  if (sessionStorage.getItem('gew_nl_notified')) return;
  const entries = Object.entries(window._newLeadsMap);
  if (!entries.length) return;
  sessionStorage.setItem('gew_nl_notified', '1');

  const existing = document.getElementById('nl-notification');
  if (existing) existing.remove();

  const total = entries.reduce((s, [, v]) => s + (v.count || 0), 0);
  const rows = entries.map(([, v]) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.07)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:7px;height:7px;border-radius:50%;background:#f97316;flex-shrink:0;box-shadow:0 0 0 2px rgba(249,115,22,.3)"></span>
        <span style="font-size:12.5px;color:#e2e8f0">${v.boardName || 'Board'}</span>
      </div>
      <span style="font-size:12px;font-weight:700;background:rgba(249,115,22,.18);color:#fb923c;padding:2px 9px;border-radius:20px">${v.count || '+'}</span>
    </div>`
  ).join('');

  const el = document.createElement('div');
  el.id = 'nl-notification';
  el.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:9999;
    width:320px;background:#0f2044;border:1px solid rgba(255,255,255,.12);
    border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.45);
    animation:nlSlideIn .3s cubic-bezier(.22,1,.36,1);
    font-family:'Segoe UI',system-ui,sans-serif;overflow:hidden;
  `;
  el.innerHTML = `
    <style>@keyframes nlSlideIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}</style>
    <div style="padding:14px 16px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;background:rgba(249,115,22,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px">🔔</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#fff">Nuevos Leads</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:1px">${total} lead${total!==1?'s':''} sin revisar</div>
        </div>
      </div>
      <button onclick="document.getElementById('nl-notification').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:4px;border-radius:6px" title="Cerrar">×</button>
    </div>
    <div style="max-height:220px;overflow-y:auto">${rows}</div>
    <div style="padding:10px 16px;border-top:1px solid rgba(255,255,255,.07);text-align:center">
      <span style="font-size:10px;color:#475569">Abre el board para marcar como visto</span>
    </div>
  `;
  document.body.appendChild(el);

  // Auto-dismiss after 12 seconds
  setTimeout(() => { if (el.isConnected) el.remove(); }, 12000);
}

//  SIDEBAR
// ════════════════════════════════════════════
function renderSidebar() {
  const session = getSession();
  const isMaster           = session && session.role === 'master';
  const isAgent            = session && session.role === 'agent';
  const isManager          = session && session.role === 'manager';
  const isMasterManager    = session && session.role === 'master_manager';
  const isSupervisorAgent  = session && session.role === 'supervisor_agent';
  const isCaller           = session && session.role === 'caller';
  const list = document.getElementById('board-list');
  const defaultIds = new Set(DEFAULT_BOARDS.map(b => b.id));

  const _lineUsers = (isManager || isMasterManager || isSupervisorAgent || isCaller)
    ? _getLineUsers(session) : null;
  const sideLineNames = _lineUsers ? new Set(_lineUsers.map(u => u.name)) : null;
  const sideLineIds   = _lineUsers ? new Set(_lineUsers.map(u => u.id))   : null;
  const _sessNameNorm = (session?.name || '').trim().toLowerCase();
  const _sessId = session?.id || null;
  const visibleBoards = isAgent
    ? BOARDS.filter(b => loadLeads(b.id).some(l =>
        (_sessId && l.asignadoId) ? l.asignadoId === _sessId : (l.asignado || '').trim().toLowerCase() === _sessNameNorm
      ))
    : sideLineNames
      ? BOARDS.filter(b => loadLeads(b.id).some(l =>
          (l.asignadoId && sideLineIds) ? sideLineIds.has(l.asignadoId) : sideLineNames.has(l.asignado)
        ))
      : BOARDS;

  list.innerHTML = visibleBoards.map(b => {
    const isCustom = !defaultIds.has(b.id);
    const delBtn = (isMaster && isCustom)
      ? `<button class="board-del" onclick="event.stopPropagation();deleteBoard('${b.id}')" title="Eliminar board">✕</button>`
      : '';
    const hasNew = !isAgent && window._newLeadsBoards?.has(b.id);
    return `
      <div class="board-item" data-id="${b.id}" onclick="selectBoard('${b.id}')">
        <span class="board-icon">${b.icon}</span>
        <span class="board-name">${b.name}</span>
        ${hasNew ? '<span class="board-new-dot" title="Nuevos leads"></span>' : ''}
        <span class="board-count" style="display:none">0</span>
        ${delBtn}
      </div>`;
  }).join('');

  if (isAgent && visibleBoards.length === 0) {
    list.innerHTML = '<div style="padding:14px 18px;font-size:12px;color:var(--text2)">No tienes leads asignados aún.</div>';
  }

  if (isMaster) {
    list.innerHTML += `<button class="add-board-btn" onclick="openBoardModal()">＋ Nuevo Board</button>`;
  }
  allBoards();

  // Dev-only: show collapse toggle and apply saved state
  const collapseBtn = document.getElementById('boards-collapse-btn');
  if (collapseBtn) {
    collapseBtn.style.display = _isZoomDev() ? '' : 'none';
    const collapsed = localStorage.getItem('gew_boards_collapsed') === '1';
    list.style.display = collapsed ? 'none' : '';
    collapseBtn.style.transform = collapsed ? 'rotate(-90deg)' : '';
    collapseBtn.title = collapsed ? 'Expandir boards' : 'Contraer boards';
  }
}

function toggleBoardsCollapse() {
  const list = document.getElementById('board-list');
  const btn  = document.getElementById('boards-collapse-btn');
  const collapsed = list.style.display === 'none';
  list.style.display = collapsed ? '' : 'none';
  btn.style.transform = collapsed ? '' : 'rotate(-90deg)';
  btn.title = collapsed ? 'Contraer boards' : 'Expandir boards';
  localStorage.setItem('gew_boards_collapsed', collapsed ? '0' : '1');
}

function selectBoard(id) {
  showBoardView();
  currentBoardId = id;
  clearNewLeads(id); // dismiss new-leads indicator
  document.querySelectorAll('.board-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const board = getBoard(id);
  document.getElementById('board-title').textContent = board.name + ' ' + board.icon;
  // reset filters
  document.getElementById('search-input').value = '';
  ['f-asignado','f-lead','f-resultado'].forEach(fid => {
    document.getElementById(fid).value = '';
  });
  clearDateFilter(false);
  const _sb = getSession();
  const _isLimitedRole = _sb && ['agent','supervisor_agent','manager','master_manager','caller'].includes(_sb.role);
  assignFilter = _isLimitedRole ? 'all' : 'unassigned';
  document.querySelectorAll('.assign-tab').forEach(t => t.classList.remove('active'));
  const _defaultTab = document.querySelector(`.assign-tab[data-assign="${assignFilter}"]`);
  if (_defaultTab) _defaultTab.classList.add('active');
  document.getElementById('dist-panel').classList.remove('visible');
  selectedIds.clear();
  updateBulkBar();

  document.getElementById('import-panel').style.display = 'none';
  document.getElementById('import-panel').classList.remove('visible');
  document.getElementById('leads-table').style.display = '';

  // Refresh user data from Supabase so inactive/deleted status is always current
  supa.from('kv_store').select('key, value').in('key', [USERS_KEY, DELETED_USERS_KEY]).then(({ data }) => {
    if (!data) return;
    const usersRow   = data.find(r => r.key === USERS_KEY);
    const deletedRow = data.find(r => r.key === DELETED_USERS_KEY);
    if (!usersRow?.value) return;
    try {
      const remote = JSON.parse(usersRow.value) || [];
      const local  = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
      const deletedIds = new Set();
      try { (JSON.parse(deletedRow?.value || '[]')).forEach(u => u.id && deletedIds.add(u.id)); } catch(_) {}
      try { (JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '[]')).forEach(u => u.id && deletedIds.add(u.id)); } catch(_) {}
      const merged = [...remote];
      local.forEach(lu => {
        if (!merged.find(ru => ru.id === lu.id) && !deletedIds.has(lu.id)) merged.push(lu);
      });
      localStorage.setItem(USERS_KEY, JSON.stringify(merged));
    } catch(_) {}
    populateAgentFilter();
    renderTableKeepSelection();
  }).catch(() => {});

  populateAgentFilter();
  populateLeadFilter();
  renderTable();
  updateTabCounts();
}

function updateTabCounts() {
  if (!currentBoardId) return;
  const leads = currentBoardId === '__agent__'
    ? loadAgentLeads(getSession()?.name || '', getSession()?.id)
    : loadLeads(currentBoardId);
  const total    = leads.length;
  const unassign = leads.filter(l => !l.asignadoId && (!l.asignado || l.asignado === 'Sin asignar')).length;
  const assigned = leads.filter(l => l.asignadoId || (l.asignado && l.asignado !== 'Sin asignar')).length;
  const _sess2    = getSession();
  const _lineNms2 = (_sess2 && _sess2.role !== 'master' && _sess2.role !== 'admin')
    ? new Set(_getLineUsers(_sess2).map(u => u.name)) : null;
  const delArr   = loadDeletedLeads().filter(l =>
    l._originalBoardId === currentBoardId && l.asignado && l.asignado !== 'Sin asignar'
    && (!_lineNms2 || _lineNms2.has(l.asignado))
  );
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('tab-cnt-all',      total);
  set('tab-cnt-unassigned', unassign);
  set('tab-cnt-assigned',   assigned);
  set('tab-cnt-deleted',    delArr.length);
}

// ════════════════════════════════════════════
//  TABLE
// ════════════════════════════════════════════
function getColumns(board) {
  const _s = getSession();
  const _canSelect = _s && (_s.role === 'master' || _s.role === 'admin');
  return getActiveColumns(board).filter(c => c.key !== '_check' || _canSelect);
}

function loadAgentLeads(agentName, agentId) {
  if (!agentName && !agentId) return [];
  const all = [];
  const norm = (agentName || '').trim().toLowerCase();
  BOARDS.forEach(b => loadLeads(b.id).forEach(l => {
    const byId   = agentId && l.asignadoId && l.asignadoId === agentId;
    const byName = norm && (l.asignado || '').trim().toLowerCase() === norm;
    if (byId || byName) all.push({ ...l, _boardId: b.id });
  }));
  return all;
}

function findLeadBoard(leadId) {
  for (const b of BOARDS) {
    if (loadLeads(b.id).some(l => l.id === leadId)) return b.id;
  }
  return null;
}

function renderTableKeepSelection() {
  const saved = new Set(selectedIds);
  renderTable();
  if (saved.size > 0) {
    saved.forEach(id => selectedIds.add(id));
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      if (saved.has(cb.dataset.id)) { cb.checked = true; cb.closest('tr').classList.add('selected-row'); }
    });
    syncHeaderCheckbox();
    updateBulkBar();
  }
}

function renderTable() {
  if (!currentBoardId) return;
  const board = getBoard(currentBoardId) || BOARDS[0];
  const cols  = getColumns(board);
  const leads = currentBoardId === '__agent__'
    ? loadAgentLeads(getSession()?.name || '', getSession()?.id)
    : loadLeads(currentBoardId);

  // header
  const thead = document.getElementById('thead-row');
  const SORTABLE_COLS = new Set(['creacion','asignado','lead','ubicacion']);
  thead.innerHTML = cols.map(c => {
    if (c.key === '_check') return `<th class="th-check" style="width:36px"><input type="checkbox" class="header-checkbox" id="check-all" onchange="toggleSelectAll(this)" /></th>`;
    const isSortable = SORTABLE_COLS.has(c.key);
    const isActive   = _sortCol === c.key;
    const arrow      = isSortable
      ? `<span onclick="event.stopPropagation();toggleSort('${c.key}')" style="margin-left:5px;cursor:pointer;user-select:none;font-size:11px;opacity:${isActive?'1':'.35'};color:${isActive?'var(--accent)':'inherit'}" title="Ordenar">${isActive && _sortDir === 'desc' ? '▼' : '▲'}</span>`
      : '';
    const resizer = c.key !== '_actions' ? `<div class="col-resizer" data-col="${c.key}"></div>` : '';
    const thClass = c.key === 'nombre' ? ' class="th-nombre"' : c.key === 'hijos' ? ' class="th-hijos"' : '';
    return `<th${thClass} style="width:${COL_WIDTHS[c.key]||130}px">${c.label}${arrow}${resizer}</th>`;
  }).join('');
  initResizers();
  applyFilters();
}

let _sortCol = null;
let _sortDir = 'asc';
function toggleSort(col) {
  if (_sortCol === col) { _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; }
  else { _sortCol = col; _sortDir = 'asc'; }
  renderTable();
}

function applyFilters() {
  if (!currentBoardId) return;
  const session = getSession();
  const board   = getBoard(currentBoardId) || BOARDS[0];
  const leads   = currentBoardId === '__agent__'
    ? loadAgentLeads(session ? session.name : '', session ? session.id : null)
    : loadLeads(currentBoardId);

  const _lineRoles = ['manager','master_manager','supervisor_agent','caller'];
  const _lineUsers2 = (session && _lineRoles.includes(session.role)) ? _getLineUsers(session) : null;
  const lineNames = _lineUsers2 ? new Set(_lineUsers2.map(u => u.name)) : null;
  const lineIds   = _lineUsers2 ? new Set(_lineUsers2.map(u => u.id))   : null;
  const q       = document.getElementById('search-input').value.trim().toLowerCase();
  const fAsig   = document.getElementById('f-asignado').value.trim();
  const fLead   = document.getElementById('f-lead').value.trim();
  const fRes    = document.getElementById('f-resultado').value.trim();
  const fDesde  = document.getElementById('f-fecha-desde').value;
  const fHasta  = document.getElementById('f-fecha-hasta').value;
  const clearBtn = document.getElementById('btn-clear-dates');
  if (clearBtn) clearBtn.classList.toggle('visible', !!(fDesde || fHasta));

  selectedIds.clear();
  updateBulkBar();
  filteredLeads = leads.filter(l => {
    if (lineNames) {
      const byId = l.asignadoId && lineIds ? lineIds.has(l.asignadoId) : false;
      if (!byId && !lineNames.has(l.asignado)) return false;
    }
    if (q && ![ l.nombre, l.email, l.telefono, l.asignado ].some(v => (v||'').toLowerCase().includes(q))) return false;
    if (fAsig && (l.asignado||'').trim() !== fAsig) return false;
    if (fLead && (l.lead||'').trim()     !== fLead) return false;
    if (fRes  && (l.resultado||'').trim() !== fRes) return false;
    if (fDesde && (l.creacion||'') < fDesde) return false;
    if (fHasta && (l.creacion||'') > fHasta) return false;
    const isUnassigned = !l.asignado || l.asignado === '' || l.asignado === 'Sin asignar';
    if (assignFilter === 'assigned'   &&  isUnassigned) return false;
    if (assignFilter === 'unassigned' && !isUnassigned) return false;
    return true;
  });

  if (_sortCol) {
    filteredLeads.sort((a, b) => {
      const va = (a[_sortCol] || '').toLowerCase();
      const vb = (b[_sortCol] || '').toLowerCase();
      return _sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  renderRows(board, filteredLeads);
  document.getElementById('toolbar-count').textContent =
    `${filteredLeads.length} de ${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
  updateTabCounts();
}

function renderRows(board, leads) {
  const cols  = getColumns(board);
  const tbody = document.getElementById('tbody');

  if (leads.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('empty-state').style.display = 'flex';
    document.getElementById('leads-table').style.display = leads.length === 0 ? 'none' : '';
    document.getElementById('empty-state').style.display = leads.length === 0 ? 'flex' : 'none';
    // re-evaluate with actual board data
    const allLeads = currentBoardId === '__agent__'
      ? loadAgentLeads(getSession()?.name || '', getSession()?.id)
      : loadLeads(currentBoardId);
    document.getElementById('empty-state').style.display = allLeads.length === 0 ? 'flex' : 'none';
    if (allLeads.length > 0 && leads.length === 0) {
      // filtered but has leads — show table with empty tbody + message row
      document.getElementById('leads-table').style.display = '';
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:40px;color:var(--text2)">Sin resultados con los filtros actuales.</td></tr>`;
      return;
    }
    document.getElementById('leads-table').style.display = allLeads.length === 0 ? 'none' : '';
    return;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('leads-table').style.display = '';

  tbody.innerHTML = leads.map(l => {
    const isUnassigned = !l.asignado || l.asignado === '' || l.asignado === 'Sin asignar';
    const rowClass = isUnassigned ? 'unassigned-row' : '';
    const cells = cols.map(c => {
      if (c.key === '_check') return `<td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-checkbox" data-id="${l.id}" onchange="toggleRowSelect(this,'${l.id}')" ${selectedIds.has(l.id)?'checked':''} /></td>`;
      if (c.key === '_actions') {
        const sess2 = getSession();
        const isMasterRow = sess2 && sess2.role === 'master';
        if (!isMasterRow) return `<td></td>`;
        return `<td><div class="row-actions">
          <button class="row-btn" onclick="event.stopPropagation();openNotesPanel('${l.id}')" title="Notas">📝</button>
          <button class="row-btn" onclick="event.stopPropagation();openModal('${l.id}')" title="Editar">✏️</button>
          <button class="row-btn del" onclick="event.stopPropagation();askDelete('${l.id}')" title="Eliminar">🗑</button>
        </div></td>`;
      }
      if (c.key === 'nombre') {
        const sess2 = getSession();
        const masterBtns = (sess2 && sess2.role === 'master')
          ? `<button onclick="event.stopPropagation()" title="Favorito" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:2px;flex-shrink:0;line-height:1">✦</button><button onclick="event.stopPropagation();openNotesPanel('${l.id}')" title="Notas" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:13px;padding:2px;flex-shrink:0;line-height:1">≡</button><button onclick="event.stopPropagation();openChatPopup('${l.id}')" title="Chat" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;padding:2px;flex-shrink:0;line-height:1;opacity:1 !important">💬</button>`
          : '';
        return `<td class="td-name"><div style="display:flex;align-items:center;gap:8px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.nombre||'')}">${esc(l.nombre||'—')}</span>${masterBtns}</div></td>`;
      }
      if (c.key === 'lead') {
        const _leadColors = {
          'BIENES DE DISTRIBUCIÓN': '#3ecf8e',
          'GUÍA DE INFORMACIÓN':    '#3ecf8e',
          'GUIA DE INFORMACIÓN':    '#3ecf8e',
          'GUIA DE INF':            '#3ecf8e',
          'GUÍA MÉDICO':            '#f59e0b',
          'GUIA MÉDICO':            '#f59e0b',
          'GUÍA MÉDICO RESGUARDAR': '#f59e0b',
          'GUIA MÉDICO RESGUARDAR': '#f59e0b',
          'CSKID':                  '#6366f1',
        };
        const val    = (l.lead||'').toUpperCase();
        const bg     = _leadColors[val] || _leadColors[Object.keys(_leadColors).find(k=>val.includes(k.toUpperCase().slice(0,6)))||''] || '#4da8ff';
        const sess   = getSession();
        const canEdit = sess && (sess.role === 'master' || sess.role === 'admin');
        if (!canEdit) {
          return l.lead
            ? `<td style="padding:0;text-align:center"><div style="height:40px;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-weight:600;font-size:11px;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 10px">${esc(l.lead)}</div></td>`
            : `<td style="text-align:center;color:var(--text2);font-size:11px">—</td>`;
        }
        const leadOpts = ['', ...getLeadTypes()].map(t =>
          `<option value="${esc(t)}"${l.lead===t?' selected':''}>${t||'— Sin tipo —'}</option>`
        ).join('');
        const _leadTag = l.lead
          ? `display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;cursor:pointer;letter-spacing:.2px`
          : `display:inline-flex;align-items:center;font-size:11px;color:var(--text2);cursor:pointer;gap:6px`;
        const _leadDot = l.lead ? `<span style="width:7px;height:7px;border-radius:50%;background:${bg};flex-shrink:0;display:inline-block"></span>` : '';
        return `<td style="text-align:center;vertical-align:middle" class="td-inline" onclick="event.stopPropagation()">
          <div style="${_leadTag}" onclick="openInlineSel(this)">${_leadDot}${esc(l.lead||'—')} <span style="opacity:.4;font-size:9px;margin-left:2px">▾</span></div>
          <select class="inline-select" style="display:none"
            onchange="saveInlineField(this,'${l.id}','lead')"
            onblur="closeInlineSel(this)">${leadOpts}</select>
        </td>`;
      }
      if (c.key === 'estado') {
        return `<td></td>`;
      }
      if (c.key === 'resultado') {
        const resOpts = ['', ...RESULTADOS].map(r =>
          `<option value="${esc(r)}"${l.resultado===r?' selected':''}>${r||'— Sin resultado —'}</option>`
        ).join('') + `<option value="__delete_lead__" style="color:var(--red);font-weight:600">🗑 ELIMINAR</option>`;
        const displayVal = l.resultado || '';
        const _resDotColor = {'INTERESADO':'#3ecf8e','CITA AGENDADA':'#2dd4bf','CLIENTE ACTIVO':'#a78bfa','NO INTERESADO':'#e2445c','NO CONTESTA':'#94a3b8','NÚMERO EQUIVOCADO':'#94a3b8','BUZÓN DE VOZ':'#fbbf24','PENDIENTE':'#fbbf24','SIN RESULTADO':'#64748b'}[displayVal] || '#64748b';
        const _resTag = displayVal
          ? `display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;cursor:pointer;letter-spacing:.2px`
          : `display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:5px;padding:6px 12px;font-size:11px;font-weight:500;color:var(--text2);white-space:nowrap;cursor:pointer`;
        const _resDot = `<span style="width:7px;height:7px;border-radius:50%;background:${_resDotColor};flex-shrink:0;display:inline-block"></span>`;
        return `<td style="text-align:center;vertical-align:middle" class="td-inline" onclick="event.stopPropagation()">
          <div style="${_resTag}" onclick="openInlineSel(this)">${_resDot}${esc(displayVal||'Sin resultado')} <span style="opacity:.4;font-size:9px;margin-left:2px">▾</span></div>
          <select class="inline-select" style="display:none"
            onchange="saveInlineField(this,'${l.id}','resultado')"
            onblur="closeInlineSel(this)">${resOpts}</select>
        </td>`;
      }
      if (c.key === 'ubicacion') {
        const ubOpts = board.ubicaciones.length > 0
          ? board.ubicaciones
          : BOARDS.flatMap(b2 => b2.ubicaciones).filter((x,i,a) => a.indexOf(x)===i);
        const opts = ['', ...ubOpts].map(u =>
          `<option value="${esc(u)}"${l.ubicacion===u?' selected':''}>${u||'— Sin ubicación —'}</option>`
        ).join('');
        const displayVal = l.ubicacion || '';
        const emptyClass = displayVal ? '' : ' empty-val';
        const ubBg = displayVal ? strToTableColor(displayVal) : null;
        const _ubTag = ubBg
          ? `display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;cursor:pointer;letter-spacing:.2px`
          : `display:inline-flex;align-items:center;font-size:11px;color:var(--text2);cursor:pointer;gap:6px`;
        const _ubDot = ubBg ? `<span style="width:7px;height:7px;border-radius:50%;background:${ubBg};flex-shrink:0;display:inline-block"></span>` : '';
        return `<td style="text-align:center;vertical-align:middle" class="td-inline" onclick="event.stopPropagation()">
          <div style="${_ubTag}" onclick="openInlineSel(this)">${_ubDot}${esc(displayVal||'—')} <span style="opacity:.4;font-size:9px;margin-left:2px">▾</span></div>
          <select class="inline-select" style="display:none"
            onchange="saveInlineField(this,'${l.id}','ubicacion')"
            onblur="closeInlineSel(this)">${opts}</select>
        </td>`;
      }
      if (c.key === 'entrada') {
        const entVal = l.entrada || 'Solicitud';
        const entColor = entVal === 'Referido' ? '#a78bfa' : entVal === 'Digitalización' ? '#00b7c3' : '#94a3b8';
        const entOpts = ENTRADA_OPTS.map(o => `<option value="${o}"${entVal===o?' selected':''}>${o}</option>`).join('');
        return `<td style="text-align:center;vertical-align:middle" class="td-inline" onclick="event.stopPropagation()">
          <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:5px 10px;font-size:11px;font-weight:600;color:${entColor};white-space:nowrap;cursor:pointer" onclick="openInlineSel(this)">
            ${esc(entVal)} <span style="opacity:.4;font-size:9px">▾</span>
          </div>
          <select class="inline-select" style="display:none"
            onchange="saveInlineField(this,'${l.id}','entrada')"
            onblur="closeInlineSel(this)">
            ${entOpts}
          </select>
        </td>`;
      }
      if (c.key === 'asignado') {
        const sess         = getSession();
        const displayVal   = l.asignado || '';
        const assignedUser = displayVal ? loadUsers().find(u => u.name === displayVal) : null;
        const isInactive   = assignedUser && assignedUser.inactive;
        const isAssigned   = displayVal && displayVal !== 'Sin asignar';
        const cellBg       = isInactive ? '#555' : isAssigned ? (strToTableColor(displayVal) || '#2e7d6b') : null;
        const inactiveTag  = isInactive ? ' <span style="font-size:9px;opacity:.75">(inactivo)</span>' : '';
        const cellStyle    = cellBg
          ? `padding:0;text-align:center`
          : `text-align:center`;
        const innerStyle   = cellBg
          ? `height:40px;display:flex;align-items:center;justify-content:center;background:${cellBg};color:#fff;font-weight:600;font-size:11.5px;letter-spacing:.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 10px;gap:4px`
          : `display:flex;align-items:center;justify-content:center;height:40px;font-size:12px;color:var(--text2)`;
        const canAssign = sess && (sess.role === 'master' || sess.role === 'admin');
        if (!canAssign) {
          return `<td style="${cellStyle}"><div style="${innerStyle}">${esc(displayVal||'Sin Asignar')}${inactiveTag}</div></td>`;
        }
        return `<td style="${cellStyle}" class="td-inline" onclick="event.stopPropagation()">
          <div style="${innerStyle};cursor:pointer" onclick="openAgentPicker('${l.id}',this)">${esc(displayVal||'Sin Asignar')}${inactiveTag} <span style="opacity:.6;font-size:10px">▾</span></div>
        </td>`;
      }
      if (c.key === 'creacion') {
        const sess = getSession();
        const avatarName = sess ? sess.name : '';
        const initials = getInitials(avatarName);
        const dateLabel = l.creacion === '2026-04-21'
          ? `<span style="font-size:11px;color:var(--text2);font-weight:400">04/21 · POR EXPORTACIÓN</span>`
          : l.creacion === '2026-04-22'
          ? `<span style="font-size:11px;color:var(--text2);font-weight:400">04/22 · POR EXPORTACIÓN</span>`
          : `<span style="font-size:12px;color:var(--text2)">${esc(formatDate(l.creacion||''))}</span>`;
        return `<td><div style="display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap">${dateLabel}</div></td>`;
      }
      if (c.key === 'notas') {
        const _structuredNotes = parseNotes(l._notes).filter(n => !n.system);
        const _lastNote = _structuredNotes.length ? _structuredNotes[_structuredNotes.length - 1].text : '';
        const _displayNote = _lastNote || l.notas || '';
        const _count = _structuredNotes.length;
        const _countBadge = _count > 1 ? ` <span style="font-size:9px;background:var(--accent);color:#fff;border-radius:8px;padding:1px 5px;flex-shrink:0">${_count}</span>` : '';
        return `<td class="td-notes"><span style="display:flex;align-items:center;gap:4px;"><span title="${esc(_displayNote)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(_displayNote)}</span>${_countBadge}</span></td>`;
      }
      if (c.key === 'tipo') {
        const tipoVal = l.tipo || 'Presencial';
        const isOnline = tipoVal === 'Online';
        const tipoBg   = isOnline ? 'rgba(52,211,153,.15)' : 'rgba(96,165,250,.10)';
        const tipoBorder = isOnline ? 'rgba(52,211,153,.35)' : 'rgba(96,165,250,.25)';
        const tipoColor  = isOnline ? '#34d399' : '#93c5fd';
        const tipoDot    = isOnline ? '#34d399' : '#60a5fa';
        const tipoOpts = ['Presencial','Online'].map(o =>
          `<option value="${o}"${tipoVal===o?' selected':''}>${o}</option>`
        ).join('');
        return `<td style="text-align:center;vertical-align:middle" class="td-inline" onclick="event.stopPropagation()">
          <div style="display:inline-flex;align-items:center;gap:5px;background:${tipoBg};border:1px solid ${tipoBorder};border-radius:5px;padding:5px 10px;font-size:11px;font-weight:600;color:${tipoColor};white-space:nowrap;cursor:pointer" onclick="openInlineSel(this)">
            <span style="width:6px;height:6px;border-radius:50%;background:${tipoDot};flex-shrink:0;display:inline-block"></span>
            ${esc(tipoVal)} <span style="opacity:.4;font-size:9px;margin-left:2px">▾</span>
          </div>
          <select class="inline-select" style="display:none"
            onchange="saveInlineField(this,'${l.id}','tipo')"
            onblur="closeInlineSel(this)">${tipoOpts}</select>
        </td>`;
      }
      // custom column
      if (c.customDef) {
        const def = c.customDef;
        if (def.type === 'dropdown') {
          return inlineDrop(c.key, def.options, def.label, null, l, id, board);
        }
        return inlineText(c.key, def.type === 'number' ? 'number' : 'text', def.label, l, id);
      }
      if (c.key === 'hijos') return `<td class="td-hijos">${esc(l.hijos||'')}</td>`;
      if (c.key === 'telefono') {
        const ph = l.telefono || '';
        const _zoomPhone = ph.replace(/\D/g,'').replace(/^(\d{10})$/,'+1$1').replace(/^1(\d{10})$/,'+1$1') || ph;
        const callBtn = ph ? `<a href="zoomus://zoom.us/call?callee=${encodeURIComponent(_zoomPhone)}" onclick="event.stopPropagation()" title="Llamar por Zoom" style="background:#2D8CFF;border:none;color:#fff;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;flex-shrink:0;line-height:1.6;text-decoration:none;display:inline-block">📞</a>` : '';
        return `<td><div style="display:flex;align-items:center;gap:5px;white-space:nowrap">${esc(ph)}${callBtn}</div></td>`;
      }
      return `<td>${esc(l[c.key]||'')}</td>`;
    }).join('');
    return `<tr class="${rowClass}" onclick="openNotesPanel('${l.id}')" style="cursor:pointer">${cells}</tr>`;
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ════════════════════════════════════════════
//  MODAL
// ════════════════════════════════════════════
function openModal(leadId) {
  if (!currentBoardId) { showToast('Selecciona un board primero','error'); return; }
  editingLeadId = leadId || null;
  // Agents use __agent__ virtual board — resolve to first real board for new leads
  const resolvedBoardId = (!leadId && currentBoardId === '__agent__') ? (BOARDS[0]?.id || null) : currentBoardId;
  if (!resolvedBoardId) { showToast('No hay boards disponibles','error'); return; }
  const board = getBoard(resolvedBoardId);
  const leads = loadLeads(resolvedBoardId);
  const lead  = leadId ? leads.find(l => l.id === leadId) : null;

  document.getElementById('modal-title').textContent = lead ? 'Editar Lead' : 'Nuevo Lead';
  buildForm(board, lead);
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingLeadId = null;
}

function overlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function buildForm(board, lead) {
  const grid = document.getElementById('form-grid');
  const session = getSession();
  const defaultAsignado = lead ? (lead.asignado || '') : (session?.name || '');
  const v = k => k === 'asignado' ? defaultAsignado : (lead ? (lead[k] || '') : '');

  const ubOpts = board.ubicaciones.length > 0
    ? board.ubicaciones
    : BOARDS.flatMap(b => b.ubicaciones).filter((x,i,a) => a.indexOf(x) === i);

  const selUb = ubOpts.map(u => `<option${v('ubicacion')===u?' selected':''}>${u}</option>`).join('');
  const selAgents = getAgents().map(a => `<option${v('asignado')===a?' selected':''}>${a}</option>`).join('');
  const selLead   = getLeadTypes().map(t => `<option${v('lead')===t?' selected':''}>${t}</option>`).join('');
  const selRes    = RESULTADOS.map(r => `<option${v('resultado')===r?' selected':''}>${r}</option>`).join('');
  const callerField = '';



  grid.innerHTML = `
    <div class="field form-full">
      <label>Nombre *</label>
      <input type="text" id="f_nombre" value="${esc(v('nombre'))}" placeholder="Nombre completo" />
    </div>
    <div class="field">
      <label>Lead</label>
      <select id="f_lead"><option value="">— Seleccionar —</option>${selLead}</select>
    </div>
    <div class="field">
      <label>Email</label>
      <input type="email" id="f_email" value="${esc(v('email'))}" placeholder="correo@ejemplo.com" />
    </div>
    <div class="field">
      <label>Teléfono</label>
      <input type="tel" id="f_telefono" value="${esc(v('telefono'))}" placeholder="+1 000 000 0000" />
    </div>
    <div class="field">
      <label>¿Hijos menores de edad?</label>
      <input type="number" id="f_hijos" min="0" value="${v('hijos')}" placeholder="0" />
    </div>
    <div class="field">
      <label>Ubicación</label>
      <select id="f_ubicacion"><option value="">— Seleccionar —</option>${selUb}</select>
    </div>
    <div class="field">
      <label>Entrada</label>
      <select id="f_entrada">${ENTRADA_OPTS.map(o=>`<option value="${o}"${(v('entrada')||'Solicitud')===o?' selected':''}>${o}</option>`).join('')}</select>
    </div>
    <div class="field form-full">
      <label>Dirección</label>
      <input type="text" id="f_direccion" value="${esc(v('direccion'))}" placeholder="Dirección completa" />
    </div>
    <div class="field">
      <label>Asignado A</label>
      ${(() => { const r = getSession()?.role; return (r === 'master' || r === 'admin'); })()
        ? `<select id="f_asignado"><option value="">— Seleccionar —</option>${selAgents}</select>`
        : `<input type="text" id="f_asignado" value="${esc(v('asignado'))}" readonly style="opacity:.6;cursor:not-allowed" />`}
    </div>
    <div class="field">
      <label>Resultado</label>
      <select id="f_resultado"><option value="">— Seleccionar —</option>${selRes}</select>
    </div>
    <div class="field form-full">
      <label>Notas</label>
      <textarea id="f_notas" placeholder="Notas adicionales…">${esc(v('notas'))}</textarea>
    </div>
  `;
}

// Pending save context when non-master is intercepted for resultado note
let _pendingModalSave = null;

const RESULTADO_CONFIRM = new Set(['NO INTERESADO', 'NÚMERO EQUIVOCADO']);
function _confirmDestructivo(value, nombre) {
  if (!RESULTADO_CONFIRM.has(value)) return true;
  return confirm(`¿Confirmas marcar a "${nombre || 'este lead'}" como "${value}"?\nEl lead será movido a la papelera.`);
}

function _applyModalSave(leads, merged, saveBoardId, leadId, oldLead, isEdit) {
  const resultado = merged.resultado || '';
  if (resultado === 'VENDIDO! 🏆') {
    saveLeads(saveBoardId, leads);
    showVendidoAnimation();
    setTimeout(() => moveLeadToVendidos(leadId, saveBoardId), 400);
    return;
  }
  if (resultado === 'NO INTERESADO' || resultado === 'NÚMERO EQUIVOCADO') {
    if (!_confirmDestructivo(resultado, merged.nombre)) return;
    saveLeads(saveBoardId, leads);
    softDeleteLead(leadId, saveBoardId);
    renderTable();
    showToast(`Lead movido a papelera: ${resultado}`, 'error');
    return;
  }
  saveLeads(saveBoardId, leads);
  if (resultado === 'CITA AGENDADA') {
    renderTable();
    openCitaModal(leadId, saveBoardId, merged.nombre || '');
    return;
  }
  if (isEdit && oldLead && resultado && resultado !== (oldLead.resultado || '')) {
    logActivity('lead_edit', 'Cambio de resultado', `${merged.nombre} · "${oldLead.resultado||'—'}" → "${resultado}"`, { boardId: saveBoardId });
  } else {
    logActivity('lead_edit', isEdit ? 'Lead editado' : 'Lead creado', `${merged.nombre}${merged.asignado ? ' · '+merged.asignado : ''}`, { boardId: saveBoardId });
  }
  renderTable();
  showToast(isEdit ? 'Lead actualizado ✓' : 'Lead agregado ✓', 'success');
}

function saveLead() {
  const nombre = document.getElementById('f_nombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido','error'); return; }

  const saveBoardId = currentBoardId === '__agent__'
    ? (editingLeadId ? findLeadBoard(editingLeadId) : (BOARDS[0]?.id || null))
    : currentBoardId;
  if (!saveBoardId) return;
  const leads  = loadLeads(saveBoardId);
  const get = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

  const asignadoName = normalizeAsignado(get('f_asignado'));
  const asignadoUser = asignadoName ? loadUsers().find(u => u.name === asignadoName) : null;

  const data = {
    nombre:      nombre,
    lead:        get('f_lead'),
    email:       get('f_email'),
    telefono:    get('f_telefono'),
    hijos:       get('f_hijos'),
    direccion:   get('f_direccion'),
    ubicacion:   get('f_ubicacion'),
    entrada:     get('f_entrada') || 'Solicitud',
    asignado:    asignadoName,
    asignadoId:  asignadoUser ? asignadoUser.id : undefined,
    resultado:   get('f_resultado'),
    notas:       get('f_notas'),
  };
  if (!data.asignadoId) delete data.asignadoId;

  const isEdit = !!editingLeadId;
  let oldLead = null;

  if (editingLeadId) {
    const idx = leads.findIndex(l => l.id === editingLeadId);
    if (idx === -1) return;
    oldLead = leads[idx];

    // Reassign flow
    const newAgent = data.asignado || '';
    if (oldLead.asignado && oldLead.asignado !== newAgent) {
      checkReassign(oldLead, newAgent, (mode) => {
        const merged = { ...oldLead, ...data };
        if (!data.asignadoId) delete merged.asignadoId;
        if (mode === 'original') {
          const keep = ['id','nombre','lead','email','telefono','hijos','direccion','ubicacion','creacion','_testLead'];
          Object.keys(merged).forEach(k => { if (!keep.includes(k)) delete merged[k]; });
          merged.notas = ''; merged.resultado = ''; merged.estado = '';
          merged.asignado = newAgent;
          if (data.asignadoId) merged.asignadoId = data.asignadoId;
        }
        leads[idx] = merged;
        saveLeads(saveBoardId, leads);
        closeModal();
        renderTable();
        showToast('Lead transferido ✓', 'success');
      });
      return;
    }

    const merged = { ...oldLead, ...data };
    if (!data.asignadoId) delete merged.asignadoId;

    // Non-master + resultado changed: require justification note (same as column)
    const session = getSession();
    const resultadoChanged = data.resultado && data.resultado !== (oldLead.resultado || '');
    if (session && session.role !== 'master' && resultadoChanged) {
      if (!_confirmDestructivo(data.resultado, data.nombre)) return;
      leads[idx] = merged;
      _pendingModalSave = { leads, merged, saveBoardId, leadId: editingLeadId, oldLead, isEdit };
      closeModal();
      openResultadoNoteModal(editingLeadId, saveBoardId, data.resultado);
      return;
    }

    leads[idx] = merged;
    closeModal();
    _applyModalSave(leads, merged, saveBoardId, editingLeadId, oldLead, true);
  } else {
    data.id      = uid();
    data.creacion = today();
    leads.unshift(data);
    closeModal();
    _applyModalSave(leads, data, saveBoardId, data.id, null, false);
  }
}

// ════════════════════════════════════════════
//  DELETE
// ════════════════════════════════════════════
function askDelete(id) {
  deleteLeadId = id;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() {
  deleteLeadId = null;
  document.getElementById('confirm-overlay').classList.remove('open');
}
function confirmOverlayClick(e) {
  if (e.target === document.getElementById('confirm-overlay')) closeConfirm();
}
function confirmDelete() {
  const leadId  = deleteLeadId || editingLeadId;
  if (!leadId) return;
  const boardId = (currentBoardId === '__agent__' && editingLeadId) ? findLeadBoard(leadId) : currentBoardId;
  const lead = loadLeads(boardId).find(l => l.id === leadId);
  if (lead && lead.asignado && lead.asignado !== 'Sin asignar') {
    if (!confirm(`⚠️ Este lead está asignado a ${lead.asignado}.\n¿Seguro que quieres eliminarlo? El agente perderá acceso.`)) return;
  }
  closeModal();
  softDeleteLead(leadId, boardId);
  closeConfirm();
  renderTable();
  showToast('Lead movido a Eliminados', 'error');
}

// ════════════════════════════════════════════
//  TRASH (soft-delete)
// ════════════════════════════════════════════
const TRASH_KEY        = 'gew_trash_leads';
const DELETED_USERS_KEY = 'gew_deleted_users';

function loadDeletedUsers() {
  try { return JSON.parse(localStorage.getItem(DELETED_USERS_KEY)) || []; }
  catch { return []; }
}
async function saveDeletedUsers(users) {
  localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(users));
  supaSync(DELETED_USERS_KEY, JSON.stringify(users));
}

function loadDeletedLeads() {
  try { return JSON.parse(localStorage.getItem(TRASH_KEY)) || []; }
  catch { return []; }
}
async function saveDeletedLeads(leads) {
  localStorage.setItem(TRASH_KEY, JSON.stringify(leads));
  supaSync(TRASH_KEY, JSON.stringify(leads));
}

function softDeleteLead(leadId, boardId) {
  if (boardId === VENDIDOS_BOARD.id) {
    const session = getSession();
    if (!session || (session.role !== 'master' && session.role !== 'admin')) {
      showToast('Los leads vendidos no pueden eliminarse.', 'error');
      return;
    }
  }
  const session = getSession();
  const leads   = loadLeads(boardId);
  const lead    = leads.find(l => l.id === leadId);
  if (!lead) return;
  _deletedLeadIds.add(leadId);
  const board = getBoard(boardId);
  const trash = loadDeletedLeads();
  trash.unshift({
    ...lead,
    _deletedAt:         new Date().toISOString(),
    _deletedBy:         session ? session.name : 'Usuario',
    _originalBoardId:   boardId,
    _originalBoardName: board ? board.name : boardId
  });
  logActivity('lead_delete', 'Lead eliminado', `${lead.nombre || lead.id}${lead.asignado ? ' · Asignado a: '+lead.asignado : ''}`);
  saveDeletedLeads(trash);
  saveLeads(boardId, leads.filter(l => l.id !== leadId));
  updateTrashBadge();
}

function updateTrashBadge() {
  const _s = getSession();
  const _ln = (_s && _s.role !== 'master' && _s.role !== 'admin')
    ? new Set(_getLineUsers(_s).map(u => u.name)) : null;
  const count = loadDeletedLeads().filter(l => !_ln || _ln.has(l.asignado)).length;
  const badge = document.getElementById('sidebar-trash-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
}

// ════════════════════════════════════════════
//  CALENDAR
// ════════════════════════════════════════════
const CAL_KEY = 'gew_calendar';
let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-based
let _calSelectedDate = null;
let _editingEventId  = null;

const EVT_TYPES = {
  cita_agendada:  { label:'Cita agendada',     icon:'📅', color:'#00c875' },
  llamada_vuelta: { label:'Llamada de vuelta',  icon:'📞', color:'#3b9eff' },
  recordatorio:   { label:'Recordatorio',       icon:'🔔', color:'#fdab3d' },
  otro:           { label:'Otro',               icon:'📌', color:'#a78bfa' },
};

function loadCalEvents()  { try { return JSON.parse(localStorage.getItem(CAL_KEY)) || []; } catch { return []; } }
async function saveCalEvents(evts) {
  localStorage.setItem(CAL_KEY, JSON.stringify(evts));
  supaSync(CAL_KEY, JSON.stringify(evts));
}

function _calVisibleEvents() {
  const session = getSession();
  if (!session) return [];
  const all     = loadCalEvents();
  const fUser   = document.getElementById('cal-user-filter')?.value || '';
  if (session.role === 'master' || session.role === 'admin') {
    return fUser ? all.filter(e => e.userId === fUser) : all;
  }
  if (['manager','master_manager','supervisor_agent'].includes(session.role)) {
    const allowed = new Set(_getLineUsers(session).map(u => u.id));
    const filtered = all.filter(e => allowed.has(e.userId));
    return fUser ? filtered.filter(e => e.userId === fUser) : filtered;
  }
  return all.filter(e => e.userId === session.id);
}

function showCalendarPage() {
  showBoardView();
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('calendar-page').style.display = 'flex';
  document.getElementById('board-title').textContent     = 'Calendario';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  ['nav-calendar','nav-calendar-agent'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('active'); });
  currentBoardId = null;
  _populateCalUserFilter();
  renderCalendar();
}

function _populateCalUserFilter() {
  const session = getSession();
  const sel     = document.getElementById('cal-user-filter');
  if (!sel) return;
  const canFilter = session && (session.role === 'master' || session.role === 'admin' || session.role === 'manager' || session.role === 'master_manager' || session.role === 'supervisor_agent');
  sel.style.display = canFilter ? '' : 'none';
  if (!canFilter) return;
  const users   = loadUsers();
  let options   = [];
  if (session.role === 'master' || session.role === 'admin') {
    options = users.filter(u => u.role !== 'master');
  } else {
    const lineIds = new Set(_getLineUsers(session).map(u => u.id));
    options = users.filter(u => lineIds.has(u.id));
  }
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos</option>' +
    options.map(u => `<option value="${u.id}"${u.id===cur?' selected':''}>${esc(u.name)}</option>`).join('');
}

function renderCalendar() {
  const DAYS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-month-label').textContent = `${MONTHS[_calMonth]} ${_calYear}`;

  // Weekday headers
  document.getElementById('cal-weekdays').innerHTML =
    DAYS.map(d => `<div class="cal-weekday-lbl">${d}</div>`).join('');

  const evts   = _calVisibleEvents();
  const today  = new Date(); today.setHours(0,0,0,0);
  const first  = new Date(_calYear, _calMonth, 1);
  const last   = new Date(_calYear, _calMonth + 1, 0);
  const startDow = first.getDay(); // 0=Sun
  const totalCells = Math.ceil((startDow + last.getDate()) / 7) * 7;

  let html = '';
  for (let i = 0; i < totalCells; i++) {
    const d    = new Date(_calYear, _calMonth, i - startDow + 1);
    const iso  = d.toISOString().slice(0, 10);
    const isToday    = d.getTime() === today.getTime();
    const isSelected = iso === _calSelectedDate;
    const isOther    = d.getMonth() !== _calMonth;
    const dayEvts    = evts.filter(e => e.fecha === iso).sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
    const max        = 3;
    const pills      = dayEvts.slice(0, max).map(e =>
      `<span class="cal-event-pill type-${e.type}" title="${esc(e.titulo)}" onclick="event.stopPropagation();openDayPanel('${iso}')">${EVT_TYPES[e.type]?.icon||'📌'} ${esc(e.titulo)}</span>`
    ).join('');
    const more       = dayEvts.length > max ? `<span class="cal-more-badge">+${dayEvts.length - max} más</span>` : '';
    html += `<div class="cal-cell${isToday?' today':''}${isSelected?' selected':''}${isOther?' other-month':''}" onclick="openDayPanel('${iso}')">
      <div class="cal-cell-day">${d.getDate()}</div>
      ${pills}${more}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;

  // Refresh day panel if open
  if (_calSelectedDate) renderDayPanel(_calSelectedDate);
}

function calChangeMonth(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderCalendar();
}
function calGoToday() {
  const n   = new Date();
  _calYear  = n.getFullYear();
  _calMonth = n.getMonth();
  renderCalendar();
}

function openDayPanel(iso) {
  _calSelectedDate = iso;
  const panel = document.getElementById('cal-day-panel');
  panel.classList.remove('hidden');
  if (window.innerWidth <= 768) panel.classList.add('open');
  renderCalendar();
}
function closeDayPanel() {
  const panel = document.getElementById('cal-day-panel');
  panel.classList.remove('open');
  _calSelectedDate = null;
  renderCalendar();
}

function renderDayPanel(iso) {
  const d      = new Date(iso + 'T00:00:00');
  const label  = d.toLocaleDateString('es-US', { weekday:'long', month:'long', day:'numeric' });
  document.getElementById('cal-day-panel-title').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const evts   = _calVisibleEvents().filter(e => e.fecha === iso).sort((a,b) => (a.hora||'').localeCompare(b.hora||''));
  const el     = document.getElementById('cal-day-events');
  if (!evts.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px 10px;color:var(--text2);font-size:12px">Sin eventos este día.<br>¡Agrega uno!</div>';
    return;
  }
  const session = getSession();
  el.innerHTML = evts.map(e => {
    const cfg   = EVT_TYPES[e.type] || EVT_TYPES.otro;
    const canDel= session && (session.role === 'master' || session.role === 'admin' || e.userId === session.id);
    return `<div class="cal-evt-card type-${e.type}" onclick="openEventModal('${iso}','${e.id}')">
      <div class="cal-evt-title">${cfg.icon} ${esc(e.titulo)}</div>
      <div class="cal-evt-meta">${cfg.label}${e.hora ? ' · '+e.hora : ''}${e.notas ? '<br><span style="opacity:.7">'+esc(e.notas.slice(0,60))+(e.notas.length>60?'…':'')+'</span>' : ''}</div>
      ${e.userName && e.userId !== session?.id ? `<div class="cal-evt-user">👤 ${esc(e.userName)}</div>` : ''}
      ${canDel ? `<div style="margin-top:6px;display:flex;justify-content:flex-end"><button onclick="event.stopPropagation();deleteCalEvent('${e.id}')" style="background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;padding:0">🗑 Eliminar</button></div>` : ''}
    </div>`;
  }).join('');
}

// ── Event Modal ──────────────────────────────
let _editEventId = null;

function openEventModal(isoDate, eventId) {
  _editEventId = eventId || null;
  const session = getSession();
  const today   = (isoDate && isoDate.length === 10) ? isoDate : new Date().toISOString().slice(0,10);

  // Reset form
  document.getElementById('evt-titulo').value = '';
  document.getElementById('evt-fecha').value  = today;
  document.getElementById('evt-hora').value   = '';
  document.getElementById('evt-notas').value  = '';
  document.querySelectorAll('.evt-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.evt-type-btn[data-type="cita_agendada"]').classList.add('active');

  // Assignee dropdown
  const wrap = document.getElementById('evt-assignee-wrap');
  const sel  = document.getElementById('evt-assignee');
  const canAssign = session && (session.role === 'master' || session.role === 'admin');
  wrap.style.display = canAssign ? '' : 'none';
  if (canAssign) {
    const users = loadUsers();
    let opts = [];
    if (session.role === 'master' || session.role === 'admin') {
      opts = users.filter(u => u.role !== 'master');
    } else {
      const names = session.role === 'manager' ? getManagerAgentNames(session.id) : session.role === 'master_manager' ? getMasterManagerAgentNames(session.id) : getSupervisorAgentNames(session.id);
      opts = users.filter(u => names.includes(u.name));
    }
    sel.innerHTML = `<option value="${session.id}">${esc(session.name)} (yo)</option>` +
      opts.filter(u => u.id !== session.id).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }

  // If editing, populate
  if (_editEventId) {
    const evt = loadCalEvents().find(e => e.id === _editEventId);
    if (evt) {
      document.getElementById('event-modal-title').textContent = 'Editar Evento';
      document.getElementById('evt-titulo').value = evt.titulo;
      document.getElementById('evt-fecha').value  = evt.fecha;
      document.getElementById('evt-hora').value   = evt.hora || '';
      document.getElementById('evt-notas').value  = evt.notas || '';
      document.querySelectorAll('.evt-type-btn').forEach(b => b.classList.remove('active'));
      const tb = document.querySelector(`.evt-type-btn[data-type="${evt.type}"]`);
      if (tb) tb.classList.add('active');
      if (canAssign && evt.userId) sel.value = evt.userId;
    }
  } else {
    document.getElementById('event-modal-title').textContent = 'Nuevo Evento';
  }

  document.getElementById('event-modal-overlay').classList.add('open');
}

function closeEventModal() {
  document.getElementById('event-modal-overlay').classList.remove('open');
  _editEventId = null;
}

function selectEventType(btn) {
  document.querySelectorAll('.evt-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function saveCalEvent() {
  const titulo = document.getElementById('evt-titulo').value.trim();
  const fecha  = document.getElementById('evt-fecha').value;
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  if (!fecha)  { showToast('La fecha es requerida', 'error'); return; }

  const session  = getSession();
  const type     = document.querySelector('.evt-type-btn.active')?.dataset.type || 'otro';
  const hora     = document.getElementById('evt-hora').value;
  const notas    = document.getElementById('evt-notas').value.trim();
  const wrap     = document.getElementById('evt-assignee-wrap');
  const sel      = document.getElementById('evt-assignee');
  let   userId   = session.id;
  let   userName = session.name;

  if (wrap.style.display !== 'none' && sel.value) {
    userId = sel.value;
    const u = loadUsers().find(u => u.id === userId);
    userName = u ? u.name : session.name;
  }

  const evts = loadCalEvents();
  if (_editEventId) {
    const idx = evts.findIndex(e => e.id === _editEventId);
    if (idx !== -1) {
      evts[idx] = { ...evts[idx], titulo, type, fecha, hora, notas, userId, userName };
    }
  } else {
    evts.push({ id: 'evt_' + Date.now(), titulo, type, fecha, hora, notas, userId, userName, createdAt: new Date().toISOString(), createdBy: session.id });
  }
  await saveCalEvents(evts);
  closeEventModal();
  if (fecha !== _calSelectedDate) {
    _calSelectedDate = fecha;
    const d = new Date(fecha + 'T00:00:00');
    _calYear  = d.getFullYear();
    _calMonth = d.getMonth();
  }
  renderCalendar();
  if (_calSelectedDate) openDayPanel(_calSelectedDate);
  showToast('Evento guardado ✓', 'success');
}

async function deleteCalEvent(id) {
  if (!confirm('¿Eliminar este evento?')) return;
  await saveCalEvents(loadCalEvents().filter(e => e.id !== id));
  renderCalendar();
  if (_calSelectedDate) renderDayPanel(_calSelectedDate);
  showToast('Evento eliminado');
}

// ════════════════════════════════════════════
//  ACTIVITY LOG
// ════════════════════════════════════════════
const ACTIVITY_LOG_KEY = 'gew_activity_log';
const ACT_MAX          = 2000;

function loadActivityLog() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY)) || []; } catch { return []; }
}
function _saveActivityLogLocal(log) {
  localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(log));
  supaSync(ACTIVITY_LOG_KEY, JSON.stringify(log));
}

function logActivity(type, label, detail = '', extra = {}) {
  const session = getSession();
  if (!session) return;
  // La actividad del desarrollador (master) no es visible para nadie
  if (session.role === 'master' || session._isMaster) return;
  const entry = {
    id:       Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts:       new Date().toISOString(),
    userId:   session.id,
    userName: session.name,
    userRole: session.role,
    type,
    label,
    detail,
    ...extra
  };
  const log = loadActivityLog();
  log.unshift(entry);
  if (log.length > ACT_MAX) log.splice(ACT_MAX);
  _saveActivityLogLocal(log);
}

const ACT_CFG = {
  login:          { icon:'🔐', bg:'rgba(0,115,234,.15)',    color:'var(--accent)' },
  assign:         { icon:'👤', bg:'rgba(120,75,209,.15)',   color:'#a78bfa' },
  lead_edit:      { icon:'✏️', bg:'rgba(0,183,195,.12)',    color:'#00b7c3' },
  lead_delete:    { icon:'🗑', bg:'rgba(226,68,92,.12)',    color:'var(--red)' },
  lead_import:    { icon:'📥', bg:'rgba(0,200,117,.12)',    color:'var(--green)' },
  user_created:   { icon:'➕', bg:'rgba(0,200,117,.12)',    color:'var(--green)' },
  user_edited:    { icon:'✏️', bg:'rgba(253,171,61,.12)',   color:'var(--yellow)' },
  user_deleted:   { icon:'🗑', bg:'rgba(226,68,92,.12)',    color:'var(--red)' },
  user_approved:  { icon:'✅', bg:'rgba(0,200,117,.12)',    color:'var(--green)' },
  user_rejected:  { icon:'❌', bg:'rgba(226,68,92,.12)',    color:'var(--red)' },
  settings:       { icon:'⚙️', bg:'rgba(253,171,61,.12)',   color:'var(--yellow)' },
};

function showActivityPage() {
  showBoardView();
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('activity-page').style.display = 'flex';
  document.getElementById('board-title').textContent     = 'Actividad';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const nav = document.getElementById('nav-activity');
  if (nav) nav.classList.add('active');
  currentBoardId = null;
  _populateActivityFilters();
  renderActivityPage();
}

// ════════════════════════════════════════════
// ════════════════════════════════════════════
//  RECONCILE PAGE
// ════════════════════════════════════════════
function showReconcilePage() {
  showBoardView();
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('reconcile-page').style.display = 'flex';
  document.getElementById('board-title').textContent      = 'Reconciliar Usuarios';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const nav = document.getElementById('nav-reconcile');
  if (nav) nav.classList.add('active');
  currentBoardId = null;
  renderReconcilePage();
}

function renderReconcilePage() {
  const allUsers = loadUsers(); // includes inactive, excludes deleted

  // All unique asignado values across all boards
  const asigMap = {}; // name -> { count, boards[] }
  for (const board of BOARDS) {
    for (const l of loadLeads(board.id)) {
      if (!l.asignado || l.asignado === 'Sin asignar') continue;
      if (!asigMap[l.asignado]) asigMap[l.asignado] = { count: 0, boards: new Set() };
      asigMap[l.asignado].count++;
      asigMap[l.asignado].boards.add(board.name || board.id);
    }
  }

  const validNames  = new Set(allUsers.map(u => u.name));
  const roleLabel   = r => ({ master:'Master', admin:'Admin', master_manager:'MGA', manager:'GA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' }[r] || r);

  // --- MOVER LEADS DROPDOWNS ---
  // "De": all names that appear in leads (any name, including orphaned)
  // "A": all registered users
  const fromSel = document.getElementById('rec-move-from');
  const toSel   = document.getElementById('rec-move-to');
  if (fromSel) {
    // Collect all unique asignado names across boards
    const allAsigNames = new Set();
    for (const board of BOARDS)
      for (const l of loadLeads(board.id))
        if (l.asignado && l.asignado !== 'Sin asignar') allAsigNames.add(l.asignado);
    // Also include all user names even if they have 0 leads (so you can pick anyone)
    allUsers.forEach(u => allAsigNames.add(u.name));
    const sortedNames = [...allAsigNames].sort((a,b) => a.localeCompare(b));
    fromSel.innerHTML = '<option value="">— Elegir origen —</option>' +
      sortedNames.map(n => `<option value="${esc(n)}">${esc(n)}${asigMap[n]?' ('+asigMap[n].count+' leads)':' (0 leads)'}</option>`).join('');
    fromSel.onchange = _updateMovePreview;
  }
  if (toSel) {
    toSel.innerHTML = '<option value="">— Elegir destino —</option>' +
      [...allUsers].sort((a,b) => a.name.localeCompare(b.name))
        .map(u => `<option value="${esc(u.name)}">${esc(u.name)}${u.inactive?' (inactivo)':''}</option>`).join('');
    toSel.onchange = _updateMovePreview;
  }

  // --- USERS GRID ---
  const usersGrid = document.getElementById('rec-users-grid');
  const userCount = document.getElementById('rec-user-count');
  if (userCount) userCount.textContent = allUsers.length + ' usuarios';
  if (usersGrid) {
    usersGrid.innerHTML = allUsers
      .sort((a,b) => (a.inactive?1:0)-(b.inactive?1:0) || a.name.localeCompare(b.name))
      .map(u => {
        const leads = asigMap[u.name]?.count || 0;
        const statusColor = u.inactive ? '#ff6b6b' : '#00c875';
        const statusLabel = u.inactive ? 'INACTIVO' : 'ACTIVO';
        return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;${u.inactive?'opacity:.65':''}">
          <div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:3px">${esc(u.name)}</div>
          <div style="font-size:10px;color:var(--text2);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.email||'—')}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <span style="background:rgba(0,115,234,.12);color:var(--accent);font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px">${roleLabel(u.role)}</span>
            <span style="background:${u.inactive?'rgba(255,80,80,.12)':'rgba(0,200,117,.12)'};color:${statusColor};font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px">${statusLabel}</span>
            <span style="background:rgba(120,75,209,.1);color:#a78bfa;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px">${leads} leads</span>
          </div>
        </div>`;
      }).join('');
  }

  // --- ASIGNADOS TABLE ---
  const tableBody = document.getElementById('rec-table-body');
  const asigCount = document.getElementById('rec-asig-count');
  const entries   = Object.entries(asigMap).sort((a,b) => {
    // orphaned first, then by count desc
    const aOrphan = !validNames.has(a[0]) ? 0 : 1;
    const bOrphan = !validNames.has(b[0]) ? 0 : 1;
    return aOrphan - bOrphan || b[1].count - a[1].count;
  });

  if (asigCount) asigCount.textContent = entries.length + ' nombres';

  const candidates = allUsers
    .filter(u => ['agent','supervisor_agent','manager','master_manager','admin','caller'].includes(u.role))
    .sort((a,b) => a.name.localeCompare(b.name));

  if (tableBody) {
    // header
    tableBody.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 80px 120px 1fr 130px;gap:0;background:var(--card2);padding:8px 16px;font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">
        <div>Nombre en leads</div>
        <div>Leads</div>
        <div>Estado</div>
        <div>Asignar a usuario</div>
        <div></div>
      </div>
      ${entries.map(([name, info]) => {
        const isValid   = validNames.has(name);
        const match     = _bestMatch(name, allUsers);
        const preselect = isValid ? name : (match && match.score >= 0.5 ? match.user.name : '');
        const statusDot = isValid
          ? `<span style="color:#00c875;font-size:11px;font-weight:600">✓ Usuario activo</span>`
          : `<span style="color:#f59e0b;font-size:11px;font-weight:600">⚠ Sin usuario</span>`;
        const suggestNote = (!isValid && match && match.score >= 0.5)
          ? `<div style="font-size:10px;color:#fdab3d;margin-top:2px">💡 ${Math.round(match.score*100)}% similar a "${esc(match.user.name)}"</div>` : '';
        const opts = candidates.map(u =>
          `<option value="${esc(u.name)}" ${u.name===preselect?'selected':''}>${esc(u.name)}${u.inactive?' (inactivo)':''}</option>`
        ).join('');
        const rowBg = isValid ? '' : 'background:rgba(245,158,11,.04);';
        const key   = encodeURIComponent(name);
        return `<div style="display:grid;grid-template-columns:1fr 80px 120px 1fr 130px;align-items:center;gap:0;padding:10px 16px;border-bottom:1px solid var(--border);${rowBg}">
          <div>
            <div style="font-weight:600;font-size:13px;color:var(--text)">${esc(name)}</div>
            <div style="font-size:10px;color:var(--text2);margin-top:1px">${[...info.boards].slice(0,2).join(', ')}${info.boards.size>2?'…':''}</div>
            ${suggestNote}
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${info.count}</div>
          <div>${statusDot}</div>
          <div>
            <select id="rec-sel-${key}" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:6px;font-size:12px;width:100%">
              <option value="">— Sin cambiar —</option>
              ${opts}
            </select>
          </div>
          <div style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
            <button onclick="invertReconcileRow('${esc(name)}')" title="Invertir: poner este nombre como destino en la fila contraria" style="background:rgba(253,171,61,.12);color:#fdab3d;border:1px solid rgba(253,171,61,.35);padding:4px 8px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">↔</button>
            <button onclick="applyReconcileRow('${esc(name)}')" style="background:rgba(0,115,234,.15);color:var(--accent);border:1px solid rgba(0,115,234,.3);padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Aplicar</button>
          </div>
        </div>`;
      }).join('')}`;
  }
}

async function applyReconcileRow(oldName) {
  const key = encodeURIComponent(oldName);
  const sel = document.getElementById('rec-sel-' + key);
  if (!sel || !sel.value || sel.value === oldName) { showToast('Sin cambios para aplicar'); return; }
  const newName = sel.value;
  let total = 0;
  for (const board of BOARDS) {
    const bLeads = loadLeads(board.id);
    let changed = false;
    bLeads.forEach(l => { if (l.asignado === oldName) { l.asignado = newName; changed = true; total++; } });
    if (changed) await saveLeads(board.id, bLeads);
  }
  showToast(`✅ ${total} lead(s) de "${oldName}" → "${newName}"`);
  renderReconcilePage();
}

async function applyReconcileAll() {
  const el = document.getElementById('rec-table-body');
  if (!el) return;
  let applied = 0;
  const sels = el.querySelectorAll('select[id^="rec-sel-"]');
  for (const sel of sels) {
    if (!sel.value) continue;
    const oldName = decodeURIComponent(sel.id.replace('rec-sel-', ''));
    if (sel.value === oldName) continue;
    const newName = sel.value;
    for (const board of BOARDS) {
      const bLeads = loadLeads(board.id);
      let changed = false;
      bLeads.forEach(l => { if (l.asignado === oldName) { l.asignado = newName; changed = true; applied++; } });
      if (changed) await saveLeads(board.id, bLeads);
    }
  }
  showToast(`✅ ${applied} lead(s) reasignados`);
  renderReconcilePage();
}

function _updateMovePreview() {
  const from = document.getElementById('rec-move-from')?.value;
  const to   = document.getElementById('rec-move-to')?.value;
  const prev = document.getElementById('rec-move-preview');
  if (!prev) return;
  if (!from || !to) { prev.textContent = ''; return; }
  if (from === to)  { prev.innerHTML = '<span style="color:#f59e0b">⚠ Origen y destino son el mismo usuario.</span>'; return; }
  let count = 0;
  for (const board of BOARDS)
    count += loadLeads(board.id).filter(l => l.asignado === from).length;
  prev.innerHTML = count > 0
    ? `Se moverán <strong>${count} lead${count!==1?'s':''}</strong> de <em>${esc(from)}</em> → <em>${esc(to)}</em>`
    : `<span style="color:var(--text2)">No hay leads asignados a "${esc(from)}".</span>`;
}

async function applyMoveLeads() {
  const from = document.getElementById('rec-move-from')?.value;
  const to   = document.getElementById('rec-move-to')?.value;
  if (!from || !to) { showToast('Elige origen y destino'); return; }
  if (from === to)  { showToast('Origen y destino son el mismo', 'error'); return; }
  let total = 0;
  for (const board of BOARDS) {
    const leads = loadLeads(board.id);
    let changed = false;
    leads.forEach(l => { if (l.asignado === from) { l.asignado = to; changed = true; total++; } });
    if (changed) await saveLeads(board.id, leads);
  }
  if (total === 0) { showToast(`No había leads de "${from}"`); return; }
  showToast(`✅ ${total} lead${total!==1?'s':''} movidos de "${from}" → "${to}"`);
  renderReconcilePage();
}

function closeAgentSummary() {
  document.getElementById('agent-summary-overlay').classList.remove('open');
}

function showAgentSummary(userId) {
  const allUsers = loadUsers();
  const u = allUsers.find(x => x.id === userId);
  if (!u) return;

  // --- Build work line (chain upward) ---
  const roleLabel = r => ({ master:'Desarrollador', admin:'Admin', master_manager:'MGA', manager:'GA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' }[r] || r);
  const chain = [];
  let sup = u.orgSupervisorId    ? allUsers.find(x => x.id === u.orgSupervisorId)    : null;
  let mgr = u.orgManagerId       ? allUsers.find(x => x.id === u.orgManagerId)       : null;
  let mga = u.orgMasterManagerId ? allUsers.find(x => x.id === u.orgMasterManagerId) : null;
  let adm = u.orgAdminId         ? allUsers.find(x => x.id === u.orgAdminId)         : null;
  if (sup) chain.push({ label: roleLabel(sup.role), name: sup.name });
  if (mgr) chain.push({ label: roleLabel(mgr.role), name: mgr.name });
  if (mga) chain.push({ label: roleLabel(mga.role), name: mga.name });
  if (adm) chain.push({ label: roleLabel(adm.role), name: adm.name });

  // --- Count personal leads ---
  let myLeads = 0;
  for (const b of BOARDS) myLeads += loadLeads(b.id).filter(l => l.asignado === u.name).length;

  // --- Count team leads (everyone in their line) ---
  const lineUsers = _getLineUsers({ ...u, role: u.role });
  const lineNames = new Set(lineUsers.map(x => x.name));
  let lineLeads = 0;
  for (const b of BOARDS) lineLeads += loadLeads(b.id).filter(l => lineNames.has(l.asignado)).length;

  // --- Last login ---
  const fmtDate = iso => {
    if (!iso) return 'Nunca registrada';
    const d = new Date(iso);
    return d.toLocaleDateString('es-US', { day:'2-digit', month:'short', year:'numeric' }) +
           ' · ' + d.toLocaleTimeString('es-US', { hour:'2-digit', minute:'2-digit' });
  };

  // --- Avatar color ---
  const avatarBg = u.role==='admin'?'var(--accent)':u.role==='master_manager'?'#00b7c3':u.role==='manager'?'var(--green)':u.role==='supervisor_agent'?'#ff8c00':'var(--purple)';
  const initials = getInitials(u.name);
  const roleCls  = `role-${u.role}`;

  const chainHtml = chain.length
    ? chain.map(c => `<span style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;white-space:nowrap"><span style="color:var(--text2);font-size:10px">${c.label} · </span>${esc(c.name)}</span>`).join('<span style="color:var(--text2);padding:0 4px">→</span>')
    : `<span style="color:var(--text2);font-size:12px">Sin línea asignada</span>`;

  const html = `
    <div style="padding:24px 24px 20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${esc(u.name)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:1px">${esc(u.email||'—')}</div>
            <span class="role-badge ${roleCls}" style="margin-top:5px;display:inline-block">${roleLabel(u.role)}</span>
            ${u.inactive ? '<span class="badge-inactive" style="margin-left:4px">INACTIVO</span>' : ''}
          </div>
        </div>
        <button onclick="closeAgentSummary()" style="background:none;border:none;color:var(--text2);font-size:18px;cursor:pointer;padding:0">✕</button>
      </div>

      <!-- Línea de trabajo -->
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Línea de trabajo</div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">${chainHtml}</div>
      </div>

      <!-- Última conexión -->
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">🕐</span>
        <div>
          <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Última conexión</div>
          <div style="font-size:13px;color:var(--text);font-weight:500;margin-top:2px">${fmtDate(u.lastLogin)}</div>
        </div>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:var(--accent)">${myLeads}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">Sus leads asignados</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#00c875">${lineLeads}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">Leads de su línea</div>
        </div>
      </div>
    </div>`;

  document.getElementById('agent-summary-content').innerHTML = html;
  document.getElementById('agent-summary-overlay').classList.add('open');
}

function invertReconcileRow(sourceName) {
  // Get selected target for this row
  const key    = encodeURIComponent(sourceName);
  const sel    = document.getElementById('rec-sel-' + key);
  if (!sel || !sel.value) { showToast('Primero selecciona un usuario destino en esta fila'); return; }
  const targetName = sel.value;

  // Find the row where source = targetName and set its dropdown to sourceName
  const targetKey = encodeURIComponent(targetName);
  const targetSel = document.getElementById('rec-sel-' + targetKey);
  if (targetSel) {
    // Set the target row's dropdown to sourceName
    for (let i = 0; i < targetSel.options.length; i++) {
      if (targetSel.options[i].value === sourceName) {
        targetSel.selectedIndex = i;
        break;
      }
    }
    // Clear this row's selection (no longer needed)
    sel.value = '';
    showToast(`↔ Invertido: "${targetName}" → "${sourceName}"`);
  } else {
    // The target name has no leads row — just clear this row and explain
    sel.value = '';
    showToast(`↔ La fila "${targetName}" no existe en leads. Selección limpiada.`);
  }
}

// ════════════════════════════════════════════
//  STATS PAGE
// ════════════════════════════════════════════
let _statsTlMode = 'day'; // day | week | month

function showStatsPage() {
  const session = getSession();
  if (!session || session.role === 'agent') return;
  showBoardView();
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('stats-page').style.display    = 'flex';
  document.getElementById('board-title').textContent     = 'Estadísticas';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const nav = document.getElementById('nav-stats');
  if (nav) nav.classList.add('active');
  currentBoardId = null;
  _populateStatsFilters();
  renderStatsPage();
}

function _populateStatsFilters() {
  const session = getSession();
  const bSel = document.getElementById('stats-filter-board');
  if (!bSel) return;
  const curB = bSel.value;
  bSel.innerHTML = '<option value="">Todos los boards</option>' +
    BOARDS.map(b => `<option value="${b.id}"${b.id===curB?' selected':''}>${esc(b.name)}</option>`).join('');
  const aSel = document.getElementById('stats-filter-agent');
  const curA = aSel.value;
  const isFullOrg = !session || session.role === 'master' || session.role === 'admin';
  const _lineUsersStats = isFullOrg ? null : _getLineUsers(session);
  const lineNamesStats  = _lineUsersStats ? new Set(_lineUsersStats.map(u => u.name)) : null;
  const lineIdsStats    = _lineUsersStats ? new Set(_lineUsersStats.map(u => u.id))   : null;
  const allLeads = BOARDS.flatMap(b => loadLeads(b.id));
  const agents = [...new Set(
    allLeads
      .filter(l => {
        if (!l.asignado && !l.asignadoId) return false;
        if (isFullOrg) return l.asignado && l.asignado !== 'Sin asignar';
        const byId = l.asignadoId && lineIdsStats ? lineIdsStats.has(l.asignadoId) : false;
        return byId || (lineNamesStats && lineNamesStats.has(l.asignado));
      })
      .map(l => l.asignado)
      .filter(a => a && a !== 'Sin asignar')
  )].sort();
  aSel.innerHTML = '<option value="">Todos los agentes</option>' +
    agents.map(a => `<option value="${esc(a)}"${a===curA?' selected':''}>${esc(a)}</option>`).join('');
}

function clearStatsFilters() {
  ['stats-filter-board','stats-filter-agent','stats-filter-from','stats-filter-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  renderStatsPage();
}

function setStatsTlMode(mode) {
  _statsTlMode = mode;
  renderStatsPage();
}

function _getStatsLeads() {
  const session = getSession();
  const board = document.getElementById('stats-filter-board')?.value || '';
  const agent = document.getElementById('stats-filter-agent')?.value || '';
  const from  = document.getElementById('stats-filter-from')?.value || '';
  const to    = document.getElementById('stats-filter-to')?.value || '';
  const boards = board ? BOARDS.filter(b => b.id === board) : BOARDS;
  let leads = boards.flatMap(b => loadLeads(b.id).map(l => ({...l, _boardId: b.id, _boardName: b.name})));
  // Scope to line for non-admin/master roles
  const isFullOrg = !session || session.role === 'master' || session.role === 'admin';
  if (!isFullOrg) {
    const lineNames = new Set(_getLineUsers(session).map(u => u.name));
    leads = leads.filter(l => lineNames.has(l.asignado));
  }
  if (agent) leads = leads.filter(l => l.asignado === agent);
  if (from)  leads = leads.filter(l => l.creacion >= from);
  if (to)    leads = leads.filter(l => l.creacion <= to);
  return leads;
}

function renderStatsPage() {
  const body = document.getElementById('stats-body');
  if (!body) return;
  const leads   = _getStatsLeads();
  const deleted = loadDeletedLeads();
  const actLog  = loadActivityLog();
  const board   = document.getElementById('stats-filter-board')?.value || '';
  const agent   = document.getElementById('stats-filter-agent')?.value || '';
  const from    = document.getElementById('stats-filter-from')?.value || '';
  const to      = document.getElementById('stats-filter-to')?.value || '';

  // ── SUMMARY CARDS ──
  const total     = leads.length;
  const unassigned = leads.filter(l => !l.asignado || l.asignado === 'Sin asignar').length;
  const assigned   = total - unassigned;
  const _statsSession = getSession();
  const _statsIsFullOrg = !_statsSession || _statsSession.role === 'master' || _statsSession.role === 'admin';
  const _statsLineNames = _statsIsFullOrg ? null : new Set(_getLineUsers(_statsSession).map(u => u.name));
  const delFiltered = deleted.filter(l =>
    (_statsIsFullOrg || _statsLineNames.has(l.asignado)) &&
    (!board || l._originalBoardId === board) &&
    (!agent || l.asignado === agent) &&
    (!from  || (l.creacion||'') >= from) &&
    (!to    || (l.creacion||'') <= to)
  );

  // ── TIMELINE DATA ──
  function tlKey(dateStr, mode) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return null;
    if (mode === 'month') return dateStr.slice(0,7);
    if (mode === 'week') {
      const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d); mon.setDate(diff);
      return mon.toISOString().slice(0,10);
    }
    return dateStr;
  }
  const tlMap = {};
  leads.forEach(l => {
    const k = tlKey(l.creacion, _statsTlMode);
    if (k) tlMap[k] = (tlMap[k]||0) + 1;
  });
  const tlKeys = Object.keys(tlMap).sort().slice(-60);
  const tlMax  = Math.max(...tlKeys.map(k => tlMap[k]), 1);

  function tlLabel(k) {
    if (_statsTlMode === 'month') {
      const [y,m] = k.split('-');
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return months[parseInt(m)-1]+' '+y.slice(2);
    }
    if (_statsTlMode === 'week') return k.slice(5).replace('-','/');
    return k.slice(5).replace('-','/');
  }

  const tlBars = tlKeys.map(k => {
    const h = Math.max(4, Math.round(tlMap[k] / tlMax * 108));
    const isToday = k === new Date().toISOString().slice(0,10);
    const barColor = isToday ? 'var(--green)' : 'var(--accent)';
    return `<div class="stats-tl-col" title="${k}: ${tlMap[k]} leads">
      <div class="stats-tl-val">${tlMap[k]}</div>
      <div class="stats-tl-spacer"></div>
      <div class="stats-tl-bar" style="height:${h}px;background:${barColor}"></div>
      <div class="stats-tl-lbl">${tlLabel(k)}</div>
    </div>`;
  }).join('');

  // ── LEADS BY BOARD ──
  const boardCounts = BOARDS.map(b => {
    const cnt = leads.filter(l => l._boardId === b.id).length;
    return { name: b.name, icon: b.icon, cnt };
  }).filter(x => x.cnt > 0).sort((a,b) => b.cnt - a.cnt);
  const maxBoard = Math.max(...boardCounts.map(x => x.cnt), 1);

  // ── LEADS BY AGENT ──
  const agentMap2 = {};
  leads.forEach(l => {
    const a = l.asignado || 'Sin asignar';
    if (!agentMap2[a]) agentMap2[a] = 0;
    agentMap2[a]++;
  });
  const agentRows = Object.entries(agentMap2).sort((a,b) => b[1]-a[1]).slice(0,20);
  const maxAgent = Math.max(...agentRows.map(r => r[1]), 1);

  // ── LEADS BY RESULT ──
  const resultMap = {};
  leads.forEach(l => {
    const r = l.resultado || '(Sin resultado)';
    resultMap[r] = (resultMap[r]||0)+1;
  });
  const resultRows = Object.entries(resultMap).sort((a,b) => b[1]-a[1]);
  const maxResult  = Math.max(...resultRows.map(r => r[1]), 1);

  // ── DELETED LEADS ──
  const delRows = delFiltered.sort((a,b) => (b._deletedAt||'').localeCompare(a._deletedAt||'')).slice(0,50);

  // ── RESULT CHANGES from activity log ──
  let resChanges = actLog.filter(e => e.type === 'lead_edit' && e.detail && e.detail.includes('resultado'));
  if (!_statsIsFullOrg) resChanges = resChanges.filter(e => !e.user || _statsLineNames.has(e.user));
  if (board) resChanges = resChanges.filter(e => e.boardId === board || (e.detail&&e.detail.includes(board)));
  if (agent) resChanges = resChanges.filter(e => e.detail&&e.detail.toLowerCase().includes(agent.toLowerCase()));
  if (from)  resChanges = resChanges.filter(e => e.ts >= from);
  if (to)    resChanges = resChanges.filter(e => e.ts.slice(0,10) <= to);
  resChanges = resChanges.slice(0, 50);

  const PALETTE = ['#0073ea','#00c875','#fdab3d','#e2445c','#784bd1','#00b7c3','#ff6b6b','#4ecdc4','#45b7d1','#96ceb4'];

  body.innerHTML = `
    <!-- SUMMARY -->
    <div class="stats-section">
      <div class="stats-section-head">
        <div class="stats-section-title">Resumen general</div>
      </div>
      <div class="stats-section-body">
        <div class="stats-cards-row">
          <div class="stats-card">
            <div class="stats-card-val" style="color:var(--accent)">${total}</div>
            <div class="stats-card-lbl">Total leads activos</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-val" style="color:var(--green)">${assigned}</div>
            <div class="stats-card-lbl">Asignados</div>
            <div class="stats-card-sub">${total ? Math.round(assigned/total*100) : 0}% del total</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-val" style="color:var(--yellow)">${unassigned}</div>
            <div class="stats-card-lbl">Sin asignar</div>
            <div class="stats-card-sub">${total ? Math.round(unassigned/total*100) : 0}% del total</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-val" style="color:var(--red)">${delFiltered.length}</div>
            <div class="stats-card-lbl">Eliminados</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-val">${BOARDS.length}</div>
            <div class="stats-card-lbl">Boards activos</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TIMELINE -->
    <div class="stats-section">
      <div class="stats-section-head">
        <div class="stats-section-title">📅 Leads por fecha de creación</div>
        <div class="stats-tl-toggle">
          <button class="stats-tl-btn${_statsTlMode==='day'?' active':''}" onclick="setStatsTlMode('day')">Día</button>
          <button class="stats-tl-btn${_statsTlMode==='week'?' active':''}" onclick="setStatsTlMode('week')">Semana</button>
          <button class="stats-tl-btn${_statsTlMode==='month'?' active':''}" onclick="setStatsTlMode('month')">Mes</button>
        </div>
      </div>
      <div class="stats-section-body">
        ${tlKeys.length ? `
          <div class="stats-tl-wrap">
            <div class="stats-tl-inner">${tlBars}</div>
          </div>
        ` : '<div style="color:var(--text2);font-size:13px;padding:16px 0">Sin datos para el período seleccionado.</div>'}
      </div>
    </div>

    <!-- BY BOARD & BY RESULT (2 cols) -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="stats-section">
        <div class="stats-section-head"><div class="stats-section-title">📋 Leads por board</div></div>
        <div class="stats-section-body">
          ${boardCounts.length ? `<div class="stats-bar-list">
            ${boardCounts.map((b,i) => `
              <div class="stats-bar-row">
                <div class="stats-bar-label" title="${esc(b.name)}">${b.icon} ${esc(b.name)}</div>
                <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(b.cnt/maxBoard*100)}%;background:${PALETTE[i%PALETTE.length]}"></div></div>
                <div class="stats-bar-val">${b.cnt}</div>
              </div>`).join('')}
          </div>` : '<div style="color:var(--text2);font-size:12px">Sin datos.</div>'}
        </div>
      </div>
      <div class="stats-section">
        <div class="stats-section-head"><div class="stats-section-title">🏷 Leads por resultado</div></div>
        <div class="stats-section-body">
          ${resultRows.length ? `<div class="stats-bar-list">
            ${resultRows.map((r,i) => `
              <div class="stats-bar-row">
                <div class="stats-bar-label" title="${esc(r[0])}">${esc(r[0])}</div>
                <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(r[1]/maxResult*100)}%;background:${PALETTE[i%PALETTE.length]}"></div></div>
                <div class="stats-bar-val">${r[1]}</div>
              </div>`).join('')}
          </div>` : '<div style="color:var(--text2);font-size:12px">Sin datos.</div>'}
        </div>
      </div>
    </div>

    <!-- BY AGENT -->
    <div class="stats-section">
      <div class="stats-section-head"><div class="stats-section-title">👤 Leads por agente</div></div>
      <div class="stats-section-body">
        ${agentRows.length ? `<div class="stats-bar-list">
          ${agentRows.map((r,i) => `
            <div class="stats-bar-row">
              <div class="stats-bar-label" title="${esc(r[0])}">${esc(r[0])}</div>
              <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${Math.round(r[1]/maxAgent*100)}%;background:${PALETTE[i%PALETTE.length]}"></div></div>
              <div class="stats-bar-val">${r[1]}</div>
            </div>`).join('')}
        </div>` : '<div style="color:var(--text2);font-size:12px">Sin datos.</div>'}
      </div>
    </div>

    <!-- DELETED LEADS -->
    <div class="stats-section">
      <div class="stats-section-head">
        <div class="stats-section-title">🗑 Leads eliminados <span style="font-size:11px;font-weight:400;color:var(--text2);margin-left:6px">(${delFiltered.length} total)</span></div>
      </div>
      <div class="stats-section-body" style="padding:0">
        ${delRows.length ? `
        <table class="stats-table">
          <thead><tr style="background:var(--card2)">
            <th>Nombre</th><th>Board</th><th>Asignado a</th><th>Resultado</th><th>Eliminado</th><th>Por</th>
          </tr></thead>
          <tbody>${delRows.map(l => {
            const d = l._deletedAt ? new Date(l._deletedAt).toLocaleString('es-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
            return `<tr>
              <td style="font-weight:500">${esc(l.nombre||'—')}</td>
              <td style="color:var(--text2)">${esc(l._originalBoardName||'—')}</td>
              <td>${esc(l.asignado||'Sin asignar')}</td>
              <td><span class="stats-del-badge" style="background:rgba(226,68,92,.1);color:var(--red)">${esc(l.resultado||'—')}</span></td>
              <td style="color:var(--text2);font-size:11px;white-space:nowrap">${d}</td>
              <td style="color:var(--text2);font-size:11px">${esc(l._deletedBy||'—')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ` : '<div style="text-align:center;padding:32px 20px;color:var(--text2);font-size:12px">No hay leads eliminados para los filtros seleccionados.</div>'}
      </div>
    </div>

    <!-- RESULT CHANGES -->
    <div class="stats-section">
      <div class="stats-section-head">
        <div class="stats-section-title">🔄 Cambios de resultado recientes</div>
      </div>
      <div class="stats-section-body" style="padding:0">
        ${resChanges.length ? `
        <table class="stats-table">
          <thead><tr style="background:var(--card2)"><th>Lead</th><th>Detalle</th><th>Por</th><th>Fecha</th></tr></thead>
          <tbody>${resChanges.map(e => {
            const d = new Date(e.ts).toLocaleString('es-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
            return `<tr>
              <td style="font-weight:500">${esc(e.detail?.split('·')[0]?.trim()||'—')}</td>
              <td style="color:var(--text2);font-size:11px">${esc(e.detail||'')}</td>
              <td style="font-size:11px">${esc(e.userName||'—')}</td>
              <td style="color:var(--text2);font-size:11px;white-space:nowrap">${d}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        ` : '<div style="text-align:center;padding:32px 20px;color:var(--text2);font-size:12px">No hay cambios registrados.</div>'}
      </div>
    </div>
  `;
}

function _populateActivityFilters() {
  const viewer = getSession();
  const viewerIsMaster = viewer && viewer.role === 'master';
  let log = loadActivityLog();
  if (!viewerIsMaster) log = log.filter(e => e.userRole !== 'master');
  const sel  = document.getElementById('act-filter-user');
  if (!sel) return;
  const names = [...new Set(log.map(e => e.userName))].sort();
  const cur   = sel.value;
  sel.innerHTML = '<option value="">Todos los usuarios</option>' +
    names.map(n => `<option value="${esc(n)}"${n===cur?' selected':''}>${esc(n)}</option>`).join('');
}

function clearActivityFilters() {
  ['act-filter-user','act-filter-type','act-filter-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderActivityPage();
}

function clearActivityLog() {
  const session = getSession();
  if (!session || (session.role !== 'master' && session.role !== 'admin')) return;
  if (!confirm('¿Limpiar todo el historial de actividad? Esta acción no se puede deshacer.')) return;
  _saveActivityLogLocal([]);
  renderActivityPage();
  showToast('Historial limpiado');
}

function renderActivityPage() {
  const el = document.getElementById('activity-list');
  if (!el) return;

  const fUser = (document.getElementById('act-filter-user')?.value  || '').toLowerCase();
  const fType = document.getElementById('act-filter-type')?.value   || '';
  const fDate = document.getElementById('act-filter-date')?.value   || '';

  const viewer = getSession();
  const viewerIsMaster = viewer && viewer.role === 'master';
  let log = loadActivityLog();
  if (!viewerIsMaster) log = log.filter(e => e.userRole !== 'master');
  if (fUser) log = log.filter(e => e.userName.toLowerCase() === fUser);
  if (fType) log = log.filter(e => e.type === fType);
  if (fDate) log = log.filter(e => e.ts.startsWith(fDate));

  if (!log.length) {
    el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text2);font-size:13px">Sin actividad registrada.</div>';
    return;
  }

  const ROLE_LABELS = { master:'Desarrollador', admin:'Administrador', manager:'GA', master_manager:'MGA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' };

  let html = '';
  let lastDay = '';
  log.forEach(e => {
    const d   = new Date(e.ts);
    const day = d.toLocaleDateString('es-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (day !== lastDay) {
      html += `<div class="act-day-header">${day}</div>`;
      lastDay = day;
    }
    const cfg  = ACT_CFG[e.type] || { icon:'📌', bg:'rgba(255,255,255,.06)', color:'var(--text2)' };
    const time = d.toLocaleTimeString('es-US', { hour:'2-digit', minute:'2-digit' });
    const roleLabel = ROLE_LABELS[e.userRole] || e.userRole;
    html += `
      <div class="act-entry">
        <div class="act-icon" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon}</div>
        <div class="act-body">
          <div class="act-action" style="color:${cfg.color}">${esc(e.label)}</div>
          ${e.detail ? `<div class="act-detail">${esc(e.detail)}</div>` : ''}
          <div class="act-meta">
            <span class="act-user-badge">${esc(e.userName)} · ${roleLabel}</span>
            <span class="act-time">${time}</span>
          </div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
}

function showTrashPage() {
  showBoardView();
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('trash-page').classList.add('visible');
  document.getElementById('board-title').textContent = 'Eliminados';
  document.querySelectorAll('.board-item').forEach(el => el.classList.remove('active'));
  const nt = document.getElementById('nav-trash');
  if (nt) nt.classList.add('active');
  currentBoardId = null;

  // populate board filter scoped to line
  const sel = document.getElementById('trash-board-filter');
  if (sel) {
    const _fs = getSession();
    const _fln = (_fs && _fs.role !== 'master' && _fs.role !== 'admin')
      ? new Set(_getLineUsers(_fs).map(u => u.name)) : null;
    const scopedDeleted = loadDeletedLeads().filter(l => !_fln || _fln.has(l.asignado));
    const boardNames = [...new Set(scopedDeleted.map(l => l._originalBoardName).filter(Boolean))];
    sel.innerHTML = '<option value="">Todos los boards</option>' +
      boardNames.map(n => `<option value="${n}">${esc(n)}</option>`).join('');
  }

  document.getElementById('trash-search').value = '';
  const emptyBtn = document.getElementById('empty-trash-btn');
  if (emptyBtn) emptyBtn.style.display = getSession()?.role === 'master' ? '' : 'none';
  renderTrashTable();
}

function renderTrashTable() {
  const _ts = getSession();
  const _tln = (_ts && _ts.role !== 'master' && _ts.role !== 'admin')
    ? new Set(_getLineUsers(_ts).map(u => u.name)) : null;
  const all    = loadDeletedLeads().filter(l => !_tln || _tln.has(l.asignado));
  const q      = (document.getElementById('trash-search')?.value || '').toLowerCase();
  const bFilter= document.getElementById('trash-board-filter')?.value || '';

  const filtered = all.filter(l => {
    if (bFilter && l._originalBoardName !== bFilter) return false;
    if (q && ![(l.nombre||''), (l.telefono||''), (l.email||'')].some(v => v.toLowerCase().includes(q))) return false;
    return true;
  });

  const label = document.getElementById('trash-count-label');
  if (label) label.textContent = `${all.length} lead${all.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('trash-tbody');
  const empty = document.getElementById('trash-empty');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  const session = getSession();
  const canPerm = session && session.role === 'master';

  tbody.innerHTML = filtered.map(l => {
    const date = l._deletedAt ? new Date(l._deletedAt).toLocaleString('es', { dateStyle:'short', timeStyle:'short' }) : '—';
    return `<tr>
      <td style="font-weight:600;color:#fff">${esc(l.nombre||'—')}</td>
      <td>${esc(l.telefono||'—')}</td>
      <td><span class="trash-board-tag">${esc(l._originalBoardName||'—')}</span></td>
      <td class="trash-by">${esc(l.asignado||'Sin asignar')}</td>
      <td class="trash-by">${esc(l._deletedBy||'—')}</td>
      <td class="trash-date">${date}</td>
      <td>
        <div class="trash-actions">
          <button class="btn btn-primary btn-sm" onclick="openRestoreModal('${l.id}')">↩️ Restaurar</button>
          ${canPerm ? `<button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="permanentDeleteLead('${l.id}')">🗑</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

let _restoreLeadId = null;
function openRestoreModal(leadId) {
  _restoreLeadId = leadId;
  const lead = loadDeletedLeads().find(l => l.id === leadId);
  const sel  = document.getElementById('restore-board-sel');
  sel.innerHTML = BOARDS.map(b =>
    `<option value="${b.id}" ${b.id === (lead?._originalBoardId) ? 'selected' : ''}>${esc(b.name)}</option>`
  ).join('');
  document.getElementById('restore-modal-overlay').classList.add('open');
}
function closeRestoreModal() {
  _restoreLeadId = null;
  document.getElementById('restore-modal-overlay').classList.remove('open');
}
async function confirmRestore() {
  if (!_restoreLeadId) return;
  const trash   = loadDeletedLeads();
  const idx     = trash.findIndex(l => l.id === _restoreLeadId);
  if (idx === -1) { closeRestoreModal(); return; }
  const lead    = { ...trash[idx] };
  const destId  = document.getElementById('restore-board-sel').value;

  // strip trash metadata
  delete lead._deletedAt; delete lead._deletedBy;
  delete lead._originalBoardId; delete lead._originalBoardName;

  const existing = loadLeads(destId);
  existing.unshift(lead);
  await saveLeads(destId, existing);

  trash.splice(idx, 1);
  await saveDeletedLeads(trash);

  closeRestoreModal();
  updateTrashBadge();
  renderTrashTable();
  // refresh board filter dropdown
  const sel = document.getElementById('trash-board-filter');
  if (sel) {
    const boardNames = [...new Set(loadDeletedLeads().map(l => l._originalBoardName).filter(Boolean))];
    sel.innerHTML = '<option value="">Todos los boards</option>' +
      boardNames.map(n => `<option value="${n}">${esc(n)}</option>`).join('');
  }
  const board = getBoard(destId);
  showToast(`Lead restaurado en ${board ? board.name : destId} ✓`, 'success');
}

async function permanentDeleteLead(leadId) {
  if (!confirm('¿Eliminar permanentemente este lead? Esta acción no se puede deshacer.')) return;
  const allTrash = loadDeletedLeads();
  const lead = allTrash.find(l => l.id === leadId);
  if (lead) _vaultLeads([lead]);
  const trash = allTrash.filter(l => l.id !== leadId);
  await saveDeletedLeads(trash);
  updateTrashBadge();
  renderTrashTable();
  showToast('Lead eliminado permanentemente', 'error');
}

async function emptyTrash() {
  const session = getSession();
  if (!session || session.role !== 'master') return;
  const count = loadDeletedLeads().length;
  if (count === 0) { showToast('La papelera ya está vacía', 'success'); return; }
  if (!confirm(`¿Vaciar la papelera? Se eliminarán permanentemente ${count} lead${count !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`)) return;
  _vaultLeads(loadDeletedLeads());
  await saveDeletedLeads([]);
  updateTrashBadge();
  renderTrashTable();
  logActivity('trash_emptied', 'Papelera vaciada', `${count} leads eliminados permanentemente`);
  showToast(`Papelera vaciada · ${count} lead${count !== 1 ? 's' : ''} eliminados`, 'error');
}

// ════════════════════════════════════════════
//  SCRIPTS DE LLAMADA
// ════════════════════════════════════════════
const SCRIPTS_KEY = 'gew_scripts';

function loadScripts() {
  try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY)) || []; }
  catch { return []; }
}
async function saveScripts(scripts) {
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
  supaSync(SCRIPTS_KEY, JSON.stringify(scripts));
}

let _currentScriptId = null;

function getOrgScripts() {
  const session = getSession();
  if (!session) return [];
  const all = loadScripts();
  if (session.role === 'master') return all;
  // admin owns org scripts; all other roles in the same org see the same scripts
  const orgAdminId = session.role === 'admin' ? session.id : (session.orgAdminId || session.id);
  return all.filter(s => s.orgAdminId === orgAdminId);
}

function showScriptsPage() {
  const session = getSession();
  if (!session) return;

  // hide all other views
  document.getElementById('settings-page').classList.remove('visible');
  document.getElementById('trash-page').classList.remove('visible');
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('bulk-bar').classList.remove('visible');

  // clear other nav actives
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const navScripts = document.getElementById('nav-scripts');
  if (navScripts) navScripts.classList.add('active');

  document.getElementById('board-title').textContent = 'Scripts de Llamada';

  // show/hide toolbar and add button based on role
  const canEdit = session.role === 'admin' || session.role === 'master';
  document.getElementById('scripts-toolbar').style.display   = canEdit ? 'flex' : 'none';
  document.getElementById('scripts-add-wrap').style.display  = canEdit ? ''     : 'none';
  document.getElementById('scripts-admin-note').style.display = canEdit ? '' : 'none';

  document.getElementById('scripts-page').classList.add('visible');
  currentBoardId = null;
  _currentScriptId = null;

  renderScriptsList();
  // show empty state by default
  _showScriptsEmpty();
}

function _showScriptsEmpty() {
  document.getElementById('scripts-view-hdr').style.display = 'none';
  document.getElementById('scripts-editor-wrap').style.display = 'none';
  document.getElementById('scripts-empty').style.display = '';
}

function renderScriptsList() {
  const scripts = getOrgScripts();
  const list    = document.getElementById('scripts-list');
  if (!list) return;
  if (scripts.length === 0) {
    list.innerHTML = '<div style="padding:14px 10px;color:var(--text2);font-size:11px;text-align:center">Sin scripts aún</div>';
    return;
  }
  list.innerHTML = scripts.map(s => `
    <div class="script-item ${s.id === _currentScriptId ? 'active' : ''}" onclick="selectScript('${s.id}')">
      <span class="script-item-icon">📄</span>
      <span class="script-item-name">${esc(s.title || 'Sin título')}</span>
    </div>
  `).join('');
}

function selectScript(id) {
  const session = getSession();
  const scripts = getOrgScripts();
  const script  = scripts.find(s => s.id === id);
  if (!script) return;

  _currentScriptId = id;
  renderScriptsList();

  const canEdit = session && (session.role === 'admin' || session.role === 'master');

  // populate fields
  const _titleInp = document.getElementById('script-title-inp');
  _titleInp.value = (script.title || '').slice(0, 30);
  const _titleChars = document.getElementById('script-title-chars');
  if (_titleChars) _titleChars.textContent = (30 - _titleInp.value.length) + ' restantes';
  document.getElementById('scripts-editor').innerHTML = script.body || '';

  // toggle edit vs read-only
  document.getElementById('script-title-inp').readOnly = !canEdit;
  document.getElementById('scripts-editor').contentEditable = canEdit ? 'true' : 'false';
  document.getElementById('scripts-toolbar').style.display  = canEdit ? 'flex' : 'none';

  // show header bar with role label
  const hdr = document.getElementById('scripts-view-hdr');
  hdr.style.display = '';
  document.getElementById('scripts-view-hdr-title').textContent = script.title || 'Sin título';
  document.getElementById('scripts-view-mode-label').textContent = canEdit ? '✏️ Editando' : '👁 Solo lectura';

  document.getElementById('scripts-editor-wrap').style.display = '';
  document.getElementById('scripts-empty').style.display = 'none';
}

function newScript() {
  const session = getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'master')) return;
  const orgAdminId = session.role === 'admin' ? session.id : (session.orgAdminId || session.id);
  const script = {
    id:         'sc_' + Date.now() + Math.random().toString(36).slice(2,7),
    orgAdminId,
    title:      'Nuevo Script',
    body:       '',
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString()
  };
  const all = loadScripts();
  all.unshift(script);
  saveScripts(all);
  _currentScriptId = script.id;
  renderScriptsList();
  selectScript(script.id);
  setTimeout(() => {
    const inp = document.getElementById('script-title-inp');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

async function saveCurrentScript() {
  if (!_currentScriptId) return;
  const title = document.getElementById('script-title-inp').value.trim() || 'Sin título';
  const body  = document.getElementById('scripts-editor').innerHTML;
  const all   = loadScripts();
  const idx   = all.findIndex(s => s.id === _currentScriptId);
  if (idx === -1) return;
  all[idx].title     = title;
  all[idx].body      = body;
  all[idx].updatedAt = new Date().toISOString();
  await saveScripts(all);
  document.getElementById('scripts-view-hdr-title').textContent = title;
  renderScriptsList();
  showToast('Script guardado ✓', 'success');
}

async function deleteCurrentScript() {
  if (!_currentScriptId) return;
  if (!confirm('¿Eliminar este script? Esta acción no se puede deshacer.')) return;
  const all     = loadScripts().filter(s => s.id !== _currentScriptId);
  await saveScripts(all);
  _currentScriptId = null;
  renderScriptsList();
  _showScriptsEmpty();
  showToast('Script eliminado', 'error');
}

function stbExec(cmd, value) {
  document.getElementById('scripts-editor').focus();
  document.execCommand(cmd, false, value || null);
}

function stbHeading(value) {
  document.getElementById('scripts-editor').focus();
  if (!value) {
    document.execCommand('formatBlock', false, 'p');
  } else {
    document.execCommand('formatBlock', false, value);
  }
  document.getElementById('stb-heading').value = value;
}

// ════════════════════════════════════════════
//  SCRIPTS SIDE PANEL (agent quick-view)
// ════════════════════════════════════════════
let _sspOpen = false;
let _sspCurrentId = null;

function toggleScriptsPanel() {
  const panel = document.getElementById('scripts-side-panel');
  _sspOpen = !_sspOpen;
  panel.classList.toggle('open', _sspOpen);
  const btn = document.getElementById('btn-scripts-panel');
  if (btn) btn.classList.toggle('active-panel', _sspOpen);
  if (_sspOpen) {
    renderSspList();
    if (_sspCurrentId) selectSspScript(_sspCurrentId);
  }
}

function renderSspList() {
  const scripts = getOrgScripts();
  const list    = document.getElementById('ssp-list');
  if (!list) return;
  if (scripts.length === 0) {
    list.innerHTML = '<div style="padding:12px 14px;color:var(--text2);font-size:11px;text-align:center">Sin scripts disponibles</div>';
    return;
  }
  list.innerHTML = scripts.map(s => `
    <div class="ssp-script-item ${s.id === _sspCurrentId ? 'active' : ''}" onclick="selectSspScript('${s.id}')">
      <span>📄</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title || 'Sin título')}</span>
    </div>
  `).join('');
}

function selectSspScript(id) {
  const scripts = getOrgScripts();
  const script  = scripts.find(s => s.id === id);
  if (!script) return;
  _sspCurrentId = id;
  renderSspList();
  document.getElementById('ssp-empty').style.display   = 'none';
  document.getElementById('ssp-content').style.display = '';
  document.getElementById('ssp-script-title').textContent = script.title || 'Sin título';
  document.getElementById('ssp-script-content').innerHTML = script.body || '';
}

// ════════════════════════════════════════════
//  EXPORT CSV
// ════════════════════════════════════════════
function exportCSV() {
  if (!currentBoardId) return;
  const board   = getBoard(currentBoardId);
  const allLeads = loadLeads(currentBoardId);
  const hasSelection = selectedIds.size > 0;
  const leads   = hasSelection ? allLeads.filter(l => selectedIds.has(l.id)) : filteredLeads.length > 0 ? filteredLeads : allLeads;
  if (leads.length === 0) { showToast('No hay leads para exportar','error'); return; }

  const cols = getColumns(board).filter(c => c.key !== '_actions' && c.key !== '_check');
  const header = cols.map(c => `"${c.label}"`).join(',');
  const rows = leads.map(l =>
    cols.map(c => `"${(l[c.key]||'').toString().replace(/"/g,'""')}"`).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${board.id}_leads${hasSelection ? `_seleccion_${leads.length}` : ''}_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`CSV exportado — ${leads.length} lead${leads.length !== 1 ? 's' : ''}${hasSelection ? ' seleccionados' : ''} ✓`, 'success');
}

// ════════════════════════════════════════════
//  IMPORT CSV
// ════════════════════════════════════════════
function showImportPanel() {
  document.getElementById('leads-table').style.display = 'none';
  const es = document.getElementById('empty-state');
  if (es) es.style.display = 'none';
  const panel = document.getElementById('import-panel');
  panel.style.display = 'block';
  const boardOpts = BOARDS.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  const leadTypeOpts = `<option value="">— Sin cambio —</option>` + getLeadTypes().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const fieldOpts = ['','nombre','lead','email','telefono','hijos','direccion','ubicacion','asignado','resultado','notas']
    .map(f => `<option value="${f}">${f || '— ignorar —'}</option>`).join('');

  panel.innerHTML = `<div class="imp-page">
    <!-- Steps -->
    <div class="imp-steps">
      <div class="imp-step active" id="impstep-1"><span class="imp-step-n">1</span>Pegar datos</div>
      <div class="imp-step-line"></div>
      <div class="imp-step" id="impstep-2"><span class="imp-step-n">2</span>Revisar y editar</div>
      <div class="imp-step-line"></div>
      <div class="imp-step" id="impstep-3"><span class="imp-step-n">3</span>Vista previa y confirmar</div>
    </div>

    <!-- Step 1 -->
    <div id="imp-s1" class="imp-step-pane">
      <div class="imp-paste-card">
        <div class="imp-paste-icon">📋</div>
        <h3>Pega tu tabla desde Excel</h3>
        <p>Copia las celdas directamente desde Excel o Google Sheets (incluyendo la fila de encabezado) y pégalas con <kbd>Ctrl+V</kbd>. La primera fila debe ser el encabezado con los nombres de las columnas.</p>
        <textarea id="paste-area" class="imp-paste-area" placeholder="Haz clic aquí y presiona Ctrl+V para pegar tu tabla…" onpaste="handlePaste(event)"></textarea>
        <div id="imp-paste-hint" style="font-size:11px;color:var(--text2);margin-top:10px;text-align:left"></div>
      </div>
    </div>

    <!-- Step 2 -->
    <div id="imp-s2" class="imp-step-pane" style="display:none">
      <div class="imp-s2-toolbar">
        <div class="imp-dest-row">
          <div class="imp-dest-field">
            <label>Board para todos</label>
            <select id="global-dest" onchange="applyGlobalDest()">
              <option value="">— Elegir board —</option>
              ${boardOpts}
            </select>
          </div>
          <div class="imp-dest-field">
            <label>Ubicación para todos</label>
            <select id="global-ubicacion" onchange="applyGlobalUbicacion()" style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:12px;outline:none;min-width:140px">
              <option value="">— Elegir —</option>
            </select>
          </div>
          <div class="imp-dest-field">
            <label>Tipo de lead para todos</label>
            <select id="global-lead-type" onchange="applyGlobalLeadType()">${leadTypeOpts}</select>
          </div>
          <div class="imp-dest-field">
            <label>Semana asignada</label>
            <select id="imp-week-sel">${getWeekOptions().map(w=>`<option value="${w.start}" ${w.isCurrent?'selected':''}>${w.label}</option>`).join('')}</select>
          </div>
          <div class="imp-dest-field">
            <label>Precio por lead ($)</label>
            <input type="number" id="imp-global-price" min="0" step="0.01" value="0" placeholder="0.00" oninput="applyGlobalPrice()" style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:12px;outline:none;width:90px"/>
          </div>
          <div class="imp-stats-badge" id="imp-stats"></div>
          <button class="btn btn-secondary btn-sm" onclick="clearPaste()" style="margin-left:auto">✕ Limpiar</button>
        </div>
      </div>
      <div class="imp-table-scroll">
        <table class="imp-edit-table" id="imp-edit-table"></table>
      </div>
      <div class="imp-s2-actions">
        <button class="btn btn-secondary" onclick="clearPaste()">← Atrás</button>
        <button class="btn btn-secondary" id="imp-ai-btn" onclick="aiCompleteAddresses()" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-color:#7c3aed;color:#fff;display:inline-flex;align-items:center;gap:6px">
          ✨ Completar direcciones con IA
        </button>
        <div id="imp-ai-status" style="font-size:11px;color:var(--text2)"></div>
        <button class="btn btn-primary" onclick="goImportPreview()" style="margin-left:auto">Vista previa →</button>
      </div>
    </div>

    <!-- Step 3 -->
    <div id="imp-s3" class="imp-step-pane" style="display:none">
      <div id="imp-preview-content"></div>
      <div class="imp-s2-actions" style="margin-top:20px">
        <button class="btn btn-secondary" onclick="goImportStep(2)">← Editar</button>
        <button class="btn btn-primary" style="background:var(--green);border-color:var(--green);min-width:180px" onclick="confirmImport()">✓ Confirmar e Importar</button>
      </div>
    </div>

    <!-- History -->
    <div class="imp-history-section">
      <div class="imp-history-title">📊 Historial de Importaciones</div>
      <div id="imp-history-list"></div>
    </div>

    <!-- Weekly Report (dev only) -->
    <div class="imp-history-section" id="imp-weekly-report-section" style="display:none;margin-top:24px">
      <div class="imp-history-title" style="display:flex;align-items:center;gap:10px">
        📈 Reporte Semanal de Leads
        <span style="font-size:11px;font-weight:400;color:var(--text2);background:rgba(99,102,241,.15);padding:2px 8px;border-radius:20px">Solo desarrollador</span>
      </div>
      <div id="imp-weekly-report"></div>
    </div>
  </div>`;

  window._impFieldOpts = fieldOpts;
  window._impBoardOpts = boardOpts;

  // Explicitly set current week as selected value
  const weekSel = document.getElementById('imp-week-sel');
  if (weekSel) {
    const cur = getWeekOptions().find(w => w.isCurrent);
    if (cur) weekSel.value = cur.start;
  }

  renderImportHistory();
}

let pastedRows = []; // { checked, dest, cells[], extra:{}, aiAddress:null, useAiAddress:false }
let pastedHeaders = [];

// Fixed columns always shown in the edit table
const IMP_FIXED_FIELDS = ['nombre','hijos','telefono','email','direccion','ubicacion'];

function getRowField(row, field) {
  if (row.extra && field in row.extra) return row.extra[field];
  const idx = (window._pastedMappings || []).indexOf(field);
  return idx !== -1 ? (row.cells[idx] || '') : '';
}
function setRowField(ri, field, value) {
  const row = pastedRows[ri];
  const idx = (window._pastedMappings || []).indexOf(field);
  if (idx !== -1) row.cells[idx] = value;
  else { row.extra = row.extra || {}; row.extra[field] = value; }
}

function handlePaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const area = document.getElementById('paste-area');
  area.value = text;
  area.classList.add('has-data');
  parsePastedData(text);
}

function parsePastedData(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { showToast('Necesitas al menos encabezados y una fila de datos','error'); return; }
  pastedHeaders = lines[0].split('\t').map(h => h.trim());
  pastedRows = lines.slice(1).map(line => ({
    checked: true, dest: '', aiAddress: null, useAiAddress: false, extra: {},
    cells: line.split('\t').map(c => c.trim()),
  }));
  goImportStep(2);
}

// field mapping from common header names
const FIELD_MAP = {
  'nombre':'nombre','name':'nombre','full name':'nombre',
  'lead':'lead','tipo':'lead','tipo de lead':'lead',
  'email':'email','correo':'email',
  'telefono':'telefono','teléfono':'telefono','phone':'telefono','tel':'telefono','celular':'telefono',
  'hijos':'hijos','hijos menores':'hijos','children':'hijos',
  'direccion':'direccion','dirección':'direccion','address':'direccion',
  'ubicacion':'ubicacion','ubicación':'ubicacion','city':'ubicacion','ciudad':'ubicacion',
  'asignado':'asignado','asignado a':'asignado','assigned':'asignado','agente':'asignado',
  'resultado':'resultado','result':'resultado',

  'notas':'notas','notes':'notas','nota':'notas',

};

function guessField(header) {
  const h = header.toLowerCase().trim();
  return FIELD_MAP[h] || '';
}

function goImportStep(n) {
  [1,2,3].forEach(i => {
    const pane = document.getElementById(`imp-s${i}`);
    const step = document.getElementById(`impstep-${i}`);
    if (pane) pane.style.display = i === n ? '' : 'none';
    if (step) {
      step.classList.toggle('active', i === n);
      step.classList.toggle('done',   i < n);
    }
  });
  if (n === 2) renderImportEditTable();
}

function renderImportEditTable() {
  if (!window._pastedMappings || window._pastedMappings.length !== pastedHeaders.length) {
    window._pastedMappings = pastedHeaders.map(h => guessField(h));
  }
  const mappings = window._pastedMappings;
  const boardOpts = `<option value="">— Elegir —</option>` + BOARDS.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
  const fieldOpts = window._impFieldOpts || '';
  const hasAI = pastedRows.some(r => r.aiAddress);

  // Mapping section above table
  const mapSection = `<div class="imp-map-section">
    <div class="imp-map-label">📋 Mapeo de columnas de tu Excel:</div>
    <div class="imp-map-row">${pastedHeaders.map((h,i)=>`
      <div class="imp-map-item">
        <span class="imp-map-col">${esc(h)}</span>
        <span class="imp-map-arrow">→</span>
        <select class="imp-map-sel" onchange="window._pastedMappings[${i}]=this.value;renderImportEditTable()">
          ${fieldOpts.replace(`value="${mappings[i]}"`,`value="${mappings[i]}" selected`)}
        </select>
      </div>`).join('')}
    </div>
  </div>`;

  // Fixed column headers with resize handles
  const fixedCols = IMP_FIXED_FIELDS.map(f => `
    <th class="imp-rz-th" data-field="${f}">
      ${f.charAt(0).toUpperCase()+f.slice(1)}
      <div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div>
    </th>`).join('');

  const aiCol = hasAI ? `<th class="imp-rz-th" id="th-ai-addr">
    Dirección IA <span style="font-size:9px;background:#7c3aed;color:#fff;border-radius:8px;padding:1px 6px;font-weight:600">✨</span>
    <div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div>
  </th>` : '';

  const thead = `<thead>
    <tr>
      <th class="imp-chk-td" style="width:32px"><input type="checkbox" checked onchange="toggleAllPasteRows(this)"/></th>
      ${fixedCols}
      ${aiCol}
      <th class="imp-rz-th" style="min-width:160px">Board destino<div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div></th>
      <th style="width:30px"></th>
    </tr>
  </thead>`;

  const tbody = `<tbody>${pastedRows.map((row,ri)=>{
    const fixedCells = IMP_FIXED_FIELDS.map(f => {
      const v = getRowField(row, f);
      return `<td><input type="text" value="${esc(v)}" oninput="setRowField(${ri},'${f}',this.value)"/></td>`;
    }).join('');

    let aiCell = '';
    if (hasAI) {
      if (row.aiAddress) {
        const using = row.useAiAddress;
        aiCell = `<td class="imp-ai-cell">
          <div class="imp-ai-suggestion">${esc(row.aiAddress)}</div>
          <div class="imp-ai-toggle">
            <button class="${!using?'imp-ai-btn-active':''}" onclick="impToggleAI(${ri},false)" title="Usar dirección original">Original</button>
            <button class="${using?'imp-ai-btn-active':''}" onclick="impToggleAI(${ri},true)" title="Usar dirección IA">✨ IA</button>
          </div>
        </td>`;
      } else {
        aiCell = `<td style="color:var(--text2);font-size:11px;padding:8px">—</td>`;
      }
    }

    const destSel = `<td class="imp-dest-td"><select onchange="pastedRows[${ri}].dest=this.value">
      ${BOARDS.map(b=>`<option value="${b.id}"${row.dest===b.id?' selected':''}>${b.name}</option>`).join('')}
      ${!row.dest?`<option value="" selected disabled>— Elegir —</option>`:''}
    </select></td>`;

    return `<tr id="imp-row-${ri}" ${!row.checked?'style="opacity:.45"':''}>
      <td class="imp-chk-td"><input type="checkbox" ${row.checked?'checked':''} onchange="togglePasteRow(${ri},this.checked)"/></td>
      ${fixedCells}${aiCell}${destSel}
      <td class="imp-del-td"><button onclick="deleteImportRow(${ri})" title="Eliminar fila">✕</button></td>
    </tr>`;
  }).join('')}</tbody>`;

  const tableEl = document.getElementById('imp-edit-table');
  tableEl.innerHTML = thead + tbody;

  // Prepend mapping section before the table scroll
  let mapEl = document.getElementById('imp-map-section');
  if (!mapEl) {
    mapEl = document.createElement('div');
    mapEl.id = 'imp-map-section';
    tableEl.closest('.imp-table-scroll').before(mapEl);
  }
  mapEl.innerHTML = mapSection;

  updatePasteStats();
}

function impToggleAI(ri, useAI) {
  const row = pastedRows[ri];
  row.useAiAddress = useAI;
  if (useAI && row.aiAddress) {
    // Apply AI address to direccion field only — ubicacion is chosen by the user
    setRowField(ri, 'direccion', row.aiAddress);
  }
  renderImportEditTable();
}

// Column resize
function impStartResize(e, handle) {
  e.preventDefault();
  e.stopPropagation();
  const th = handle.closest('th');
  const startX = e.pageX;
  const startW = th.offsetWidth;
  function onMove(ev) { th.style.minWidth = Math.max(60, startW + ev.pageX - startX) + 'px'; th.style.width = th.style.minWidth; }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function deleteImportRow(ri) {
  pastedRows.splice(ri, 1);
  renderImportEditTable();
}

function updateMapping(colIdx, val) { window._pastedMappings[colIdx] = val; }

function toggleAllPasteRows(cb) {
  pastedRows.forEach(r => r.checked = cb.checked);
  document.querySelectorAll('#imp-edit-table tbody input[type=checkbox]').forEach(c => c.checked = cb.checked);
  updatePasteStats();
}

function togglePasteRow(idx, val) {
  pastedRows[idx].checked = val;
  updatePasteStats();
}

function updatePasteStats() {
  const sel = pastedRows.filter(r => r.checked).length;
  const el = document.getElementById('imp-stats');
  if (el) el.textContent = `${sel} de ${pastedRows.length} filas seleccionadas`;
}

function applyGlobalDest() {
  const dest = document.getElementById('global-dest')?.value;
  if (!dest) return;
  pastedRows.forEach(r => r.dest = dest);
  document.querySelectorAll('#imp-edit-table tbody td.imp-dest-td select').forEach(s => s.value = dest);
  // Populate ubicacion select with board's configured ubicaciones
  const ubSel = document.getElementById('global-ubicacion');
  if (!ubSel) return;
  const board = getBoard(dest);
  const configured = board?.ubicaciones?.filter(Boolean) || [];
  const allUbs = configured.length > 0
    ? configured
    : [...new Set(BOARDS.flatMap(b => b.ubicaciones).filter(Boolean))].sort();
  ubSel.innerHTML = `<option value="">— Elegir —</option>`
    + allUbs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  if (allUbs.length === 1) { ubSel.value = allUbs[0]; applyGlobalUbicacion(); }
}

function applyGlobalUbicacion() {
  const ub = document.getElementById('global-ubicacion')?.value || '';
  pastedRows.forEach((_, ri) => setRowField(ri, 'ubicacion', ub));
  renderImportEditTable();
}

function applyGlobalLeadType() {
  const lt = document.getElementById('global-lead-type')?.value;
  if (!lt) return;
  window._globalLeadType = lt;
}

function getWeekOptions() {
  const weeks = [];
  const now = new Date();
  // Find the most recent Monday
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const curMonday = new Date(now);
  curMonday.setDate(now.getDate() + diffToMon);
  curMonday.setHours(0,0,0,0);

  const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  // 12 past weeks + current + 4 future
  for (let i = -12; i <= 4; i++) {
    const mon = new Date(curMonday);
    mon.setDate(curMonday.getDate() + i * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const label = `${MONTHS_ES[mon.getMonth()]} ${fmt(mon)} – ${fmt(sun)}`;
    weeks.push({
      start: mon.toISOString().slice(0,10),
      end:   sun.toISOString().slice(0,10),
      label,
      isCurrent: i === 0,
    });
  }
  return weeks;
}

function applyGlobalPrice() {
  const price = parseFloat(document.getElementById('imp-global-price')?.value) || 0;
  window._globalLeadPrice = price;
  // Update per-row price inputs
  document.querySelectorAll('.imp-price-cell').forEach(inp => inp.value = price.toFixed(2));
}

function clearPaste() {
  pastedRows = []; pastedHeaders = [];
  window._pastedMappings = [];
  window._globalLeadType  = '';
  window._globalLeadPrice = 0;
  const ubSel = document.getElementById('global-ubicacion');
  if (ubSel) { ubSel.innerHTML = '<option value="">— Elegir —</option>'; ubSel.value = ''; }
  goImportStep(1);
  const area = document.getElementById('paste-area');
  if (area) { area.value = ''; area.classList.remove('has-data'); }
}

function goImportPreview() {
  const mappings = window._pastedMappings || [];
  const toImport = pastedRows.filter(r => r.checked);
  if (!toImport.length) { showToast('No hay filas seleccionadas','error'); return; }
  const noDest = toImport.filter(r => !r.dest);
  if (noDest.length) { showToast(`${noDest.length} fila(s) sin board destino — elige un board para todas o individualmente`,'error'); return; }

  const globalLeadType = window._globalLeadType || document.getElementById('global-lead-type')?.value || '';
  const byBoard = {};
  toImport.forEach(row => {
    const lead = { id: uid(), creacion: today(), entrada: 'Solicitud' };
    // Fixed fields
    IMP_FIXED_FIELDS.forEach(f => { const v = getRowField(row, f); if (v) lead[f] = v; });
    // Extra mapped fields (lead type, asignado, etc.)
    (window._pastedMappings || []).forEach((field, ci) => {
      if (field && !IMP_FIXED_FIELDS.includes(field) && row.cells[ci]) lead[field] = row.cells[ci];
    });
    if (!lead.nombre) lead.nombre = row.cells[0] || '';
    if (globalLeadType) lead.lead = globalLeadType;
    if (!byBoard[row.dest]) byBoard[row.dest] = [];
    byBoard[row.dest].push(lead);
  });
  window._importByBoard = byBoard;

  const total = toImport.length;
  const boardCards = Object.entries(byBoard).map(([bid, leads]) => {
    const b = getBoard(bid);
    return `<div class="imp-preview-board-card">
      <div class="imp-preview-board-name">${esc(b?.name || bid)}</div>
      <div class="imp-preview-board-count">${leads.length}</div>
      <div class="imp-preview-board-sub">lead${leads.length!==1?'s':''}</div>
    </div>`;
  }).join('');

  // Sample table (first 5 rows from all)
  const sampleLeads = toImport.slice(0,5);
  const sampleCols = mappings.map((f,i)=>({field:f,idx:i})).filter(x=>x.field && x.field !== '');
  const sampleHead = sampleCols.map(x=>`<th>${x.field}</th>`).join('') + '<th>Board</th>';
  const sampleBody = sampleLeads.map((row,ri) => {
    const b = getBoard(row.dest);
    return `<tr>${sampleCols.map(x=>`<td>${esc(row.cells[x.idx]||'')}</td>`).join('')}<td>${esc(b?.name||row.dest)}</td></tr>`;
  }).join('');

  document.getElementById('imp-preview-content').innerHTML = `
    <div class="imp-preview-header">Resumen: <strong>${total}</strong> lead${total!==1?'s':''} listos para importar</div>
    <div class="imp-preview-boards">${boardCards}</div>
    <div class="imp-preview-sample">
      <div class="imp-preview-sample-title">Vista previa (primeras ${Math.min(5,total)} filas)</div>
      <div style="overflow-x:auto"><table><thead><tr>${sampleHead}</tr></thead><tbody>${sampleBody}</tbody></table></div>
    </div>`;
  goImportStep(3);
}

async function confirmImport() {
  const byBoard = window._importByBoard || {};
  const session = getSession();
  let total = 0;
  const distribution = [];
  Object.entries(byBoard).forEach(([boardId, leads]) => {
    const existing = loadLeads(boardId);
    saveLeads(boardId, [...existing, ...leads]);
    total += leads.length;
    distribution.push({
      boardId,
      boardName: getBoard(boardId)?.name || boardId,
      count: leads.length,
      leadIds: leads.map(l => l.id),
    });
  });

  const weekStart = document.getElementById('imp-week-sel')?.value || new Date().toISOString().slice(0,10);
  const pricePerLead = parseFloat(document.getElementById('imp-global-price')?.value) || 0;

  // Save to history
  const record = {
    id:         uid(),
    date:       new Date().toISOString(),
    importedBy: session?.name || 'Desconocido',
    importedByEmail: session?.email || '',
    total,
    distribution,
    weekStart,
    pricePerLead,
  };
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    history.unshift(record);
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(history.slice(0,100)) });
  } catch(_) {}

  const boardNames = distribution.map(d=>d.boardName).join(', ');
  logActivity('lead_import', `${total} leads importados`, `Boards: ${boardNames}`);
  markNewLeads(distribution); // notify admins of new leads
  showToast(`✓ ${total} leads importados exitosamente`, 'success');
  clearPaste();
  renderImportHistory();
}

async function aiCompleteAddresses() {
  const rows = pastedRows.filter(r => r.checked);
  if (!rows.length) { showToast('No hay filas seleccionadas', 'error'); return; }

  const payload = rows.map((row, i) => ({
    idx:       pastedRows.indexOf(row),
    direccion: getRowField(row, 'direccion'),
    ubicacion: getRowField(row, 'ubicacion'),
  })).filter(r => r.direccion || r.ubicacion);

  if (!payload.length) {
    showToast('Mapea al menos una columna como "direccion" o "ubicacion" primero', 'error');
    return;
  }

  const btn = document.getElementById('imp-ai-btn');
  const status = document.getElementById('imp-ai-status');
  btn.disabled = true;
  btn.innerHTML = '✨ Analizando…';
  status.textContent = `Enviando ${payload.length} direcciones a Claude…`;
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch(`${SUPA_FN_URL}/claude-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ task: 'complete_addresses', data: payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error de IA');

    let count = 0;
    data.result.forEach(r => {
      const row = pastedRows[r.idx];
      if (!row || !r.direccion_completa) return;
      row.aiAddress    = r.direccion_completa;
      row.useAiAddress = true;
      // Auto-apply to direccion field only — ubicacion is chosen by the user
      setRowField(r.idx, 'direccion', r.direccion_completa);
      count++;
    });

    renderImportEditTable();
    status.textContent = `✓ ${count} dirección(es) completadas automáticamente`;
    status.style.color = 'var(--green)';
    showToast(`✨ IA completó ${count} direcciones`, 'success');
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = 'var(--red)';
    showToast('Error con Claude: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Completar direcciones con IA';
  }
}

async function renderImportHistory() {
  const el = document.getElementById('imp-history-list');
  if (!el) return;
  el.innerHTML = `<div style="font-size:12px;color:var(--text2);padding:10px 0">Cargando historial…</div>`;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    if (!history.length) { el.innerHTML = `<div class="imp-history-empty">No hay importaciones registradas aún.</div>`; return; }
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const weekOpts = getWeekOptions();
    el.innerHTML = history.map(r => {
      const d = new Date(r.date);
      const ageMs = now - d.getTime();
      const canUndo = !r.undone && ageMs < ONE_WEEK && (r.distribution||[]).some(dist => dist.leadIds?.length);
      const dateStr = d.toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'});
      const chips = (r.distribution||[]).map(d=>`<span class="imp-history-chip">${esc(d.boardName)}: ${d.count}</span>`).join('');
      const undoBtn = r.undone
        ? `<span style="font-size:10px;color:var(--green)">✓ Deshecho</span>`
        : canUndo
          ? `<button onclick="promptUndoImport('${r.id}')" style="background:transparent;border:1px solid var(--red);color:var(--red);border-radius:7px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;margin-top:4px">↩ Deshacer</button>`
          : ageMs >= ONE_WEEK ? `<span style="font-size:10px;color:var(--text2)">Expirado</span>` : '';
      const curWeek = weekOpts.find(w => w.start === r.weekStart);
      const weekLabel = curWeek ? curWeek.label : (r.weekStart || 'Sin semana');
      const weekSelOpts = weekOpts.map(w =>
        `<option value="${w.start}"${w.start===r.weekStart?' selected':''}>${w.label}</option>`
      ).join('');
      return `<div class="imp-history-row" id="imp-history-row-${r.id}">
        <div class="imp-history-date">${dateStr}</div>
        <div class="imp-history-info">
          <div class="imp-history-who">👤 ${esc(r.importedBy)} <span style="font-weight:400;color:var(--text2);font-size:11px">${esc(r.importedByEmail)}</span></div>
          <div class="imp-history-dist">${chips}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:10px;color:var(--text2);background:rgba(0,0,0,.08);border-radius:5px;padding:2px 8px">📅 ${esc(weekLabel)}</span>
            <button onclick="toggleWeekEdit('${r.id}')" style="background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer">✏️ Editar semana</button>
            <span id="week-edit-wrap-${r.id}" style="display:none;align-items:center;gap:4px">
              <select id="week-edit-sel-${r.id}" style="font-size:11px;padding:2px 4px;border-radius:5px;border:1px solid var(--border);background:var(--card);color:var(--text)">${weekSelOpts}</select>
              <button onclick="changeImportWeek('${r.id}')" style="background:var(--accent);color:#fff;border:none;border-radius:5px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer">Guardar</button>
              <button onclick="toggleWeekEdit('${r.id}')" style="background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer">✕</button>
            </span>
          </div>
        </div>
        <div class="imp-history-total" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div>${r.total}<span>leads</span></div>
          ${undoBtn}
        </div>
      </div>`;
    }).join('');
    if (_isZoomDev()) renderWeeklyReport(history);
  } catch(_) { el.innerHTML = `<div class="imp-history-empty">Error cargando historial.</div>`; }
}

function toggleWeekEdit(recordId) {
  const wrap = document.getElementById('week-edit-wrap-' + recordId);
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? 'inline-flex' : 'none';
}

async function changeImportWeek(recordId) {
  const sel = document.getElementById('week-edit-sel-' + recordId);
  const newWeekStart = sel?.value;
  if (!newWeekStart) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    const rec = history.find(r => r.id === recordId);
    if (!rec) { showToast('Registro no encontrado'); return; }
    rec.weekStart = newWeekStart;
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(history) });
    showToast('Semana actualizada ✓', 'success');
    await renderImportHistory();
  } catch(e) { showToast('Error al actualizar: ' + e.message); }
}

let _undoImportId = null;

function promptUndoImport(recordId) {
  _undoImportId = recordId;
  // Load record details from DOM (re-read history is better)
  const overlay = document.getElementById('undo-import-overlay');
  const info    = document.getElementById('undo-import-info');
  const step1   = document.getElementById('undo-import-step1');
  const step2   = document.getElementById('undo-import-step2');
  // Find record info from rendered chips
  const row = document.getElementById(`imp-history-row-${recordId}`);
  const who  = row?.querySelector('.imp-history-who')?.textContent?.trim() || '';
  const date = row?.querySelector('.imp-history-date')?.textContent?.trim() || '';
  const dist = row?.querySelector('.imp-history-dist')?.textContent?.trim() || '';
  info.innerHTML = `<strong>Importación a deshacer:</strong><br>📅 ${date}<br>👤 ${who}<br>📦 ${dist}<br><br>Se eliminarán todos los leads de esta importación de sus respectivos boards.`;
  step1.style.display = '';
  step2.style.display = 'none';
  document.getElementById('undo-pass1').value = '';
  document.getElementById('undo-pass2').value = '';
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('undo-pass1').focus(), 120);
}

function closeUndoImportModal() {
  document.getElementById('undo-import-overlay').style.display = 'none';
  _undoImportId = null;
}

async function undoStep2() {
  const pass = document.getElementById('undo-pass1').value;
  if (!pass) { showToast('Ingresa tu contraseña', 'error'); return; }
  const session = getSession();
  const valid = session?.role === 'master'
    ? await sha256(pass) === MASTER_USER.passwordHash
    : false;
  if (!valid) { showToast('Contraseña incorrecta', 'error'); document.getElementById('undo-pass1').value = ''; document.getElementById('undo-pass1').focus(); return; }
  document.getElementById('undo-import-step1').style.display = 'none';
  document.getElementById('undo-import-step2').style.display = '';
  setTimeout(() => document.getElementById('undo-pass2').focus(), 120);
}

async function undoStep3() {
  const pass = document.getElementById('undo-pass2').value;
  if (!pass) { showToast('Ingresa tu contraseña nuevamente', 'error'); return; }
  const session = getSession();
  const valid = session?.role === 'master'
    ? await sha256(pass) === MASTER_USER.passwordHash
    : false;
  if (!valid) { showToast('Contraseña incorrecta', 'error'); document.getElementById('undo-pass2').value = ''; document.getElementById('undo-pass2').focus(); return; }

  closeUndoImportModal();
  await executeUndoImport(_undoImportId);
}

async function executeUndoImport(recordId) {
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    const record  = history.find(r => r.id === recordId);
    if (!record) { showToast('Registro no encontrado', 'error'); return; }

    let removedTotal = 0;
    for (const dist of (record.distribution || [])) {
      if (!dist.leadIds?.length) continue;
      const idSet    = new Set(dist.leadIds);
      const existing = loadLeads(dist.boardId);
      const filtered = existing.filter(l => !idSet.has(l.id));
      removedTotal  += existing.length - filtered.length;
      saveLeads(dist.boardId, filtered);
    }

    // Mark record as undone in history
    const updated = history.map(r => r.id === recordId ? { ...r, undone: true, undoneAt: new Date().toISOString() } : r);
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(updated) });

    showToast(`↩ ${removedTotal} leads eliminados correctamente`, 'success');
    renderImportHistory();
    if (currentBoardId) renderTable();
  } catch(e) {
    showToast('Error al deshacer: ' + e.message, 'error');
  }
}

function renderWeeklyReport(history) {
  const section = document.getElementById('imp-weekly-report-section');
  const el = document.getElementById('imp-weekly-report');
  if (!section || !el) return;
  section.style.display = '';

  // Group imports by weekStart
  const weeks = {}; // weekStart -> { end, boards: { boardName -> {count, price} } }
  history.forEach(r => {
    if (!r.weekStart) return;
    if (!weeks[r.weekStart]) {
      // Compute week end (Sunday)
      const mon = new Date(r.weekStart + 'T00:00:00');
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      weeks[r.weekStart] = { end: sun.toISOString().slice(0,10), boards: {} };
    }
    const price = r.pricePerLead || 0;
    (r.distribution || []).forEach(d => {
      const key = d.boardName;
      if (!weeks[r.weekStart].boards[key]) weeks[r.weekStart].boards[key] = { count: 0, price };
      weeks[r.weekStart].boards[key].count += d.count;
      if (price > 0) weeks[r.weekStart].boards[key].price = price; // last price wins
    });
  });

  const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmtDate = s => { const d = new Date(s + 'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; };

  const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
  if (!sortedWeeks.length) { el.innerHTML = `<div class="imp-history-empty">No hay datos semanales aún. Asigna una semana al importar.</div>`; return; }

  el.innerHTML = sortedWeeks.map(wStart => {
    const w = weeks[wStart];
    const mon = new Date(wStart + 'T00:00:00');
    const monName = MONTHS_ES[mon.getMonth()];
    const label = `${monName} ${fmtDate(wStart)} a ${fmtDate(w.end)}`;
    const boards = Object.entries(w.boards);
    let grandTotal = 0; let grandSubtotal = 0;
    const rows = boards.map(([bName, info]) => {
      const subtotal = info.count * info.price;
      grandTotal += info.count; grandSubtotal += subtotal;
      return `<tr>
        <td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.06)">${esc(bName)}</td>
        <td style="padding:7px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)">${info.count}</td>
        <td style="padding:7px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)">${info.price > 0 ? '$'+info.price.toFixed(2) : '—'}</td>
        <td style="padding:7px 14px;text-align:right;border-bottom:1px solid rgba(255,255,255,.06);font-weight:600;color:var(--green)">${subtotal > 0 ? '$'+subtotal.toFixed(2) : '—'}</td>
        <td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.06);color:var(--text2);font-size:11px"></td>
      </tr>`;
    }).join('');
    return `<div class="wkr-card">
      <div class="wkr-header">
        <span class="wkr-week-label">${label}</span>
        <span class="wkr-total-badge">${grandTotal} leads${grandSubtotal > 0 ? ' · $'+grandSubtotal.toFixed(2) : ''}</span>
      </div>
      <table class="wkr-table">
        <thead>
          <tr>
            <th style="padding:8px 14px;text-align:left;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Lead / Board</th>
            <th style="padding:8px 14px;text-align:center;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Cantidad</th>
            <th style="padding:8px 14px;text-align:center;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">$</th>
            <th style="padding:8px 14px;text-align:right;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Subtotal</th>
            <th style="padding:8px 14px;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Notas</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:rgba(99,102,241,.1)">
            <td style="padding:9px 14px;font-weight:700">TOTAL</td>
            <td style="padding:9px 14px;text-align:center;font-weight:700">${grandTotal}</td>
            <td></td>
            <td style="padding:9px 14px;text-align:right;font-weight:700;color:var(--green)">${grandSubtotal > 0 ? '$'+grandSubtotal.toFixed(2) : '—'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }).join('');
}

function hideImportPanel() {
  if (currentBoardId) {
    document.getElementById('import-panel').style.display = 'none';
    document.getElementById('leads-table').style.display = '';
    renderTable();
  } else {
    selectBoard('dallas');
  }
}

// ════════════════════════════════════════════
//  REFERIDOS POR FOTO
// ════════════════════════════════════════════
let _refRows      = []; // [{nombre, telefono, relacion}]
let _refImageB64  = null;

function showReferidosPage() {
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  currentBoardId = null;
  document.getElementById('board-title').textContent = 'Digitalización de Referidos';
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('referidos-page').style.display = 'flex';
  document.querySelectorAll('.board-item,.sidebar-item').forEach(el => el.classList.remove('active'));
  ['nav-referidos','nav-referidos-agent','nav-referidos-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('active'); });
  _refPopulateSelects();
  renderRefHistory();
}

function _refPopulateSelects() {
  // Agente actual (read-only)
  const session = getSession();
  const agenteName = session ? (session.name || session.email || 'Usuario') : 'Usuario';
  const agenteId   = session ? session.id : null;
  const nameEl = document.getElementById('ref-agente-name');
  const avatarEl = document.getElementById('ref-agente-avatar');
  if (nameEl) nameEl.textContent = agenteName;
  if (avatarEl) avatarEl.textContent = agenteName.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
  document.getElementById('ref-agente-display')._agenteName = agenteName;
  document.getElementById('ref-agente-display')._agenteId   = agenteId;
  // Ubicaciones
  const ubSel = document.getElementById('ref-ubicacion');
  if (ubSel) {
    const ubs = [...new Set(BOARDS.flatMap(b => b.ubicaciones).filter(Boolean))].sort();
    ubSel.innerHTML = '<option value="">— Seleccionar —</option>'
      + ubs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  }
  // Boards
  const bSel = document.getElementById('ref-board');
  if (bSel) {
    bSel.innerHTML = BOARDS.map(b => `<option value="${b.id}">${esc(b.name)} ${b.icon||''}</option>`).join('');
  }
}

function refHandleDrop(e) {
  e.preventDefault();
  document.getElementById('ref-dropzone').style.borderColor = '';
  document.getElementById('ref-dropzone').style.background  = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) refLoadImage(file);
}

function refHandleFile(file) {
  if (file) refLoadImage(file);
}

function refLoadImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    _refImageB64 = e.target.result;
    document.getElementById('ref-thumb').src = _refImageB64;
    document.getElementById('ref-thumb-wrap').style.display    = '';
    document.getElementById('ref-no-image-hint').style.display = 'none';
    document.getElementById('ref-dropzone').style.display      = 'none';
    document.getElementById('ref-step2').style.display         = 'none';
    document.getElementById('ref-ai-status').textContent       = '';
    // Activate step indicator 1 as done-ish
    document.getElementById('ref-stepin-1').style.background   = 'rgba(0,115,234,.2)';
  };
  reader.readAsDataURL(file);
}

function refResetImage() {
  _refImageB64 = null;
  _refRows = [];
  document.getElementById('ref-thumb-wrap').style.display    = 'none';
  document.getElementById('ref-no-image-hint').style.display = '';
  document.getElementById('ref-dropzone').style.display      = '';
  document.getElementById('ref-step2').style.display         = 'none';
  ['ref-file-input','ref-file-cam','ref-file-gal'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('ref-ai-status').textContent = '';
  // Reset step 2 indicator
  const s2 = document.getElementById('ref-stepin-2');
  s2.style.background = 'rgba(255,255,255,.04)';
  s2.style.borderColor = '';
  document.getElementById('ref-badge-2').style.background = 'var(--border)';
  document.getElementById('ref-badge-2').style.color = 'var(--text2)';
  document.querySelector('#ref-stepin-2 span:last-child').style.color = 'var(--text2)';
}

async function refAnalyze() {
  if (!_refImageB64) return;
  const btn    = document.getElementById('ref-analyze-btn');
  const status = document.getElementById('ref-ai-status');
  const overlay = document.getElementById('ref-img-overlay');
  btn.disabled = true;
  btn.innerHTML = '<span class="ref-ai-pulse"></span> Analizando…';
  if (overlay) overlay.style.display = 'flex';
  status.innerHTML = '<span class="ref-ai-pulse"></span> Analizando imagen…';
  status.style.color = 'var(--text2)';

  try {
    const b64 = _refImageB64.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = _refImageB64.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';

    const res = await fetch(`${SUPA_FN_URL}/claude-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ task: 'extract_referrals_image', imageBase64: b64, mediaType }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error de IA');

    _refRows = (data.result || []).map(r => ({
      nombre:   (r.nombre   || '').trim(),
      telefono: (r.telefono || '').trim(),
      hijos:    (r.hijos    || '').trim(),
      notas:    '',
    })).filter(r => r.nombre || r.telefono);

    if (!_refRows.length) throw new Error('La IA no detectó nombres ni teléfonos en la imagen');

    refRenderPreview();
    document.getElementById('ref-step2').style.display = 'block';
    // Activate step 2 indicator
    const s2 = document.getElementById('ref-stepin-2');
    s2.style.background = 'rgba(62,207,142,.12)';
    s2.style.borderColor = 'rgba(62,207,142,.35)';
    document.getElementById('ref-badge-2').style.background = '#3ecf8e';
    document.getElementById('ref-badge-2').style.color = '#0a2e22';
    document.querySelector('#ref-stepin-2 span:last-child').style.color = '#3ecf8e';
    document.getElementById('ref-step2').scrollIntoView({ behavior:'smooth', block:'start' });
    status.textContent = `✓ ${_refRows.length} lead(s) detectados`;
    status.style.color = '#3ecf8e';
  } catch(e) {
    status.textContent = '❌ ' + e.message;
    status.style.color = 'var(--red)';
  } finally {
    if (overlay) overlay.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = '<span>✨</span> Analizar con IA';
  }
}

function refRenderPreview() {
  const tbody = document.getElementById('ref-preview-tbody');
  const badge = document.getElementById('ref-count-badge');
  if (badge) badge.textContent = `${_refRows.length} lead${_refRows.length !== 1 ? 's' : ''}`;

  const td = 'border-right:1px solid var(--border);border-bottom:1px solid var(--border)';
  const inp = (val, field, i, ph='', extra='') =>
    `<input value="${esc(val)}" oninput="_refRows[${i}].${field}=this.value" placeholder="${ph}"
      style="width:100%;box-sizing:border-box;padding:4px 6px;font-size:12px;background:transparent;border:none;color:var(--text);font-family:inherit;outline:none;${extra}" />`;

  function _telWarnHtml(tel) {
    const d = (tel||'').replace(/\D/g,'').length;
    if (!tel.trim() || (d>=7&&d<=15)) return '';
    const msg = d<7?'Número muy corto':'Número muy largo';
    return `<span style="flex-shrink:0;font-size:11px;cursor:help;color:#f59e0b" title="${msg}: ${d} dígitos">⚠</span>`;
  }

  tbody.innerHTML = _refRows.map((r, i) => {
    const bg = i%2===0?'rgba(255,255,255,.012)':'rgba(0,0,0,.07)';
    return `<tr style="background:${bg}" onmouseover="this.style.background='rgba(0,115,234,.06)'" onmouseout="this.style.background='${bg}'">
      <td style="padding:3px 0;text-align:center;${td}">
        <div style="display:flex;align-items:center;justify-content:center;gap:3px">
          <button onclick="_refRows.splice(${i},1);refRenderPreview()"
            style="background:none;border:none;color:rgba(255,255,255,.18);width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;border-radius:3px;padding:0;flex-shrink:0"
            title="Eliminar"
            onmouseover="this.style.color='#f87171'"
            onmouseout="this.style.color='rgba(255,255,255,.18)'">✕</button>
          <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;background:rgba(0,115,234,.2);color:#60a5fa;font-size:11px;font-weight:800">${i+1}</span>
        </div>
      </td>
      <td style="padding:0;${td}">${inp(r.nombre,'nombre',i,'Nombre completo')}</td>
      <td style="padding:0;${td}">
        <div style="display:flex;align-items:center">
          <input value="${esc(r.telefono)}" id="ref-tel-inp-${i}" placeholder="+1 555 000 0000"
            oninput="_refRows[${i}].telefono=this.value;_refTelCheck(${i},this.value)"
            style="flex:1;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:12px;background:transparent;border:none;color:var(--text);font-family:inherit;outline:none" />
          <span id="ref-tel-warn-${i}" style="flex-shrink:0;font-size:11px;color:#f59e0b;padding-right:4px;cursor:help" title=""></span>
        </div>
      </td>
      <td style="padding:0;text-align:center;${td}">${inp(r.hijos||'','hijos',i,'—','text-align:center')}</td>
      <td style="padding:0;border-bottom:1px solid var(--border)">${inp(r.notas||'','notas',i,'Notas del lead…')}</td>
    </tr>`;
  }).join('');

  // Run initial phone check on all rows after render
  _refRows.forEach((r,i) => _refTelCheck(i, r.telefono));
}

function _refTelCheck(i, val) {
  const warn = document.getElementById(`ref-tel-warn-${i}`);
  if (!warn) return;
  const d = (val||'').replace(/\D/g,'').length;
  if (!val.trim() || (d>=7&&d<=15)) { warn.textContent=''; warn.title=''; return; }
  warn.textContent = '⚠';
  warn.title = d < 7 ? `Muy corto: ${d} dígitos` : `Muy largo: ${d} dígitos`;
}

function refAddRow() {
  _refRows.push({ nombre:'', telefono:'', hijos:'', notas:'' });
  refRenderPreview();
  document.getElementById('ref-step2').style.display = 'block';
}

async function refSubmit() {
  const boardId        = document.getElementById('ref-board').value;
  const referidoPor    = document.getElementById('ref-referidopor').value.trim();
  const referidoTel    = document.getElementById('ref-referidopor-tel').value.trim();
  const tipo           = document.getElementById('ref-tipo').value || 'Presencial';
  const ubicacion      = document.getElementById('ref-ubicacion').value;
  const notasReferido  = (document.getElementById('ref-notas-referido')?.value || '').trim();
  const agenteDisp   = document.getElementById('ref-agente-display');
  const agenteName   = agenteDisp ? agenteDisp._agenteName || '' : '';
  const agenteId     = agenteDisp ? agenteDisp._agenteId   || null : null;
  const statusEl     = document.getElementById('ref-submit-status');
  const btn          = document.getElementById('ref-submit-btn');

  const rows = _refRows.filter(r => r.nombre.trim() || r.telefono.trim());
  if (!rows.length) { showToast('No hay leads para cargar', 'error'); return; }
  if (!boardId)     { showToast('Selecciona un board destino', 'error'); return; }

  btn.disabled = true;
  statusEl.textContent = 'Guardando…';

  try {
    const leads = loadLeads(boardId);
    const today  = new Date().toISOString().slice(0,10);
    let added = 0;

    rows.forEach(r => {
      const notaParts = [];
      if (agenteName) notaParts.push(`Agente: ${agenteName}`);
      if (referidoPor) {
        let ref = `Referido por: ${referidoPor}`;
        if (referidoTel) ref += ` (${referidoTel})`;
        notaParts.push(ref);
      }
      if (r.notas && r.notas.trim()) notaParts.push(r.notas.trim());
      if (notasReferido) notaParts.push(`Nota del referido: ${notasReferido}`);
      const lead = {
        id:          uid(),
        creacion:    today,
        nombre:      r.nombre.trim(),
        telefono:    r.telefono.trim(),
        email:       '',
        direccion:   '',
        ubicacion,
        lead:        'REF',
        tipo,
        notas:       notaParts.join(' · '),
        _notes:      notaParts.length ? JSON.stringify([{ text: notaParts.join('\n'), author: agenteName || 'Sistema', date: new Date().toISOString(), system: true }]) : '',
        asignado:    agenteName,
        asignadoId:  agenteId,
        resultado:   '',
        hijos:       r.hijos ? r.hijos.trim() : '',
        _esReferido: true,
        entrada:     'Referido',
      };
      leads.push(lead);
      added++;
    });

    await saveLeads(boardId, leads);
    statusEl.textContent = `✅ ${added} lead(s) cargados`;
    statusEl.style.color = 'var(--green)';
    showToast(`${added} referidos importados ✓`, 'success');

    // Save to per-user history
    const _importedLeads = rows.map(r => ({ nombre: r.nombre.trim(), telefono: r.telefono.trim(), hijos: r.hijos||'', notas: r.notas||'' }));
    const _leadIds = leads.slice(-added).map(l => l.id);
    await refSaveHistory({
      id: uid(), date: new Date().toISOString(),
      uploadedBy: agenteName, uploadedById: agenteId,
      boardId, boardName: getBoard(boardId)?.name || boardId,
      referidoPor, ubicacion, added,
      leads: _importedLeads, _leadIds,
    });
    renderRefHistory();

    // Reset for next batch
    setTimeout(() => {
      refResetImage();
      _refRows = [];
      document.getElementById('ref-step2').style.display = 'none';
      statusEl.textContent = '';
      btn.disabled = false;
    }, 2000);
  } catch(e) {
    statusEl.textContent = '❌ Error: ' + e.message;
    statusEl.style.color = 'var(--red)';
    btn.disabled = false;
  }
}

// ── Referidos history ────────────────────────────────────────────────────────
function _refHistoryKey() {
  const session = getSession();
  return session ? `gew_ref_history_${session.id}` : null;
}

async function refSaveHistory(record) {
  const key = _refHistoryKey();
  if (!key) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    const hist = JSON.parse(data?.value || '[]');
    hist.unshift(record);
    await supa.from('kv_store').upsert({ key, value: JSON.stringify(hist.slice(0, 200)) });
  } catch(_) {}
}

async function refLoadHistory() {
  const key = _refHistoryKey();
  if (!key) return [];
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    return JSON.parse(data?.value || '[]');
  } catch(_) { return []; }
}

async function renderRefHistory() {
  const container = document.getElementById('ref-history-list');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2);font-size:12px;opacity:.5">Cargando…</div>`;
  const hist = await refLoadHistory();
  const session = getSession();
  const isMaster = session && session.role === 'master';
  if (!hist.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2);font-size:12px;opacity:.4">No hay cargas registradas aún.</div>`;
    return;
  }
  container.innerHTML = hist.map(h => {
    const d = new Date(h.date);
    const dateStr = d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const reverted = h._reverted;
    const leadsHtml = (h.leads || []).map((l, i) => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${i+1}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--text);font-weight:600">${esc(l.nombre||'—')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${esc(l.telefono||'—')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${esc(l.hijos||'')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.notas||'')}</td>
      </tr>`).join('');
    return `
    <details style="background:var(--card2);border:1px solid ${reverted ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.07)'};border-radius:12px;overflow:hidden${reverted ? ';opacity:.6' : ''}">
      <summary style="padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;list-style:none;user-select:none">
        <span style="font-size:15px">${reverted ? '↩' : '🗂️'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:${reverted ? 'var(--text2)' : 'var(--text)'}">
            ${esc(h.boardName || h.boardId)}
            ${h.referidoPor ? `<span style="font-weight:400;color:var(--text2)"> · Ref: ${esc(h.referidoPor)}</span>` : ''}
            ${reverted ? `<span style="color:var(--red);font-size:10px;font-weight:700;margin-left:6px">REVERTIDO</span>` : ''}
          </div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">${dateStr} · ${h.added || (h.leads||[]).length} leads${h.ubicacion ? ' · ' + esc(h.ubicacion) : ''}</div>
        </div>
        ${isMaster && !reverted ? `<button onclick="event.preventDefault();event.stopPropagation();refUndo('${h.id}')" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:var(--red);font-size:10px;font-weight:700;padding:4px 12px;border-radius:6px;cursor:pointer;flex-shrink:0">↩ Revertir</button>` : ''}
      </summary>
      <div style="border-top:1px solid rgba(255,255,255,.06);overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:rgba(0,0,0,.2)">
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left;width:32px">#</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Nombre</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Teléfono</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left;width:50px">Hijos</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Notas</th>
            </tr>
          </thead>
          <tbody>${leadsHtml}</tbody>
        </table>
      </div>
    </details>`;
  }).join('');
}

async function refUndo(histId) {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el master puede revertir cargas', 'error'); return; }
  if (!confirm('¿Revertir esta carga? Se eliminarán los leads importados de su board.')) return;
  const key = _refHistoryKey();
  if (!key) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    const hist = JSON.parse(data?.value || '[]');
    const rec = hist.find(h => h.id === histId);
    if (!rec) { showToast('Registro no encontrado', 'error'); return; }
    // Remove leads from board
    if (rec._leadIds?.length && rec.boardId) {
      const boardLeads = loadLeads(rec.boardId);
      const idSet = new Set(rec._leadIds);
      await saveLeads(rec.boardId, boardLeads.filter(l => !idSet.has(l.id)));
    }
    // Mark as reverted
    rec._reverted = true;
    rec._revertedAt = new Date().toISOString();
    await supa.from('kv_store').upsert({ key, value: JSON.stringify(hist) });
    showToast('Carga revertida', 'success');
    renderRefHistory();
  } catch(e) { showToast('Error al revertir: ' + e.message, 'error'); }
}

function showImportPage() {
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  currentBoardId = null;
  document.getElementById('board-title').textContent = 'Importar Leads';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('table-wrap').style.display   = '';
  document.querySelectorAll('.board-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-import').classList.add('active');
  showImportPanel();
}

let _wrpCurrentTab = 'weekly';

function showWeeklyReportPage() {
  showBoardView();
  document.getElementById('weekly-report-page').style.display = 'flex';
  document.getElementById('table-wrap').style.display = 'none';
  document.getElementById('toolbar').style.display    = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.querySelectorAll('.board-item,.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-weekly-report').classList.add('active');
  wrpSwitchTab(_wrpCurrentTab, true);
}

function wrpSwitchTab(tab, forceLoad) {
  _wrpCurrentTab = tab;
  ['weekly','detail'].forEach(t => {
    document.getElementById(`wrp-pane-${t}`).style.display  = t === tab ? '' : 'none';
    document.getElementById(`wrp-tab-${t}`).className = `wrp-tab${t === tab ? ' wrp-tab-active' : ''}`;
  });
  if (tab === 'weekly') loadWeeklyReportPage();
  else loadDetailedReport();
}

function wrpRefresh() {
  if (_wrpCurrentTab === 'weekly') loadWeeklyReportPage();
  else loadDetailedReport();
}

// ── Weekly report helpers ────────────────────────────────────────────
let _wrpAdminView = false;

function wrpToggleAdminView() {
  _wrpAdminView = !_wrpAdminView;
  const btn = document.getElementById('wrp-view-toggle');
  if (btn) {
    btn.textContent = _wrpAdminView ? '✏️ Vista Edición' : '👁 Vista Administrador';
    btn.style.background = _wrpAdminView ? 'rgba(99,102,241,.15)' : 'var(--card2)';
    btn.style.color       = _wrpAdminView ? 'var(--accent)' : 'var(--text)';
    btn.style.borderColor = _wrpAdminView ? 'var(--accent)' : 'var(--border)';
  }
  loadWeeklyReportPage();
}

let _wrpSaveTimer = null;
function wrpScheduleSave() {
  clearTimeout(_wrpSaveTimer);
  _wrpSaveTimer = setTimeout(async () => {
    await supa.from('kv_store').upsert({ key:'gew_week_overrides', value: JSON.stringify(window._wrpOverrides||{}) });
  }, 800);
}

function wrpSetPrice(ws, board, val) {
  const v = parseFloat(val);
  if (!window._wrpOverrides[ws]) window._wrpOverrides[ws] = { discounts:[] };
  if (!window._wrpOverrides[ws].boardPrices) window._wrpOverrides[ws].boardPrices = {};
  window._wrpOverrides[ws].boardPrices[board] = isNaN(v) ? 0 : v;
  wrpUpdateInvoiceTotals(ws);
  wrpScheduleSave();
}

function wrpAddDiscount(ws) {
  if (!window._wrpOverrides[ws]) window._wrpOverrides[ws] = { discounts:[] };
  if (!window._wrpOverrides[ws].discounts) window._wrpOverrides[ws].discounts = [];
  const id = Date.now().toString(36);
  window._wrpOverrides[ws].discounts.push({ id, leads:0, price:0, desc:'' });
  // Re-render just the discount section
  renderWrpDiscounts(ws);
  wrpScheduleSave();
}

function wrpRemoveDiscount(ws, id) {
  if (!window._wrpOverrides[ws]?.discounts) return;
  window._wrpOverrides[ws].discounts = window._wrpOverrides[ws].discounts.filter(d => d.id !== id);
  renderWrpDiscounts(ws);
  wrpScheduleSave();
}

function wrpEditDiscount(ws, id, field, val) {
  if (!window._wrpOverrides[ws]?.discounts) return;
  const parsed = field === 'desc' ? val : (parseFloat(val) || 0);
  // Auto-remove row when quantity drops to 0 or below
  if (field === 'leads' && parsed <= 0) {
    window._wrpOverrides[ws].discounts = window._wrpOverrides[ws].discounts.filter(d => d.id !== id);
    renderWrpDiscounts(ws);
    wrpScheduleSave();
    return;
  }
  const disc = window._wrpOverrides[ws].discounts.find(d => d.id === id);
  if (!disc) return;
  disc[field] = parsed;
  wrpUpdateInvoiceTotals(ws);
  wrpScheduleSave();
}

function wrpUpdateInvoiceTotals(ws) {
  const ovr     = window._wrpOverrides[ws] || {};
  const boards  = window._wrpWeeks?.[ws]?.boards || {};
  let subtotal  = 0;
  Object.entries(boards).forEach(([bName, info]) => {
    const price = ovr.boardPrices?.[bName] ?? info.price;
    subtotal += info.count * price;
  });
  const discountTotal = (ovr.discounts||[]).reduce((s,d) => s + d.leads * d.price, 0);
  const total = subtotal - discountTotal;
  const fmt = n => n > 0 ? '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '$0.00';
  const subEl = document.getElementById(`wrp-sub-${ws}`);
  const dscEl = document.getElementById(`wrp-dsc-${ws}`);
  const totEl = document.getElementById(`wrp-tot-${ws}`);
  if (subEl) subEl.textContent = fmt(subtotal);
  if (dscEl) dscEl.textContent = discountTotal > 0 ? '-'+fmt(discountTotal) : '—';
  if (totEl) { totEl.textContent = fmt(total); totEl.style.color = total >= 0 ? '#34d399' : '#f87171'; }
  const pillEl = document.getElementById(`wrp-pill-${ws}`);
  if (pillEl) pillEl.textContent = fmt(total);
}

function renderWrpDiscounts(ws) {
  const el = document.getElementById(`wrp-discounts-${ws}`);
  if (!el) return;
  const discs    = window._wrpOverrides[ws]?.discounts || [];
  const editable = window._wrpEditableWeeks?.has(ws);
  if (!discs.length && !editable) { el.innerHTML = ''; wrpUpdateInvoiceTotals(ws); return; }

  // Count existing lead rows to continue alternation
  const leadRowCount = Object.keys(window._wrpWeeks?.[ws]?.boards || {}).length;

  const rows = discs.map((d, i) => {
    const bg    = (leadRowCount + i) % 2 === 0 ? '#f8faff' : '#eef3fb';
    const total = d.leads * d.price;
    const descCell = editable
      ? `<input value="${esc(d.desc)}" placeholder="Motivo…" data-ws="${ws}" data-id="${d.id}" data-field="desc"
           class="wrp-disc-input"
           style="width:100%;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;color:#1f2937;outline:none;font-family:inherit"/>`
      : (esc(d.desc) || 'Reposición');
    const leadsCell = editable
      ? `<input type="number" min="0" value="${d.leads}" data-ws="${ws}" data-id="${d.id}" data-field="leads"
           class="wrp-disc-input"
           style="width:65px;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;font-weight:700;text-align:center;outline:none;font-family:inherit"/>`
      : d.leads;
    const priceCell = editable
      ? `<input type="number" min="0" step="0.01" value="${d.price}" data-ws="${ws}" data-id="${d.id}" data-field="price"
           class="wrp-disc-input"
           style="width:75px;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;text-align:right;outline:none;font-family:inherit"/>`
      : (d.price ? '$'+d.price.toFixed(2) : '—');
    const deleteBtn = editable
      ? `<button data-ws="${ws}" data-id="${d.id}" class="wrp-disc-del" title="Eliminar"
           style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;opacity:.7">✕</button>`
      : '';
    return `<tr style="background:${bg}">
      <td style="padding:11px 20px;font-size:13px;color:#1e293b;border-bottom:1px solid #dde6f0">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:8px;vertical-align:middle"></span>
        Reposición de lead · ${descCell}
      </td>
      <td style="padding:11px 20px;text-align:center;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;font-weight:700;color:#dc2626">${leadsCell}</td>
      <td style="padding:11px 20px;text-align:right;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;color:#475569">${priceCell}</td>
      <td style="padding:11px 20px;text-align:right;font-weight:700;color:#dc2626;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${total>0?'-$'+total.toFixed(2):'—'}</td>
      <td style="padding:11px 20px;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;text-align:center">${deleteBtn}</td>
    </tr>`;
  }).join('');

  const addBtn = editable
    ? `<tr style="background:#f8faff"><td colspan="5" style="padding:8px 20px;border-bottom:1px solid #dde6f0">
        <button data-ws="${ws}" class="wrp-disc-add" style="background:none;border:1px dashed #fca5a5;color:#dc2626;border-radius:6px;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:700">＋ Reposición de lead</button>
       </td></tr>`
    : '';

  el.innerHTML = addBtn + rows;

  // Attach events via JS (avoids onclick quoting issues with dynamic ws/id values)
  el.querySelectorAll('.wrp-disc-del').forEach(btn => {
    btn.addEventListener('click', () => wrpRemoveDiscount(btn.dataset.ws, btn.dataset.id));
  });
  el.querySelectorAll('.wrp-disc-add').forEach(btn => {
    btn.addEventListener('click', () => wrpAddDiscount(btn.dataset.ws));
  });
  el.querySelectorAll('.wrp-disc-input').forEach(inp => {
    inp.addEventListener('input', () => wrpEditDiscount(inp.dataset.ws, inp.dataset.id, inp.dataset.field, inp.value));
  });

  wrpUpdateInvoiceTotals(ws);
}

async function loadWeeklyReportPage() {
  const body = document.getElementById('wrp-pane-weekly');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">Cargando…</div>`;

  try {
    const [histRes, ovrRes] = await Promise.all([
      supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle(),
      supa.from('kv_store').select('value').eq('key','gew_week_overrides').maybeSingle(),
    ]);
    const history   = JSON.parse(histRes.data?.value || '[]');
    let   overrides = JSON.parse(ovrRes.data?.value  || '{}');

    const weeks = {};
    history.forEach(r => {
      const ws = r.weekStart;
      if (!ws) return;
      if (!weeks[ws]) {
        const mon = new Date(ws + 'T00:00:00');
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        weeks[ws] = { end: sun.toISOString().slice(0,10), boards: {} };
      }
      const price = r.pricePerLead || 0;
      (r.distribution || []).forEach(d => {
        const key = d.boardName;
        if (!weeks[ws].boards[key]) weeks[ws].boards[key] = { count: 0, price: 0 };
        weeks[ws].boards[key].count += d.count;
        if (price > 0) weeks[ws].boards[key].price = price;
      });
    });

    // Determine editable weeks (current + previous)
    const today = new Date();
    const dow   = today.getDay();
    const thisMon = new Date(today); thisMon.setDate(today.getDate() + (dow===0?-6:1-dow)); thisMon.setHours(0,0,0,0);
    const prevMon = new Date(thisMon); prevMon.setDate(thisMon.getDate()-7);
    const currentWS = thisMon.toISOString().slice(0,10);
    const prevWS    = prevMon.toISOString().slice(0,10);
    window._wrpEditableWeeks = _wrpAdminView ? new Set() : new Set([currentWS, prevWS]);

    // Assign invoice numbers (oldest→newest, starting at 187, +2–4 each)
    const sortedAsc = Object.keys(weeks).sort((a,b)=>a.localeCompare(b));
    let ovrChanged  = false;
    // Find max existing invoice number
    let lastNum = 186;
    sortedAsc.forEach(ws => { const n = overrides[ws]?.invoiceNumber||0; if(n>lastNum) lastNum=n; });
    // For weeks without a number, assign in order
    sortedAsc.forEach(ws => {
      if (!overrides[ws]) { overrides[ws]={discounts:[]}; ovrChanged=true; }
      if (!overrides[ws].invoiceNumber) {
        lastNum += Math.floor(Math.random()*3)+2;
        overrides[ws].invoiceNumber = lastNum;
        ovrChanged = true;
      }
    });
    if (ovrChanged) await supa.from('kv_store').upsert({key:'gew_week_overrides',value:JSON.stringify(overrides)});

    window._wrpOverrides = overrides;
    window._wrpWeeks     = weeks;

    const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
    if (!sortedWeeks.length) {
      body.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--text2)">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="font-size:14px;font-weight:600">No hay datos semanales aún</div>
        <div style="font-size:12px;margin-top:6px">Importa leads asignando una semana para que aparezcan aquí</div>
      </div>`;
      return;
    }

    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fmtDate  = s => { const d = new Date(s+'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; };
    const fmtMoney = n => '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const todayStr = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

    let allLeads = 0, allRevenue = 0;
    sortedWeeks.forEach(ws => {
      const ovr = overrides[ws] || {};
      Object.entries(weeks[ws].boards).forEach(([bName, b]) => {
        const p = ovr.boardPrices?.[bName] ?? b.price;
        allLeads += b.count; allRevenue += b.count * p;
      });
    });

    const invoiceCards = sortedWeeks.map((ws) => {
      const w       = weeks[ws];
      const ovr     = overrides[ws] || {};
      const mon     = new Date(ws + 'T00:00:00');
      const boards  = Object.entries(w.boards);
      const editable = window._wrpEditableWeeks.has(ws);
      const invNum  = String(ovr.invoiceNumber || '').padStart(5,'0');
      let grandTotal = 0, grandSubtotal = 0;

      const rows = boards.map(([bName, info], idx) => {
        const price   = ovr.boardPrices?.[bName] ?? info.price;
        const subtotal = info.count * price;
        grandTotal += info.count; grandSubtotal += subtotal;
        const bg = idx % 2 === 0 ? '#f8faff' : '#eef3fb';
        const priceCell = editable
          ? `<td style="padding:8px 14px;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;text-align:right">
               <input type="number" min="0" step="0.01" value="${price||''}" placeholder="0.00"
                 oninput="wrpSetPrice('${ws}','${esc(bName)}',this.value);this.closest('tr').querySelector('.wrp-row-sub').textContent=this.value*${info.count}>0?'$'+(this.value*${info.count}).toFixed(2):'—'"
                 style="width:80px;border:1px solid #bfdbfe;border-radius:6px;padding:5px 8px;font-size:12px;text-align:right;background:#f0f7ff;outline:none;font-family:inherit"/>
             </td>`
          : `<td style="padding:11px 20px;text-align:right;font-size:13px;color:#475569;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${price>0?fmtMoney(price):'—'}</td>`;
        return `<tr style="background:${bg}">
          <td style="padding:11px 20px;font-size:13px;color:#1e293b;border-bottom:1px solid #dde6f0">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:8px;vertical-align:middle"></span>
            Lead · <strong>${esc(bName)}</strong>
          </td>
          <td style="padding:11px 20px;text-align:center;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${info.count}</td>
          ${priceCell}
          <td class="wrp-row-sub" style="padding:11px 20px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${subtotal>0?fmtMoney(subtotal):'—'}</td>
          <td style="padding:11px 20px;font-size:12px;color:#94a3b8;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0"></td>
        </tr>`;
      }).join('');

      const discountTotal = (ovr.discounts||[]).reduce((s,d)=>s+d.leads*d.price,0);
      const total = grandSubtotal - discountTotal;

      return `<div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06);margin-bottom:40px;overflow:hidden;border:1px solid #e2e8f0;font-family:'Segoe UI',system-ui,sans-serif">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0f2044 0%,#1e3a5f 60%,#1a4a7a 100%);padding:28px 32px 24px;position:relative;overflow:hidden">
          <div style="position:absolute;right:-20px;top:-20px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.04)"></div>
          <div style="position:absolute;right:40px;bottom:-40px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.03)"></div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;position:relative">
            <div>
              <div style="font-size:11px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px">Grupo Elite Work</div>
              <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">CRM Development Services</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:6px">lead.grupoelitework.com</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Reporte Semanal</div>
              <div style="font-size:24px;font-weight:800;color:#fff;margin-top:2px;letter-spacing:1px"># ${invNum}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px">Generado: ${todayStr}</div>
              ${editable ? '<div style="margin-top:6px;background:rgba(34,197,94,.2);color:#86efac;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;display:inline-block">✏️ Editable</div>' : ''}
            </div>
          </div>
          <div style="margin-top:20px;padding:10px 16px;background:rgba(255,255,255,.08);border-radius:8px;display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.12)">
            <span style="font-size:13px;color:#bfdbfe">📅</span>
            <span style="font-size:13px;font-weight:700;color:#e2e8f0">Semana del ${fmtDate(ws)} al ${fmtDate(w.end)}</span>
            <span style="font-size:11px;color:#93c5fd;background:rgba(147,197,253,.15);padding:2px 10px;border-radius:20px;margin-left:4px">${MONTHS_ES[mon.getMonth()]} ${mon.getFullYear()}</span>
          </div>
        </div>

        <!-- Table -->
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#1e3a5f">
              <th style="padding:11px 20px;text-align:left;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em">Descripción</th>
              <th style="padding:11px 20px;text-align:center;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Cantidad</th>
              <th style="padding:11px 20px;text-align:right;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Precio/Lead</th>
              <th style="padding:11px 20px;text-align:right;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Subtotal</th>
              <th style="padding:11px 20px;text-align:left;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Notas</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tbody id="wrp-discounts-${ws}"></tbody>
          </tbody>
        </table>

        <!-- Totals footer -->
        <div style="background:#f8faff;border-top:2px solid #e2e8f0;padding:0">
          <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif">
            <tr>
              <td style="padding:10px 20px;font-size:12px;color:#64748b;font-weight:600;width:60%">Subtotal leads</td>
              <td style="padding:10px 20px;text-align:right;font-size:13px;font-weight:700;color:#0f172a" id="wrp-sub-${ws}">${fmtMoney(grandSubtotal)}</td>
            </tr>
            <tr style="background:#0f2044">
              <td style="padding:14px 20px;font-size:13px;font-weight:800;color:#93c5fd;text-transform:uppercase;letter-spacing:.06em">TOTAL</td>
              <td style="padding:14px 20px;text-align:right;font-size:18px;font-weight:800;color:#34d399" id="wrp-tot-${ws}">${fmtMoney(total)}</td>
            </tr>
          </table>
        </div>

        <!-- Stats row (bottom) -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #e2e8f0;background:#f8faff">
          <div style="padding:14px 24px;border-right:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Boards</div>
            <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px">${boards.length}</div>
          </div>
          <div style="padding:14px 24px;border-right:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Total Leads</div>
            <div style="font-size:20px;font-weight:800;color:#1d4ed8;margin-top:2px">${grandTotal}</div>
          </div>
          <div style="padding:14px 24px">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Total Neto</div>
            <div style="font-size:20px;font-weight:800;color:#059669;margin-top:2px" id="wrp-pill-${ws}">${total>0?fmtMoney(total):'—'}</div>
          </div>
        </div>

        <!-- Card footer -->
        <div style="padding:12px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:10px;color:#94a3b8">Grupo Elite Work · CRM Development Services</span>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">REPORTE # ${invNum}</span>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = invoiceCards;

    // Render discount sections after DOM is ready
    sortedWeeks.forEach(ws => {
      renderWrpDiscounts(ws);
      wrpUpdateInvoiceTotals(ws);
    });

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);font-size:13px">Error cargando reporte: ${e.message}</div>`;
  }
}

async function loadDetailedReport() {
  const body = document.getElementById('wrp-pane-detail');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">Cargando…</div>`;

  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');

    if (!history.length) {
      body.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--text2)">
        <div style="font-size:40px;margin-bottom:12px">📋</div>
        <div style="font-size:14px;font-weight:600">Sin registros de importación</div>
        <div style="font-size:12px;margin-top:6px">Las cargas de leads aparecerán aquí agrupadas por semana</div>
      </div>`;
      return;
    }

    // Group records by weekStart
    const weeks = {};
    history.filter(r => !r.undone).forEach(r => {
      const ws = r.weekStart || r.date?.slice(0,10) || '';
      if (!ws) return;
      if (!weeks[ws]) {
        const mon = new Date(ws + 'T00:00:00');
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        weeks[ws] = { end: sun.toISOString().slice(0,10), records: [] };
      }
      weeks[ws].records.push(r);
    });

    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fmtDate = s => {
      const d = new Date(s + 'T00:00:00');
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    };
    const fmtImportDate = s => {
      const d = new Date(s);
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    };

    const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));

    const blocks = sortedWeeks.map(ws => {
      const w = weeks[ws];
      const mon = new Date(ws + 'T00:00:00');

      // Collect individual leads from localStorage using stored leadIds
      const allRows = [];
      w.records.forEach(r => {
        const importDate = r.date ? fmtImportDate(r.date) : '—';
        (r.distribution || []).forEach(dist => {
          const leads = loadLeads(dist.boardId);
          const leadIds = dist.leadIds || [];
          if (leadIds.length) {
            leadIds.forEach(id => {
              const l = leads.find(x => x.id === id);
              allRows.push({
                nombre:    l?.nombre    || '—',
                direccion: l?.direccion || l?.ubicacion || '—',
                board:     dist.boardName,
                fecha:     importDate,
              });
            });
          } else {
            // Older records without leadIds: show count summary row
            for (let i = 0; i < dist.count; i++) {
              allRows.push({ nombre: '(sin detalle)', direccion: '—', board: dist.boardName, fecha: importDate });
            }
          }
        });
      });

      const rows = allRows.map((row, i) => `<tr style="background:${i%2===0?'#fff':'#f8faff'}">
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:13px;color:#1e293b;font-weight:500">${esc(row.nombre)}</td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px;color:#475569">${esc(row.direccion)}</td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px">
          <span style="background:rgba(59,130,246,.1);color:#1d4ed8;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${esc(row.board)}</span>
        </td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px;color:#64748b;white-space:nowrap">${esc(row.fecha)}</td>
      </tr>`).join('');

      const emptyNote = allRows.length === 0
        ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;font-style:italic">No hay datos disponibles para esta semana</td></tr>`
        : '';

      return `<div style="margin-bottom:32px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.07);border:1px solid #e2e8f0;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f2044,#1e3a5f);padding:16px 24px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${MONTHS_ES[mon.getMonth()]} ${mon.getFullYear()}</div>
            <div style="font-size:15px;font-weight:800;color:#fff">Semana del ${fmtDate(ws)} al ${fmtDate(w.end)}</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:8px;padding:8px 18px;text-align:center;min-width:72px">
            <div style="font-size:22px;font-weight:900;color:#fff">${allRows.length}</div>
            <div style="font-size:10px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Leads</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Nombre</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Dirección</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Board</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Fecha importación</th>
            </tr>
          </thead>
          <tbody>${rows}${emptyNote}</tbody>
        </table>
      </div>`;
    });

    body.innerHTML = blocks.join('');
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);font-size:13px">Error: ${e.message}</div>`;
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) processCSVFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processCSVFile(file);
}

function processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    parseAndImport(text);
  };
  reader.readAsText(file, 'UTF-8');
}

function parseAndImport(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { showToast('CSV vacío o sin datos','error'); return; }

  const rawHeaders = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim()
    .replace(/[áä]/g,'a').replace(/[éë]/g,'e').replace(/[íï]/g,'i')
    .replace(/[óö]/g,'o').replace(/[úü]/g,'u').replace(/ñ/g,'n')
    .replace(/[^a-z0-9]/g,'_'));

  const destEl     = document.getElementById('import-dest');
  const destId     = destEl ? destEl.value : '';
  if (!destId) { showToast('Selecciona un board de destino', 'error'); return; }
  const csvLeadTypeEl = document.getElementById('import-lead-type');
  const csvLeadType   = csvLeadTypeEl ? csvLeadTypeEl.value : '';
  const leads  = loadLeads(destId);
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i]);
    if (vals.every(v => !v.trim())) continue;
    const row = {};
    rawHeaders.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

    const lead = {
      id:          uid(),
      creacion:    today(),
      nombre:      row.nombre || '',
      lead:        csvLeadType || row.lead || '',
      email:       row.email || '',
      telefono:    row.telefono || row.phone || row.tel || '',
      hijos:       row.hijos || '',
      direccion:   row.direccion || row.address || '',
      ubicacion:   row.ubicacion || row.location || '',
      asignado:    normalizeAsignado(row.asignado || ''),
      estado:      row.estado || row.status || '',
      resultado:   row.resultado || '',

      notas:       row.notas || row.notes || '',
    };
    if (lead.asignado) {
      const _csvUser = loadUsers().find(u => u.name === lead.asignado);
      if (_csvUser) lead.asignadoId = _csvUser.id;
    }
    leads.push(lead);
    imported++;
  }

  saveLeads(destId, leads);
  document.getElementById('import-log').innerHTML =
    `<span style="color:var(--green)">✓ ${imported} lead(s) importados al board <strong>${getBoard(destId).name}</strong></span>`;
  allBoards();
  showToast(`${imported} leads importados ✓`, 'success');
}

function parseCSVRow(line) {
  const result = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ════════════════════════════════════════════
//  COLUMN RESIZE
// ════════════════════════════════════════════
function initResizers() {
  document.querySelectorAll('.col-resizer').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const col  = handle.dataset.col;
      const th   = handle.parentElement;
      const startX = e.clientX;
      const startW = th.offsetWidth;
      handle.classList.add('dragging');

      const onMove = e => {
        const newW = Math.max(60, startW + e.clientX - startX);
        COL_WIDTHS[col] = newW;
        th.style.width = newW + 'px';
        // also update all td cells in that column
        const colIdx = Array.from(th.parentElement.children).indexOf(th);
        document.querySelectorAll(`#leads-table tbody tr`).forEach(row => {
          const td = row.children[colIdx];
          if (td) td.style.width = newW + 'px';
        });
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // persist widths
        const cfg = loadColConfig();
        cfg.widths = { ...(cfg.widths||{}), ...COL_WIDTHS };
        saveColConfig(cfg);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ════════════════════════════════════════════
//  BULK SELECT
// ════════════════════════════════════════════
function toggleRowSelect(checkbox, id) {
  if (checkbox.checked) selectedIds.add(id);
  else selectedIds.delete(id);
  const row = checkbox.closest('tr');
  row.classList.toggle('selected-row', checkbox.checked);
  syncHeaderCheckbox();
  updateBulkBar();
}

function toggleSelectAll(headerCb) {
  const checks = document.querySelectorAll('.row-checkbox');
  checks.forEach(cb => {
    cb.checked = headerCb.checked;
    const id = cb.dataset.id;
    if (headerCb.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    cb.closest('tr').classList.toggle('selected-row', headerCb.checked);
  });
  updateBulkBar();
}

function syncHeaderCheckbox() {
  const all = document.querySelectorAll('.row-checkbox');
  const checked = document.querySelectorAll('.row-checkbox:checked');
  const hcb = document.getElementById('check-all');
  if (!hcb) return;
  hcb.checked       = all.length > 0 && checked.length === all.length;
  hcb.indeterminate = checked.length > 0 && checked.length < all.length;
}

function selectAllInBoard() {
  if (!currentBoardId) return;
  loadLeads(currentBoardId).forEach(l => selectedIds.add(l.id));
  // also check visible checkboxes
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.checked = true;
    cb.closest('tr').classList.add('selected-row');
  });
  syncHeaderCheckbox();
  updateBulkBar();
  showToast(`${selectedIds.size} leads seleccionados ✓`, 'success');
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.checked = false;
    cb.closest('tr').classList.remove('selected-row');
  });
  const hcb = document.getElementById('check-all');
  if (hcb) { hcb.checked = false; hcb.indeterminate = false; }
  updateBulkBar();
}

function updateBulkBar() {
  const bar     = document.getElementById('bulk-bar');
  const count   = selectedIds.size;
  const session = getSession();
  const isMaster = session && session.role === 'master';
  if (count === 0) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');

  const totalInBoard = currentBoardId ? loadLeads(currentBoardId).length : 0;
  document.getElementById('bulk-count').textContent = `${count} seleccionado${count !== 1 ? 's' : ''}${totalInBoard > count ? ` de ${totalInBoard}` : ''}`;

  // "Seleccionar todos" button — master only, when not all are selected
  const selAllBtn = document.getElementById('bulk-select-all-btn');
  if (selAllBtn) selAllBtn.style.display = (isMaster && totalInBoard > count) ? '' : 'none';

  // populate ubicacion
  const board = getBoard(currentBoardId);
  const ubSel = document.getElementById('bulk-ubicacion');
  if (ubSel && board) {
    const ubOpts = board.ubicaciones && board.ubicaciones.length > 0
      ? board.ubicaciones
      : BOARDS.flatMap(b2 => b2.ubicaciones).filter((x,i,a) => a.indexOf(x)===i);
    ubSel.innerHTML = '<option value="">— Sin cambio —</option>' +
      ubOpts.map(u => `<option value="${esc(u)}">${u}</option>`).join('');
  }

  // populate asignado
  const agSel = document.getElementById('bulk-asignado');
  if (agSel) {
    agSel.innerHTML = '<option value="">— Sin cambio —</option>' +
      getAgents().map(a => `<option value="${esc(a)}">${a}</option>`).join('');
  }

  // populate tipo de lead
  const leadSel = document.getElementById('bulk-lead');
  if (leadSel) {
    leadSel.innerHTML = '<option value="">— Sin cambio —</option>' +
      getLeadTypes().map(t => `<option value="${esc(t)}">${t}</option>`).join('');
  }

  // mover a board — master only
  const boardSel  = document.getElementById('bulk-board');
  const boardSep  = document.getElementById('bulk-sep-board');
  const boardLbl  = document.getElementById('bulk-label-board');
  if (boardSel && boardSep && boardLbl) {
    const show = isMaster && currentBoardId;
    boardSep.style.display = boardLbl.style.display = boardSel.style.display = show ? '' : 'none';
    if (show) {
      boardSel.innerHTML = '<option value="">— Sin cambio —</option>' +
        BOARDS.filter(b => b.id !== currentBoardId).map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    }
  }
}

function applyBulkEdit() {
  if (selectedIds.size === 0) return;
  const asignado  = document.getElementById('bulk-asignado').value;
  const ubicacion = document.getElementById('bulk-ubicacion').value;
  const resultado = document.getElementById('bulk-resultado').value;
  const leadType  = document.getElementById('bulk-lead').value;
  const targetBoard = document.getElementById('bulk-board')?.value || '';

  if (!asignado && !ubicacion && !resultado && !leadType && !targetBoard) {
    showToast('Selecciona al menos un campo a editar', 'error'); return;
  }

  // Handle board move separately
  if (targetBoard) {
    const snapshotIds = new Set(selectedIds);
    const srcLeads  = loadLeads(currentBoardId);
    const toMove    = srcLeads.filter(l => snapshotIds.has(l.id));
    if (!confirm(`¿Mover ${toMove.length} lead${toMove.length!==1?'s':''} al board "${BOARDS.find(b=>b.id===targetBoard)?.name}"?`)) return;
    const destLeads = loadLeads(targetBoard);
    toMove.forEach(l => { destLeads.push({ ...l }); });
    saveLeads(targetBoard, destLeads);
    saveLeads(currentBoardId, srcLeads.filter(l => !snapshotIds.has(l.id)));
    selectedIds.clear();
    renderTableKeepSelection();
    showToast(`${toMove.length} lead${toMove.length!==1?'s':''} movidos ✓`, 'success');
    return;
  }

  // Snapshot selected IDs immediately so re-renders don't wipe them
  const snapshotIds = new Set(selectedIds);
  const boardId     = currentBoardId;
  const leads       = loadLeads(boardId);
  const reassignSet = new Set(
    asignado
      ? leads.filter(l => snapshotIds.has(l.id) && l.asignado && l.asignado !== asignado).map(l => l.id)
      : []
  );

  const _bulkAsignadoUser = asignado ? loadUsers().find(u => u.name === asignado) : null;
  const _bulkAsignadoId   = _bulkAsignadoUser ? _bulkAsignadoUser.id : null;

  const doApply = (mode) => {
    let changed = 0;
    leads.forEach(l => {
      if (!snapshotIds.has(l.id)) return;
      if (asignado) {
        applyReassignMode(l, asignado, reassignSet.has(l.id) ? mode : 'full');
        if (_bulkAsignadoId) l.asignadoId = _bulkAsignadoId;
        else delete l.asignadoId;
      }
      if (ubicacion) l.ubicacion = ubicacion;
      if (resultado) l.resultado = resultado;
      if (leadType)  l.lead      = leadType;
      changed++;
    });
    saveLeads(boardId, leads);
    renderTableKeepSelection();
    showToast(`${changed} lead${changed !== 1 ? 's' : ''} actualizados ✓`, 'success');
  };

  if (asignado) {
    const isTransfer = reassignSet.size > 0;
    if (!isTransfer) { doApply('full'); return; }
    _reassignPending = {
      lead: { asignado: `${reassignSet.size} lead(s) con agente previo` },
      newAgent: asignado,
      onConfirm: doApply
    };
    const hdr = document.querySelector('#reassign-modal-overlay .modal-header h2');
    if (hdr) hdr.textContent = '⚠️ Reasignar Leads';
    const wb = document.querySelector('#reassign-modal-overlay .modal-body > div');
    if (wb) {
      wb.style.display = '';
      document.getElementById('reassign-old-name').textContent = `${reassignSet.size} lead(s) ya asignados`;
      document.getElementById('reassign-new-name').textContent = asignado;
    }
    const cmsg = document.getElementById('reassign-confirm-msg');
    if (cmsg) cmsg.textContent = `¿Cómo transferir los ${reassignSet.size} lead(s) ya asignados a ${asignado}?`;
    const tOpts = document.getElementById('reassign-transfer-opts');
    const cSimp = document.getElementById('reassign-confirm-simple');
    if (tOpts) tOpts.style.display = 'flex';
    if (cSimp) cSimp.style.display = 'none';
    document.getElementById('reassign-modal-overlay').classList.add('open');
  } else {
    doApply('full');
  }
}

function bulkDelete() {
  if (selectedIds.size === 0) return;
  // Block deletion of vendidos leads for non-admin/non-master
  if (currentBoardId === VENDIDOS_BOARD.id) {
    const _sessD = getSession();
    if (!_sessD || (_sessD.role !== 'master' && _sessD.role !== 'admin')) {
      showToast('Los leads vendidos no pueden eliminarse.', 'error');
      return;
    }
  }
  const count = selectedIds.size;
  const leads = loadLeads(currentBoardId);
  const assigned = leads.filter(l => selectedIds.has(l.id) && l.asignado && l.asignado !== 'Sin asignar');
  if (assigned.length > 0) {
    const agentGroups = {};
    assigned.forEach(l => { agentGroups[l.asignado] = (agentGroups[l.asignado] || 0) + 1; });
    const agentList = Object.entries(agentGroups).map(([name, n]) => `• ${name} (${n})`).join('\n');
    const ok = confirm(`⚠️ ADVERTENCIA: ${assigned.length} de los ${count} leads seleccionados tienen agente asignado:\n\n${agentList}\n\n¿Seguro que quieres eliminarlos? El agente perderá acceso a estos leads.`);
    if (!ok) return;
  } else {
    if (!confirm(`¿Mover ${count} lead${count !== 1 ? 's' : ''} a la carpeta de Eliminados?`)) return;
  }
  selectedIds.forEach(id => softDeleteLead(id, currentBoardId));
  clearSelection();
  renderTable();
  showToast(`${count} lead${count !== 1 ? 's' : ''} movidos a Eliminados`, 'error');
}

// ════════════════════════════════════════════
//  AGENT PICKER
// ════════════════════════════════════════════
const _AP_ROLE_LABELS = { master:'Desarrollador', admin:'Administrador', master_manager:'MGA', manager:'GA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' };
const _AP_ROLE_COLOR  = { master:'#6366f1', admin:'#0073ea', master_manager:'#f59e0b', manager:'#3ecf8e', supervisor_agent:'#2dd4bf', agent:'#94a3b8', caller:'#f472b6' };
let _apLeadId = null, _apCloseHandler = null;

function openAgentPicker(leadId, anchorEl) {
  _apLeadId = leadId;
  const users = loadUsers().filter(u => !u.inactive);
  const session = getSession();
  let pool = users;
  if (session && session.role !== 'master') {
    const names = new Set(getAgents());
    pool = users.filter(u => names.has(u.name));
  }
  _renderAgentPickerList(pool, '');
  const picker = document.getElementById('agent-picker');
  picker.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  let top = rect.bottom + 4, left = rect.left;
  if (top + 340 > window.innerHeight) top = rect.top - 340;
  if (left + 240 > window.innerWidth) left = window.innerWidth - 248;
  picker.style.top  = top  + 'px';
  picker.style.left = left + 'px';
  const inp = document.getElementById('agent-picker-search');
  inp.value = '';
  setTimeout(() => inp.focus(), 40);
  if (_apCloseHandler) document.removeEventListener('mousedown', _apCloseHandler);
  _apCloseHandler = e => {
    if (!picker.contains(e.target) && e.target !== anchorEl) closeAgentPicker();
  };
  setTimeout(() => document.addEventListener('mousedown', _apCloseHandler), 100);
}

function _renderAgentPickerList(pool, q) {
  const filtered = q ? pool.filter(u => u.name.toLowerCase().includes(q.toLowerCase())) : pool;
  const list = document.getElementById('agent-picker-list');
  let html = `<div class="_ap-item" data-val="" onmousedown="pickAgent('')" style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer;color:var(--text2);font-size:12px" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
    <span style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text2)">—</span>
    <span>Sin asignar</span>
  </div>`;
  filtered.forEach(u => {
    const initials = getInitials(u.name);
    const color = strToTableColor(u.name) || '#2e7d6b';
    const roleLabel = _AP_ROLE_LABELS[u.role] || u.role;
    const roleColor = _AP_ROLE_COLOR[u.role] || '#94a3b8';
    html += `<div class="_ap-item" onmousedown="pickAgent('${esc(u.name)}','${esc(u.id)}')"
      style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;cursor:pointer"
      onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
      <span style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">${initials}</span>
      <span style="flex:1;min-width:0">
        <span style="display:block;font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</span>
        <span style="display:block;font-size:10px;color:${roleColor};font-weight:600;margin-top:1px">${roleLabel}</span>
      </span>
    </div>`;
  });
  if (!filtered.length) html += `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text2)">Sin resultados</div>`;
  list.innerHTML = html;
}

function filterAgentPicker(q) {
  const users = loadUsers().filter(u => !u.inactive);
  const session = getSession();
  let pool = users;
  if (session && session.role !== 'master') {
    const names = new Set(getAgents());
    pool = users.filter(u => names.has(u.name));
  }
  _renderAgentPickerList(pool, q);
}

function pickAgent(name, userId) {
  const leadId = _apLeadId;
  closeAgentPicker();
  if (!leadId) return;
  const boardId = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const leads = loadLeads(boardId);
  const lead  = leads.find(l => l.id === leadId);
  if (!lead) return;
  const prevAsignado   = lead.asignado   || '';
  const prevAsignadoId = lead.asignadoId || null;
  const newAgent = normalizeAsignado(name);
  const validUserId = userId && loadUsers().some(u => u.id === userId) ? userId : null;
  checkReassign(lead, newAgent, (mode) => {
    applyReassignMode(lead, newAgent, mode);
    if (validUserId) lead.asignadoId = validUserId;
    else delete lead.asignadoId;
    saveLeads(boardId, leads);
    renderTableKeepSelection();
    showAssignUndoBar(leadId, boardId, prevAsignado, prevAsignadoId, newAgent);
  });
}

function closeAgentPicker() {
  document.getElementById('agent-picker').style.display = 'none';
  if (_apCloseHandler) { document.removeEventListener('mousedown', _apCloseHandler); _apCloseHandler = null; }
}

// ════════════════════════════════════════════
//  INLINE DROPDOWNS
// ════════════════════════════════════════════
function openInlineSel(span) {
  const sel = span.nextElementSibling;
  span.style.display = 'none';
  sel.style.display  = 'block';
  sel.focus();
}

function closeInlineSel(sel) {
  setTimeout(() => {
    sel.style.display = 'none';
    const span = sel.previousElementSibling;
    if (span) span.style.display = 'inline-flex';
  }, 120);
}

// ── Reassign confirmation ──
let _reassignPending = null;

function checkReassign(lead, newAgent, onConfirm) {
  const oldAgent = lead.asignado || '';
  if (!newAgent || oldAgent === newAgent || !oldAgent) { onConfirm('full'); return; }
  _reassignPending = { lead, newAgent, onConfirm };
  const isTransfer = !!oldAgent;
  const header = document.querySelector('#reassign-modal-overlay .modal-header h2');
  if (header) header.textContent = isTransfer ? '⚠️ Transferir Lead' : '👤 Asignar Lead';
  const warningBox = document.querySelector('#reassign-modal-overlay .modal-body > div');
  if (warningBox) {
    if (isTransfer) {
      warningBox.style.display = '';
      document.getElementById('reassign-old-name').textContent = oldAgent;
      document.getElementById('reassign-new-name').textContent = newAgent;
    } else {
      warningBox.style.display = 'none';
    }
  }
  const confirmMsg = document.getElementById('reassign-confirm-msg');
  if (confirmMsg) confirmMsg.textContent = isTransfer
    ? '¿Cómo deseas transferir el lead?'
    : `¿Asignar este lead a ${newAgent}?`;
  const transferOpts  = document.getElementById('reassign-transfer-opts');
  const confirmSimple = document.getElementById('reassign-confirm-simple');
  if (transferOpts)  transferOpts.style.display  = isTransfer ? 'flex' : 'none';
  if (confirmSimple) confirmSimple.style.display = isTransfer ? 'none' : 'block';
  document.getElementById('reassign-modal-overlay').classList.add('open');
}

function applyReassignMode(lead, newAgent, mode) {
  if (mode === 'original') {
    const keep = ['id','nombre','lead','email','telefono','hijos','direccion','ubicacion','creacion','_testLead'];
    Object.keys(lead).forEach(k => { if (!keep.includes(k)) delete lead[k]; });
    lead.notas = ''; lead.resultado = ''; lead.estado = '';
  }
  lead.asignado = newAgent;
  if (newAgent) {
    lead.fechaAsignado = new Date().toISOString();
    logActivity('assign', `Lead asignado a ${newAgent}`, `${lead.nombre || lead.email || lead.id}`);
  }
}

function doReassign(mode) {
  if (!_reassignPending) return;
  const { onConfirm } = _reassignPending;
  document.getElementById('reassign-modal-overlay').classList.remove('open');
  _reassignPending = null;
  onConfirm(mode);
}

function cancelReassign() {
  _reassignPending = null;
  document.getElementById('reassign-modal-overlay').classList.remove('open');
}

// ── Assign undo snackbar ──
let _assignUndoTimer = null;
let _assignUndoData  = null;

function showAssignUndoBar(leadId, boardId, prevAsignado, prevAsignadoId, newAsignado) {
  _assignUndoData = { leadId, boardId, prevAsignado, prevAsignadoId };
  if (_assignUndoTimer) clearTimeout(_assignUndoTimer);
  const bar  = document.getElementById('assign-undo-bar');
  const text = document.getElementById('assign-undo-text');
  const prog = document.getElementById('assign-undo-progress');
  const label = newAsignado || 'Sin asignar';
  text.textContent = `✓ Asignado a ${label}`;
  bar.classList.add('visible');
  prog.style.transition = 'none';
  prog.style.width = '100%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      prog.style.transition = 'width 3s linear';
      prog.style.width = '0%';
    });
  });
  _assignUndoTimer = setTimeout(() => {
    bar.classList.remove('visible');
    _assignUndoData = null;
  }, 3000);
}

function undoLastAssign() {
  if (!_assignUndoData) return;
  const { leadId, boardId, prevAsignado, prevAsignadoId } = _assignUndoData;
  if (_assignUndoTimer) clearTimeout(_assignUndoTimer);
  document.getElementById('assign-undo-bar').classList.remove('visible');
  _assignUndoData = null;
  const leads = loadLeads(boardId);
  const lead  = leads.find(l => l.id === leadId);
  if (!lead) return;
  lead.asignado = prevAsignado || '';
  if (prevAsignadoId) lead.asignadoId = prevAsignadoId;
  else delete lead.asignadoId;
  saveLeads(boardId, leads);
  renderTableKeepSelection();
  showToast('Asignación deshecha ✓', 'success');
}

function saveInlineField(sel, leadId, field) {
  // Leads in vendidos board are fully locked
  const _lockBoardId = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
  if (_lockBoardId === VENDIDOS_BOARD.id) {
    const _sess = getSession();
    if (!_sess || (_sess.role !== 'master' && _sess.role !== 'admin')) {
      showToast('Este lead está bloqueado. Solo el administrador puede modificarlo.', 'error');
      return;
    }
  }
  // ENTRADA — warn before changing
  if (field === 'entrada' && sel.value) {
    const _prevEntrada = (loadLeads(currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId).find(l => l.id === leadId) || {}).entrada || 'Solicitud';
    if (sel.value !== _prevEntrada) {
      const ok = confirm(`⚠️ Esta información es importante para el manejo del cliente.\n\nAl hacer este cambio podrías alterar la forma de comunicación con el cliente.\n\nSea prudente con este cambio.\n\n¿Deseas continuar?`);
      if (!ok) {
        sel.value = _prevEntrada;
        closeInlineSel(sel);
        return;
      }
    }
  }
  if (field === 'asignado' && sel.value === '__add_agent__') {
    sel.value = '';
    sel.style.display = 'none';
    const spanEl = sel.previousElementSibling;
    if (spanEl) spanEl.style.display = '';
    showUsersPage();
    return;
  }
  // VENDIDO! — move to vendidos board + celebration
  if (field === 'resultado' && sel.value === 'VENDIDO! 🏆') {
    sel.value = '';
    sel.style.display = 'none';
    const spanElV = sel.previousElementSibling;
    if (spanElV) spanElV.style.display = '';
    const bIdV = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
    if (!bIdV) return;
    const leadV = loadLeads(bIdV).find(l => l.id === leadId);
    if (!leadV) return;
    showVendidoAnimation();
    setTimeout(() => moveLeadToVendidos(leadId, bIdV), 400);
    return;
  }
  if (field === 'resultado' && sel.value === '__delete_lead__') {
    sel.value = '';
    sel.style.display = 'none';
    const spanElD = sel.previousElementSibling;
    if (spanElD) spanElD.style.display = '';
    const bIdD = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
    const _sessD = getSession();
    if (_sessD && _sessD.role !== 'master') {
      openResultadoNoteModal(leadId, bIdD, '__delete_lead__');
    } else {
      openDeleteReasonModal(leadId, bIdD);
    }
    return;
  }
  // Non-master: intercept any resultado change and require a justification note
  if (field === 'resultado' && sel.value) {
    const _sessR = getSession();
    if (_sessR && _sessR.role !== 'master') {
      const capturedVal = sel.value;
      // Confirm before proceeding for destructive results
      const bIdR = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
      const _leadR = bIdR ? loadLeads(bIdR).find(l => l.id === leadId) : null;
      if (!_confirmDestructivo(capturedVal, _leadR?.nombre)) {
        sel.value = '';
        sel.style.display = 'none';
        const spanElRx = sel.previousElementSibling;
        if (spanElRx) spanElRx.style.display = '';
        return;
      }
      sel.value = '';
      sel.style.display = 'none';
      const spanElR = sel.previousElementSibling;
      if (spanElR) spanElR.style.display = '';
      openResultadoNoteModal(leadId, bIdR, capturedVal);
      return;
    }
  }
  const boardId  = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const newValue = field === 'asignado' ? normalizeAsignado(sel.value) : sel.value;
  const isMulti  = selectedIds.size > 1 && selectedIds.has(leadId);
  const snapshotIds = isMulti ? new Set(selectedIds) : null;

  // Hide the dropdown immediately
  sel.style.display = 'none';
  const spanEl = sel.previousElementSibling;
  if (spanEl) spanEl.style.display = '';

  if (field === 'asignado') {
    if (isMulti) {
      // Bulk inline reassign — reuse bulk-edit logic
      const leads = loadLeads(boardId);
      const reassignSet = new Set(
        leads.filter(l => snapshotIds.has(l.id) && l.asignado && l.asignado !== newValue).map(l => l.id)
      );
      const _inlineAsigUser = newValue ? loadUsers().find(u => u.name === newValue) : null;
      const _inlineAsigId   = _inlineAsigUser ? _inlineAsigUser.id : null;
      const doApply = (mode) => {
        leads.forEach(l => {
          if (!snapshotIds.has(l.id)) return;
          applyReassignMode(l, newValue, reassignSet.has(l.id) ? mode : 'full');
          if (_inlineAsigId) l.asignadoId = _inlineAsigId;
          else delete l.asignadoId;
        });
        saveLeads(boardId, leads);
        renderTableKeepSelection();
        showToast(`${snapshotIds.size} lead${snapshotIds.size !== 1 ? 's' : ''} transferidos ✓`, 'success');
        showAssignUndoBar(leadId, boardId, '', null, newValue);
      };
      {
        const isTransfer = reassignSet.size > 0;
        if (!isTransfer) { doApply('full'); return; }
        _reassignPending = { lead: {}, newAgent: newValue, onConfirm: doApply };
        const hdr = document.querySelector('#reassign-modal-overlay .modal-header h2');
        if (hdr) hdr.textContent = '⚠️ Reasignar Leads';
        const wb = document.querySelector('#reassign-modal-overlay .modal-body > div');
        if (wb) {
          wb.style.display = '';
          document.getElementById('reassign-old-name').textContent = `${reassignSet.size} lead(s) ya asignados`;
          document.getElementById('reassign-new-name').textContent = newValue;
        }
        const cmsg = document.getElementById('reassign-confirm-msg');
        if (cmsg) cmsg.textContent = `¿Cómo transferir los ${reassignSet.size} lead(s) ya asignados a ${newValue}?`;
        const tOpts = document.getElementById('reassign-transfer-opts');
        const cSimp = document.getElementById('reassign-confirm-simple');
        if (tOpts) tOpts.style.display = 'flex';
        if (cSimp) cSimp.style.display = 'none';
        document.getElementById('reassign-modal-overlay').classList.add('open');
      }
      return;
    }
    // Single lead reassign
    const leads = loadLeads(boardId);
    const lead  = leads.find(l => l.id === leadId);
    if (!lead) return;
    const prevAsignado   = lead.asignado   || '';
    const prevAsignadoId = lead.asignadoId || null;
    checkReassign(lead, newValue, (mode) => {
      applyReassignMode(lead, newValue, mode);
      const asigUser = newValue ? loadUsers().find(u => u.name === newValue) : null;
      if (asigUser) lead.asignadoId = asigUser.id;
      else delete lead.asignadoId;
      saveLeads(boardId, leads);
      if (spanEl) { spanEl.className = 'inline-display' + (!newValue ? ' empty-val' : ''); spanEl.innerHTML = esc(newValue || 'Sin asignar') + ' <span class="caret">▾</span>'; }
      const row = sel.closest('tr');
      if (row) row.classList.toggle('unassigned-row', !newValue);
      showAssignUndoBar(leadId, boardId, prevAsignado, prevAsignadoId, newValue);
    });
    return;
  }

  // Non-asignado field
  const leads = loadLeads(boardId);
  if (isMulti) {
    leads.forEach(l => { if (snapshotIds.has(l.id)) l[field] = newValue; });
    saveLeads(boardId, leads);
    renderTableKeepSelection();
    showToast(`${snapshotIds.size} lead${snapshotIds.size !== 1 ? 's' : ''} actualizados ✓`, 'success');
    return;
  }
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  lead[field] = newValue;
  saveLeads(boardId, leads);
  if (spanEl) { spanEl.className = 'inline-display' + (!newValue ? ' empty-val' : ''); spanEl.innerHTML = esc(newValue || '—') + ' <span class="caret">▾</span>'; }
  if (field === 'resultado' && newValue === 'NO INTERESADO') {
    softDeleteLead(leadId, boardId);
    renderTable();
    showToast('Lead eliminado: No Interesado', 'error');
    return;
  }
  if (field === 'resultado' && newValue === 'CITA AGENDADA') {
    const row = sel.closest('tr');
    if (row) {
      row.classList.remove('cita-anim');
      void row.offsetWidth;
      row.classList.add('cita-anim');
      row.addEventListener('animationend', () => row.classList.remove('cita-anim'), { once: true });
    }
    openCitaModal(leadId, boardId, lead.nombre || lead.email || '');
    return;
  }
  showToast('Guardado ✓', 'success');
}

// ════════════════════════════════════════════
//  CITA AGENDADA MODAL
// ════════════════════════════════════════════
let _citaLeadId = null, _citaBoardId = null;

function openCitaModal(leadId, boardId, leadName) {
  _citaLeadId  = leadId;
  _citaBoardId = boardId;
  const today  = new Date().toISOString().slice(0, 10);
  document.getElementById('cita-fecha').value = today;
  document.getElementById('cita-hora').value  = '';
  document.getElementById('cita-notas').value = '';
  document.getElementById('cita-lead-name-label').textContent = leadName || 'Registra los detalles de la cita';
  const ov = document.getElementById('cita-modal-overlay');
  ov.style.display = 'flex';
}

function closeCitaModal() {
  document.getElementById('cita-modal-overlay').style.display = 'none';
  _citaLeadId = null; _citaBoardId = null;
  showToast('Cita agendada ✓', 'success');
}

async function saveCitaDetails() {
  if (!_citaLeadId || !_citaBoardId) { closeCitaModal(); return; }
  const fecha = document.getElementById('cita-fecha').value;
  const hora  = document.getElementById('cita-hora').value;
  const notas = document.getElementById('cita-notas').value.trim();
  const leads = loadLeads(_citaBoardId);
  const lead  = leads.find(l => l.id === _citaLeadId);
  if (lead) {
    lead.citaFecha = fecha;
    lead.citaHora  = hora;
    if (notas) { const _cn = parseNotes(lead._notes); _cn.push({ text: `📅 Cita ${fecha}${hora?' a las '+hora:''}: ${notas}`, author: 'Sistema', date: new Date().toISOString(), system: true }); lead._notes = JSON.stringify(_cn); }
    saveLeads(_citaBoardId, leads);
    // Auto-create calendar event
    const session = getSession();
    const evts = loadCalEvents();
    evts.push({
      id: 'evt_' + Date.now(), type: 'cita_agendada',
      titulo: `Cita: ${lead.nombre || lead.email || 'Lead'}`,
      fecha, hora, notas,
      userId: session?.id, userName: session?.name,
      leadId: _citaLeadId, createdAt: new Date().toISOString(), createdBy: session?.id
    });
    await saveCalEvents(evts);
  }
  document.getElementById('cita-modal-overlay').style.display = 'none';
  _citaLeadId = null; _citaBoardId = null;
  showCongratsAnimation();
}

function showCongratsAnimation() {
  const el = document.getElementById('cita-congrats');
  el.style.display = 'flex';
  launchConfetti();
  setTimeout(() => {
    const card = document.getElementById('cita-congrats-card');
    if (card) card.style.animation = 'congrats-out .4s ease forwards';
    setTimeout(() => {
      el.style.display = 'none';
      if (card) card.style.animation = 'congrats-pop .45s cubic-bezier(.34,1.56,.64,1) both';
      const canvas = document.getElementById('cita-confetti-canvas');
      if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); }
    }, 420);
  }, 2800);
}

function launchConfetti() {
  const canvas = document.getElementById('cita-confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx     = canvas.getContext('2d');
  const pieces  = Array.from({ length: 90 }, () => ({
    x:     Math.random() * canvas.width,
    y:     -10 - Math.random() * 80,
    r:     Math.random() * 6 + 3,
    d:     Math.random() * 2 + 1,
    color: ['#00c875','#0073ea','#fdab3d','#a78bfa','#00b7c3','#fff'][Math.floor(Math.random()*6)],
    tilt:  Math.random() * 10 - 5,
    tiltV: Math.random() * .15 + .05,
    shape: Math.random() > .5 ? 'circle' : 'rect',
  }));
  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = .85;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
      }
      ctx.restore();
      p.y     += p.d + 1.5;
      p.x     += Math.sin(p.y * .02) * 1.2;
      p.tilt  += p.tiltV;
    });
    if (pieces.some(p => p.y < canvas.height + 20)) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  draw();
}

function showVendidoAnimation() {
  const el = document.getElementById('vendido-congrats');
  el.style.display = 'flex';
  launchConfettiGold();
  setTimeout(() => {
    const card = document.getElementById('vendido-congrats-card');
    if (card) card.style.animation = 'congrats-out .4s ease forwards';
    setTimeout(() => {
      el.style.display = 'none';
      if (card) card.style.animation = 'congrats-pop .45s cubic-bezier(.34,1.56,.64,1) both';
    }, 420);
  }, 3000);
}

function launchConfettiGold() {
  const canvas = document.getElementById('cita-confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx     = canvas.getContext('2d');
  const pieces  = Array.from({ length: 120 }, () => ({
    x:     Math.random() * canvas.width,
    y:     -10 - Math.random() * 80,
    r:     Math.random() * 7 + 3,
    d:     Math.random() * 2 + 1,
    color: ['#f5c400','#ffd700','#ffec6e','#fff','#ff8c00','#00c875'][Math.floor(Math.random()*6)],
    tilt:  Math.random() * 10 - 5,
    tiltV: Math.random() * .15 + .05,
    shape: Math.random() > .4 ? 'circle' : 'rect',
  }));
  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI*2); ctx.fill(); }
      else { ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*1.5); }
      ctx.restore();
      p.y += p.d * 2.5;
      p.tilt += p.tiltV;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
    });
    frame = requestAnimationFrame(draw);
  };
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 3500);
}

// ════════════════════════════════════════════
//  ASSIGN TABS
// ════════════════════════════════════════════
function clearDateFilter(refilter = true) {
  document.getElementById('f-fecha-desde').value = '';
  document.getElementById('f-fecha-hasta').value = '';
  const btn = document.getElementById('btn-clear-dates');
  if (btn) btn.classList.remove('visible');
  if (refilter) applyFilters();
}

function setAssignTab(el, val) {
  assignFilter = val;
  document.querySelectorAll('.assign-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (val === 'dist') {
    document.getElementById('toolbar').style.display    = 'none';
    document.getElementById('table-wrap').style.display = 'none';
    document.getElementById('bulk-bar').classList.remove('visible');
    _distBoardFilter = (currentBoardId && currentBoardId !== '__agent__') ? currentBoardId : '__all__';
    renderDistPanel();
    document.getElementById('dist-panel').classList.add('visible');
  } else if (val === 'assigned-deleted') {
    document.getElementById('dist-panel').classList.remove('visible');
    document.getElementById('toolbar').style.display    = 'none';
    document.getElementById('table-wrap').style.display = '';
    renderAssignedDeletedTable();
  } else {
    document.getElementById('dist-panel').classList.remove('visible');
    document.getElementById('toolbar').style.display    = '';
    document.getElementById('table-wrap').style.display = '';
    _hideAssignedDeletedBanner();
    applyFilters();
  }
}

function renderAssignedDeletedTable() {
  const _ads = getSession();
  const _adln = (_ads && _ads.role !== 'master' && _ads.role !== 'admin')
    ? new Set(_getLineUsers(_ads).map(u => u.name)) : null;
  const allDeleted = loadDeletedLeads();

  // Auto-purge leads older than 30 days → vault
  const DAYS_LIMIT = 30;
  const now = Date.now();
  const toVault = allDeleted.filter(l => {
    if (!l._originalBoardId || !l.asignado || l.asignado === 'Sin asignar') return false;
    if (!l._deletedAt) return false;
    return (now - new Date(l._deletedAt).getTime()) > DAYS_LIMIT * 86400000;
  });
  if (toVault.length > 0) {
    _vaultLeads(toVault);
    const remaining = allDeleted.filter(l => !toVault.find(v => v.id === l.id));
    saveDeletedLeads(remaining);
    updateTrashBadge();
  }

  const deleted = loadDeletedLeads()
    .filter(l => l._originalBoardId === currentBoardId && l.asignado && l.asignado !== 'Sin asignar'
      && (!_adln || _adln.has(l.asignado)));

  // Banner
  const bannerEl = document.getElementById('assigned-deleted-banner');
  if (bannerEl) bannerEl.style.display = '';

  const tbody = document.querySelector('#leads-table tbody');
  if (!tbody) return;
  if (deleted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;padding:40px;color:var(--text2)">No hay leads asignados eliminados en este board.</td></tr>`;
    document.getElementById('toolbar-count').textContent = '';
    return;
  }
  document.getElementById('toolbar-count').textContent = `${deleted.length} eliminado${deleted.length!==1?'s':''}`;
  const board = getBoard(currentBoardId);
  const cols  = board ? (board.columns || []) : [];
  tbody.innerHTML = deleted.map(l => {
    const deletedMs  = l._deletedAt ? new Date(l._deletedAt).getTime() : now;
    const daysGone   = Math.floor((now - deletedMs) / 86400000);
    const daysLeft   = Math.max(0, DAYS_LIMIT - daysGone);
    const urgency    = daysLeft <= 5 ? '#e2445c' : daysLeft <= 10 ? '#fbbf24' : '#3ecf8e';
    const countdownCell = `<td style="text-align:center;white-space:nowrap">
      <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;color:${urgency}">
        ⏱ ${daysLeft}d restantes
      </span>
    </td>`;
    const cells = cols.map(c => {
      if (c.key === '_check') return `<td></td>`;
      if (c.key === '_actions') return countdownCell;
      if (c.key === 'asignado') return `<td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(226,68,92,.12);color:var(--red);border:1px solid rgba(226,68,92,.3)">${esc(l.asignado)}</span></td>`;
      return `<td>${esc(l[c.key]||'')}</td>`;
    }).join('');
    return `<tr style="opacity:.8">${cells}</tr>`;
  }).join('');
}

function _hideAssignedDeletedBanner() {
  const b = document.getElementById('assigned-deleted-banner');
  if (b) b.style.display = 'none';
}

// ════════════════════════════════════════════
//  DISTRIBUCIÓN STATS
// ════════════════════════════════════════════
let _distBoardFilter = '__all__';

const RES_COLORS = {
  'INTERESADO':       '#00c875',
  'CITA AGENDADA':    '#0073ea',
  'CLIENTE ACTIVO':   '#00b7c3',
  'PENDIENTE':        '#fdab3d',
  'NO INTERESADO':    '#e2445c',
  'NO CONTESTA':      '#ff7575',
  'BUZÓN DE VOZ':     '#a78bfa',
  'NÚMERO EQUIVOCADO':'#ff9f43',
  'SIN RESULTADO':    '#888',
  '':                 '#555',
};

function _getDistLeads() {
  const boards = _distBoardFilter === '__all__' ? BOARDS : BOARDS.filter(b => b.id === _distBoardFilter);
  const leads = [];
  boards.forEach(b => loadLeads(b.id).forEach(l => leads.push({ ...l, _boardId: b.id, _boardName: b.name })));
  return leads;
}

function buildDistStats() {
  const leads  = _getDistLeads();
  const users  = loadUsers();
  const vus    = loadVirtualUsers();
  const session = getSession();

  // Collect agent names visible to this session
  const agentNames = getAgents(); // uses current session scope

  // Build per-agent stats
  const agentMap = {};
  agentNames.forEach(name => { agentMap[name] = { name, leads: [] }; });

  leads.forEach(l => {
    const a = l.asignado;
    if (!a || a === 'Sin asignar') return;
    if (!agentMap[a]) agentMap[a] = { name: a, leads: [] };
    agentMap[a].leads.push(l);
  });

  // Build manager → agents map
  const mgrMap = {};
  users.filter(u => u.role === 'manager').forEach(u => {
    const agents = getManagerAgentNames(u.id);
    const total  = agents.reduce((s, a) => s + (agentMap[a]?.leads.length || 0), 0);
    mgrMap[u.id] = { name: u.name, agents, total };
  });

  // Virtual users have no manager
  const vuNames = vus.map(v => v.name);

  return { agentMap, mgrMap, vuNames };
}

function _renderResBreakdown(agentLeads) {
  const total = agentLeads.length;
  if (!total) return '<div style="font-size:12px;color:var(--text2);padding:8px 0">Sin leads asignados</div>';

  const counts = {};
  RESULTADOS.forEach(r => { counts[r] = 0; });
  counts[''] = 0;
  agentLeads.forEach(l => { const k = l.resultado || ''; if (k in counts) counts[k]++; else counts['']++; });

  const withNotes    = agentLeads.filter(l => l.notas && l.notas.trim()).length;
  const withoutNotes = total - withNotes;
  const lastDate     = agentLeads
    .filter(l => l.fechaAsignado)
    .sort((a, b) => b.fechaAsignado.localeCompare(a.fechaAsignado))[0];
  const lastDateStr  = lastDate
    ? new Date(lastDate.fechaAsignado).toLocaleDateString('es-US', { month:'short', day:'numeric', year:'numeric' })
    : 'Sin fecha registrada';

  const boardBreakdown = {};
  agentLeads.forEach(l => { boardBreakdown[l._boardName] = (boardBreakdown[l._boardName] || 0) + 1; });

  let html = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px;align-items:center">
      <span style="font-size:11px;color:var(--text2)">Última asignación:</span>
      <span class="dist-date-badge">${lastDateStr}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${Object.entries(boardBreakdown).map(([bn,c]) =>
        `<span style="font-size:10px;background:rgba(255,255,255,.06);border:1px solid var(--border);padding:2px 8px;border-radius:8px;color:var(--text2)">${esc(bn)}: <b style="color:var(--text)">${c}</b></span>`
      ).join('')}
    </div>
    <div class="dist-res-grid">`;

  [...RESULTADOS, ''].forEach(r => {
    const c     = counts[r] || 0;
    if (!c && r !== '') return;
    const label = r || 'SIN RESULTADO';
    const pct   = total ? Math.round(c / total * 100) : 0;
    const color = RES_COLORS[r] || '#888';
    html += `
      <div class="dist-res-item">
        <div class="dist-res-count" style="color:${color}">${c}</div>
        <div class="dist-res-label">${label}</div>
        <div class="dist-res-bar"><div class="dist-res-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
  });

  html += `</div>
    <div style="display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text2)">Con notas: <b style="color:var(--green)">${withNotes}</b></div>
      <div style="font-size:12px;color:var(--text2)">Sin notas: <b style="color:var(--red)">${withoutNotes}</b></div>
    </div>`;
  return html;
}

function renderDistPanel() {
  const { agentMap, mgrMap, vuNames } = buildDistStats();
  const leads = _getDistLeads();
  const total  = leads.length;
  const assigned   = leads.filter(l => l.asignado && l.asignado !== 'Sin asignar').length;
  const unassigned = total - assigned;
  const activeAgents = Object.values(agentMap).filter(a => a.leads.length > 0).length;

  // Summary cards
  document.getElementById('dist-summary-row').innerHTML = `
    <div class="dist-stat-card" style="--c:var(--accent)">
      <div class="dist-stat-val">${total}</div>
      <div class="dist-stat-lbl">Total leads</div>
    </div>
    <div class="dist-stat-card">
      <div class="dist-stat-val" style="color:#00c875">${assigned}</div>
      <div class="dist-stat-lbl">Asignados</div>
    </div>
    <div class="dist-stat-card">
      <div class="dist-stat-val" style="color:var(--yellow)">${unassigned}</div>
      <div class="dist-stat-lbl">Sin asignar</div>
    </div>
    <div class="dist-stat-card">
      <div class="dist-stat-val" style="color:#a78bfa">${activeAgents}</div>
      <div class="dist-stat-lbl">Agentes activos</div>
    </div>`;

  // Board label
  const bl = document.getElementById('dist-board-label');
  if (bl) {
    if (_distBoardFilter === '__all__') {
      bl.textContent = 'Mostrando todos los boards';
    } else {
      const b = BOARDS.find(b => b.id === _distBoardFilter);
      bl.textContent = b ? `${b.icon} ${b.name}` : '';
    }
  }

  // Managers section
  const mgrSec = document.getElementById('dist-managers-section');
  const mgrs = Object.values(mgrMap).filter(m => m.total > 0);
  if (mgrs.length) {
    mgrSec.innerHTML = `<div class="dist-section-title">👔 Managers</div>` +
      mgrs.sort((a,b) => b.total - a.total).map(m => {
        const maxA = Math.max(...m.agents.map(a => agentMap[a]?.leads.length || 0), 1);
        return `<div class="dist-mgr-section">
          <div class="dist-mgr-header">
            <span style="font-size:18px">👔</span>
            <span class="dist-mgr-name">${esc(m.name)}</span>
            <span class="dist-mgr-total">${m.total} leads</span>
          </div>
          <div class="dist-mgr-agents">
            ${m.agents.map(a => {
              const cnt = agentMap[a]?.leads.length || 0;
              const pct = Math.round(cnt / maxA * 100);
              return `<div class="dist-mgr-agent-row">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(120,75,209,.15);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#a78bfa;flex-shrink:0">${esc(a.charAt(0).toUpperCase())}</div>
                <div style="font-size:12px;color:var(--text);min-width:120px;flex-shrink:0">${esc(a)}</div>
                <div class="dist-progress-bar"><div class="dist-progress-fill" style="width:${pct}%"></div></div>
                <div style="font-size:12px;font-weight:700;color:var(--text);min-width:30px;text-align:right">${cnt}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('');
  } else {
    mgrSec.innerHTML = '';
  }

  // Agents section
  const agSec = document.getElementById('dist-agents-section');
  const agentList = Object.values(agentMap).filter(a => a.leads.length > 0).sort((a, b) => b.leads.length - a.leads.length);
  if (!agentList.length) {
    agSec.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:20px 0">No hay agentes con leads asignados.</div>';
    return;
  }

  renderDistDonut(agentList);
  agSec.innerHTML = `<div class="dist-section-title">👤 Agentes</div>` +
    agentList.map((a, idx) => {
      const isVirtual = vuNames.includes(a.name);
      const initials  = getInitials(a.name);
      const avatarBg  = isVirtual ? 'rgba(120,75,209,.18)' : 'rgba(0,115,234,.18)';
      const avatarClr = isVirtual ? '#a78bfa' : 'var(--accent)';
      const badge     = isVirtual ? '<span style="font-size:9px;background:rgba(120,75,209,.15);color:#a78bfa;padding:1px 6px;border-radius:8px;border:1px solid rgba(120,75,209,.3)">Sin cuenta</span>' : '';
      return `
        <div class="dist-agent-card">
          <div class="dist-agent-header" onclick="toggleDistAgent('dist-body-${idx}')">
            <div class="dist-agent-avatar" style="background:${avatarBg};color:${avatarClr}">${initials}</div>
            <div>
              <div class="dist-agent-name">${esc(a.name)} ${badge}</div>
              <div class="dist-agent-sub">${a.leads.length} lead${a.leads.length !== 1 ? 's' : ''} asignado${a.leads.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="dist-agent-total">${a.leads.length}<span>leads</span></div>
          </div>
          <div class="dist-agent-body" id="dist-body-${idx}">
            ${_renderResBreakdown(a.leads)}
          </div>
        </div>`;
    }).join('');
}

function renderDistDonut(agentList) {
  const wrap = document.getElementById('dist-donut-wrap');
  if (!wrap) return;
  const data = agentList.filter(a => a.leads.length > 0);
  if (!data.length) { wrap.innerHTML = ''; return; }

  const total = data.reduce((s, a) => s + a.leads.length, 0);
  const R = 80, cx = 100, cy = 100, stroke = 28;
  const circ = 2 * Math.PI * R;

  // bright palette for donut slices
  const COLORS = ['#0073ea','#a78bfa','#00c875','#fbbf24','#e2445c','#00b7c3',
    '#ff7b54','#6fcf97','#f472b6','#38bdf8','#fb923c','#a3e635'];

  let offset = -circ / 4; // start at top
  const slices = data.map((a, i) => {
    const pct = a.leads.length / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const color = COLORS[i % COLORS.length];
    const s = `<circle cx="${cx}" cy="${cy}" r="${R}"
      fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${dash.toFixed(3)} ${gap.toFixed(3)}"
      stroke-dashoffset="${(-offset).toFixed(3)}"
      stroke-linecap="butt"
      style="cursor:pointer;transition:opacity .2s"
      onmouseenter="this.style.opacity='.7';document.getElementById('dist-donut-tip').innerHTML='<b>${esc(a.name)}</b><br>${a.leads.length} leads (${Math.round(pct*100)}%)'"
      onmouseleave="this.style.opacity='1';document.getElementById('dist-donut-tip').innerHTML=''"
    />`;
    offset += pct * circ;
    return { s, color, name: a.name, count: a.leads.length, pct };
  });

  const svg = `<svg viewBox="0 0 200 200" width="200" height="200" style="flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="${stroke}"/>
    ${slices.map(s => s.s).join('')}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="700">${total}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="var(--text2)" font-size="10" letter-spacing=".5">LEADS</text>
  </svg>`;

  const legend = `<div style="display:flex;flex-direction:column;gap:7px;flex:1;min-width:0;max-height:200px;overflow-y:auto;padding-right:4px">
    ${slices.map(s => `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:10px;height:10px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
        <span style="font-size:12px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text);flex-shrink:0">${s.count}</span>
        <span style="font-size:11px;color:var(--text2);flex-shrink:0;min-width:30px;text-align:right">${Math.round(s.pct*100)}%</span>
      </div>`).join('')}
  </div>`;

  wrap.innerHTML = `
    <div class="dist-section-title">📊 Distribución de leads</div>
    <div style="display:flex;align-items:center;gap:24px;padding:12px 0 8px">
      <div style="position:relative;flex-shrink:0">
        ${svg}
        <div id="dist-donut-tip" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;font-size:11px;color:var(--text);pointer-events:none;line-height:1.5;max-width:90px"></div>
      </div>
      ${legend}
    </div>`;
}

function toggleDistAgent(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

function setDistBoardFilter(boardId) {
  _distBoardFilter = boardId;
  renderDistPanel();
}

// ════════════════════════════════════════════
//  ASIGNADO FILTER POPULATE
// ════════════════════════════════════════════
function populateUbicacionesBoardSel() {
  const sel = document.getElementById('ub-board-sel');
  if (!sel) return;
  sel.innerHTML = BOARDS.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  renderUbicacionesList();
}

function renderUbicacionesList() {
  const sel = document.getElementById('ub-board-sel');
  if (!sel) return;
  const boardId = sel.value;
  const board   = getBoard(boardId);
  if (!board) return;
  const list = document.getElementById('ubicaciones-list');
  list.innerHTML = board.ubicaciones.length
    ? board.ubicaciones.map((u, i) =>
        `<div class="lt-tag">${esc(u)}<button onclick="removeUbicacion('${boardId}',${i})" title="Eliminar">✕</button></div>`
      ).join('')
    : '<span style="color:var(--text2);font-size:12px">Sin ubicaciones definidas</span>';
}

function addUbicacion() {
  const sel = document.getElementById('ub-board-sel');
  const inp = document.getElementById('ub-new');
  const val = inp.value.trim();
  if (!val || !sel) return;
  const board = getBoard(sel.value);
  if (!board) return;
  const overrides = loadUbicacionesOverrides();
  const current   = overrides[board.id] || [...board.ubicaciones];
  if (current.includes(val)) { showToast('Ya existe esa ubicación', 'error'); return; }
  current.push(val);
  overrides[board.id] = current;
  saveUbicacionesOverrides(overrides);
  refreshBoards();
  inp.value = '';
  renderUbicacionesList();
  showToast('Ubicación agregada ✓', 'success');
}

function removeUbicacion(boardId, idx) {
  const board     = getBoard(boardId);
  if (!board) return;
  const overrides = loadUbicacionesOverrides();
  const current   = overrides[boardId] || [...board.ubicaciones];
  current.splice(idx, 1);
  overrides[boardId] = current;
  saveUbicacionesOverrides(overrides);
  refreshBoards();
  renderUbicacionesList();
  showToast('Ubicación eliminada', 'error');
}

function renderLeadTypesList() {
  const types = getLeadTypes();
  const el = document.getElementById('lead-types-list');
  if (!el) return;
  const session = getSession();
  const canEdit = session && session.role === 'master';
  el.innerHTML = types.map((t, i) =>
    `<div class="lt-tag">${esc(t)}${canEdit ? `<button onclick="removeLeadType(${i})" title="Eliminar">✕</button>` : ''}</div>`
  ).join('') || '<span style="color:var(--text2);font-size:12px">Sin tipos definidos</span>';
}
function addLeadType() {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el desarrollador puede agregar tipos de lead', 'error'); return; }
  const inp = document.getElementById('lt-new');
  const val = inp.value.trim().toUpperCase();
  if (!val) return;
  const types = getLeadTypes();
  if (types.includes(val)) { showToast('Ya existe ese tipo', 'error'); return; }
  types.push(val);
  saveLeadTypes(types);
  inp.value = '';
  renderLeadTypesList();
  populateLeadFilter();
  showToast('Tipo agregado ✓', 'success');
}
function removeLeadType(idx) {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el desarrollador puede eliminar tipos de lead', 'error'); return; }
  const types = getLeadTypes();
  types.splice(idx, 1);
  saveLeadTypes(types);
  renderLeadTypesList();
  populateLeadFilter();
  showToast('Tipo eliminado', 'error');
}

function populateLeadFilter() {
  const sel = document.getElementById('f-lead');
  sel.innerHTML = '<option value="">Lead: Todos</option>';
  getLeadTypes().forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
}

function populateAgentFilter() {
  const session = getSession();
  const sel = document.getElementById('f-asignado');
  sel.innerHTML = '<option value="">Agente: Todos</option>';
  const isFullOrg = !session || session.role === 'master' || session.role === 'admin';
  const names = isFullOrg
    ? loadUsers().filter(u => !u.inactive).map(u => u.name)
    : _getLineUsers(session).filter(u => !u.inactive).map(u => u.name);
  names.forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = a;
    sel.appendChild(o);
  });
}

// ════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════
let toastTimer;
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2800);
}

// ════════════════════════════════════════════
//  KEYBOARD
// ════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
  }
});

// ════════════════════════════════════════════
//  COLUMN CONFIG
// ════════════════════════════════════════════
const COL_CONFIG_KEY = 'gew_col_config';

const OPTIONAL_COLS = [
  { key: 'lead',      label: 'LEAD',              desc: 'Tipo de lead (Guía Médico, CSKID, etc.)' },
  { key: 'hijos',     label: 'CANTIDAD SOLICITADA', desc: 'Cantidad solicitada' },
  { key: 'asignado',  label: 'ASIGNADO A',         desc: 'Agente responsable del lead' },
  { key: 'resultado', label: 'RESULTADO',           desc: 'Estado de la llamada/contacto' },
  { key: 'notas',     label: 'NOTAS',              desc: 'Comentarios adicionales' },
];

function loadColConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_CONFIG_KEY));
    if (saved) return saved;
  } catch {}
  // defaults: all optional cols visible, no custom cols
  const def = { custom: [] };
  OPTIONAL_COLS.forEach(c => def[c.key] = true);
  return def;
}
function saveColConfig(cfg) { localStorage.setItem(COL_CONFIG_KEY, JSON.stringify(cfg)); supaSync(COL_CONFIG_KEY, JSON.stringify(cfg)); }

function getActiveColumns(board) {
  const cfg    = loadColConfig();
  const labels = cfg.labels || {};
  const cols   = [
    { key: '_check',    label: '' },
    { key: 'nombre',    label: labels['nombre']    || 'NOMBRE' },
    { key: 'creacion',  label: labels['creacion']  || 'REGISTRO CREACIÓN' },
    { key: 'email',     label: labels['email']     || 'EMAIL' },
    { key: 'telefono',  label: labels['telefono']  || 'TELÉFONO' },
    { key: 'direccion', label: labels['direccion'] || 'DIRECCIÓN' },
    { key: 'ubicacion', label: labels['ubicacion'] || 'UBICACIÓN' },
    { key: 'entrada',   label: labels['entrada']   || 'ENTRADA' },
  ];
  getOrderedOptionalCols().forEach(c => {
    if (cfg[c.key] !== false) cols.push({ key: c.key, label: labels[c.key] || c.label });
  });
  (cfg.custom || []).forEach(c => cols.push({ key: c.key, label: (labels[c.key] || c.label).toUpperCase(), customDef: c }));
  cols.push({ key: 'tipo', label: labels['tipo'] || 'TIPO' });
  cols.push({ key: '_actions', label: '' });
  return cols;
}

// ── Mi Cuenta ──
function toggleAccountSection(type) {
  const form = document.getElementById('account-' + type + '-form');
  const icon = document.getElementById('account-' + type + '-icon');
  const open = form.style.display === 'none';
  form.style.display = open ? 'block' : 'none';
  icon.textContent   = open ? '⌄' : '›';
  icon.style.transform = open ? 'rotate(0deg)' : '';
  if (open && type === 'email') {
    const session = getSession();
    document.getElementById('acc-email-current').value = session ? session.email : '';
    document.getElementById('acc-email-new').value = '';
    document.getElementById('acc-email-pass').value = '';
  }
  if (open && type === 'pass') {
    document.getElementById('acc-pass-current').value = '';
    document.getElementById('acc-pass-new').value = '';
    document.getElementById('acc-pass-confirm').value = '';
  }
}

async function changeEmail() {
  const session  = getSession();
  if (!session) return;
  const newEmail = document.getElementById('acc-email-new').value.trim().toLowerCase();
  const pass     = document.getElementById('acc-email-pass').value;

  if (!newEmail) { showToast('Ingresa el nuevo correo', 'error'); return; }
  if (newEmail === session.email.toLowerCase()) { showToast('Es el mismo correo actual', 'error'); return; }
  if (!pass) { showToast('Ingresa tu contraseña para confirmar', 'error'); return; }

  // verify password
  const _ceUser = loadUsers().find(u => u.id === session.id);
  const ok = session.role === 'master'
    ? await sha256(pass) === MASTER_USER.passwordHash
    : await verifyPass(pass, _ceUser?.password);
  if (!ok) { showToast('Contraseña incorrecta', 'error'); return; }

  if (newEmail === MASTER_USER.email.toLowerCase()) { showToast('Ese correo no está disponible', 'error'); return; }
  const users = loadUsers();
  if (users.find(u => u.email === newEmail)) { showToast('Ese correo ya está en uso', 'error'); return; }

  if (!confirm(`¿Cambiar tu correo a "${newEmail}"? Necesitarás usarlo para iniciar sesión.`)) return;

  if (session.role !== 'master') {
    const idx = users.findIndex(u => u.id === session.id);
    if (idx !== -1) { users[idx].email = newEmail; await saveUsers(users); }
  }
  setSession({ ...session, email: newEmail });
  toggleAccountSection('email');
  showToast('Correo actualizado ✓', 'success');
}

async function changePassword() {
  const session = getSession();
  if (!session) return;
  const current  = document.getElementById('acc-pass-current').value;
  const newPass  = document.getElementById('acc-pass-new').value;
  const confirm2 = document.getElementById('acc-pass-confirm').value;

  if (!current) { showToast('Ingresa tu contraseña actual', 'error'); return; }
  if (!newPass || newPass.length < 6) { showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (newPass !== confirm2) { showToast('Las contraseñas no coinciden', 'error'); return; }

  const _cpUser = loadUsers().find(u => u.id === session.id);
  const ok = session.role === 'master'
    ? await sha256(current) === MASTER_USER.passwordHash
    : await verifyPass(current, _cpUser?.password);
  if (!ok) { showToast('Contraseña actual incorrecta', 'error'); return; }

  if (!confirm('¿Confirmas el cambio de contraseña?')) return;

  if (session.role === 'master') {
    showToast('El desarrollador tiene contraseña fija. Contacta al desarrollador.', 'error');
    return;
  }
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === session.id);
  if (idx !== -1) { users[idx].password = await sha256(newPass); await saveUsers(users); }
  toggleAccountSection('pass');
  showToast('Contraseña actualizada ✓', 'success');
}

// settings page
function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById('stab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  const navEl = document.querySelector(`.settings-nav-item[data-tab="${tab}"]`);
  if (navEl) navEl.classList.add('active');
  if (tab === 'messaging') { loadMessagingDashboard(); loadMsgPrices(); }
  if (tab === 'org' || tab === 'team') {
    loadFromSupabase().then(() => renderUsersGrid()).catch(() => {});
  }
  if (tab === 'requests') {
    loadFromSupabase().then(() => renderPendingList()).catch(() => renderPendingList());
  }
  if (tab === 'account') {
    const zoomCard = document.getElementById('zoom-account-card');
    if (zoomCard) zoomCard.style.display = _canUseZoom() ? 'block' : 'none';
    if (_canUseZoom()) _loadZoomStatus().then(() => _renderZoomCard());
  }
  if (tab === 'vendidos') { renderVendidosSettings(); }
}

function _cleanupTargets() {
  const targets = new Set(['NO INTERESADO', 'NÚMERO EQUIVOCADO']);
  const found = [];
  BOARDS.forEach(b => {
    loadLeads(b.id).forEach(l => {
      if (targets.has(l.resultado)) found.push({ boardId: b.id, boardName: b.name, lead: l });
    });
  });
  return found;
}

function cleanupPreview() {
  const found = _cleanupTargets();
  const el = document.getElementById('cleanup-preview');
  const btn = document.getElementById('cleanup-run-btn');
  if (!found.length) {
    el.innerHTML = '<span style="color:var(--green)">✅ No hay leads pendientes — todo está limpio.</span>';
    btn.style.display = 'none';
    return;
  }
  el.innerHTML = `Se encontraron <strong style="color:var(--red)">${found.length} leads</strong> con resultado NO INTERESADO o NÚMERO EQUIVOCADO en los boards:<br><br>`
    + found.map(f => `• <strong>${f.lead.nombre||'Sin nombre'}</strong> — ${f.lead.resultado} (${f.boardName})`).join('<br>');
  btn.style.display = '';
}

function cleanupRun() {
  const found = _cleanupTargets();
  if (!found.length) { showToast('No hay nada que limpiar'); return; }
  if (!confirm(`¿Mover ${found.length} leads a la papelera? Esta acción no se puede deshacer.`)) return;
  found.forEach(f => softDeleteLead(f.lead.id, f.boardId));
  document.getElementById('cleanup-preview').innerHTML = `<span style="color:var(--green)">✅ ${found.length} leads movidos a la papelera.</span>`;
  document.getElementById('cleanup-run-btn').style.display = 'none';
  showToast(`🗑 ${found.length} leads movidos a papelera`, 'success');
}

function renderVendidosSettings() {
  const container = document.getElementById('vendidos-settings-list');
  if (!container) return;
  const leads = loadLeads(VENDIDOS_BOARD.id);
  if (!leads.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text2);font-size:13px">No hay leads vendidos aún.</div>`;
    return;
  }
  container.innerHTML = leads.map(l => `
    <div style="display:flex;align-items:center;gap:14px;background:var(--card2);border:1px solid rgba(245,196,0,.2);border-radius:10px;padding:14px 18px">
      <span style="font-size:18px">🏆</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.nombre || '—')}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap">
          ${l.telefono ? `<span>📞 ${esc(l.telefono)}</span>` : ''}
          ${l.email    ? `<span>✉️ ${esc(l.email)}</span>` : ''}
          ${l.asignado ? `<span>👤 ${esc(l.asignado)}</span>` : ''}
          ${l._vendidoAt ? `<span>📅 ${new Date(l._vendidoAt).toLocaleDateString('es-MX')}</span>` : ''}
        </div>
      </div>
      <span style="background:rgba(245,196,0,.15);color:#f5c400;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">VENDIDO 🏆</span>
    </div>`).join('');
}

function showSettingsPage() {
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('settings-page').classList.add('visible');
  document.getElementById('board-title').textContent     = 'Configuración';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  ['nav-settings','nav-settings-agent'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('active'); });
  currentBoardId = null;

  // Role-based nav visibility
  const session = getSession();
  const isAdminOrMaster = session && (session.role === 'master' || session.role === 'admin');
  ['snav-sec-team','snav-team','snav-requests'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdminOrMaster ? 'block' : 'none';
  });
  const ltCtrl = document.getElementById('lt-controls');
  if (ltCtrl) ltCtrl.style.display = (session && session.role === 'master') ? 'flex' : 'none';
  const ltNav = document.getElementById('snav-leadtypes');
  if (ltNav) ltNav.style.display = (session && session.role === 'master') ? 'block' : 'none';
  const isMasterRole = session && session.role === 'master';
  const backupNav = document.getElementById('snav-sec-backup');
  if (backupNav) backupNav.style.display = isAdminOrMaster ? 'block' : 'none';
  const backupBtn = document.getElementById('snav-backup');
  if (backupBtn) backupBtn.style.display = isMasterRole ? 'block' : 'none';
  const permisosBtn = document.getElementById('snav-permisos');
  if (permisosBtn) permisosBtn.style.display = isMasterRole ? 'block' : 'none';
  const vendidosNav = document.getElementById('snav-vendidos');
  if (vendidosNav) vendidosNav.style.display = isAdminOrMaster ? 'block' : 'none';
  const boardsNav = document.getElementById('snav-boards');
  if (boardsNav) boardsNav.style.display = isAdminOrMaster ? 'block' : 'none';
  const orgnameCard = document.getElementById('orgname-card');
  if (orgnameCard) orgnameCard.style.display = isAdminOrMaster ? '' : 'none';
  const diagWrap = document.getElementById('diag-btn-wrap');
  if (diagWrap) diagWrap.style.display = (session && session.role === 'master') ? '' : 'none';
  const vaultTrigger = document.getElementById('vault-trigger');
  if (vaultTrigger) vaultTrigger.style.display = (session && session.role === 'master') ? '' : 'none';
  const msgNav = document.getElementById('snav-sec-messaging');
  if (msgNav) msgNav.style.display = (session && session.role === 'master') ? 'block' : 'none';

  // Default tab by role
  const defaultTab = isAdminOrMaster ? 'org' : 'account';
  switchSettingsTab(defaultTab);

  populateUbicacionesBoardSel();
  renderLeadTypesList();
  renderUsersGrid();
  renderVirtualUsersList();
  renderPendingList();
  renderColToggles();
  renderCustomColsList();
  _populateSettingsStats();
  _renderSettingsProfileCards();

  // Virtual users card — admin/master only
  const vuCard = document.getElementById('virtual-users-card');
  if (vuCard) vuCard.style.display = isAdminOrMaster ? '' : 'none';


  // T&C editor — admin/master only
  const termsCard = document.getElementById('terms-editor-card');
  if (termsCard) termsCard.style.display = isAdminOrMaster ? '' : 'none';

  // Board editor — master only
  const boardEditorCard = document.getElementById('board-editor-card');
  if (boardEditorCard) {
    const isMasterForBoard = session && (session.role === 'master' || session._isMaster);
    boardEditorCard.style.display = isMasterForBoard ? '' : 'none';
    if (isMasterForBoard) renderBoardEditor();
  }

  // Repair + duplicate tools — master only
  const repairCard = document.getElementById('repair-card');
  const dupCard    = document.getElementById('dup-card');
  const isMaster   = session && (session.role === 'master' || session._isMaster);
  if (repairCard) repairCard.style.display = isMaster ? '' : 'none';
  if (dupCard)    dupCard.style.display    = isMaster ? '' : 'none';
}

function _getLineUsers(session) {
  const all = loadUsers();
  if (!session || session.role === 'master' || session.role === 'admin') return all;
  if (session.role === 'caller') {
    return all.filter(u => u.orgAdminId === session.orgAdminId);
  }
  if (session.role === 'master_manager') {
    const mgrIds = all.filter(u => u.role === 'manager' && u.orgMasterManagerId === session.id).map(u => u.id);
    const supIds = all.filter(u => u.role === 'supervisor_agent' && (mgrIds.includes(u.orgManagerId) || u.orgMasterManagerId === session.id)).map(u => u.id);
    const agIds  = all.filter(u => u.role === 'agent' && (mgrIds.includes(u.orgManagerId) || u.orgMasterManagerId === session.id || supIds.includes(u.orgSupervisorId))).map(u => u.id);
    const lineIds = new Set([session.id, ...mgrIds, ...supIds, ...agIds]);
    return all.filter(u => lineIds.has(u.id));
  }
  if (session.role === 'manager') {
    const supIds = all.filter(u => u.role === 'supervisor_agent' && u.orgManagerId === session.id).map(u => u.id);
    const agIds  = all.filter(u => u.role === 'agent' && (u.orgManagerId === session.id || supIds.includes(u.orgSupervisorId))).map(u => u.id);
    const lineIds = new Set([session.id, ...supIds, ...agIds]);
    return all.filter(u => lineIds.has(u.id));
  }
  if (session.role === 'supervisor_agent') {
    const agIds = all.filter(u => u.role === 'agent' && u.orgSupervisorId === session.id).map(u => u.id);
    return all.filter(u => u.id === session.id || agIds.includes(u.id));
  }
  return all.filter(u => u.id === session.id);
}

function _populateSettingsStats() {
  const session    = getSession();
  const lineUsers  = _getLineUsers(session);
  const isFullOrg  = !session || session.role === 'master' || session.role === 'admin';
  const lineUserNames = new Set(lineUsers.map(u => u.name));
  const agents     = lineUsers.filter(u => u.role === 'agent').length;

  const activeBoards = isFullOrg
    ? BOARDS.length
    : BOARDS.filter(b => loadLeads(b.id).some(l => lineUserNames.has(l.asignado))).length;

  const lineLeads = isFullOrg
    ? BOARDS.reduce((acc, b) => acc + loadLeads(b.id).length, 0)
    : BOARDS.reduce((acc, b) => acc + loadLeads(b.id).filter(l => lineUserNames.has(l.asignado)).length, 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-users',  lineUsers.length);
  set('stat-boards', activeBoards);
  set('stat-leads',  lineLeads);
  set('stat-agents', agents);

  // Team tab counters remain org-wide (admin/master only tab)
  const all = loadUsers();
  set('tstat-admins', all.filter(u => u.role === 'admin').length);
  set('tstat-mms',    all.filter(u => u.role === 'master_manager').length);
  set('tstat-mgrs',   all.filter(u => u.role === 'manager').length);
  set('tstat-sas',    all.filter(u => u.role === 'supervisor_agent').length);
  set('tstat-agents', all.filter(u => u.role === 'agent').length);
}

function _renderSettingsProfileCards() {
  if (!session) return;
  const initials = getInitials(session.name || session.email);
  const roleLabel = { master: 'Master', admin: 'Administrador', master_manager: 'MGA', manager: 'GA', supervisor_agent: 'SA', agent: 'Agente', caller: 'Caller' }[session.role] || session.role;
  const avatarHtml = `<div style="width:52px;height:52px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;
  const infoHtml   = `<div><div style="font-size:15px;font-weight:600;color:var(--text)">${esc(session.name || '—')}</div><div style="font-size:12px;color:var(--text2);margin-top:2px">${esc(session.email || '')}</div><div style="margin-top:6px;display:inline-block;background:rgba(0,115,234,.15);color:var(--accent);font-size:10px;font-weight:600;padding:2px 8px;border-radius:12px">${esc(roleLabel)}</div></div>`;

  const snp = document.getElementById('snp-card');
  if (snp) snp.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">${avatarHtml}<div><div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">${esc(session.name || session.email)}</div><div style="font-size:10px;color:var(--text2)">${esc(roleLabel)}</div></div></div>`;

  const apc = document.getElementById('account-profile-card');
  if (apc) apc.innerHTML = avatarHtml + infoHtml;
}

const FIXED_COLS = [
  { key: 'nombre',    label: 'NOMBRE' },
  { key: 'creacion',  label: 'REGISTRO CREACIÓN' },
  { key: 'email',     label: 'EMAIL' },
  { key: 'telefono',  label: 'TELÉFONO' },
  { key: 'direccion', label: 'DIRECCIÓN' },
  { key: 'ubicacion', label: 'UBICACIÓN' },
];

function getColLabel(key) {
  const cfg = loadColConfig();
  return (cfg.labels && cfg.labels[key]) || null;
}

function getOrderedOptionalCols() {
  const cfg = loadColConfig();
  if (!cfg.colOrder || !cfg.colOrder.length) return OPTIONAL_COLS;
  const ordered = cfg.colOrder.map(k => OPTIONAL_COLS.find(c => c.key === k)).filter(Boolean);
  OPTIONAL_COLS.forEach(c => { if (!cfg.colOrder.includes(c.key)) ordered.push(c); });
  return ordered;
}

function renderColToggles() {
  const cfg     = loadColConfig();
  const session = getSession();
  const isMaster = session && session.role === 'master';
  const orderedOpt = getOrderedOptionalCols();

  let html = '';

  // Fixed columns — label editable for master
  FIXED_COLS.forEach(c => {
    const displayLabel = (cfg.labels && cfg.labels[c.key]) || c.label;
    html += `<div class="col-editor-row">
      <span class="ce-fixed-badge">Fija</span>
      ${isMaster
        ? `<input class="ce-label-inp field-inp" id="cel-${c.key}" value="${esc(displayLabel)}" placeholder="${esc(c.label)}" /><button class="btn btn-primary be-save-btn" onclick="saveColLabel('${c.key}')">Guardar</button>`
        : `<span style="flex:1;font-size:12px;font-weight:600;color:var(--text)">${esc(displayLabel)}</span>`
      }
    </div>`;
  });

  // Optional columns — label editable + toggle + reorder for master
  orderedOpt.forEach((c, i) => {
    const displayLabel = (cfg.labels && cfg.labels[c.key]) || c.label;
    html += `<div class="col-editor-row">
      ${isMaster ? `
        <button class="be-ord-btn" onclick="moveColUp('${c.key}')"   ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="be-ord-btn" onclick="moveColDown('${c.key}')" ${i === orderedOpt.length-1 ? 'disabled' : ''}>▼</button>
        <input class="ce-label-inp field-inp" id="cel-${c.key}" value="${esc(displayLabel)}" placeholder="${esc(c.label)}" />
        <button class="btn btn-primary be-save-btn" onclick="saveColLabel('${c.key}')">Guardar</button>
      ` : `<span style="flex:1;font-size:12px;font-weight:600;color:var(--text)">${esc(displayLabel)}</span>`}
      <label class="toggle-sw" title="${esc(c.desc)}">
        <input type="checkbox" ${cfg[c.key] !== false ? 'checked' : ''} onchange="toggleCol('${c.key}',this.checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  });

  document.getElementById('col-toggles').innerHTML = html;
}

function saveColLabel(key) {
  const inp = document.getElementById('cel-' + key);
  if (!inp) return;
  const val = inp.value.trim().toUpperCase();
  if (!val) { showToast('El nombre no puede estar vacío', 'error'); return; }
  const cfg = loadColConfig();
  if (!cfg.labels) cfg.labels = {};
  cfg.labels[key] = val;
  saveColConfig(cfg);
  showToast('Columna renombrada ✓', 'success');
  if (currentBoardId) renderTable();
}

function moveColUp(key) {
  const cfg  = loadColConfig();
  const cols = getOrderedOptionalCols().map(c => c.key);
  const i    = cols.indexOf(key);
  if (i <= 0) return;
  [cols[i-1], cols[i]] = [cols[i], cols[i-1]];
  cfg.colOrder = cols;
  saveColConfig(cfg);
  renderColToggles();
  if (currentBoardId) renderTable();
}
function moveColDown(key) {
  const cfg  = loadColConfig();
  const cols = getOrderedOptionalCols().map(c => c.key);
  const i    = cols.indexOf(key);
  if (i < 0 || i >= cols.length - 1) return;
  [cols[i], cols[i+1]] = [cols[i+1], cols[i]];
  cfg.colOrder = cols;
  saveColConfig(cfg);
  renderColToggles();
  if (currentBoardId) renderTable();
}

function toggleCol(key, val) {
  const cfg = loadColConfig();
  cfg[key] = val;
  saveColConfig(cfg);
  showToast('Columna ' + (val ? 'activada' : 'desactivada') + ' ✓', 'success');
}

function toggleOptionsInput() {
  const tipo = document.getElementById('cc-tipo').value;
  document.getElementById('cc-options-wrap').style.display = tipo === 'dropdown' ? 'block' : 'none';
}

function addCustomCol() {
  const nombre = document.getElementById('cc-nombre').value.trim().toUpperCase();
  const tipo   = document.getElementById('cc-tipo').value;
  const optsRaw= document.getElementById('cc-options') ? document.getElementById('cc-options').value : '';

  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }

  const cfg = loadColConfig();
  const key = 'custom_' + nombre.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now().toString(36);
  const options = tipo === 'dropdown' ? optsRaw.split(',').map(o => o.trim()).filter(Boolean) : [];

  cfg.custom = cfg.custom || [];
  if (cfg.custom.find(c => c.label.toUpperCase() === nombre)) { showToast('Ya existe una columna con ese nombre', 'error'); return; }
  cfg.custom.push({ key, label: nombre, type: tipo, options });
  saveColConfig(cfg);

  document.getElementById('cc-nombre').value = '';
  document.getElementById('cc-options').value = '';
  document.getElementById('cc-options-wrap').style.display = 'none';
  document.getElementById('cc-tipo').value = 'text';

  renderCustomColsList();
  showToast(`Columna "${nombre}" agregada ✓`, 'success');
}

function removeCustomCol(key) {
  const cfg = loadColConfig();
  cfg.custom = (cfg.custom || []).filter(c => c.key !== key);
  saveColConfig(cfg);
  renderCustomColsList();
  showToast('Columna eliminada', 'error');
}

function renderCustomColsList() {
  const cfg  = loadColConfig();
  const list = document.getElementById('custom-cols-list');
  if (!list) return;
  const customs = cfg.custom || [];
  if (customs.length === 0) {
    list.innerHTML = `<p style="font-size:12px;color:var(--text2);text-align:center;padding:16px">No hay columnas personalizadas todavía.</p>`;
    return;
  }
  const typeLabel = { text:'Texto', number:'Número', dropdown:'Dropdown' };
  list.innerHTML = customs.map(c => `
    <div class="custom-col-item">
      <div class="custom-col-item-left">
        <span class="custom-col-badge">${typeLabel[c.type]||c.type}</span>
        <span class="custom-col-name">${esc(c.label)}</span>
        ${c.options && c.options.length ? `<span style="font-size:10px;color:var(--text2)">${c.options.join(', ')}</span>` : ''}
      </div>
      <button class="custom-col-del" onclick="removeCustomCol('${c.key}')" title="Eliminar">🗑</button>
    </div>
  `).join('');
}

// ════════════════════════════════════════════
//  BOARD MANAGEMENT
// ════════════════════════════════════════════
const CUSTOM_BOARDS_KEY = 'gew_custom_boards';

function loadCustomBoards() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_BOARDS_KEY)) || []; } catch { return []; }
}
function saveCustomBoards(boards) {
  localStorage.setItem(CUSTOM_BOARDS_KEY, JSON.stringify(boards));
  supaSync(CUSTOM_BOARDS_KEY, JSON.stringify(boards));
}
const UBICACIONES_KEY  = 'gew_ubicaciones';
const BOARD_META_KEY   = 'gew_board_meta';
const BOARD_ORDER_KEY  = 'gew_board_order';

function loadUbicacionesOverrides() {
  try { return JSON.parse(localStorage.getItem(UBICACIONES_KEY)) || {}; } catch { return {}; }
}
function saveUbicacionesOverrides(obj) { localStorage.setItem(UBICACIONES_KEY, JSON.stringify(obj)); supaSync(UBICACIONES_KEY, JSON.stringify(obj)); }

function loadBoardMeta()  { try { return JSON.parse(localStorage.getItem(BOARD_META_KEY))  || {}; } catch { return {}; } }
function saveBoardMeta(m) { localStorage.setItem(BOARD_META_KEY, JSON.stringify(m)); supaSync(BOARD_META_KEY, JSON.stringify(m)); }

function loadBoardOrder()    { try { return JSON.parse(localStorage.getItem(BOARD_ORDER_KEY)) || null; } catch { return null; } }
function saveBoardOrder(ids) { localStorage.setItem(BOARD_ORDER_KEY, JSON.stringify(ids)); supaSync(BOARD_ORDER_KEY, JSON.stringify(ids)); }

function refreshBoards() {
  const ubOverrides = loadUbicacionesOverrides();
  const meta        = loadBoardMeta();
  let boards = [...DEFAULT_BOARDS, ...loadCustomBoards()].map(b => {
    const m  = meta[b.id] || {};
    const ub = ubOverrides[b.id];
    return { ...b, name: m.name || b.name, icon: m.icon || b.icon, ubicaciones: ub || b.ubicaciones };
  });
  const order = loadBoardOrder();
  if (order && order.length) {
    const map = Object.fromEntries(boards.map(b => [b.id, b]));
    const ordered = order.map(id => map[id]).filter(Boolean);
    boards.forEach(b => { if (!order.includes(b.id)) ordered.push(b); });
    boards = ordered;
  }
  BOARDS = boards;
}

// ── Board Editor UI ──
// ── Repair Tool ────────────────────────────────────────────────────────────

function _normStr(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();
}

function _nameSimilarity(orphan, user) {
  const a = _normStr(orphan);
  const b = _normStr(user.name);
  const emailPfx = _normStr((user.email || '').split('@')[0]);
  // exact containment
  if (b.includes(a) || a.includes(b)) return 0.95;
  // email prefix containment
  if (emailPfx && (emailPfx.includes(a) || a.includes(emailPfx))) return 0.85;
  // word overlap
  const wa = new Set(a.split(/\s+/).filter(Boolean));
  const wb = new Set(b.split(/\s+/).filter(Boolean));
  const we = new Set(emailPfx.split(/[\._\-]+/).filter(Boolean));
  let overlap = 0;
  wa.forEach(w => { if (wb.has(w) || we.has(w)) overlap++; });
  const score = overlap / Math.max(wa.size, wb.size, 1);
  return score;
}

function _bestMatch(orphanName, allUsers) {
  let best = null, bestScore = 0;
  const candidates = allUsers.filter(u =>
    ['agent','supervisor_agent','manager','master_manager'].includes(u.role)
  );
  for (const u of candidates) {
    const s = _nameSimilarity(orphanName, u);
    if (s > bestScore) { bestScore = s; best = u; }
  }
  return bestScore >= 0.4 ? { user: best, score: bestScore } : null;
}

function runRepairScan() {
  const el = document.getElementById('repair-results');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text2)">Escaneando...</span>';

  const allUsers  = loadUsers();
  const validNames = new Set(allUsers.map(u => u.name));

  const orphanMap = {};
  for (const board of BOARDS) {
    for (const l of loadLeads(board.id)) {
      if (l.asignado && !validNames.has(l.asignado)) {
        if (!orphanMap[l.asignado]) orphanMap[l.asignado] = { count: 0, boardSet: new Set() };
        orphanMap[l.asignado].count++;
        orphanMap[l.asignado].boardSet.add(board.name || board.id);
      }
    }
  }
  for (const l of loadDeletedLeads()) {
    if (l.asignado && !validNames.has(l.asignado)) {
      if (!orphanMap[l.asignado]) orphanMap[l.asignado] = { count: 0, boardSet: new Set() };
      orphanMap[l.asignado].count++;
      orphanMap[l.asignado].boardSet.add('🗑 Eliminados');
    }
  }

  const orphans = Object.entries(orphanMap).sort((a,b) => b[1].count - a[1].count);
  if (!orphans.length) {
    el.innerHTML = '<span style="color:#22c55e;font-weight:600">✅ Todo en orden. No se encontraron leads huérfanos.</span>';
    return;
  }

  const candidates = allUsers.filter(u =>
    ['agent','supervisor_agent','manager','master_manager'].includes(u.role)
  ).sort((a, b) => a.name.localeCompare(b.name));

  const agentOptions = candidates
    .map(u => `<option value="${esc(u.name)}">${esc(u.name)}${u.inactive?' (inactivo)':''} · ${u.role}</option>`)
    .join('');

  const rows = orphans.map(([name, info]) => {
    const match = _bestMatch(name, allUsers);
    const key   = encodeURIComponent(name);
    const badge = match
      ? `<div style="font-size:10px;margin-top:3px;color:#fdab3d">💡 Sugerido: <strong>${esc(match.user.name)}</strong> (${Math.round(match.score*100)}% similar)</div>`
      : `<div style="font-size:10px;margin-top:3px;color:var(--text2)">Sin sugerencia automática</div>`;
    const preselect = match ? match.user.name : '';
    const opts = candidates.map(u =>
      `<option value="${esc(u.name)}" ${u.name === preselect ? 'selected' : ''}>${esc(u.name)}${u.inactive?' (inactivo)':''} · ${u.role}</option>`
    ).join('');
    return `
      <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:600;color:var(--text);font-size:13px">"${esc(name)}"</div>
          <div style="font-size:11px;color:var(--text2);margin-top:1px">${info.count} lead(s) · ${[...info.boardSet].slice(0,3).join(', ')}${info.boardSet.size>3?'…':''}</div>
          ${badge}
        </div>
        <select id="repair-sel-${key}" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:6px;font-size:12px;min-width:200px">
          <option value="">— Sin reasignar —</option>
          ${opts}
        </select>
        <button onclick="applyRepair('${esc(name)}')" style="background:rgba(0,115,234,.15);color:var(--accent);border:1px solid rgba(0,115,234,.3);padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">Reasignar</button>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px;color:#f59e0b;font-weight:600">⚠ ${orphans.length} nombre(s) sin usuario activo — ${orphans.reduce((s,[,i])=>s+i.count,0)} lead(s) afectados</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:14px">Los dropdowns con 💡 ya tienen una sugerencia automática. Revisa cada uno y ajusta si es necesario antes de reasignar.</div>
    ${rows}
    <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
      <button onclick="applyRepairAll()" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🔧 Reasignar todos los seleccionados</button>
      <button onclick="applyRepairAllSuggested()" style="background:rgba(253,171,61,.15);color:#fdab3d;border:1px solid rgba(253,171,61,.3);padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">💡 Aplicar solo los sugeridos (≥80%)</button>
    </div>`;
}

async function applyRepair(orphanName) {
  const key = encodeURIComponent(orphanName);
  const sel = document.getElementById('repair-sel-' + key);
  if (!sel || !sel.value) { showToast('Selecciona un agente primero'); return; }
  const newName = sel.value;
  let total = 0;
  for (const board of BOARDS) {
    const bLeads = loadLeads(board.id);
    let changed = false;
    bLeads.forEach(l => { if (l.asignado === orphanName) { l.asignado = newName; changed = true; total++; } });
    if (changed) await saveLeads(board.id, bLeads);
  }
  const trash = loadDeletedLeads();
  let tc = false;
  trash.forEach(l => { if (l.asignado === orphanName) { l.asignado = newName; tc = true; total++; } });
  if (tc) await saveDeletedLeads(trash);
  showToast(`✅ ${total} lead(s) reasignados a ${newName}`);
  runRepairScan();
}

async function _doRepairBulk(pairs) {
  let applied = 0;
  for (const { orphan, newName } of pairs) {
    if (!newName) continue;
    for (const board of BOARDS) {
      const bLeads = loadLeads(board.id);
      let changed = false;
      bLeads.forEach(l => { if (l.asignado === orphan) { l.asignado = newName; changed = true; applied++; } });
      if (changed) await saveLeads(board.id, bLeads);
    }
    const trash = loadDeletedLeads();
    let tc = false;
    trash.forEach(l => { if (l.asignado === orphan) { l.asignado = newName; tc = true; applied++; } });
    if (tc) await saveDeletedLeads(trash);
  }
  return applied;
}

async function applyRepairAll() {
  const el = document.getElementById('repair-results');
  if (!el) return;
  const pairs = [...el.querySelectorAll('select[id^="repair-sel-"]')]
    .filter(s => s.value)
    .map(s => ({ orphan: decodeURIComponent(s.id.replace('repair-sel-','')), newName: s.value }));
  const applied = await _doRepairBulk(pairs);
  showToast(`✅ ${applied} lead(s) reasignados`);
  runRepairScan();
}

async function applyRepairAllSuggested() {
  const allUsers = loadUsers();
  const el = document.getElementById('repair-results');
  if (!el) return;
  const pairs = [...el.querySelectorAll('select[id^="repair-sel-"]')]
    .map(s => {
      const orphan = decodeURIComponent(s.id.replace('repair-sel-',''));
      const match  = _bestMatch(orphan, allUsers);
      return match && match.score >= 0.80 ? { orphan, newName: match.user.name } : null;
    }).filter(Boolean);
  if (!pairs.length) { showToast('No hay sugerencias con ≥80% de confianza'); return; }
  const applied = await _doRepairBulk(pairs);
  showToast(`✅ ${applied} lead(s) reasignados automáticamente`);
  runRepairScan();
}

// ── Duplicate Scanner ───────────────────────────────────────────────────────
function runDuplicateScan() {
  const el = document.getElementById('dup-results');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text2)">Analizando usuarios...</span>';

  const allUsers = loadUsers();

  // Count leads per user name for context
  const leadCount = {};
  for (const board of BOARDS) {
    for (const l of loadLeads(board.id)) {
      if (l.asignado) leadCount[l.asignado] = (leadCount[l.asignado] || 0) + 1;
    }
  }

  const pairs = [];
  const seen  = new Set();

  for (let i = 0; i < allUsers.length; i++) {
    for (let j = i + 1; j < allUsers.length; j++) {
      const a = allUsers[i], b = allUsers[j];
      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;

      let reason = null;
      // Same email (normalized)
      const ea = (a.email || '').toLowerCase().trim();
      const eb = (b.email || '').toLowerCase().trim();
      if (ea && ea === eb) {
        reason = `📧 Mismo correo: ${esc(ea)}`;
      } else {
        // Name similarity
        const score = _nameSimilarity(a.name, b);
        if (score >= 0.65) {
          reason = `👤 Nombres similares (${Math.round(score*100)}% coincidencia)`;
        }
      }
      if (reason) {
        seen.add(pairKey);
        pairs.push({ a, b, reason, leadsA: leadCount[a.name]||0, leadsB: leadCount[b.name]||0 });
      }
    }
  }

  if (!pairs.length) {
    el.innerHTML = '<span style="color:#22c55e;font-weight:600">✅ No se detectaron usuarios duplicados.</span>';
    return;
  }

  const roleLabel = r => ({ master:'Master', admin:'Admin', master_manager:'MGA', manager:'GA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' }[r] || r);

  const rows = pairs.map((p, idx) => {
    const cardStyle = (u, leads) => `
      background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;flex:1;min-width:180px;
    `;
    return `
      <div style="padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;color:#fdab3d;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${p.reason}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:stretch">
          <div style="${cardStyle(p.a, p.leadsA)}">
            <div style="font-weight:600;font-size:13px;color:var(--text)">${esc(p.a.name)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(p.a.email||'—')}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              <span style="background:rgba(0,115,234,.12);color:var(--accent);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${roleLabel(p.a.role)}</span>
              ${p.a.inactive ? '<span style="background:rgba(255,80,80,.15);color:#ff6b6b;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">INACTIVO</span>' : '<span style="background:rgba(0,200,117,.12);color:var(--green);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">ACTIVO</span>'}
              <span style="background:rgba(120,75,209,.12);color:#a78bfa;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${p.leadsA} leads</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;font-size:18px;color:var(--text2);padding:0 4px">⟷</div>
          <div style="${cardStyle(p.b, p.leadsB)}">
            <div style="font-weight:600;font-size:13px;color:var(--text)">${esc(p.b.name)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(p.b.email||'—')}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              <span style="background:rgba(0,115,234,.12);color:var(--accent);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${roleLabel(p.b.role)}</span>
              ${p.b.inactive ? '<span style="background:rgba(255,80,80,.15);color:#ff6b6b;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">INACTIVO</span>' : '<span style="background:rgba(0,200,117,.12);color:var(--green);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">ACTIVO</span>'}
              <span style="background:rgba(120,75,209,.12);color:#a78bfa;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${p.leadsB} leads</span>
            </div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:8px">💡 Revisa cuál es el correcto. El duplicado se debe eliminar desde la pantalla de Organización (botón Eliminar usuario).</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px;color:#fdab3d;font-weight:600">⚠ Se encontraron ${pairs.length} par(es) de posibles duplicados:</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:14px">Antes de eliminar un duplicado, usa "Reparar Asignaciones" para mover sus leads al usuario correcto.</div>
    ${rows}`;
}
// ─────────────────────────────────────────────────────────────────────────────

function renderBoardEditor() {
  const el = document.getElementById('board-editor-list');
  if (!el) return;
  refreshBoards();
  const boards = BOARDS;
  el.innerHTML = boards.map((b, i) => `
    <div class="board-editor-row">
      <input class="be-icon-inp" id="be-icon-${b.id}" value="${esc(b.icon||'📋')}" title="Ícono (emoji)" />
      <input class="be-name-inp field-inp" id="be-name-${b.id}" value="${esc(b.name)}" placeholder="Nombre del board" />
      <button class="be-ord-btn" onclick="moveBoardUp('${b.id}')"   title="Subir"   ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="be-ord-btn" onclick="moveBoardDown('${b.id}')" title="Bajar"   ${i === boards.length-1 ? 'disabled' : ''}>▼</button>
      <button class="btn btn-primary be-save-btn" onclick="saveBoardRow('${b.id}')">Guardar</button>
    </div>
  `).join('');
}

function saveBoardRow(id) {
  const icon = document.getElementById('be-icon-' + id)?.value.trim() || '📋';
  const name = document.getElementById('be-name-' + id)?.value.trim().toUpperCase();
  if (!name) { showToast('El nombre no puede estar vacío', 'error'); return; }
  const meta  = loadBoardMeta();
  meta[id]    = { ...(meta[id]||{}), name, icon };
  saveBoardMeta(meta);
  refreshBoards();
  renderSidebar();
  showToast('Board actualizado ✓', 'success');
}

function moveBoardUp(id) {
  refreshBoards();
  const ids = BOARDS.map(b => b.id);
  const i   = ids.indexOf(id);
  if (i <= 0) return;
  [ids[i-1], ids[i]] = [ids[i], ids[i-1]];
  saveBoardOrder(ids);
  refreshBoards();
  renderSidebar();
  renderBoardEditor();
}
function moveBoardDown(id) {
  refreshBoards();
  const ids = BOARDS.map(b => b.id);
  const i   = ids.indexOf(id);
  if (i < 0 || i >= ids.length - 1) return;
  [ids[i], ids[i+1]] = [ids[i+1], ids[i]];
  saveBoardOrder(ids);
  refreshBoards();
  renderSidebar();
  renderBoardEditor();
}

function openBoardModal() {
  document.getElementById('b-icon').value = '📋';
  document.getElementById('b-nombre').value = '';
  document.getElementById('b-ubicaciones').value = '';


  document.getElementById('board-modal-overlay').classList.add('open');
}
function closeBoardModal() {
  document.getElementById('board-modal-overlay').classList.remove('open');
}

function saveBoard() {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el desarrollador puede crear boards', 'error'); return; }
  const name  = document.getElementById('b-nombre').value.trim().toUpperCase();
  const icon  = document.getElementById('b-icon').value.trim() || '📋';
  const ubRaw = document.getElementById('b-ubicaciones').value.trim();



  if (!name) { showToast('El nombre es requerido', 'error'); return; }

  const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g,'_') + '_' + Date.now().toString(36);
  const ubicaciones = ubRaw ? ubRaw.split(',').map(u => u.trim()).filter(Boolean) : [];

  const newBoard = { id, name, icon, hasCaller: false, hasSolicitudes: false, ubicaciones, custom: true };
  const customs  = loadCustomBoards();
  customs.push(newBoard);
  saveCustomBoards(customs);
  refreshBoards();
  seedTestLeads();
  closeBoardModal();
  renderSidebar();
  showToast(`Board "${name}" creado ✓`, 'success');
  selectBoard(id);
}

function moveLeadToVendidos(leadId, sourceBoardId) {
  const leads = loadLeads(sourceBoardId);
  const lead  = leads.find(l => l.id === leadId);
  if (!lead) return;
  // Remove from source board
  saveLeads(sourceBoardId, leads.filter(l => l.id !== leadId));
  // Add to vendidos board with lock flag
  const vendidosLeads = loadLeads(VENDIDOS_BOARD.id);
  vendidosLeads.unshift({ ...lead, resultado: 'VENDIDO! 🏆', _vendido: true, _vendidoAt: new Date().toISOString(), _locked: true });
  saveLeads(VENDIDOS_BOARD.id, vendidosLeads);
  logActivity('lead_edit', 'Lead marcado como VENDIDO 🏆', lead.nombre || lead.id, { boardId: sourceBoardId });
  renderTable();
  renderSidebar();
}

function deleteBoard(id) {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el desarrollador puede eliminar boards', 'error'); return; }
  const board = BOARDS.find(b => b.id === id);
  if (!board) return;
  const count = loadLeads(id).length;
  const msg = count > 0
    ? `¿Eliminar el board "${board.name}"? Tiene ${count} lead(s) que también se eliminarán.`
    : `¿Eliminar el board "${board.name}"?`;
  if (!confirm(msg)) return;

  // Soft-delete all leads from this board into trash before removing
  const boardLeads = loadLeads(id);
  if (boardLeads.length > 0) {
    const trash = loadDeletedLeads();
    const now   = new Date().toISOString();
    const sess2 = getSession();
    boardLeads.forEach(lead => trash.unshift({
      ...lead,
      _deletedAt:         now,
      _deletedBy:         (sess2 ? sess2.name : 'Sistema') + ' (board eliminado)',
      _originalBoardId:   id,
      _originalBoardName: board.name
    }));
    saveDeletedLeads(trash);
    updateTrashBadge();
  }
  const customs = loadCustomBoards().filter(b => b.id !== id);
  saveCustomBoards(customs);
  localStorage.removeItem('gew_leads_' + id);
  supaSync('gew_leads_' + id, JSON.stringify([]));
  refreshBoards();
  renderSidebar();
  if (currentBoardId === id) selectBoard('dallas');
  showToast('Board eliminado', 'error');
}

// ════════════════════════════════════════════
//  AUTH & USERS
// ════════════════════════════════════════════
const USERS_KEY         = 'gew_users';
const VIRTUAL_USERS_KEY = 'gew_virtual_users';
const SESSION_KEY       = 'gew_session';

// ── Google OAuth ─────────────────────────────────────────
// Reemplaza este valor con tu Client ID de Google Cloud Console
// Ve a: console.cloud.google.com → APIs & Services → Credentials
const GOOGLE_CLIENT_ID = '109274524960-a4vfb0q45fa1dqcre2579024plc2jntd.apps.googleusercontent.com';

// Usuario Desarrollador — hardcoded, no editable ni visible desde UI
const MASTER_USER = { id: 'master', name: 'Luis González', email: 'gonzalezluis@grupoelitework.com', passwordHash: 'c4f35af8db7b111df37816d336b7a6bd8abc30cb3258c67e1ee7f1b1baafd99f', role: 'master', termsAccepted: true };

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
}
async function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  const ok = await supaSync(USERS_KEY, JSON.stringify(users));
  if (!ok) showToast('Advertencia: no se pudo sincronizar con la nube', 'error');
}
// ── CÓDIGOS ADMINISTRATIVOS DE USUARIO ───────────────────────
function _nextUserCode(users) {
  const nums = users
    .map(u => u.userCode)
    .filter(Boolean)
    .map(c => parseInt((c || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return 'GEW-' + String(next).padStart(3, '0');
}

async function _backfillAsignadoId() {
  const session = getSession();
  const users = loadUsers();
  // Build name→id map scoped to the same org to avoid cross-org collisions
  const orgAdminId = session?.role === 'admin' ? session.id : null;
  const scopedUsers = orgAdminId
    ? users.filter(u => u.orgAdminId === orgAdminId || u.id === orgAdminId)
    : users;
  const nameToId = {};
  scopedUsers.forEach(u => { nameToId[u.name.trim().toLowerCase()] = u.id; });
  for (const board of BOARDS) {
    const leads = loadLeads(board.id);
    let changed = false;
    leads.forEach(l => {
      if (l.asignadoId || !l.asignado) return;
      const id = nameToId[(l.asignado || '').trim().toLowerCase()];
      if (id) { l.asignadoId = id; changed = true; }
    });
    if (changed) await saveLeads(board.id, leads);
  }
}

async function _backfillTipo() {
  if (localStorage.getItem('gew_backfill_tipo_done')) return;
  for (const board of BOARDS) {
    const leads = loadLeads(board.id);
    let changed = false;
    leads.forEach(l => { if (!l.tipo) { l.tipo = 'Presencial'; changed = true; } });
    if (changed) await saveLeads(board.id, leads);
  }
  localStorage.setItem('gew_backfill_tipo_done', '1');
  supaSync('gew_backfill_tipo_done', '1');
}

async function assignUserCodes() {
  const users = loadUsers();
  let changed = false;
  users.forEach(u => {
    if (!u.userCode) {
      u.userCode = _nextUserCode(users.filter(x => x.userCode));
      changed = true;
    }
  });
  if (changed) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    await supaSync(USERS_KEY, JSON.stringify(users));
  }
}

function loadVirtualUsers() {
  try { return JSON.parse(localStorage.getItem(VIRTUAL_USERS_KEY)) || []; } catch { return []; }
}
async function saveVirtualUsers(list) {
  localStorage.setItem(VIRTUAL_USERS_KEY, JSON.stringify(list));
  supaSync(VIRTUAL_USERS_KEY, JSON.stringify(list));
}

function renderVirtualUsersList() {
  const el = document.getElementById('virtual-users-list');
  if (!el) return;
  const session = getSession();
  if (!session) return;
  const all  = loadVirtualUsers();
  const mine = session.role === 'master' ? all : all.filter(v => v.orgAdminId === session.id);
  if (!mine.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text2);padding:4px 0">No hay usuarios sin cuenta aún.</div>';
    return;
  }
  el.innerHTML = mine.map(v => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(120,75,209,.15);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#9b73f8;flex-shrink:0">${esc(v.name.charAt(0).toUpperCase())}</div>
      <div style="flex:1;font-size:13px;color:var(--text)">${esc(v.name)}</div>
      <span style="font-size:10px;color:var(--text2);background:rgba(255,255,255,.05);padding:2px 8px;border-radius:8px;border:1px solid var(--border)">Sin cuenta</span>
      <button onclick="deleteVirtualUser('${v.id}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:18px;padding:0 4px;line-height:1;opacity:.7" title="Eliminar">×</button>
    </div>
  `).join('');
}

async function addVirtualUser() {
  const inp  = document.getElementById('vu-name-inp');
  const name = (inp.value || '').trim();
  if (!name) { inp.focus(); return; }
  const session = getSession();
  const all     = loadVirtualUsers();
  if (all.some(v => v.name.toLowerCase() === name.toLowerCase())) {
    showToast('Ya existe un usuario con ese nombre', 'error'); return;
  }
  all.push({ id: 'vu_' + Date.now(), name, orgAdminId: session.role === 'master' ? 'master' : session.id, virtual: true });
  await saveVirtualUsers(all);
  inp.value = '';
  renderVirtualUsersList();
  showToast('Usuario agregado');
}

async function deleteVirtualUser(id) {
  const all = loadVirtualUsers().filter(v => v.id !== id);
  await saveVirtualUsers(all);
  renderVirtualUsersList();
  showToast('Usuario eliminado');
}

let _devMode = localStorage.getItem('gew_dev_mode') === 'true';

function toggleDevMode() {
  _devMode = !_devMode;
  localStorage.setItem('gew_dev_mode', _devMode);
  const raw = JSON.parse(localStorage.getItem(SESSION_KEY));
  if (raw) renderTopbarUser(raw);
  location.reload();
}

function getSession() {
  try {
    // Preview mode: opened via "Ver como" — usa sessionStorage, no afecta la sesión real
    const preview = sessionStorage.getItem('gew_preview_session');
    if (preview) return JSON.parse(preview);
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return null;
    // Master sin modo desarrollador → se comporta como admin
    if (s.role === 'master' && !_devMode) return { ...s, role: 'admin', _isMaster: true };
    return s;
  } catch { return null; }
}
function setSession(user) { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

function openPreviewAs(userId) {
  const url = new URL(location.href);
  url.searchParams.set('preview', userId);
  window.open(url.toString(), '_blank');
}

async function _initPreviewMode() {
  const previewId = new URLSearchParams(location.search).get('preview');
  if (!previewId) return false;
  await loadFromSupabase().catch(() => {});
  const users = loadUsers();
  const user = users.find(u => u.id === previewId);
  if (!user) return false;
  sessionStorage.setItem('gew_preview_session', JSON.stringify(user));
  const roleLabel = user.role === 'admin' ? 'Administrador' : user.role === 'master_manager' ? 'MGA' : user.role === 'manager' ? 'GA' : user.role === 'supervisor_agent' ? 'SA' : user.role === 'caller' ? 'Caller' : 'Agente';
  const banner = document.getElementById('preview-banner');
  document.getElementById('preview-banner-name').textContent = user.name;
  document.getElementById('preview-banner-role').textContent = '· ' + roleLabel;
  banner.style.display = 'flex';
  document.body.style.paddingTop = '34px';
  return true;
}

/* ── THEME ── */
function applyTheme(mode) {
  const isLight = mode === 'light';
  document.documentElement.classList.toggle('light-mode', isLight);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = isLight ? '🌙 Oscuro' : '☀️ Claro';
}
function toggleTheme() {
  const current = localStorage.getItem('gew_theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('gew_theme', next);
  applyTheme(next);
}
/* apply class immediately (before paint) then update button text after DOM ready */
(function() {
  const saved = localStorage.getItem('gew_theme') || 'dark';
  if (saved === 'light') document.documentElement.classList.add('light-mode');
  document.addEventListener('DOMContentLoaded', () => applyTheme(saved));
})();

function seedTestLeads() {
  BOARDS.forEach(b => {
    const leads = loadLeads(b.id);
    const already = leads.some(l => l._testLead === true);
    if (already) return;
    const ub = b.ubicaciones.length > 0 ? b.ubicaciones[0] : '';
    const testLead = {
      id:          uid(),
      _testLead:   true,
      creacion:    today(),
      nombre:      'Usuario de Prueba de ' + b.name,
      lead:        'GUÍA DE INFORMACIÓN',
      email:       'prueba@grupoelitework.com',
      telefono:    '+1 000 000 0000',
      hijos:       '2',
      direccion:   '123 Test Street',
      ubicacion:   ub,
      asignado:    '',
      resultado:   '',

      notas:       'Lead de prueba generado automáticamente.',
    };
    leads.unshift(testLead);
    saveLeads(b.id, leads);
  });
}

async function seedDefaultAdmin() {
  // Seed removed — real users exist; admin@grupoelitework.com with plain-text password was a security vector
}

async function seedAlexanderAgentsV2() {
  if (localStorage.getItem('gew_seed_alexander_agents_v2')) return;
  const users = loadUsers();
  const deletedEmails = new Set(loadDeletedUsers().map(u => (u.email||'').toLowerCase()));
  const alexander = users.find(u => u.email === 'alexander@gmail.com') || users.find(u => u.name && u.name.toLowerCase().includes('alexander'));
  if (!alexander) { localStorage.setItem('gew_seed_alexander_agents_v2', '1'); supaSync('gew_seed_alexander_agents_v2', '1'); return; }
  const names = ['Orlando','Lianet','Edgar','Christopher','Cecilia'];
  let changed = false;
  names.forEach(name => {
    const emailName = name.toLowerCase().replace(/\s+/g, '') + '@gmail.com';
    if (users.find(u => u.email === emailName) || deletedEmails.has(emailName)) return;
    users.push({ id: uid(), name: name, email: emailName, password: '123456', role: 'agent', orgManagerId: alexander.id, termsAccepted: true, mustChangePassword: true, createdAt: today() });
    changed = true;
  });
  if (changed) { await saveUsers(users); showToast('5 agentes adicionales de Alexander agregados ✓', 'success'); }
  localStorage.setItem('gew_seed_alexander_agents_v2', '1');
  supaSync('gew_seed_alexander_agents_v2', '1');
}

async function seedAlexanderAgents() {
  if (localStorage.getItem('gew_seed_alexander_agents_v1')) return;
  const users = loadUsers();
  const deletedEmails = new Set(loadDeletedUsers().map(u => (u.email||'').toLowerCase()));
  const alexander = users.find(u => u.email === 'alexander@gmail.com') || users.find(u => u.name && u.name.toLowerCase().includes('alexander'));
  if (!alexander) { localStorage.setItem('gew_seed_alexander_agents_v1', '1'); supaSync('gew_seed_alexander_agents_v1', '1'); return; }
  const names = ['Harold','Kenia','Lisbeth','Chacha','Barbara','Augusto','Bryan','Yarlys','Yarisleidy','Madison','Marta','Guadalupe','Neyda','Maria Lugo','Elizabeth'];
  let changed = false;
  names.forEach(name => {
    const emailName = name.toLowerCase().replace(/\s+/g, '') + '@gmail.com';
    if (users.find(u => u.email === emailName) || deletedEmails.has(emailName)) return;
    users.push({ id: uid(), name: name, email: emailName, password: '123456', role: 'agent', orgManagerId: alexander.id, termsAccepted: true, mustChangePassword: true, createdAt: today() });
    changed = true;
  });
  if (changed) { await saveUsers(users); showToast('15 agentes de Alexander agregados ✓', 'success'); }
  localStorage.setItem('gew_seed_alexander_agents_v1', '1');
  supaSync('gew_seed_alexander_agents_v1', '1');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-error');
  const btn   = document.querySelector('.login-btn');

  // Force-hide overlay in case it's still showing
  const ov = document.getElementById('sync-overlay');
  if (ov) { ov.style.display = 'none'; ov.style.pointerEvents = 'none'; }

  err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }

  try {
    // 1. Check master user
    let user = null;
    if (email === MASTER_USER.email.toLowerCase() && await sha256(pass) === MASTER_USER.passwordHash) {
      user = MASTER_USER;
    } else {
      // 2. Check localStorage
      let users = loadUsers();
      const byEmail = users.find(u => u.email.toLowerCase() === email);
      if (byEmail && byEmail.googleAuth && !byEmail.password) {
        err.textContent = 'Esta cuenta usa Google para iniciar sesión. Usa el botón de Google.';
        if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
        return;
      }
      if (byEmail && await verifyPass(pass, byEmail.password)) {
        user = byEmail;
        if (!_isHashed(byEmail.password)) {
          byEmail.password = await sha256(pass);
          localStorage.setItem('gew_users', JSON.stringify(users));
          supaSync('gew_users', JSON.stringify(users));
        }
      }

      // 3. Fallback: fetch fresh from Supabase if not found locally
      if (!user) {
        try {
          const { data } = await supa.from('kv_store').select('value').eq('key', 'gew_users').maybeSingle();
          if (data && data.value) {
            const remoteUsers = JSON.parse(data.value) || [];
            localStorage.setItem('gew_users', data.value);
            const byEmail3 = remoteUsers.find(u => u.email.toLowerCase() === email);
            if (byEmail3 && await verifyPass(pass, byEmail3.password)) {
              user = byEmail3;
              if (!_isHashed(byEmail3.password)) {
                byEmail3.password = await sha256(pass);
                localStorage.setItem('gew_users', JSON.stringify(remoteUsers));
                supaSync('gew_users', JSON.stringify(remoteUsers));
              }
            }
          }
        } catch(_) {}
      }
    }

    if (!user) {
      err.textContent = 'Email o contraseña incorrectos.';
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
      return;
    }

    if (user.inactive) {
      err.textContent = 'Esta cuenta está inactiva. Contacta al administrador.';
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
      return;
    }

    document.getElementById('login-debug').style.display = 'none';
    err.textContent = '';
    // Auto-accept terms on first regular login; Google login uses the explicit modal
    if (!user.termsAccepted && user.role !== 'master') {
      const allU = loadUsers();
      const idx  = allU.findIndex(u => u.id === user.id);
      if (idx !== -1) { allU[idx].termsAccepted = true; localStorage.setItem('gew_users', JSON.stringify(allU)); supaSync('gew_users', JSON.stringify(allU)); }
      user = { ...user, termsAccepted: true };
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    _finalizeLogin(user);
  } catch(e) {
    err.textContent = 'Error inesperado: ' + (e && e.message ? e.message : String(e));
    if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
  }
}

let _googleRegisterMode = false;
let _googleRegisterPayload = null;

function _decodeGoogleJwt(credential) {
  return JSON.parse(atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
}

function handleGoogleCallback(response) {
  if (_googleRegisterMode) {
    _handleGoogleRegisterFill(response);
  } else {
    _handleGoogleLogin(response);
  }
}

function _handleGoogleLogin(response) {
  const err = document.getElementById('login-error');
  try {
    const payload = _decodeGoogleJwt(response.credential);
    const email   = (payload.email || '').toLowerCase();
    let user = null;
    if (email === MASTER_USER.email.toLowerCase()) {
      user = MASTER_USER;
    } else {
      user = loadUsers().find(u => u.email.toLowerCase() === email);
    }
    if (!user) {
      err.textContent = 'Tu cuenta de Google (' + payload.email + ') no está registrada. Usa el enlace de abajo para solicitar acceso.';
      return;
    }
    err.textContent = '';
    document.getElementById('login-debug').style.display = 'none';
    if (!user.termsAccepted) { showTermsModal(user); return; }
    _finalizeLogin(user);
  } catch(e) {
    console.error('Google sign-in error:', e);
    err.textContent = 'Error al iniciar sesión con Google. Intenta de nuevo.';
  }
}

function _handleGoogleRegisterFill(response) {
  try {
    const payload = _decodeGoogleJwt(response.credential);
    _googleRegisterPayload = payload;
    document.getElementById('reg-name').value  = payload.name  || '';
    document.getElementById('reg-email').value = payload.email || '';
    document.getElementById('reg-email').readOnly = true;
    document.getElementById('reg-name').readOnly  = true;
    document.getElementById('reg-google-info').style.display = '';
    document.getElementById('reg-pass').placeholder = 'Opcional (ya usas Google)';
    document.getElementById('reg-pass-required').style.display = 'none';
    document.getElementById('reg-error').textContent = '';
  } catch(e) {
    console.error('Google register error:', e);
  } finally {
    _googleRegisterMode = false;
  }
}

function initGoogleSignIn() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'TU_GOOGLE_CLIENT_ID_AQUI') return;
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  google.accounts.id.initialize({
    client_id:   GOOGLE_CLIENT_ID,
    callback:    handleGoogleCallback,
    auto_select: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular', width: 300, locale: 'es' }
  );
}

function initGoogleRegisterButton() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'TU_GOOGLE_CLIENT_ID_AQUI') {
    document.getElementById('google-register-btn').style.display = 'none';
    document.getElementById('reg-divider').textContent = '';
    return;
  }
  if (typeof google === 'undefined' || !google.accounts) { setTimeout(initGoogleRegisterButton, 300); return; }
  google.accounts.id.renderButton(
    document.getElementById('google-register-btn'),
    { theme: 'filled_black', size: 'large', text: 'signup_with', shape: 'rectangular', width: 300, locale: 'es' }
  );
  // Override the button click to set register mode first
  document.getElementById('google-register-btn').addEventListener('click', () => {
    _googleRegisterMode = true;
  }, true);
}

function doLogout() {
  clearSession();
  // reset all UI state so the next user logs in clean
  document.getElementById('sidebar-admin').style.display   = 'none';
  document.getElementById('sidebar-agent').style.display   = 'none';
  document.getElementById('sidebar-master').style.display  = 'none';
  document.getElementById('sidebar-scripts').style.display = 'none';
  document.body.classList.remove('show-emblems');
  document.getElementById('board-list').style.display      = '';
  document.getElementById('scripts-page').classList.remove('visible');
  document.getElementById('btn-scripts-panel').style.display = 'none';
  const ssp = document.getElementById('scripts-side-panel');
  if (ssp) ssp.classList.remove('open');
  _sspOpen = false; _sspCurrentId = null;
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('sidebar').style.display = '';
  const agBanner = document.getElementById('agent-org-banner');
  if (agBanner) agBanner.style.display = 'none';
  document.getElementById('settings-page').classList.remove('visible');
  document.getElementById('table-wrap').style.display   = '';
  document.getElementById('toolbar').style.display      = '';
  document.getElementById('btn-new-lead').style.display = '';
  document.getElementById('btn-export').style.display   = '';
  document.getElementById('topbar-user').innerHTML = '';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value  = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-screen').classList.remove('hidden');
  // re-render Google button so it appears after logout
  const gsBtn = document.getElementById('google-signin-btn');
  if (gsBtn) gsBtn.innerHTML = '';
  initGoogleSignIn();
}

// ── Delete with reason ──
let _deleteReasonLeadId = null, _deleteReasonBoardId = null;

function openDeleteReasonModal(leadId, boardId) {
  _deleteReasonLeadId  = leadId;
  _deleteReasonBoardId = boardId;
  document.getElementById('delete-reason-text').value = '';
  document.getElementById('delete-reason-overlay').classList.add('open');
  setTimeout(() => document.getElementById('delete-reason-text').focus(), 50);
}

function cancelDeleteReason() {
  _deleteReasonLeadId = _deleteReasonBoardId = null;
  document.getElementById('delete-reason-overlay').classList.remove('open');
}

function confirmDeleteWithReason() {
  const reason = document.getElementById('delete-reason-text').value.trim();
  if (!reason) { showToast('Escribe una razón para eliminar', 'error'); return; }
  const session = getSession();
  const who = session ? (session.name || session.email) : 'Sistema';
  const ts  = new Date().toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  const leads = loadLeads(_deleteReasonBoardId);
  const lead  = leads.find(l => l.id === _deleteReasonLeadId);
  if (lead) {
    const _notes = parseNotes(lead._notes);
    _notes.push({ text: `Eliminado — ${reason}`, author: who, date: new Date().toISOString(), system: true });
    lead._notes = JSON.stringify(_notes);
    saveLeads(_deleteReasonBoardId, leads);
  }
  document.getElementById('delete-reason-overlay').classList.remove('open');
  softDeleteLead(_deleteReasonLeadId, _deleteReasonBoardId);
  _deleteReasonLeadId = _deleteReasonBoardId = null;
  renderTable();
  showToast('Lead eliminado ✓', 'error');
}

// ── Resultado note modal (non-master) ──
let _rnLeadId = null, _rnBoardId = null, _rnValue = null;
const RESULTADO_DESTRUCTIVE = new Set(['NO INTERESADO', 'NÚMERO EQUIVOCADO', '__delete_lead__']);

function openResultadoNoteModal(leadId, boardId, value) {
  _rnLeadId  = leadId;
  _rnBoardId = boardId;
  _rnValue   = value;
  const label = value === '__delete_lead__' ? 'ELIMINAR' : value;
  document.getElementById('rn-subtitle').textContent = 'Nuevo resultado: ' + label;
  document.getElementById('rn-text').value = '';
  document.getElementById('rn-submit').disabled = true;
  document.getElementById('rn-warning').style.display = RESULTADO_DESTRUCTIVE.has(value) ? '' : 'none';
  document.getElementById('resultado-note-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('rn-text').focus(), 60);
}

function closeResultadoNoteModal() {
  document.getElementById('resultado-note-overlay').style.display = 'none';
  _rnLeadId = _rnBoardId = _rnValue = null;
}

function confirmResultadoNote() {
  const note = document.getElementById('rn-text').value.trim();
  if (!note) return;
  const session = getSession();
  const who = session ? (session.name || session.email) : 'Sistema';
  const leadId = _rnLeadId, boardId = _rnBoardId, value = _rnValue;
  const pending = _pendingModalSave;
  _pendingModalSave = null;
  closeResultadoNoteModal();

  // Resolve the leads array: use pending context (full modal save) or reload from storage
  const leads = pending ? pending.leads : loadLeads(boardId);
  const lead  = leads.find(l => l.id === leadId);
  if (!lead) return;

  // Append justification note
  const isDelete = value === '__delete_lead__';
  const resultLabel = isDelete ? 'ELIMINAR' : value;
  const _notes = parseNotes(lead._notes);
  _notes.push({ text: `Resultado → ${resultLabel} — ${note}`, author: who, date: new Date().toISOString(), system: true });
  lead._notes = JSON.stringify(_notes);
  if (!isDelete) lead.resultado = value;

  if (pending) {
    // Came from the lead modal: use _applyModalSave for consistent behavior
    _applyModalSave(leads, lead, boardId, leadId, pending.oldLead, pending.isEdit);
    return;
  }

  // Standard inline-column flow
  if (isDelete || value === 'NO INTERESADO' || value === 'NÚMERO EQUIVOCADO') {
    localStorage.setItem('gew_leads_' + boardId, JSON.stringify(leads));
    softDeleteLead(leadId, boardId);
    renderTable();
    showToast('Lead movido a papelera ✓', 'error');
    return;
  }
  saveLeads(boardId, leads);
  if (value === 'CITA AGENDADA') {
    renderTable();
    openCitaModal(leadId, boardId, lead.nombre || lead.email || '');
    return;
  }
  renderTableKeepSelection();
  showToast('Resultado guardado ✓', 'success');
}

// ── Toolbar gap (master-adjustable, synced) ──
const _GAP_KEY = 'gew_toolbar_gap';

function applyToolbarGap() {
  const gap = parseInt(localStorage.getItem(_GAP_KEY) || '18', 10);
  const strip = document.getElementById('assign-strip');
  if (strip) strip.style.marginTop = gap + 'px';
}

function initToolbarGapHandle() {
  const session = getSession();
  const handle  = document.getElementById('topbar-gap-resizer');
  if (!handle) return;
  const isMaster = session && session.role === 'master';
  handle.style.display = isMaster ? 'flex' : 'none';
  if (!isMaster) return;
  if (handle._gapHandleInit) return;
  handle._gapHandleInit = true;

  let dragging = false, startY = 0, startGap = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startY   = e.clientY;
    startGap = parseInt(document.getElementById('assign-strip').style.marginTop || '18', 10);
    document.body.style.cursor     = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newGap = Math.max(4, Math.min(100, startGap + (e.clientY - startY)));
    document.getElementById('assign-strip').style.marginTop = newGap + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = document.body.style.userSelect = '';
    const gap = parseInt(document.getElementById('assign-strip').style.marginTop || '18', 10);
    localStorage.setItem(_GAP_KEY, String(gap));
    supaSync(_GAP_KEY, String(gap));
    showToast('Espacio guardado ✓', 'success');
  });
}

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
  // Pre-load auto-recharge settings so trigger works in send
  loadAutoRechargeSettings().catch(() => {});
  // Assign GEW-XXX codes to users that don't have one yet
  if (user.role === 'master') assignUserCodes().catch(() => {});
  // Backfill asignadoId on existing leads that only have asignado (name)
  if (user.role === 'master' || user.role === 'admin') _backfillAsignadoId().catch(() => {});
  _backfillTipo().catch(() => {});
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
//  TERMS & CONDITIONS
// ════════════════════════════════════════════
const TERMS_KEY = 'gew_terms';
const DEFAULT_TERMS = `TÉRMINOS Y CONDICIONES DE USO

Al acceder y utilizar esta plataforma CRM, usted acepta los siguientes términos:

1. USO AUTORIZADO
Esta plataforma es de uso exclusivo para el personal autorizado de la organización. Queda prohibido compartir credenciales de acceso con terceros.

2. CONFIDENCIALIDAD
Toda la información contenida en este sistema, incluyendo datos de leads, clientes y usuarios, es confidencial y propiedad de la organización. Su divulgación no autorizada puede resultar en acciones legales.

3. RESPONSABILIDAD DEL USUARIO
Cada usuario es responsable de las acciones realizadas con su cuenta. Cualquier uso indebido, modificación o eliminación no autorizada de datos será responsabilidad del usuario.

4. PRIVACIDAD DE DATOS
La información personal de leads y clientes debe manejarse conforme a las leyes de privacidad aplicables. No está permitido exportar, compartir o utilizar dichos datos fuera del contexto de las actividades de la organización.

5. PROPIEDAD INTELECTUAL
El contenido, estructura y funcionalidades de esta plataforma son propiedad de la organización. No se permite su reproducción parcial o total sin autorización expresa.

6. MODIFICACIONES
La organización se reserva el derecho de actualizar estos términos en cualquier momento. El uso continuado de la plataforma implica la aceptación de los términos vigentes.

7. ACEPTACIÓN
Al marcar la casilla de aceptación, confirma que ha leído, comprendido y acepta cumplir con todos los términos y condiciones aquí descritos.`;

function loadTerms() {
  return localStorage.getItem(TERMS_KEY) || DEFAULT_TERMS;
}
async function saveTermsContent(text) {
  localStorage.setItem(TERMS_KEY, text);
  supaSync(TERMS_KEY, text);
}

function toggleTermsEdit() {
  const sec  = document.getElementById('terms-edit-section');
  const icon = document.getElementById('terms-edit-icon');
  const open = sec.style.display === 'none' || !sec.style.display;
  if (open) {
    document.getElementById('terms-textarea').value = loadTerms();
    sec.style.display  = 'block';
    icon.textContent   = '✕ Cerrar';
  } else {
    sec.style.display  = 'none';
    icon.textContent   = '✏️ Editar';
  }
}
async function saveTerms() {
  const text = document.getElementById('terms-textarea').value.trim();
  if (!text) { showToast('Los términos no pueden estar vacíos', 'error'); return; }
  await saveTermsContent(text);
  toggleTermsEdit();
  showToast('Términos guardados ✓', 'success');
}

// ── Single entry point for all post-auth login completion ──
// Every login path (password, Google, terms acceptance) MUST call this.
// Add any future post-login logic here and it applies everywhere automatically.
function _finalizeLogin(user) {
  // Record last login timestamp
  if (user.role !== 'master') {
    const _allU = loadUsers();
    const _uidx = _allU.findIndex(u => u.id === user.id);
    if (_uidx !== -1) {
      _allU[_uidx].lastLogin = new Date().toISOString();
      localStorage.setItem(USERS_KEY, JSON.stringify(_allU));
      supaSync(USERS_KEY, JSON.stringify(_allU));
      user = { ...user, lastLogin: _allU[_uidx].lastLogin };
    }
  }
  setSession(user);
  document.getElementById('login-screen').classList.add('hidden');
  if (user.mustChangePassword) {
    document.getElementById('force-pass-overlay').style.display = 'flex';
    return;
  }
  try {
    initApp(user);
    updatePendingBadge();
    updateTrashBadge();
  } catch(e) {
    console.error('initApp error:', e);
    document.getElementById('login-screen').classList.remove('hidden');
    const err = document.getElementById('login-error');
    if (err) err.textContent = 'Error al cargar la app: ' + (e && e.message ? e.message : String(e));
  }
}

// ── T&C acceptance on login ──
let _pendingLoginUser = null;

function showTermsModal(user) {
  _pendingLoginUser = user;
  const overlay = document.getElementById('terms-modal-overlay');
  document.getElementById('terms-modal-org').textContent   = loadAppName();
  document.getElementById('terms-modal-text').textContent  = loadTerms();
  document.getElementById('terms-accept-check').checked    = false;
  document.getElementById('terms-accept-btn').disabled     = true;
  document.getElementById('terms-accept-btn').classList.remove('enabled');
  overlay.style.display = 'flex';
}
function onTermsCheckChange() {
  const checked = document.getElementById('terms-accept-check').checked;
  const btn     = document.getElementById('terms-accept-btn');
  btn.disabled  = !checked;
  btn.classList.toggle('enabled', checked);
}
async function confirmTermsAcceptance() {
  if (!_pendingLoginUser) return;
  // Save acceptance on user record
  if (_pendingLoginUser.role !== 'master') {
    const users = loadUsers();
    const idx   = users.findIndex(u => u.id === _pendingLoginUser.id);
    if (idx !== -1) { users[idx].termsAccepted = true; await saveUsers(users); }
  }
  const user = { ..._pendingLoginUser, termsAccepted: true };
  _pendingLoginUser = null;
  document.getElementById('terms-modal-overlay').style.display = 'none';
  _finalizeLogin(user);
}

// T&C preview from register form — opens the full styled viewer
function showTermsPreview() {
  openTosViewer();
}
function applyAppName() {
  document.getElementById('appname-display').textContent = loadAppName();
}
function toggleOrgNameSection() {
  const section = document.getElementById('orgname-edit-section');
  const icon    = document.getElementById('orgname-lock-icon');
  const open    = section.style.display === 'none' || section.style.display === '';
  if (open) {
    document.getElementById('appname-settings-input').value = loadAppName();
    section.style.display = 'block';
    icon.textContent = '🔓';
  } else {
    section.style.display = 'none';
    icon.textContent = '✏️ Editar';
  }
}
function saveAppName() {
  const val = document.getElementById('appname-settings-input').value.trim();
  if (val) {
    localStorage.setItem('gew_appname', val); supaSync('gew_appname', val);
    document.getElementById('appname-display').textContent = val;
    const loginOrgEl = document.getElementById('login-org-name');
    if (loginOrgEl) loginOrgEl.textContent = val;
    showToast('Nombre actualizado ✓', 'success');
    document.getElementById('orgname-edit-section').style.display = 'none';
    document.getElementById('orgname-lock-icon').textContent = '✏️ Editar';
  }
}

function renderTopbarUser(user) {
  const initials  = getInitials(user.name);
  const isMasterAccount = user.role === 'master' || user._isMaster;
  const roleLabel = _devMode && user.role === 'master' ? 'Desarrollador' : user.role === 'admin' || (!_devMode && isMasterAccount) ? 'Administrador' : user.role === 'master_manager' ? 'MGA' : user.role === 'manager' ? 'GA' : user.role === 'supervisor_agent' ? 'SA' : user.role === 'caller' ? 'Caller' : 'Agente';
  const devToggle = isMasterAccount ? `
    <button onclick="toggleDevMode()" title="${_devMode ? 'Desactivar modo desarrollador' : 'Activar modo desarrollador'}"
      style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;font-family:var(--font);font-size:11px;font-weight:600;cursor:pointer;transition:background .15s;
      ${_devMode
        ? 'background:rgba(120,75,209,.18);border:1px solid rgba(120,75,209,.4);color:#a57ff5;'
        : 'background:var(--card2);border:1px solid var(--border);color:var(--text2);'}">
      ${_devMode ? '🛠 Dev ON' : '🔒 Dev OFF'}
    </button>` : '';
  const driveBtn = (_devMode && user.role === 'master') ? `<button onclick="exportBackupToDrive()" title="Respaldar en Google Drive" style="display:flex;align-items:center;gap:5px;background:rgba(0,200,117,.12);border:1px solid rgba(0,200,117,.3);color:#00c875;padding:5px 10px;border-radius:6px;font-family:var(--font);font-size:11px;font-weight:600;cursor:pointer;" ><img src="https://www.google.com/images/icons/product/drive-32.png" style="width:13px;height:13px"/>Respaldar</button>` : '';
  document.getElementById('topbar-user').innerHTML = `
    <div class="topbar-avatar">${initials}</div>
    <div class="topbar-user-info">
      <div class="topbar-user-name">${esc(user.name)}</div>
      <div class="topbar-user-role">${roleLabel}</div>
    </div>
    ${devToggle}
    ${driveBtn}
    <button class="btn-logout" onclick="doLogout()">Salir</button>
  `;
}

// ── Users Page ──
let editingUserId = null;

function showUsersPage() {
  showSettingsPage();
  switchSettingsTab('team');
}

function showBoardView() {
  document.getElementById('settings-page').classList.remove('visible');
  document.getElementById('trash-page').classList.remove('visible');
  document.getElementById('scripts-page').classList.remove('visible');
  document.getElementById('conversations-page').style.display = 'none';
  document.getElementById('credits-page').style.display   = 'none';
  document.getElementById('activity-page').style.display  = 'none';
  document.getElementById('calendar-page').style.display  = 'none';
  document.getElementById('stats-page').style.display     = 'none';
  document.getElementById('reconcile-page').style.display = 'none';
  document.getElementById('weekly-report-page').style.display = 'none';
  document.getElementById('connections-page').style.display = 'none';
  document.getElementById('referidos-page').style.display = 'none';
  const navWR = document.getElementById('nav-weekly-report');
  if (navWR) navWR.classList.remove('active');
  const navConn = document.getElementById('nav-connections');
  if (navConn) navConn.classList.remove('active');
  const navAct = document.getElementById('nav-activity');
  if (navAct) navAct.classList.remove('active');
  const navCal = document.getElementById('nav-calendar');
  if (navCal) navCal.classList.remove('active');
  const navSta = document.getElementById('nav-stats');
  if (navSta) navSta.classList.remove('active');
  const navCrd = document.getElementById('nav-credits');
  if (navCrd) navCrd.classList.remove('active');
  document.getElementById('table-wrap').style.display   = '';
  document.getElementById('toolbar').style.display      = '';
  document.getElementById('btn-new-lead').style.display = '';
  document.getElementById('btn-export').style.display   = 'none';
  const navSet = document.getElementById('nav-settings');
  if (navSet) navSet.classList.remove('active');
  const navImp = document.getElementById('nav-import');
  if (navImp) navImp.classList.remove('active');
  const navTrh = document.getElementById('nav-trash');
  if (navTrh) navTrh.classList.remove('active');
  const session = getSession();
  const strip = document.getElementById('assign-strip');
  if (session && (session.role === 'admin' || session.role === 'master')) {
    strip.classList.remove('hidden');
  } else {
    strip.classList.add('hidden');
  }
}

function userCard(u, session) {
  const initials  = getInitials(u.name);
  const avatarCls = u.role === 'admin' ? 'avatar-admin' : 'avatar-agent';
  const roleCls   = u.role === 'admin' ? 'role-admin' : u.role === 'master_manager' ? 'role-master_manager' : u.role === 'manager' ? 'role-manager' : u.role === 'supervisor_agent' ? 'role-supervisor_agent' : u.role === 'caller' ? 'role-caller' : 'role-agent';
  const roleLabel = u.role === 'admin' ? 'Administrador' : u.role === 'master_manager' ? 'MGA' : u.role === 'manager' ? 'GA' : u.role === 'supervisor_agent' ? 'SA' : u.role === 'caller' ? 'Caller' : 'Agente';
  const isSelf    = session && session.id === u.id;
  const canEdit   = session && (session.role === 'master' ||
                    (session.role === 'admin' && (u.orgAdminId === session.id || u.id === session.id)));
  return `
    <div class="user-card">
      <div class="user-card-top">
        <div class="user-card-avatar ${avatarCls}">${initials}</div>
        <div class="user-card-info">
          <div class="user-card-name">${esc(u.name)}</div>
          <div class="user-card-email">${esc(u.email)}</div>
        </div>
      </div>
      <div class="user-card-bottom">
        <span class="role-badge ${roleCls}">${roleLabel}</span>
        <div class="user-card-actions">
          ${canEdit ? `<button onclick="openUserModal('${u.id}')" title="Editar">✏️</button>` : ''}
          ${canEdit && !isSelf ? `<button class="del" onclick="deleteUser('${u.id}')" title="Eliminar">🗑</button>` : ''}
        </div>
      </div>
    </div>`;
}

function orgNode(u, session) {
  const roleCls   = u.role === 'master' ? 'role-master' : u.role === 'admin' ? 'role-admin' : u.role === 'master_manager' ? 'role-master_manager' : u.role === 'manager' ? 'role-manager' : u.role === 'supervisor_agent' ? 'role-supervisor_agent' : u.role === 'caller' ? 'role-caller' : 'role-agent';
  const roleLabel = u.role === 'master' ? 'Desarrollador' : u.role === 'admin' ? 'Administrador' : u.role === 'master_manager' ? 'MGA' : u.role === 'manager' ? 'GA' : u.role === 'supervisor_agent' ? 'SA' : u.role === 'caller' ? 'Caller' : 'Agente';
  const nodeClass = `org-node org-node-${u.role}`;
  const initials  = getInitials(u.name);
  const avatarBg  = u.role==='master'?'var(--yellow)':u.role==='admin'?'var(--accent)':u.role==='master_manager'?'#00b7c3':u.role==='manager'?'var(--green)':u.role==='supervisor_agent'?'#ff8c00':'var(--purple)';
  const canEdit      = session.role === 'master' || (session.role === 'admin' && u.role !== 'master' && (u.orgAdminId === session.id || u.id === session.id));
  const isMasterViewing = session.role === 'master' || session._isMaster || session.role === 'admin';
  const viewAsBtn    = isMasterViewing && u.role !== 'master' && !sessionStorage.getItem('gew_preview_session')
    ? `<button onclick="openPreviewAs('${u.id}')" title="Ver como este usuario" style="color:#a78bfa">👁</button>` : '';
  const summaryBtn   = isMasterViewing && u.role !== 'master' ? `<button onclick="showAgentSummary('${u.id}')" title="Ver resumen del agente" style="color:#00c875">📊</button>` : '';
  const editBtn      = canEdit && u.role !== 'master' ? `<button onclick="openUserModal('${u.id}')" title="Editar">✏️</button>` : '';
  const inactiveBtn  = canEdit && u.role !== 'master' && u.id !== session.id
    ? (u.inactive
        ? `<button onclick="toggleUserInactive('${u.id}')" title="Reactivar usuario" style="color:#4caf50">▶</button>`
        : `<button onclick="toggleUserInactive('${u.id}')" title="Marcar como inactivo" style="color:#ff9800">⏸</button>`)
    : '';
  const delBtn       = canEdit && u.role !== 'master' && u.id !== session.id ? `<button class="del" onclick="deleteUser('${u.id}')" title="Eliminar">🗑</button>` : '';
  const canDrag      = canEdit && u.role !== 'master' && u.role !== 'admin' && !u.inactive;
  const dragAttrs    = canDrag ? `draggable="true" ondragstart="orgDragStart(event,'${u.id}')" ondragend="orgDragEnd(event)"` : '';
  const dropAttrs    = canEdit && u.role !== 'master' && u.role !== 'agent' ? `ondragover="orgDragOver(event,'${u.id}')" ondragleave="orgDragLeave(event)" ondrop="orgDrop(event,'${u.id}')"` : '';
  const inactiveCls  = u.inactive ? ' org-node-inactive' : '';
  const inactiveBadge = u.inactive ? `<span class="badge-inactive">INACTIVO</span>` : '';
  const isMasterSelf = session.role === 'master' || session._isMaster;
  const userCodeBadge = isMasterSelf && u.userCode
    ? `<span style="font-size:9px;font-weight:700;color:var(--text2);background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:5px;padding:1px 6px;letter-spacing:.5px;margin-left:4px">${u.userCode}</span>`
    : '';
  const inactiveInfo = u.inactive && isMasterSelf && u._inactivatedBy
    ? (() => {
        const d = u._inactivatedAt ? new Date(u._inactivatedAt).toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric'}) : '';
        return `<div style="font-size:9px;color:#f59e0b;margin-top:2px">⏸ por ${esc(u._inactivatedBy)}${d?' · '+d:''}</div>`;
      })()
    : '';
  const addableRoles = (canEdit && u.role !== 'master') ? _addableRoles(u.role) : [];
  const admIdForAdd  = u.role === 'admin' ? u.id : (u.orgAdminId || '');
  const addSubItems  = addableRoles.map(([role, label]) =>
    `<button onclick="document.querySelectorAll('.node-menu.open').forEach(m=>m.classList.remove('open'));openUserModal(null,'${admIdForAdd}','${role}')"><span class="mi">＋</span> ${label}</button>`
  ).join('');
  const addBtn = addableRoles.length ? `<div class="node-sub-wrap"><button class="node-sub-trigger" onclick="toggleNodeSubMenu(event,this)"><span class="mi">➕</span> Agregar... <span class="sub-arr">▸</span></button><div class="node-sub-menu">${addSubItems}</div></div>` : '';

  const hasMenu = summaryBtn || viewAsBtn || editBtn || inactiveBtn || delBtn || addBtn;
  const menuItems = [
    summaryBtn   ? `<button onclick="showAgentSummary('${u.id}')"><span class="mi">📊</span> Ver resumen</button>` : '',
    viewAsBtn    ? `<button onclick="openPreviewAs('${u.id}')"><span class="mi">👁</span> Ver como este usuario</button>` : '',
    editBtn      ? `<button onclick="openUserModal('${u.id}')"><span class="mi">✏️</span> Editar usuario</button>` : '',
    addBtn,
    inactiveBtn  ? (u.inactive
        ? `<button onclick="toggleUserInactive('${u.id}')"><span class="mi">▶️</span> Reactivar usuario</button>`
        : `<button onclick="toggleUserInactive('${u.id}')"><span class="mi">⏸</span> Pausar usuario</button>`) : '',
    delBtn       ? `<div class="node-menu-sep"></div><button class="danger" onclick="deleteUser('${u.id}')"><span class="mi">🗑</span> Eliminar usuario</button>` : '',
  ].filter(Boolean).join('');
  const menuHtml = hasMenu ? `<div class="node-menu-wrap">
    <button class="node-menu-btn" onclick="toggleOrgMenu(event,this)">···</button>
    <div class="node-menu">${menuItems}</div>
  </div>` : '';
  return `<div class="${nodeClass}${inactiveCls}" data-uid="${u.id}" ${dragAttrs} ${dropAttrs}>
    <div style="width:37px;height:37px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.3)">${initials}</div>
    <div class="org-node-info">
      <div class="org-node-name">${esc(u.name)}${inactiveBadge}${userCodeBadge}</div>
      <div class="org-node-email">${esc(u.email)}</div>
      <div style="display:flex;align-items:center;gap:5px;margin-top:3px">
        <span class="role-badge ${roleCls}">${roleLabel}</span>
        ${menuHtml}
      </div>
      ${inactiveInfo}
    </div>
  </div>`;
}

// ── Horizontal org chart helpers ──────────────────────────────
function hOrgWrap(nodeHtml, childrenHtml) {
  if (!childrenHtml) return `<div class="org-h-group">${nodeHtml}</div>`;
  return `<div class="org-h-group">
    ${nodeHtml}
    <div class="org-h-hline"></div>
    <div class="org-h-vbar"></div>
    <div class="org-h-children">${childrenHtml}</div>
  </div>`;
}
function hChild(subtreeHtml) {
  return `<div class="org-h-child"><div class="org-h-child-hline"></div>${subtreeHtml}</div>`;
}
function hAddBtn(admId, label) {
  return `<div class="org-h-child"><div class="org-h-child-hline"></div><button class="org-tree-add" onclick="openUserModal(null,'${admId}')">${label}</button></div>`;
}

function buildManagerBranch(mgr, allUsers, admId, session, renderedIds = new Set()) {
  const allAgents    = allUsers.filter(u => u.role === 'agent');
  const supervisors  = allUsers.filter(u => u.role === 'supervisor_agent' && u.orgManagerId === mgr.id);
  const directAgents = allAgents.filter(u => u.orgManagerId === mgr.id && !u.orgSupervisorId);
  let children = '';

  supervisors.forEach(sup => {
    renderedIds.add(sup.id);
    const supAgents = allAgents.filter(u => u.orgSupervisorId === sup.id);
    let supChildren = supAgents.map(ag => { renderedIds.add(ag.id); return hChild(hOrgWrap(orgNode(ag, session), '')); }).join('');
    supChildren += hAddBtn(admId, '＋ Agente');
    children += hChild(hOrgWrap(orgNode(sup, session), supChildren));
  });
  directAgents.forEach(ag => { renderedIds.add(ag.id); children += hChild(hOrgWrap(orgNode(ag, session), '')); });
  children += hAddBtn(admId, '＋ Agente');
  return hOrgWrap(orgNode(mgr, session), children);
}

function buildOrgBranch(admId, allUsers, session) {
  const masterMgrs  = allUsers.filter(u => u.role === 'master_manager' && u.orgAdminId === admId);
  const managers    = allUsers.filter(u => u.role === 'manager'        && u.orgAdminId === admId);
  const supervisors = allUsers.filter(u => u.role === 'supervisor_agent' && u.orgAdminId === admId);
  const agents      = allUsers.filter(u => u.role === 'agent'          && u.orgAdminId === admId);
  const callers     = allUsers.filter(u => u.role === 'caller'         && u.orgAdminId === admId);
  const renderedIds = new Set();
  let children = '';

  // Callers appear as a flat group at the top of the org
  callers.forEach(c => {
    renderedIds.add(c.id);
    children += hChild(hOrgWrap(orgNode(c, session), ''));
  });

  masterMgrs.forEach(mm => {
    renderedIds.add(mm.id);
    const mmManagers     = managers.filter(u => u.orgMasterManagerId === mm.id);
    const mmDirectSups   = supervisors.filter(u => u.orgMasterManagerId === mm.id && !u.orgManagerId);
    const mmDirectAgents = agents.filter(u => u.orgMasterManagerId === mm.id && !u.orgManagerId && !u.orgSupervisorId);
    let mmChildren = mmManagers.map(mgr => {
      renderedIds.add(mgr.id);
      return hChild(buildManagerBranch(mgr, allUsers, admId, session, renderedIds));
    }).join('');
    mmDirectSups.forEach(sup => {
      renderedIds.add(sup.id);
      const supAgents = agents.filter(ag => ag.orgSupervisorId === sup.id);
      let supChildren = supAgents.map(ag => { renderedIds.add(ag.id); return hChild(hOrgWrap(orgNode(ag, session), '')); }).join('');
      supChildren += hAddBtn(admId, '＋ Agente');
      mmChildren += hChild(hOrgWrap(orgNode(sup, session), supChildren));
    });
    mmDirectAgents.forEach(ag => { renderedIds.add(ag.id); mmChildren += hChild(hOrgWrap(orgNode(ag, session), '')); });
    mmChildren += hAddBtn(admId, '＋ Agregar');
    children += hChild(hOrgWrap(orgNode(mm, session), mmChildren));
  });

  managers.filter(u => !u.orgMasterManagerId).forEach(mgr => {
    renderedIds.add(mgr.id);
    children += hChild(buildManagerBranch(mgr, allUsers, admId, session, renderedIds));
  });

  // Any supervisor not yet placed (no manager, or broken manager reference)
  supervisors.filter(sup => !renderedIds.has(sup.id)).forEach(sup => {
    renderedIds.add(sup.id);
    const supAgents = agents.filter(ag => ag.orgSupervisorId === sup.id);
    let supChildren = supAgents.map(ag => { renderedIds.add(ag.id); return hChild(hOrgWrap(orgNode(ag, session), '')); }).join('');
    supChildren += hAddBtn(admId, '＋ Agente');
    children += hChild(hOrgWrap(orgNode(sup, session), supChildren));
  });

  agents.filter(u => !u.orgManagerId && !u.orgMasterManagerId && !u.orgSupervisorId).forEach(ag => {
    renderedIds.add(ag.id);
    children += hChild(hOrgWrap(orgNode(ag, session), ''));
  });

  // Usuarios de este admin que no aparecieron en el árbol (referencias rotas)
  const orphans = [...supervisors, ...managers, ...agents].filter(u => !renderedIds.has(u.id));
  if (orphans.length) {
    // Valid drop targets for orphans: managers and supervisors of this admin
    const validTargets = allUsers.filter(u =>
      u.orgAdminId === admId && (u.role === 'manager' || u.role === 'supervisor_agent' || u.role === 'master_manager')
    );
    const orphanHtml = orphans.map(u => {
      const targetOpts = validTargets
        .filter(t => t.id !== u.id)
        .map(t => `<option value="${t.id}">${esc(t.name)} (${t.role==='manager'?'GA':t.role==='master_manager'?'MGA':'SA'})</option>`)
        .join('');
      const assignBtn = targetOpts
        ? `<div style="margin-top:6px;display:flex;gap:4px;align-items:center">
            <select id="orphan-sel-${u.id}" style="flex:1;background:var(--bg2);border:1px solid rgba(253,171,61,.4);color:var(--text);padding:3px 6px;border-radius:6px;font-size:11px">
              <option value="">— Asignar a... —</option>
              ${targetOpts}
            </select>
            <button onclick="assignOrphanUser('${u.id}')" style="background:rgba(253,171,61,.2);color:#fdab3d;border:1px solid rgba(253,171,61,.4);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">✓</button>
          </div>`
        : '';
      return `<div style="margin-bottom:8px">${hOrgWrap(orgNode(u, session), '')}${assignBtn}</div>`;
    }).join('');

    children += `<div class="org-h-child"><div class="org-h-child-hline"></div>
      <div style="background:rgba(253,171,61,.08);border:1px dashed rgba(253,171,61,.3);border-radius:8px;padding:8px 12px;min-width:200px">
        <div style="font-size:10px;color:var(--yellow);font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">⚠ Sin asignar</div>
        ${orphanHtml}
      </div>
    </div>`;
  }

  children += hAddBtn(admId, '＋ Agregar usuario');
  return children;
}

function renderUsersGrid() {
  const allUsers = loadUsers();
  const grid     = document.getElementById('users-grid');
  if (!grid) return;
  const session  = getSession();
  if (!session) return;

  const masterUser = { id: MASTER_USER.id, name: MASTER_USER.name, email: MASTER_USER.email, role: 'master' };

  const legend = `<div class="org-legend">
    <div class="org-legend-item"><div class="org-legend-dot" style="background:var(--accent)"></div>Administrador</div>
    <div class="org-legend-item"><div class="org-legend-dot" style="background:#00b7c3"></div>MGA</div>
    <div class="org-legend-item"><div class="org-legend-dot" style="background:var(--green)"></div>GA</div>
    <div class="org-legend-item"><div class="org-legend-dot" style="background:#ff8c00"></div>SA</div>
    <div class="org-legend-item"><div class="org-legend-dot" style="background:var(--purple)"></div>Agente</div>
    <div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);background:rgba(255,255,255,.04);border:1px dashed var(--border);border-radius:8px;padding:5px 12px">
      <span style="font-size:14px">↕️</span> Para reasignar a alguien, arrástralo hasta el nombre del manager con quien trabajará.
    </div>
  </div>`;

  if (session.role === 'master') {
    const admins = allUsers.filter(u => u.role === 'admin');
    let adminChildren = admins.map(adm => {
      const branch = buildOrgBranch(adm.id, allUsers, session);
      return hChild(hOrgWrap(orgNode(adm, session), branch));
    }).join('');
    adminChildren += `<div class="org-h-child"><div class="org-h-child-hline"></div><button class="org-tree-add" onclick="openUserModal(null,null,'admin')">＋ Agregar administrador</button></div>`;

    const ungrouped = allUsers.filter(u => u.role === 'agent' && !u.orgAdminId);
    ungrouped.forEach(u => { adminChildren += hChild(hOrgWrap(orgNode(u, session), '')); });

    grid.innerHTML = legend + `<div class="org-h-scroll">${hOrgWrap(orgNode(masterUser, session), adminChildren)}</div>`;

  } else if (session.role === 'admin') {
    const me = allUsers.find(u => u.id === session.id) || { ...session };
    const branch = buildOrgBranch(session.id, allUsers, session);
    grid.innerHTML = legend + `<div class="org-h-scroll">${hOrgWrap(orgNode(me, session), branch)}</div>`;
  }

  // Append deleted users history
  _renderDeletedUsersHistory(grid, session);
}

// ── Org chart drag & drop ─────────────────────────────────
let _orgDragId = null;

function toggleOrgMenu(e, btn) {
  e.stopPropagation();
  const menu = btn.nextElementSibling;
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.node-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.node-sub-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.node-sub-trigger.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}
function toggleNodeSubMenu(e, btn) {
  e.stopPropagation();
  const sub = btn.nextElementSibling;
  const isOpen = sub.classList.contains('open');
  document.querySelectorAll('.node-sub-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.node-sub-trigger.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) { sub.classList.add('open'); btn.classList.add('open'); }
}
document.addEventListener('click', () => {
  document.querySelectorAll('.node-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.node-sub-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.node-sub-trigger.open').forEach(m => m.classList.remove('open'));
});

function _addableRoles(role) {
  switch(role) {
    case 'admin':            return [['master_manager','MGA'],['manager','GA'],['supervisor_agent','SA'],['agent','Agente']];
    case 'master_manager':  return [['manager','GA'],['supervisor_agent','SA'],['agent','Agente']];
    case 'manager':         return [['supervisor_agent','SA'],['agent','Agente']];
    case 'supervisor_agent': return [['agent','Agente']];
    default: return [];
  }
}

function orgDragStart(e, userId) {
  _orgDragId = userId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const el = e.target.closest('.org-node'); if (el) el.classList.add('dragging'); }, 0);
}

function orgDragEnd(e) {
  _orgDragId = null;
  const el = e.target.closest('.org-node'); if (el) el.classList.remove('dragging');
  document.querySelectorAll('.org-node.drop-target').forEach(n => n.classList.remove('drop-target'));
}

function _orgIsValidDrop(dragged, target) {
  if (['master','admin'].includes(target.role)) return false;
  if (target.role === 'agent') return false;
  if (dragged.role === target.role) return false;
  // MGA can only receive supervisor_agent or agent directly
  if (target.role === 'master_manager' && !['supervisor_agent','agent'].includes(dragged.role)) return false;
  // supervisor_agent can receive only agents
  if (target.role === 'supervisor_agent' && dragged.role !== 'agent') return false;
  return true;
}

function orgDragOver(e, targetId) {
  if (!_orgDragId || _orgDragId === targetId) return;
  const users = loadUsers();
  const dragged = users.find(u => u.id === _orgDragId);
  const target  = users.find(u => u.id === targetId);
  if (!dragged || !target || !_orgIsValidDrop(dragged, target)) return;
  e.preventDefault();
  const el = e.currentTarget; if (el) el.classList.add('drop-target');
}

function orgDragLeave(e) {
  const el = e.currentTarget; if (el) el.classList.remove('drop-target');
}

function _orgParentName(u, users) {
  if (u.orgSupervisorId)   { const p = users.find(x=>x.id===u.orgSupervisorId);   return p ? p.name : 'Sin asignar'; }
  if (u.orgManagerId)      { const p = users.find(x=>x.id===u.orgManagerId);      return p ? p.name : 'Sin asignar'; }
  if (u.orgMasterManagerId){ const p = users.find(x=>x.id===u.orgMasterManagerId); return p ? p.name : 'Sin asignar'; }
  if (u.orgAdminId)        { const p = users.find(x=>x.id===u.orgAdminId);        return p ? p.name : 'Sin asignar'; }
  return 'Sin asignar';
}

async function orgDrop(e, targetId) {
  e.preventDefault();
  const el = e.currentTarget; if (el) el.classList.remove('drop-target');
  if (!_orgDragId || _orgDragId === targetId) return;
  const users   = loadUsers();
  const dragged = users.find(u => u.id === _orgDragId);
  const target  = users.find(u => u.id === targetId);
  _orgDragId = null;
  if (!dragged || !target || !_orgIsValidDrop(dragged, target)) return;

  const fromName = _orgParentName(dragged, users);

  const idx = users.findIndex(u => u.id === dragged.id);
  const u = users[idx];
  // Clear existing org assignments
  delete u.orgSupervisorId; delete u.orgManagerId; delete u.orgMasterManagerId;

  if (target.role === 'master_manager') {
    u.orgMasterManagerId = target.id;
    u.orgManagerId       = null;
    u.orgSupervisorId    = null;
    u.orgAdminId         = target.orgAdminId || null;
  } else if (target.role === 'manager') {
    u.orgManagerId       = target.id;
    u.orgMasterManagerId = target.orgMasterManagerId || null;
    u.orgSupervisorId    = null;
    u.orgAdminId         = target.orgAdminId || null;
  } else if (target.role === 'supervisor_agent') {
    u.orgSupervisorId    = target.id;
    u.orgManagerId       = target.orgManagerId       || null;
    u.orgMasterManagerId = target.orgMasterManagerId || null;
    u.orgAdminId         = target.orgAdminId         || null;
  }

  await saveUsers(users);
  renderUsersGrid();
  showToast(`${dragged.name} movido a ${target.name} ✓`, 'success');
}

async function assignOrphanUser(userId) {
  const sel = document.getElementById('orphan-sel-' + userId);
  if (!sel || !sel.value) { showToast('Selecciona un manager primero'); return; }
  const users    = loadUsers();
  const idx      = users.findIndex(u => u.id === userId);
  const targetIdx = users.findIndex(u => u.id === sel.value);
  if (idx === -1 || targetIdx === -1) return;
  const u      = users[idx];
  const target = users[targetIdx];
  delete u.orgSupervisorId; delete u.orgManagerId; delete u.orgMasterManagerId;
  if (target.role === 'supervisor_agent') {
    u.orgSupervisorId    = target.id;
    u.orgManagerId       = null;
    u.orgMasterManagerId = null;
    u.orgAdminId         = target.orgAdminId || null;
  } else if (target.role === 'manager') {
    u.orgManagerId       = target.id;
    u.orgMasterManagerId = null;
    u.orgAdminId         = target.orgAdminId || null;
  } else if (target.role === 'master_manager') {
    u.orgMasterManagerId = target.id;
    u.orgAdminId         = target.orgAdminId || null;
  }
  await saveUsers(users);
  renderUsersGrid();
  showToast(`${u.name} asignado a ${target.name} ✓`, 'success');
}

function _renderDeletedUsersHistory(grid, session) {
  const allDel = loadDeletedUsers();
  const visible = session.role === 'master'
    ? allDel
    : allDel.filter(u => u.orgAdminId === session.id || u.id === session.id);

  if (visible.length === 0) return;

  const roleLabel = r => ({ master:'Desarrollador', admin:'Administrador', master_manager:'MGA', manager:'GA', supervisor_agent:'SA', agent:'Agente', caller:'Caller' }[r] || r);
  const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  const cards = visible.map(u => {
    const initials = getInitials(u.name);
    return `<div class="del-user-card">
      <div class="del-user-avatar">${initials}</div>
      <div class="del-user-info">
        <div class="del-user-name">${esc(u.name)}<span class="del-user-badge">Eliminado</span></div>
        <div class="del-user-email">${esc(u.email)}</div>
        <div class="del-user-meta">${roleLabel(u.role)} · Eliminado por: ${esc(u._deletedBy||'—')} · ${fmtDate(u._deletedAt)}</div>
      </div>
    </div>`;
  }).join('');

  const canClear = session.role === 'master' || session.role === 'admin';
  const section = document.createElement('div');
  section.className = 'del-users-section';
  section.innerHTML = `
    <div class="del-users-section-hdr">
      <span>Historial de usuarios eliminados</span>
      <em>${visible.length} registro${visible.length !== 1 ? 's' : ''}</em>
      ${canClear ? `<button onclick="clearDeletedUsersHistory()" style="margin-left:10px;padding:3px 10px;background:rgba(226,68,92,.1);border:1px solid rgba(226,68,92,.25);color:var(--red);border-radius:6px;font-size:11px;cursor:pointer;font-family:var(--font);">🗑 Limpiar historial</button>` : ''}
    </div>
    ${cards}`;
  grid.appendChild(section);
}

async function clearDeletedUsersHistory() {
  if (!confirm('¿Limpiar todo el historial de usuarios eliminados? Esta acción no se puede deshacer.')) return;
  await saveDeletedUsers([]);
  renderUsersGrid();
  showToast('Historial limpiado ✓', 'success');
}

function onRolChange() {
  const role     = document.getElementById('u-rol').value;
  const session  = getSession();
  const orgWrap  = document.getElementById('u-org-wrap');
  const mmWrap   = document.getElementById('u-masterManager-wrap');
  const mgrWrap  = document.getElementById('u-manager-wrap');
  const isMasterSess = session && session.role === 'master';
  const isAdminSess  = session && session.role === 'admin';

  // "Pertenece a Administrador" — only when master is creating non-admin users
  orgWrap.style.display = (isMasterSess && role !== 'admin') ? '' : 'none';

  const users   = loadUsers();
  const orgId   = isAdminSess ? session.id : (document.getElementById('u-org').value || null);
  const editingUser = editingUserId ? users.find(u => u.id === editingUserId) : null;

  const supWrap = document.getElementById('u-supervisor-wrap');

  // Caller: only needs admin org, no hierarchy dropdowns
  if (role === 'caller') {
    mmWrap.style.display = 'none';
    mgrWrap.style.display = 'none';
    if (document.getElementById('u-supervisor-wrap')) document.getElementById('u-supervisor-wrap').style.display = 'none';
    return;
  }

  // "Asignar a MGA" — for manager, supervisor_agent and agent (optional)
  if (role === 'manager' || role === 'agent' || role === 'supervisor_agent') {
    mmWrap.style.display = '';
    const masterManagers = users.filter(u => u.role === 'master_manager' && (!orgId || u.orgAdminId === orgId));
    document.getElementById('u-masterManager').innerHTML =
      `<option value="">— Sin MGA (directo al admin) —</option>` +
      masterManagers.map(m => `<option value="${m.id}"${editingUser && editingUser.orgMasterManagerId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  } else {
    mmWrap.style.display = 'none';
  }

  // "Asignar a GA" — for supervisor_agent and agent (optional, filtered by selected MGA)
  if (role === 'agent' || role === 'supervisor_agent') {
    mgrWrap.style.display = '';
    _populateManagerDropdown(users, orgId, editingUser);
  } else {
    mgrWrap.style.display = 'none';
  }

  // "Asignar a SA" — only for agent (optional)
  if (role === 'agent') {
    if (supWrap) {
      supWrap.style.display = '';
      _populateSupervisorDropdown(users, orgId, editingUser);
    }
  } else {
    if (supWrap) supWrap.style.display = 'none';
  }
}

function _populateManagerDropdown(users, orgId, editingUser) {
  if (!users) users = loadUsers();
  if (!orgId) {
    const session = getSession();
    orgId = session && session.role === 'admin' ? session.id : (document.getElementById('u-org') ? document.getElementById('u-org').value || null : null);
  }
  const mmId = document.getElementById('u-masterManager') ? (document.getElementById('u-masterManager').value || null) : null;
  const managers = users.filter(u =>
    u.role === 'manager' &&
    (!orgId || u.orgAdminId === orgId) &&
    (!mmId  || u.orgMasterManagerId === mmId)
  );
  document.getElementById('u-manager').innerHTML =
    `<option value="">— Sin GA (directo) —</option>` +
    managers.map(m => `<option value="${m.id}"${editingUser && editingUser.orgManagerId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
}

function _populateSupervisorDropdown(users, orgId, editingUser) {
  if (!users) users = loadUsers();
  if (!orgId) {
    const session = getSession();
    orgId = session && session.role === 'admin' ? session.id : (document.getElementById('u-org') ? document.getElementById('u-org').value || null : null);
  }
  const mmId  = document.getElementById('u-masterManager') ? (document.getElementById('u-masterManager').value || null) : null;
  const mgrId = document.getElementById('u-manager') ? (document.getElementById('u-manager').value || null) : null;
  const supEl = document.getElementById('u-supervisor');
  if (!supEl) return;
  const supervisors = users.filter(u =>
    u.role === 'supervisor_agent' &&
    (!orgId || u.orgAdminId === orgId) &&
    (!mmId  || u.orgMasterManagerId === mmId) &&
    (!mgrId || u.orgManagerId === mgrId)
  );
  supEl.innerHTML =
    `<option value="">— Sin SA (directo) —</option>` +
    supervisors.map(s => `<option value="${s.id}"${editingUser && editingUser.orgSupervisorId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
}

function onMasterManagerChange() {
  const role = document.getElementById('u-rol').value;
  if (role !== 'agent' && role !== 'supervisor_agent') return;
  const users = loadUsers();
  const session = getSession();
  const orgId = session && session.role === 'admin' ? session.id : (document.getElementById('u-org') ? document.getElementById('u-org').value || null : null);
  const editingUser = editingUserId ? users.find(u => u.id === editingUserId) : null;
  _populateManagerDropdown(users, orgId, editingUser);
  if (role === 'agent') _populateSupervisorDropdown(users, orgId, editingUser);
}

function openUserModal(userId, presetOrgId, presetRole) {
  editingUserId = userId || null;
  const users   = loadUsers();
  const session = getSession();
  const u       = userId ? users.find(x => x.id === userId) : null;

  document.getElementById('user-modal-title').textContent = u ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('u-nombre').value = u ? u.name  : '';
  document.getElementById('u-email').value  = u ? u.email : '';
  document.getElementById('u-pass').value   = '';
  document.getElementById('u-force-pass').checked = u ? !!u.mustChangePassword : false;
  document.getElementById('u-email-warning').style.display = 'none';
  if (u) {
    document.getElementById('u-pass').placeholder = 'Dejar vacío para no cambiar';
    document.getElementById('u-pass-label').textContent = 'Contraseña';
    // Watch email changes to show warning
    const emailInput = document.getElementById('u-email');
    emailInput.dataset.original = u.email;
    emailInput.oninput = function() {
      const changed = this.value.trim().toLowerCase() !== (this.dataset.original || '').toLowerCase();
      document.getElementById('u-email-warning').style.display = changed ? '' : 'none';
    };
  } else {
    document.getElementById('u-pass').placeholder = 'Mínimo 6 caracteres';
    document.getElementById('u-pass-label').textContent = 'Contraseña *';
    document.getElementById('u-email').oninput = null;
  }

  const rolWrap = document.getElementById('u-rol-wrap');
  const orgWrap = document.getElementById('u-org-wrap');

  if (session && session.role === 'master') {
    rolWrap.style.display = '';
    const role = u ? u.role : (presetRole || 'agent');
    document.getElementById('u-rol').value = role;
    const admins = users.filter(x => x.role === 'admin');
    const orgSel = document.getElementById('u-org');
    orgSel.innerHTML = `<option value="">— Sin organización —</option>` +
      admins.map(a => `<option value="${a.id}"${(u ? u.orgAdminId : presetOrgId) === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  } else if (session && session.role === 'admin') {
    // admin: can create agents, managers, and master_managers in their org
    rolWrap.style.display = '';
    const rolSel = document.getElementById('u-rol');
    rolSel.innerHTML = `<option value="agent">Agente</option><option value="caller">Caller</option><option value="supervisor_agent">SA - Supervisor Agent</option><option value="manager">GA - General Agent</option><option value="master_manager">MGA - Master General Agent</option>`;
    rolSel.value = u ? u.role : (presetRole || 'agent');
    orgWrap.style.display = 'none';
  }
  onRolChange();

  document.getElementById('user-modal-overlay').classList.add('open');
}

function closeUserModal() {
  document.getElementById('user-modal-overlay').classList.remove('open');
  editingUserId = null;
}

async function saveUser() {
  const name    = document.getElementById('u-nombre').value.trim();
  const email   = document.getElementById('u-email').value.trim().toLowerCase();
  const pass    = document.getElementById('u-pass').value;
  const session = getSession();

  if (!session) { showToast('Sesión expirada. Por favor inicia sesión de nuevo.', 'error'); return; }

  let role = 'agent';
  let orgAdminId         = null;
  let orgManagerId       = null;
  let orgMasterManagerId = null;
  let orgSupervisorId    = null;

  if (session.role === 'master') {
    role = document.getElementById('u-rol').value;
    if (role !== 'admin') {
      orgAdminId = document.getElementById('u-org') ? (document.getElementById('u-org').value || null) : null;
    }
    if (role === 'manager' || role === 'agent' || role === 'supervisor_agent') {
      orgMasterManagerId = document.getElementById('u-masterManager') ? (document.getElementById('u-masterManager').value || null) : null;
    }
    if (role === 'agent' || role === 'supervisor_agent') {
      orgManagerId = document.getElementById('u-manager') ? (document.getElementById('u-manager').value || null) : null;
    }
    if (role === 'agent') {
      orgSupervisorId = document.getElementById('u-supervisor') ? (document.getElementById('u-supervisor').value || null) : null;
    }
    // caller: uses orgAdminId set above, no hierarchy assignments needed
  } else if (session.role === 'admin') {
    role       = document.getElementById('u-rol') ? document.getElementById('u-rol').value : 'agent';
    orgAdminId = session.id;
    // Solo leer los dropdowns que están visibles — si están ocultos, preservar el valor original del usuario
    const prevUser = editingUserId ? loadUsers().find(u => u.id === editingUserId) : null;
    const mmWrapVisible  = document.getElementById('u-masterManager-wrap')?.style.display !== 'none';
    const mgrWrapVisible = document.getElementById('u-manager-wrap')?.style.display !== 'none';
    const supWrapVisible = document.getElementById('u-supervisor-wrap')?.style.display !== 'none';
    if (role === 'manager' || role === 'agent' || role === 'supervisor_agent') {
      orgMasterManagerId = mmWrapVisible
        ? (document.getElementById('u-masterManager')?.value || null)
        : (prevUser?.orgMasterManagerId ?? null);
    }
    if (role === 'agent' || role === 'supervisor_agent') {
      orgManagerId = mgrWrapVisible
        ? (document.getElementById('u-manager')?.value || null)
        : (prevUser?.orgManagerId ?? null);
    }
    if (role === 'agent') {
      orgSupervisorId = supWrapVisible
        ? (document.getElementById('u-supervisor')?.value || null)
        : (prevUser?.orgSupervisorId ?? null);
    }
    // caller: belongs to admin org, no hierarchy
  }

  if (!name)  { showToast('El nombre es requerido', 'error'); return; }
  if (!email) { showToast('El email es requerido', 'error'); return; }

  const users = loadUsers();

  if (editingUserId) {
    const idx = users.findIndex(u => u.id === editingUserId);
    if (idx === -1) return;
    const dup = users.find(u => u.email === email && u.id !== editingUserId);
    if (dup) { showToast('Ese email ya está registrado', 'error'); return; }

    const prev = users[idx];
    const isReassign = prev.orgAdminId !== orgAdminId ||
                       prev.orgMasterManagerId !== orgMasterManagerId ||
                       prev.orgManagerId !== orgManagerId ||
                       prev.orgSupervisorId !== orgSupervisorId;
    const isEmailChange = prev.email.toLowerCase() !== email.toLowerCase();
    const forcePass = document.getElementById('u-force-pass') ? document.getElementById('u-force-pass').checked : false;

    const applyEdit = async () => {
      const freshUsers = loadUsers();
      const i = freshUsers.findIndex(u => u.id === editingUserId);
      if (i === -1) return;
      const oldName = freshUsers[i].name;
      freshUsers[i].name               = name;
      freshUsers[i].email              = email;
      freshUsers[i].role               = role;
      freshUsers[i].orgAdminId         = orgAdminId;
      freshUsers[i].orgMasterManagerId = orgMasterManagerId;
      freshUsers[i].orgManagerId       = orgManagerId;
      freshUsers[i].orgSupervisorId    = orgSupervisorId;
      freshUsers[i].mustChangePassword = forcePass;
      if (pass && pass.length >= 6) freshUsers[i].password = await sha256(pass);
      if (session && session.id === editingUserId) {
        setSession({ ...session, name, email, role });
        renderTopbarUser({ ...session, name, email, role });
      }
      await saveUsers(freshUsers);

      // Si el nombre cambió, actualizar todos los leads asignados a ese usuario
      if (oldName !== name) {
        let leadsUpdated = 0;
        for (const board of BOARDS) {
          const bLeads = loadLeads(board.id);
          let changed = false;
          bLeads.forEach(l => { if (l.asignado === oldName) { l.asignado = name; changed = true; leadsUpdated++; } });
          if (changed) await saveLeads(board.id, bLeads);
        }
        // También leads eliminados (papelera)
        const deleted = loadDeletedLeads();
        let delChanged = false;
        deleted.forEach(l => { if (l.asignado === oldName) { l.asignado = name; delChanged = true; } });
        if (delChanged) await saveDeletedLeads(deleted);
        if (leadsUpdated > 0) showToast(`Nombre actualizado · ${leadsUpdated} lead${leadsUpdated !== 1 ? 's' : ''} reasignados ✓`, 'success');
      }

      logActivity('user_edited', `Usuario editado: ${name}`, `Rol: ${role}${isEmailChange ? ' · Email cambiado' : ''}${forcePass ? ' · Cambio de clave requerido' : ''}`);
      closeUserModal();
      showToast('Usuario actualizado ✓', 'success');
      try { renderUsersGrid(); } catch(e) {}
    };

    if (pass && pass.length > 0 && pass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

    if (isEmailChange) {
      if (!confirm(`⚠️ Estás cambiando el correo de "${prev.name}" de:\n\n${prev.email} → ${email}\n\nEsto afectará su acceso al sistema. El usuario deberá usar el nuevo correo para ingresar.\n\n¿Confirmas el cambio?`)) return;
    }

    if (isReassign) {
      const userName = esc(prev.name);
      requirePasswordForUserAction(
        '🔀 Mover Usuario',
        `Estás cambiando la línea de reporte de <strong>${userName}</strong>.<br>Confirma con tu contraseña para continuar.`,
        'Confirmar movimiento',
        applyEdit
      );
      return;
    }

    await applyEdit();

  } else {
    if (!pass || pass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    if (email === MASTER_USER.email.toLowerCase()) { showToast('Ese email no está disponible', 'error'); return; }
    if (users.find(u => u.email === email)) { showToast('Ese email ya está registrado', 'error'); return; }
    if (users.find(u => u.name.toLowerCase() === name.toLowerCase()) || name.toLowerCase() === MASTER_USER.name.toLowerCase()) {
      showToast('Ya existe un usuario con ese nombre. Los nombres deben ser únicos.', 'error'); return;
    }
    users.push({ id: uid(), name, email, password: await sha256(pass), role, orgAdminId, orgMasterManagerId, orgManagerId, orgSupervisorId, createdAt: today(), userCode: _nextUserCode(users) });
    await saveUsers(users);
    logActivity('user_created', `Usuario creado: ${name}`, `Email: ${email} · Rol: ${role}`);
    closeUserModal();
    showToast('Usuario creado ✓', 'success');
    try { renderUsersGrid(); } catch(e) {}
  }
}

// ── Access Request (self-registration) ────────────────
const PENDING_KEY = 'gew_pending_users';

function loadPendingUsers() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; }
}
async function savePendingUsers(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  await supaSync(PENDING_KEY, JSON.stringify(list));
}

function openRegisterForm() {
  _googleRegisterMode    = false;
  _googleRegisterPayload = null;
  const orgEl = document.getElementById('reg-hero-org-name');
  if (orgEl) orgEl.textContent = loadAppName();
  document.getElementById('reg-name').value        = '';
  document.getElementById('reg-email').value       = '';
  document.getElementById('reg-pass').value        = '';
  document.getElementById('reg-agent-num').value   = '';
  document.getElementById('reg-phone').value       = '';
  document.getElementById('reg-city').value        = '';
  document.getElementById('reg-state').value       = '';
  document.getElementById('reg-error').textContent = '';
  document.getElementById('reg-name').readOnly     = false;
  document.getElementById('reg-email').readOnly    = false;
  document.getElementById('reg-google-info').style.display = 'none';
  document.getElementById('reg-pass').placeholder  = 'Mínimo 6 caracteres';
  // Reset terms checkbox and submit button
  const regTerms = document.getElementById('reg-terms-check');
  const regBtn   = document.getElementById('reg-submit-btn');
  if (regTerms) regTerms.checked = false;
  if (regBtn)   { regBtn.disabled = true; regBtn.style.opacity = '.45'; regBtn.style.cursor = 'not-allowed'; }
  document.getElementById('register-overlay').classList.add('open');
  initGoogleRegisterButton();
}
function closeRegisterForm() {
  _googleRegisterMode    = false;
  _googleRegisterPayload = null;
  document.getElementById('register-overlay').classList.remove('open');
}

async function submitRegisterRequest() {
  const name      = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass      = document.getElementById('reg-pass').value;
  const agentNum  = document.getElementById('reg-agent-num').value.trim();
  const phone     = document.getElementById('reg-phone').value.trim();
  const city      = document.getElementById('reg-city').value.trim();
  const state     = document.getElementById('reg-state').value;
  const err       = document.getElementById('reg-error');

  const hasGoogleAuth  = !!_googleRegisterPayload;
  const termsChecked   = document.getElementById('reg-terms-check')?.checked;
  if (!name)  { err.textContent = 'El nombre completo es requerido.'; return; }
  if (!email) { err.textContent = 'El email es requerido.'; return; }
  if (!hasGoogleAuth && (!pass || pass.length < 6)) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (hasGoogleAuth && pass && pass.length > 0 && pass.length < 6) { err.textContent = 'Si pones contraseña, debe tener al menos 6 caracteres.'; return; }
  if (!city)  { err.textContent = 'La ciudad es requerida.'; return; }
  if (!state) { err.textContent = 'Debes seleccionar un estado.'; return; }
  if (!termsChecked) { err.textContent = 'Debes aceptar los Términos y Condiciones para continuar.'; return; }

  // Check not already a user
  if (email === MASTER_USER.email.toLowerCase() || loadUsers().some(u => u.email.toLowerCase() === email)) {
    err.textContent = 'Ese email ya tiene una cuenta activa. Inicia sesión directamente.';
    return;
  }
  // Always fetch from Supabase first so multiple requests from different devices don't overwrite each other
  let pending = [];
  try {
    const { data: _supaRow } = await supa.from('kv_store').select('value').eq('key', PENDING_KEY).maybeSingle();
    if (_supaRow?.value) pending = JSON.parse(_supaRow.value) || [];
  } catch(_) {
    pending = loadPendingUsers();
  }
  if (pending.some(u => u.email.toLowerCase() === email)) {
    err.textContent = 'Ya existe una solicitud pendiente con ese email.';
    return;
  }

  pending.push({ id: uid(), name, email, password: pass ? await sha256(pass) : null, googleAuth: hasGoogleAuth, agentNum, phone, city, state, requestedAt: new Date().toISOString() });
  await savePendingUsers(pending);
  closeRegisterForm();
  showToast('¡Solicitud enviada! Un administrador la revisará pronto.', 'success');
  updatePendingBadge();
}

function updatePendingBadge() {
  const count = loadPendingUsers().length;
  const sidebarBadge = document.getElementById('sidebar-pending-badge');
  const navBadge     = document.getElementById('pending-badge');
  if (sidebarBadge) { sidebarBadge.textContent = count; sidebarBadge.style.display = count > 0 ? '' : 'none'; }
  if (navBadge)     { navBadge.textContent = count;     navBadge.style.display     = count > 0 ? '' : 'none'; }
}

function renderPendingList() {
  const session = getSession();
  if (!session || (session.role !== 'master' && session.role !== 'admin')) return;
  const pending = loadPendingUsers();
  const list = document.getElementById('pending-list');
  if (!list) return;
  updatePendingBadge();
  if (pending.length === 0) { list.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text2);font-size:13px">No hay solicitudes pendientes.</div>'; return; }
  list.innerHTML = pending.map(u => `
    <div style="display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px">
      <div style="width:36px;height:36px;border-radius:50%;background:var(--yellow);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#1a1a1a;flex-shrink:0">${esc(getInitials(u.name))}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#fff">${esc(u.name)} ${u.googleAuth ? '<span style="font-size:10px;background:rgba(0,200,117,.15);color:var(--green);padding:1px 7px;border-radius:8px;font-weight:600">Google</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text2)">${esc(u.email)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px;display:flex;flex-wrap:wrap;gap:8px">
          ${u.agentNum ? `<span>🪪 ${esc(u.agentNum)}</span>` : ''}
          ${u.phone    ? `<span>📞 ${esc(u.phone)}</span>`    : ''}
          ${u.city || u.state ? `<span>📍 ${esc([u.city, u.state].filter(Boolean).join(', '))}</span>` : ''}
        </div>
        <div style="font-size:10px;color:var(--gray);margin-top:2px">${new Date(u.requestedAt).toLocaleString('es')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-primary btn-sm" onclick="openApproveModal('${u.id}')">✓ Aprobar</button>
        <button class="btn btn-sm" style="background:var(--red);color:#fff" onclick="rejectRequest('${u.id}')">✕ Rechazar</button>
      </div>
    </div>`).join('');
}

let _approvingId = null;

function openApproveModal(pendingId) {
  const u = loadPendingUsers().find(x => x.id === pendingId);
  if (!u) return;
  _approvingId = pendingId;
  document.getElementById('approve-user-info').innerHTML =
    `<strong>${esc(u.name)}</strong> &middot; ${esc(u.email)}
     ${u.agentNum ? `<br>🪪 Agente: ${esc(u.agentNum)}` : ''}
     ${u.phone    ? `<br>📞 ${esc(u.phone)}` : ''}
     ${(u.city||u.state) ? `<br>📍 ${esc([u.city,u.state].filter(Boolean).join(', '))}` : ''}`;
  document.getElementById('approve-rol').value = 'agent';
  onApproveRolChange();
  document.getElementById('approve-overlay').classList.add('open');
}
function closeApproveModal() {
  document.getElementById('approve-overlay').classList.remove('open');
  _approvingId = null;
}

function onApproveRolChange() {
  const role    = document.getElementById('approve-rol').value;
  const session = getSession();
  const users   = loadUsers();
  const isMasterSess = session && session.role === 'master';

  document.getElementById('approve-org-wrap').style.display        = (isMasterSess && role !== 'admin') ? '' : 'none';
  document.getElementById('approve-mm-wrap').style.display         = (role === 'manager' || role === 'agent' || role === 'supervisor_agent') ? '' : 'none';
  document.getElementById('approve-mgr-wrap').style.display        = (role === 'agent' || role === 'supervisor_agent') ? '' : 'none';
  const appSupWrap = document.getElementById('approve-supervisor-wrap');
  if (appSupWrap) appSupWrap.style.display = role === 'agent' ? '' : 'none';

  const orgId = isMasterSess ? (document.getElementById('approve-org').value || null) : (session ? session.id : null);

  if (isMasterSess) {
    const admins = users.filter(u => u.role === 'admin');
    document.getElementById('approve-org').innerHTML =
      `<option value="">— Sin organización —</option>` +
      admins.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  }
  const mms = users.filter(u => u.role === 'master_manager' && (!orgId || u.orgAdminId === orgId));
  document.getElementById('approve-mm').innerHTML =
    `<option value="">— Sin MGA —</option>` +
    mms.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  const mgrs = users.filter(u => u.role === 'manager' && (!orgId || u.orgAdminId === orgId));
  document.getElementById('approve-mgr').innerHTML =
    `<option value="">— Sin GA (directo) —</option>` +
    mgrs.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

  const sups = users.filter(u => u.role === 'supervisor_agent' && (!orgId || u.orgAdminId === orgId));
  const appSupEl = document.getElementById('approve-supervisor');
  if (appSupEl) appSupEl.innerHTML =
    `<option value="">— Sin SA (directo) —</option>` +
    sups.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

async function approveRequest() {
  const u = loadPendingUsers().find(x => x.id === _approvingId);
  if (!u) return;
  const session = getSession();
  const role    = document.getElementById('approve-rol').value;
  const isMasterSess = session && session.role === 'master';
  const orgAdminId         = isMasterSess ? (document.getElementById('approve-org').value || null) : (session ? session.id : null);
  const orgMasterManagerId = document.getElementById('approve-mm-wrap').style.display !== 'none' ? (document.getElementById('approve-mm').value || null) : null;
  const orgManagerId       = document.getElementById('approve-mgr-wrap').style.display !== 'none' ? (document.getElementById('approve-mgr').value || null) : null;
  const appSupWrapEl       = document.getElementById('approve-supervisor-wrap');
  const orgSupervisorId    = (appSupWrapEl && appSupWrapEl.style.display !== 'none') ? (document.getElementById('approve-supervisor')?.value || null) : null;

  const users = loadUsers();
  if (users.some(x => x.email.toLowerCase() === u.email.toLowerCase())) {
    showToast('Ese email ya tiene una cuenta activa.', 'error'); return;
  }
  const _pendingPwd = u.password && !_isHashed(u.password) ? await sha256(u.password) : (u.password || null);
  users.push({ id: uid(), name: u.name, email: u.email, password: _pendingPwd, googleAuth: u.googleAuth || false, role, orgAdminId, orgMasterManagerId, orgManagerId, orgSupervisorId, createdAt: today() });
  await saveUsers(users);

  const remaining = loadPendingUsers().filter(x => x.id !== _approvingId);
  await savePendingUsers(remaining);

  logActivity('user_approved', `Solicitud aprobada: ${u.name}`, `Email: ${u.email} · Rol asignado: ${role}`);
  closeApproveModal();
  renderPendingList();
  renderUsersGrid();
  showToast(`${u.name} aprobado como ${role} ✓`, 'success');
}

async function rejectRequest(pendingId) {
  const u = loadPendingUsers().find(x => x.id === pendingId);
  if (!u || !confirm(`¿Rechazar la solicitud de ${u.name}?`)) return;
  logActivity('user_rejected', `Solicitud rechazada: ${u.name}`, `Email: ${u.email}`);
  await savePendingUsers(loadPendingUsers().filter(x => x.id !== pendingId));
  renderPendingList();
  showToast('Solicitud rechazada', 'error');
}

// ── User action password gate ──────────────────────────
let _pendingUserAction = null;

function requirePasswordForUserAction(title, msg, btnLabel, action) {
  _pendingUserAction = action;
  document.getElementById('ua-title').textContent        = title;
  document.getElementById('ua-msg').innerHTML            = msg;
  document.getElementById('ua-btn').textContent          = btnLabel;
  document.getElementById('ua-pass').value               = '';
  document.getElementById('user-action-overlay').classList.add('open');
  setTimeout(() => document.getElementById('ua-pass').focus(), 120);
}

function cancelUserAction() {
  _pendingUserAction = null;
  document.getElementById('user-action-overlay').classList.remove('open');
}

async function confirmUserAction() {
  const pass    = document.getElementById('ua-pass').value;
  if (!pass) { showToast('Introduce tu contraseña', 'error'); return; }
  const session = getSession();
  let valid = false;
  if (session.id === MASTER_USER.id) {
    valid = await sha256(pass) === MASTER_USER.passwordHash;
  } else {
    const me = loadUsers().find(u => u.id === session.id);
    valid = me && await verifyPass(pass, me.password);
  }
  if (!valid) { showToast('Contraseña incorrecta', 'error'); document.getElementById('ua-pass').value = ''; document.getElementById('ua-pass').focus(); return; }
  const action = _pendingUserAction;
  _pendingUserAction = null;
  document.getElementById('user-action-overlay').classList.remove('open');
  if (action) await action();
}


async function deleteUser(userId) {
  const session = getSession();
  if (!session || (session.role !== 'master' && session.role !== 'admin')) {
    showToast('Solo el administrador o desarrollador puede eliminar usuarios', 'error');
    return;
  }
  const users = loadUsers();
  const u     = users.find(x => x.id === userId);
  if (!u) return;
  if (session.role === 'admin' && u.orgAdminId !== session.id) return;

  // Count all leads assigned to this user across all boards
  const leadCount = BOARDS.reduce((total, b) =>
    total + loadLeads(b.id).filter(l => l.asignado === u.name).length, 0);

  const leadWarning = leadCount > 0
    ? `<div style="background:rgba(253,171,61,.08);border:1px solid rgba(253,171,61,.3);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--yellow);line-height:1.7">
        ⚠️ <strong>Se recomienda mover los recursos antes de eliminar.</strong><br>
        Este usuario tiene <strong>${leadCount} lead${leadCount !== 1 ? 's' : ''} asignado${leadCount !== 1 ? 's' : ''}</strong>. Al eliminarlo, todos pasarán automáticamente a la carpeta <strong>Eliminados</strong>.<br>
        <span style="font-size:11px;opacity:.85">Considera reasignarlos a otro agente primero.</span>
      </div>`
    : `<div style="background:rgba(0,200,117,.06);border:1px solid rgba(0,200,117,.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--green);line-height:1.5">
        ✓ Este usuario no tiene leads asignados actualmente.
      </div>`;

  // Primera confirmación de clave
  requirePasswordForUserAction(
    '🗑 Eliminar Usuario — Confirmación 1 de 2',
    `${leadWarning}Estás a punto de eliminar a <strong>${esc(u.name)}</strong> (${esc(u.email)}).<br><span style="color:var(--yellow);font-size:12px">Confirma tu contraseña para continuar.</span>`,
    'Continuar →',
    async () => {
      // Segunda confirmación de clave
      requirePasswordForUserAction(
        '⛔ Confirma nuevamente — Paso 2 de 2',
        `<div style="background:rgba(226,68,92,.1);border:1px solid rgba(226,68,92,.3);border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:12px;color:var(--red);line-height:1.7">
          <strong>ÚLTIMA ADVERTENCIA</strong><br>
          Eliminarás a <strong>${esc(u.name)}</strong> de forma <strong>permanente</strong>.<br>
          Esta acción <strong>no se puede deshacer</strong>.
        </div>
        Ingresa tu contraseña por segunda vez para confirmar.`,
        '⛔ Eliminar definitivamente',
        async () => {
      // Soft-delete all leads belonging to this user across all boards
      if (leadCount > 0) {
        const trash = loadDeletedLeads();
        const now   = new Date().toISOString();
        BOARDS.forEach(b => {
          const leads   = loadLeads(b.id);
          const toTrash = leads.filter(l => l.asignado === u.name);
          if (toTrash.length === 0) return;
          toTrash.forEach(lead => trash.unshift({
            ...lead,
            _deletedAt:         now,
            _deletedBy:         `${session.name} (usuario eliminado)`,
            _originalBoardId:   b.id,
            _originalBoardName: b.name
          }));
          saveLeads(b.id, leads.filter(l => l.asignado !== u.name));
        });
        await saveDeletedLeads(trash);
        updateTrashBadge();
      }

      // Archive user to deleted users history
      const delUsers = loadDeletedUsers();
      delUsers.unshift({ ...u, _deletedAt: new Date().toISOString(), _deletedBy: session.name });
      await saveDeletedUsers(delUsers);

      // Remove from active users
      await saveUsers(loadUsers().filter(x => x.id !== userId));
      logActivity('user_deleted', `Usuario eliminado: ${u.name}`, `Email: ${u.email} · Rol: ${u.role}${leadCount > 0 ? ` · ${leadCount} leads movidos a Eliminados` : ''}`);
      renderUsersGrid();
      showToast(`Usuario eliminado${leadCount > 0 ? ` · ${leadCount} lead${leadCount !== 1 ? 's' : ''} movidos a Eliminados` : ''}`, 'error');
        } // fin acción segunda confirmación
      ); // fin requirePasswordForUserAction segunda
    } // fin acción primera confirmación
  ); // fin requirePasswordForUserAction primera
}

async function toggleUserInactive(userId) {
  const session = getSession();
  if (!session || (session.role !== 'master' && session.role !== 'admin')) return;
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  const u = users[idx];
  const goingInactive = !u.inactive;
  const action = goingInactive ? 'marcar como inactivo' : 'reactivar';
  if (!confirm(`¿Deseas ${action} a ${u.name}?`)) return;
  users[idx].inactive = goingInactive;
  if (goingInactive) {
    users[idx]._inactivatedBy   = session.name || session.email;
    users[idx]._inactivatedAt   = new Date().toISOString();
  } else {
    delete users[idx]._inactivatedBy;
    delete users[idx]._inactivatedAt;
  }
  await saveUsers(users);
  logActivity(goingInactive ? 'user_deactivated' : 'user_reactivated',
    `Usuario ${goingInactive ? 'inactivado' : 'reactivado'}: ${u.name}`, `Email: ${u.email}`);
  renderUsersGrid();
  showToast(`${u.name} ${goingInactive ? 'marcado como inactivo ⏸' : 'reactivado ▶'}`, goingInactive ? 'error' : 'success');
}


// ════════════════════════════════════════════
//  NOTES PANEL
// ════════════════════════════════════════════
let _notesBoardId  = null;
let _notesLeadId   = null;
let _notesNavList  = [];   // ordered list of {id, boardId} for prev/next

function _updateNpNav(leadId) {
  const idx     = _notesNavList.findIndex(e => e.id === leadId);
  const total   = _notesNavList.length;
  const prevBtn = document.getElementById('np-prev-btn');
  const nextBtn = document.getElementById('np-next-btn');
  const counter = document.getElementById('np-nav-counter');
  if (counter) counter.textContent = total > 1 ? `${idx + 1} / ${total}` : '';
  if (prevBtn) prevBtn.style.opacity = idx <= 0 ? '0.35' : '1';
  if (nextBtn) nextBtn.style.opacity = idx >= total - 1 ? '0.35' : '1';
}

function notesPanelNav(dir) {
  const idx = _notesNavList.findIndex(e => e.id === _notesLeadId);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _notesNavList.length) return;
  const { id, boardId } = _notesNavList[newIdx];
  // Temporarily set currentBoardId so openNotesPanel finds the right board
  const prev = currentBoardId;
  currentBoardId = boardId;
  openNotesPanel(id, _notesNavList);
  currentBoardId = prev;
}

function parseNotes(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
  } catch {}
  // legacy plain string — show as a single note without date/author
  return raw.trim() ? [{ text: raw, author: 'Sistema', date: '' }] : [];
}

function formatNoteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit' });
}

function openNotesPanel(leadId, navList) {
  const boardId = (currentBoardId === '__agent__') ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const lead = loadLeads(boardId).find(l => l.id === leadId);
  if (!lead) return;
  _notesBoardId = boardId;
  _notesLeadId  = leadId;

  // Build or reuse navigation list
  if (navList) {
    _notesNavList = navList;
  } else if (!_notesNavList.length || !_notesNavList.find(e => e.id === leadId)) {
    // Build from current filteredLeads
    _notesNavList = filteredLeads.map(l => ({ id: l.id, boardId: boardId }));
  }
  _updateNpNav(leadId);

  // Reset edit mode when opening a new lead
  _npEditMode = false;
  const editBtn = document.getElementById('np-edit-btn');
  if (editBtn) { editBtn.textContent = '✏️ Editar'; editBtn.style.background = 'rgba(255,255,255,0.15)'; editBtn.style.borderColor = 'rgba(255,255,255,0.3)'; }
  document.getElementById('np-edit-nombre')?.remove();
  document.getElementById('notes-panel-name').style.display = '';

  const npName = lead.nombre || '—';
  document.getElementById('notes-panel-name').textContent = npName;
  // Show previous name faintly if it exists
  const prevNombreEl = document.getElementById('np-prev-nombre');
  if (lead.prev_nombre) { prevNombreEl.textContent = 'Antes: ' + lead.prev_nombre; prevNombreEl.style.display = ''; }
  else { prevNombreEl.style.display = 'none'; }
  const npInitials = npName.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('np-avatar').textContent = npInitials || '?';

  // Lead type badge in banner
  document.getElementById('notes-panel-leadtype').innerHTML = lead.lead
    ? `<span style="background:rgba(255,255,255,0.17);border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:2px 9px;font-size:10px;color:rgba(255,255,255,0.95);font-weight:500">📋 ${esc(lead.lead)}</span>`
    : '';

  // Info grid: email, dirección, creación, resultado
  function _npInfoCell(icon, label, val) {
    const display = val || '<span style="color:var(--text2);font-style:italic">—</span>';
    return `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">${icon} ${label}</span>
      <span style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(val||'')}">${val ? esc(val) : display}</span>
    </div>`;
  }
  document.getElementById('np-info-grid').innerHTML =
    _npInfoCell('✉️','Email',     lead.email     || '') +
    _npInfoCell('🏠','Dirección', lead.direccion  || '') +
    _npInfoCell('📅','Creación',  lead.creacion   ? formatDate(lead.creacion) : '') +
    _npInfoCell('✅','Resultado', lead.resultado  || '');

  // Tags row: phone · location · agent
  const npChips = [
    lead.telefono  && { label:`📞 ${lead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
    lead.ubicacion && { label:`📍 ${lead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
    lead.asignado  && { label:`👤 ${lead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
  ].filter(Boolean);
  document.getElementById('notes-lead-summary').innerHTML = npChips.map(ch =>
    `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
  ).join('');

  // populate resultado dropdown — always starts blank so same value can be re-selected
  const resSel = document.getElementById('notes-resultado-sel');
  resSel.innerHTML = `<option value="">— Seleccionar resultado —</option>` +
    RESULTADOS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  resSel.value = '';

  // Migrate plain `notas` → `_notes` journal if needed
  if (lead.notas && lead.notas.trim() && !lead._notes) {
    lead._notes = JSON.stringify([{ text: lead.notas.trim(), author: 'Sistema', date: lead.creacion ? lead.creacion + 'T00:00:00Z' : new Date().toISOString(), system: true }]);
    const leads = loadLeads(boardId);
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx !== -1) { leads[idx]._notes = lead._notes; saveLeads(boardId, leads); }
  }
  _renderNotesJournal(lead);
  document.getElementById('notes-new-input').value = '';
  // pre-fill phone for messages tab
  const phoneInp = document.getElementById('msg-phone-inp');
  if (phoneInp) phoneInp.value = lead.telefono || '';
  // Auto-select channel based on last message
  const _msgs = JSON.parse(lead._messages || '[]');
  const _lastMsg = _msgs.length ? _msgs[_msgs.length - 1] : null;
  setMsgChannel(_lastMsg ? (_lastMsg.channel || 'sms') : 'sms');
  _renderMsgJournal(lead);
  const _s = getSession();
  document.getElementById('np-tab-messages').style.display = (_s && _s.role === 'master') ? '' : 'none';
  document.getElementById('np-tab-calls').style.display = '';
  loadMsgCredits(boardId);
  switchNotesPanelTab('notes');
  document.getElementById('notes-panel-overlay').classList.add('open');
  _startMsgPolling();
}


let _npEditMode = false;

function toggleNpEdit() {
  _npEditMode ? _saveNpEdit() : _enterNpEdit();
}

function _enterNpEdit() {
  _npEditMode = true;
  const boardId = _notesBoardId;
  const leads   = loadLeads(boardId);
  const lead    = leads.find(l => l.id === _notesLeadId);
  if (!lead) return;

  document.getElementById('np-edit-btn').textContent = '💾 Guardar';
  document.getElementById('np-edit-btn').style.background = 'rgba(0,200,117,0.25)';
  document.getElementById('np-edit-btn').style.borderColor = 'rgba(0,200,117,0.5)';

  // Replace name with input
  const nameEl = document.getElementById('notes-panel-name');
  nameEl.style.display = 'none';
  if (!document.getElementById('np-edit-nombre')) {
    const inp = document.createElement('input');
    inp.id = 'np-edit-nombre';
    inp.type = 'text';
    inp.value = lead.nombre || '';
    inp.style.cssText = 'font-size:15px;font-weight:700;color:#fff;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:6px;padding:4px 10px;width:100%;font-family:var(--font);outline:none;margin-bottom:2px;';
    nameEl.parentElement.insertBefore(inp, nameEl);
  }

  // Replace info grid with inputs
  document.getElementById('np-info-grid').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">✉️ Email</span>
      <input id="np-edit-email" type="email" value="${esc(lead.email||'')}" placeholder="correo@ejemplo.com"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">📞 Teléfono</span>
      <input id="np-edit-telefono" type="tel" value="${esc(lead.telefono||'')}" placeholder="+1 000 000 0000"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:3px;grid-column:span 2">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">🏠 Dirección</span>
      <input id="np-edit-direccion" type="text" value="${esc(lead.direccion||'')}" placeholder="Dirección completa"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
  `;
}

async function _saveNpEdit() {
  const boardId = _notesBoardId;
  const leads   = loadLeads(boardId);
  const idx     = leads.findIndex(l => l.id === _notesLeadId);
  if (idx === -1) return;

  const lead     = leads[idx];
  const newNombre = (document.getElementById('np-edit-nombre')?.value || '').trim();
  const newEmail  = (document.getElementById('np-edit-email')?.value || '').trim();
  const newTel    = (document.getElementById('np-edit-telefono')?.value || '').trim();
  const newDir    = (document.getElementById('np-edit-direccion')?.value || '').trim();

  if (!newNombre) { showToast('El nombre es requerido', 'error'); return; }

  const nombreCambio = newNombre.toLowerCase() !== (lead.nombre || '').toLowerCase();
  const prevNombre   = lead.nombre;

  leads[idx] = { ...lead, nombre: newNombre, email: newEmail, telefono: newTel, direccion: newDir };
  if (nombreCambio) leads[idx].prev_nombre = prevNombre;

  await saveLeads(boardId, leads);
  logActivity('lead_edit', `Lead editado: ${newNombre}`, nombreCambio ? `Nombre anterior: ${prevNombre}` : '');

  _npEditMode = false;

  // Restore edit button
  const btn = document.getElementById('np-edit-btn');
  btn.textContent = '✏️ Editar';
  btn.style.background = 'rgba(255,255,255,0.15)';
  btn.style.borderColor = 'rgba(255,255,255,0.3)';

  // Restore name display
  const nameEl = document.getElementById('notes-panel-name');
  nameEl.textContent = newNombre;
  nameEl.style.display = '';
  document.getElementById('np-edit-nombre')?.remove();

  // Show previous name faintly
  const prevEl = document.getElementById('np-prev-nombre');
  if (nombreCambio && prevNombre) {
    prevEl.textContent = 'Antes: ' + prevNombre;
    prevEl.style.display = '';
  } else {
    prevEl.style.display = 'none';
  }

  // Update avatar initials
  const npInitials = newNombre.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('np-avatar').textContent = npInitials || '?';

  // Re-render info grid and tags in the panel
  const updatedLead = leads[idx];
  const npChips2 = [
    updatedLead.telefono  && { label:`📞 ${updatedLead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
    updatedLead.ubicacion && { label:`📍 ${updatedLead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
    updatedLead.asignado  && { label:`👤 ${updatedLead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
  ].filter(Boolean);
  const summaryEl = document.getElementById('notes-lead-summary');
  if (summaryEl) summaryEl.innerHTML = npChips2.map(ch =>
    `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
  ).join('');

  // Refresh table row immediately without reloading the panel
  applyFilters();
  showToast('Lead actualizado ✓', 'success');
  try { renderTable && renderTable(); } catch(e) {}
}

function _renderNotesJournal(lead) {
  let notes = parseNotes(lead._notes);
  // Fallback: if journal is empty but the plain `notas` field has content, show it
  if (!notes.length && lead.notas && lead.notas.trim()) {
    notes = [{ text: lead.notas.trim(), author: 'Sistema', date: lead.creacion || '', system: true }];
  }
  const el = document.getElementById('notes-journal');
  if (!notes.length) {
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;text-align:center;padding:20px 0">Sin notas aún. Sé el primero en agregar una.</div>`;
    return;
  }
  el.innerHTML = notes.map(n => n.system ? `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,115,234,.07);border:1px solid rgba(0,115,234,.18);border-radius:6px">
      <span style="font-size:11px;color:var(--text2)">🔄</span>
      <span style="font-size:11px;color:var(--text2);flex:1">${esc(n.text)}</span>
      <span style="font-size:10px;color:var(--gray)">${esc(n.author)} · ${n.date ? formatNoteDate(n.date) : ''}</span>
    </div>
  ` : `
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;display:flex;gap:8px;align-items:center">
        <strong style="color:var(--accent)">${esc(n.author)}</strong>
        <span>${n.date ? formatNoteDate(n.date) : ''}</span>
      </div>
      <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.6">${esc(n.text)}</div>
    </div>
  `).join('');
  // scroll to bottom so latest note is visible
  el.scrollTop = el.scrollHeight;
}

let _msgChannel = 'sms';

function switchNotesPanelTab(tab) {
  document.getElementById('np-pane-notes').style.display    = tab === 'notes'    ? 'flex' : 'none';
  document.getElementById('np-pane-messages').style.display = tab === 'messages' ? 'flex' : 'none';
  document.getElementById('np-pane-calls').style.display    = tab === 'calls'    ? 'flex' : 'none';
  ['notes','messages','calls'].forEach(t => {
    const el = document.getElementById('np-tab-' + t);
    if (!el) return;
    const active = t === tab;
    el.style.color            = active ? 'var(--accent)' : 'var(--text2)';
    el.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    el.style.fontWeight       = active ? '600' : '500';
  });
  if (tab === 'calls') _renderCallsPane();
}

const WA_TEMPLATE_SID  = 'HX872c8dfe2ba6f8d9833284769872f0bb';
const WA_TEMPLATE_BODY = 'Hola {{1}}, te contacta {{2}} de Grupo Elite Work. Estamos haciendo seguimiento a tu interés en nuestras propiedades. ¿Tienes unos minutos para conversar? Responde STOP para no recibir más mensajes.';

function setMsgChannel(ch, skipWarning = false) {
  // Channel mismatch warning (only when user manually switches)
  if (!skipWarning && _notesBoardId && _notesLeadId) {
    const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
    if (lead) {
      const msgs = JSON.parse(lead._messages || '[]');
      const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
      if (lastMsg && lastMsg.channel && lastMsg.channel !== ch) {
        const lastCh = lastMsg.channel === 'whatsapp' ? 'WhatsApp' : 'Mensaje de texto';
        const warn = document.getElementById('msg-channel-warn');
        if (warn) {
          warn.style.display = '';
          warn.innerHTML = `⚠️ Tu última conversación con <strong>${esc(lead.nombre||'este lead')}</strong> fue via <strong>${lastCh}</strong>. Te recomendamos mantener esa misma comunicación.
            <button onclick="setMsgChannel('${ch}', true)" style="margin-left:10px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Enviar de todas formas</button>
            <button onclick="setMsgChannel('${lastMsg.channel}', true)" style="margin-left:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer">Cancelar</button>`;
          return; // don't actually switch yet
        }
      }
    }
  }
  // Hide warning
  const warn = document.getElementById('msg-channel-warn');
  if (warn) warn.style.display = 'none';

  _msgChannel = ch;
  const btnS = document.getElementById('msg-ch-sms');
  const btnW = document.getElementById('msg-ch-whatsapp');
  // SMS active: blue; WhatsApp active: green; inactive: muted
  const smsOn   = 'flex:1;padding:7px;border-radius:8px;border:1px solid rgba(0,115,234,.5);background:rgba(0,115,234,.15);color:var(--accent);font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer';
  const waOn    = 'flex:1;padding:7px;border-radius:8px;border:1px solid rgba(37,211,102,.6);background:rgba(37,211,102,.18);color:#25d366;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 0 0 2px rgba(37,211,102,.2)';
  const offStyle = 'flex:1;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--text2);font-family:var(--font);font-size:12px;font-weight:500;cursor:pointer';
  if (btnS) btnS.style.cssText = ch === 'sms' ? smsOn : offStyle;
  if (btnW) btnW.style.cssText = ch === 'whatsapp' ? waOn : offStyle;

  // Show/hide template bar — only if template hasn't been sent yet
  const tbar = document.getElementById('msg-template-bar');
  const tprev = document.getElementById('msg-template-preview');
  if (tbar) {
    const lead = _notesBoardId ? loadLeads(_notesBoardId).find(l => l.id === _notesLeadId) : null;
    const msgs = JSON.parse(lead?._messages || '[]');
    const alreadySent = msgs.some(m => m.template === true);
    tbar.style.display = (ch === 'whatsapp' && !alreadySent) ? '' : 'none';
    if (tprev && ch === 'whatsapp' && !alreadySent) {
      const session = getSession();
      const v1 = lead?.nombre || 'Cliente';
      const v2 = session?.name || 'Agente';
      tprev.textContent = WA_TEMPLATE_BODY.replace('{{1}}', v1).replace('{{2}}', v2);
    }
  }
}

async function sendWhatsAppTemplate() {
  const status = document.getElementById('msg-status');
  const btn    = document.getElementById('msg-send-btn');
  const leads  = loadLeads(_notesBoardId);
  const lead   = leads.find(l => l.id === _notesLeadId);
  if (!lead?.telefono) { if (status) { status.textContent = '⚠️ El lead no tiene número de teléfono'; status.style.color = '#e2445c'; } return; }

  const session = getSession();
  const v1 = lead.nombre || 'Cliente';
  const v2 = session?.name || 'Agente';
  const to = lead.telefono;

  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Enviando template…'; status.style.color = 'var(--text2)'; }

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        to,
        channel: 'whatsapp',
        boardId: _notesBoardId,
        contentSid: WA_TEMPLATE_SID,
        contentVariables: { '1': v1, '2': v2 },
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Log message in lead history
    const previewText = WA_TEMPLATE_BODY.replace('{{1}}', v1).replace('{{2}}', v2);
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to, from: data.from || '', body: previewText, channel: 'whatsapp', template: true, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_notesBoardId, leads);
    _renderMsgJournal(lead);

    if (status) { status.textContent = '✓ Template enviado por WhatsApp'; status.style.color = '#25d366'; }
    if (data.creditsLeft !== undefined) {
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.creditsLeft; cv.style.color = data.creditsLeft < 10 ? '#e2445c' : 'var(--accent)'; }
    }
  } catch(e) {
    if (status) { status.textContent = '⚠️ ' + e.message; status.style.color = '#e2445c'; }
  }
  if (btn) btn.disabled = false;
}

function _renderMsgJournal(lead) {
  const el = document.getElementById('msg-journal');
  if (!el) return;
  const msgs = JSON.parse(lead._messages || '[]');
  if (!msgs.length) {
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;text-align:center;padding:20px 0">Sin mensajes enviados aún.</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isInbound = m.direction === 'inbound';
    const borderColor = isInbound ? 'rgba(37,211,102,.3)' : 'var(--border)';
    const bg = isInbound ? 'rgba(37,211,102,.06)' : 'var(--card2)';
    const dirLabel = isInbound
      ? `<span style="background:rgba(37,211,102,.2);color:#25d366;padding:1px 7px;border-radius:10px;font-weight:700;font-size:10px">↩ Respuesta</span>`
      : `<span style="background:${m.channel==='whatsapp'?'rgba(37,211,102,.15)':'rgba(0,115,234,.12)'};color:${m.channel==='whatsapp'?'#25d366':'var(--accent)'};padding:1px 7px;border-radius:10px;font-weight:600;font-size:10px">${m.channel==='whatsapp'?'WhatsApp':'SMS'}${m.template?' · Template':''}</span>`;
    const fromTo = isInbound
      ? `<span style="color:var(--text2)">De: <strong style="color:var(--text)">${esc(m.from||m.author)}</strong></span>`
      : (m.from ? `<span style="color:var(--text2)">De: <strong style="color:var(--text)">${esc(m.from)}</strong></span><span>→ ${esc(m.to)}</span>` : `<span>→ ${esc(m.to)}</span>`);
    return `
    <div style="background:${bg};border:1px solid ${borderColor};border-radius:8px;padding:10px 14px">
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${dirLabel}
        ${fromTo}
        <span style="margin-left:auto">${isInbound ? '' : esc(m.author)+' · '}${formatNoteDate(m.date)}</span>
      </div>
      <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5">${esc(m.body)}</div>
      ${!isInbound ? (m.error ? `<div style="font-size:11px;color:#e2445c;margin-top:4px">⚠️ ${esc(m.error)}</div>` : `<div style="font-size:10px;color:#00c875;margin-top:4px">✓ ${esc(m.sid||'enviado')}</div>`) : ''}
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendLeadMessage() {
  const to   = document.getElementById('msg-phone-inp').value.trim();
  const body = document.getElementById('msg-body-inp').value.trim();
  const status = document.getElementById('msg-status');
  const btn    = document.getElementById('msg-send-btn');
  if (!to || !body) { status.textContent = 'Completa número y mensaje.'; status.style.color = '#e2445c'; return; }

  btn.disabled = true;
  status.textContent = 'Enviando…';
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to, body, channel: _msgChannel, boardId: _notesBoardId }),
    });
    const data = await res.json();

    const leads = loadLeads(_notesBoardId);
    const lead  = leads.find(l => l.id === _notesLeadId);
    if (lead) {
      const session = getSession();
      const msgs = JSON.parse(lead._messages || '[]');
      msgs.push({ to, from: data.from || '', body, channel: _msgChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: data.error || '' });
      lead._messages = JSON.stringify(msgs);
      saveLeads(_notesBoardId, leads);
      _renderMsgJournal(lead);
    }

    if (data.error) throw new Error(data.error);
    status.textContent = '✓ Mensaje enviado';
    status.style.color = '#00c875';
    document.getElementById('msg-body-inp').value = '';
    if (data.creditsLeft !== undefined) {
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.creditsLeft; cv.style.color = data.creditsLeft < 10 ? '#e2445c' : 'var(--accent)'; }
      if (_autochargeEnabled && data.creditsLeft <= _autochargeThreshold) {
        triggerAutoRecharge();
      }
    }
  } catch(e) {
    status.textContent = '⚠️ ' + e.message;
    status.style.color = '#e2445c';
  }
  btn.disabled = false;
}

// ════════════════════════════════════════════
//  CHAT POPUP
// ════════════════════════════════════════════
let _cpLeadId = null, _cpBoardId = null, _cpChannel = 'sms', _cpOpen = false;

function openChatPopup(leadId) {
  const boardId = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const lead = loadLeads(boardId).find(l => l.id === leadId);
  if (!lead) return;
  _cpLeadId = leadId;
  _cpBoardId = boardId;

  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || '#0073ea';
  const av = document.getElementById('cp-avatar');
  av.textContent = initials;
  av.style.background = bg + '25';
  av.style.color = bg;
  document.getElementById('cp-name').textContent = lead.nombre || '—';
  document.getElementById('cp-phone').textContent = lead.telefono || '';

  const popup = document.getElementById('chat-popup');
  popup.style.display = 'flex';
  _cpOpen = true;
  renderChatPopupMsgs(lead);
}

function initChatResize(e) {
  e.preventDefault(); e.stopPropagation();
  const popup = document.getElementById('chat-popup');
  const startX = e.clientX, startY = e.clientY;
  const startW = popup.offsetWidth, startH = popup.offsetHeight;
  function onMove(e) {
    popup.style.width  = Math.max(280, Math.min(600, startW - (e.clientX - startX))) + 'px';
    popup.style.height = Math.max(320, Math.min(window.innerHeight * .9, startH - (e.clientY - startY))) + 'px';
  }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function closeChatPopup() {
  document.getElementById('chat-popup').style.display = 'none';
  _cpOpen = false;
}

function toggleChatPopup() {
  const msgs = document.getElementById('cp-msgs');
  const input = document.getElementById('cp-input').parentElement;
  const chBtns = document.getElementById('cp-ch-sms').parentElement;
  const collapsed = msgs.style.display === 'none';
  msgs.style.display = collapsed ? 'flex' : 'none';
  input.style.display = collapsed ? 'flex' : 'none';
  chBtns.style.display = collapsed ? 'flex' : 'none';
  document.getElementById('chat-popup').style.height = collapsed ? '520px' : '48px';
}

function setCpChannel(ch) {
  _cpChannel = ch;
  document.getElementById('cp-ch-sms').classList.toggle('active', ch === 'sms');
  document.getElementById('cp-ch-wa').classList.toggle('active', ch === 'whatsapp');
}

function renderChatPopupMsgs(lead) {
  const msgs = JSON.parse(lead._messages || '[]');
  const el = document.getElementById('cp-msgs');
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:12px;margin:auto">Sin mensajes aún.</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isOut = m.direction !== 'inbound';
    const time = m.date ? new Date(m.date).toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'}) : '';
    const chBadge = m.channel === 'whatsapp'
      ? `<svg title="WhatsApp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0" aria-label="WhatsApp"><title>WhatsApp</title><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`
      : `<svg title="Mensaje SMS" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0" aria-label="SMS"><title>Mensaje SMS</title><path fill="#0073ea" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
    return `<div style="display:flex;flex-direction:column;${isOut?'align-items:flex-end':'align-items:flex-start'}">
      <div class="${isOut?'conv-msg-out':'conv-msg-in'}" style="font-size:12px;padding:8px 12px">${esc(m.body||'')}</div>
      <div style="font-size:10px;color:var(--text2);margin-top:3px;display:flex;align-items:center;gap:4px;${isOut?'flex-direction:row-reverse':''}">${chBadge}<span>${time}${m.error?' ⚠️':' ✓'}</span></div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendChatPopupMsg() {
  if (!_cpLeadId || !_cpBoardId) return;
  const input = document.getElementById('cp-input');
  const body = input.value.trim();
  const statusEl = document.getElementById('cp-status');
  if (!body) return;

  const leads = loadLeads(_cpBoardId);
  const lead = leads.find(l => l.id === _cpLeadId);
  if (!lead?.telefono) { statusEl.textContent = '⚠️ Sin número de teléfono'; return; }

  statusEl.textContent = 'Enviando…';
  input.disabled = true;

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to: lead.telefono, body, channel: _cpChannel, boardId: _cpBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const session = getSession();
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to: lead.telefono, body, channel: _cpChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: '', direction: 'outbound' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_cpBoardId, leads);

    input.value = '';
    statusEl.textContent = '✓ Enviado';
    setTimeout(() => statusEl.textContent = '', 2000);
    renderChatPopupMsgs(lead);
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
  }
  input.disabled = false;
  input.focus();
}

// ════════════════════════════════════════════
//  CONVERSATIONS PAGE
// ════════════════════════════════════════════
let _convLeadId = null, _convBoardId = null, _convChannel = 'sms', _convTab = 'all', _convSearch = '';

function showConversationsPage() {
  showBoardView();
  document.getElementById('conversations-page').style.display = 'flex';
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const nav = document.getElementById('nav-conversations');
  if (nav) nav.classList.add('active');
  document.getElementById('board-title').textContent = 'Conversaciones';
  renderConvList();
}

function _getAllConvLeads() {
  const all = [];
  BOARDS.forEach(b => loadLeads(b.id).forEach(l => {
    const msgs = JSON.parse(l._messages || '[]');
    if (msgs.length) all.push({ lead: l, boardId: b.id, boardName: b.name, msgs });
  }));
  return all.sort((a, b) => {
    const la = a.msgs[a.msgs.length-1]?.date || '';
    const lb = b.msgs[b.msgs.length-1]?.date || '';
    return lb.localeCompare(la);
  });
}

function renderConvList() {
  const el = document.getElementById('conv-list');
  if (!el) return;
  let items = _getAllConvLeads();

  if (_convSearch) {
    const q = _convSearch.toLowerCase();
    items = items.filter(i => (i.lead.nombre||'').toLowerCase().includes(q) || (i.lead.telefono||'').includes(q));
  }
  if (_convTab === 'unread') items = items.filter(i => i.msgs.some(m => m.direction === 'inbound' && !m.read));
  if (_convTab === 'sms')    items = items.filter(i => i.msgs.some(m => m.channel === 'sms'));
  if (_convTab === 'whatsapp') items = items.filter(i => i.msgs.some(m => m.channel === 'whatsapp'));

  if (!items.length) {
    el.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text2);font-size:12px">Sin conversaciones aún.</div>`;
    return;
  }

  el.innerHTML = items.map(({ lead, boardId, msgs }) => {
    const last = msgs[msgs.length-1];
    const initials = getInitials(lead.nombre);
    const bg = strToTableColor(lead.nombre) || 'rgba(0,115,234,.2)';
    const unread = msgs.filter(m => m.direction === 'inbound' && !m.read).length;
    const lastText = last ? (last.body||'').slice(0,40) + (last.body?.length>40?'…':'') : '';
    const lastTime = last?.date ? new Date(last.date).toLocaleDateString('es-US',{month:'short',day:'numeric'}) : '';
    const chIcon = last?.channel === 'whatsapp' ? '💬' : '📱';
    const isActive = _convLeadId === lead.id;
    return `<div class="conv-item${isActive?' active':''}" onclick="selectConv('${lead.id}','${boardId}')">
      <div class="conv-item-avatar" style="background:${bg}20;color:${bg}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
          <span style="font-size:13px;font-weight:${unread?'700':'500'};color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(lead.nombre||'Sin nombre')}</span>
          <span style="font-size:10px;color:var(--text2);flex-shrink:0">${lastTime}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
          <span style="font-size:11px">${chIcon}</span>
          <span style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(lastText)}</span>
          ${unread ? `<span style="background:var(--accent);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;flex-shrink:0">${unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function selectConv(leadId, boardId) {
  _convLeadId = leadId;
  _convBoardId = boardId;
  renderConvList();
  renderConvThread();
  renderConvDetail();
}

function renderConvThread() {
  if (!_convLeadId) return;
  const lead = loadLeads(_convBoardId).find(l => l.id === _convLeadId);
  if (!lead) return;
  const msgs = JSON.parse(lead._messages || '[]');
  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || 'rgba(0,115,234,.2)';

  document.getElementById('conv-thread-avatar').textContent = initials;
  document.getElementById('conv-thread-avatar').style.background = bg + '20';
  document.getElementById('conv-thread-avatar').style.color = bg;
  document.getElementById('conv-thread-name').textContent = lead.nombre || 'Sin nombre';
  document.getElementById('conv-thread-sub').textContent = [lead.telefono, lead.email].filter(Boolean).join(' · ');

  const el = document.getElementById('conv-thread-msgs');
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:12px;padding:24px 0">Sin mensajes. Envía el primero.</div>`;
  } else {
    let lastDate = '';
    el.innerHTML = msgs.map(m => {
      const d = m.date ? new Date(m.date) : null;
      const dateStr = d ? d.toLocaleDateString('es-US',{weekday:'short',month:'short',day:'numeric'}) : '';
      const timeStr = d ? d.toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'}) : '';
      const isOut = m.direction !== 'inbound';
      const chBadge = m.channel === 'whatsapp'
        ? `<svg title="WhatsApp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style="flex-shrink:0"><title>WhatsApp</title><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`
        : `<svg title="Mensaje SMS" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style="flex-shrink:0"><title>Mensaje SMS</title><path fill="#0073ea" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
      let dateSep = '';
      if (dateStr !== lastDate) { dateSep = `<div style="text-align:center;margin:8px 0"><span style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:3px 12px;font-size:10px;color:var(--text2)">${dateStr}</span></div>`; lastDate = dateStr; }
      return `${dateSep}<div style="display:flex;flex-direction:column;${isOut?'align-items:flex-end':'align-items:flex-start'}">
        <div class="${isOut?'conv-msg-out':'conv-msg-in'}">${esc(m.body||'')}</div>
        <div class="conv-msg-time" style="display:flex;align-items:center;gap:4px;${isOut?'flex-direction:row-reverse':''}">${chBadge}<span>${timeStr}${isOut?' · '+esc(m.author||''):''}${m.error?` <span style="color:#e2445c">⚠️</span>`:` <span style="color:#00c875">✓</span>`}</span></div>
      </div>`;
    }).join('');
  }
  el.scrollTop = el.scrollHeight;
}

function renderConvDetail() {
  if (!_convLeadId) return;
  const lead = loadLeads(_convBoardId).find(l => l.id === _convLeadId);
  if (!lead) return;

  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || '#0073ea';
  const board = BOARDS.find(b => b.id === _convBoardId);

  const av = document.getElementById('conv-detail-avatar');
  av.textContent = initials;
  av.style.cssText = `width:44px;height:44px;border-radius:50%;background:${bg}25;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${bg};flex-shrink:0`;

  document.getElementById('conv-detail-name').textContent = lead.nombre || '—';
  document.getElementById('conv-detail-sub').textContent = lead.telefono || '';

  const rows = [
    { label: 'Teléfono',    value: lead.telefono },
    { label: 'Email',       value: lead.email },
    { label: 'Tipo lead',   value: lead.lead },
    { label: 'Asignado',    value: lead.asignado },
    { label: 'Board',       value: board ? `${board.icon} ${board.name}` : '' },
    { label: 'Resultado',   value: lead.resultado },
    { label: 'Ubicación',   value: lead.ubicacion },
    { label: 'Dirección',   value: lead.direccion },
    { label: 'Hijos',       value: lead.hijos },
    { label: 'Registro',    value: lead.creacion ? formatDate(lead.creacion) : '' },
  ].filter(r => r.value);

  document.getElementById('conv-detail-fields').innerHTML = rows.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
      <span style="font-size:11px;color:var(--text2);flex-shrink:0;padding-top:1px">${r.label}</span>
      <span style="font-size:12px;color:var(--text);font-weight:500;text-align:right;word-break:break-word">${esc(r.value)}</span>
    </div>`).join('');

  const notes = parseNotes(lead._notes).slice(-3).reverse();
  document.getElementById('conv-detail-notes').innerHTML = notes.length
    ? notes.map(n => `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:9px 11px">
        <div style="font-size:10px;color:var(--text2);margin-bottom:4px">${esc(n.author||'')} · ${n.date ? formatNoteDate(n.date) : ''}</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${esc((n.text||'').slice(0,100))}${(n.text||'').length>100?'…':''}</div>
      </div>`).join('')
    : `<div style="font-size:12px;color:var(--text2)">Sin notas.</div>`;
}

function setConvTab(tab, btn) {
  _convTab = tab;
  document.querySelectorAll('.conv-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderConvList();
}

function filterConversations(q) {
  _convSearch = q;
  renderConvList();
}

function setConvChannel(ch) {
  _convChannel = ch;
  document.getElementById('conv-ch-sms').classList.toggle('active', ch === 'sms');
  document.getElementById('conv-ch-whatsapp').classList.toggle('active', ch === 'whatsapp');
}

async function sendConvMessage() {
  if (!_convLeadId || !_convBoardId) return;
  const input = document.getElementById('conv-msg-input');
  const body = input.value.trim();
  const statusEl = document.getElementById('conv-send-status');
  if (!body) return;

  const leads = loadLeads(_convBoardId);
  const lead = leads.find(l => l.id === _convLeadId);
  if (!lead?.telefono) { statusEl.textContent = '⚠️ El lead no tiene número de teléfono.'; return; }

  statusEl.textContent = 'Enviando…';
  input.disabled = true;

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to: lead.telefono, body, channel: _convChannel, boardId: _convBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const session = getSession();
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to: lead.telefono, body, channel: _convChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: '', direction: 'outbound' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_convBoardId, leads);

    input.value = '';
    statusEl.textContent = '✓ Enviado';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    renderConvThread();
    renderConvList();
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
    statusEl.style.color = '#e2445c';
  }
  input.disabled = false;
  input.focus();
}

// ════════════════════════════════════════════
//  CREDITS PAGE  (admin + master)
// ════════════════════════════════════════════
function showCreditsPage() {
  const session = getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'master')) return;
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('credits-page').style.display = 'flex';
  document.getElementById('board-title').textContent    = 'Facturación';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-credits');
  if (navEl) navEl.classList.add('active');
  currentBoardId = null;
  loadCreditsPage();
}

function switchBillingTab(tab, el) {
  ['wallet','usage','history'].forEach(t => {
    const p = document.getElementById(`billing-pane-${t}`);
    if (p) p.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.billing-tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}
function switchBillingSubtab(tab, el) {
  const s = document.getElementById('cp-wallet-summary');
  const d = document.getElementById('cp-wallet-detailed');
  if (s) s.style.display = tab === 'summary' ? 'block' : 'none';
  if (d) d.style.display = tab === 'detailed' ? 'block' : 'none';
  document.querySelectorAll('.billing-subtab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

async function loadCreditsPage() {
  loadAutoRechargeSettings().catch(() => {});
  const agentsEl = document.getElementById('cp-agents');
  const boardsEl = document.getElementById('cp-boards');
  const txEl     = document.getElementById('cp-transactions');
  const rechargeEl = document.getElementById('cp-recharge-history');
  const dollarEl = document.getElementById('cp-dollar-balance');
  const creditsEl = document.getElementById('cp-credits-detail');
  const walletStatsEl = document.getElementById('cp-wallet-stats');
  if (!txEl) return;
  const session = getSession();
  const isMaster = session && session.role === 'master';
  const loading = '<div style="color:var(--text2);font-size:12px;padding:8px 0">Cargando…</div>';
  if (agentsEl) agentsEl.innerHTML = loading;
  if (boardsEl) boardsEl.innerHTML = loading;
  if (txEl) txEl.innerHTML = loading;
  if (rechargeEl) rechargeEl.innerHTML = loading;

  const desde = document.getElementById('cp-desde')?.value || '';
  const hasta  = document.getElementById('cp-hasta')?.value  || '';

  // Global credits balance
  const { data: credRow } = await supa.from('kv_store').select('value').eq('key', 'gew_credits_global').maybeSingle();
  const totalCredits = parseInt(credRow?.value || '0');
  await loadMsgPrices();
  const avgPrice = _avgMsgPrice();
  if (dollarEl) dollarEl.textContent = '$' + (totalCredits * avgPrice).toFixed(2);
  if (creditsEl) creditsEl.textContent = totalCredits.toLocaleString() + ' créditos';

  // Transactions
  const { data: txRows } = await supa.from('kv_store').select('key,value').like('key', 'gew_msg_tx_%').order('key', { ascending: false });

  // Per-agent and per-board usage from leads (filtered by date)
  const agentMap = {};
  const boardSentMap = {};
  let totalSent = 0, totalSMS = 0, totalWA = 0;
  BOARDS.forEach(b => {
    let bsms = 0, bwa = 0;
    loadLeads(b.id).forEach(l => {
      JSON.parse(l._messages || '[]').forEach(m => {
        if (m.error || m.direction === 'inbound') return;
        const mDate = m.date ? m.date.slice(0, 10) : '';
        if (desde && mDate < desde) return;
        if (hasta  && mDate > hasta)  return;
        const author = m.author || 'Desconocido';
        if (!agentMap[author]) agentMap[author] = { sms: 0, wa: 0 };
        if (m.channel === 'whatsapp') { agentMap[author].wa++; bwa++; totalWA++; }
        else                          { agentMap[author].sms++; bsms++; totalSMS++; }
        totalSent++;
      });
    });
    boardSentMap[b.id] = { name: b.name, icon: b.icon, sms: bsms, wa: bwa };
  });

  // Wallet stats mini row
  const revenue = totalSMS * _msgPriceSMS + totalWA * _msgPriceWA;
  const myCost  = totalSMS * _msgCostSMS  + totalWA * _msgCostWA;
  const profit  = revenue - myCost;
  const baseStats = [
    { label: 'Mensajes enviados', val: totalSent, color: 'var(--text)', icon: '📤' },
    { label: 'SMS',               val: totalSMS,  color: '#fbbf24',     icon: '📱' },
    { label: 'WhatsApp',          val: totalWA,   color: '#25d366',     icon: '💬' },
  ];
  const masterStats = [
    { label: 'Ingresos',          val: '$'+revenue.toFixed(2), color: 'var(--accent)', icon: '💰' },
    { label: 'Mi costo (Twilio)', val: '$'+myCost.toFixed(2),  color: '#e2445c',       icon: '💸' },
    { label: 'Ganancia neta',     val: '$'+profit.toFixed(2),  color: profit>=0 ? '#00c875' : '#e2445c', icon: '📈' },
  ];
  const statsToShow = isMaster ? [...baseStats, ...masterStats] : baseStats;
  const masterSeparator = isMaster
    ? `<div style="width:1px;background:var(--border);margin:0 4px;align-self:stretch"></div><div style="display:flex;flex-direction:column;justify-content:center"><span class="emblem-dev" style="margin-left:0">🙈 Solo yo</span></div>`
    : '';
  if (walletStatsEl) walletStatsEl.innerHTML = baseStats.map(c => `<div style="display:flex;flex-direction:column;gap:2px">
    <span style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${c.icon} ${c.label}</span>
    <span style="font-size:18px;font-weight:700;color:${c.color}">${c.val}</span>
  </div>`).join('') + (isMaster ? masterSeparator + masterStats.map(c => `<div style="display:flex;flex-direction:column;gap:2px">
    <span style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${c.icon} ${c.label}</span>
    <span style="font-size:18px;font-weight:700;color:${c.color}">${c.val}</span>
  </div>`).join('') : '');

  // Top consumers
  const agentList = Object.entries(agentMap).sort((a, b) => (b[1].sms + b[1].wa) - (a[1].sms + a[1].wa));
  if (agentList.length) {
    const maxTotal = agentList[0][1].sms + agentList[0][1].wa;
    agentsEl.innerHTML = agentList.map(([name, d]) => {
      const total = d.sms + d.wa;
      const pct = maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0;
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:rgba(0,115,234,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">${(name[0]||'?').toUpperCase()}</div>
          <span style="font-size:13px;color:var(--text);font-weight:600;flex:1">${esc(name)}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text)">${total}</span>
          <span style="font-size:11px;color:var(--text2)">msgs</span>
          <span style="font-size:11px;color:var(--text2)">📱 ${d.sms}</span>
          <span style="font-size:11px;color:#25d366">💬 ${d.wa}</span>
        </div>
        <div style="background:var(--card2);border-radius:4px;height:5px;overflow:hidden">
          <div style="background:var(--accent);width:${pct}%;height:100%;border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');
  } else {
    agentsEl.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:8px 0">${desde||hasta ? 'Sin mensajes en el período seleccionado.' : 'Sin mensajes enviados aún.'}</div>`;
  }

  // Usage per board (no per-board credits, just sent counts)
  boardsEl.innerHTML = BOARDS.map(b => {
    const sent = boardSentMap[b.id] || { sms: 0, wa: 0 };
    const total = sent.sms + sent.wa;
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:16px">${b.icon}</span>
      <span style="font-size:13px;color:var(--text);font-weight:600;flex:1;min-width:100px">${esc(b.name)}</span>
      <span style="font-size:11px;color:var(--text2)">📱 <strong style="color:var(--text)">${sent.sms}</strong> SMS</span>
      <span style="font-size:11px;color:var(--text2)">💬 <strong style="color:#25d366">${sent.wa}</strong> WA</span>
      <span style="font-size:13px;font-weight:700;color:var(--text)">${total}</span>
      <span style="font-size:11px;color:var(--text2)">enviados</span>
    </div>`;
  }).join('') || `<div style="color:var(--text2);font-size:12px">Sin boards.</div>`;

  // Transaction history with date filter
  const filteredTx = (txRows || []).filter(r => {
    try {
      const tx = JSON.parse(r.value);
      const d = tx.date ? tx.date.slice(0, 10) : '';
      if (desde && d < desde) return false;
      if (hasta  && d > hasta)  return false;
      return true;
    } catch { return false; }
  });
  const renderTxRow = (r) => {
    try {
      const tx = JSON.parse(r.value);
      const isManual = tx.manual;
      const dateStr = tx.date ? new Date(tx.date).toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const usd = isManual ? '—' : '$' + (tx.amount/100).toFixed(2);
      const tag = isManual
        ? `<span style="background:rgba(251,191,36,.12);color:#d97706;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:700;flex-shrink:0">Manual</span>`
        : `<span style="background:rgba(0,115,234,.1);color:#0073ea;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:700;flex-shrink:0">Stripe</span>`;
      return `<div class="billing-tx-row">
        ${tag}
        <span style="color:var(--text2);flex:1;font-size:12px">${dateStr}</span>
        <span style="color:var(--text);font-weight:600;font-size:13px">+${tx.credits.toLocaleString()} créditos</span>
        <span style="color:var(--text2);font-size:12px;min-width:60px;text-align:right">${usd}</span>
      </div>`;
    } catch { return ''; }
  };
  const noTx = `<div style="color:var(--text2);font-size:12px;padding:16px 0;text-align:center">Sin recargas ${desde||hasta ? 'en el período seleccionado' : 'registradas'}.</div>`;
  txEl.innerHTML = filteredTx.length ? filteredTx.map(renderTxRow).join('') : noTx;
  if (rechargeEl) rechargeEl.innerHTML = filteredTx.length ? filteredTx.map(renderTxRow).join('') : noTx;
}

// ── Messaging prices (developer-configurable) ──
const _PKG_CREDITS = [100, 500, 1000, 5000];
let _buyPkgSelected = null;
let _msgPriceSMS = 0.016;   // sell price per SMS
let _msgPriceWA  = 0.016;   // sell price per WhatsApp
let _msgCostSMS  = 0.0075;  // Twilio cost per SMS
let _msgCostWA   = 0.005;   // Twilio cost per WhatsApp

async function loadMsgPrices() {
  const { data: rows } = await supa.from('kv_store').select('key,value')
    .in('key', ['gew_price_sms','gew_price_wa','gew_cost_sms','gew_cost_wa']);
  (rows || []).forEach(r => {
    const v = parseFloat(r.value);
    if (!isNaN(v) && v > 0) {
      if (r.key === 'gew_price_sms') _msgPriceSMS = v;
      if (r.key === 'gew_price_wa')  _msgPriceWA  = v;
      if (r.key === 'gew_cost_sms')  _msgCostSMS  = v;
      if (r.key === 'gew_cost_wa')   _msgCostWA   = v;
    }
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('msg-price-sms', _msgPriceSMS);
  set('msg-price-wa',  _msgPriceWA);
  set('msg-cost-sms',  _msgCostSMS);
  set('msg-cost-wa',   _msgCostWA);
  const cur = document.getElementById('msg-price-current');
  if (cur) cur.textContent = `Venta SMS $${_msgPriceSMS} · WA $${_msgPriceWA} | Costo SMS $${_msgCostSMS} · WA $${_msgCostWA}`;
}

async function saveMsgPrices() {
  const vals = {
    'gew_price_sms': parseFloat(document.getElementById('msg-price-sms')?.value),
    'gew_price_wa':  parseFloat(document.getElementById('msg-price-wa')?.value),
    'gew_cost_sms':  parseFloat(document.getElementById('msg-cost-sms')?.value),
    'gew_cost_wa':   parseFloat(document.getElementById('msg-cost-wa')?.value),
  };
  if (Object.values(vals).some(v => isNaN(v) || v <= 0)) { showToast('Valores inválidos', 'error'); return; }
  for (const [key, value] of Object.entries(vals)) {
    await supa.from('kv_store').upsert({ key, value: String(value) });
  }
  _msgPriceSMS = vals['gew_price_sms']; _msgPriceWA = vals['gew_price_wa'];
  _msgCostSMS  = vals['gew_cost_sms'];  _msgCostWA  = vals['gew_cost_wa'];
  const st = document.getElementById('msg-price-status');
  if (st) { st.textContent = '✓ Guardado'; setTimeout(() => { if(st) st.textContent=''; }, 2500); }
  const cur = document.getElementById('msg-price-current');
  if (cur) cur.textContent = `Venta SMS $${_msgPriceSMS} · WA $${_msgPriceWA} | Costo SMS $${_msgCostSMS} · WA $${_msgCostWA}`;
  showToast('Precios actualizados ✓', 'success');
}

// ── Buy credits modal ──
function _avgMsgPrice() { return (_msgPriceSMS + _msgPriceWA) / 2; }

function openBuyCreditsModal() {
  _buyPkgSelected = null;
  const avgPrice = _avgMsgPrice();
  document.getElementById('buy-pkg-grid').innerHTML = _PKG_CREDITS.map(credits => {
    const id    = `pkg_${credits}`;
    const total = (credits * avgPrice).toFixed(2);
    return `<div onclick="selectBuyPkg('${id}',this)" data-pkg="${id}" data-credits="${credits}" data-cents="${Math.round(credits * avgPrice * 100)}"
      style="border:2px solid var(--border);border-radius:10px;padding:14px 10px;cursor:pointer;text-align:center;transition:border-color .12s,background .12s">
      <div style="font-size:18px;font-weight:700;color:var(--accent)">${credits.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--text2);margin:2px 0 6px">mensajes</div>
      <div style="font-size:14px;font-weight:700;color:var(--text)">$${total}</div>
    </div>`;
  }).join('');
  document.getElementById('buy-credits-overlay').classList.add('open');
}
function closeBuyCreditsModal() { document.getElementById('buy-credits-overlay').classList.remove('open'); }
function selectBuyPkg(id, el) {
  _buyPkgSelected = id;
  document.querySelectorAll('#buy-pkg-grid > div').forEach(c => {
    const sel = c.dataset.pkg === id;
    c.style.borderColor = sel ? 'var(--accent)' : 'var(--border)';
    c.style.background  = sel ? 'rgba(0,115,234,.08)' : '';
  });
}
async function confirmBuyCredits() {
  if (!_buyPkgSelected) { showToast('Selecciona un paquete', 'error'); return; }
  const pkgEl = document.querySelector(`#buy-pkg-grid [data-pkg="${_buyPkgSelected}"]`);
  const unitPriceCents = pkgEl ? parseInt(pkgEl.dataset.cents) : 0;
  const btn = document.getElementById('buy-confirm-btn');
  btn.textContent = 'Procesando…'; btn.disabled = true;
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ packageId: _buyPkgSelected, boardId: 'global', boardName: 'Equipo',
        unitPriceCents,
        successUrl: window.location.origin + window.location.pathname + '?payment=success',
        cancelUrl:  window.location.origin + window.location.pathname + '?payment=cancel' }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.location.href = data.url;
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    btn.textContent = 'Ir a pagar →'; btn.disabled = false;
  }
}

// ── Auto-recharge ──
let _autochargeEnabled = true;  // always on
let _autochargeThreshold = 50;
let _autochargePackage = 'pkg_500';

async function loadAutoRechargeSettings() {
  const { data: rows } = await supa.from('kv_store').select('key,value')
    .in('key', ['gew_autocharge_threshold','gew_autocharge_package',
                'gew_stripe_customer_id','gew_stripe_payment_method',
                'gew_stripe_card_last4','gew_stripe_card_brand']);
  const get = k => rows?.find(r => r.key === k)?.value;

  _autochargeThreshold = parseInt(get('gew_autocharge_threshold') || '50');
  _autochargePackage   = get('gew_autocharge_package') || 'pkg_500';

  const thr = document.getElementById('ar-threshold');
  const pkg = document.getElementById('ar-package');
  if (thr) thr.value = _autochargeThreshold;
  if (pkg) pkg.value = _autochargePackage;

  const cardEl = document.getElementById('ar-card-info');
  if (cardEl) {
    const last4 = get('gew_stripe_card_last4');
    const brand = get('gew_stripe_card_brand');
    const pmId  = get('gew_stripe_payment_method');
    if (pmId && last4) {
      const brandLabel = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Tarjeta';
      cardEl.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px 16px">
          <span style="font-size:22px">💳</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${brandLabel} •••• ${last4}</div>
            <div style="font-size:11px;color:#00c875;margin-top:2px">✓ Tarjeta guardada</div>
          </div>
        </div>`;
    } else {
      cardEl.innerHTML = `<div style="font-size:12px;color:var(--text2);padding:10px 0">⚠️ No hay tarjeta guardada. Agrega una para habilitar la auto-recarga.</div>`;
    }
  }
}

async function saveAutoRechargeSettings() {
  const thr = document.getElementById('ar-threshold');
  const pkg = document.getElementById('ar-package');
  const st  = document.getElementById('ar-save-status');
  _autochargeThreshold = parseInt(thr?.value || '50');
  _autochargePackage   = pkg?.value || 'pkg_500';
  try {
    await Promise.all([
      supa.from('kv_store').upsert({ key: 'gew_autocharge_threshold', value: String(_autochargeThreshold) }),
      supa.from('kv_store').upsert({ key: 'gew_autocharge_package',   value: _autochargePackage }),
    ]);
    if (st) { st.textContent = '✓ Guardado'; setTimeout(() => { if(st) st.textContent = ''; }, 2500); }
  } catch(e) {
    if (st) st.textContent = 'Error al guardar';
  }
}

async function setupPaymentMethod() {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-setup-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        successUrl: window.location.origin + window.location.pathname + '?setup=success',
        cancelUrl:  window.location.origin + window.location.pathname + '?setup=cancel',
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.location.href = data.url;
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function triggerAutoRecharge() {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/auto-recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ Auto-recarga: +${data.creditsAdded} créditos agregados`, 'success');
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.newBalance; cv.style.color = 'var(--accent)'; }
    }
  } catch(_) { /* silent – don't interrupt user flow */ }
}

async function loadMessagingDashboard() {
  const summaryEl = document.getElementById('msg-dash-summary');
  const creditsEl = document.getElementById('msg-dash-credits');
  const txEl      = document.getElementById('msg-dash-transactions');
  const sentEl    = document.getElementById('msg-dash-sent');
  if (!summaryEl) return;

  summaryEl.innerHTML = creditsEl.innerHTML = txEl.innerHTML = sentEl.innerHTML =
    '<div style="color:var(--text2);font-size:12px">Cargando…</div>';

  // Load global credits from Supabase
  const { data: globalCredRow } = await supa.from('kv_store').select('value').eq('key', 'gew_credits_global').maybeSingle();
  const totalGlobalCredits = parseInt(globalCredRow?.value || '0');
  const credMap = { global: totalGlobalCredits };

  // Load transactions
  const { data: txRows } = await supa.from('kv_store').select('key,value').like('key', 'gew_msg_tx_%').order('key', { ascending: false });

  // Count messages sent per board from leads
  const sentMap = {};
  let totalSent = 0, totalSMS = 0, totalWA = 0;
  BOARDS.forEach(b => {
    const leads = loadLeads(b.id);
    let sms = 0, wa = 0;
    leads.forEach(l => {
      const msgs = JSON.parse(l._messages || '[]');
      msgs.forEach(m => { if (!m.error) { m.channel === 'whatsapp' ? wa++ : sms++; } });
    });
    sentMap[b.id] = { sms, wa, name: b.name, icon: b.icon };
    totalSent += sms + wa; totalSMS += sms; totalWA += wa;
  });

  const totalCredits = totalGlobalCredits;

  // Summary cards
  summaryEl.innerHTML = [
    { label: 'Créditos globales', val: totalCredits, color: 'var(--accent)', icon: '💳' },
    { label: 'Mensajes enviados', val: totalSent, color: '#00c875', icon: '📤' },
    { label: 'SMS', val: totalSMS, color: '#fbbf24', icon: '📱' },
    { label: 'WhatsApp', val: totalWA, color: '#25d366', icon: '💬' },
    { label: 'Recargas', val: (txRows || []).length, color: '#a78bfa', icon: '🧾' },
  ].map(c => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px">
      <div style="font-size:20px;margin-bottom:6px">${c.icon}</div>
      <div style="font-size:24px;font-weight:700;color:${c.color}">${c.val}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:3px;text-transform:uppercase;letter-spacing:.4px">${c.label}</div>
    </div>`).join('');

  // Global credits card
  const gColor = totalCredits === 0 ? '#e2445c' : totalCredits < 20 ? '#fbbf24' : '#00c875';
  creditsEl.innerHTML = `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--card);border:1px solid var(--border);border-radius:10px">
    <span style="font-size:20px">🌐</span>
    <span style="font-size:14px;color:var(--text);font-weight:600;flex:1">Saldo global del equipo</span>
    <span style="font-size:20px;font-weight:700;color:${gColor}">${totalCredits}</span>
    <span style="font-size:12px;color:var(--text2)">créditos</span>
    <button onclick="openAddCreditsModal()" style="padding:5px 14px;border-radius:7px;border:1px solid rgba(0,115,234,.4);background:rgba(0,115,234,.1);color:var(--accent);font-family:var(--font);font-size:11px;font-weight:600;cursor:pointer">+ Agregar</button>
  </div>`;

  // Transactions
  txEl.innerHTML = (txRows && txRows.length) ? txRows.map(r => {
    try {
      const tx = JSON.parse(r.value);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;font-size:12px">
        <span style="color:#a78bfa;font-weight:700">+${tx.credits}</span>
        <span style="color:var(--text2)">créditos</span>
        <span style="color:var(--text);flex:1">${esc(tx.boardName || tx.boardId)}</span>
        <span style="color:#00c875;font-weight:600">$${(tx.amount/100).toFixed(2)}</span>
        <span style="color:var(--text2)">${tx.date ? new Date(tx.date).toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</span>
      </div>`;
    } catch { return ''; }
  }).join('') : '<div style="color:var(--text2);font-size:12px;padding:8px 0">Sin recargas registradas aún.</div>';

  // Messages sent per board
  sentEl.innerHTML = Object.values(sentMap).filter(b => b.sms + b.wa > 0).sort((a,b) => (b.sms+b.wa)-(a.sms+a.wa)).map(b => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px">
      <span style="font-size:15px">${b.icon}</span>
      <span style="font-size:13px;color:var(--text);flex:1">${esc(b.name)}</span>
      <span style="font-size:11px;color:var(--text2)">📱 SMS: <strong style="color:var(--text)">${b.sms}</strong></span>
      <span style="font-size:11px;color:var(--text2)">💬 WA: <strong style="color:#25d366">${b.wa}</strong></span>
    </div>`).join('') || '<div style="color:var(--text2);font-size:12px;padding:8px 0">Sin mensajes enviados aún.</div>';
}

function openAddCreditsModal() {
  const n = prompt('¿Cuántos créditos agregar al saldo global del equipo?');
  if (!n || isNaN(parseInt(n)) || parseInt(n) <= 0) return;
  addCreditsGlobal(parseInt(n));
}

async function addCreditsGlobal(amount) {
  const credKey = 'gew_credits_global';
  const { data: existing } = await supa.from('kv_store').select('value').eq('key', credKey).maybeSingle();
  const current = parseInt(existing?.value || '0');
  const updated = current + amount;
  await supa.from('kv_store').upsert({ key: credKey, value: String(updated) });

  // Log transaction
  const txKey = `gew_msg_tx_${Date.now()}`;
  await supa.from('kv_store').upsert({ key: txKey, value: JSON.stringify({ boardId: 'global', boardName: 'Equipo', credits: amount, amount: 0, date: new Date().toISOString(), manual: true }) });

  loadMessagingDashboard();
}

async function loadMsgCredits(boardId) {
  const cv = document.getElementById('msg-credits-val');
  if (!cv) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', `gew_credits_${boardId}`).maybeSingle();
    const n = parseInt(data?.value || '0');
    cv.textContent = n;
    cv.style.color = n < 10 ? '#e2445c' : 'var(--accent)';
  } catch { cv.textContent = '0'; }
}

function openRechargeModal() {
  document.getElementById('recharge-status').textContent = '';
  document.getElementById('recharge-modal-overlay').classList.add('open');
}
function closeRechargeModal() {
  document.getElementById('recharge-modal-overlay').classList.remove('open');
}

async function startCheckout(packageId) {
  const statusEl = document.getElementById('recharge-status');
  statusEl.textContent = 'Redirigiendo a Stripe…';
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ packageId, boardId: _notesBoardId, boardName: (BOARDS.find(b=>b.id===_notesBoardId)||{}).name || _notesBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.open(data.url, '_blank');
    closeRechargeModal();
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
    statusEl.style.color = '#e2445c';
  }
}

let _msgPollInterval = null;

function _startMsgPolling() {
  _stopMsgPolling();
  _msgPollInterval = setInterval(async () => {
    if (!_notesLeadId || !_notesBoardId) return;
    try {
      await loadFromSupabase();
      const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
      if (lead) _renderMsgJournal(lead);
    } catch(_) {}
  }, 6000); // every 6 seconds
}

function _stopMsgPolling() {
  if (_msgPollInterval) { clearInterval(_msgPollInterval); _msgPollInterval = null; }
}

function closeNotesPanel() {
  document.getElementById('notes-panel-overlay').classList.remove('open');
  _notesBoardId = null;
  _notesLeadId  = null;
  _notesNavList = [];
  _stopMsgPolling();
}

function npDeleteLead() {
  if (!_notesLeadId || !_notesBoardId) return;
  const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
  if (!lead) return;
  if (lead.asignado && lead.asignado !== 'Sin asignar') {
    if (!confirm(`⚠️ Este lead está asignado a ${lead.asignado}.\n¿Seguro que quieres eliminarlo? El agente perderá acceso.`)) return;
  } else {
    if (!confirm(`¿Eliminar a ${lead.nombre || 'este lead'}?`)) return;
  }
  closeNotesPanel();
  softDeleteLead(_notesLeadId, _notesBoardId);
  renderTable();
  showToast('Lead movido a Eliminados', 'error');
}

async function submitNote() {
  const text    = document.getElementById('notes-new-input').value.trim();
  const newRes  = document.getElementById('notes-resultado-sel').value;
  if (!_notesBoardId || !_notesLeadId) return;

  const leads = loadLeads(_notesBoardId);
  const lead  = leads.find(l => l.id === _notesLeadId);
  if (!lead) return;

  // newRes === '' means user didn't touch the dropdown — don't change resultado
  const resSelected = newRes !== '';
  if (!text && !resSelected) { showToast('Escribe una nota o selecciona un resultado', 'error'); return; }

  const session = getSession();
  const notes   = parseNotes(lead._notes);
  const now     = new Date().toISOString();
  const author  = session ? session.name : 'Usuario';

  if (resSelected) {
    lead.resultado = newRes;
    notes.push({
      text:   `Resultado: ${newRes}`,
      author, date: now, system: true
    });
  }
  if (text) {
    notes.push({ text, author, date: now });
  }

  lead._notes = JSON.stringify(notes);
  await saveLeads(_notesBoardId, leads, { isNote: true });
  document.getElementById('notes-new-input').value = '';
  _renderNotesJournal(lead);
  if (resSelected) {
    // refresh info grid and tags after resultado change
    document.getElementById('np-info-grid').querySelectorAll('div').forEach((el,i) => {
      if (i === 3) { const s = el.querySelector('span:last-child'); if(s) s.textContent = lead.resultado||'—'; }
    });
    const npChips2 = [
      lead.telefono  && { label:`📞 ${lead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
      lead.ubicacion && { label:`📍 ${lead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
      lead.asignado  && { label:`👤 ${lead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
    ].filter(Boolean);
    document.getElementById('notes-lead-summary').innerHTML = npChips2.map(ch =>
      `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
    ).join('');
    renderTableKeepSelection();
  }
  showToast('Guardado ✓', 'success');
}

// ════════════════════════════════════════════
//  FORCE CHANGE PASSWORD
// ════════════════════════════════════════════
async function submitForceChangePass() {
  const p1  = document.getElementById('fcp-pass1').value;
  const p2  = document.getElementById('fcp-pass2').value;
  const err = document.getElementById('fcp-error');
  if (p1.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (p1 !== p2)     { err.textContent = 'Las contraseñas no coinciden.'; return; }
  err.textContent = '';

  const session = getSession();
  if (!session) return;
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === session.id);
  if (idx !== -1) {
    users[idx].password          = p1;
    users[idx].mustChangePassword = false;
    await saveUsers(users);
    setSession({ ...session, mustChangePassword: false });
  }
  document.getElementById('force-pass-overlay').style.display = 'none';
  document.getElementById('fcp-pass1').value = '';
  document.getElementById('fcp-pass2').value = '';
  showToast('✅ Contraseña actualizada', 'success');
  try { initApp(session); updatePendingBadge(); updateTrashBadge(); } catch(e) { console.error(e); }
}

// ════════════════════════════════════════════
//  GOOGLE DRIVE BACKUP
// ════════════════════════════════════════════
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let _driveTokenClient = null;
let _driveAccessToken = null;

function _initDriveClient(callback) {
  if (!window.google || !google.accounts) {
    showToast('Google API no cargada aún, intenta de nuevo', 'error'); return;
  }
  if (_driveTokenClient) { _driveTokenClient._cb = callback; _driveTokenClient.requestAccessToken(); return; }
  _driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) { showToast('Error al conectar con Google Drive', 'error'); return; }
      _driveAccessToken = resp.access_token;
      if (_driveTokenClient._cb) _driveTokenClient._cb();
    }
  });
  _driveTokenClient._cb = callback;
  _driveTokenClient.requestAccessToken();
}

async function exportBackupToDrive() {
  const btn = document.getElementById('btn-drive-backup');
  if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }
  _initDriveClient(async () => {
    try {
      const backup = { version: 1, exportedAt: new Date().toISOString(), data: {} };
      Object.keys(localStorage).forEach(k => { backup.data[k] = localStorage.getItem(k); });
      const json = JSON.stringify(backup, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `GrupoElite_CRM_Respaldo_${date}.json`;

      // Check if file already exists (same name) to update instead of duplicate
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'&spaces=drive&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${_driveAccessToken}` } }
      );
      const searchData = await searchRes.json();
      const existing = searchData.files && searchData.files[0];

      const metadata = { name: fileName, mimeType: 'application/json' };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([json], { type: 'application/json' }));

      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const method = existing ? 'PATCH' : 'POST';

      const uploadRes = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${_driveAccessToken}` },
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Error al subir a Drive');

      const info = document.getElementById('backup-export-info');
      const keys = Object.keys(backup.data).length;
      if (info) info.innerHTML = `✅ Guardado en Google Drive: <strong>${fileName}</strong> — ${keys} registros`;
      logActivity('backup_drive', 'Respaldo subido a Google Drive', fileName);
      showToast('✅ Respaldo guardado en Google Drive', 'success');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.google.com/images/icons/product/drive-32.png" style="width:16px;height:16px" /> Guardar en Google Drive'; }
  });
}

// ════════════════════════════════════════════
//  BACKUP & RESTORE
// ════════════════════════════════════════════
const BACKUP_KEYS = [
  'gew_users', 'gew_virtual_users', 'gew_session',
  'gew_activity_log', 'gew_calendar', 'gew_terms',
  'gew_appname', 'gew_lead_types', 'gew_columns',
  'gew_ubicaciones_boards'
];

function exportBackup() {
  const backup = { version: 1, exportedAt: new Date().toISOString(), data: {} };

  // Collect all localStorage keys (static + dynamic board keys)
  Object.keys(localStorage).forEach(k => {
    backup.data[k] = localStorage.getItem(k);
  });

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `GrupoElite_CRM_Respaldo_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const info = document.getElementById('backup-export-info');
  const keys = Object.keys(backup.data).length;
  if (info) info.textContent = `✓ Respaldo exportado — ${keys} registros — ${date}`;
  logActivity('backup_export', 'Respaldo exportado', `${keys} claves`);
}

let _restoreData = null;
function previewRestore(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('backup-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.data) throw new Error('Archivo inválido');
      _restoreData = backup;
      const keys = Object.keys(backup.data).length;
      const date = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('es') : 'desconocida';
      const preview = document.getElementById('backup-preview');
      const info    = document.getElementById('backup-preview-info');
      info.innerHTML = `📅 <strong>Fecha del respaldo:</strong> ${esc(date)}<br>📦 <strong>Registros:</strong> ${keys}<br><br>Al restaurar, todos los datos actuales serán reemplazados por los de este archivo.`;
      preview.style.display = 'block';
    } catch(err) {
      showToast('Archivo de respaldo inválido', 'error');
      _restoreData = null;
    }
  };
  reader.readAsText(file);
}

async function confirmBackupRestore() {
  if (!_restoreData) return;
  if (!confirm('¿Estás seguro? Esto reemplazará TODOS los datos actuales con los del respaldo. Esta acción no se puede deshacer.')) return;
  try {
    // Clear and restore localStorage — only trusted gew_ keys
    const validEntries = Object.entries(_restoreData.data).filter(([k]) => k.startsWith('gew_'));
    localStorage.clear();
    validEntries.forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));

    // Sync all keys to Supabase
    for (const [k, v] of validEntries) {
      await supaSync(k, typeof v === 'string' ? v : JSON.stringify(v));
    }

    logActivity('backup_restore', 'Respaldo restaurado', `${Object.keys(_restoreData.data).length} claves`);
    showToast('✅ Respaldo restaurado correctamente. Recargando…', 'success');
    setTimeout(() => location.reload(), 2000);
  } catch(e) {
    showToast('Error al restaurar: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════
//  SUPABASE
// ════════════════════════════════════════════
const SUPA_URL = 'https://vpwbczzmonboirjckpmy.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd2Jjenptb25ib2lyamNrcG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjAwMDUsImV4cCI6MjA5MjI5NjAwNX0._JCs7b6xMKgqskbCAdg6j9nW6UdMfPRPcwScLp9YCZM';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);

// Track keys this client just wrote so we don't re-apply our own changes
const _ownWrites = new Map();

async function supaSync(key, value) {
  try {
    _ownWrites.set(key, Date.now());
    const { error } = await supa.from('kv_store').upsert({ key, value }, { onConflict: 'key' });
    if (error) { console.error('supaSync error:', key, error.message); return false; }
    return true;
  } catch(e) {
    console.error('supaSync exception:', key, e);
    return false;
  }
}

// ── Real-time live sync ──────────────────────
function initRealtimeSync() {
  const ch = supa.channel('crm_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
      const key = payload.new?.key;
      const val = payload.new?.value;
      if (!key || !key.startsWith('gew_')) return;
      // Skip changes this client wrote within the last 4 s
      const own = _ownWrites.get(key);
      if (own && Date.now() - own < 4000) return;
      localStorage.setItem(key, val);
      _applyRealtimeKey(key);
    })
    .subscribe();
  window.addEventListener('beforeunload', () => supa.removeChannel(ch), { once: true });
}

function _applyRealtimeKey(key) {
  const session = getSession();
  if (!session) return;

  if (key.startsWith('gew_leads_')) {
    const boardId = key.slice('gew_leads_'.length);
    _boardCountCache.delete(boardId); // #4 invalidate stale count on external update
    if (currentBoardId === boardId) renderTableKeepSelection();
    else if (currentBoardId === '__agent__') renderTableKeepSelection();
    updateTabCounts();
    updateTrashBadge();
    return;
  }
  if (key === TRASH_KEY || key === 'gew_deleted_leads') {
    updateTrashBadge();
    const tp = document.getElementById('trash-page');
    if (tp && tp.classList.contains('visible')) renderTrashTable();
    return;
  }
  if (key === 'gew_users') {
    populateAgentFilter();
    const ug = document.getElementById('users-grid');
    if (ug) renderUsersGrid();
    renderTableKeepSelection();
    return;
  }
  if (key === 'gew_calendar_events') {
    if (typeof renderCalendar === 'function') renderCalendar();
    return;
  }
  if (key === PENDING_KEY) {
    updatePendingBadge();
    const reqTab = document.getElementById('stab-requests');
    if (reqTab && reqTab.classList.contains('active')) renderPendingList();
    return;
  }
}

async function loadFromSupabase() {
  try {
    const { data, error } = await supa.from('kv_store').select('key, value');
    if (error) { console.error('Supabase load error:', error.message); return; }
    if (data && data.length > 0) {
      // Build a map of all remote data first so we can cross-reference during merge
      const remoteMap = {};
      data.forEach(row => { remoteMap[row.key] = row.value; });

      // Collect deleted user IDs from the remote batch to prevent resurrection
      let deletedUserIds = new Set();
      try {
        const deletedRemote = JSON.parse(remoteMap[DELETED_USERS_KEY] || '[]');
        deletedRemote.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
      } catch(_) {}
      // Also include any locally tracked deleted users
      try {
        const deletedLocal = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '[]');
        deletedLocal.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
      } catch(_) {}

      data.forEach(row => {
        if (row.key === USERS_KEY) {
          try {
            const remote = JSON.parse(row.value) || [];
            const local  = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
            const merged = [...remote];
            const remoteIds = new Set(remote.map(ru => ru.id));
            // Only add local users not in remote AND not previously deleted
            local.forEach(lu => {
              if (!remoteIds.has(lu.id) && !deletedUserIds.has(lu.id)) {
                merged.push(lu);
              }
            });
            localStorage.setItem(row.key, JSON.stringify(merged));
          } catch { localStorage.setItem(row.key, row.value); }
        } else {
          localStorage.setItem(row.key, row.value);
        }
      });
    }
  } catch(e) {
    console.error('Supabase unreachable:', e);
  }
}

// ════════════════════════════════════════════
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
