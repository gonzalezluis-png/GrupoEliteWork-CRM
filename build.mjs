import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync, cpSync, rmSync, readdirSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { createHash } from 'crypto';

const IS_VPS = process.argv.includes('--vps');

// JS files in execution order (init.js last — it calls everything)
const JS_FILES = [
  'store.js', 'data.js', 'table.js', 'calendar.js', 'stats.js', 'scripts.js',
  'import.js', 'referidos.js', 'ui-table-parts.js', 'ui-agents.js',
  'ui-modals.js', 'ui-dist.js', 'board.js', 'auth.js', 'zoom.js',
  'terms.js', 'notes-chat.js', 'conversations.js',
  'backup.js', 'supabase.js',
  'tos.js', 'roles.js', 'tour.js', 'hashnav.js', 'vault.js', 'diagnostic.js',
  'feedback.js',
  'init.js',
];

mkdirSync('dist', { recursive: true });

// Bundle JS
const combined = JS_FILES.map(f => {
  if (IS_VPS && f === 'supabase.js' && existsSync('supabase.vps.js')) {
    return readFileSync('supabase.vps.js', 'utf8');
  }
  return readFileSync(f, 'utf8');
}).join('\n;\n');
writeFileSync('dist/_temp.js', combined);

await build({
  entryPoints: ['dist/_temp.js'],
  outfile: 'dist/_bundle.js',
  minify: true,
  target: 'es2018',
  bundle: false,
});
unlinkSync('dist/_temp.js');

// Bundle CSS
await build({
  entryPoints: ['styles.css'],
  outfile: 'dist/_styles.css',
  minify: true,
});

// Generate content hashes for cache busting
const jsContent  = readFileSync('dist/_bundle.js');
const cssContent = readFileSync('dist/_styles.css');
const jsHash  = createHash('md5').update(jsContent).digest('hex').slice(0, 8);
const cssHash = createHash('md5').update(cssContent).digest('hex').slice(0, 8);

const jsFinal  = `bundle.${jsHash}.js`;
const cssFinal = `styles.${cssHash}.css`;

// Remove old hashed files
readdirSync('dist').forEach(f => {
  if ((f.startsWith('bundle.') && f.endsWith('.js')) ||
      (f.startsWith('styles.') && f.endsWith('.css'))) {
    rmSync(`dist/${f}`);
  }
});

// Write hashed files
writeFileSync(`dist/${jsFinal}`,  jsContent);
writeFileSync(`dist/${cssFinal}`, cssContent);
unlinkSync('dist/_bundle.js');
unlinkSync('dist/_styles.css');

// Build index.html
let html = readFileSync('index.html', 'utf8');

html = html.replace('<link rel="stylesheet" href="styles.css">', `<link rel="stylesheet" href="${cssFinal}">`);
html = html.replace(/<script defer src="(?!https?:\/\/).*?"><\/script>\n?/g, '');
html = html.replace(/<script src="(?!https?:\/\/)(?!https:\/\/).*?"><\/script>\n?/g, '');
html = html.replace('</body>', `<script defer src="${jsFinal}"></script>\n</body>`);

writeFileSync('dist/index.html', html);

try { cpSync('CNAME', 'dist/CNAME'); } catch {}

console.log(`✓ ${jsFinal}  ${(jsContent.length / 1024).toFixed(1)} KB`);
console.log(`✓ ${cssFinal}  ${(cssContent.length / 1024).toFixed(1)} KB`);
console.log('Build complete → dist/');
