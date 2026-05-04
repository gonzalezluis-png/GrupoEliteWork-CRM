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

