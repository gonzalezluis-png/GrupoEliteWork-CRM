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

