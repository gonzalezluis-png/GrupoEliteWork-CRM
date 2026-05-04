import { build } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync, cpSync } from 'fs';
import { mkdirSync } from 'fs';

// JS files in execution order (init.js last — it calls everything)
const JS_FILES = [
  'data.js', 'table.js', 'calendar.js', 'stats.js', 'scripts.js',
  'import.js', 'referidos.js', 'ui-table-parts.js', 'ui-agents.js',
  'ui-modals.js', 'ui-dist.js', 'board.js', 'auth.js', 'zoom.js',
  'terms.js', 'notes-chat.js', 'conversations.js', 'credits.js',
  'backup.js', 'supabase.js',
  'tos.js', 'roles.js', 'tour.js', 'hashnav.js', 'vault.js', 'diagnostic.js',
  'init.js',
];

mkdirSync('dist', { recursive: true });

// Bundle JS
const combined = JS_FILES.map(f => readFileSync(f, 'utf8')).join('\n;\n');
writeFileSync('dist/_temp.js', combined);

await build({
  entryPoints: ['dist/_temp.js'],
  outfile: 'dist/bundle.min.js',
  minify: true,
  target: 'es2018',
  bundle: false,
});

unlinkSync('dist/_temp.js');

// Bundle CSS
await build({
  entryPoints: ['styles.css'],
  outfile: 'dist/styles.min.css',
  minify: true,
});

// Build index.html — replace script/link tags
let html = readFileSync('index.html', 'utf8');

// Replace individual CSS link
html = html.replace(
  '<link rel="stylesheet" href="styles.css">',
  '<link rel="stylesheet" href="styles.min.css">'
);

// Replace all local <script defer src="..."> and <script src="..."> with single bundle
html = html.replace(
  /<script defer src="(?!https?:\/\/).*?"><\/script>\n?/g, ''
);
html = html.replace(
  /<script src="(?!https?:\/\/)(?!https:\/\/).*?"><\/script>\n?/g, ''
);

// Insert bundle before </body>
html = html.replace('</body>', '<script defer src="bundle.min.js"></script>\n</body>');

writeFileSync('dist/index.html', html);

// Copy CNAME for custom domain
try { cpSync('CNAME', 'dist/CNAME'); } catch {}

const size = (readFileSync('dist/bundle.min.js').length / 1024).toFixed(1);
const cssSize = (readFileSync('dist/styles.min.css').length / 1024).toFixed(1);
console.log(`✓ bundle.min.js  ${size} KB`);
console.log(`✓ styles.min.css ${cssSize} KB`);
console.log('Build complete → dist/');
