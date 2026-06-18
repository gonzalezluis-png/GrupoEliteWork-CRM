// ════════════════════════════════════════════
//  MIGRATION LOCK
// ════════════════════════════════════════════
const SYSTEM_FROZEN  = true;
const _MIGRATION_URL = 'https://crm.m2base.com/';

let _migrationToastShown = false;
function _showMigrationNotice() {
  if (typeof showToast === 'function') {
    showToast('Sistema migrado a crm.m2base.com — contacta a tu manager para más info.', 'error');
  } else if (!_migrationToastShown) {
    _migrationToastShown = true;
    alert('Este sistema ha sido migrado a ' + _MIGRATION_URL + '\nPara más información contacta con tu manager.');
    _migrationToastShown = false;
  }
}

function _initFreezeUI() {
  if (!SYSTEM_FROZEN) return;
  try {
    const el = document.getElementById('btn-new-lead');
    if (el) el.style.display = 'none';
    const strip = document.getElementById('assign-strip');
    if (strip) strip.classList.add('hidden');
  } catch(_) {}
}

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
  'BUZÓN DE VOZ','CITA AGENDADA','CITA REAGENDADA','CLIENTE ACTIVO','PENDIENTE','SIN RESULTADO','VENDIDO! 🏆'
];

const DEFAULT_BOARDS = [
  { id: 'dallas',     name: 'LEAD DALLAS',              icon: '🏙️',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Dallas'] },
  { id: 'austin',     name: 'LEAD AUSTIN - SAN ANTONIO', icon: '🤠',  hasCaller: false,  hasSolicitudes: false,  ubicaciones: ['Austin','San Antonio'] },
  { id: 'connecticut',name: 'LEAD CONNECTICUT',          icon: '🏛️',  hasCaller: false, hasSolicitudes: false, ubicaciones: ['Connecticut'] },
  { id: 'florida',    name: 'LEAD FLORIDA',              icon: '🌴',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Miami','Orlando','Tampa','Fort Lauderdale'] },
  { id: 'jacksonville', name: 'LEAD JACKSONVILLE',       icon: '🌊',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Jacksonville'] },
  { id: 'georgia',    name: 'LEAD GEORGIA',              icon: '🍑',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Atlanta','Savannah','Augusta','Columbus'] },
  { id: 'virginia',   name: 'LEAD VIRGINIA',             icon: '🌿',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Virginia'] },
  { id: 'washington', name: 'LEAD WASHINGTON',           icon: '🌲',  hasCaller: false,  hasSolicitudes: false, ubicaciones: ['Washington'] },
  { id: 'nebraska',        name: 'LEAD NEBRASKA',        icon: '🌾',  hasCaller: false, hasSolicitudes: false, ubicaciones: ['Nebraska'] },
];
let BOARDS = [...DEFAULT_BOARDS];
const VENDIDOS_BOARD = { id: 'vendidos', name: 'LEAD VENDIDOS', icon: '🏆', hidden: true };

const RESULT_PILL = {
  'INTERESADO':       'pill-green',
  'CITA AGENDADA':    'pill-teal',
  'CITA REAGENDADA':  'pill-yellow',
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
  const leads = storeGetLeads(boardId);
  leads.forEach(l => {
    l.asignado = normalizeAsignado(l.asignado);
    if (!l.tipo) l.tipo = 'Presencial';
  });
  return leads;
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
  return `${l.asignado}|${l.asignadoId}|${l.resultado}|${l.notas}|${l._notes}|${l.nombre}|${l.telefono}|${l.email}|${l.direccion}|${l.ubicacion}|${l.estado}|${l.lead}|${l.hijos}`;
}

// #4 — In-memory cache for board lead counts (avoids JSON.parse on every sidebar update)
const _boardCountCache = new Map();

// #6 — Debounce timers per board key (collapses rapid saves into one Supabase call)
const _saveDebounceTimers = new Map();
const _SAVE_DEBOUNCE_MS = 500;

// Fast path for single-lead field updates (resultado, notas, _messages, etc.)
// 200ms per-lead debounce — no board diff, no full-array serialization overhead.
async function patchLead(boardId, lead, opts = {}) {
  if (SYSTEM_FROZEN) { _showMigrationNotice(); return false; }
  const prev = storeGetLeads(boardId);
  const idx  = prev.findIndex(l => l.id === lead.id);
  if (idx < 0) return false;

  lead._updatedAt = new Date().toISOString();
  const next = prev.slice();
  next[idx] = lead;

  if (!opts.isNote) _pushHistory(boardId, prev, next);

  storeSetLeads(boardId, next);
  _boardCountCache.set(boardId, next.length);
  CRMLog.leadUpdate(lead, 'patchLead');
  setSyncStatus('saving');

  const timerKey = 'patch_' + lead.id;
  if (_saveDebounceTimers.has(timerKey)) clearTimeout(_saveDebounceTimers.get(timerKey));
  _saveDebounceTimers.set(timerKey, setTimeout(async () => {
    _saveDebounceTimers.delete(timerKey);
    const ldKey = 'gew_ld_' + lead.id;
    _ownWrites.set(ldKey, Date.now());
    const ok = await supaSync(ldKey, JSON.stringify({ ...lead, _boardId: boardId }));
    setSyncStatus(ok ? 'saved' : 'error');
  }, 200));

  return true;
}

const _diffBaseline = new Map(); // boardId → snapshot before debounce window started

function _syncLeadsDiff(boardId, prev, current) {
  const timerKey = 'diff_' + boardId;

  // Only capture baseline on the FIRST call of a debounce window
  if (!_saveDebounceTimers.has(timerKey)) {
    _diffBaseline.set(boardId, prev);
  }

  if (_saveDebounceTimers.has(timerKey)) clearTimeout(_saveDebounceTimers.get(timerKey));
  _saveDebounceTimers.set(timerKey, setTimeout(async () => {
    _saveDebounceTimers.delete(timerKey);

    // Use the baseline from the start of the window and the CURRENT store state
    // so all intermediate saves are captured, not just the last diff
    const baseline = _diffBaseline.get(boardId) || [];
    _diffBaseline.delete(boardId);
    const finalLeads = storeGetLeads(boardId);

    const prevMap = new Map(baseline.map(l => [l.id, l]));
    const currMap = new Map(finalLeads.map(l => [l.id, l]));

    // Leads changed or new in current
    const toWrite = [];
    for (const [id, lead] of currMap) {
      const p = prevMap.get(id);
      if (!p || (lead._updatedAt || '') !== (p._updatedAt || '')) {
        toWrite.push(lead);
      }
    }

    // Leads removed from current (in prev but not in current)
    const toDelete = [];
    for (const [id] of prevMap) {
      if (!currMap.has(id)) toDelete.push(id);
    }

    let allOk = true;
    let failCount = 0;
    for (const lead of toWrite) {
      const ldKey = 'gew_ld_' + lead.id;
      _ownWrites.set(ldKey, Date.now());
      const ok = await supaSync(ldKey, JSON.stringify({ ...lead, _boardId: boardId }));
      if (!ok) { allOk = false; failCount++; }
    }
    for (const id of toDelete) {
      // Write a tombstone instead of hard-delete so stale realtime messages
      // can't resurrect the lead after the row is gone
      const ldKey = 'gew_ld_' + id;
      _ownWrites.set(ldKey, Date.now());
      const ok = await supaSync(ldKey, JSON.stringify({ id, _deleted: true, _deletedAt: new Date().toISOString() }));
      if (!ok) allOk = false;
    }

    setSyncStatus(allOk ? 'saved' : 'error');
    CRMLog.syncSent(boardId, toWrite.length, toDelete.length);

    // Confirmation toast for batch assignments (≥2 leads changed)
    if (toWrite.length >= 2 && typeof showToast === 'function') {
      // Detect if it was an assignment batch — all changed leads share the same asignado
      const assignedAgents = [...new Set(toWrite.map(l => l.asignado).filter(Boolean))];
      if (assignedAgents.length === 1) {
        const msg = allOk
          ? `✅ ${toWrite.length} leads → ${assignedAgents[0]}`
          : `⚠️ ${toWrite.length - failCount}/${toWrite.length} leads guardados → ${assignedAgents[0]}`;
        showToast(msg, allOk ? 'success' : 'error');
      } else if (!allOk) {
        showToast(`⚠️ ${failCount} leads no se pudieron sincronizar`, 'error');
      }
    }
  }, _SAVE_DEBOUNCE_MS));
}

async function saveLeads(boardId, leads, opts = {}) {
  if (SYSTEM_FROZEN) { _showMigrationNotice(); return; }
  const session = getSession();
  const isMaster = session && session.role === 'master';
  const key = 'gew_leads_' + boardId;

  // Mark this key as "owned by this client" immediately so the real-time
  // listener won't overwrite our localStorage during the debounce window.
  if (typeof _ownWrites !== 'undefined') _ownWrites.set(key, Date.now());

  // Strip only trashed leads — vendidos leads remain visible in their source board
  if (boardId !== VENDIDOS_BOARD.id) {
    try {
      const trashIds = new Set(loadDeletedLeads().map(l => l.id).filter(Boolean));
      leads = leads.filter(l => !trashIds.has(l.id));
    } catch(_) {}
  }

  // Stamp changed/new leads with _updatedAt before anything else
  // .slice() gives a stable snapshot so _diffBaseline isn't corrupted by later mutations
  const prev    = storeGetLeads(boardId).slice();
  const prevMap = new Map(prev.map(l => [l.id, l]));
  const now = new Date().toISOString();
  leads.forEach(l => {
    const p = prevMap.get(l.id);
    if (!p || !l._updatedAt || _leadHash(l) !== _leadHash(p)) {
      l._updatedAt = now;
    }
  });

  if (!opts.isNote || isMaster) _pushHistory(boardId, prev, leads);

  // Log large board overwrites (drop of 10+ leads) for audit trail
  const prevCount = prev.length;
  const newCount  = leads.length;
  if (prevCount > 0 && newCount < prevCount - 9) {
    const entry = {
      id: Date.now() + '_bw',
      ts: new Date().toISOString(),
      userId:   session?.id   || 'unknown',
      userName: session?.name || 'unknown',
      userRole: session?.role || 'unknown',
      type:  'board_overwrite',
      label: 'Tablero sobreescrito',
      detail: `${boardId}: ${prevCount} → ${newCount} leads`,
    };
    try {
      const log = JSON.parse(localStorage.getItem('gew_activity_log') || '[]');
      log.unshift(entry);
      if (log.length > 2000) log.splice(2000);
      localStorage.setItem('gew_activity_log', JSON.stringify(log));
      supaSync('gew_activity_log', JSON.stringify(log));
    } catch(_) {}
  }

  // Update in-memory store immediately so UI is responsive
  storeSetLeads(boardId, leads);
  _boardCountCache.set(boardId, leads.length);
  CRMLog.leadUpdate({ id: '(batch)', _boardId: boardId, _version: null }, `saveLeads:${leads.length}`);
  updateSidebarCount(boardId);
  renderSidebar();
  setSyncStatus('saving');

  // #2 + #6 — Per-lead diff sync, no SELECT round-trip, no race conditions
  _syncLeadsDiff(boardId, prev, leads);
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
    ? BOARDS.filter(b => loadLeads(b.id).some(l => {
        const byId   = _sessId && l.asignadoId && l.asignadoId === _sessId;
        const byName = _sessNameNorm && (l.asignado || '').trim().toLowerCase() === _sessNameNorm;
        return byId || byName;
      }))
    : sideLineNames
      ? BOARDS.filter(b => loadLeads(b.id).some(l => {
          const byId   = l.asignadoId && sideLineIds && sideLineIds.has(l.asignadoId);
          const byName = sideLineNames.has(l.asignado);
          const selfId   = _sessId && l.asignadoId && l.asignadoId === _sessId;
          const selfName = _sessNameNorm && (l.asignado || '').trim().toLowerCase() === _sessNameNorm;
          return byId || byName || selfId || selfName;
        }))
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
  if (typeof _currentPage !== 'undefined') _currentPage = 1;
  if (typeof selectedIds !== 'undefined') selectedIds.clear(); // prevent cross-board ghost selections
  clearNewLeads(id); // dismiss new-leads indicator
  document.querySelectorAll('.board-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  const board = getBoard(id);
  document.getElementById('board-title').textContent = board.name + ' ' + board.icon;
  // reset filters
  document.getElementById('search-input').value = '';
  ['f-lead','f-resultado'].forEach(fid => {
    document.getElementById(fid).value = '';
  });
  clearDateFilter(false);
  const _sb = getSession();
  // f-asignado is set by populateAgentFilter() below
  document.getElementById('f-asignado').value = '';
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
      const merged = remote.filter(ru => !deletedIds.has(ru.id));
      const mergedIds = new Set(merged.map(ru => ru.id));
      local.forEach(lu => {
        if (!mergedIds.has(lu.id) && !deletedIds.has(lu.id)) merged.push(lu);
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

