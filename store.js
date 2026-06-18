// ════════════════════════════════════════════
//  CRM STORE — in-memory lead store + debug logger
//  Leads live here (not localStorage) after first Supabase load.
//  localStorage is warm-cache on startup only; never written to for leads.
// ════════════════════════════════════════════

// ── Debug logger ─────────────────────────────
const CRMLog = {
  leadUpdate(lead, source) {
    console.log(
      `%c[CRM:update]%c id=${lead.id} board=${lead._boardId} v=${lead._version ?? '?'} src=${source}`,
      'color:#38bdf8;font-weight:700', 'color:inherit'
    );
  },
  conflict409(localLead, serverRow) {
    console.warn(
      '%c[CRM:conflict]%c 409 — server version wins',
      'color:#fb923c;font-weight:700', 'color:inherit',
      { id: localLead.id, local_v: localLead._version, server_v: serverRow.version, server_ts: serverRow.updated_at }
    );
  },
  realtimeEvent(type, leadId, boardId) {
    console.log(
      `%c[CRM:realtime]%c ${type} id=${leadId} board=${boardId}`,
      'color:#a78bfa;font-weight:700', 'color:inherit'
    );
  },
  syncSent(boardId, writes, deletes) {
    if (writes > 0 || deletes > 0) {
      console.log(
        `%c[CRM:sync]%c board=${boardId} writes=${writes} deletes=${deletes}`,
        'color:#34d399;font-weight:700', 'color:inherit'
      );
    }
  },
};

// ── In-memory lead store ──────────────────────
const _leadStore  = new Map(); // boardId → lead[]
let   _storeReady = false;

function storeGetLeads(boardId) {
  if (_leadStore.has(boardId)) return _leadStore.get(boardId);
  // Fallback: read from localStorage if store not yet populated
  try {
    const ls = JSON.parse(localStorage.getItem('gew_leads_' + boardId) || '[]');
    if (ls.length > 0) { _leadStore.set(boardId, ls); return ls; }
  } catch(_) {}
  return [];
}

function storeSetLeads(boardId, leads) {
  _leadStore.set(boardId, leads);
}

// Incremental patch — updates or inserts a single lead by id.
// Discards incoming if its _updatedAt is strictly older than what's stored.
function storePatchLead(lead) {
  if (!lead || !lead.id || !lead._boardId) return false;
  const boardId = lead._boardId;
  const curr    = _leadStore.get(boardId) || [];
  const idx     = curr.findIndex(l => l.id === lead.id);
  const next    = curr.slice(); // shallow copy — lead objects replaced, not mutated
  if (idx >= 0) {
    if ((lead._updatedAt || '') < (next[idx]._updatedAt || '')) return false; // stale — discard
    next[idx] = lead;
  } else {
    next.push(lead);
  }
  _leadStore.set(boardId, next);
  return true;
}

// Remove a single lead from whichever board it lives in.
function storeRemoveLead(leadId) {
  for (const [boardId, leads] of _leadStore) {
    const next = leads.filter(l => l.id !== leadId);
    if (next.length !== leads.length) {
      _leadStore.set(boardId, next);
      CRMLog.realtimeEvent('delete', leadId, boardId);
    }
  }
}

function storeIsReady()   { return _storeReady; }
function storeMarkReady() { _storeReady = true; }

// One-time startup warm-cache: read localStorage so boards render instantly before
// Supabase responds. This data is considered stale and overwritten by loadFromSupabase().
function storeWarmFromLocalStorage() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('gew_leads_')) continue;
      const boardId = key.slice('gew_leads_'.length);
      if (!boardId || _leadStore.has(boardId)) continue;
      try {
        const leads = JSON.parse(localStorage.getItem(key)) || [];
        if (leads.length > 0) _leadStore.set(boardId, leads);
      } catch(_) {}
    }
  } catch(_) {}
}
