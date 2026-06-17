<?php
// CRM API — PostgreSQL backend (kv_store) + Supabase leads table (versioned)
// Credentials loaded from crm-api-config.php (gitignored — never commit that file)
if (file_exists(__DIR__ . '/crm-api-config.php')) {
    require_once __DIR__ . '/crm-api-config.php';
} else {
    // Fallback: define via environment variables on the server
    define('AUTH_TOKEN',      getenv('CRM_AUTH_TOKEN')      ?: '');
    define('DB_DSN',          getenv('CRM_DB_DSN')          ?: '');
    define('DB_USER',         getenv('CRM_DB_USER')         ?: '');
    define('DB_PASS',         getenv('CRM_DB_PASS')         ?: '');
    define('SUPA_URL',        getenv('CRM_SUPA_URL')        ?: '');
    define('SUPA_SERVICE_KEY',getenv('CRM_SUPA_SERVICE_KEY')?:  '');
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CRM-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$action = $_GET['action'] ?? '';

function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(DB_DSN, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function checkAuth(): void {
    $token = $_SERVER['HTTP_X_CRM_TOKEN'] ?? '';
    if ($token !== AUTH_TOKEN) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
        exit;
    }
}

function jsonResponse(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Supabase REST helper ──────────────────────────────────────────────────
function supaRequest(string $path, string $method = 'GET', mixed $body = null, array $extra = []): array {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => SUPA_URL . '/rest/v1/' . $path,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => array_merge([
            'apikey: '       . SUPA_SERVICE_KEY,
            'Authorization: Bearer ' . SUPA_SERVICE_KEY,
            'Content-Type: application/json',
        ], $extra),
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'data' => json_decode($resp, true)];
}

try {
    switch ($action) {

        // ── KV store (non-lead data) ─────────────────────────────────────
        case 'load_all': {
            $pdo  = getDB();
            $stmt = $pdo->query('SELECT key, value FROM kv_store ORDER BY key');
            $rows = $stmt->fetchAll();
            jsonResponse(['ok' => true, 'data' => $rows]);
        }

        case 'upsert': {
            checkAuth();
            $body  = json_decode(file_get_contents('php://input'), true);
            $key   = $body['key']   ?? null;
            $value = $body['value'] ?? null;
            if ($key === null) jsonResponse(['ok' => false, 'error' => 'Missing key'], 400);
            $pdo  = getDB();
            $stmt = $pdo->prepare(
                'INSERT INTO kv_store (key, value, updated_at) VALUES (:key, :value, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()'
            );
            $stmt->execute([':key' => $key, ':value' => $value]);
            jsonResponse(['ok' => true]);
        }

        case 'delete': {
            checkAuth();
            $body = json_decode(file_get_contents('php://input'), true);
            $key  = $body['key'] ?? null;
            if ($key === null) jsonResponse(['ok' => false, 'error' => 'Missing key'], 400);
            $pdo  = getDB();
            $stmt = $pdo->prepare('DELETE FROM kv_store WHERE key = :key');
            $stmt->execute([':key' => $key]);
            jsonResponse(['ok' => true]);
        }

        case 'load_since': {
            $pdo = getDB();
            $ts  = isset($_GET['ts']) && is_numeric($_GET['ts']) ? intval($_GET['ts']) : 0;
            if ($ts > 0) {
                $dt   = date('Y-m-d H:i:s', intval($ts / 1000));
                $stmt = $pdo->prepare('SELECT key, value FROM kv_store WHERE updated_at > :dt ORDER BY updated_at');
                $stmt->execute([':dt' => $dt]);
            } else {
                $stmt = $pdo->query('SELECT key, value FROM kv_store ORDER BY key');
            }
            jsonResponse(['ok' => true, 'data' => $stmt->fetchAll()]);
        }

        // ── Leads table (versioned) ──────────────────────────────────────
        case 'upsert_lead': {
            checkAuth();
            $body = json_decode(file_get_contents('php://input'), true);
            $lead = $body['lead'] ?? null;
            if (!$lead || empty($lead['id'])) jsonResponse(['ok' => false, 'error' => 'Missing lead.id'], 400);

            $id          = $lead['id'];
            $incomingTs  = $lead['_updatedAt'] ?? null;
            $isDeleted   = !empty($lead['_deleted']);

            // Get current version + updated_at
            $res     = supaRequest("leads?id=eq.$id&select=id,version,updated_at");
            $current = $res['data'][0] ?? null;

            // Conflict check: reject if incoming timestamp is strictly older
            if ($current && $incomingTs) {
                $currentTs = $current['updated_at'];
                // Both are ISO 8601 — string comparison works
                if ($incomingTs < $currentTs) {
                    $full = supaRequest("leads?id=eq.$id&select=*");
                    jsonResponse([
                        'ok'       => false,
                        'conflict' => true,
                        'current'  => $full['data'][0] ?? null,
                    ], 409);
                }
            }

            $newVersion = ($current['version'] ?? 0) + 1;

            $row = [
                'id'          => $id,
                'board_id'    => $lead['_boardId']    ?? '',
                'assigned_to' => $lead['asignado']    ?? '',
                'assigned_id' => $lead['asignadoId']  ?? '',
                'full_name'   => $lead['nombre']      ?? '',
                'phone'       => $lead['telefono']    ?? '',
                'email'       => $lead['email']       ?? '',
                'resultado'   => $lead['resultado']   ?? '',
                'deleted'     => $isDeleted,
                'version'     => $newVersion,
                'data'        => $lead,
                'updated_at'  => $incomingTs ?? date('c'),
            ];

            $res = supaRequest(
                'leads?on_conflict=id',
                'POST',
                $row,
                ['Prefer: resolution=merge-duplicates,return=minimal']
            );

            if ($res['code'] >= 200 && $res['code'] < 300) {
                jsonResponse(['ok' => true, 'version' => $newVersion]);
            } else {
                jsonResponse(['ok' => false, 'error' => json_encode($res['data'])], 500);
            }
        }

        case 'delete_lead': {
            checkAuth();
            $body = json_decode(file_get_contents('php://input'), true);
            $id   = $body['id'] ?? null;
            if (!$id) jsonResponse(['ok' => false, 'error' => 'Missing id'], 400);

            $res = supaRequest(
                "leads?id=eq.$id",
                'PATCH',
                ['deleted' => true, 'updated_at' => date('c')]
            );

            jsonResponse($res['code'] >= 200 && $res['code'] < 300
                ? ['ok' => true]
                : ['ok' => false, 'error' => json_encode($res['data'])],
                $res['code'] >= 200 && $res['code'] < 300 ? 200 : 500
            );
        }

        default:
            jsonResponse(['ok' => false, 'error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
