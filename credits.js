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
