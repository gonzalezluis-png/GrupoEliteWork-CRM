(function(){
  const TOUR_KEY = 'gew_tour_done_v1';

  // ── Step definitions ─────────────────────────────────────────
  const STEPS_ADMIN = [
    {
      title: '👋 Bienvenido al CRM',
      body: `<strong>GrupoElite CRM</strong> es tu plataforma centralizada para gestionar leads, agentes y resultados comerciales.<br><br>Esta guía te mostrará paso a paso cómo funciona todo. Solo toma 2 minutos.`,
      target: null, pos: 'center'
    },
    {
      title: '📋 Tableros de Leads',
      body: `Los <strong>tableros</strong> son donde viven tus leads. Cada tablero es un grupo o campaña diferente.<br><br>En la barra lateral izquierda verás todos tus tableros activos. Haz clic en uno para verlo.`,
      target: '.board-item', pos: 'right'
    },
    {
      title: '➕ Agregar Leads',
      body: `Para agregar un nuevo lead haz clic en el botón <strong>"+ Agregar Lead"</strong> en la barra superior del tablero.<br><br>Puedes ingresar nombre, email, teléfono, tipo de lead y más.`,
      target: '#add-lead-btn', pos: 'bottom'
    },
    {
      title: '📊 Columnas del Lead',
      body: `Cada lead tiene columnas clave:<br><ul><li><strong>Estado</strong> — Activo, En proceso, Cerrado…</li><li><strong>Resultado</strong> — Interesado, No contesta…</li><li><strong>Asignado a</strong> — Qué agente lo maneja</li><li><strong>Cita agendada</strong> — Abre el calendario</li></ul>`,
      target: '#leads-table', pos: 'top'
    },
    {
      title: '🎯 Asignar a un Agente',
      body: `En la columna <strong>"Asignado a"</strong>, haz clic en la pastilla azul para desplegar el menú de agentes disponibles.<br><br>Solo tú (desarrollador) y el administrador pueden asignar o reasignar leads.`,
      target: '#leads-table', pos: 'top'
    },
    {
      title: '📈 Panel de Distribución',
      body: `La pestaña <strong>"Distribución"</strong> (junto a Todos / Asignados / Sin Asignar) muestra estadísticas por agente y manager:<br><ul><li>Cuántos leads tiene cada uno</li><li>Sus resultados</li><li>Rendimiento del equipo</li></ul>`,
      target: '#tab-dist', pos: 'bottom'
    },
    {
      title: '👥 Gestión de Usuarios',
      body: `Ve a <strong>Configuración → Usuarios</strong> para:<br><ul><li>Crear agentes, managers y administradores</li><li>Editarles nombre, correo y contraseña</li><li>Asignarlos a un manager</li><li>Forzar cambio de clave al primer login</li></ul>`,
      target: '#nav-settings', pos: 'right'
    },
    {
      title: '🔔 Solicitudes de Acceso',
      body: `Cuando alguien usa <strong>"Solicitar acceso"</strong> en el login, aparece en <strong>Configuración → Solicitudes</strong>.<br><br>Desde ahí puedes aprobar o rechazar el acceso y asignarle un rol directamente.`,
      target: '#sidebar-pending-badge', pos: 'right', fallback: '#nav-settings'
    },
    {
      title: '📅 Calendario',
      body: `El <strong>Calendario</strong> centraliza todas las citas agendadas del equipo.<br><ul><li>Tú ves todas las citas de todos los agentes</li><li>Cada agente solo ve las suyas</li><li>Al marcar "Cita Agendada" en un lead, se agrega automáticamente</li></ul>`,
      target: '#nav-calendar', pos: 'right'
    },
    {
      title: '📊 Registro de Actividad',
      body: `En <strong>Actividad</strong> tienes el historial completo del CRM:<br><ul><li>Quién inició sesión y cuándo</li><li>Qué leads se modificaron</li><li>Asignaciones realizadas</li><li>Filtrable por fecha y tipo</li></ul>`,
      target: '#nav-activity', pos: 'right'
    },
    {
      title: '💾 Respaldos',
      body: `En <strong>Configuración → Respaldo</strong> (solo visible para ti) puedes:<br><ul><li>Descargar un archivo con todos los datos</li><li>Subir el respaldo directamente a <strong>Google Drive</strong></li><li>Restaurar desde un respaldo en caso de emergencia</li></ul><br>El botón <strong>"Respaldar"</strong> en la barra superior te lo recuerda.`,
      target: '#btn-drive-backup', pos: 'bottom', fallback: '#nav-settings'
    },
    {
      title: '⚙️ Configuración General',
      body: `En <strong>Configuración</strong> puedes personalizar:<br><ul><li>Nombre de tu organización</li><li>Tableros y columnas</li><li>Tipos de lead</li><li>Términos y condiciones</li><li>Tu perfil y contraseña</li></ul>`,
      target: '#nav-settings', pos: 'right'
    },
    {
      title: '🚀 ¡Todo listo!',
      body: `Ya conoces las funciones principales del CRM.<br><br>Si necesitas ver esta guía de nuevo, ve a <strong>Configuración → Mi Cuenta → Ver guía de inicio</strong>.<br><br><strong>¡Mucho éxito con tu equipo!</strong>`,
      target: null, pos: 'center'
    }
  ];

  const STEPS_MANAGER = [
    {
      title: '👋 Bienvenido al CRM',
      body: `Hola, <strong id="tour-user-name-placeholder"></strong>. Esta guía rápida te muestra cómo usar el CRM para gestionar tu equipo de agentes.`,
      target: null, pos: 'center'
    },
    {
      title: '📋 Tus Tableros',
      body: `En la barra izquierda verás los <strong>tableros de leads</strong> donde están asignados tus agentes.<br><br>Haz clic en un tablero para ver los leads de tu equipo.`,
      target: '.board-item', pos: 'right'
    },
    {
      title: '📊 Leads de tu Equipo',
      body: `Puedes ver todos los leads de tus agentes. Usa los <strong>filtros</strong> en la barra superior para buscar por agente, estado o resultado.`,
      target: '#leads-table', pos: 'top'
    },
    {
      title: '📈 Distribución',
      body: `La pestaña <strong>"Distribución"</strong> te muestra el rendimiento de cada agente de tu equipo: cuántos leads tiene y sus resultados.`,
      target: '#tab-dist', pos: 'bottom'
    },
    {
      title: '📅 Calendario',
      body: `En el <strong>Calendario</strong> puedes ver las citas de todos tus agentes organizadas por día, semana o mes.`,
      target: '#nav-calendar', pos: 'right'
    },
    {
      title: '🚀 ¡Listo!',
      body: `Ya tienes lo esencial para gestionar tu equipo.<br><br>Si tienes dudas, contacta a tu administrador.`,
      target: null, pos: 'center'
    }
  ];

  const STEPS_AGENT = [
    {
      title: '👋 Bienvenido al CRM',
      body: `Esta guía rápida te explica cómo usar el CRM para gestionar tus leads de manera eficiente.`,
      target: null, pos: 'center'
    },
    {
      title: '📋 Tu Tablero',
      body: `En la barra izquierda están tus <strong>tableros de leads</strong>. Haz clic en uno para ver los leads que te han asignado.`,
      target: '.board-item', pos: 'right'
    },
    {
      title: '✏️ Actualizar un Lead',
      body: `Haz clic en cualquier fila de un lead para editarlo. Puedes actualizar:<br><ul><li><strong>Estado</strong> — cómo va el proceso</li><li><strong>Resultado</strong> — qué pasó en el contacto</li><li><strong>Notas</strong> — información adicional importante</li></ul>`,
      target: '#leads-table', pos: 'top'
    },
    {
      title: '📝 Notas del Lead',
      body: `Usa las <strong>notas</strong> para registrar cada interacción con el lead. Cada nota queda guardada con fecha y autor.<br><br>El ícono de notas en la tabla abre el panel rápidamente.`,
      target: '#leads-table', pos: 'top'
    },
    {
      title: '📅 Tu Calendario',
      body: `Cuando marques un lead como <strong>"Cita Agendada"</strong>, podrás registrar fecha, hora y notas de la cita.<br><br>Todas tus citas aparecen en el <strong>Calendario</strong>.`,
      target: '#nav-calendar', pos: 'right'
    },
    {
      title: '🚀 ¡Ya puedes empezar!',
      body: `Eso es todo lo que necesitas saber. Si tienes dudas, contacta a tu manager o administrador.<br><br><strong>¡Buena suerte!</strong>`,
      target: null, pos: 'center'
    }
  ];

  // ── Tour state ───────────────────────────────────────────────
  let _steps = [];
  let _step  = 0;
  let _highlighted = null;

  function getSteps(role) {
    if (role === 'master' || role === 'admin') return STEPS_ADMIN;
    if (role === 'manager' || role === 'master_manager' || role === 'supervisor_agent') return STEPS_MANAGER;
    return STEPS_AGENT;
  }

  window.startTour = function(role, force) {
    const session = (typeof getSession === 'function') ? getSession() : null;
    const uid = session ? session.id : role;
    const key = TOUR_KEY + '_' + uid;
    if (!force && localStorage.getItem(key)) return;
    _steps = getSteps(role);
    _step  = 0;
    document.getElementById('tour-overlay').classList.add('active');
    const escBtn = document.getElementById('tour-esc-btn');
    if (escBtn) escBtn.style.display = '';
    renderStep();
  };

  window.skipTour = function() {
    endTour();
  };

  window.tourNext = function() {
    if (_step < _steps.length - 1) { _step++; renderStep(); }
    else endTour();
  };

  window.tourBack = function() {
    if (_step > 0) { _step--; renderStep(); }
  };

  function endTour() {
    const session = (typeof getSession === 'function') ? getSession() : null;
    if (session) localStorage.setItem(TOUR_KEY + '_' + session.id, '1');
    clearHighlight();
    document.getElementById('tour-card').style.display = 'none';
    document.getElementById('tour-arrow').style.display = 'none';
    document.getElementById('tour-spotlight').style.boxShadow = 'none';
    document.getElementById('tour-spotlight').style.width  = '0';
    document.getElementById('tour-spotlight').style.height = '0';
    document.getElementById('tour-overlay').classList.remove('active');
    const esc = document.getElementById('tour-esc-btn');
    if (esc) esc.style.display = 'none';
  }

  function clearHighlight() {
    if (_highlighted) {
      _highlighted.style.position = '';
      _highlighted.style.zIndex   = '';
      _highlighted = null;
    }
  }

  function renderStep() {
    const s    = _steps[_step];
    const card = document.getElementById('tour-card');
    const spot = document.getElementById('tour-spotlight');
    const arr  = document.getElementById('tour-arrow');

    // Labels
    document.getElementById('tour-step-label').textContent = `PASO ${_step + 1} DE ${_steps.length}`;
    document.getElementById('tour-title').textContent = s.title;
    document.getElementById('tour-body').innerHTML    = s.body;

    // Dots
    const dotsEl = document.getElementById('tour-dots');
    dotsEl.innerHTML = _steps.map((_,i) => `<div class="tour-dot${i===_step?' active':''}"></div>`).join('');

    // Back button
    document.getElementById('tour-back-btn').style.display = _step > 0 ? '' : 'none';

    // Next button label
    document.getElementById('tour-next-btn').textContent = _step === _steps.length - 1 ? '¡Entendido! ✓' : 'Siguiente →';

    card.style.display = 'block';

    // Highlight target element
    clearHighlight();
    const targetSel = s.target;
    let target = targetSel ? document.querySelector(targetSel) : null;
    if (!target && s.fallback) target = document.querySelector(s.fallback);

    if (target && s.pos !== 'center') {
      _highlighted = target;
      const origPos = window.getComputedStyle(target).position;
      if (origPos === 'static') target.style.position = 'relative';
      target.style.zIndex = '12003';

      const rect = target.getBoundingClientRect();
      const pad  = 8;
      spot.style.left   = (rect.left   - pad) + 'px';
      spot.style.top    = (rect.top    - pad) + 'px';
      spot.style.width  = (rect.width  + pad*2) + 'px';
      spot.style.height = (rect.height + pad*2) + 'px';
      spot.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.75)';
      spot.style.borderRadius = '10px';

      positionCard(rect, s.pos, card, arr, pad);
    } else {
      // Center card, no spotlight
      spot.style.boxShadow = 'none';
      spot.style.width  = '0';
      spot.style.height = '0';
      arr.style.display = 'none';
      centerCard(card);
    }
  }

  function positionCard(rect, pos, card, arr, pad) {
    const cw = card.offsetWidth  || 320;
    const ch = card.offsetHeight || 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;
    let left, top, arrowLeft, arrowTop, arrowBorderSide;

    if (pos === 'right') {
      left = rect.right + pad + gap;
      top  = rect.top + rect.height/2 - ch/2;
      if (left + cw > vw - 8) { left = rect.left - pad - cw - gap; pos = 'left'; }
      arrowTop  = top + ch/2 - 6;
      arrowLeft = pos === 'left' ? left + cw - 6 : left - 6;
    } else if (pos === 'left') {
      left = rect.left - pad - cw - gap;
      top  = rect.top + rect.height/2 - ch/2;
      arrowTop  = top + ch/2 - 6;
      arrowLeft = left + cw - 6;
    } else if (pos === 'bottom') {
      top  = rect.bottom + pad + gap;
      left = rect.left + rect.width/2 - cw/2;
      if (top + ch > vh - 8) { top = rect.top - pad - ch - gap; }
      arrowLeft = left + cw/2 - 6;
      arrowTop  = top - 6;
    } else { // top
      top  = rect.top - pad - ch - gap;
      left = rect.left + rect.width/2 - cw/2;
      if (top < 8) { top = rect.bottom + pad + gap; }
      arrowLeft = left + cw/2 - 6;
      arrowTop  = top + ch - 6;
    }

    // Clamp
    left = Math.max(8, Math.min(left, vw - cw - 8));
    top  = Math.max(8, Math.min(top,  vh - ch - 8));

    card.style.left = left + 'px';
    card.style.top  = top  + 'px';

    if (arrowLeft > 8 && arrowLeft < vw - 8) {
      arr.style.display = 'block';
      arr.style.left = arrowLeft + 'px';
      arr.style.top  = arrowTop  + 'px';
    } else {
      arr.style.display = 'none';
    }
  }

  function centerCard(card) {
    const cw = card.offsetWidth  || 320;
    const ch = card.offsetHeight || 300;
    card.style.left = (window.innerWidth/2  - cw/2) + 'px';
    card.style.top  = (window.innerHeight/2 - ch/2) + 'px';
  }

  // Re-position on resize
  window.addEventListener('resize', () => {
    if (document.getElementById('tour-overlay').classList.contains('active')) renderStep();
  });

  // Escape key closes tour
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('tour-overlay').classList.contains('active')) skipTour();
  });

  // Clicking backdrop (not card) closes tour
  window._tourBackdropClick = function(e) {
    if (e.target === document.getElementById('tour-overlay') || e.target === document.getElementById('tour-spotlight')) skipTour();
  };

  // Hook into initApp
  const _origInitApp = window.initApp;
  window.initApp = function(user) {
    if (_origInitApp) _origInitApp(user);
    setTimeout(() => startTour(user.role, false), 3200); // after welcome splash
  };

  // Expose restart from settings
  window.restartTour = function() {
    const session = (typeof getSession === 'function') ? getSession() : null;
    if (!session) return;
    if (typeof showSettingsPage === 'function') showSettingsPage();
    startTour(session.role, true);
  };
})();
