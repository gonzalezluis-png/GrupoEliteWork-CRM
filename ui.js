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

