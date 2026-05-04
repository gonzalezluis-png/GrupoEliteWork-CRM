(function() {
  const ROLE_LABELS = {
    master:            'Desarrollador',
    admin:             'Administrador',
    manager:           'GA',
    master_manager:    'MGA',
    supervisor_agent:  'SA',
    agent:             'Agente'
  };
  const ROLE_COLORS = {
    master:            { bg:'rgba(253,171,61,.15)', color:'#fdab3d', border:'rgba(253,171,61,.35)' },
    admin:             { bg:'rgba(0,115,234,.15)',  color:'#3b9eff', border:'rgba(0,115,234,.35)' },
    manager:           { bg:'rgba(0,200,117,.12)',  color:'#00c875', border:'rgba(0,200,117,.3)'  },
    master_manager:    { bg:'rgba(0,183,195,.12)',  color:'#00b7c3', border:'rgba(0,183,195,.3)'  },
    supervisor_agent:  { bg:'rgba(255,140,0,.12)',  color:'#ff8c00', border:'rgba(255,140,0,.3)'   },
    agent:             { bg:'rgba(120,75,209,.15)', color:'#a78bfa', border:'rgba(120,75,209,.35)' },
  };

  function spawnParticles() {
    const wrap = document.getElementById('wlc-particles');
    if (!wrap) return;
    const colors = ['#0073ea','#7c3aed','#00c875','#fdab3d','#00b7c3'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('div');
      p.className = 'wlc-particle';
      const size  = Math.random() * 5 + 2;
      const left  = Math.random() * 100;
      const delay = Math.random() * 3;
      const dur   = Math.random() * 3 + 3;
      const top   = 60 + Math.random() * 35;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${left}%; top:${top}%;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        animation-duration:${dur}s; animation-delay:${delay}s;
      `;
      wrap.appendChild(p);
    }
  }

  window.showWelcomeSplash = function(user) {
    const splash  = document.getElementById('welcome-splash');
    const orgName = (typeof loadAppName === 'function') ? loadAppName() : 'GRUPO ELITE WORK';
    const role    = user.role || 'agent';
    const label   = ROLE_LABELS[role] || role;
    const colors  = ROLE_COLORS[role] || ROLE_COLORS.agent;
    const initials= getInitials(user.name || user.email);
    const firstName = (user.name || '').split(' ')[0] || user.email;

    document.getElementById('wlc-org').textContent   = orgName;
    document.getElementById('wlc-avatar').textContent = initials;
    document.getElementById('wlc-greeting').textContent = 'Bienvenido de vuelta,';
    document.getElementById('wlc-name').textContent  = firstName;
    const badge = document.getElementById('wlc-role-badge');
    badge.textContent = label;
    badge.style.cssText = `background:${colors.bg};color:${colors.color};border:1px solid ${colors.border};font-size:11px;font-weight:700;padding:4px 16px;border-radius:20px;margin-bottom:32px`;

    splash.style.display = 'flex';
    spawnParticles();

    // progress bar fill over ~2.8s
    const bar = document.getElementById('wlc-bar-fill');
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(pct + 100 / 56, 100);
      bar.style.width = pct + '%';
      if (pct >= 100) clearInterval(tick);
    }, 50);

    // dismiss after 3s
    setTimeout(() => {
      const card = document.getElementById('wlc-card');
      if (card) card.classList.add('wlc-out');
      splash.classList.add('wlc-fade-out');
      setTimeout(() => {
        splash.style.display = 'none';
        splash.classList.remove('wlc-fade-out');
        if (card) card.classList.remove('wlc-out');
        const pw = document.getElementById('wlc-particles');
        if (pw) pw.innerHTML = '';
      }, 560);
    }, 3000);
  };
})();
