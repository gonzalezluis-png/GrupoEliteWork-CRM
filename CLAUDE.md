# GrupoEliteWork-CRM

CRM de ventas para Grupo Elite Work. Gestión de leads por tableros (Florida, Dallas, Austin, etc.), usuarios/agentes, trash, créditos y calendario.

**URL producción:** https://lead.grupoelitework.com  
**Supabase:** vpwbczzmonboirjckpmy.supabase.co (tabla `kv_store`)  
**GitHub:** gonzalezluis-png/GrupoEliteWork-CRM (rama `backups` = respaldos horarios)

## Lo que NO pertenece a este proyecto
- Código que consuma APIs de `elite-reclutamiento-production.up.railway.app`
- Funcionalidades de webinar, entrevistas, Ana (IA), pipelines de reclutamiento
- Estadísticas de Meta/formularios de reclutamiento

Esas cosas pertenecen al proyecto **elite-reclutamiento** (`/Users/luisgonzalez/desarrollador/elite-reclutamiento`).

## Archivos clave
- `data.js` — `saveLeads`, `loadLeads`, lógica de persistencia
- `supabase.js` — `supaSync`, `initRealtimeSync`, `loadFromSupabase`
- `auth.js` — login, sesiones, usuarios
- `board.js` — tableros, configuración, settings tabs
- `calendar.js` — calendario, `logActivity`
- `index.html` — UI principal (un solo archivo HTML)
