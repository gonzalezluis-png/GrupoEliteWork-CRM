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
