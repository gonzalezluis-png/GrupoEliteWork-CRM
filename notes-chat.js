//  NOTES PANEL
// ════════════════════════════════════════════
let _notesBoardId  = null;
let _notesLeadId   = null;
let _notesNavList  = [];   // ordered list of {id, boardId} for prev/next

function _updateNpNav(leadId) {
  const idx     = _notesNavList.findIndex(e => e.id === leadId);
  const total   = _notesNavList.length;
  const prevBtn = document.getElementById('np-prev-btn');
  const nextBtn = document.getElementById('np-next-btn');
  const counter = document.getElementById('np-nav-counter');
  if (counter) counter.textContent = total > 1 ? `${idx + 1} / ${total}` : '';
  if (prevBtn) prevBtn.style.opacity = idx <= 0 ? '0.35' : '1';
  if (nextBtn) nextBtn.style.opacity = idx >= total - 1 ? '0.35' : '1';
}

function notesPanelNav(dir) {
  const idx = _notesNavList.findIndex(e => e.id === _notesLeadId);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _notesNavList.length) return;
  const { id, boardId } = _notesNavList[newIdx];
  // Temporarily set currentBoardId so openNotesPanel finds the right board
  const prev = currentBoardId;
  currentBoardId = boardId;
  openNotesPanel(id, _notesNavList);
  currentBoardId = prev;
}

function parseNotes(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
  } catch {}
  // legacy plain string — show as a single note without date/author
  return raw.trim() ? [{ text: raw, author: 'Sistema', date: '' }] : [];
}

function formatNoteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-US', { hour: '2-digit', minute: '2-digit' });
}

function openNotesPanel(leadId, navList) {
  const boardId = (currentBoardId === '__agent__') ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const lead = loadLeads(boardId).find(l => l.id === leadId);
  if (!lead) return;
  _notesBoardId = boardId;
  _notesLeadId  = leadId;

  // Build or reuse navigation list
  if (navList) {
    _notesNavList = navList;
  } else if (!_notesNavList.length || !_notesNavList.find(e => e.id === leadId)) {
    // Build from current filteredLeads
    _notesNavList = filteredLeads.map(l => ({ id: l.id, boardId: boardId }));
  }
  _updateNpNav(leadId);

  // Reset edit mode when opening a new lead
  _npEditMode = false;
  const editBtn = document.getElementById('np-edit-btn');
  if (editBtn) { editBtn.textContent = '✏️ Editar'; editBtn.style.background = 'rgba(255,255,255,0.15)'; editBtn.style.borderColor = 'rgba(255,255,255,0.3)'; }
  document.getElementById('np-edit-nombre')?.remove();
  document.getElementById('notes-panel-name').style.display = '';

  const npName = lead.nombre || '—';
  document.getElementById('notes-panel-name').textContent = npName;
  // Show previous name faintly if it exists
  const prevNombreEl = document.getElementById('np-prev-nombre');
  if (lead.prev_nombre) { prevNombreEl.textContent = 'Antes: ' + lead.prev_nombre; prevNombreEl.style.display = ''; }
  else { prevNombreEl.style.display = 'none'; }
  const npInitials = npName.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('np-avatar').textContent = npInitials || '?';

  // Lead type badge in banner
  document.getElementById('notes-panel-leadtype').innerHTML = lead.lead
    ? `<span style="background:rgba(255,255,255,0.17);border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:2px 9px;font-size:10px;color:rgba(255,255,255,0.95);font-weight:500">📋 ${esc(lead.lead)}</span>`
    : '';

  // Info grid: email, dirección, creación, resultado
  function _npInfoCell(icon, label, val) {
    const display = val || '<span style="color:var(--text2);font-style:italic">—</span>';
    return `<div style="display:flex;flex-direction:column;gap:2px;min-width:0">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">${icon} ${label}</span>
      <span style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(val||'')}">${val ? esc(val) : display}</span>
    </div>`;
  }
  document.getElementById('np-info-grid').innerHTML =
    _npInfoCell('✉️','Email',     lead.email     || '') +
    _npInfoCell('🏠','Dirección', lead.direccion  || '') +
    _npInfoCell('📅','Creación',  lead.creacion   ? formatDate(lead.creacion) : '') +
    _npInfoCell('✅','Resultado', lead.resultado  || '');

  // Tags row: phone · location · agent
  const npChips = [
    lead.telefono  && { label:`📞 ${lead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
    lead.ubicacion && { label:`📍 ${lead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
    lead.asignado  && { label:`👤 ${lead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
  ].filter(Boolean);
  document.getElementById('notes-lead-summary').innerHTML = npChips.map(ch =>
    `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
  ).join('');

  // populate resultado dropdown with usage counts (excluding deletion resultados)
  const RESULTADO_EXCLUIR = new Set(['NO INTERESADO', 'NÚMERO EQUIVOCADO']);
  const resCounts = {};
  parseNotes(lead._notes).forEach(n => {
    if (n.system && n.text && n.text.startsWith('Resultado: ')) {
      const r = n.text.slice('Resultado: '.length).trim();
      if (!RESULTADO_EXCLUIR.has(r)) resCounts[r] = (resCounts[r] || 0) + 1;
    }
  });
  const resSel = document.getElementById('notes-resultado-sel');
  resSel.innerHTML = `<option value="">— Seleccionar resultado —</option>` +
    RESULTADOS.map(r => {
      const cnt = !RESULTADO_EXCLUIR.has(r) && resCounts[r] > 0 ? ` (×${resCounts[r]})` : '';
      return `<option value="${esc(r)}">${esc(r)}${cnt}</option>`;
    }).join('');
  resSel.value = '';

  // Migrate plain `notas` → `_notes` journal if needed
  if (lead.notas && lead.notas.trim() && !lead._notes) {
    lead._notes = JSON.stringify([{ text: lead.notas.trim(), author: 'Sistema', date: lead.creacion ? lead.creacion + 'T00:00:00Z' : new Date().toISOString(), system: true }]);
    const leads = loadLeads(boardId);
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx !== -1) { leads[idx]._notes = lead._notes; saveLeads(boardId, leads); }
  }
  _renderNotesJournal(lead);
  document.getElementById('notes-new-input').value = '';
  // pre-fill phone for messages tab
  const phoneInp = document.getElementById('msg-phone-inp');
  if (phoneInp) phoneInp.value = lead.telefono || '';
  // Auto-select channel based on last message
  const _msgs = JSON.parse(lead._messages || '[]');
  const _lastMsg = _msgs.length ? _msgs[_msgs.length - 1] : null;
  setMsgChannel(_lastMsg ? (_lastMsg.channel || 'sms') : 'sms');
  _renderMsgJournal(lead);
  const _s = getSession();
  document.getElementById('np-tab-messages').style.display = (_s && _s.role === 'master') ? '' : 'none';
  document.getElementById('np-tab-calls').style.display = '';
  loadMsgCredits(boardId);
  switchNotesPanelTab('notes');
  document.getElementById('notes-panel-overlay').classList.add('open');
  _startMsgPolling();
}


let _npEditMode = false;

function toggleNpEdit() {
  _npEditMode ? _saveNpEdit() : _enterNpEdit();
}

function _enterNpEdit() {
  _npEditMode = true;
  const boardId = _notesBoardId;
  const leads   = loadLeads(boardId);
  const lead    = leads.find(l => l.id === _notesLeadId);
  if (!lead) return;

  document.getElementById('np-edit-btn').textContent = '💾 Guardar';
  document.getElementById('np-edit-btn').style.background = 'rgba(0,200,117,0.25)';
  document.getElementById('np-edit-btn').style.borderColor = 'rgba(0,200,117,0.5)';

  // Replace name with input
  const nameEl = document.getElementById('notes-panel-name');
  nameEl.style.display = 'none';
  if (!document.getElementById('np-edit-nombre')) {
    const inp = document.createElement('input');
    inp.id = 'np-edit-nombre';
    inp.type = 'text';
    inp.value = lead.nombre || '';
    inp.style.cssText = 'font-size:15px;font-weight:700;color:#fff;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:6px;padding:4px 10px;width:100%;font-family:var(--font);outline:none;margin-bottom:2px;';
    nameEl.parentElement.insertBefore(inp, nameEl);
  }

  // Replace info grid with inputs
  document.getElementById('np-info-grid').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">✉️ Email</span>
      <input id="np-edit-email" type="email" value="${esc(lead.email||'')}" placeholder="correo@ejemplo.com"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">📞 Teléfono</span>
      <input id="np-edit-telefono" type="tel" value="${esc(lead.telefono||'')}" placeholder="+1 000 000 0000"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
    <div style="display:flex;flex-direction:column;gap:3px;grid-column:span 2">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--text2);font-weight:600">🏠 Dirección</span>
      <input id="np-edit-direccion" type="text" value="${esc(lead.direccion||'')}" placeholder="Dirección completa"
        style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-family:var(--font);font-size:12px;outline:none;width:100%;" />
    </div>
  `;
}

async function _saveNpEdit() {
  const boardId = _notesBoardId;
  const leads   = loadLeads(boardId);
  const idx     = leads.findIndex(l => l.id === _notesLeadId);
  if (idx === -1) return;

  const lead     = leads[idx];
  const newNombre = (document.getElementById('np-edit-nombre')?.value || '').trim();
  const newEmail  = (document.getElementById('np-edit-email')?.value || '').trim();
  const newTel    = (document.getElementById('np-edit-telefono')?.value || '').trim();
  const newDir    = (document.getElementById('np-edit-direccion')?.value || '').trim();

  if (!newNombre) { showToast('El nombre es requerido', 'error'); return; }

  const nombreCambio = newNombre.toLowerCase() !== (lead.nombre || '').toLowerCase();
  const prevNombre   = lead.nombre;

  leads[idx] = { ...lead, nombre: newNombre, email: newEmail, telefono: newTel, direccion: newDir };
  if (nombreCambio) leads[idx].prev_nombre = prevNombre;

  await saveLeads(boardId, leads);
  logActivity('lead_edit', `Lead editado: ${newNombre}`, nombreCambio ? `Nombre anterior: ${prevNombre}` : '');

  _npEditMode = false;

  // Restore edit button
  const btn = document.getElementById('np-edit-btn');
  btn.textContent = '✏️ Editar';
  btn.style.background = 'rgba(255,255,255,0.15)';
  btn.style.borderColor = 'rgba(255,255,255,0.3)';

  // Restore name display
  const nameEl = document.getElementById('notes-panel-name');
  nameEl.textContent = newNombre;
  nameEl.style.display = '';
  document.getElementById('np-edit-nombre')?.remove();

  // Show previous name faintly
  const prevEl = document.getElementById('np-prev-nombre');
  if (nombreCambio && prevNombre) {
    prevEl.textContent = 'Antes: ' + prevNombre;
    prevEl.style.display = '';
  } else {
    prevEl.style.display = 'none';
  }

  // Update avatar initials
  const npInitials = newNombre.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('np-avatar').textContent = npInitials || '?';

  // Re-render info grid and tags in the panel
  const updatedLead = leads[idx];
  const npChips2 = [
    updatedLead.telefono  && { label:`📞 ${updatedLead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
    updatedLead.ubicacion && { label:`📍 ${updatedLead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
    updatedLead.asignado  && { label:`👤 ${updatedLead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
  ].filter(Boolean);
  const summaryEl = document.getElementById('notes-lead-summary');
  if (summaryEl) summaryEl.innerHTML = npChips2.map(ch =>
    `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
  ).join('');

  // Refresh table row immediately without reloading the panel
  applyFilters();
  showToast('Lead actualizado ✓', 'success');
  try { renderTable && renderTable(); } catch(e) {}
}

function _renderNotesJournal(lead) {
  let notes = parseNotes(lead._notes);
  // Fallback: if journal is empty but the plain `notas` field has content, show it
  if (!notes.length && lead.notas && lead.notas.trim()) {
    notes = [{ text: lead.notas.trim(), author: 'Sistema', date: lead.creacion || '', system: true }];
  }
  const el = document.getElementById('notes-journal');
  if (!notes.length) {
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;text-align:center;padding:20px 0">Sin notas aún. Sé el primero en agregar una.</div>`;
    return;
  }
  el.innerHTML = notes.map(n => n.system ? `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(0,115,234,.07);border:1px solid rgba(0,115,234,.18);border-radius:6px">
      <span style="font-size:11px;color:var(--text2)">🔄</span>
      <span style="font-size:11px;color:var(--text2);flex:1">${esc(n.text)}</span>
      <span style="font-size:10px;color:var(--gray)">${esc(n.author)} · ${n.date ? formatNoteDate(n.date) : ''}</span>
    </div>
  ` : `
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;display:flex;gap:8px;align-items:center">
        <strong style="color:var(--accent)">${esc(n.author)}</strong>
        <span>${n.date ? formatNoteDate(n.date) : ''}</span>
      </div>
      <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.6">${esc(n.text)}</div>
    </div>
  `).join('');
  // scroll to bottom so latest note is visible
  el.scrollTop = el.scrollHeight;
}

let _msgChannel = 'sms';

function switchNotesPanelTab(tab) {
  document.getElementById('np-pane-notes').style.display    = tab === 'notes'    ? 'flex' : 'none';
  document.getElementById('np-pane-messages').style.display = tab === 'messages' ? 'flex' : 'none';
  document.getElementById('np-pane-calls').style.display    = tab === 'calls'    ? 'flex' : 'none';
  ['notes','messages','calls'].forEach(t => {
    const el = document.getElementById('np-tab-' + t);
    if (!el) return;
    const active = t === tab;
    el.style.color            = active ? 'var(--accent)' : 'var(--text2)';
    el.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    el.style.fontWeight       = active ? '600' : '500';
  });
  if (tab === 'calls') _renderCallsPane();
}

const WA_TEMPLATE_SID  = 'HX872c8dfe2ba6f8d9833284769872f0bb';
const WA_TEMPLATE_BODY = 'Hola {{1}}, te contacta {{2}} de Grupo Elite Work. Estamos haciendo seguimiento a tu interés en nuestras propiedades. ¿Tienes unos minutos para conversar? Responde STOP para no recibir más mensajes.';

function setMsgChannel(ch, skipWarning = false) {
  // Channel mismatch warning (only when user manually switches)
  if (!skipWarning && _notesBoardId && _notesLeadId) {
    const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
    if (lead) {
      const msgs = JSON.parse(lead._messages || '[]');
      const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
      if (lastMsg && lastMsg.channel && lastMsg.channel !== ch) {
        const lastCh = lastMsg.channel === 'whatsapp' ? 'WhatsApp' : 'Mensaje de texto';
        const warn = document.getElementById('msg-channel-warn');
        if (warn) {
          warn.style.display = '';
          warn.innerHTML = `⚠️ Tu última conversación con <strong>${esc(lead.nombre||'este lead')}</strong> fue via <strong>${lastCh}</strong>. Te recomendamos mantener esa misma comunicación.
            <button onclick="setMsgChannel('${ch}', true)" style="margin-left:10px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Enviar de todas formas</button>
            <button onclick="setMsgChannel('${lastMsg.channel}', true)" style="margin-left:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer">Cancelar</button>`;
          return; // don't actually switch yet
        }
      }
    }
  }
  // Hide warning
  const warn = document.getElementById('msg-channel-warn');
  if (warn) warn.style.display = 'none';

  _msgChannel = ch;
  const btnS = document.getElementById('msg-ch-sms');
  const btnW = document.getElementById('msg-ch-whatsapp');
  // SMS active: blue; WhatsApp active: green; inactive: muted
  const smsOn   = 'flex:1;padding:7px;border-radius:8px;border:1px solid rgba(0,115,234,.5);background:rgba(0,115,234,.15);color:var(--accent);font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer';
  const waOn    = 'flex:1;padding:7px;border-radius:8px;border:1px solid rgba(37,211,102,.6);background:rgba(37,211,102,.18);color:#25d366;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 0 0 2px rgba(37,211,102,.2)';
  const offStyle = 'flex:1;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--text2);font-family:var(--font);font-size:12px;font-weight:500;cursor:pointer';
  if (btnS) btnS.style.cssText = ch === 'sms' ? smsOn : offStyle;
  if (btnW) btnW.style.cssText = ch === 'whatsapp' ? waOn : offStyle;

  // Show/hide template bar — only if template hasn't been sent yet
  const tbar = document.getElementById('msg-template-bar');
  const tprev = document.getElementById('msg-template-preview');
  if (tbar) {
    const lead = _notesBoardId ? loadLeads(_notesBoardId).find(l => l.id === _notesLeadId) : null;
    const msgs = JSON.parse(lead?._messages || '[]');
    const alreadySent = msgs.some(m => m.template === true);
    tbar.style.display = (ch === 'whatsapp' && !alreadySent) ? '' : 'none';
    if (tprev && ch === 'whatsapp' && !alreadySent) {
      const session = getSession();
      const v1 = lead?.nombre || 'Cliente';
      const v2 = session?.name || 'Agente';
      tprev.textContent = WA_TEMPLATE_BODY.replace('{{1}}', v1).replace('{{2}}', v2);
    }
  }
}

async function sendWhatsAppTemplate() {
  const status = document.getElementById('msg-status');
  const btn    = document.getElementById('msg-send-btn');
  const leads  = loadLeads(_notesBoardId);
  const lead   = leads.find(l => l.id === _notesLeadId);
  if (!lead?.telefono) { if (status) { status.textContent = '⚠️ El lead no tiene número de teléfono'; status.style.color = '#e2445c'; } return; }

  const session = getSession();
  const v1 = lead.nombre || 'Cliente';
  const v2 = session?.name || 'Agente';
  const to = lead.telefono;

  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Enviando template…'; status.style.color = 'var(--text2)'; }

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        to,
        channel: 'whatsapp',
        boardId: _notesBoardId,
        contentSid: WA_TEMPLATE_SID,
        contentVariables: { '1': v1, '2': v2 },
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Log message in lead history
    const previewText = WA_TEMPLATE_BODY.replace('{{1}}', v1).replace('{{2}}', v2);
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to, from: data.from || '', body: previewText, channel: 'whatsapp', template: true, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_notesBoardId, leads);
    _renderMsgJournal(lead);

    if (status) { status.textContent = '✓ Template enviado por WhatsApp'; status.style.color = '#25d366'; }
    if (data.creditsLeft !== undefined) {
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.creditsLeft; cv.style.color = data.creditsLeft < 10 ? '#e2445c' : 'var(--accent)'; }
    }
  } catch(e) {
    if (status) { status.textContent = '⚠️ ' + e.message; status.style.color = '#e2445c'; }
  }
  if (btn) btn.disabled = false;
}

function _renderMsgJournal(lead) {
  const el = document.getElementById('msg-journal');
  if (!el) return;
  const msgs = JSON.parse(lead._messages || '[]');
  if (!msgs.length) {
    el.innerHTML = `<div style="color:var(--text2);font-size:12px;text-align:center;padding:20px 0">Sin mensajes enviados aún.</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isInbound = m.direction === 'inbound';
    const borderColor = isInbound ? 'rgba(37,211,102,.3)' : 'var(--border)';
    const bg = isInbound ? 'rgba(37,211,102,.06)' : 'var(--card2)';
    const dirLabel = isInbound
      ? `<span style="background:rgba(37,211,102,.2);color:#25d366;padding:1px 7px;border-radius:10px;font-weight:700;font-size:10px">↩ Respuesta</span>`
      : `<span style="background:${m.channel==='whatsapp'?'rgba(37,211,102,.15)':'rgba(0,115,234,.12)'};color:${m.channel==='whatsapp'?'#25d366':'var(--accent)'};padding:1px 7px;border-radius:10px;font-weight:600;font-size:10px">${m.channel==='whatsapp'?'WhatsApp':'SMS'}${m.template?' · Template':''}</span>`;
    const fromTo = isInbound
      ? `<span style="color:var(--text2)">De: <strong style="color:var(--text)">${esc(m.from||m.author)}</strong></span>`
      : (m.from ? `<span style="color:var(--text2)">De: <strong style="color:var(--text)">${esc(m.from)}</strong></span><span>→ ${esc(m.to)}</span>` : `<span>→ ${esc(m.to)}</span>`);
    return `
    <div style="background:${bg};border:1px solid ${borderColor};border-radius:8px;padding:10px 14px">
      <div style="font-size:10px;color:var(--text2);margin-bottom:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${dirLabel}
        ${fromTo}
        <span style="margin-left:auto">${isInbound ? '' : esc(m.author)+' · '}${formatNoteDate(m.date)}</span>
      </div>
      <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5">${esc(m.body)}</div>
      ${!isInbound ? (m.error ? `<div style="font-size:11px;color:#e2445c;margin-top:4px">⚠️ ${esc(m.error)}</div>` : `<div style="font-size:10px;color:#00c875;margin-top:4px">✓ ${esc(m.sid||'enviado')}</div>`) : ''}
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendLeadMessage() {
  const to   = document.getElementById('msg-phone-inp').value.trim();
  const body = document.getElementById('msg-body-inp').value.trim();
  const status = document.getElementById('msg-status');
  const btn    = document.getElementById('msg-send-btn');
  if (!to || !body) { status.textContent = 'Completa número y mensaje.'; status.style.color = '#e2445c'; return; }

  btn.disabled = true;
  status.textContent = 'Enviando…';
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to, body, channel: _msgChannel, boardId: _notesBoardId }),
    });
    const data = await res.json();

    const leads = loadLeads(_notesBoardId);
    const lead  = leads.find(l => l.id === _notesLeadId);
    if (lead) {
      const session = getSession();
      const msgs = JSON.parse(lead._messages || '[]');
      msgs.push({ to, from: data.from || '', body, channel: _msgChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: data.error || '' });
      lead._messages = JSON.stringify(msgs);
      saveLeads(_notesBoardId, leads);
      _renderMsgJournal(lead);
    }

    if (data.error) throw new Error(data.error);
    status.textContent = '✓ Mensaje enviado';
    status.style.color = '#00c875';
    document.getElementById('msg-body-inp').value = '';
    if (data.creditsLeft !== undefined) {
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.creditsLeft; cv.style.color = data.creditsLeft < 10 ? '#e2445c' : 'var(--accent)'; }
      if (_autochargeEnabled && data.creditsLeft <= _autochargeThreshold) {
        triggerAutoRecharge();
      }
    }
  } catch(e) {
    status.textContent = '⚠️ ' + e.message;
    status.style.color = '#e2445c';
  }
  btn.disabled = false;
}

function toggleVideoPanel() {
  const p = document.getElementById('msg-video-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function sendLeadVideo() {
  const videoUrl = document.getElementById('msg-video-url').value.trim();
  const caption  = document.getElementById('msg-video-caption').value.trim();
  const status   = document.getElementById('msg-video-status');
  const btn      = document.getElementById('msg-video-btn');
  const phone    = document.getElementById('msg-phone-inp').value.trim();

  if (!videoUrl) { status.textContent = 'Ingresa la URL del video.'; status.style.color = '#e2445c'; return; }
  if (!phone)    { status.textContent = 'Ingresa el número de teléfono arriba.'; status.style.color = '#e2445c'; return; }

  btn.disabled = true;
  status.textContent = 'Enviando video…';
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch('https://elite-reclutamiento-production.up.railway.app/meta/wa-send-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, videoUrl, caption: caption || undefined, leadId: _notesLeadId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    const leads = loadLeads(_notesBoardId);
    const lead  = leads.find(l => l.id === _notesLeadId);
    if (lead) {
      const session = getSession();
      const msgs = JSON.parse(lead._messages || '[]');
      msgs.push({ to: phone, from: '', body: `[VIDEO] ${caption || videoUrl}`, channel: 'whatsapp', date: new Date().toISOString(), author: session?.name || '?', sid: data.messageId || '' });
      lead._messages = JSON.stringify(msgs);
      saveLeads(_notesBoardId, leads);
      _renderMsgJournal(lead);
    }

    status.textContent = '✓ Video enviado';
    status.style.color = '#25d366';
  } catch(e) {
    status.textContent = '⚠️ ' + e.message;
    status.style.color = '#e2445c';
  }
  btn.disabled = false;
}

// ════════════════════════════════════════════
//  CHAT POPUP
// ════════════════════════════════════════════
let _cpLeadId = null, _cpBoardId = null, _cpChannel = 'sms', _cpOpen = false;

function openChatPopup(leadId) {
  const boardId = currentBoardId === '__agent__' ? findLeadBoard(leadId) : currentBoardId;
  if (!boardId) return;
  const lead = loadLeads(boardId).find(l => l.id === leadId);
  if (!lead) return;
  _cpLeadId = leadId;
  _cpBoardId = boardId;

  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || '#0073ea';
  const av = document.getElementById('cp-avatar');
  av.textContent = initials;
  av.style.background = bg + '25';
  av.style.color = bg;
  document.getElementById('cp-name').textContent = lead.nombre || '—';
  document.getElementById('cp-phone').textContent = lead.telefono || '';

  const popup = document.getElementById('chat-popup');
  popup.style.display = 'flex';
  _cpOpen = true;
  renderChatPopupMsgs(lead);
}

function initChatResize(e) {
  e.preventDefault(); e.stopPropagation();
  const popup = document.getElementById('chat-popup');
  const startX = e.clientX, startY = e.clientY;
  const startW = popup.offsetWidth, startH = popup.offsetHeight;
  function onMove(e) {
    popup.style.width  = Math.max(280, Math.min(600, startW - (e.clientX - startX))) + 'px';
    popup.style.height = Math.max(320, Math.min(window.innerHeight * .9, startH - (e.clientY - startY))) + 'px';
  }
  function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function closeChatPopup() {
  document.getElementById('chat-popup').style.display = 'none';
  _cpOpen = false;
}

function toggleChatPopup() {
  const msgs = document.getElementById('cp-msgs');
  const input = document.getElementById('cp-input').parentElement;
  const chBtns = document.getElementById('cp-ch-sms').parentElement;
  const collapsed = msgs.style.display === 'none';
  msgs.style.display = collapsed ? 'flex' : 'none';
  input.style.display = collapsed ? 'flex' : 'none';
  chBtns.style.display = collapsed ? 'flex' : 'none';
  document.getElementById('chat-popup').style.height = collapsed ? '520px' : '48px';
}

function setCpChannel(ch) {
  _cpChannel = ch;
  document.getElementById('cp-ch-sms').classList.toggle('active', ch === 'sms');
  document.getElementById('cp-ch-wa').classList.toggle('active', ch === 'whatsapp');
}

function renderChatPopupMsgs(lead) {
  const msgs = JSON.parse(lead._messages || '[]');
  const el = document.getElementById('cp-msgs');
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:12px;margin:auto">Sin mensajes aún.</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isOut = m.direction !== 'inbound';
    const time = m.date ? new Date(m.date).toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'}) : '';
    const chBadge = m.channel === 'whatsapp'
      ? `<svg title="WhatsApp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0" aria-label="WhatsApp"><title>WhatsApp</title><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`
      : `<svg title="Mensaje SMS" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0" aria-label="SMS"><title>Mensaje SMS</title><path fill="#0073ea" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
    return `<div style="display:flex;flex-direction:column;${isOut?'align-items:flex-end':'align-items:flex-start'}">
      <div class="${isOut?'conv-msg-out':'conv-msg-in'}" style="font-size:12px;padding:8px 12px">${esc(m.body||'')}</div>
      <div style="font-size:10px;color:var(--text2);margin-top:3px;display:flex;align-items:center;gap:4px;${isOut?'flex-direction:row-reverse':''}">${chBadge}<span>${time}${m.error?' ⚠️':' ✓'}</span></div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendChatPopupMsg() {
  if (!_cpLeadId || !_cpBoardId) return;
  const input = document.getElementById('cp-input');
  const body = input.value.trim();
  const statusEl = document.getElementById('cp-status');
  if (!body) return;

  const leads = loadLeads(_cpBoardId);
  const lead = leads.find(l => l.id === _cpLeadId);
  if (!lead?.telefono) { statusEl.textContent = '⚠️ Sin número de teléfono'; return; }

  statusEl.textContent = 'Enviando…';
  input.disabled = true;

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to: lead.telefono, body, channel: _cpChannel, boardId: _cpBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const session = getSession();
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to: lead.telefono, body, channel: _cpChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: '', direction: 'outbound' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_cpBoardId, leads);

    input.value = '';
    statusEl.textContent = '✓ Enviado';
    setTimeout(() => statusEl.textContent = '', 2000);
    renderChatPopupMsgs(lead);
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
  }
  input.disabled = false;
  input.focus();
}

// ════════════════════════════════════════════
