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
