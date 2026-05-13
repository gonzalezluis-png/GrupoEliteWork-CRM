//  CONVERSATIONS PAGE
// ════════════════════════════════════════════
let _convLeadId = null, _convBoardId = null, _convChannel = 'sms', _convTab = 'all', _convSearch = '';

function showConversationsPage() {
  showBoardView();
  document.getElementById('conversations-page').style.display = 'flex';
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('assign-strip').classList.add('hidden');
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const nav = document.getElementById('nav-conversations');
  if (nav) nav.classList.add('active');
  document.getElementById('board-title').textContent = 'Conversaciones';
  renderConvList();
}

function _getAllConvLeads() {
  const all = [];
  BOARDS.forEach(b => loadLeads(b.id).forEach(l => {
    const msgs = JSON.parse(l._messages || '[]');
    if (msgs.length) all.push({ lead: l, boardId: b.id, boardName: b.name, msgs });
  }));
  return all.sort((a, b) => {
    const la = a.msgs[a.msgs.length-1]?.date || '';
    const lb = b.msgs[b.msgs.length-1]?.date || '';
    return lb.localeCompare(la);
  });
}

function renderConvList() {
  const el = document.getElementById('conv-list');
  if (!el) return;
  let items = _getAllConvLeads();

  if (_convSearch) {
    const q = _convSearch.toLowerCase();
    items = items.filter(i => (i.lead.nombre||'').toLowerCase().includes(q) || (i.lead.telefono||'').includes(q));
  }
  if (_convTab === 'unread') items = items.filter(i => i.msgs.some(m => m.direction === 'inbound' && !m.read));
  if (_convTab === 'sms')    items = items.filter(i => i.msgs.some(m => m.channel === 'sms'));
  if (_convTab === 'whatsapp') items = items.filter(i => i.msgs.some(m => m.channel === 'whatsapp'));

  if (!items.length) {
    el.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text2);font-size:12px">Sin conversaciones aún.</div>`;
    return;
  }

  el.innerHTML = items.map(({ lead, boardId, msgs }) => {
    const last = msgs[msgs.length-1];
    const initials = getInitials(lead.nombre);
    const bg = strToTableColor(lead.nombre) || 'rgba(0,115,234,.2)';
    const unread = msgs.filter(m => m.direction === 'inbound' && !m.read).length;
    const lastText = last ? (last.body||'').slice(0,40) + (last.body?.length>40?'…':'') : '';
    const lastTime = last?.date ? new Date(last.date).toLocaleDateString('es-US',{month:'short',day:'numeric'}) : '';
    const chIcon = last?.channel === 'whatsapp' ? '💬' : '📱';
    const isActive = _convLeadId === lead.id;
    return `<div class="conv-item${isActive?' active':''}" onclick="selectConv('${lead.id}','${boardId}')">
      <div class="conv-item-avatar" style="background:${bg}20;color:${bg}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
          <span style="font-size:13px;font-weight:${unread?'700':'500'};color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(lead.nombre||'Sin nombre')}</span>
          <span style="font-size:10px;color:var(--text2);flex-shrink:0">${lastTime}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
          <span style="font-size:11px">${chIcon}</span>
          <span style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(lastText)}</span>
          ${unread ? `<span style="background:var(--accent);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;flex-shrink:0">${unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function selectConv(leadId, boardId) {
  _convLeadId = leadId;
  _convBoardId = boardId;
  renderConvList();
  renderConvThread();
  renderConvDetail();
}

function renderConvThread() {
  if (!_convLeadId) return;
  const lead = loadLeads(_convBoardId).find(l => l.id === _convLeadId);
  if (!lead) return;
  const msgs = JSON.parse(lead._messages || '[]');
  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || 'rgba(0,115,234,.2)';

  document.getElementById('conv-thread-avatar').textContent = initials;
  document.getElementById('conv-thread-avatar').style.background = bg + '20';
  document.getElementById('conv-thread-avatar').style.color = bg;
  document.getElementById('conv-thread-name').textContent = lead.nombre || 'Sin nombre';
  document.getElementById('conv-thread-sub').textContent = [lead.telefono, lead.email].filter(Boolean).join(' · ');

  const el = document.getElementById('conv-thread-msgs');
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--text2);font-size:12px;padding:24px 0">Sin mensajes. Envía el primero.</div>`;
  } else {
    let lastDate = '';
    el.innerHTML = msgs.map(m => {
      const d = m.date ? new Date(m.date) : null;
      const dateStr = d ? d.toLocaleDateString('es-US',{weekday:'short',month:'short',day:'numeric'}) : '';
      const timeStr = d ? d.toLocaleTimeString('es-US',{hour:'2-digit',minute:'2-digit'}) : '';
      const isOut = m.direction !== 'inbound';
      const chBadge = m.channel === 'whatsapp'
        ? `<svg title="WhatsApp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style="flex-shrink:0"><title>WhatsApp</title><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`
        : `<svg title="Mensaje SMS" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style="flex-shrink:0"><title>Mensaje SMS</title><path fill="#0073ea" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
      let dateSep = '';
      if (dateStr !== lastDate) { dateSep = `<div style="text-align:center;margin:8px 0"><span style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:3px 12px;font-size:10px;color:var(--text2)">${dateStr}</span></div>`; lastDate = dateStr; }
      return `${dateSep}<div style="display:flex;flex-direction:column;${isOut?'align-items:flex-end':'align-items:flex-start'}">
        <div class="${isOut?'conv-msg-out':'conv-msg-in'}">${esc(m.body||'')}</div>
        <div class="conv-msg-time" style="display:flex;align-items:center;gap:4px;${isOut?'flex-direction:row-reverse':''}">${chBadge}<span>${timeStr}${isOut?' · '+esc(m.author||''):''}${m.error?` <span style="color:#e2445c">⚠️</span>`:` <span style="color:#00c875">✓</span>`}</span></div>
      </div>`;
    }).join('');
  }
  el.scrollTop = el.scrollHeight;
}

function renderConvDetail() {
  if (!_convLeadId) return;
  const lead = loadLeads(_convBoardId).find(l => l.id === _convLeadId);
  if (!lead) return;

  const initials = getInitials(lead.nombre);
  const bg = strToTableColor(lead.nombre) || '#0073ea';
  const board = BOARDS.find(b => b.id === _convBoardId);

  const av = document.getElementById('conv-detail-avatar');
  av.textContent = initials;
  av.style.cssText = `width:44px;height:44px;border-radius:50%;background:${bg}25;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${bg};flex-shrink:0`;

  document.getElementById('conv-detail-name').textContent = lead.nombre || '—';
  document.getElementById('conv-detail-sub').textContent = lead.telefono || '';

  const rows = [
    { label: 'Teléfono',    value: lead.telefono },
    { label: 'Email',       value: lead.email },
    { label: 'Tipo lead',   value: lead.lead },
    { label: 'Asignado',    value: lead.asignado },
    { label: 'Board',       value: board ? `${board.icon} ${board.name}` : '' },
    { label: 'Resultado',   value: lead.resultado },
    { label: 'Ubicación',   value: lead.ubicacion },
    { label: 'Dirección',   value: lead.direccion },
    { label: 'Hijos',       value: lead.hijos },
    { label: 'Registro',    value: lead.creacion ? formatDate(lead.creacion) : '' },
  ].filter(r => r.value);

  document.getElementById('conv-detail-fields').innerHTML = rows.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
      <span style="font-size:11px;color:var(--text2);flex-shrink:0;padding-top:1px">${r.label}</span>
      <span style="font-size:12px;color:var(--text);font-weight:500;text-align:right;word-break:break-word">${esc(r.value)}</span>
    </div>`).join('');

  const notes = parseNotes(lead._notes).slice(-3).reverse();
  document.getElementById('conv-detail-notes').innerHTML = notes.length
    ? notes.map(n => `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:9px 11px">
        <div style="font-size:10px;color:var(--text2);margin-bottom:4px">${esc(n.author||'')} · ${n.date ? formatNoteDate(n.date) : ''}</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${esc((n.text||'').slice(0,100))}${(n.text||'').length>100?'…':''}</div>
      </div>`).join('')
    : `<div style="font-size:12px;color:var(--text2)">Sin notas.</div>`;
}

function setConvTab(tab, btn) {
  _convTab = tab;
  document.querySelectorAll('.conv-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderConvList();
}

function filterConversations(q) {
  _convSearch = q;
  renderConvList();
}

function setConvChannel(ch) {
  _convChannel = ch;
  document.getElementById('conv-ch-sms').classList.toggle('active', ch === 'sms');
  document.getElementById('conv-ch-whatsapp').classList.toggle('active', ch === 'whatsapp');
}

async function sendConvMessage() {
  if (!_convLeadId || !_convBoardId) return;
  const input = document.getElementById('conv-msg-input');
  const body = input.value.trim();
  const statusEl = document.getElementById('conv-send-status');
  if (!body) return;

  const leads = loadLeads(_convBoardId);
  const lead = leads.find(l => l.id === _convLeadId);
  if (!lead?.telefono) { statusEl.textContent = '⚠️ El lead no tiene número de teléfono.'; return; }

  statusEl.textContent = 'Enviando…';
  input.disabled = true;

  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ to: lead.telefono, body, channel: _convChannel, boardId: _convBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const session = getSession();
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to: lead.telefono, body, channel: _convChannel, date: new Date().toISOString(), author: session?.name || '?', sid: data.sid || '', error: '', direction: 'outbound' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_convBoardId, leads);

    input.value = '';
    statusEl.textContent = '✓ Enviado';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
    renderConvThread();
    renderConvList();
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
    statusEl.style.color = '#e2445c';
  }
  input.disabled = false;
  input.focus();
}

function toggleConvVideoPanel() {
  const p = document.getElementById('conv-video-panel');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function sendConvVideo() {
  if (!_convLeadId || !_convBoardId) return;
  const videoUrl = document.getElementById('conv-video-url').value.trim();
  const caption  = document.getElementById('conv-video-caption').value.trim();
  const status   = document.getElementById('conv-video-status');
  const btn      = document.getElementById('conv-video-btn');
  if (!videoUrl) { status.textContent = 'Ingresa la URL del video.'; status.style.color = '#e2445c'; return; }

  const leads = loadLeads(_convBoardId);
  const lead  = leads.find(l => l.id === _convLeadId);
  if (!lead?.telefono) { status.textContent = '⚠️ El lead no tiene teléfono.'; status.style.color = '#e2445c'; return; }

  btn.disabled = true;
  status.textContent = 'Enviando…';
  status.style.color = 'var(--text2)';

  try {
    const res = await fetch('https://elite-reclutamiento-production.up.railway.app/meta/wa-send-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: lead.telefono, videoUrl, caption: caption || undefined, leadId: _convLeadId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    const session = getSession();
    const msgs = JSON.parse(lead._messages || '[]');
    msgs.push({ to: lead.telefono, body: `[VIDEO] ${caption || videoUrl}`, channel: 'whatsapp', date: new Date().toISOString(), author: session?.name || '?', sid: data.messageId || '', direction: 'outbound' });
    lead._messages = JSON.stringify(msgs);
    saveLeads(_convBoardId, leads);
    renderConvThread();

    status.textContent = '✓ Video enviado';
    status.style.color = '#25d366';
  } catch(e) {
    status.textContent = '⚠️ ' + e.message;
    status.style.color = '#e2445c';
  }
  btn.disabled = false;
}

// ════════════════════════════════════════════
