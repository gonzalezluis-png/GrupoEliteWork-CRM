//  CITA AGENDADA MODAL
// ════════════════════════════════════════════
let _citaLeadId = null, _citaBoardId = null;

function openCitaModal(leadId, boardId, leadName) {
  _citaLeadId  = leadId;
  _citaBoardId = boardId;
  const today  = new Date().toISOString().slice(0, 10);
  document.getElementById('cita-fecha').value = today;
  document.getElementById('cita-hora').value  = '';
  document.getElementById('cita-notas').value = '';
  document.getElementById('cita-lead-name-label').textContent = leadName || 'Registra los detalles de la cita';
  const ov = document.getElementById('cita-modal-overlay');
  ov.style.display = 'flex';
}

function closeCitaModal() {
  document.getElementById('cita-modal-overlay').style.display = 'none';
  _citaLeadId = null; _citaBoardId = null;
  showToast('Cita agendada ✓', 'success');
}

async function saveCitaDetails() {
  if (!_citaLeadId || !_citaBoardId) { closeCitaModal(); return; }
  const fecha = document.getElementById('cita-fecha').value;
  const hora  = document.getElementById('cita-hora').value;
  const notas = document.getElementById('cita-notas').value.trim();
  const leads = loadLeads(_citaBoardId);
  const lead  = leads.find(l => l.id === _citaLeadId);
  if (lead) {
    lead.citaFecha = fecha;
    lead.citaHora  = hora;
    if (notas) { const _cn = parseNotes(lead._notes); _cn.push({ text: `📅 Cita ${fecha}${hora?' a las '+hora:''}: ${notas}`, author: 'Sistema', date: new Date().toISOString(), system: true }); lead._notes = JSON.stringify(_cn); }
    saveLeads(_citaBoardId, leads);
    // Auto-create calendar event
    const session = getSession();
    const evts = loadCalEvents();
    evts.push({
      id: 'evt_' + Date.now(), type: 'cita_agendada',
      titulo: `Cita: ${lead.nombre || lead.email || 'Lead'}`,
      fecha, hora, notas,
      userId: session?.id, userName: session?.name,
      leadId: _citaLeadId, createdAt: new Date().toISOString(), createdBy: session?.id
    });
    await saveCalEvents(evts);
  }
  document.getElementById('cita-modal-overlay').style.display = 'none';
  _citaLeadId = null; _citaBoardId = null;
  showCongratsAnimation();
}

function showCongratsAnimation() {
  const el = document.getElementById('cita-congrats');
  el.style.display = 'flex';
  launchConfetti();
  setTimeout(() => {
    const card = document.getElementById('cita-congrats-card');
    if (card) card.style.animation = 'congrats-out .4s ease forwards';
    setTimeout(() => {
      el.style.display = 'none';
      if (card) card.style.animation = 'congrats-pop .45s cubic-bezier(.34,1.56,.64,1) both';
      const canvas = document.getElementById('cita-confetti-canvas');
      if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); }
    }, 420);
  }, 2800);
}

function launchConfetti() {
  const canvas = document.getElementById('cita-confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx     = canvas.getContext('2d');
  const pieces  = Array.from({ length: 90 }, () => ({
    x:     Math.random() * canvas.width,
    y:     -10 - Math.random() * 80,
    r:     Math.random() * 6 + 3,
    d:     Math.random() * 2 + 1,
    color: ['#00c875','#0073ea','#fdab3d','#a78bfa','#00b7c3','#fff'][Math.floor(Math.random()*6)],
    tilt:  Math.random() * 10 - 5,
    tiltV: Math.random() * .15 + .05,
    shape: Math.random() > .5 ? 'circle' : 'rect',
  }));
  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = .85;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
      }
      ctx.restore();
      p.y     += p.d + 1.5;
      p.x     += Math.sin(p.y * .02) * 1.2;
      p.tilt  += p.tiltV;
    });
    if (pieces.some(p => p.y < canvas.height + 20)) {
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  draw();
}

function showVendidoAnimation() {
  const el = document.getElementById('vendido-congrats');
  el.style.display = 'flex';
  launchConfettiGold();
  setTimeout(() => {
    const card = document.getElementById('vendido-congrats-card');
    if (card) card.style.animation = 'congrats-out .4s ease forwards';
    setTimeout(() => {
      el.style.display = 'none';
      if (card) card.style.animation = 'congrats-pop .45s cubic-bezier(.34,1.56,.64,1) both';
    }, 420);
  }, 3000);
}

function launchConfettiGold() {
  const canvas = document.getElementById('cita-confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx     = canvas.getContext('2d');
  const pieces  = Array.from({ length: 120 }, () => ({
    x:     Math.random() * canvas.width,
    y:     -10 - Math.random() * 80,
    r:     Math.random() * 7 + 3,
    d:     Math.random() * 2 + 1,
    color: ['#f5c400','#ffd700','#ffec6e','#fff','#ff8c00','#00c875'][Math.floor(Math.random()*6)],
    tilt:  Math.random() * 10 - 5,
    tiltV: Math.random() * .15 + .05,
    shape: Math.random() > .4 ? 'circle' : 'rect',
  }));
  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt * Math.PI / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI*2); ctx.fill(); }
      else { ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*1.5); }
      ctx.restore();
      p.y += p.d * 2.5;
      p.tilt += p.tiltV;
      if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
    });
    frame = requestAnimationFrame(draw);
  };
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 3500);
}

// ════════════════════════════════════════════
//  ASSIGN TABS
// ════════════════════════════════════════════
function clearDateFilter(refilter = true) {
  document.getElementById('f-fecha-desde').value = '';
  document.getElementById('f-fecha-hasta').value = '';
  const btn = document.getElementById('btn-clear-dates');
  if (btn) btn.classList.remove('visible');
  if (refilter) applyFilters();
}

function setAssignTab(el, val) {
  assignFilter = val;
  document.querySelectorAll('.assign-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  if (val === 'dist') {
    document.getElementById('toolbar').style.display    = 'none';
    document.getElementById('table-wrap').style.display = 'none';
    document.getElementById('bulk-bar').classList.remove('visible');
    _distBoardFilter = (currentBoardId && currentBoardId !== '__agent__') ? currentBoardId : '__all__';
    renderDistPanel();
    document.getElementById('dist-panel').classList.add('visible');
  } else if (val === 'assigned-deleted') {
    document.getElementById('dist-panel').classList.remove('visible');
    document.getElementById('toolbar').style.display    = 'none';
    document.getElementById('table-wrap').style.display = '';
    renderAssignedDeletedTable();
  } else {
    document.getElementById('dist-panel').classList.remove('visible');
    document.getElementById('toolbar').style.display    = '';
    document.getElementById('table-wrap').style.display = '';
    _hideAssignedDeletedBanner();
    applyFilters();
  }
}

function renderAssignedDeletedTable() {
  const _ads = getSession();
  const _adln = (_ads && _ads.role !== 'master' && _ads.role !== 'admin')
    ? new Set(_getLineUsers(_ads).map(u => u.name)) : null;
  const allDeleted = loadDeletedLeads();

  // Auto-purge leads older than 30 days → vault
  const DAYS_LIMIT = 30;
  const now = Date.now();
  const toVault = allDeleted.filter(l => {
    if (!l._originalBoardId || !l.asignado || l.asignado === 'Sin asignar') return false;
    if (!l._deletedAt) return false;
    return (now - new Date(l._deletedAt).getTime()) > DAYS_LIMIT * 86400000;
  });
  if (toVault.length > 0) {
    _vaultLeads(toVault);
    const remaining = allDeleted.filter(l => !toVault.find(v => v.id === l.id));
    saveDeletedLeads(remaining);
    updateTrashBadge();
  }

  const deleted = loadDeletedLeads()
    .filter(l => l._originalBoardId === currentBoardId && l.asignado && l.asignado !== 'Sin asignar'
      && (!_adln || _adln.has(l.asignado)));

  // Banner
  const bannerEl = document.getElementById('assigned-deleted-banner');
  if (bannerEl) bannerEl.style.display = '';

  const tbody = document.querySelector('#leads-table tbody');
  if (!tbody) return;
  if (deleted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;padding:40px;color:var(--text2)">No hay leads asignados eliminados en este board.</td></tr>`;
    document.getElementById('toolbar-count').textContent = '';
    return;
  }
  document.getElementById('toolbar-count').textContent = `${deleted.length} eliminado${deleted.length!==1?'s':''}`;
  const board = getBoard(currentBoardId);
  const cols  = board ? (board.columns || []) : [];
  tbody.innerHTML = deleted.map(l => {
    const deletedMs  = l._deletedAt ? new Date(l._deletedAt).getTime() : now;
    const daysGone   = Math.floor((now - deletedMs) / 86400000);
    const daysLeft   = Math.max(0, DAYS_LIMIT - daysGone);
    const urgency    = daysLeft <= 5 ? '#e2445c' : daysLeft <= 10 ? '#fbbf24' : '#3ecf8e';
    const countdownCell = `<td style="text-align:center;white-space:nowrap">
      <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;color:${urgency}">
        ⏱ ${daysLeft}d restantes
      </span>
    </td>`;
    const cells = cols.map(c => {
      if (c.key === '_check') return `<td></td>`;
      if (c.key === '_actions') return countdownCell;
      if (c.key === 'asignado') return `<td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(226,68,92,.12);color:var(--red);border:1px solid rgba(226,68,92,.3)">${esc(l.asignado)}</span></td>`;
      return `<td>${esc(l[c.key]||'')}</td>`;
    }).join('');
    return `<tr style="opacity:.8">${cells}</tr>`;
  }).join('');
}

function _hideAssignedDeletedBanner() {
  const b = document.getElementById('assigned-deleted-banner');
  if (b) b.style.display = 'none';
}

// ════════════════════════════════════════════
