// ════════════════════════════════════════════
//  VAULT — archived permanently-deleted leads
// ════════════════════════════════════════════
const VAULT_KEY = 'gew_vault';

function loadVault() {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY)) || []; } catch { return []; }
}
async function saveVault(leads) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(leads));
  supaSync(VAULT_KEY, JSON.stringify(leads));
}

function _vaultLeads(leads) {
  const session = getSession();
  const vault   = loadVault();
  const now     = new Date().toISOString();
  leads.forEach(l => vault.unshift({
    ...l,
    _vaultedAt: now,
    _vaultedBy: session ? session.name : 'Sistema'
  }));
  saveVault(vault);
}

function openVault() {
  const session = getSession();
  if (!session || session.role !== 'master') return;
  document.getElementById('vault-overlay').style.display = 'flex';
  document.getElementById('vault-search').value = '';
  renderVaultTable();
}
function closeVault() {
  document.getElementById('vault-overlay').style.display = 'none';
}

function renderVaultTable() {
  const q     = (document.getElementById('vault-search')?.value || '').toLowerCase();
  const all   = loadVault();
  const items = q ? all.filter(l =>
    (l.nombre||'').toLowerCase().includes(q) ||
    (l.telefono||'').toLowerCase().includes(q) ||
    (l.email||'').toLowerCase().includes(q) ||
    (l.lead||'').toLowerCase().includes(q) ||
    (l.asignado||'').toLowerCase().includes(q)
  ) : all;

  const cnt = document.getElementById('vault-count');
  if (cnt) cnt.textContent = `${items.length} registro${items.length !== 1 ? 's' : ''}${q ? ' encontrados' : ' en el archivo'}`;

  const empty = document.getElementById('vault-empty');
  const tbl   = document.getElementById('vault-table');
  if (!items.length) {
    if (empty) empty.style.display = '';
    if (tbl)   tbl.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (!tbl) return;

  tbl.innerHTML = `
    <thead>
      <tr style="border-bottom:1px solid rgba(255,255,255,.08)">
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">NOMBRE</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">TELÉFONO</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">BOARD</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">AGENTE</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">ARCHIVADO</th>
        <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,.25)">POR</th>
        <th style="padding:8px 10px;width:80px"></th>
      </tr>
    </thead>
    <tbody>
      ${items.map(l => `
        <tr style="border-bottom:1px solid rgba(255,255,255,.04)" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
          <td style="padding:9px 10px;color:rgba(255,255,255,.7);font-weight:600">${esc(l.nombre||'—')}</td>
          <td style="padding:9px 10px;color:rgba(255,255,255,.4)">${esc(l.telefono||'—')}</td>
          <td style="padding:9px 10px;color:rgba(255,255,255,.4)">${esc(l._originalBoardName||l._boardName||'—')}</td>
          <td style="padding:9px 10px;color:rgba(255,255,255,.4)">${esc(l.asignado||'—')}</td>
          <td style="padding:9px 10px;color:rgba(255,255,255,.25);font-size:11px">${l._vaultedAt ? new Date(l._vaultedAt).toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td>
          <td style="padding:9px 10px;color:rgba(255,255,255,.25);font-size:11px">${esc(l._vaultedBy||'—')}</td>
          <td style="padding:9px 10px">
            <button onclick="vaultRestore('${l.id}')" style="background:rgba(0,115,234,.2);border:1px solid rgba(0,115,234,.3);color:rgba(0,115,234,.9);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:var(--font)" onmouseover="this.style.background='rgba(0,115,234,.35)'" onmouseout="this.style.background='rgba(0,115,234,.2)'">Restaurar</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

async function vaultRestore(leadId) {
  const vault = loadVault();
  const idx   = vault.findIndex(l => l.id === leadId);
  if (idx === -1) return;
  const lead  = { ...vault[idx] };
  const destId = lead._originalBoardId || (BOARDS[0] && BOARDS[0].id);
  if (!destId) { showToast('No se puede determinar el board destino', 'error'); return; }

  delete lead._vaultedAt; delete lead._vaultedBy;
  delete lead._deletedAt; delete lead._deletedBy;
  delete lead._originalBoardId; delete lead._originalBoardName;

  const existing = loadLeads(destId);
  existing.unshift(lead);
  await saveLeads(destId, existing);

  vault.splice(idx, 1);
  await saveVault(vault);

  renderVaultTable();
  const board = getBoard(destId);
  showToast(`Lead restaurado en ${board ? board.name : destId} ✓`, 'success');
}

