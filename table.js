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
        const callBtn = ph ? `<a href="zoomus://zoom.us/call?callee=${encodeURIComponent(_zoomPhone)}" onclick="event.stopPropagation()" title="Llamar por Zoom" style="background:none;border:none;color:var(--text2);padding:1px 4px;font-size:12px;cursor:pointer;flex-shrink:0;line-height:1;text-decoration:none;display:inline-flex;align-items:center;opacity:.5;transition:opacity .15s" onmouseover="this.style.opacity='1';this.style.color='#2D8CFF'" onmouseout="this.style.opacity='.5';this.style.color='var(--text2)'">&#9990;</a>` : '';
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

