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

// ── Transfer receipt modal ────────────────────────────────────────────────────
function showTransferReceipt({ fromAgent, toAgent, count, leadNames = [] }) {
  const existing = document.getElementById('transfer-receipt-overlay');
  if (existing) existing.remove();

  const fromLabel = fromAgent || 'Sin asignar';
  const toLabel   = toAgent   || 'Sin asignar';
  const title     = count === 1
    ? `✅ Lead trasladado`
    : `✅ ${count} leads trasladados`;
  const subtitle  = count === 1
    ? `<strong>${esc(leadNames[0] || 'Lead')}</strong> fue trasladado`
    : `${count} leads fueron trasladados`;
  const namesHtml = leadNames.length
    ? `<div style="margin-top:10px;max-height:120px;overflow-y:auto;background:rgba(255,255,255,.04);border-radius:8px;padding:8px 12px;">
        ${leadNames.slice(0, 20).map(n => `<div style="font-size:12px;color:var(--text2);padding:2px 0">· ${esc(n)}</div>`).join('')}
        ${leadNames.length > 20 ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">…y ${leadNames.length - 20} más</div>` : ''}
       </div>` : '';

  const overlay = document.createElement('div');
  overlay.id = 'transfer-receipt-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadein .2s ease';
  overlay.innerHTML = `
    <div style="background:#1a1d2e;border:1px solid rgba(0,200,117,.3);border-radius:16px;padding:28px 32px;max-width:440px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.7);font-family:var(--font,sans-serif);">
      <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px">${title}</div>
      <div style="font-size:13px;color:var(--text2,#8890a4);margin-bottom:20px">${subtitle}</div>

      <div style="display:flex;align-items:center;gap:0;border-radius:10px;overflow:hidden;border:1px solid var(--border,#2a2d3e);">
        <div style="flex:1;padding:14px 16px;background:rgba(226,68,92,.08);">
          <div style="font-size:10px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">De</div>
          <div style="font-size:14px;font-weight:700;color:#fff">${esc(fromLabel)}</div>
        </div>
        <div style="padding:0 10px;font-size:20px;color:var(--text3,#676a82)">→</div>
        <div style="flex:1;padding:14px 16px;background:rgba(0,200,117,.08);">
          <div style="font-size:10px;font-weight:700;color:#00c875;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Para</div>
          <div style="font-size:14px;font-weight:700;color:#fff">${esc(toLabel)}</div>
        </div>
      </div>

      ${namesHtml}

      <button onclick="document.getElementById('transfer-receipt-overlay').remove()"
        style="margin-top:20px;width:100%;padding:10px;background:rgba(0,200,117,.15);border:1px solid rgba(0,200,117,.3);border-radius:8px;color:#00c875;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
        Entendido ✓
      </button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
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
