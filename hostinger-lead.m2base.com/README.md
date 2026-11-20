# Copia esencial de lead.m2base.com (Hostinger, 20-nov-2026)

Versión del CRM Grupo Elite Work que corre en `lead.m2base.com` sobre Hostinger con MySQL
(en vez de Supabase). **No incluye leads, usuarios ni credenciales.**

## Qué hay
- `api.php`: API PHP (sesión, CSRF, lectura y escritura de `kv_store`, bitácora).
- `schema.sql`: tablas `kv_store`, `crm_users`, `crm_audit_log` (la API también las crea sola).
- `api/config.example.php`: plantilla de `api/config.php` con todos los valores vacíos.
- `index.html`, `styles.f64d2021.css`, `CNAME`: portada y estilos publicados.

## Qué NO se subió y por qué
- `api/config.php` (credenciales de MySQL y hash de la contraseña del master).
- `bundle.*.js`: llevan incrustado el hash de la contraseña del master. Se regeneran con
  `node build.mjs` desde el código fuente de la raíz de este repo.
- Datos: viven en MySQL (`kv_store`: `gew_users`, `gew_leads_*`…).

## Restaurar
1. Crear base MySQL y usuario en Hostinger; importar `schema.sql`.
2. Copiar `api/config.example.php` a `api/config.php` en el servidor y completarlo.
3. Generar los bundles (`node build.mjs`) y subir todo a `public_html/`.
