// ══════════════════════════════════════════════
//  BUZÓN DE RECOMENDACIONES
// ══════════════════════════════════════════════
// FEEDBACK_KEY defined in supabase.js

function _isMasterSession() {
  const s = getSession();
  return s && (s.role === 'master' || s._isMaster);
}

function _loadFeedback() {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]'); } catch { return []; }
}

async function _saveFeedback(list) {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
  await supaSync(FEEDBACK_KEY, JSON.stringify(list));
}

// ── Badge (master only) ──────────────────────
function updateFeedbackBadge() {
  const badge = document.getElementById('feedback-badge');
  if (!badge) return;
  if (!_isMasterSession()) { badge.style.display = 'none'; return; }
  const unread = _loadFeedback().filter(f => !f.read).length;
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Button click handler ─────────────────────
function openFeedbackSubmit() {
  if (_isMasterSession()) {
    openFeedbackInbox();
    return;
  }
  const overlay = document.getElementById('feedback-submit-overlay');
  const txt = document.getElementById('feedback-text');
  const err = document.getElementById('feedback-submit-err');
  if (txt) txt.value = '';
  if (err) err.style.display = 'none';
  if (overlay) overlay.classList.add('open');
  setTimeout(() => txt && txt.focus(), 50);
}

function closeFeedbackSubmit() {
  const overlay = document.getElementById('feedback-submit-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function submitFeedback() {
  const txt = document.getElementById('feedback-text');
  const err = document.getElementById('feedback-submit-err');
  const btn = document.getElementById('feedback-submit-btn');
  const text = txt ? txt.value.trim() : '';
  if (!text) {
    if (err) { err.textContent = 'Por favor escribe tu recomendación.'; err.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const session = getSession();
    const item = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      author: session ? session.name : 'Desconocido',
      role: session ? session.role : '',
      text,
      date: new Date().toISOString(),
      read: false,
      reply: null,
      reply_date: null,
    };
    const list = _loadFeedback();
    list.unshift(item);
    await _saveFeedback(list);
    closeFeedbackSubmit();
    showToast && showToast('Recomendación enviada. ¡Gracias!');
  } catch(e) {
    if (err) { err.textContent = 'Error al enviar. Intenta de nuevo.'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}

// ── Inbox (master only) ──────────────────────
function openFeedbackInbox() {
  const overlay = document.getElementById('feedback-inbox-overlay');
  if (overlay) overlay.classList.add('open');
  renderFeedbackInbox();
  // Mark all as read
  const list = _loadFeedback();
  let changed = false;
  list.forEach(f => { if (!f.read) { f.read = true; changed = true; } });
  if (changed) _saveFeedback(list).then(updateFeedbackBadge);
  updateFeedbackBadge();
}

function closeFeedbackInbox() {
  const overlay = document.getElementById('feedback-inbox-overlay');
  if (overlay) overlay.classList.remove('open');
}

function renderFeedbackInbox() {
  const body = document.getElementById('feedback-inbox-body');
  if (!body) return;
  const list = _loadFeedback();
  if (list.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--text2);font-size:13px">No hay recomendaciones todavía.</div>';
    return;
  }
  body.innerHTML = list.map((f, idx) => {
    const date = new Date(f.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    const replyDate = f.reply_date ? new Date(f.reply_date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px;background:var(--card2)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-weight:700;font-size:12px;color:#fff">${esc(f.author)}</span>
          <span style="font-size:10px;color:var(--text2);background:rgba(255,255,255,.07);border-radius:4px;padding:1px 6px">${esc(f.role)}</span>
          <span style="font-size:10px;color:var(--text2);margin-left:auto">${date}</span>
        </div>
        <div style="font-size:12px;color:var(--text1,#e0e0e0);white-space:pre-wrap;line-height:1.6;margin-bottom:10px">${esc(f.text)}</div>
        ${f.reply ? `
          <div style="border-left:3px solid #fdab3d;padding:8px 12px;background:rgba(253,171,61,.07);border-radius:0 6px 6px 0;margin-bottom:10px">
            <div style="font-size:10px;color:#fdab3d;font-weight:700;margin-bottom:4px">Tu respuesta · ${replyDate}</div>
            <div style="font-size:12px;color:var(--text1,#e0e0e0);white-space:pre-wrap;line-height:1.5">${esc(f.reply)}</div>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea id="fb-reply-${idx}" rows="2" placeholder="Escribir respuesta…" style="flex:1;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:#fff;font-size:11px;font-family:var(--font);resize:vertical;outline:none">${esc(f.reply || '')}</textarea>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button onclick="replyFeedback('${f.id}',${idx})" style="background:rgba(253,171,61,.15);border:1px solid rgba(253,171,61,.3);color:#fdab3d;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:var(--font);white-space:nowrap">${f.reply ? 'Actualizar' : 'Responder'}</button>
            <button onclick="deleteFeedback('${f.id}')" style="background:rgba(226,68,92,.1);border:1px solid rgba(226,68,92,.25);color:var(--red);border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:var(--font)">Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function replyFeedback(id, idx) {
  const ta = document.getElementById(`fb-reply-${idx}`);
  const reply = ta ? ta.value.trim() : '';
  if (!reply) return;
  const list = _loadFeedback();
  const item = list.find(f => f.id === id);
  if (!item) return;
  item.reply = reply;
  item.reply_date = new Date().toISOString();
  await _saveFeedback(list);
  renderFeedbackInbox();
}

async function deleteFeedback(id) {
  if (!confirm('¿Eliminar esta recomendación?')) return;
  const list = _loadFeedback().filter(f => f.id !== id);
  await _saveFeedback(list);
  renderFeedbackInbox();
  updateFeedbackBadge();
}

