<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$configFile = __DIR__ . '/api/config.php';
if (!is_file($configFile)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Falta api/config.php']);
    exit;
}
$config = require $configFile;

session_name('gew_hostinger_session');
session_set_cookie_params([
    'httponly' => true,
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();

function out(array $body, int $status = 200): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function body(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function db(): PDO {
    static $pdo = null;
    global $config;
    if ($pdo instanceof PDO) return $pdo;
    if (str_contains((string)$config['db_name'], 'REPLACE_')) {
        out(['ok' => false, 'error' => 'Configura las credenciales MySQL de Hostinger en api/config.php'], 503);
    }
    try {
        $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=' . ($config['db_charset'] ?? 'utf8mb4');
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $pdo;
    } catch (Throwable $e) {
        out(['ok' => false, 'error' => 'No se pudo conectar a MySQL en Hostinger'], 503);
    }
}
function ensureSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS kv_store (`key` VARCHAR(190) NOT NULL PRIMARY KEY, `value` LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS crm_users (id VARCHAR(80) NOT NULL PRIMARY KEY, name VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, role VARCHAR(40) NOT NULL DEFAULT 'master', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS crm_audit_log (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(80) NULL, action_name VARCHAR(80) NOT NULL, details TEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_audit_created (created_at), INDEX idx_audit_user (user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    global $config;
    $m = $config['master'];
    $u = $pdo->prepare('INSERT INTO crm_users (id,name,email,role) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role)');
    $u->execute([$m['id'], $m['name'], $m['email'], $m['role']]);
    $seed = [
        'gew_users' => json_encode([['id'=>$m['id'],'name'=>$m['name'],'email'=>$m['email'],'role'=>'master','termsAccepted'=>true]], JSON_UNESCAPED_UNICODE),
        'gew_boards' => json_encode([['id'=>'dallas','name'=>'Leads Florida','icon'=>'🏙️','hasCaller'=>false,'hasSolicitudes'=>false,'ubicaciones'=>['Dallas']]], JSON_UNESCAPED_UNICODE),
        'gew_custom_boards' => '[]',
        'gew_board_order' => '["dallas"]',
        'gew_leads_dallas' => '[]',
        'gew_appname' => 'GRUPO ELITE WORK',
    ];
    $q = $pdo->prepare('INSERT IGNORE INTO kv_store (`key`,`value`) VALUES (?,?)');
    foreach ($seed as $k=>$v) $q->execute([$k, $v]);
}
function csrf(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}
function requireAuth(): void {
    if (empty($_SESSION['user'])) out(['ok'=>false,'error'=>'No autenticado'], 401);
}
function requireWriteProtection(): void {
    requireAuth();
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)$provided)) out(['ok'=>false,'error'=>'Token de seguridad inválido'], 419);
}
function audit(PDO $pdo, string $action, string $details = ''): void {
    $q = $pdo->prepare('INSERT INTO crm_audit_log (user_id,action_name,details) VALUES (?,?,?)');
    $q->execute([$_SESSION['user']['id'] ?? null, $action, $details]);
}
function kvRows(PDO $pdo): array {
    $rows = $pdo->query('SELECT `key`,`value` FROM kv_store ORDER BY `key`')->fetchAll();
    return array_map(fn($r) => ['key'=>(string)$r['key'], 'value'=>(string)$r['value']], $rows);
}

$pdo = db();
ensureSchema($pdo);
$action = $_GET['action'] ?? 'health';

if ($action === 'health') out(['ok'=>true,'service'=>'hostinger-mysql','authenticated'=>!empty($_SESSION['user'])]);

if ($action === 'login') {
    $input = body();
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $m = $config['master'];
    if ($email !== strtolower($m['email']) || !hash_equals($m['password_sha256'], hash('sha256', $password))) out(['ok'=>false,'error'=>'Email o contraseña incorrectos'], 401);
    session_regenerate_id(true);
    $_SESSION['user'] = ['id'=>$m['id'],'name'=>$m['name'],'email'=>$m['email'],'role'=>'master','termsAccepted'=>true];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    audit($pdo, 'login', 'Inicio de sesión');
    out(['ok'=>true,'user'=>$_SESSION['user'],'csrf'=>$_SESSION['csrf']]);
}
if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) setcookie(session_name(), '', time()-42000, '/');
    session_destroy();
    out(['ok'=>true]);
}
if ($action === 'bootstrap') {
    requireAuth();
    out(['ok'=>true,'user'=>$_SESSION['user'],'csrf'=>csrf(),'rows'=>kvRows($pdo)]);
}
if ($action === 'session') out(['ok'=>true,'authenticated'=>!empty($_SESSION['user']),'user'=>$_SESSION['user'] ?? null,'csrf'=>$_SESSION['csrf'] ?? null]);

if ($action === 'kv_all') { requireAuth(); out(['ok'=>true,'rows'=>kvRows($pdo),'csrf'=>csrf()]); }
if ($action === 'kv_get') {
    requireAuth();
    $key = (string)($_GET['key'] ?? '');
    $q = $pdo->prepare('SELECT `value` FROM kv_store WHERE `key`=?'); $q->execute([$key]);
    $row = $q->fetch(); out(['ok'=>true,'data'=>$row ? ['key'=>$key,'value'=>$row['value']] : null]);
}
if ($action === 'kv_set') {
    requireWriteProtection();
    $input = body(); $key = (string)($input['key'] ?? ''); $value = (string)($input['value'] ?? '');
    if (!preg_match('/^gew_[A-Za-z0-9_.:-]{1,180}$/', $key)) out(['ok'=>false,'error'=>'Clave no permitida'], 422);
    $q = $pdo->prepare('INSERT INTO kv_store (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)'); $q->execute([$key,$value]);
    audit($pdo, 'kv_set', $key); out(['ok'=>true]);
}
if ($action === 'kv_delete') {
    requireWriteProtection();
    $input = body(); $key = (string)($input['key'] ?? '');
    if (!preg_match('/^gew_[A-Za-z0-9_.:-]{1,180}$/', $key)) out(['ok'=>false,'error'=>'Clave no permitida'], 422);
    $q = $pdo->prepare('DELETE FROM kv_store WHERE `key`=?'); $q->execute([$key]); audit($pdo, 'kv_delete', $key); out(['ok'=>true]);
}
out(['ok'=>false,'error'=>'Acción no reconocida'], 404);
