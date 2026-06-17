// SUPABASE — VPS (Phase 1: leads table + kv_store hybrid)
// ════════════════════════════════════════════
const FEEDBACK_KEY = 'gew_feedback';
const SUPA_URL = 'https://esfjwnzigmapacbotzgh.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZmp3bnppZ21hcGFjYm90emdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTYzMjUsImV4cCI6MjA5NzIzMjMyNX0.sAfXtl2ASjzEGBaN0L52giDpqjrS3BdB2WcmdjBJgA4';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY);
const _LOCAL_API = '/crm-api/';
const _LOCAL_TOKEN = 'GewCrm2026Token';

const _ownWrites = new Map();

function _rowToLead(row) {
  const base = (typeof row.data === 'object' && row.data) ? row.data : {};
  return {
    ...base,
    id: row.id,
    _boardId:   row.board_id   !== undefined ? row.board_id   : (base._boardId   || ''),
    asignado:   row.assigned_to !== undefined ? row.assigned_to : base.asignado,
    asignadoId: row.assigned_id !== undefined ? row.assigned_id : base.asignadoId,
    nombre:     row.full_name  !== undefined ? row.full_name  : base.nombre,
    telefono:   row.phone      !== undefined ? row.phone      : base.telefono,
    email:      row.email      !== undefined ? row.email      : base.email,
    resultado:  row.resultado  !== undefined ? row.resultado  : base.resultado,
    _version:   row.version    || 1,
    _deleted:   row.deleted    || false,
    _updatedAt: row.updated_at || base._updatedAt || '',
  };
}

async function _upsertLeadRemote(lead) {
  try {
    const r = await fetch(_LOCAL_API + '?action=upsert_lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Token': _LOCAL_TOKEN },
      body: JSON.stringify({ lead }),
    });
    const json = await r.json();
    if (r.status === 409 && json.conflict && json.current) {
      CRMLog.conflict409(lead, json.current);
      const serverLead = _rowToLead(json.current);
      storePatchLead(serverLead);
      _applyRealtimeKey('gew_leads_' + serverLead._boardId);
      return false;
    }
    if (json.ok && json.version) {
      // Stamp server-assigned version onto the stored lead
      const curr = storeGetLeads(lead._boardId || '');
      const idx  = curr.findIndex(l => l.id === lead.id);
      if (idx >= 0) {
        const updated = curr.slice();
        updated[idx] = { ...updated[idx], _version: json.version };
        storeSetLeads(lead._boardId || '', updated);
      }
      CRMLog.leadUpdate(lead, 'upsert_lead:ok');
    }
    return json.ok;
  } catch(e) {
    console.error('_upsertLeadRemote error:', e);
    return false;
  }
}

async function supaSync(key, value) {
  try {
    _ownWrites.set(key, Date.now());
    if (key.startsWith('gew_ld_')) {
      const lead = JSON.parse(value);
      return await _upsertLeadRemote(lead);
    }
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
    if (key.startsWith('gew_ld_')) {
      const leadId = key.slice('gew_ld_'.length);
      const r = await fetch(_LOCAL_API + '?action=delete_lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CRM-Token': _LOCAL_TOKEN },
        body: JSON.stringify({ id: leadId }),
      });
      return (await r.json()).ok;
    }
    const { error } = await supa.from('kv_store').delete().eq('key', key);
    if (error) { console.error('supaDelete error:', key, error.message); return false; }
    return true;
  } catch(e) {
    console.error('supaDelete exception:', key, e);
    return false;
  }
}

// ── Real-time live sync ──────────────────────
let _kvChannel    = null;
let _leadsChannel = null;

function initRealtimeSync() {
  if (_kvChannel) return;

  // Channel 1: kv_store — non-lead keys only
  _kvChannel = supa.channel('crm_kv')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
      const key = payload.new?.key || payload.old?.key;
      const val = payload.new?.value;
      if (!key || !key.startsWith('gew_')) return;
      if (key.startsWith('gew_ld_') || key.startsWith('gew_leads_')) return;
      const own = _ownWrites.get(key);
      if (own && Date.now() - own < 4000) return;
      localStorage.setItem(key, val);
      _applyRealtimeKey(key);
    })
    .subscribe();

  // Channel 2: leads table
  _leadsChannel = supa.channel('crm_leads')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, payload => {
      try {
        const row = payload.new || payload.old;
        if (!row || !row.id) return;
        const leadId = row.id;
        const ownKey = 'gew_ld_' + leadId;
        const own = _ownWrites.get(ownKey);
        if (own && Date.now() - own < 4000) return;

        const trash = JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
        const deletedIds = new Set(trash.map(l => l.id).filter(Boolean));
        if (typeof _deletedLeadIds !== 'undefined') _deletedLeadIds.forEach(id => deletedIds.add(id));

        if (payload.eventType === 'DELETE' || (payload.new && payload.new.deleted)) {
          storeRemoveLead(leadId);
          _boardCountCache.clear();
          const allBoards = (typeof BOARDS !== 'undefined' ? BOARDS : []).concat(
            typeof VENDIDOS_BOARD !== 'undefined' ? [VENDIDOS_BOARD] : []
          );
          allBoards.forEach(b => _applyRealtimeKey('gew_leads_' + b.id));
        } else if (payload.new) {
          const lead = _rowToLead(payload.new);
          if (!lead._boardId || deletedIds.has(lead.id)) return;
          CRMLog.realtimeEvent(payload.eventType, leadId, lead._boardId);
          const patched = storePatchLead(lead);
          if (patched) {
            _boardCountCache.delete(lead._boardId);
            _applyRealtimeKey('gew_leads_' + lead._boardId);
          }
        }
      } catch(e) { console.error('leads realtime error:', e); }
    })
    .subscribe();

  window.addEventListener('beforeunload', () => {
    if (_kvChannel)    { supa.removeChannel(_kvChannel);    _kvChannel    = null; }
    if (_leadsChannel) { supa.removeChannel(_leadsChannel); _leadsChannel = null; }
  }, { once: true });
}

function _applyRealtimeKey(key) {
  const session = getSession();
  if (!session) return;

  if (key.startsWith('gew_leads_')) {
    const boardId = key.slice('gew_leads_'.length);
    _boardCountCache.delete(boardId);
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
  // Supabase responds. This data is stale and will be replaced below.
  storeWarmFromLocalStorage();

  try {
    // 1. Load kv_store (non-lead keys only)
    const [p0, p1] = await Promise.all([
      supa.from('kv_store').select('key, value').order('key').range(0,    999),
      supa.from('kv_store').select('key, value').order('key').range(1000, 1999),
    ]);
    if (p0.error) { console.error('Supabase kv_store load error:', p0.error.message); }
    const kvData = [...(p0.data || []), ...(p1.data || [])].filter(
      row => !row.key.startsWith('gew_ld_') && !row.key.startsWith('gew_leads_')
    );

    const remoteMap = {};
    kvData.forEach(row => { remoteMap[row.key] = row.value; });

    let deletedUserIds = new Set();
    try {
      const deletedRemote = JSON.parse(remoteMap[DELETED_USERS_KEY] || '[]');
      deletedRemote.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
    } catch(_) {}
    try {
      const deletedLocal = JSON.parse(localStorage.getItem(DELETED_USERS_KEY) || '[]');
      deletedLocal.forEach(u => { if (u.id) deletedUserIds.add(u.id); });
    } catch(_) {}

    const deletedLeadIds = new Set();
    try {
      const trashRemote = JSON.parse(remoteMap[TRASH_KEY] || '[]');
      trashRemote.forEach(l => { if (l.id) deletedLeadIds.add(l.id); });
    } catch(_) {}
    try {
      const trashLocal = JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
      trashLocal.forEach(l => { if (l.id) deletedLeadIds.add(l.id); });
    } catch(_) {}
    if (typeof _deletedLeadIds !== 'undefined') {
      deletedLeadIds.forEach(id => _deletedLeadIds.add(id));
    }

    kvData.forEach(row => {
      if (row.key === USERS_KEY) {
        try {
          const remote = JSON.parse(row.value) || [];
          const local  = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
          const merged = remote.filter(ru => !deletedUserIds.has(ru.id));
          const mergedIds = new Set(merged.map(ru => ru.id));
          local.forEach(lu => {
            if (!mergedIds.has(lu.id) && !deletedUserIds.has(lu.id)) merged.push(lu);
          });
          localStorage.setItem(row.key, JSON.stringify(merged));
        } catch { localStorage.setItem(row.key, row.value); }
      } else {
        localStorage.setItem(row.key, row.value);
      }
    });

    // 2. Load leads from leads table → populate in-memory store (authoritative)
    const { data: leadsRows, error: leadsError } = await supa
      .from('leads')
      .select('*')
      .eq('deleted', false);

    if (leadsError) {
      console.error('Supabase leads load error:', leadsError.message);
    } else if (leadsRows && leadsRows.length > 0) {
      const boardMap = {};
      leadsRows.forEach(row => {
        const lead = _rowToLead(row);
        if (!lead._boardId || deletedLeadIds.has(lead.id)) return;
        if (!boardMap[lead._boardId]) boardMap[lead._boardId] = [];
        boardMap[lead._boardId].push(lead);
      });

      Object.entries(boardMap).forEach(([boardId, remoteLeads]) => {
        // Merge with warm-cache from store (local edits made before Supabase returned)
        const localLeads  = storeGetLeads(boardId);
        const localMap    = new Map(localLeads.map(l => [l.id, l]));
        const remoteMapB  = new Map(remoteLeads.map(l => [l.id, l]));
        const allIds      = new Set([...localMap.keys(), ...remoteMapB.keys()]);
        const merged = [];
        for (const id of allIds) {
          if (deletedLeadIds.has(id)) continue;
          const loc = localMap.get(id);
          const rem = remoteMapB.get(id);
          if (!loc) { merged.push(rem); continue; }
          if (!rem) { merged.push(loc); continue; }
          // Keep whichever is newer; if local is newer it'll be re-synced by pending debounce
          merged.push((loc._updatedAt || '') >= (rem._updatedAt || '') ? loc : rem);
        }
        storeSetLeads(boardId, merged);
        _boardCountCache.delete(boardId);
      });

      // Clear boards present in warm-cache but absent from server (they're empty)
      for (const [boardId] of _leadStore) {
        if (!boardMap[boardId]) storeSetLeads(boardId, []);
      }
    } else {
      // No leads from server — clear all warm-cache boards
      for (const [boardId] of _leadStore) storeSetLeads(boardId, []);
    }

    storeMarkReady();
    console.log(`[CRM:store] ready — ${leadsRows?.length ?? 0} leads loaded`);

    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof currentBoardId !== 'undefined' && currentBoardId && typeof renderTableKeepSelection === 'function') {
      renderTableKeepSelection();
    }
  } catch(e) {
    console.error('Supabase unreachable:', e);
  }
}
// ════════════════════════════════════════════
