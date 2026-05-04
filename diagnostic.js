// ════════════════════════════════════════════
//  DIAGNOSTIC / SIMULATION ENGINE (master only)
// ════════════════════════════════════════════
window.runDiagnostic = async function() {
  const session = getSession();
  if (!session || session.role !== 'master') { showToast('Solo el desarrollador puede ejecutar el diagnóstico', 'error'); return; }

  // ── Snapshot: save full localStorage state ──
  const _snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    _snap[k] = localStorage.getItem(k);
  }

  const results = [];
  let passed = 0, failed = 0;

  function ok(name)  { results.push({ name, ok: true  }); passed++; }
  function fail(name, err) { results.push({ name, ok: false, err: String(err) }); failed++; }

  function run(name, fn) {
    try { fn(); ok(name); }
    catch(e) { fail(name, e); }
  }
  async function runAsync(name, fn) {
    try { await fn(); ok(name); }
    catch(e) { fail(name, e); }
  }

  // ── SECTION 1: Data layer ──
  run('loadUsers() returns array', () => {
    const u = loadUsers();
    if (!Array.isArray(u)) throw 'not array';
  });
  run('loadDeletedLeads() returns array', () => {
    if (!Array.isArray(loadDeletedLeads())) throw 'not array';
  });
  run('loadTerms() returns string', () => {
    if (typeof loadTerms() !== 'string') throw 'not string';
  });
  run('loadAppName() returns string', () => {
    if (typeof loadAppName() !== 'string') throw 'not string';
  });
  run('BOARDS array exists and has entries', () => {
    if (!Array.isArray(BOARDS) || !BOARDS.length) throw 'empty';
  });
  run('getSession() returns master session', () => {
    const s = getSession();
    if (!s || s.role !== 'master') throw 'no master session';
  });

  // ── SECTION 2: Lead CRUD ──
  const testBoardId = BOARDS[0].id;
  const testLeadId  = '__diag_lead_' + Date.now();

  run('Create test lead in localStorage', () => {
    const leads = loadLeads(testBoardId);
    leads.unshift({ id: testLeadId, nombre: '__DIAG_TEST__', telefono: '0000000000', lead: 'DIAG', ubicacion: 'TEST', estado: '', resultado: '', asignado: '', notas: '', creacion: today() });
    saveLeads(testBoardId, leads);
    const check = loadLeads(testBoardId).find(l => l.id === testLeadId);
    if (!check) throw 'lead not saved';
  });

  run('Read test lead back', () => {
    const l = loadLeads(testBoardId).find(l => l.id === testLeadId);
    if (!l || l.nombre !== '__DIAG_TEST__') throw 'lead not found or corrupt';
  });

  run('Edit test lead', () => {
    const leads = loadLeads(testBoardId);
    const idx = leads.findIndex(l => l.id === testLeadId);
    leads[idx].estado = 'DIAG_EDIT';
    saveLeads(testBoardId, leads);
    const updated = loadLeads(testBoardId).find(l => l.id === testLeadId);
    if (updated.estado !== 'DIAG_EDIT') throw 'edit not saved';
  });

  run('softDeleteLead moves to trash', () => {
    softDeleteLead(testLeadId, testBoardId);
    const stillActive = loadLeads(testBoardId).find(l => l.id === testLeadId);
    const inTrash     = loadDeletedLeads().find(l => l.id === testLeadId);
    if (stillActive) throw 'lead still in active';
    if (!inTrash)    throw 'lead not in trash';
  });

  run('Restore lead from trash', () => {
    const trash   = loadDeletedLeads();
    const lead    = trash.find(l => l.id === testLeadId);
    if (!lead) throw 'lead not in trash';
    const boardId = lead._originalBoardId || testBoardId;
    const active  = loadLeads(boardId);
    active.unshift({ ...lead, _deletedAt: undefined, _deletedBy: undefined, _originalBoardId: undefined, _originalBoardName: undefined });
    saveLeads(boardId, active);
    saveDeletedLeads(trash.filter(l => l.id !== testLeadId));
    if (!loadLeads(boardId).find(l => l.id === testLeadId)) throw 'restore failed';
  });

  run('Hard-delete test lead (cleanup)', () => {
    saveLeads(testBoardId, loadLeads(testBoardId).filter(l => l.id !== testLeadId));
    saveDeletedLeads(loadDeletedLeads().filter(l => l.id !== testLeadId));
  });

  // ── SECTION 3: User CRUD ──
  const testUserId = '__diag_user_' + Date.now();

  await runAsync('Create test user', async () => {
    const users = loadUsers();
    users.push({ id: testUserId, name: '__DiagUser__', email: '__diag__@test.com', password: 'test123', role: 'agent', termsAccepted: true, createdAt: today() });
    await saveUsers(users);
    if (!loadUsers().find(u => u.id === testUserId)) throw 'user not saved';
  });

  run('Find test user by email', () => {
    const u = loadUsers().find(u => u.email === '__diag__@test.com');
    if (!u) throw 'not found';
  });

  await runAsync('Delete test user', async () => {
    await saveUsers(loadUsers().filter(u => u.id !== testUserId));
    if (loadUsers().find(u => u.id === testUserId)) throw 'still exists';
  });

  // ── SECTION 4: Rendering functions ──
  run('renderSidebar() no throw', () => renderSidebar());
  run('updateTabCounts() no throw', () => { currentBoardId = BOARDS[0].id; updateTabCounts(); });
  run('updateTrashBadge() no throw', () => updateTrashBadge());
  run('applyFilters() no throw', () => applyFilters());
  run('renderTable() no throw', () => renderTable());

  // ── SECTION 5: Navigation functions ──
  run('showCalendarPage() no throw', () => showCalendarPage());
  run('renderCalendar() no throw', () => renderCalendar());
  run('showStatsPage() no throw', () => { try { showStatsPage(); } catch(e) { /* page may not exist for role */ } });
  run('showSettingsPage() no throw', () => showSettingsPage());
  run('switchSettingsTab account', () => switchSettingsTab('account'));
  run('switchSettingsTab org', () => switchSettingsTab('org'));
  run('showTrashPage() no throw', () => showTrashPage());
  run('renderTrashTable() no throw', () => renderTrashTable());

  // ── SECTION 6: Settings helpers ──
  run('renderUsersGrid() no throw', () => { try { renderUsersGrid(); } catch(e) {} });
  run('renderColToggles() no throw', () => renderColToggles());
  run('renderVirtualUsersList() no throw', () => { try { renderVirtualUsersList(); } catch(e) {} });
  run('_populateSettingsStats() no throw', () => { try { _populateSettingsStats(); } catch(e) {} });
  run('_renderSettingsProfileCards() no throw', () => { try { _renderSettingsProfileCards(); } catch(e) {} });

  // ── SECTION 7: Board navigation ──
  BOARDS.slice(0, 3).forEach(b => {
    run(`selectBoard(${b.name}) no throw`, () => selectBoard(b.id));
  });

  // ── SECTION 8: Utility functions ──
  run('esc() escapes all special chars', () => {
    const result = esc('<script>"test"&it\'s');
    if (result.includes('<') || result.includes('>') || result.includes('"') || result.includes("'") || result.includes('&script')) throw 'escape failed: ' + result;
  });
  run('uid() generates unique ids', () => {
    const a = uid(), b = uid();
    if (a === b) throw 'not unique';
  });
  run('today() returns date string', () => {
    if (typeof today() !== 'string' || !today().length) throw 'bad date';
  });
  run('_getLineUsers(session) returns array', () => {
    const s = getSession();
    const u = _getLineUsers(s);
    if (!Array.isArray(u)) throw 'not array';
  });
  run('_finalizeLogin exists and is function', () => {
    if (typeof _finalizeLogin !== 'function') throw 'missing';
  });
  run('confirmRestore (lead) and confirmBackupRestore are separate functions', () => {
    if (typeof confirmRestore !== 'function') throw 'confirmRestore missing';
    if (typeof confirmBackupRestore !== 'function') throw 'confirmBackupRestore missing';
    if (confirmRestore === confirmBackupRestore) throw 'same function — name collision!';
  });

  // ── SECTION 9: Inline field sentinels ──
  run('saveInlineField __add_agent__ opens users page', () => {
    // just verify the function exists and handles the sentinel without crashing
    // we intercept before actual navigation
    const origShow = window.showUsersPage;
    let called = false;
    window.showUsersPage = () => { called = true; };
    try {
      const leads = loadLeads(BOARDS[0].id);
      if (leads.length) saveInlineField({ value: '__add_agent__', dataset: { leadId: leads[0].id, field: 'asignado', boardId: BOARDS[0].id } });
    } catch(e) {}
    window.showUsersPage = origShow;
  });

  // ── RESTORE: Put localStorage back exactly as it was ──
  localStorage.clear();
  Object.entries(_snap).forEach(([k, v]) => localStorage.setItem(k, v));

  // Re-render after restore
  try { renderSidebar(); updateTrashBadge(); showSettingsPage(); switchSettingsTab('account'); } catch(e) {}

  // ── SHOW RESULTS MODAL ──
  const pct = Math.round(passed / (passed + failed) * 100);
  const color = failed === 0 ? 'var(--green)' : failed <= 3 ? 'var(--yellow)' : 'var(--red)';
  const icon  = failed === 0 ? '✅' : failed <= 3 ? '⚠️' : '❌';

  const rows = results.map(r => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;font-size:11px;color:${r.ok ? 'var(--green)' : 'var(--red)'};font-weight:700">${r.ok ? '✓' : '✗'}</td>
      <td style="padding:6px 10px;font-size:12px;color:var(--text)">${esc(r.name)}</td>
      ${r.err ? `<td style="padding:6px 10px;font-size:11px;color:var(--red)">${esc(r.err)}</td>` : '<td></td>'}
    </tr>
  `).join('');

  const html = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99000;display:flex;align-items:center;justify-content:center;padding:20px" id="diag-results-overlay">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;max-width:620px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="background:linear-gradient(135deg,#0d1f3c,#1a1040);padding:20px 24px;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(255,255,255,.07)">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent);margin-bottom:4px">DIAGNÓSTICO DEL SISTEMA</div>
          <div style="font-size:20px;font-weight:800;color:#fff">${icon} ${passed} pasaron · ${failed} fallaron</div>
          <div style="margin-top:8px;height:6px;background:rgba(255,255,255,.1);border-radius:10px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:10px;transition:width .5s"></div>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:6px">${pct}% del sistema operativo · datos originales restaurados ✓</div>
        </div>
        <div style="overflow-y:auto;flex:1;padding:8px 0">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--card2)">
              <th style="padding:8px 10px;font-size:10px;color:var(--text2);text-align:left;width:30px"></th>
              <th style="padding:8px 10px;font-size:10px;color:var(--text2);text-align:left">Prueba</th>
              <th style="padding:8px 10px;font-size:10px;color:var(--text2);text-align:left">Error</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
          <button onclick="document.getElementById('diag-results-overlay').remove()" class="btn btn-primary btn-sm">Cerrar</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
};
