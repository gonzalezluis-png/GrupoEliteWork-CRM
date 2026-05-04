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

