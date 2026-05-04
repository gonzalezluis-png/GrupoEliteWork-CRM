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
  if (btn) btn.innerHTML = isLight ? '🌙<span class="theme-label"> Oscuro</span>' : '☀️<span class="theme-label"> Claro</span>';
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

