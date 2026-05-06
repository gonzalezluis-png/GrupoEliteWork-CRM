//  COLUMN RESIZE
// ════════════════════════════════════════════
function initResizers() {
  document.querySelectorAll('.col-resizer').forEach(handle => {
    const startDrag = (startX) => {
      const col  = handle.dataset.col;
      const th   = handle.parentElement;
      const startW = th.offsetWidth;
      handle.classList.add('dragging');

      const applyWidth = (clientX) => {
        const newW = Math.max(60, startW + clientX - startX);
        COL_WIDTHS[col] = newW;
        th.style.width = newW + 'px';
        const colIdx = Array.from(th.parentElement.children).indexOf(th);
        document.querySelectorAll('#leads-table tbody tr').forEach(row => {
          const td = row.children[colIdx];
          if (td) td.style.width = newW + 'px';
        });
      };
      const endDrag = () => {
        handle.classList.remove('dragging');
        const cfg = loadColConfig();
        cfg.widths = { ...(cfg.widths||{}), ...COL_WIDTHS };
        saveColConfig(cfg);
      };

      // Mouse
      const onMove = e => applyWidth(e.clientX);
      const onUp   = () => {
        endDrag();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);

      // Touch
      const onTMove = e => { e.preventDefault(); applyWidth(e.touches[0].clientX); };
      const onTEnd  = () => {
        endDrag();
        document.removeEventListener('touchmove', onTMove);
        document.removeEventListener('touchend', onTEnd);
      };
      document.addEventListener('touchmove', onTMove, { passive: false });
      document.addEventListener('touchend', onTEnd);
    };

    handle.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX); });
    handle.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.touches[0].clientX); }, { passive: false });
  });
}

// ── Mobile filter toggle ─────────────────────
function toggleMobFilters() {
  const toolbar = document.getElementById('toolbar');
  const btn = document.getElementById('mob-filter-toggle');
  if (!toolbar) return;
  toolbar.classList.toggle('filters-open');
  if (btn) btn.classList.toggle('active', toolbar.classList.contains('filters-open'));
}

function updateMobFilterDot() {
  const btn = document.getElementById('mob-filter-toggle');
  if (!btn) return;
  const hasFilter = ['f-asignado','f-lead','f-resultado','f-fecha-desde','f-fecha-hasta']
    .some(id => { const el = document.getElementById(id); return el && el.value; });
  btn.classList.toggle('has-filters', hasFilter);
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
    const prevAgents = asignado
      ? [...new Set(leads.filter(l => snapshotIds.has(l.id)).map(l => l.asignado).filter(Boolean))]
      : [];
    const leadNames = [...leads.filter(l => snapshotIds.has(l.id)).map(l => l.nombre || l.email || l.id)];

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
    if (asignado) {
      const fromLabel = prevAgents.length === 1 ? prevAgents[0]
                      : prevAgents.length > 1   ? `${prevAgents.length} agentes anteriores`
                      : 'Sin asignar';
      showTransferReceipt({ fromAgent: fromLabel, toAgent: asignado, count: changed, leadNames });
    }
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
