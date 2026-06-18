//  SUPABASE
// ════════════════════════════════════════════
const FEEDBACK_KEY = 'gew_feedback';
const SUPA_URL = 'https://vpwbczzmonboirjckpmy.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd2Jjenptb25ib2lyamNrcG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MjAwMDUsImV4cCI6MjA5MjI5NjAwNX0._JCs7b6xMKgqskbCAdg6j9nW6UdMfPRPcwScLp9YCZM';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);

// Track keys this client just wrote so we don't re-apply our own changes
const _ownWrites = new Map();

async function supaSync(key, value) {
  try {
    _ownWrites.set(key, Date.now());
    const { error } = await supa.from('kv_store').upsert({ key, value }, { onConflict: 'key' });
    if (error) { console.error('supaSync error:', key, error.message); return false; }
    return true;
  } catch(e) {
    console.error('supaSync exception:', key, e);
    return false;
  }
}

async function supaDelete(key) {
  try {
    _ownWrites.set(key, Date.now());
    const { error } = await supa.from('kv_store').delete().eq('key', key);
    if (error) { console.error('supaDelete error:', key, error.message); return false; }
    return true;
  } catch(e) {
    console.error('supaDelete exception:', key, e);
    return false;
  }
}

// ── Real-time live sync ──────────────────────
let _realtimeCh = null;
function initRealtimeSync() {
  if (_realtimeCh) return; // already subscribed
  _realtimeCh = supa.channel('crm_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
      const key = payload.new?.key || payload.old?.key;
      const val = payload.new?.value;
      if (!key || !key.startsWith('gew_')) return;
      // Skip changes this client wrote within the last 4 s (30 s for tombstones)
      const own = _ownWrites.get(key);
      if (own) {
        const ttl = (val && JSON.parse(val)?._deleted) ? 30000 : 4000;
        if (Date.now() - own < ttl) return;
      }

      // Per-lead row change (new format)
      if (key.startsWith('gew_ld_')) {
        try {
          const eventType = payload.eventType;
          const trash = JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
          const deletedIds = new Set(trash.map(l => l.id).filter(Boolean));
          if (typeof _deletedLeadIds !== 'undefined') _deletedLeadIds.forEach(id => deletedIds.add(id));

          if (eventType === 'DELETE') {
            const leadId = (payload.old?.key || '').replace('gew_ld_', '');
            if (leadId) {
              const allBoards = (typeof BOARDS !== 'undefined' ? BOARDS : []).concat(
                typeof VENDIDOS_BOARD !== 'undefined' ? [VENDIDOS_BOARD] : []
              );
              allBoards.forEach(b => {
                const bkey = 'gew_leads_' + b.id;
                try {
                  const arr = JSON.parse(localStorage.getItem(bkey) || '[]');
                  const next = arr.filter(l => l.id !== leadId);
                  if (next.length !== arr.length) {
                    localStorage.setItem(bkey, JSON.stringify(next));
                    _boardCountCache.delete(b.id);
                    _applyRealtimeKey(bkey);
                  }
                } catch(_) {}
              });
            }
          } else if (val) {
            const lead = JSON.parse(val);
            if (lead && lead.id && lead._boardId && !lead._deleted && !deletedIds.has(lead.id)) {
              const bkey = 'gew_leads_' + lead._boardId;
              const arr = JSON.parse(localStorage.getItem(bkey) || '[]');
              const idx = arr.findIndex(l => l.id === lead.id);
              if (idx >= 0) {
                if ((lead._updatedAt || '') >= (arr[idx]._updatedAt || '')) arr[idx] = lead;
              } else {
                arr.push(lead);
              }
              localStorage.setItem(bkey, JSON.stringify(arr));
              _boardCountCache.delete(lead._boardId);
              _applyRealtimeKey(bkey);
            }
          }
        } catch(_) {}
        return;
      }

      // Smart per-lead merge for board updates — prevents stale client from overwriting newer assignments
      if (key.startsWith('gew_leads_')) {
        try {
          const trash = JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
          const deletedIds = new Set(trash.map(l => l.id).filter(Boolean));
          if (typeof _deletedLeadIds !== 'undefined') _deletedLeadIds.forEach(id => deletedIds.add(id));

          const remoteLeads = JSON.parse(val) || [];
          const localLeads  = JSON.parse(localStorage.getItem(key) || '[]');

          const localMap  = new Map(localLeads.map(l => [l.id, l]));
          const remoteMap = new Map(remoteLeads.map(l => [l.id, l]));
          const allIds    = new Set([...localMap.keys(), ...remoteMap.keys()]);

          const merged = [];
          for (const id of allIds) {
            if (deletedIds.has(id)) continue;
            const loc = localMap.get(id);
            const rem = remoteMap.get(id);
            if (!loc) { merged.push(rem); continue; }
            if (!rem) { merged.push(loc); continue; }
            // Both exist — keep the version with the newer _updatedAt
            merged.push((loc._updatedAt || '') >= (rem._updatedAt || '') ? loc : rem);
          }

          localStorage.setItem(key, JSON.stringify(merged));
          // Re-sync only if remote had trashed leads that were stripped
          if (remoteLeads.some(l => deletedIds.has(l.id))) supaSync(key, JSON.stringify(merged));
        } catch { localStorage.setItem(key, val); }
      } else {
        localStorage.setItem(key, val);
      }
      _applyRealtimeKey(key);
    })
    .subscribe();
  window.addEventListener('beforeunload', () => { supa.removeChannel(_realtimeCh); _realtimeCh = null; }, { once: true });
}

function _applyRealtimeKey(key) {
  const session = getSession();
  if (!session) return;

  if (key.startsWith('gew_leads_')) {
    const boardId = key.slice('gew_leads_'.length);
    _boardCountCache.delete(boardId); // #4 invalidate stale count on external update
    if (currentBoardId === boardId) renderTableKeepSelection();
    else if (currentBoardId === '__agent__') renderTableKeepSelection();
    updateTabCounts();
    updateTrashBadge();
    return;
  }
  if (key === TRASH_KEY || key === 'gew_deleted_leads') {
    updateTrashBadge();
    const tp = document.getElementById('trash-page');
    if (tp && tp.classList.contains('visible')) renderTrashTable();
    return;
  }
  if (key === 'gew_users') {
    populateAgentFilter();
    const ug = document.getElementById('users-grid');
    if (ug) renderUsersGrid();
    renderTableKeepSelection();
    return;
  }
  if (key === 'gew_calendar_events') {
    if (typeof renderCalendar === 'function') renderCalendar();
    return;
  }
  if (key === PENDING_KEY) {
    updatePendingBadge();
    const reqTab = document.getElementById('stab-requests');
    if (reqTab && reqTab.classList.contains('active')) renderPendingList();
    return;
  }
  if (key === FEEDBACK_KEY) {
    updateFeedbackBadge();
    const inboxOverlay = document.getElementById('feedback-inbox-overlay');
    if (inboxOverlay && inboxOverlay.classList.contains('open')) renderFeedbackInbox();
    return;
  }
}

async function loadFromSupabase() {
  // Warm the in-memory store from localStorage so boards render instantly while
  // Supabase responds. Stale data — overwritten below.
  storeWarmFromLocalStorage();

  try {
    const [p0, p1, p2] = await Promise.all([
      supa.from('kv_store').select('key, value').order('key').range(0,    999),
      supa.from('kv_store').select('key, value').order('key').range(1000, 1999),
      supa.from('kv_store').select('key, value').order('key').range(2000, 2999),
    ]);
    if (p0.error) { console.error('Supabase load error:', p0.error.message); return; }
    const data = [...(p0.data || []), ...(p1.data || []), ...(p2.data || [])];
    if (data && data.length > 0) {
      // Build a map of all remote data first so we can cross-reference during merge
      const remoteMap = {};
      data.forEach(row => { remoteMap[row.key] = row.value; });

      // Collect deleted user IDs from the remote batch to prevent resurrection
      let deletedUserIds = new Set();
      try {
        const deletedRemote = JSON.parse(remoteMap[DELETED_USERS_KEY] || '[]');
        deletedRemote.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
      } catch(_) {}
      // Also include any locally tracked deleted users
      try {
        const deletedLocal = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '[]');
        deletedLocal.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
      } catch(_) {}

      // Collect deleted lead IDs from trash to prevent lead resurrection
      const deletedLeadIds = new Set();
      try {
        const trashRemote = JSON.parse(remoteMap[TRASH_KEY] || '[]');
        trashRemote.forEach(l => { if (l.id) deletedLeadIds.add(l.id); });
      } catch(_) {}
      try {
        const trashLocal = JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
        trashLocal.forEach(l => { if (l.id) deletedLeadIds.add(l.id); });
      } catch(_) {}
      // Pre-populate global _deletedLeadIds so realtime handler is protected immediately
      if (typeof _deletedLeadIds !== 'undefined') {
        deletedLeadIds.forEach(id => _deletedLeadIds.add(id));
      }

      data.forEach(row => {
        if (row.key === USERS_KEY) {
          try {
            const remote = JSON.parse(row.value) || [];
            const local  = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
            const merged = remote.filter(ru => !deletedUserIds.has(ru.id));
            const mergedIds = new Set(merged.map(ru => ru.id));
            local.forEach(lu => {
              if (!mergedIds.has(lu.id) && !deletedUserIds.has(lu.id)) {
                merged.push(lu);
              }
            });
            localStorage.setItem(row.key, JSON.stringify(merged));
          } catch { localStorage.setItem(row.key, row.value); }
        } else if (row.key.startsWith('gew_leads_')) {
          // Filter only trashed leads — vendidos remain visible in their source board
          try {
            const leads    = JSON.parse(row.value) || [];
            const filtered = leads.filter(l => !deletedLeadIds.has(l.id));
            localStorage.setItem(row.key, JSON.stringify(filtered));
            storeSetLeads(row.key.slice('gew_leads_'.length), filtered);
            if (filtered.length !== leads.length) {
              supaSync(row.key, JSON.stringify(filtered));
            }
          } catch { localStorage.setItem(row.key, row.value); }
        } else {
          localStorage.setItem(row.key, row.value);
        }
      });
      // Build board arrays from per-lead rows (new format — overrides board blobs)
      const perLeadBoards = {};
      data.forEach(row => {
        if (!row.key.startsWith('gew_ld_')) return;
        try {
          const lead = JSON.parse(row.value);
          if (!lead || !lead.id || !lead._boardId) return;
          if (lead._deleted || deletedLeadIds.has(lead.id)) return;
          if (!perLeadBoards[lead._boardId]) perLeadBoards[lead._boardId] = [];
          perLeadBoards[lead._boardId].push(lead);
        } catch(_) {}
      });
      if (Object.keys(perLeadBoards).length > 0) {
        Object.entries(perLeadBoards).forEach(([boardId, remoteLeads]) => {
          const lkey = 'gew_leads_' + boardId;
          const local = JSON.parse(localStorage.getItem(lkey) || '[]');
          const localMap  = new Map(local.map(l => [l.id, l]));
          const remoteMap = new Map(remoteLeads.map(l => [l.id, l]));
          const allIds    = new Set([...localMap.keys(), ...remoteMap.keys()]);
          const merged = [];
          for (const id of allIds) {
            if (deletedLeadIds.has(id)) continue;
            const loc = localMap.get(id);
            const rem = remoteMap.get(id);
            if (!loc) { merged.push(rem); continue; }
            if (!rem) { merged.push(loc); continue; }
            merged.push((loc._updatedAt || '') >= (rem._updatedAt || '') ? loc : rem);
          }
          localStorage.setItem(lkey, JSON.stringify(merged));
          storeSetLeads(boardId, merged);
          _boardCountCache.delete(boardId);
        });
      }

      storeMarkReady();

      // Re-render sidebar after Supabase data lands so agents see their boards
      if (typeof renderSidebar === 'function') renderSidebar();
      // Re-render table so agents see their leads after localStorage is populated
      if (typeof currentBoardId !== 'undefined' && currentBoardId && typeof renderTableKeepSelection === 'function') {
        renderTableKeepSelection();
      }
    }
  } catch(e) {
    console.error('Supabase unreachable:', e);
  }
}

// ════════════════════════════════════════════
