// ════════════════════════════════════════════
//  SCRIPTS DE LLAMADA
// ════════════════════════════════════════════
const SCRIPTS_KEY = 'gew_scripts';

function loadScripts() {
  try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY)) || []; }
  catch { return []; }
}
async function saveScripts(scripts) {
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
  supaSync(SCRIPTS_KEY, JSON.stringify(scripts));
}

let _currentScriptId = null;

function getOrgScripts() {
  const session = getSession();
  if (!session) return [];
  const all = loadScripts();
  if (session.role === 'master') return all;
  // admin owns org scripts; all other roles in the same org see the same scripts
  const orgAdminId = session.role === 'admin' ? session.id : (session.orgAdminId || session.id);
  return all.filter(s => s.orgAdminId === orgAdminId);
}

function showScriptsPage() {
  const session = getSession();
  if (!session) return;

  // hide all other views
  document.getElementById('settings-page').classList.remove('visible');
  document.getElementById('trash-page').classList.remove('visible');
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('bulk-bar').classList.remove('visible');

  // clear other nav actives
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const navScripts = document.getElementById('nav-scripts');
  if (navScripts) navScripts.classList.add('active');

  document.getElementById('board-title').textContent = 'Scripts de Llamada';

  // show/hide toolbar and add button based on role
  const canEdit = session.role === 'admin' || session.role === 'master';
  document.getElementById('scripts-toolbar').style.display   = canEdit ? 'flex' : 'none';
  document.getElementById('scripts-add-wrap').style.display  = canEdit ? ''     : 'none';
  document.getElementById('scripts-admin-note').style.display = canEdit ? '' : 'none';

  document.getElementById('scripts-page').classList.add('visible');
  currentBoardId = null;
  _currentScriptId = null;

  renderScriptsList();
  // show empty state by default
  _showScriptsEmpty();
}

function _showScriptsEmpty() {
  document.getElementById('scripts-view-hdr').style.display = 'none';
  document.getElementById('scripts-editor-wrap').style.display = 'none';
  document.getElementById('scripts-empty').style.display = '';
}

function renderScriptsList() {
  const scripts = getOrgScripts();
  const list    = document.getElementById('scripts-list');
  if (!list) return;
  if (scripts.length === 0) {
    list.innerHTML = '<div style="padding:14px 10px;color:var(--text2);font-size:11px;text-align:center">Sin scripts aún</div>';
    return;
  }
  list.innerHTML = scripts.map(s => `
    <div class="script-item ${s.id === _currentScriptId ? 'active' : ''}" onclick="selectScript('${s.id}')">
      <span class="script-item-icon">📄</span>
      <span class="script-item-name">${esc(s.title || 'Sin título')}</span>
    </div>
  `).join('');
}

function selectScript(id) {
  const session = getSession();
  const scripts = getOrgScripts();
  const script  = scripts.find(s => s.id === id);
  if (!script) return;

  _currentScriptId = id;
  renderScriptsList();

  const canEdit = session && (session.role === 'admin' || session.role === 'master');

  // populate fields
  const _titleInp = document.getElementById('script-title-inp');
  _titleInp.value = (script.title || '').slice(0, 30);
  const _titleChars = document.getElementById('script-title-chars');
  if (_titleChars) _titleChars.textContent = (30 - _titleInp.value.length) + ' restantes';
  document.getElementById('scripts-editor').innerHTML = script.body || '';

  // toggle edit vs read-only
  document.getElementById('script-title-inp').readOnly = !canEdit;
  document.getElementById('scripts-editor').contentEditable = canEdit ? 'true' : 'false';
  document.getElementById('scripts-toolbar').style.display  = canEdit ? 'flex' : 'none';

  // show header bar with role label
  const hdr = document.getElementById('scripts-view-hdr');
  hdr.style.display = '';
  document.getElementById('scripts-view-hdr-title').textContent = script.title || 'Sin título';
  document.getElementById('scripts-view-mode-label').textContent = canEdit ? '✏️ Editando' : '👁 Solo lectura';

  document.getElementById('scripts-editor-wrap').style.display = '';
  document.getElementById('scripts-empty').style.display = 'none';
}

function newScript() {
  const session = getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'master')) return;
  const orgAdminId = session.role === 'admin' ? session.id : (session.orgAdminId || session.id);
  const script = {
    id:         'sc_' + Date.now() + Math.random().toString(36).slice(2,7),
    orgAdminId,
    title:      'Nuevo Script',
    body:       '',
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString()
  };
  const all = loadScripts();
  all.unshift(script);
  saveScripts(all);
  _currentScriptId = script.id;
  renderScriptsList();
  selectScript(script.id);
  setTimeout(() => {
    const inp = document.getElementById('script-title-inp');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

async function saveCurrentScript() {
  if (!_currentScriptId) return;
  const title = document.getElementById('script-title-inp').value.trim() || 'Sin título';
  const body  = document.getElementById('scripts-editor').innerHTML;
  const all   = loadScripts();
  const idx   = all.findIndex(s => s.id === _currentScriptId);
  if (idx === -1) return;
  all[idx].title     = title;
  all[idx].body      = body;
  all[idx].updatedAt = new Date().toISOString();
  await saveScripts(all);
  document.getElementById('scripts-view-hdr-title').textContent = title;
  renderScriptsList();
  showToast('Script guardado ✓', 'success');
}

async function deleteCurrentScript() {
  if (!_currentScriptId) return;
  if (!confirm('¿Eliminar este script? Esta acción no se puede deshacer.')) return;
  const all     = loadScripts().filter(s => s.id !== _currentScriptId);
  await saveScripts(all);
  _currentScriptId = null;
  renderScriptsList();
  _showScriptsEmpty();
  showToast('Script eliminado', 'error');
}

function stbExec(cmd, value) {
  document.getElementById('scripts-editor').focus();
  document.execCommand(cmd, false, value || null);
}

function stbHeading(value) {
  document.getElementById('scripts-editor').focus();
  if (!value) {
    document.execCommand('formatBlock', false, 'p');
  } else {
    document.execCommand('formatBlock', false, value);
  }
  document.getElementById('stb-heading').value = value;
}

// ════════════════════════════════════════════
//  SCRIPTS SIDE PANEL (agent quick-view)
// ════════════════════════════════════════════
let _sspOpen = false;
let _sspCurrentId = null;

function toggleScriptsPanel() {
  const panel = document.getElementById('scripts-side-panel');
  _sspOpen = !_sspOpen;
  panel.classList.toggle('open', _sspOpen);
  const btn = document.getElementById('btn-scripts-panel');
  if (btn) btn.classList.toggle('active-panel', _sspOpen);
  if (_sspOpen) {
    renderSspList();
    if (_sspCurrentId) selectSspScript(_sspCurrentId);
  }
}

function renderSspList() {
  const scripts = getOrgScripts();
  const list    = document.getElementById('ssp-list');
  if (!list) return;
  if (scripts.length === 0) {
    list.innerHTML = '<div style="padding:12px 14px;color:var(--text2);font-size:11px;text-align:center">Sin scripts disponibles</div>';
    return;
  }
  list.innerHTML = scripts.map(s => `
    <div class="ssp-script-item ${s.id === _sspCurrentId ? 'active' : ''}" onclick="selectSspScript('${s.id}')">
      <span>📄</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title || 'Sin título')}</span>
    </div>
  `).join('');
}

function selectSspScript(id) {
  const scripts = getOrgScripts();
  const script  = scripts.find(s => s.id === id);
  if (!script) return;
  _sspCurrentId = id;
  renderSspList();
  document.getElementById('ssp-empty').style.display   = 'none';
  document.getElementById('ssp-content').style.display = '';
  document.getElementById('ssp-script-title').textContent = script.title || 'Sin título';
  document.getElementById('ssp-script-content').innerHTML = script.body || '';
}

// ════════════════════════════════════════════
//  EXPORT CSV
// ════════════════════════════════════════════
function exportCSV() {
  if (!currentBoardId) return;
  const board     = getBoard(currentBoardId);
  const allLeads  = loadLeads(currentBoardId);
  const hasSelection = selectedIds.size > 0;
  const leads     = hasSelection
    ? allLeads.filter(l => selectedIds.has(l.id))
    : filteredLeads.length > 0 ? filteredLeads : allLeads;
  if (leads.length === 0) { showToast('No hay leads para exportar','error'); return; }

  const cols = getColumns(board).filter(c => c.key !== '_actions' && c.key !== '_check');

  // Include all lead fields not in columns too (notas completas, etc.)
  const extraKeys = ['_notes','creacion','entrada','tipo'];
  const allCols = [
    ...cols,
    ...extraKeys.filter(k => !cols.find(c => c.key === k)).map(k => ({ key: k, label: k.toUpperCase() }))
  ];

  const header = allCols.map(c => `"${c.label}"`).join(',');
  const rows   = leads.map(l =>
    allCols.map(c => {
      const v = l[c.key];
      if (Array.isArray(v)) return `"${v.join('; ').replace(/"/g,'""')}"`;
      return `"${(v||'').toString().replace(/"/g,'""')}"`;
    }).join(',')
  );
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const filterTag = hasSelection ? `_seleccion${leads.length}`
    : assignFilter === 'unassigned' ? '_sin_asignar'
    : assignFilter === 'assigned'   ? '_asignados'
    : '';
  a.download = `${board.id}${filterTag}_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exportado — ${leads.length} lead${leads.length !== 1?'s':''} ✓`, 'success');
}

// ════════════════════════════════════════════
