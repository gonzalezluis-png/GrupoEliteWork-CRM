//  SUPABASE
// ════════════════════════════════════════════
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

// ── Real-time live sync ──────────────────────
function initRealtimeSync() {
  const ch = supa.channel('crm_live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
      const key = payload.new?.key;
      const val = payload.new?.value;
      if (!key || !key.startsWith('gew_')) return;
      // Skip changes this client wrote within the last 4 s
      const own = _ownWrites.get(key);
      if (own && Date.now() - own < 4000) return;
      localStorage.setItem(key, val);
      _applyRealtimeKey(key);
    })
    .subscribe();
  window.addEventListener('beforeunload', () => supa.removeChannel(ch), { once: true });
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
}

async function loadFromSupabase() {
  try {
    const { data, error } = await supa.from('kv_store').select('key, value');
    if (error) { console.error('Supabase load error:', error.message); return; }
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

      data.forEach(row => {
        if (row.key === USERS_KEY) {
          try {
            const remote = JSON.parse(row.value) || [];
            const local  = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
            const merged = [...remote];
            const remoteIds = new Set(remote.map(ru => ru.id));
            // Only add local users not in remote AND not previously deleted
            local.forEach(lu => {
              if (!remoteIds.has(lu.id) && !deletedUserIds.has(lu.id)) {
                merged.push(lu);
              }
            });
            localStorage.setItem(row.key, JSON.stringify(merged));
          } catch { localStorage.setItem(row.key, row.value); }
        } else {
          localStorage.setItem(row.key, row.value);
        }
      });
    }
  } catch(e) {
    console.error('Supabase unreachable:', e);
  }
}

// ════════════════════════════════════════════
