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

// ════════════════════════════════════════════
//  CREDITS PAGE  (admin + master)
// ════════════════════════════════════════════
function showCreditsPage() {
  const session = getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'master')) return;
  showBoardView();
  document.getElementById('assign-strip').classList.add('hidden');
  document.getElementById('table-wrap').style.display   = 'none';
  document.getElementById('toolbar').style.display      = 'none';
  document.getElementById('bulk-bar').classList.remove('visible');
  document.getElementById('btn-new-lead').style.display = 'none';
  document.getElementById('btn-export').style.display   = 'none';
  document.getElementById('credits-page').style.display = 'flex';
  document.getElementById('board-title').textContent    = 'Facturación';
  document.querySelectorAll('.board-item, .sidebar-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-credits');
  if (navEl) navEl.classList.add('active');
  currentBoardId = null;
  loadCreditsPage();
}

function switchBillingTab(tab, el) {
  ['wallet','usage','history'].forEach(t => {
    const p = document.getElementById(`billing-pane-${t}`);
    if (p) p.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.billing-tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}
function switchBillingSubtab(tab, el) {
  const s = document.getElementById('cp-wallet-summary');
  const d = document.getElementById('cp-wallet-detailed');
  if (s) s.style.display = tab === 'summary' ? 'block' : 'none';
  if (d) d.style.display = tab === 'detailed' ? 'block' : 'none';
  document.querySelectorAll('.billing-subtab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

async function loadCreditsPage() {
  loadAutoRechargeSettings().catch(() => {});
  const agentsEl = document.getElementById('cp-agents');
  const boardsEl = document.getElementById('cp-boards');
  const txEl     = document.getElementById('cp-transactions');
  const rechargeEl = document.getElementById('cp-recharge-history');
  const dollarEl = document.getElementById('cp-dollar-balance');
  const creditsEl = document.getElementById('cp-credits-detail');
  const walletStatsEl = document.getElementById('cp-wallet-stats');
  if (!txEl) return;
  const session = getSession();
  const isMaster = session && session.role === 'master';
  const loading = '<div style="color:var(--text2);font-size:12px;padding:8px 0">Cargando…</div>';
  if (agentsEl) agentsEl.innerHTML = loading;
  if (boardsEl) boardsEl.innerHTML = loading;
  if (txEl) txEl.innerHTML = loading;
  if (rechargeEl) rechargeEl.innerHTML = loading;

  const desde = document.getElementById('cp-desde')?.value || '';
  const hasta  = document.getElementById('cp-hasta')?.value  || '';

  // Global credits balance
  const { data: credRow } = await supa.from('kv_store').select('value').eq('key', 'gew_credits_global').maybeSingle();
  const totalCredits = parseInt(credRow?.value || '0');
  await loadMsgPrices();
  const avgPrice = _avgMsgPrice();
  if (dollarEl) dollarEl.textContent = '$' + (totalCredits * avgPrice).toFixed(2);
  if (creditsEl) creditsEl.textContent = totalCredits.toLocaleString() + ' créditos';

  // Transactions
  const { data: txRows } = await supa.from('kv_store').select('key,value').like('key', 'gew_msg_tx_%').order('key', { ascending: false });

  // Per-agent and per-board usage from leads (filtered by date)
  const agentMap = {};
  const boardSentMap = {};
  let totalSent = 0, totalSMS = 0, totalWA = 0;
  BOARDS.forEach(b => {
    let bsms = 0, bwa = 0;
    loadLeads(b.id).forEach(l => {
      JSON.parse(l._messages || '[]').forEach(m => {
        if (m.error || m.direction === 'inbound') return;
        const mDate = m.date ? m.date.slice(0, 10) : '';
        if (desde && mDate < desde) return;
        if (hasta  && mDate > hasta)  return;
        const author = m.author || 'Desconocido';
        if (!agentMap[author]) agentMap[author] = { sms: 0, wa: 0 };
        if (m.channel === 'whatsapp') { agentMap[author].wa++; bwa++; totalWA++; }
        else                          { agentMap[author].sms++; bsms++; totalSMS++; }
        totalSent++;
      });
    });
    boardSentMap[b.id] = { name: b.name, icon: b.icon, sms: bsms, wa: bwa };
  });

  // Wallet stats mini row
  const revenue = totalSMS * _msgPriceSMS + totalWA * _msgPriceWA;
  const myCost  = totalSMS * _msgCostSMS  + totalWA * _msgCostWA;
  const profit  = revenue - myCost;
  const baseStats = [
    { label: 'Mensajes enviados', val: totalSent, color: 'var(--text)', icon: '📤' },
    { label: 'SMS',               val: totalSMS,  color: '#fbbf24',     icon: '📱' },
    { label: 'WhatsApp',          val: totalWA,   color: '#25d366',     icon: '💬' },
  ];
  const masterStats = [
    { label: 'Ingresos',          val: '$'+revenue.toFixed(2), color: 'var(--accent)', icon: '💰' },
    { label: 'Mi costo (Twilio)', val: '$'+myCost.toFixed(2),  color: '#e2445c',       icon: '💸' },
    { label: 'Ganancia neta',     val: '$'+profit.toFixed(2),  color: profit>=0 ? '#00c875' : '#e2445c', icon: '📈' },
  ];
  const statsToShow = isMaster ? [...baseStats, ...masterStats] : baseStats;
  const masterSeparator = isMaster
    ? `<div style="width:1px;background:var(--border);margin:0 4px;align-self:stretch"></div><div style="display:flex;flex-direction:column;justify-content:center"><span class="emblem-dev" style="margin-left:0">🙈 Solo yo</span></div>`
    : '';
  if (walletStatsEl) walletStatsEl.innerHTML = baseStats.map(c => `<div style="display:flex;flex-direction:column;gap:2px">
    <span style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${c.icon} ${c.label}</span>
    <span style="font-size:18px;font-weight:700;color:${c.color}">${c.val}</span>
  </div>`).join('') + (isMaster ? masterSeparator + masterStats.map(c => `<div style="display:flex;flex-direction:column;gap:2px">
    <span style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${c.icon} ${c.label}</span>
    <span style="font-size:18px;font-weight:700;color:${c.color}">${c.val}</span>
  </div>`).join('') : '');

  // Top consumers
  const agentList = Object.entries(agentMap).sort((a, b) => (b[1].sms + b[1].wa) - (a[1].sms + a[1].wa));
  if (agentList.length) {
    const maxTotal = agentList[0][1].sms + agentList[0][1].wa;
    agentsEl.innerHTML = agentList.map(([name, d]) => {
      const total = d.sms + d.wa;
      const pct = maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0;
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:rgba(0,115,234,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0">${(name[0]||'?').toUpperCase()}</div>
          <span style="font-size:13px;color:var(--text);font-weight:600;flex:1">${esc(name)}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text)">${total}</span>
          <span style="font-size:11px;color:var(--text2)">msgs</span>
          <span style="font-size:11px;color:var(--text2)">📱 ${d.sms}</span>
          <span style="font-size:11px;color:#25d366">💬 ${d.wa}</span>
        </div>
        <div style="background:var(--card2);border-radius:4px;height:5px;overflow:hidden">
          <div style="background:var(--accent);width:${pct}%;height:100%;border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');
  } else {
    agentsEl.innerHTML = `<div style="color:var(--text2);font-size:12px;padding:8px 0">${desde||hasta ? 'Sin mensajes en el período seleccionado.' : 'Sin mensajes enviados aún.'}</div>`;
  }

  // Usage per board (no per-board credits, just sent counts)
  boardsEl.innerHTML = BOARDS.map(b => {
    const sent = boardSentMap[b.id] || { sms: 0, wa: 0 };
    const total = sent.sms + sent.wa;
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:16px">${b.icon}</span>
      <span style="font-size:13px;color:var(--text);font-weight:600;flex:1;min-width:100px">${esc(b.name)}</span>
      <span style="font-size:11px;color:var(--text2)">📱 <strong style="color:var(--text)">${sent.sms}</strong> SMS</span>
      <span style="font-size:11px;color:var(--text2)">💬 <strong style="color:#25d366">${sent.wa}</strong> WA</span>
      <span style="font-size:13px;font-weight:700;color:var(--text)">${total}</span>
      <span style="font-size:11px;color:var(--text2)">enviados</span>
    </div>`;
  }).join('') || `<div style="color:var(--text2);font-size:12px">Sin boards.</div>`;

  // Transaction history with date filter
  const filteredTx = (txRows || []).filter(r => {
    try {
      const tx = JSON.parse(r.value);
      const d = tx.date ? tx.date.slice(0, 10) : '';
      if (desde && d < desde) return false;
      if (hasta  && d > hasta)  return false;
      return true;
    } catch { return false; }
  });
  const renderTxRow = (r) => {
    try {
      const tx = JSON.parse(r.value);
      const isManual = tx.manual;
      const dateStr = tx.date ? new Date(tx.date).toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const usd = isManual ? '—' : '$' + (tx.amount/100).toFixed(2);
      const tag = isManual
        ? `<span style="background:rgba(251,191,36,.12);color:#d97706;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:700;flex-shrink:0">Manual</span>`
        : `<span style="background:rgba(0,115,234,.1);color:#0073ea;border-radius:6px;padding:2px 9px;font-size:10px;font-weight:700;flex-shrink:0">Stripe</span>`;
      return `<div class="billing-tx-row">
        ${tag}
        <span style="color:var(--text2);flex:1;font-size:12px">${dateStr}</span>
        <span style="color:var(--text);font-weight:600;font-size:13px">+${tx.credits.toLocaleString()} créditos</span>
        <span style="color:var(--text2);font-size:12px;min-width:60px;text-align:right">${usd}</span>
      </div>`;
    } catch { return ''; }
  };
  const noTx = `<div style="color:var(--text2);font-size:12px;padding:16px 0;text-align:center">Sin recargas ${desde||hasta ? 'en el período seleccionado' : 'registradas'}.</div>`;
  txEl.innerHTML = filteredTx.length ? filteredTx.map(renderTxRow).join('') : noTx;
  if (rechargeEl) rechargeEl.innerHTML = filteredTx.length ? filteredTx.map(renderTxRow).join('') : noTx;
}

// ── Messaging prices (developer-configurable) ──
const _PKG_CREDITS = [100, 500, 1000, 5000];
let _buyPkgSelected = null;
let _msgPriceSMS = 0.016;   // sell price per SMS
let _msgPriceWA  = 0.016;   // sell price per WhatsApp
let _msgCostSMS  = 0.0075;  // Twilio cost per SMS
let _msgCostWA   = 0.005;   // Twilio cost per WhatsApp

async function loadMsgPrices() {
  const { data: rows } = await supa.from('kv_store').select('key,value')
    .in('key', ['gew_price_sms','gew_price_wa','gew_cost_sms','gew_cost_wa']);
  (rows || []).forEach(r => {
    const v = parseFloat(r.value);
    if (!isNaN(v) && v > 0) {
      if (r.key === 'gew_price_sms') _msgPriceSMS = v;
      if (r.key === 'gew_price_wa')  _msgPriceWA  = v;
      if (r.key === 'gew_cost_sms')  _msgCostSMS  = v;
      if (r.key === 'gew_cost_wa')   _msgCostWA   = v;
    }
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('msg-price-sms', _msgPriceSMS);
  set('msg-price-wa',  _msgPriceWA);
  set('msg-cost-sms',  _msgCostSMS);
  set('msg-cost-wa',   _msgCostWA);
  const cur = document.getElementById('msg-price-current');
  if (cur) cur.textContent = `Venta SMS $${_msgPriceSMS} · WA $${_msgPriceWA} | Costo SMS $${_msgCostSMS} · WA $${_msgCostWA}`;
}

async function saveMsgPrices() {
  const vals = {
    'gew_price_sms': parseFloat(document.getElementById('msg-price-sms')?.value),
    'gew_price_wa':  parseFloat(document.getElementById('msg-price-wa')?.value),
    'gew_cost_sms':  parseFloat(document.getElementById('msg-cost-sms')?.value),
    'gew_cost_wa':   parseFloat(document.getElementById('msg-cost-wa')?.value),
  };
  if (Object.values(vals).some(v => isNaN(v) || v <= 0)) { showToast('Valores inválidos', 'error'); return; }
  for (const [key, value] of Object.entries(vals)) {
    await supa.from('kv_store').upsert({ key, value: String(value) });
  }
  _msgPriceSMS = vals['gew_price_sms']; _msgPriceWA = vals['gew_price_wa'];
  _msgCostSMS  = vals['gew_cost_sms'];  _msgCostWA  = vals['gew_cost_wa'];
  const st = document.getElementById('msg-price-status');
  if (st) { st.textContent = '✓ Guardado'; setTimeout(() => { if(st) st.textContent=''; }, 2500); }
  const cur = document.getElementById('msg-price-current');
  if (cur) cur.textContent = `Venta SMS $${_msgPriceSMS} · WA $${_msgPriceWA} | Costo SMS $${_msgCostSMS} · WA $${_msgCostWA}`;
  showToast('Precios actualizados ✓', 'success');
}

// ── Buy credits modal ──
function _avgMsgPrice() { return (_msgPriceSMS + _msgPriceWA) / 2; }

function openBuyCreditsModal() {
  _buyPkgSelected = null;
  const avgPrice = _avgMsgPrice();
  document.getElementById('buy-pkg-grid').innerHTML = _PKG_CREDITS.map(credits => {
    const id    = `pkg_${credits}`;
    const total = (credits * avgPrice).toFixed(2);
    return `<div onclick="selectBuyPkg('${id}',this)" data-pkg="${id}" data-credits="${credits}" data-cents="${Math.round(credits * avgPrice * 100)}"
      style="border:2px solid var(--border);border-radius:10px;padding:14px 10px;cursor:pointer;text-align:center;transition:border-color .12s,background .12s">
      <div style="font-size:18px;font-weight:700;color:var(--accent)">${credits.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--text2);margin:2px 0 6px">mensajes</div>
      <div style="font-size:14px;font-weight:700;color:var(--text)">$${total}</div>
    </div>`;
  }).join('');
  document.getElementById('buy-credits-overlay').classList.add('open');
}
function closeBuyCreditsModal() { document.getElementById('buy-credits-overlay').classList.remove('open'); }
function selectBuyPkg(id, el) {
  _buyPkgSelected = id;
  document.querySelectorAll('#buy-pkg-grid > div').forEach(c => {
    const sel = c.dataset.pkg === id;
    c.style.borderColor = sel ? 'var(--accent)' : 'var(--border)';
    c.style.background  = sel ? 'rgba(0,115,234,.08)' : '';
  });
}
async function confirmBuyCredits() {
  if (!_buyPkgSelected) { showToast('Selecciona un paquete', 'error'); return; }
  const pkgEl = document.querySelector(`#buy-pkg-grid [data-pkg="${_buyPkgSelected}"]`);
  const unitPriceCents = pkgEl ? parseInt(pkgEl.dataset.cents) : 0;
  const btn = document.getElementById('buy-confirm-btn');
  btn.textContent = 'Procesando…'; btn.disabled = true;
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ packageId: _buyPkgSelected, boardId: 'global', boardName: 'Equipo',
        unitPriceCents,
        successUrl: window.location.origin + window.location.pathname + '?payment=success',
        cancelUrl:  window.location.origin + window.location.pathname + '?payment=cancel' }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.location.href = data.url;
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    btn.textContent = 'Ir a pagar →'; btn.disabled = false;
  }
}

// ── Auto-recharge ──
let _autochargeEnabled = true;  // always on
let _autochargeThreshold = 50;
let _autochargePackage = 'pkg_500';

async function loadAutoRechargeSettings() {
  const { data: rows } = await supa.from('kv_store').select('key,value')
    .in('key', ['gew_autocharge_threshold','gew_autocharge_package',
                'gew_stripe_customer_id','gew_stripe_payment_method',
                'gew_stripe_card_last4','gew_stripe_card_brand']);
  const get = k => rows?.find(r => r.key === k)?.value;

  _autochargeThreshold = parseInt(get('gew_autocharge_threshold') || '50');
  _autochargePackage   = get('gew_autocharge_package') || 'pkg_500';

  const thr = document.getElementById('ar-threshold');
  const pkg = document.getElementById('ar-package');
  if (thr) thr.value = _autochargeThreshold;
  if (pkg) pkg.value = _autochargePackage;

  const cardEl = document.getElementById('ar-card-info');
  if (cardEl) {
    const last4 = get('gew_stripe_card_last4');
    const brand = get('gew_stripe_card_brand');
    const pmId  = get('gew_stripe_payment_method');
    if (pmId && last4) {
      const brandLabel = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Tarjeta';
      cardEl.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px 16px">
          <span style="font-size:22px">💳</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${brandLabel} •••• ${last4}</div>
            <div style="font-size:11px;color:#00c875;margin-top:2px">✓ Tarjeta guardada</div>
          </div>
        </div>`;
    } else {
      cardEl.innerHTML = `<div style="font-size:12px;color:var(--text2);padding:10px 0">⚠️ No hay tarjeta guardada. Agrega una para habilitar la auto-recarga.</div>`;
    }
  }
}

async function saveAutoRechargeSettings() {
  const thr = document.getElementById('ar-threshold');
  const pkg = document.getElementById('ar-package');
  const st  = document.getElementById('ar-save-status');
  _autochargeThreshold = parseInt(thr?.value || '50');
  _autochargePackage   = pkg?.value || 'pkg_500';
  try {
    await Promise.all([
      supa.from('kv_store').upsert({ key: 'gew_autocharge_threshold', value: String(_autochargeThreshold) }),
      supa.from('kv_store').upsert({ key: 'gew_autocharge_package',   value: _autochargePackage }),
    ]);
    if (st) { st.textContent = '✓ Guardado'; setTimeout(() => { if(st) st.textContent = ''; }, 2500); }
  } catch(e) {
    if (st) st.textContent = 'Error al guardar';
  }
}

async function setupPaymentMethod() {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-setup-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        successUrl: window.location.origin + window.location.pathname + '?setup=success',
        cancelUrl:  window.location.origin + window.location.pathname + '?setup=cancel',
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.location.href = data.url;
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function triggerAutoRecharge() {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/auto-recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`⚡ Auto-recarga: +${data.creditsAdded} créditos agregados`, 'success');
      const cv = document.getElementById('msg-credits-val');
      if (cv) { cv.textContent = data.newBalance; cv.style.color = 'var(--accent)'; }
    }
  } catch(_) { /* silent – don't interrupt user flow */ }
}

async function loadMessagingDashboard() {
  const summaryEl = document.getElementById('msg-dash-summary');
  const creditsEl = document.getElementById('msg-dash-credits');
  const txEl      = document.getElementById('msg-dash-transactions');
  const sentEl    = document.getElementById('msg-dash-sent');
  if (!summaryEl) return;

  summaryEl.innerHTML = creditsEl.innerHTML = txEl.innerHTML = sentEl.innerHTML =
    '<div style="color:var(--text2);font-size:12px">Cargando…</div>';

  // Load global credits from Supabase
  const { data: globalCredRow } = await supa.from('kv_store').select('value').eq('key', 'gew_credits_global').maybeSingle();
  const totalGlobalCredits = parseInt(globalCredRow?.value || '0');
  const credMap = { global: totalGlobalCredits };

  // Load transactions
  const { data: txRows } = await supa.from('kv_store').select('key,value').like('key', 'gew_msg_tx_%').order('key', { ascending: false });

  // Count messages sent per board from leads
  const sentMap = {};
  let totalSent = 0, totalSMS = 0, totalWA = 0;
  BOARDS.forEach(b => {
    const leads = loadLeads(b.id);
    let sms = 0, wa = 0;
    leads.forEach(l => {
      const msgs = JSON.parse(l._messages || '[]');
      msgs.forEach(m => { if (!m.error) { m.channel === 'whatsapp' ? wa++ : sms++; } });
    });
    sentMap[b.id] = { sms, wa, name: b.name, icon: b.icon };
    totalSent += sms + wa; totalSMS += sms; totalWA += wa;
  });

  const totalCredits = totalGlobalCredits;

  // Summary cards
  summaryEl.innerHTML = [
    { label: 'Créditos globales', val: totalCredits, color: 'var(--accent)', icon: '💳' },
    { label: 'Mensajes enviados', val: totalSent, color: '#00c875', icon: '📤' },
    { label: 'SMS', val: totalSMS, color: '#fbbf24', icon: '📱' },
    { label: 'WhatsApp', val: totalWA, color: '#25d366', icon: '💬' },
    { label: 'Recargas', val: (txRows || []).length, color: '#a78bfa', icon: '🧾' },
  ].map(c => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px">
      <div style="font-size:20px;margin-bottom:6px">${c.icon}</div>
      <div style="font-size:24px;font-weight:700;color:${c.color}">${c.val}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:3px;text-transform:uppercase;letter-spacing:.4px">${c.label}</div>
    </div>`).join('');

  // Global credits card
  const gColor = totalCredits === 0 ? '#e2445c' : totalCredits < 20 ? '#fbbf24' : '#00c875';
  creditsEl.innerHTML = `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--card);border:1px solid var(--border);border-radius:10px">
    <span style="font-size:20px">🌐</span>
    <span style="font-size:14px;color:var(--text);font-weight:600;flex:1">Saldo global del equipo</span>
    <span style="font-size:20px;font-weight:700;color:${gColor}">${totalCredits}</span>
    <span style="font-size:12px;color:var(--text2)">créditos</span>
    <button onclick="openAddCreditsModal()" style="padding:5px 14px;border-radius:7px;border:1px solid rgba(0,115,234,.4);background:rgba(0,115,234,.1);color:var(--accent);font-family:var(--font);font-size:11px;font-weight:600;cursor:pointer">+ Agregar</button>
  </div>`;

  // Transactions
  txEl.innerHTML = (txRows && txRows.length) ? txRows.map(r => {
    try {
      const tx = JSON.parse(r.value);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;font-size:12px">
        <span style="color:#a78bfa;font-weight:700">+${tx.credits}</span>
        <span style="color:var(--text2)">créditos</span>
        <span style="color:var(--text);flex:1">${esc(tx.boardName || tx.boardId)}</span>
        <span style="color:#00c875;font-weight:600">$${(tx.amount/100).toFixed(2)}</span>
        <span style="color:var(--text2)">${tx.date ? new Date(tx.date).toLocaleDateString('es-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</span>
      </div>`;
    } catch { return ''; }
  }).join('') : '<div style="color:var(--text2);font-size:12px;padding:8px 0">Sin recargas registradas aún.</div>';

  // Messages sent per board
  sentEl.innerHTML = Object.values(sentMap).filter(b => b.sms + b.wa > 0).sort((a,b) => (b.sms+b.wa)-(a.sms+a.wa)).map(b => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px">
      <span style="font-size:15px">${b.icon}</span>
      <span style="font-size:13px;color:var(--text);flex:1">${esc(b.name)}</span>
      <span style="font-size:11px;color:var(--text2)">📱 SMS: <strong style="color:var(--text)">${b.sms}</strong></span>
      <span style="font-size:11px;color:var(--text2)">💬 WA: <strong style="color:#25d366">${b.wa}</strong></span>
    </div>`).join('') || '<div style="color:var(--text2);font-size:12px;padding:8px 0">Sin mensajes enviados aún.</div>';
}

function openAddCreditsModal() {
  const n = prompt('¿Cuántos créditos agregar al saldo global del equipo?');
  if (!n || isNaN(parseInt(n)) || parseInt(n) <= 0) return;
  addCreditsGlobal(parseInt(n));
}

async function addCreditsGlobal(amount) {
  const credKey = 'gew_credits_global';
  const { data: existing } = await supa.from('kv_store').select('value').eq('key', credKey).maybeSingle();
  const current = parseInt(existing?.value || '0');
  const updated = current + amount;
  await supa.from('kv_store').upsert({ key: credKey, value: String(updated) });

  // Log transaction
  const txKey = `gew_msg_tx_${Date.now()}`;
  await supa.from('kv_store').upsert({ key: txKey, value: JSON.stringify({ boardId: 'global', boardName: 'Equipo', credits: amount, amount: 0, date: new Date().toISOString(), manual: true }) });

  loadMessagingDashboard();
}

async function loadMsgCredits(boardId) {
  const cv = document.getElementById('msg-credits-val');
  if (!cv) return;
  try {
    const { data } = await supa.from('kv_store').select('value').eq('key', `gew_credits_${boardId}`).maybeSingle();
    const n = parseInt(data?.value || '0');
    cv.textContent = n;
    cv.style.color = n < 10 ? '#e2445c' : 'var(--accent)';
  } catch { cv.textContent = '0'; }
}

function openRechargeModal() {
  document.getElementById('recharge-status').textContent = '';
  document.getElementById('recharge-modal-overlay').classList.add('open');
}
function closeRechargeModal() {
  document.getElementById('recharge-modal-overlay').classList.remove('open');
}

async function startCheckout(packageId) {
  const statusEl = document.getElementById('recharge-status');
  statusEl.textContent = 'Redirigiendo a Stripe…';
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ packageId, boardId: _notesBoardId, boardName: (BOARDS.find(b=>b.id===_notesBoardId)||{}).name || _notesBoardId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    window.open(data.url, '_blank');
    closeRechargeModal();
  } catch(e) {
    statusEl.textContent = '⚠️ ' + e.message;
    statusEl.style.color = '#e2445c';
  }
}

let _msgPollInterval = null;

function _startMsgPolling() {
  _stopMsgPolling();
  _msgPollInterval = setInterval(async () => {
    if (!_notesLeadId || !_notesBoardId) return;
    try {
      await loadFromSupabase();
      const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
      if (lead) _renderMsgJournal(lead);
    } catch(_) {}
  }, 6000); // every 6 seconds
}

function _stopMsgPolling() {
  if (_msgPollInterval) { clearInterval(_msgPollInterval); _msgPollInterval = null; }
}

function closeNotesPanel() {
  document.getElementById('notes-panel-overlay').classList.remove('open');
  _notesBoardId = null;
  _notesLeadId  = null;
  _notesNavList = [];
  _stopMsgPolling();
}

function npDeleteLead() {
  if (!_notesLeadId || !_notesBoardId) return;
  const lead = loadLeads(_notesBoardId).find(l => l.id === _notesLeadId);
  if (!lead) return;
  if (lead.asignado && lead.asignado !== 'Sin asignar') {
    if (!confirm(`⚠️ Este lead está asignado a ${lead.asignado}.\n¿Seguro que quieres eliminarlo? El agente perderá acceso.`)) return;
  } else {
    if (!confirm(`¿Eliminar a ${lead.nombre || 'este lead'}?`)) return;
  }
  closeNotesPanel();
  softDeleteLead(_notesLeadId, _notesBoardId);
  renderTable();
  showToast('Lead movido a Eliminados', 'error');
}

async function submitNote() {
  const text    = document.getElementById('notes-new-input').value.trim();
  const newRes  = document.getElementById('notes-resultado-sel').value;
  if (!_notesBoardId || !_notesLeadId) return;

  const leads = loadLeads(_notesBoardId);
  const lead  = leads.find(l => l.id === _notesLeadId);
  if (!lead) return;

  // newRes === '' means user didn't touch the dropdown — don't change resultado
  const resSelected = newRes !== '';
  if (!text && !resSelected) { showToast('Escribe una nota o selecciona un resultado', 'error'); return; }

  const session = getSession();
  const notes   = parseNotes(lead._notes);
  const now     = new Date().toISOString();
  const author  = session ? session.name : 'Usuario';

  if (resSelected) {
    lead.resultado = newRes;
    notes.push({
      text:   `Resultado: ${newRes}`,
      author, date: now, system: true
    });
  }
  if (text) {
    notes.push({ text, author, date: now });
  }

  lead._notes = JSON.stringify(notes);
  await saveLeads(_notesBoardId, leads, { isNote: true });
  document.getElementById('notes-new-input').value = '';
  _renderNotesJournal(lead);
  if (resSelected) {
    // refresh info grid and tags after resultado change
    document.getElementById('np-info-grid').querySelectorAll('div').forEach((el,i) => {
      if (i === 3) { const s = el.querySelector('span:last-child'); if(s) s.textContent = lead.resultado||'—'; }
    });
    const npChips2 = [
      lead.telefono  && { label:`📞 ${lead.telefono}`,  c:'#a78bfa', bg:'rgba(167,139,250,0.1)', b:'rgba(167,139,250,0.3)' },
      lead.ubicacion && { label:`📍 ${lead.ubicacion}`, c:'#60a5fa', bg:'rgba(59,130,246,0.1)',  b:'rgba(59,130,246,0.3)'  },
      lead.asignado  && { label:`👤 ${lead.asignado}`,  c:'#34d399', bg:'rgba(16,185,129,0.1)',  b:'rgba(16,185,129,0.3)'  },
    ].filter(Boolean);
    document.getElementById('notes-lead-summary').innerHTML = npChips2.map(ch =>
      `<span style="background:${ch.bg};border:1px solid ${ch.b};border-radius:20px;padding:4px 12px;font-size:11px;color:${ch.c};font-weight:500">${esc(ch.label)}</span>`
    ).join('');
    renderTableKeepSelection();
  }
  showToast('Guardado ✓', 'success');
}

// ════════════════════════════════════════════
//  FORCE CHANGE PASSWORD
// ════════════════════════════════════════════
async function submitForceChangePass() {
  const p1  = document.getElementById('fcp-pass1').value;
  const p2  = document.getElementById('fcp-pass2').value;
  const err = document.getElementById('fcp-error');
  if (p1.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  if (p1 !== p2)     { err.textContent = 'Las contraseñas no coinciden.'; return; }
  err.textContent = '';

  const session = getSession();
  if (!session) return;
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === session.id);
  if (idx !== -1) {
    users[idx].password          = p1;
    users[idx].mustChangePassword = false;
    await saveUsers(users);
    setSession({ ...session, mustChangePassword: false });
  }
  document.getElementById('force-pass-overlay').style.display = 'none';
  document.getElementById('fcp-pass1').value = '';
  document.getElementById('fcp-pass2').value = '';
  showToast('✅ Contraseña actualizada', 'success');
  try { initApp(session); updatePendingBadge(); updateTrashBadge(); } catch(e) { console.error(e); }
}

// ════════════════════════════════════════════
//  GOOGLE DRIVE BACKUP
// ════════════════════════════════════════════
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let _driveTokenClient = null;
let _driveAccessToken = null;

function _initDriveClient(callback) {
  if (!window.google || !google.accounts) {
    showToast('Google API no cargada aún, intenta de nuevo', 'error'); return;
  }
  if (_driveTokenClient) { _driveTokenClient._cb = callback; _driveTokenClient.requestAccessToken(); return; }
  _driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) { showToast('Error al conectar con Google Drive', 'error'); return; }
      _driveAccessToken = resp.access_token;
      if (_driveTokenClient._cb) _driveTokenClient._cb();
    }
  });
  _driveTokenClient._cb = callback;
  _driveTokenClient.requestAccessToken();
}

async function exportBackupToDrive() {
  const btn = document.getElementById('btn-drive-backup');
  if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }
  _initDriveClient(async () => {
    try {
      const backup = { version: 1, exportedAt: new Date().toISOString(), data: {} };
      Object.keys(localStorage).forEach(k => { backup.data[k] = localStorage.getItem(k); });
      const json = JSON.stringify(backup, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const fileName = `GrupoElite_CRM_Respaldo_${date}.json`;

      // Check if file already exists (same name) to update instead of duplicate
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'&spaces=drive&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${_driveAccessToken}` } }
      );
      const searchData = await searchRes.json();
      const existing = searchData.files && searchData.files[0];

      const metadata = { name: fileName, mimeType: 'application/json' };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([json], { type: 'application/json' }));

      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const method = existing ? 'PATCH' : 'POST';

      const uploadRes = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${_driveAccessToken}` },
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Error al subir a Drive');

      const info = document.getElementById('backup-export-info');
      const keys = Object.keys(backup.data).length;
      if (info) info.innerHTML = `✅ Guardado en Google Drive: <strong>${fileName}</strong> — ${keys} registros`;
      logActivity('backup_drive', 'Respaldo subido a Google Drive', fileName);
      showToast('✅ Respaldo guardado en Google Drive', 'success');
    } catch(e) {
      showToast('Error: ' + e.message, 'error');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<img src="https://www.google.com/images/icons/product/drive-32.png" style="width:16px;height:16px" /> Guardar en Google Drive'; }
  });
}

// ════════════════════════════════════════════
//  BACKUP & RESTORE
// ════════════════════════════════════════════
const BACKUP_KEYS = [
  'gew_users', 'gew_virtual_users', 'gew_session',
  'gew_activity_log', 'gew_calendar', 'gew_terms',
  'gew_appname', 'gew_lead_types', 'gew_columns',
  'gew_ubicaciones_boards'
];

function exportBackup() {
  const backup = { version: 1, exportedAt: new Date().toISOString(), data: {} };

  // Collect all localStorage keys (static + dynamic board keys)
  Object.keys(localStorage).forEach(k => {
    backup.data[k] = localStorage.getItem(k);
  });

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `GrupoElite_CRM_Respaldo_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const info = document.getElementById('backup-export-info');
  const keys = Object.keys(backup.data).length;
  if (info) info.textContent = `✓ Respaldo exportado — ${keys} registros — ${date}`;
  logActivity('backup_export', 'Respaldo exportado', `${keys} claves`);
}

let _restoreData = null;
function previewRestore(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('backup-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.data) throw new Error('Archivo inválido');
      _restoreData = backup;
      const keys = Object.keys(backup.data).length;
      const date = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('es') : 'desconocida';
      const preview = document.getElementById('backup-preview');
      const info    = document.getElementById('backup-preview-info');
      info.innerHTML = `📅 <strong>Fecha del respaldo:</strong> ${esc(date)}<br>📦 <strong>Registros:</strong> ${keys}<br><br>Al restaurar, todos los datos actuales serán reemplazados por los de este archivo.`;
      preview.style.display = 'block';
    } catch(err) {
      showToast('Archivo de respaldo inválido', 'error');
      _restoreData = null;
    }
  };
  reader.readAsText(file);
}

async function confirmBackupRestore() {
  if (!_restoreData) return;
  if (!confirm('¿Estás seguro? Esto reemplazará TODOS los datos actuales con los del respaldo. Esta acción no se puede deshacer.')) return;
  try {
    // Clear and restore localStorage — only trusted gew_ keys
    const validEntries = Object.entries(_restoreData.data).filter(([k]) => k.startsWith('gew_'));
    localStorage.clear();
    validEntries.forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));

    // Sync all keys to Supabase
    for (const [k, v] of validEntries) {
      await supaSync(k, typeof v === 'string' ? v : JSON.stringify(v));
    }

    logActivity('backup_restore', 'Respaldo restaurado', `${Object.keys(_restoreData.data).length} claves`);
    showToast('✅ Respaldo restaurado correctamente. Recargando…', 'success');
    setTimeout(() => location.reload(), 2000);
  } catch(e) {
    showToast('Error al restaurar: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════
