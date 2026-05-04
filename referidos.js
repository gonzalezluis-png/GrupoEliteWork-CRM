//  REFERIDOS POR FOTO
// ════════════════════════════════════════════
let _refRows      = []; // [{nombre, telefono, relacion}]
let _refImageB64  = null;

function showReferidosPage() {
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  currentBoardId = null;
  document.getElementById('board-title').textContent = 'Digitalización de Referidos';
  document.getElementById('btn-new-lead').style.display  = 'none';
  document.getElementById('btn-export').style.display    = 'none';
  document.getElementById('table-wrap').style.display    = 'none';
  document.getElementById('toolbar').style.display       = 'none';
  document.getElementById('referidos-page').style.display = 'flex';
  document.querySelectorAll('.board-item,.sidebar-item').forEach(el => el.classList.remove('active'));
  ['nav-referidos','nav-referidos-agent','nav-referidos-admin'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('active'); });
  _refPopulateSelects();
  renderRefHistory();
}

function _refPopulateSelects() {
  // Agente actual (read-only)
  const session = getSession();
  const agenteName = session ? (session.name || session.email || 'Usuario') : 'Usuario';
  const agenteId   = session ? session.id : null;
  const nameEl = document.getElementById('ref-agente-name');
  const avatarEl = document.getElementById('ref-agente-avatar');
  if (nameEl) nameEl.textContent = agenteName;
  if (avatarEl) avatarEl.textContent = agenteName.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
  document.getElementById('ref-agente-display')._agenteName = agenteName;
  document.getElementById('ref-agente-display')._agenteId   = agenteId;
  // Ubicaciones
  const ubSel = document.getElementById('ref-ubicacion');
  if (ubSel) {
    const ubs = [...new Set(BOARDS.flatMap(b => b.ubicaciones).filter(Boolean))].sort();
    ubSel.innerHTML = '<option value="">— Seleccionar —</option>'
      + ubs.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  }
  // Boards
  const bSel = document.getElementById('ref-board');
  if (bSel) {
    bSel.innerHTML = BOARDS.map(b => `<option value="${b.id}">${esc(b.name)} ${b.icon||''}</option>`).join('');
  }
}

function refHandleDrop(e) {
  e.preventDefault();
  document.getElementById('ref-dropzone').style.borderColor = '';
  document.getElementById('ref-dropzone').style.background  = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) refLoadImage(file);
}

function refHandleFile(file) {
  if (file) refLoadImage(file);
}

function refLoadImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    _refImageB64 = e.target.result;
    document.getElementById('ref-thumb').src = _refImageB64;
    document.getElementById('ref-thumb-wrap').style.display    = '';
    document.getElementById('ref-no-image-hint').style.display = 'none';
    document.getElementById('ref-dropzone').style.display      = 'none';
    document.getElementById('ref-step2').style.display         = 'none';
    document.getElementById('ref-ai-status').textContent       = '';
    // Activate step indicator 1 as done-ish
    document.getElementById('ref-stepin-1').style.background   = 'rgba(0,115,234,.2)';
  };
  reader.readAsDataURL(file);
}

function refResetImage() {
  _refImageB64 = null;
  _refRows = [];
  document.getElementById('ref-thumb-wrap').style.display    = 'none';
  document.getElementById('ref-no-image-hint').style.display = '';
  document.getElementById('ref-dropzone').style.display      = '';
  document.getElementById('ref-step2').style.display         = 'none';
  ['ref-file-input','ref-file-cam','ref-file-gal'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('ref-ai-status').textContent = '';
  // Reset step 2 indicator
  const s2 = document.getElementById('ref-stepin-2');
  s2.style.background = 'rgba(255,255,255,.04)';
  s2.style.borderColor = '';
  document.getElementById('ref-badge-2').style.background = 'var(--border)';
  document.getElementById('ref-badge-2').style.color = 'var(--text2)';
  document.querySelector('#ref-stepin-2 span:last-child').style.color = 'var(--text2)';
}

async function refAnalyze() {
  if (!_refImageB64) return;
  const btn    = document.getElementById('ref-analyze-btn');
  const status = document.getElementById('ref-ai-status');
  const overlay = document.getElementById('ref-img-overlay');
  btn.disabled = true;
  btn.innerHTML = '<span class="ref-ai-pulse"></span> Analizando…';
  if (overlay) overlay.style.display = 'flex';
  status.innerHTML = '<span class="ref-ai-pulse"></span> Analizando imagen…';
  status.style.color = 'var(--text2)';

  try {
    const b64 = _refImageB64.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = _refImageB64.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';

    const res = await fetch(`${SUPA_FN_URL}/claude-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ task: 'extract_referrals_image', imageBase64: b64, mediaType }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Error de IA');

    _refRows = (data.result || []).map(r => ({
      nombre:   (r.nombre   || '').trim(),
      telefono: (r.telefono || '').trim(),
      hijos:    (r.hijos    || '').trim(),
      notas:    '',
    })).filter(r => r.nombre || r.telefono);

    if (!_refRows.length) throw new Error('La IA no detectó nombres ni teléfonos en la imagen');

    refRenderPreview();
    document.getElementById('ref-step2').style.display = 'block';
    // Activate step 2 indicator
    const s2 = document.getElementById('ref-stepin-2');
    s2.style.background = 'rgba(62,207,142,.12)';
    s2.style.borderColor = 'rgba(62,207,142,.35)';
    document.getElementById('ref-badge-2').style.background = '#3ecf8e';
    document.getElementById('ref-badge-2').style.color = '#0a2e22';
    document.querySelector('#ref-stepin-2 span:last-child').style.color = '#3ecf8e';
    document.getElementById('ref-step2').scrollIntoView({ behavior:'smooth', block:'start' });
    status.textContent = `✓ ${_refRows.length} lead(s) detectados`;
    status.style.color = '#3ecf8e';
  } catch(e) {
    status.textContent = '❌ ' + e.message;
    status.style.color = 'var(--red)';
  } finally {
    if (overlay) overlay.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = '<span>✨</span> Analizar con IA';
  }
}

function refRenderPreview() {
  const tbody = document.getElementById('ref-preview-tbody');
  const badge = document.getElementById('ref-count-badge');
  if (badge) badge.textContent = `${_refRows.length} lead${_refRows.length !== 1 ? 's' : ''}`;

  const td = 'border-right:1px solid var(--border);border-bottom:1px solid var(--border)';
  const inp = (val, field, i, ph='', extra='') =>
    `<input value="${esc(val)}" oninput="_refRows[${i}].${field}=this.value" placeholder="${ph}"
      style="width:100%;box-sizing:border-box;padding:4px 6px;font-size:12px;background:transparent;border:none;color:var(--text);font-family:inherit;outline:none;${extra}" />`;

  function _telWarnHtml(tel) {
    const d = (tel||'').replace(/\D/g,'').length;
    if (!tel.trim() || (d>=7&&d<=15)) return '';
    const msg = d<7?'Número muy corto':'Número muy largo';
    return `<span style="flex-shrink:0;font-size:11px;cursor:help;color:#f59e0b" title="${msg}: ${d} dígitos">⚠</span>`;
  }

  tbody.innerHTML = _refRows.map((r, i) => {
    const bg = i%2===0?'rgba(255,255,255,.012)':'rgba(0,0,0,.07)';
    return `<tr style="background:${bg}" onmouseover="this.style.background='rgba(0,115,234,.06)'" onmouseout="this.style.background='${bg}'">
      <td style="padding:3px 0;text-align:center;${td}">
        <div style="display:flex;align-items:center;justify-content:center;gap:3px">
          <button onclick="_refRows.splice(${i},1);refRenderPreview()"
            style="background:none;border:none;color:rgba(255,255,255,.18);width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:10px;border-radius:3px;padding:0;flex-shrink:0"
            title="Eliminar"
            onmouseover="this.style.color='#f87171'"
            onmouseout="this.style.color='rgba(255,255,255,.18)'">✕</button>
          <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;background:rgba(0,115,234,.2);color:#60a5fa;font-size:11px;font-weight:800">${i+1}</span>
        </div>
      </td>
      <td style="padding:0;${td}">${inp(r.nombre,'nombre',i,'Nombre completo')}</td>
      <td style="padding:0;${td}">
        <div style="display:flex;align-items:center">
          <input value="${esc(r.telefono)}" id="ref-tel-inp-${i}" placeholder="+1 555 000 0000"
            oninput="_refRows[${i}].telefono=this.value;_refTelCheck(${i},this.value)"
            style="flex:1;min-width:0;box-sizing:border-box;padding:4px 6px;font-size:12px;background:transparent;border:none;color:var(--text);font-family:inherit;outline:none" />
          <span id="ref-tel-warn-${i}" style="flex-shrink:0;font-size:11px;color:#f59e0b;padding-right:4px;cursor:help" title=""></span>
        </div>
      </td>
      <td style="padding:0;text-align:center;${td}">${inp(r.hijos||'','hijos',i,'—','text-align:center')}</td>
      <td style="padding:0;border-bottom:1px solid var(--border)">${inp(r.notas||'','notas',i,'Notas del lead…')}</td>
    </tr>`;
  }).join('');

  // Run initial phone check on all rows after render
  _refRows.forEach((r,i) => _refTelCheck(i, r.telefono));
}

function _refTelCheck(i, val) {
  const warn = document.getElementById(`ref-tel-warn-${i}`);
  if (!warn) return;
  const d = (val||'').replace(/\D/g,'').length;
  if (!val.trim() || (d>=7&&d<=15)) { warn.textContent=''; warn.title=''; return; }
  warn.textContent = '⚠';
  warn.title = d < 7 ? `Muy corto: ${d} dígitos` : `Muy largo: ${d} dígitos`;
}

function refAddRow() {
  _refRows.push({ nombre:'', telefono:'', hijos:'', notas:'' });
  refRenderPreview();
  document.getElementById('ref-step2').style.display = 'block';
}

async function refSubmit() {
  const boardId        = document.getElementById('ref-board').value;
  const referidoPor    = document.getElementById('ref-referidopor').value.trim();
  const referidoTel    = document.getElementById('ref-referidopor-tel').value.trim();
  const tipo           = document.getElementById('ref-tipo').value || 'Presencial';
  const ubicacion      = document.getElementById('ref-ubicacion').value;
  const notasReferido  = (document.getElementById('ref-notas-referido')?.value || '').trim();
  const agenteDisp   = document.getElementById('ref-agente-display');
  const agenteName   = agenteDisp ? agenteDisp._agenteName || '' : '';
  const agenteId     = agenteDisp ? agenteDisp._agenteId   || null : null;
  const statusEl     = document.getElementById('ref-submit-status');
  const btn          = document.getElementById('ref-submit-btn');

  const rows = _refRows.filter(r => r.nombre.trim() || r.telefono.trim());
  if (!rows.length) { showToast('No hay leads para cargar', 'error'); return; }
  if (!boardId)     { showToast('Selecciona un board destino', 'error'); return; }

  btn.disabled = true;
  statusEl.textContent = 'Guardando…';

  try {
    const leads = loadLeads(boardId);
    const today  = new Date().toISOString().slice(0,10);
    let added = 0;

    rows.forEach(r => {
      const notaParts = [];
      if (agenteName) notaParts.push(`Agente: ${agenteName}`);
      if (referidoPor) {
        let ref = `Referido por: ${referidoPor}`;
        if (referidoTel) ref += ` (${referidoTel})`;
        notaParts.push(ref);
      }
      if (r.notas && r.notas.trim()) notaParts.push(r.notas.trim());
      if (notasReferido) notaParts.push(`Nota del referido: ${notasReferido}`);
      const lead = {
        id:          uid(),
        creacion:    today,
        nombre:      r.nombre.trim(),
        telefono:    r.telefono.trim(),
        email:       '',
        direccion:   '',
        ubicacion,
        lead:        'REF',
        tipo,
        notas:       notaParts.join(' · '),
        _notes:      notaParts.length ? JSON.stringify([{ text: notaParts.join('\n'), author: agenteName || 'Sistema', date: new Date().toISOString(), system: true }]) : '',
        asignado:    agenteName,
        asignadoId:  agenteId,
        resultado:   '',
        hijos:       r.hijos ? r.hijos.trim() : '',
        _esReferido: true,
        entrada:     'Referido',
      };
      leads.push(lead);
      added++;
    });

    await saveLeads(boardId, leads);
    statusEl.textContent = `✅ ${added} lead(s) cargados`;
    statusEl.style.color = 'var(--green)';
    showToast(`${added} referidos importados ✓`, 'success');

    // Save to per-user history
    const _importedLeads = rows.map(r => ({ nombre: r.nombre.trim(), telefono: r.telefono.trim(), hijos: r.hijos||'', notas: r.notas||'' }));
    const _leadIds = leads.slice(-added).map(l => l.id);
    await refSaveHistory({
      id: uid(), date: new Date().toISOString(),
      uploadedBy: agenteName, uploadedById: agenteId,
      boardId, boardName: getBoard(boardId)?.name || boardId,
      referidoPor, ubicacion, added,
      leads: _importedLeads, _leadIds,
    });
    renderRefHistory();

    // Reset for next batch
    setTimeout(() => {
      refResetImage();
      _refRows = [];
      document.getElementById('ref-step2').style.display = 'none';
      statusEl.textContent = '';
      btn.disabled = false;
    }, 2000);
  } catch(e) {
    statusEl.textContent = '❌ Error: ' + e.message;
    statusEl.style.color = 'var(--red)';
    btn.disabled = false;
  }
}

// ── Referidos history ────────────────────────────────────────────────────────
function _refHistoryKey() {
  const session = getSession();
  return session ? `gew_ref_history_${session.id}` : null;
}

async function refSaveHistory(record) {
  const key = _refHistoryKey();
  if (!key) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    const hist = JSON.parse(data?.value || '[]');
    hist.unshift(record);
    await supa.from('kv_store').upsert({ key, value: JSON.stringify(hist.slice(0, 200)) });
  } catch(_) {}
}

async function refLoadHistory() {
  const key = _refHistoryKey();
  if (!key) return [];
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    return JSON.parse(data?.value || '[]');
  } catch(_) { return []; }
}

async function renderRefHistory() {
  const container = document.getElementById('ref-history-list');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2);font-size:12px;opacity:.5">Cargando…</div>`;
  const hist = await refLoadHistory();
  const session = getSession();
  const isMaster = session && session.role === 'master';
  if (!hist.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text2);font-size:12px;opacity:.4">No hay cargas registradas aún.</div>`;
    return;
  }
  container.innerHTML = hist.map(h => {
    const d = new Date(h.date);
    const dateStr = d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const reverted = h._reverted;
    const leadsHtml = (h.leads || []).map((l, i) => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${i+1}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--text);font-weight:600">${esc(l.nombre||'—')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${esc(l.telefono||'—')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2)">${esc(l.hijos||'')}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text2);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.notas||'')}</td>
      </tr>`).join('');
    return `
    <details style="background:var(--card2);border:1px solid ${reverted ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.07)'};border-radius:12px;overflow:hidden${reverted ? ';opacity:.6' : ''}">
      <summary style="padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;list-style:none;user-select:none">
        <span style="font-size:15px">${reverted ? '↩' : '🗂️'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:${reverted ? 'var(--text2)' : 'var(--text)'}">
            ${esc(h.boardName || h.boardId)}
            ${h.referidoPor ? `<span style="font-weight:400;color:var(--text2)"> · Ref: ${esc(h.referidoPor)}</span>` : ''}
            ${reverted ? `<span style="color:var(--red);font-size:10px;font-weight:700;margin-left:6px">REVERTIDO</span>` : ''}
          </div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">${dateStr} · ${h.added || (h.leads||[]).length} leads${h.ubicacion ? ' · ' + esc(h.ubicacion) : ''}</div>
        </div>
        ${isMaster && !reverted ? `<button onclick="event.preventDefault();event.stopPropagation();refUndo('${h.id}')" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:var(--red);font-size:10px;font-weight:700;padding:4px 12px;border-radius:6px;cursor:pointer;flex-shrink:0">↩ Revertir</button>` : ''}
      </summary>
      <div style="border-top:1px solid rgba(255,255,255,.06);overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:rgba(0,0,0,.2)">
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left;width:32px">#</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Nombre</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Teléfono</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left;width:50px">Hijos</th>
              <th style="padding:5px 8px;font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase;text-align:left">Notas</th>
            </tr>
          </thead>
          <tbody>${leadsHtml}</tbody>
        </table>
      </div>
    </details>`;
  }).join('');
}

async function refUndo(histId) {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el master puede revertir cargas', 'error'); return; }
  if (!confirm('¿Revertir esta carga? Se eliminarán los leads importados de su board.')) return;
  const key = _refHistoryKey();
  if (!key) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', key).maybeSingle();
    const hist = JSON.parse(data?.value || '[]');
    const rec = hist.find(h => h.id === histId);
    if (!rec) { showToast('Registro no encontrado', 'error'); return; }
    // Remove leads from board
    if (rec._leadIds?.length && rec.boardId) {
      const boardLeads = loadLeads(rec.boardId);
      const idSet = new Set(rec._leadIds);
      await saveLeads(rec.boardId, boardLeads.filter(l => !idSet.has(l.id)));
    }
    // Mark as reverted
    rec._reverted = true;
    rec._revertedAt = new Date().toISOString();
    await supa.from('kv_store').upsert({ key, value: JSON.stringify(hist) });
    showToast('Carga revertida', 'success');
    renderRefHistory();
  } catch(e) { showToast('Error al revertir: ' + e.message, 'error'); }
}

function showImportPage() {
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  currentBoardId = null;
  document.getElementById('board-title').textContent = 'Importar Leads';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('table-wrap').style.display   = '';
  document.querySelectorAll('.board-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-import').classList.add('active');
  showImportPanel();
}

let _wrpCurrentTab = 'weekly';

function showWeeklyReportPage() {
  showBoardView();
  document.getElementById('weekly-report-page').style.display = 'flex';
  document.getElementById('table-wrap').style.display = 'none';
  document.getElementById('toolbar').style.display    = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.querySelectorAll('.board-item,.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-weekly-report').classList.add('active');
  wrpSwitchTab(_wrpCurrentTab, true);
}

function wrpSwitchTab(tab, forceLoad) {
  _wrpCurrentTab = tab;
  ['weekly','detail'].forEach(t => {
    document.getElementById(`wrp-pane-${t}`).style.display  = t === tab ? '' : 'none';
    document.getElementById(`wrp-tab-${t}`).className = `wrp-tab${t === tab ? ' wrp-tab-active' : ''}`;
  });
  if (tab === 'weekly') loadWeeklyReportPage();
  else loadDetailedReport();
}

function wrpRefresh() {
  if (_wrpCurrentTab === 'weekly') loadWeeklyReportPage();
  else loadDetailedReport();
}

// ── Weekly report helpers ────────────────────────────────────────────
let _wrpAdminView = false;

function wrpToggleAdminView() {
  _wrpAdminView = !_wrpAdminView;
  const btn = document.getElementById('wrp-view-toggle');
  if (btn) {
    btn.textContent = _wrpAdminView ? '✏️ Vista Edición' : '👁 Vista Administrador';
    btn.style.background = _wrpAdminView ? 'rgba(99,102,241,.15)' : 'var(--card2)';
    btn.style.color       = _wrpAdminView ? 'var(--accent)' : 'var(--text)';
    btn.style.borderColor = _wrpAdminView ? 'var(--accent)' : 'var(--border)';
  }
  loadWeeklyReportPage();
}

let _wrpSaveTimer = null;
function wrpScheduleSave() {
  clearTimeout(_wrpSaveTimer);
  _wrpSaveTimer = setTimeout(async () => {
    await supa.from('kv_store').upsert({ key:'gew_week_overrides', value: JSON.stringify(window._wrpOverrides||{}) });
  }, 800);
}

function wrpSetPrice(ws, board, val) {
  const v = parseFloat(val);
  if (!window._wrpOverrides[ws]) window._wrpOverrides[ws] = { discounts:[] };
  if (!window._wrpOverrides[ws].boardPrices) window._wrpOverrides[ws].boardPrices = {};
  window._wrpOverrides[ws].boardPrices[board] = isNaN(v) ? 0 : v;
  wrpUpdateInvoiceTotals(ws);
  wrpScheduleSave();
}

function wrpAddDiscount(ws) {
  if (!window._wrpOverrides[ws]) window._wrpOverrides[ws] = { discounts:[] };
  if (!window._wrpOverrides[ws].discounts) window._wrpOverrides[ws].discounts = [];
  const id = Date.now().toString(36);
  window._wrpOverrides[ws].discounts.push({ id, leads:0, price:0, desc:'' });
  // Re-render just the discount section
  renderWrpDiscounts(ws);
  wrpScheduleSave();
}

function wrpRemoveDiscount(ws, id) {
  if (!window._wrpOverrides[ws]?.discounts) return;
  window._wrpOverrides[ws].discounts = window._wrpOverrides[ws].discounts.filter(d => d.id !== id);
  renderWrpDiscounts(ws);
  wrpScheduleSave();
}

function wrpEditDiscount(ws, id, field, val) {
  if (!window._wrpOverrides[ws]?.discounts) return;
  const parsed = field === 'desc' ? val : (parseFloat(val) || 0);
  // Auto-remove row when quantity drops to 0 or below
  if (field === 'leads' && parsed <= 0) {
    window._wrpOverrides[ws].discounts = window._wrpOverrides[ws].discounts.filter(d => d.id !== id);
    renderWrpDiscounts(ws);
    wrpScheduleSave();
    return;
  }
  const disc = window._wrpOverrides[ws].discounts.find(d => d.id === id);
  if (!disc) return;
  disc[field] = parsed;
  wrpUpdateInvoiceTotals(ws);
  wrpScheduleSave();
}

function wrpUpdateInvoiceTotals(ws) {
  const ovr     = window._wrpOverrides[ws] || {};
  const boards  = window._wrpWeeks?.[ws]?.boards || {};
  let subtotal  = 0;
  Object.entries(boards).forEach(([bName, info]) => {
    const price = ovr.boardPrices?.[bName] ?? info.price;
    subtotal += info.count * price;
  });
  const discountTotal = (ovr.discounts||[]).reduce((s,d) => s + d.leads * d.price, 0);
  const total = subtotal - discountTotal;
  const fmt = n => n > 0 ? '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '$0.00';
  const subEl = document.getElementById(`wrp-sub-${ws}`);
  const dscEl = document.getElementById(`wrp-dsc-${ws}`);
  const totEl = document.getElementById(`wrp-tot-${ws}`);
  if (subEl) subEl.textContent = fmt(subtotal);
  if (dscEl) dscEl.textContent = discountTotal > 0 ? '-'+fmt(discountTotal) : '—';
  if (totEl) { totEl.textContent = fmt(total); totEl.style.color = total >= 0 ? '#34d399' : '#f87171'; }
  const pillEl = document.getElementById(`wrp-pill-${ws}`);
  if (pillEl) pillEl.textContent = fmt(total);
}

function renderWrpDiscounts(ws) {
  const el = document.getElementById(`wrp-discounts-${ws}`);
  if (!el) return;
  const discs    = window._wrpOverrides[ws]?.discounts || [];
  const editable = window._wrpEditableWeeks?.has(ws);
  if (!discs.length && !editable) { el.innerHTML = ''; wrpUpdateInvoiceTotals(ws); return; }

  // Count existing lead rows to continue alternation
  const leadRowCount = Object.keys(window._wrpWeeks?.[ws]?.boards || {}).length;

  const rows = discs.map((d, i) => {
    const bg    = (leadRowCount + i) % 2 === 0 ? '#f8faff' : '#eef3fb';
    const total = d.leads * d.price;
    const descCell = editable
      ? `<input value="${esc(d.desc)}" placeholder="Motivo…" data-ws="${ws}" data-id="${d.id}" data-field="desc"
           class="wrp-disc-input"
           style="width:100%;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;color:#1f2937;outline:none;font-family:inherit"/>`
      : (esc(d.desc) || 'Reposición');
    const leadsCell = editable
      ? `<input type="number" min="0" value="${d.leads}" data-ws="${ws}" data-id="${d.id}" data-field="leads"
           class="wrp-disc-input"
           style="width:65px;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;font-weight:700;text-align:center;outline:none;font-family:inherit"/>`
      : d.leads;
    const priceCell = editable
      ? `<input type="number" min="0" step="0.01" value="${d.price}" data-ws="${ws}" data-id="${d.id}" data-field="price"
           class="wrp-disc-input"
           style="width:75px;background:transparent;border:none;border-bottom:1px dashed #fca5a5;padding:3px 0;font-size:13px;text-align:right;outline:none;font-family:inherit"/>`
      : (d.price ? '$'+d.price.toFixed(2) : '—');
    const deleteBtn = editable
      ? `<button data-ws="${ws}" data-id="${d.id}" class="wrp-disc-del" title="Eliminar"
           style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;opacity:.7">✕</button>`
      : '';
    return `<tr style="background:${bg}">
      <td style="padding:11px 20px;font-size:13px;color:#1e293b;border-bottom:1px solid #dde6f0">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:8px;vertical-align:middle"></span>
        Reposición de lead · ${descCell}
      </td>
      <td style="padding:11px 20px;text-align:center;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;font-weight:700;color:#dc2626">${leadsCell}</td>
      <td style="padding:11px 20px;text-align:right;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;color:#475569">${priceCell}</td>
      <td style="padding:11px 20px;text-align:right;font-weight:700;color:#dc2626;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${total>0?'-$'+total.toFixed(2):'—'}</td>
      <td style="padding:11px 20px;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;text-align:center">${deleteBtn}</td>
    </tr>`;
  }).join('');

  const addBtn = editable
    ? `<tr style="background:#f8faff"><td colspan="5" style="padding:8px 20px;border-bottom:1px solid #dde6f0">
        <button data-ws="${ws}" class="wrp-disc-add" style="background:none;border:1px dashed #fca5a5;color:#dc2626;border-radius:6px;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:700">＋ Reposición de lead</button>
       </td></tr>`
    : '';

  el.innerHTML = addBtn + rows;

  // Attach events via JS (avoids onclick quoting issues with dynamic ws/id values)
  el.querySelectorAll('.wrp-disc-del').forEach(btn => {
    btn.addEventListener('click', () => wrpRemoveDiscount(btn.dataset.ws, btn.dataset.id));
  });
  el.querySelectorAll('.wrp-disc-add').forEach(btn => {
    btn.addEventListener('click', () => wrpAddDiscount(btn.dataset.ws));
  });
  el.querySelectorAll('.wrp-disc-input').forEach(inp => {
    inp.addEventListener('input', () => wrpEditDiscount(inp.dataset.ws, inp.dataset.id, inp.dataset.field, inp.value));
  });

  wrpUpdateInvoiceTotals(ws);
}

async function loadWeeklyReportPage() {
  const body = document.getElementById('wrp-pane-weekly');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">Cargando…</div>`;

  try {
    const [histRes, ovrRes] = await Promise.all([
      supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle(),
      supa.from('kv_store').select('value').eq('key','gew_week_overrides').maybeSingle(),
    ]);
    const history   = JSON.parse(histRes.data?.value || '[]');
    let   overrides = JSON.parse(ovrRes.data?.value  || '{}');

    const weeks = {};
    history.forEach(r => {
      const ws = r.weekStart;
      if (!ws) return;
      if (!weeks[ws]) {
        const mon = new Date(ws + 'T00:00:00');
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        weeks[ws] = { end: sun.toISOString().slice(0,10), boards: {} };
      }
      const price = r.pricePerLead || 0;
      (r.distribution || []).forEach(d => {
        const key = d.boardName;
        if (!weeks[ws].boards[key]) weeks[ws].boards[key] = { count: 0, price: 0 };
        weeks[ws].boards[key].count += d.count;
        if (price > 0) weeks[ws].boards[key].price = price;
      });
    });

    // Determine editable weeks (current + previous)
    const today = new Date();
    const dow   = today.getDay();
    const thisMon = new Date(today); thisMon.setDate(today.getDate() + (dow===0?-6:1-dow)); thisMon.setHours(0,0,0,0);
    const prevMon = new Date(thisMon); prevMon.setDate(thisMon.getDate()-7);
    const currentWS = thisMon.toISOString().slice(0,10);
    const prevWS    = prevMon.toISOString().slice(0,10);
    window._wrpEditableWeeks = _wrpAdminView ? new Set() : new Set([currentWS, prevWS]);

    // Assign invoice numbers (oldest→newest, starting at 187, +2–4 each)
    const sortedAsc = Object.keys(weeks).sort((a,b)=>a.localeCompare(b));
    let ovrChanged  = false;
    // Find max existing invoice number
    let lastNum = 186;
    sortedAsc.forEach(ws => { const n = overrides[ws]?.invoiceNumber||0; if(n>lastNum) lastNum=n; });
    // For weeks without a number, assign in order
    sortedAsc.forEach(ws => {
      if (!overrides[ws]) { overrides[ws]={discounts:[]}; ovrChanged=true; }
      if (!overrides[ws].invoiceNumber) {
        lastNum += Math.floor(Math.random()*3)+2;
        overrides[ws].invoiceNumber = lastNum;
        ovrChanged = true;
      }
    });
    if (ovrChanged) await supa.from('kv_store').upsert({key:'gew_week_overrides',value:JSON.stringify(overrides)});

    window._wrpOverrides = overrides;
    window._wrpWeeks     = weeks;

    const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));
    if (!sortedWeeks.length) {
      body.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--text2)">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="font-size:14px;font-weight:600">No hay datos semanales aún</div>
        <div style="font-size:12px;margin-top:6px">Importa leads asignando una semana para que aparezcan aquí</div>
      </div>`;
      return;
    }

    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fmtDate  = s => { const d = new Date(s+'T00:00:00'); return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; };
    const fmtMoney = n => '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const todayStr = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

    let allLeads = 0, allRevenue = 0;
    sortedWeeks.forEach(ws => {
      const ovr = overrides[ws] || {};
      Object.entries(weeks[ws].boards).forEach(([bName, b]) => {
        const p = ovr.boardPrices?.[bName] ?? b.price;
        allLeads += b.count; allRevenue += b.count * p;
      });
    });

    const invoiceCards = sortedWeeks.map((ws) => {
      const w       = weeks[ws];
      const ovr     = overrides[ws] || {};
      const mon     = new Date(ws + 'T00:00:00');
      const boards  = Object.entries(w.boards);
      const editable = window._wrpEditableWeeks.has(ws);
      const invNum  = String(ovr.invoiceNumber || '').padStart(5,'0');
      let grandTotal = 0, grandSubtotal = 0;

      const rows = boards.map(([bName, info], idx) => {
        const price   = ovr.boardPrices?.[bName] ?? info.price;
        const subtotal = info.count * price;
        grandTotal += info.count; grandSubtotal += subtotal;
        const bg = idx % 2 === 0 ? '#f8faff' : '#eef3fb';
        const priceCell = editable
          ? `<td style="padding:8px 14px;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0;text-align:right">
               <input type="number" min="0" step="0.01" value="${price||''}" placeholder="0.00"
                 oninput="wrpSetPrice('${ws}','${esc(bName)}',this.value);this.closest('tr').querySelector('.wrp-row-sub').textContent=this.value*${info.count}>0?'$'+(this.value*${info.count}).toFixed(2):'—'"
                 style="width:80px;border:1px solid #bfdbfe;border-radius:6px;padding:5px 8px;font-size:12px;text-align:right;background:#f0f7ff;outline:none;font-family:inherit"/>
             </td>`
          : `<td style="padding:11px 20px;text-align:right;font-size:13px;color:#475569;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${price>0?fmtMoney(price):'—'}</td>`;
        return `<tr style="background:${bg}">
          <td style="padding:11px 20px;font-size:13px;color:#1e293b;border-bottom:1px solid #dde6f0">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:8px;vertical-align:middle"></span>
            Lead · <strong>${esc(bName)}</strong>
          </td>
          <td style="padding:11px 20px;text-align:center;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${info.count}</td>
          ${priceCell}
          <td class="wrp-row-sub" style="padding:11px 20px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0">${subtotal>0?fmtMoney(subtotal):'—'}</td>
          <td style="padding:11px 20px;font-size:12px;color:#94a3b8;border-bottom:1px solid #dde6f0;border-left:1px solid #dde6f0"></td>
        </tr>`;
      }).join('');

      const discountTotal = (ovr.discounts||[]).reduce((s,d)=>s+d.leads*d.price,0);
      const total = grandSubtotal - discountTotal;

      return `<div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06);margin-bottom:40px;overflow:hidden;border:1px solid #e2e8f0;font-family:'Segoe UI',system-ui,sans-serif">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0f2044 0%,#1e3a5f 60%,#1a4a7a 100%);padding:28px 32px 24px;position:relative;overflow:hidden">
          <div style="position:absolute;right:-20px;top:-20px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.04)"></div>
          <div style="position:absolute;right:40px;bottom:-40px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.03)"></div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;position:relative">
            <div>
              <div style="font-size:11px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:.12em;margin-bottom:4px">Grupo Elite Work</div>
              <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px">CRM Development Services</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:6px">lead.grupoelitework.com</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Reporte Semanal</div>
              <div style="font-size:24px;font-weight:800;color:#fff;margin-top:2px;letter-spacing:1px"># ${invNum}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px">Generado: ${todayStr}</div>
              ${editable ? '<div style="margin-top:6px;background:rgba(34,197,94,.2);color:#86efac;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;display:inline-block">✏️ Editable</div>' : ''}
            </div>
          </div>
          <div style="margin-top:20px;padding:10px 16px;background:rgba(255,255,255,.08);border-radius:8px;display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.12)">
            <span style="font-size:13px;color:#bfdbfe">📅</span>
            <span style="font-size:13px;font-weight:700;color:#e2e8f0">Semana del ${fmtDate(ws)} al ${fmtDate(w.end)}</span>
            <span style="font-size:11px;color:#93c5fd;background:rgba(147,197,253,.15);padding:2px 10px;border-radius:20px;margin-left:4px">${MONTHS_ES[mon.getMonth()]} ${mon.getFullYear()}</span>
          </div>
        </div>

        <!-- Table -->
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#1e3a5f">
              <th style="padding:11px 20px;text-align:left;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em">Descripción</th>
              <th style="padding:11px 20px;text-align:center;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Cantidad</th>
              <th style="padding:11px 20px;text-align:right;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Precio/Lead</th>
              <th style="padding:11px 20px;text-align:right;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Subtotal</th>
              <th style="padding:11px 20px;text-align:left;font-size:11px;font-weight:700;color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;border-left:1px solid #2d5080">Notas</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tbody id="wrp-discounts-${ws}"></tbody>
          </tbody>
        </table>

        <!-- Totals footer -->
        <div style="background:#f8faff;border-top:2px solid #e2e8f0;padding:0">
          <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif">
            <tr>
              <td style="padding:10px 20px;font-size:12px;color:#64748b;font-weight:600;width:60%">Subtotal leads</td>
              <td style="padding:10px 20px;text-align:right;font-size:13px;font-weight:700;color:#0f172a" id="wrp-sub-${ws}">${fmtMoney(grandSubtotal)}</td>
            </tr>
            <tr style="background:#0f2044">
              <td style="padding:14px 20px;font-size:13px;font-weight:800;color:#93c5fd;text-transform:uppercase;letter-spacing:.06em">TOTAL</td>
              <td style="padding:14px 20px;text-align:right;font-size:18px;font-weight:800;color:#34d399" id="wrp-tot-${ws}">${fmtMoney(total)}</td>
            </tr>
          </table>
        </div>

        <!-- Stats row (bottom) -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #e2e8f0;background:#f8faff">
          <div style="padding:14px 24px;border-right:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Boards</div>
            <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px">${boards.length}</div>
          </div>
          <div style="padding:14px 24px;border-right:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Total Leads</div>
            <div style="font-size:20px;font-weight:800;color:#1d4ed8;margin-top:2px">${grandTotal}</div>
          </div>
          <div style="padding:14px 24px">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Total Neto</div>
            <div style="font-size:20px;font-weight:800;color:#059669;margin-top:2px" id="wrp-pill-${ws}">${total>0?fmtMoney(total):'—'}</div>
          </div>
        </div>

        <!-- Card footer -->
        <div style="padding:12px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:10px;color:#94a3b8">Grupo Elite Work · CRM Development Services</span>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">REPORTE # ${invNum}</span>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = invoiceCards;

    // Render discount sections after DOM is ready
    sortedWeeks.forEach(ws => {
      renderWrpDiscounts(ws);
      wrpUpdateInvoiceTotals(ws);
    });

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);font-size:13px">Error cargando reporte: ${e.message}</div>`;
  }
}

async function loadDetailedReport() {
  const body = document.getElementById('wrp-pane-detail');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text2);font-size:13px;padding:20px 0">Cargando…</div>`;

  try {
    const { data } = await supa.from('kv_store').select('value').eq('key','gew_import_history').maybeSingle();
    const history = JSON.parse(data?.value || '[]');

    if (!history.length) {
      body.innerHTML = `<div style="text-align:center;padding:60px 0;color:var(--text2)">
        <div style="font-size:40px;margin-bottom:12px">📋</div>
        <div style="font-size:14px;font-weight:600">Sin registros de importación</div>
        <div style="font-size:12px;margin-top:6px">Las cargas de leads aparecerán aquí agrupadas por semana</div>
      </div>`;
      return;
    }

    // Group records by weekStart
    const weeks = {};
    history.filter(r => !r.undone).forEach(r => {
      const ws = r.weekStart || r.date?.slice(0,10) || '';
      if (!ws) return;
      if (!weeks[ws]) {
        const mon = new Date(ws + 'T00:00:00');
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        weeks[ws] = { end: sun.toISOString().slice(0,10), records: [] };
      }
      weeks[ws].records.push(r);
    });

    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fmtDate = s => {
      const d = new Date(s + 'T00:00:00');
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    };
    const fmtImportDate = s => {
      const d = new Date(s);
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    };

    const sortedWeeks = Object.keys(weeks).sort((a,b) => b.localeCompare(a));

    const blocks = sortedWeeks.map(ws => {
      const w = weeks[ws];
      const mon = new Date(ws + 'T00:00:00');

      // Collect individual leads from localStorage using stored leadIds
      const allRows = [];
      w.records.forEach(r => {
        const importDate = r.date ? fmtImportDate(r.date) : '—';
        (r.distribution || []).forEach(dist => {
          const leads = loadLeads(dist.boardId);
          const leadIds = dist.leadIds || [];
          if (leadIds.length) {
            leadIds.forEach(id => {
              const l = leads.find(x => x.id === id);
              allRows.push({
                nombre:    l?.nombre    || '—',
                direccion: l?.direccion || l?.ubicacion || '—',
                board:     dist.boardName,
                fecha:     importDate,
              });
            });
          } else {
            // Older records without leadIds: show count summary row
            for (let i = 0; i < dist.count; i++) {
              allRows.push({ nombre: '(sin detalle)', direccion: '—', board: dist.boardName, fecha: importDate });
            }
          }
        });
      });

      const rows = allRows.map((row, i) => `<tr style="background:${i%2===0?'#fff':'#f8faff'}">
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:13px;color:#1e293b;font-weight:500">${esc(row.nombre)}</td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px;color:#475569">${esc(row.direccion)}</td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px">
          <span style="background:rgba(59,130,246,.1);color:#1d4ed8;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${esc(row.board)}</span>
        </td>
        <td style="padding:9px 16px;border-bottom:1px solid #e8edf5;font-size:12px;color:#64748b;white-space:nowrap">${esc(row.fecha)}</td>
      </tr>`).join('');

      const emptyNote = allRows.length === 0
        ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;font-style:italic">No hay datos disponibles para esta semana</td></tr>`
        : '';

      return `<div style="margin-bottom:32px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.07);border:1px solid #e2e8f0;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0f2044,#1e3a5f);padding:16px 24px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:11px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">${MONTHS_ES[mon.getMonth()]} ${mon.getFullYear()}</div>
            <div style="font-size:15px;font-weight:800;color:#fff">Semana del ${fmtDate(ws)} al ${fmtDate(w.end)}</div>
          </div>
          <div style="background:rgba(255,255,255,.12);border-radius:8px;padding:8px 18px;text-align:center;min-width:72px">
            <div style="font-size:22px;font-weight:900;color:#fff">${allRows.length}</div>
            <div style="font-size:10px;color:#93c5fd;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Leads</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Nombre</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Dirección</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Board</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Fecha importación</th>
            </tr>
          </thead>
          <tbody>${rows}${emptyNote}</tbody>
        </table>
      </div>`;
    });

    body.innerHTML = blocks.join('');
  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);font-size:13px">Error: ${e.message}</div>`;
  }
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) processCSVFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processCSVFile(file);
}

function processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    parseAndImport(text);
  };
  reader.readAsText(file, 'UTF-8');
}

function parseAndImport(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { showToast('CSV vacío o sin datos','error'); return; }

  const rawHeaders = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim()
    .replace(/[áä]/g,'a').replace(/[éë]/g,'e').replace(/[íï]/g,'i')
    .replace(/[óö]/g,'o').replace(/[úü]/g,'u').replace(/ñ/g,'n')
    .replace(/[^a-z0-9]/g,'_'));

  const destEl     = document.getElementById('import-dest');
  const destId     = destEl ? destEl.value : '';
  if (!destId) { showToast('Selecciona un board de destino', 'error'); return; }
  const csvLeadTypeEl = document.getElementById('import-lead-type');
  const csvLeadType   = csvLeadTypeEl ? csvLeadTypeEl.value : '';
  const leads  = loadLeads(destId);
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i]);
    if (vals.every(v => !v.trim())) continue;
    const row = {};
    rawHeaders.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

    const lead = {
      id:          uid(),
      creacion:    today(),
      nombre:      row.nombre || '',
      lead:        csvLeadType || row.lead || '',
      email:       row.email || '',
      telefono:    row.telefono || row.phone || row.tel || '',
      hijos:       row.hijos || '',
      direccion:   row.direccion || row.address || '',
      ubicacion:   row.ubicacion || row.location || '',
      asignado:    normalizeAsignado(row.asignado || ''),
      estado:      row.estado || row.status || '',
      resultado:   row.resultado || '',

      notas:       row.notas || row.notes || '',
    };
    if (lead.asignado) {
      const _csvUser = loadUsers().find(u => u.name === lead.asignado);
      if (_csvUser) lead.asignadoId = _csvUser.id;
    }
    leads.push(lead);
    imported++;
  }

  saveLeads(destId, leads);
  document.getElementById('import-log').innerHTML =
    `<span style="color:var(--green)">✓ ${imported} lead(s) importados al board <strong>${getBoard(destId).name}</strong></span>`;
  allBoards();
  showToast(`${imported} leads importados ✓`, 'success');
}

function parseCSVRow(line) {
  const result = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

// ════════════════════════════════════════════
