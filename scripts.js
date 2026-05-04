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
  const board   = getBoard(currentBoardId);
  const allLeads = loadLeads(currentBoardId);
  const hasSelection = selectedIds.size > 0;
  const leads   = hasSelection ? allLeads.filter(l => selectedIds.has(l.id)) : filteredLeads.length > 0 ? filteredLeads : allLeads;
  if (leads.length === 0) { showToast('No hay leads para exportar','error'); return; }

  const cols = getColumns(board).filter(c => c.key !== '_actions' && c.key !== '_check');
  const header = cols.map(c => `"${c.label}"`).join(',');
  const rows = leads.map(l =>
    cols.map(c => `"${(l[c.key]||'').toString().replace(/"/g,'""')}"`).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${board.id}_leads${hasSelection ? `_seleccion_${leads.length}` : ''}_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`CSV exportado — ${leads.length} lead${leads.length !== 1 ? 's' : ''}${hasSelection ? ' seleccionados' : ''} ✓`, 'success');
}

// ════════════════════════════════════════════
//  IMPORT CSV
// ════════════════════════════════════════════
function showImportPanel() {
  document.getElementById('leads-table').style.display = 'none';
  const es = document.getElementById('empty-state');
  if (es) es.style.display = 'none';
  const panel = document.getElementById('import-panel');
  panel.style.display = 'block';
  const boardOpts = BOARDS.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  const leadTypeOpts = `<option value="">— Sin cambio —</option>` + getLeadTypes().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const fieldOpts = ['','nombre','lead','email','telefono','hijos','direccion','ubicacion','asignado','resultado','notas']
    .map(f => `<option value="${f}">${f || '— ignorar —'}</option>`).join('');

  panel.innerHTML = `<div class="imp-page">
    <!-- Steps -->
    <div class="imp-steps">
      <div class="imp-step active" id="impstep-1"><span class="imp-step-n">1</span>Pegar datos</div>
      <div class="imp-step-line"></div>
      <div class="imp-step" id="impstep-2"><span class="imp-step-n">2</span>Revisar y editar</div>
      <div class="imp-step-line"></div>
      <div class="imp-step" id="impstep-3"><span class="imp-step-n">3</span>Vista previa y confirmar</div>
    </div>

    <!-- Step 1 -->
    <div id="imp-s1" class="imp-step-pane">
      <div class="imp-paste-card">
        <div class="imp-paste-icon">📋</div>
        <h3>Pega tu tabla desde Excel</h3>
        <p>Copia las celdas directamente desde Excel o Google Sheets (incluyendo la fila de encabezado) y pégalas con <kbd>Ctrl+V</kbd>. La primera fila debe ser el encabezado con los nombres de las columnas.</p>
        <textarea id="paste-area" class="imp-paste-area" placeholder="Haz clic aquí y presiona Ctrl+V para pegar tu tabla…" onpaste="handlePaste(event)"></textarea>
        <div id="imp-paste-hint" style="font-size:11px;color:var(--text2);margin-top:10px;text-align:left"></div>
      </div>
    </div>

    <!-- Step 2 -->
    <div id="imp-s2" class="imp-step-pane" style="display:none">
      <div class="imp-s2-toolbar">
        <div class="imp-dest-row">
          <div class="imp-dest-field">
            <label>Board para todos</label>
            <select id="global-dest" onchange="applyGlobalDest()">
              <option value="">— Elegir board —</option>
              ${boardOpts}
            </select>
          </div>
          <div class="imp-dest-field">
            <label>Ubicación para todos</label>
            <select id="global-ubicacion" onchange="applyGlobalUbicacion()" style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:12px;outline:none;min-width:140px">
              <option value="">— Elegir —</option>
            </select>
          </div>
          <div class="imp-dest-field">
            <label>Tipo de lead para todos</label>
            <select id="global-lead-type" onchange="applyGlobalLeadType()">${leadTypeOpts}</select>
          </div>
          <div class="imp-dest-field">
            <label>Semana asignada</label>
            <select id="imp-week-sel">${getWeekOptions().map(w=>`<option value="${w.start}" ${w.isCurrent?'selected':''}>${w.label}</option>`).join('')}</select>
          </div>
          <div class="imp-dest-field">
            <label>Precio por lead ($)</label>
            <input type="number" id="imp-global-price" min="0" step="0.01" value="0" placeholder="0.00" oninput="applyGlobalPrice()" style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:7px 10px;font-family:var(--font);font-size:12px;outline:none;width:90px"/>
          </div>
          <div class="imp-stats-badge" id="imp-stats"></div>
          <button class="btn btn-secondary btn-sm" onclick="clearPaste()" style="margin-left:auto">✕ Limpiar</button>
        </div>
      </div>
      <div class="imp-table-scroll">
        <table class="imp-edit-table" id="imp-edit-table"></table>
      </div>
      <div class="imp-s2-actions">
        <button class="btn btn-secondary" onclick="clearPaste()">← Atrás</button>
        <button class="btn btn-secondary" id="imp-ai-btn" onclick="aiCompleteAddresses()" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-color:#7c3aed;color:#fff;display:inline-flex;align-items:center;gap:6px">
          ✨ Completar direcciones con IA
        </button>
        <div id="imp-ai-status" style="font-size:11px;color:var(--text2)"></div>
        <button class="btn btn-primary" onclick="goImportPreview()" style="margin-left:auto">Vista previa →</button>
      </div>
    </div>

    <!-- Step 3 -->
    <div id="imp-s3" class="imp-step-pane" style="display:none">
      <div id="imp-preview-content"></div>
      <div class="imp-s2-actions" style="margin-top:20px">
        <button class="btn btn-secondary" onclick="goImportStep(2)">← Editar</button>
        <button class="btn btn-primary" style="background:var(--green);border-color:var(--green);min-width:180px" onclick="confirmImport()">✓ Confirmar e Importar</button>
      </div>
    </div>

    <!-- History -->
    <div class="imp-history-section">
      <div class="imp-history-title">📊 Historial de Importaciones</div>
      <div id="imp-history-list"></div>
    </div>

    <!-- Weekly Report (dev only) -->
    <div class="imp-history-section" id="imp-weekly-report-section" style="display:none;margin-top:24px">
      <div class="imp-history-title" style="display:flex;align-items:center;gap:10px">
        📈 Reporte Semanal de Leads
        <span style="font-size:11px;font-weight:400;color:var(--text2);background:rgba(99,102,241,.15);padding:2px 8px;border-radius:20px">Solo desarrollador</span>
      </div>
      <div id="imp-weekly-report"></div>
    </div>
  </div>`;

  window._impFieldOpts = fieldOpts;
  window._impBoardOpts = boardOpts;

  // Explicitly set current week as selected value
  const weekSel = document.getElementById('imp-week-sel');
  if (weekSel) {
    const cur = getWeekOptions().find(w => w.isCurrent);
    if (cur) weekSel.value = cur.start;
  }

  renderImportHistory();
}

let pastedRows = []; // { checked, dest, cells[], extra:{}, aiAddress:null, useAiAddress:false }
let pastedHeaders = [];

// Fixed columns always shown in the edit table
const IMP_FIXED_FIELDS = ['nombre','hijos','telefono','email','direccion','ubicacion'];

function getRowField(row, field) {
  if (row.extra && field in row.extra) return row.extra[field];
  const idx = (window._pastedMappings || []).indexOf(field);
  return idx !== -1 ? (row.cells[idx] || '') : '';
}
function setRowField(ri, field, value) {
  const row = pastedRows[ri];
  const idx = (window._pastedMappings || []).indexOf(field);
  if (idx !== -1) row.cells[idx] = value;
  else { row.extra = row.extra || {}; row.extra[field] = value; }
}

function handlePaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const area = document.getElementById('paste-area');
  area.value = text;
  area.classList.add('has-data');
  parsePastedData(text);
}

function parsePastedData(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { showToast('Necesitas al menos encabezados y una fila de datos','error'); return; }
  pastedHeaders = lines[0].split('\t').map(h => h.trim());
  pastedRows = lines.slice(1).map(line => ({
    checked: true, dest: '', aiAddress: null, useAiAddress: false, extra: {},
    cells: line.split('\t').map(c => c.trim()),
  }));
  goImportStep(2);
}

// field mapping from common header names
const FIELD_MAP = {
  'nombre':'nombre','name':'nombre','full name':'nombre',
  'lead':'lead','tipo':'lead','tipo de lead':'lead',
  'email':'email','correo':'email',
  'telefono':'telefono','teléfono':'telefono','phone':'telefono','tel':'telefono','celular':'telefono',
  'hijos':'hijos','hijos menores':'hijos','children':'hijos',
  'direccion':'direccion','dirección':'direccion','address':'direccion',
  'ubicacion':'ubicacion','ubicación':'ubicacion','city':'ubicacion','ciudad':'ubicacion',
  'asignado':'asignado','asignado a':'asignado','assigned':'asignado','agente':'asignado',
  'resultado':'resultado','result':'resultado',

  'notas':'notas','notes':'notas','nota':'notas',

};

function guessField(header) {
  const h = header.toLowerCase().trim();
  return FIELD_MAP[h] || '';
}

function goImportStep(n) {
  [1,2,3].forEach(i => {
    const pane = document.getElementById(`imp-s${i}`);
    const step = document.getElementById(`impstep-${i}`);
    if (pane) pane.style.display = i === n ? '' : 'none';
    if (step) {
      step.classList.toggle('active', i === n);
      step.classList.toggle('done',   i < n);
    }
  });
  if (n === 2) renderImportEditTable();
}

function renderImportEditTable() {
  if (!window._pastedMappings || window._pastedMappings.length !== pastedHeaders.length) {
    window._pastedMappings = pastedHeaders.map(h => guessField(h));
  }
  const mappings = window._pastedMappings;
  const boardOpts = `<option value="">— Elegir —</option>` + BOARDS.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
  const fieldOpts = window._impFieldOpts || '';
  const hasAI = pastedRows.some(r => r.aiAddress);

  // Mapping section above table
  const mapSection = `<div class="imp-map-section">
    <div class="imp-map-label">📋 Mapeo de columnas de tu Excel:</div>
    <div class="imp-map-row">${pastedHeaders.map((h,i)=>`
      <div class="imp-map-item">
        <span class="imp-map-col">${esc(h)}</span>
        <span class="imp-map-arrow">→</span>
        <select class="imp-map-sel" onchange="window._pastedMappings[${i}]=this.value;renderImportEditTable()">
          ${fieldOpts.replace(`value="${mappings[i]}"`,`value="${mappings[i]}" selected`)}
        </select>
      </div>`).join('')}
    </div>
  </div>`;

  // Fixed column headers with resize handles
  const fixedCols = IMP_FIXED_FIELDS.map(f => `
    <th class="imp-rz-th" data-field="${f}">
      ${f.charAt(0).toUpperCase()+f.slice(1)}
      <div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div>
    </th>`).join('');

  const aiCol = hasAI ? `<th class="imp-rz-th" id="th-ai-addr">
    Dirección IA <span style="font-size:9px;background:#7c3aed;color:#fff;border-radius:8px;padding:1px 6px;font-weight:600">✨</span>
    <div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div>
  </th>` : '';

  const thead = `<thead>
    <tr>
      <th class="imp-chk-td" style="width:32px"><input type="checkbox" checked onchange="toggleAllPasteRows(this)"/></th>
      ${fixedCols}
      ${aiCol}
      <th class="imp-rz-th" style="min-width:160px">Board destino<div class="imp-col-resizer" onmousedown="impStartResize(event,this)"></div></th>
      <th style="width:30px"></th>
    </tr>
  </thead>`;

  const tbody = `<tbody>${pastedRows.map((row,ri)=>{
    const fixedCells = IMP_FIXED_FIELDS.map(f => {
      const v = getRowField(row, f);
      return `<td><input type="text" value="${esc(v)}" oninput="setRowField(${ri},'${f}',this.value)"/></td>`;
    }).join('');

    let aiCell = '';
    if (hasAI) {
      if (row.aiAddress) {
        const using = row.useAiAddress;
        aiCell = `<td class="imp-ai-cell">
          <div class="imp-ai-suggestion">${esc(row.aiAddress)}</div>
          <div class="imp-ai-toggle">
            <button class="${!using?'imp-ai-btn-active':''}" onclick="impToggleAI(${ri},false)" title="Usar dirección original">Original</button>
            <button class="${using?'imp-ai-btn-active':''}" onclick="impToggleAI(${ri},true)" title="Usar dirección IA">✨ IA</button>
          </div>
        </td>`;
      } else {
        aiCell = `<td style="color:var(--text2);font-size:11px;padding:8px">—</td>`;
      }
    }

    const destSel = `<td class="imp-dest-td"><select onchange="pastedRows[${ri}].dest=this.value">
      ${BOARDS.map(b=>`<option value="${b.id}"${row.dest===b.id?' selected':''}>${b.name}</option>`).join('')}
      ${!row.dest?`<option value="" selected disabled>— Elegir —</option>`:''}
    </select></td>`;

    return `<tr id="imp-row-${ri}" ${!row.checked?'style="opacity:.45"':''}>
      <td class="imp-chk-td"><input type="checkbox" ${row.checked?'checked':''} onchange="togglePasteRow(${ri},this.checked)"/></td>
      ${fixedCells}${aiCell}${destSel}
      <td class="imp-del-td"><button onclick="deleteImportRow(${ri})" title="Eliminar fila">✕</button></td>
    </tr>`;
  }).join('')}</tbody>`;

  const tableEl = document.getElementById('imp-edit-table');
  tableEl.innerHTML = thead + tbody;

  // Prepend mapping section before the table scroll
  let mapEl = document.getElementById('imp-map-section');
  if (!mapEl) {
    mapEl = document.createElement('div');
    mapEl.id = 'imp-map-section';
    tableEl.closest('.imp-table-scroll').before(mapEl);
  }
  mapEl.innerHTML = mapSection;

  updatePasteStats();
}

function impToggleAI(ri, useAI) {
  const row = pastedRows[ri];
  row.useAiAddress = useAI;
  if (useAI && row.aiAddress) {
    // Apply AI address to direccion field only — ubicacion is chosen by the user
    setRowField(ri, 'direccion', row.aiAddress);
  }
  renderImportEditTable();
}

// Column resize
function impStartResize(e, handle) {
  e.preventDefault();
  e.stopPropagation();
  const th = handle.closest('th');
  const startX = e.pageX;
  const startW = th.offsetWidth;
  function onMove(ev) { th.style.minWidth = Math.max(60, startW + ev.pageX - startX) + 'px'; th.style.width = th.style.minWidth; }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function deleteImportRow(ri) {
  pastedRows.splice(ri, 1);
  renderImportEditTable();
}

function updateMapping(colIdx, val) { window._pastedMappings[colIdx] = val; }

function toggleAllPasteRows(cb) {
  pastedRows.forEach(r => r.checked = cb.checked);
  document.querySelectorAll('#imp-edit-table tbody input[type=checkbox]').forEach(c => c.checked = cb.checked);
  updatePasteStats();
}

function togglePasteRow(idx, val) {
  pastedRows[idx].checked = val;
  updatePasteStats();
}

function updatePasteStats() {
  const sel = pastedRows.filter(r => r.checked).length;
  const el = document.getElementById('imp-stats');
  if (el) el.textContent = `${sel} de ${pastedRows.length} filas seleccionadas`;
}

function applyGlobalDest() {
  const dest = document.getElementById('global-dest')?.value;
  if (!dest) return;
  pastedRows.forEach(r => r.dest = dest);
  document.querySelectorAll('#imp-edit-table tbody td.imp-dest-td select').forEach(s => s.value = dest);
  // Populate ubicacion select with board's configured ubicaciones
  const ubSel = document.getElementById('global-ubicacion');
  if (!ubSel) return;
  const board = getBoard(dest);
  const configured = board?.ubicaciones?.filter(Boolean) || [];
  const allUbs = configured.length > 0
    ? configured
    : [...new Set(BOARDS.flatMap(b => b.ubicaciones).filter(Boolean))].sort();
  ubSel.innerHTML = `<option value="">— Elegir —</option>`
    + allUbs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  if (allUbs.length === 1) { ubSel.value = allUbs[0]; applyGlobalUbicacion(); }
}

function applyGlobalUbicacion() {
  const ub = document.getElementById('global-ubicacion')?.value || '';
  pastedRows.forEach((_, ri) => setRowField(ri, 'ubicacion', ub));
  renderImportEditTable();
}

function applyGlobalLeadType() {
  const lt = document.getElementById('global-lead-type')?.value;
  if (!lt) return;
  window._globalLeadType = lt;
}

function getWeekOptions() {
  const weeks = [];
  const now = new Date();
  // Find the most recent Monday
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const curMonday = new Date(now);
  curMonday.setDate(now.getDate() + diffToMon);
  curMonday.setHours(0,0,0,0);

  const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  // 12 past weeks + current + 4 future
  for (let i = -12; i <= 4; i++) {
    const mon = new Date(curMonday);
    mon.setDate(curMonday.getDate() + i * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const label = `${MONTHS_ES[mon.getMonth()]} ${fmt(mon)} – ${fmt(sun)}`;
    weeks.push({
      start: mon.toISOString().slice(0,10),
      end:   sun.toISOString().slice(0,10),
      label,
      isCurrent: i === 0,
    });
  }
  return weeks;
}

function applyGlobalPrice() {
  const price = parseFloat(document.getElementById('imp-global-price')?.value) || 0;
  window._globalLeadPrice = price;
  // Update per-row price inputs
  document.querySelectorAll('.imp-price-cell').forEach(inp => inp.value = price.toFixed(2));
}

function clearPaste() {
  pastedRows = []; pastedHeaders = [];
  window._pastedMappings = [];
  window._globalLeadType  = '';
  window._globalLeadPrice = 0;
  const ubSel = document.getElementById('global-ubicacion');
  if (ubSel) { ubSel.innerHTML = '<option value="">— Elegir —</option>'; ubSel.value = ''; }
  goImportStep(1);
  const area = document.getElementById('paste-area');
  if (area) { area.value = ''; area.classList.remove('has-data'); }
}

function goImportPreview() {
  const mappings = window._pastedMappings || [];
  const toImport = pastedRows.filter(r => r.checked);
  if (!toImport.length) { showToast('No hay filas seleccionadas','error'); return; }
  const noDest = toImport.filter(r => !r.dest);
  if (noDest.length) { showToast(`${noDest.length} fila(s) sin board destino — elige un board para todas o individualmente`,'error'); return; }

  const globalLeadType = window._globalLeadType || document.getElementById('global-lead-type')?.value || '';
  const byBoard = {};
  toImport.forEach(row => {
    const lead = { id: uid(), creacion: today(), entrada: 'Solicitud' };
    // Fixed fields
    IMP_FIXED_FIELDS.forEach(f => { const v = getRowField(row, f); if (v) lead[f] = v; });
    // Extra mapped fields (lead type, asignado, etc.)
    (window._pastedMappings || []).forEach((field, ci) => {
      if (field && !IMP_FIXED_FIELDS.includes(field) && row.cells[ci]) lead[field] = row.cells[ci];
    });
    if (!lead.nombre) lead.nombre = row.cells[0] || '';
    if (globalLeadType) lead.lead = globalLeadType;
    if (!byBoard[row.dest]) byBoard[row.dest] = [];
    byBoard[row.dest].push(lead);
  });
  window._importByBoard = byBoard;

  const total = toImport.length;
  const boardCards = Object.entries(byBoard).map(([bid, leads]) => {
    const b = getBoard(bid);
    return `<div class="imp-preview-board-card">
      <div class="imp-preview-board-name">${esc(b?.name || bid)}</div>
      <div class="imp-preview-board-count">${leads.length}</div>
      <div class="imp-preview-board-sub">lead${leads.length!==1?'s':''}</div>
    </div>`;
  }).join('');

  // Sample table (first 5 rows from all)
  const sampleLeads = toImport.slice(0,5);
  const sampleCols = mappings.map((f,i)=>({field:f,idx:i})).filter(x=>x.field && x.field !== '');
  const sampleHead = sampleCols.map(x=>`<th>${x.field}</th>`).join('') + '<th>Board</th>';
  const sampleBody = sampleLeads.map((row,ri) => {
    const b = getBoard(row.dest);
    return `<tr>${sampleCols.map(x=>`<td>${esc(row.cells[x.idx]||'')}</td>`).join('')}<td>${esc(b?.name||row.dest)}</td></tr>`;
  }).join('');

  document.getElementById('imp-preview-content').innerHTML = `
    <div class="imp-preview-header">Resumen: <strong>${total}</strong> lead${total!==1?'s':''} listos para importar</div>
    <div class="imp-preview-boards">${boardCards}</div>
    <div class="imp-preview-sample">
      <div class="imp-preview-sample-title">Vista previa (primeras ${Math.min(5,total)} filas)</div>
      <div style="overflow-x:auto"><table><thead><tr>${sampleHead}</tr></thead><tbody>${sampleBody}</tbody></table></div>
    </div>`;
  goImportStep(3);
}

async function confirmImport() {
  const byBoard = window._importByBoard || {};
  const session = getSession();
  let total = 0;
  const distribution = [];
  Object.entries(byBoard).forEach(([boardId, leads]) => {
    const existing = loadLeads(boardId);
    saveLeads(boardId, [...existing, ...leads]);
    total += leads.length;
    distribution.push({
      boardId,
      boardName: getBoard(boardId)?.name || boardId,
      count: leads.length,
      leadIds: leads.map(l => l.id),
    });
  });

  const weekStart = document.getElementById('imp-week-sel')?.value || new Date().toISOString().slice(0,10);
  const pricePerLead = parseFloat(document.getElementById('imp-global-price')?.value) || 0;

  // Save to history
  const record = {
    id:         uid(),
    date:       new Date().toISOString(),
    importedBy: session?.name || 'Desconocido',
    importedByEmail: session?.email || '',
    total,
    distribution,
    weekStart,
    pricePerLead,
  };
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    history.unshift(record);
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(history.slice(0,100)) });
  } catch(_) {}

  const boardNames = distribution.map(d=>d.boardName).join(', ');
  logActivity('lead_import', `${total} leads importados`, `Boards: ${boardNames}`);
  markNewLeads(distribution); // notify admins of new leads
  showToast(`✓ ${total} leads importados exitosamente`, 'success');
  clearPaste();
  renderImportHistory();
}

async function aiCompleteAddresses() {
  const rows = pastedRows.filter(r => r.checked);
  if (!rows.length) { showToast('No hay filas seleccionadas', 'error'); return; }

  const payload = rows.map((row, i) => ({
    idx:       pastedRows.indexOf(row),
    direccion: getRowField(row, 'direccion'),
    ubicacion: getRowField(row, 'ubicacion'),
  })).filter(r => r.direccion || r.ubicacion);

  if (!payload.length) {
    showToast('Mapea al menos una columna como "direccion" o "ubicacion" primero', 'error');
    return;
  }

  const btn = document.getElementById('imp-ai-btn');
  const status = document.getElementById('imp-ai-status');
  btn.disabled = true;
  btn.innerHTML = '✨ Analizando…';
  status.textContent = `Enviando ${payload.length} direcciones a Claude…`;
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch(`${SUPA_FN_URL}/claude-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ task: 'complete_addresses', data: payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error de IA');

    let count = 0;
    data.result.forEach(r => {
      const row = pastedRows[r.idx];
      if (!row || !r.direccion_completa) return;
      row.aiAddress    = r.direccion_completa;
      row.useAiAddress = true;
      // Auto-apply to direccion field only — ubicacion is chosen by the user
      setRowField(r.idx, 'direccion', r.direccion_completa);
      count++;
    });

    renderImportEditTable();
    status.textContent = `✓ ${count} dirección(es) completadas automáticamente`;
    status.style.color = 'var(--green)';
    showToast(`✨ IA completó ${count} direcciones`, 'success');
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = 'var(--red)';
    showToast('Error con Claude: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Completar direcciones con IA';
  }
}

async function renderImportHistory() {
  const el = document.getElementById('imp-history-list');
  if (!el) return;
  el.innerHTML = `<div style="font-size:12px;color:var(--text2);padding:10px 0">Cargando historial…</div>`;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    if (!history.length) { el.innerHTML = `<div class="imp-history-empty">No hay importaciones registradas aún.</div>`; return; }
    const now = Date.now();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const weekOpts = getWeekOptions();
    el.innerHTML = history.map(r => {
      const d = new Date(r.date);
      const ageMs = now - d.getTime();
      const canUndo = !r.undone && ageMs < ONE_WEEK && (r.distribution||[]).some(dist => dist.leadIds?.length);
      const dateStr = d.toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + d.toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'});
      const chips = (r.distribution||[]).map(d=>`<span class="imp-history-chip">${esc(d.boardName)}: ${d.count}</span>`).join('');
      const undoBtn = r.undone
        ? `<span style="font-size:10px;color:var(--green)">✓ Deshecho</span>`
        : canUndo
          ? `<button onclick="promptUndoImport('${r.id}')" style="background:transparent;border:1px solid var(--red);color:var(--red);border-radius:7px;padding:4px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;margin-top:4px">↩ Deshacer</button>`
          : ageMs >= ONE_WEEK ? `<span style="font-size:10px;color:var(--text2)">Expirado</span>` : '';
      const curWeek = weekOpts.find(w => w.start === r.weekStart);
      const weekLabel = curWeek ? curWeek.label : (r.weekStart || 'Sin semana');
      const weekSelOpts = weekOpts.map(w =>
        `<option value="${w.start}"${w.start===r.weekStart?' selected':''}>${w.label}</option>`
      ).join('');
      return `<div class="imp-history-row" id="imp-history-row-${r.id}">
        <div class="imp-history-date">${dateStr}</div>
        <div class="imp-history-info">
          <div class="imp-history-who">👤 ${esc(r.importedBy)} <span style="font-weight:400;color:var(--text2);font-size:11px">${esc(r.importedByEmail)}</span></div>
          <div class="imp-history-dist">${chips}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:10px;color:var(--text2);background:rgba(0,0,0,.08);border-radius:5px;padding:2px 8px">📅 ${esc(weekLabel)}</span>
            <button onclick="toggleWeekEdit('${r.id}')" style="background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer">✏️ Editar semana</button>
            <span id="week-edit-wrap-${r.id}" style="display:none;align-items:center;gap:4px">
              <select id="week-edit-sel-${r.id}" style="font-size:11px;padding:2px 4px;border-radius:5px;border:1px solid var(--border);background:var(--card);color:var(--text)">${weekSelOpts}</select>
              <button onclick="changeImportWeek('${r.id}')" style="background:var(--accent);color:#fff;border:none;border-radius:5px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer">Guardar</button>
              <button onclick="toggleWeekEdit('${r.id}')" style="background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:5px;padding:2px 8px;font-size:11px;cursor:pointer">✕</button>
            </span>
          </div>
        </div>
        <div class="imp-history-total" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div>${r.total}<span>leads</span></div>
          ${undoBtn}
        </div>
      </div>`;
    }).join('');
    if (_isZoomDev()) renderWeeklyReport(history);
  } catch(_) { el.innerHTML = `<div class="imp-history-empty">Error cargando historial.</div>`; }
}

function toggleWeekEdit(recordId) {
  const wrap = document.getElementById('week-edit-wrap-' + recordId);
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? 'inline-flex' : 'none';
}

async function changeImportWeek(recordId) {
  const sel = document.getElementById('week-edit-sel-' + recordId);
  const newWeekStart = sel?.value;
  if (!newWeekStart) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    const rec = history.find(r => r.id === recordId);
    if (!rec) { showToast('Registro no encontrado'); return; }
    rec.weekStart = newWeekStart;
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(history) });
    showToast('Semana actualizada ✓', 'success');
    await renderImportHistory();
  } catch(e) { showToast('Error al actualizar: ' + e.message); }
}

let _undoImportId = null;

function promptUndoImport(recordId) {
  _undoImportId = recordId;
  // Load record details from DOM (re-read history is better)
  const overlay = document.getElementById('undo-import-overlay');
  const info    = document.getElementById('undo-import-info');
  const step1   = document.getElementById('undo-import-step1');
  const step2   = document.getElementById('undo-import-step2');
  // Find record info from rendered chips
  const row = document.getElementById(`imp-history-row-${recordId}`);
  const who  = row?.querySelector('.imp-history-who')?.textContent?.trim() || '';
  const date = row?.querySelector('.imp-history-date')?.textContent?.trim() || '';
  const dist = row?.querySelector('.imp-history-dist')?.textContent?.trim() || '';
  info.innerHTML = `<strong>Importación a deshacer:</strong><br>📅 ${date}<br>👤 ${who}<br>📦 ${dist}<br><br>Se eliminarán todos los leads de esta importación de sus respectivos boards.`;
  step1.style.display = '';
  step2.style.display = 'none';
  document.getElementById('undo-pass1').value = '';
  document.getElementById('undo-pass2').value = '';
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('undo-pass1').focus(), 120);
}

function closeUndoImportModal() {
  document.getElementById('undo-import-overlay').style.display = 'none';
  _undoImportId = null;
}

async function undoStep2() {
  const pass = document.getElementById('undo-pass1').value;
  if (!pass) { showToast('Ingresa tu contraseña', 'error'); return; }
  const session = getSession();
  const valid = session?.role === 'master'
    ? await sha256(pass) === MASTER_USER.passwordHash
    : false;
  if (!valid) { showToast('Contraseña incorrecta', 'error'); document.getElementById('undo-pass1').value = ''; document.getElementById('undo-pass1').focus(); return; }
  document.getElementById('undo-import-step1').style.display = 'none';
  document.getElementById('undo-import-step2').style.display = '';
  setTimeout(() => document.getElementById('undo-pass2').focus(), 120);
}

async function undoStep3() {
  const pass = document.getElementById('undo-pass2').value;
  if (!pass) { showToast('Ingresa tu contraseña nuevamente', 'error'); return; }
  const session = getSession();
  const valid = session?.role === 'master'
    ? await sha256(pass) === MASTER_USER.passwordHash
    : false;
  if (!valid) { showToast('Contraseña incorrecta', 'error'); document.getElementById('undo-pass2').value = ''; document.getElementById('undo-pass2').focus(); return; }

  closeUndoImportModal();
  await executeUndoImport(_undoImportId);
}

async function executeUndoImport(recordId) {
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');
    const record  = history.find(r => r.id === recordId);
    if (!record) { showToast('Registro no encontrado', 'error'); return; }

    let removedTotal = 0;
    for (const dist of (record.distribution || [])) {
      if (!dist.leadIds?.length) continue;
      const idSet    = new Set(dist.leadIds);
      const existing = loadLeads(dist.boardId);
      const filtered = existing.filter(l => !idSet.has(l.id));
      removedTotal  += existing.length - filtered.length;
      saveLeads(dist.boardId, filtered);
    }

    // Mark record as undone in history
    const updated = history.map(r => r.id === recordId ? { ...r, undone: true, undoneAt: new Date().toISOString() } : r);
    await supa.from('kv_store').upsert({ key:'gew_import_history', value: JSON.stringify(updated) });

    showToast(`↩ ${removedTotal} leads eliminados correctamente`, 'success');
    renderImportHistory();
    if (currentBoardId) renderTable();
  } catch(e) {
    showToast('Error al deshacer: ' + e.message, 'error');
  }
}

function renderWeeklyReport(history) {
  const section = document.getElementById('imp-weekly-report-section');
  const el = document.getElementById('imp-weekly-report');
  if (!section || !el) return;
  section.style.display = '';

  // Group imports by weekStart
  const weeks = {}; // weekStart -> { end, boards: { boardName -> {count, price} } }
  history.forEach(r => {
    if (!r.weekStart) return;
    if (!weeks[r.weekStart]) {
      // Compute week end (Sunday)
      const mon = new Date(r.weekStart + 'T00:00:00');
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      weeks[r.weekStart] = { end: sun.toISOString().slice(0,10), boards: {} };
    }
    const price = r.pricePerLead || 0;
    (r.distribution || []).forEach(d => {
      const key = d.boardName;
      if (!weeks[r.weekStart].boards[key]) weeks[r.weekStart].boards[key] = { count: 0, price };
      weeks[r.weekStart].boards[key].count += d.count;
      if (price > 0) weeks[r.weekStart].boards[key].price = price; // last price wins
    });
  });

  const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmtDate = s => { const d = new Date(s + 'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; };

  const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
  if (!sortedWeeks.length) { el.innerHTML = `<div class="imp-history-empty">No hay datos semanales aún. Asigna una semana al importar.</div>`; return; }

  el.innerHTML = sortedWeeks.map(wStart => {
    const w = weeks[wStart];
    const mon = new Date(wStart + 'T00:00:00');
    const monName = MONTHS_ES[mon.getMonth()];
    const label = `${monName} ${fmtDate(wStart)} a ${fmtDate(w.end)}`;
    const boards = Object.entries(w.boards);
    let grandTotal = 0; let grandSubtotal = 0;
    const rows = boards.map(([bName, info]) => {
      const subtotal = info.count * info.price;
      grandTotal += info.count; grandSubtotal += subtotal;
      return `<tr>
        <td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.06)">${esc(bName)}</td>
        <td style="padding:7px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)">${info.count}</td>
        <td style="padding:7px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)">${info.price > 0 ? '$'+info.price.toFixed(2) : '—'}</td>
        <td style="padding:7px 14px;text-align:right;border-bottom:1px solid rgba(255,255,255,.06);font-weight:600;color:var(--green)">${subtotal > 0 ? '$'+subtotal.toFixed(2) : '—'}</td>
        <td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.06);color:var(--text2);font-size:11px"></td>
      </tr>`;
    }).join('');
    return `<div class="wkr-card">
      <div class="wkr-header">
        <span class="wkr-week-label">${label}</span>
        <span class="wkr-total-badge">${grandTotal} leads${grandSubtotal > 0 ? ' · $'+grandSubtotal.toFixed(2) : ''}</span>
      </div>
      <table class="wkr-table">
        <thead>
          <tr>
            <th style="padding:8px 14px;text-align:left;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Lead / Board</th>
            <th style="padding:8px 14px;text-align:center;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Cantidad</th>
            <th style="padding:8px 14px;text-align:center;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">$</th>
            <th style="padding:8px 14px;text-align:right;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Subtotal</th>
            <th style="padding:8px 14px;font-weight:600;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">Notas</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:rgba(99,102,241,.1)">
            <td style="padding:9px 14px;font-weight:700">TOTAL</td>
            <td style="padding:9px 14px;text-align:center;font-weight:700">${grandTotal}</td>
            <td></td>
            <td style="padding:9px 14px;text-align:right;font-weight:700;color:var(--green)">${grandSubtotal > 0 ? '$'+grandSubtotal.toFixed(2) : '—'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }).join('');
}

function hideImportPanel() {
  if (currentBoardId) {
    document.getElementById('import-panel').style.display = 'none';
    document.getElementById('leads-table').style.display = '';
    renderTable();
  } else {
    selectBoard('dallas');
  }
}

// ════════════════════════════════════════════
