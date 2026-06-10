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
  const isFullOrg = !session || session.role === 'master' || session.role === 'admin';
  const _lineViewRoles = ['manager','master_manager','supervisor_agent','caller'];
  const isLineView = session && _lineViewRoles.includes(session.role);

  sel.innerHTML = isLineView ? '' : '<option value="">Agente: Todos</option>';

  const names = isFullOrg
    ? loadUsers().filter(u => !u.inactive).map(u => u.name)
    : _getLineUsers(session).filter(u => !u.inactive).map(u => u.name);
  names.forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = a;
    sel.appendChild(o);
  });

  // For line-view roles, ensure their own name is selected by default
  if (isLineView && session.name) {
    sel.value = session.name;
    if (!sel.value) sel.selectedIndex = 0; // fallback to first if name not in list
  }
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

