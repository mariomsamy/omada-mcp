/**
 * Centralized redaction helpers for logging.
 *
 * All log-sanitization layers (HTTP request handler, MCP server, HTTP transport)
 * MUST use these primitives so that a field masked in one layer is masked in all
 * of them. Previously each layer carried its own copy with subtly different rules,
 * which meant a value could be redacted in one place and leak in another.
 */

/** Substrings (case-insensitive) that mark a key name as sensitive. */
const SENSITIVE_KEY_SUBSTRINGS = [
    'authorization',
    'token',
    'secret',
    'password',
    'cookie',
    'clientid',
    'client-id',
    'client_id',
    'customheaders',
    'privatekey',
    'private_key',
    'presharedkey',
    'securitykey',
    'passphrase',
    'community',
    'authcode',
] as const;

/**
 * Generic secret-ish fragments. Any key containing one of these (after the benign words below
 * are removed) is treated as a secret: radiusPwd, accountingServerPwd, md5Key, simpleKey,
 * pinCode, newPinCode, remoteAccessPin, wpaPsk, snmpCommunity, ...
 */
const SENSITIVE_KEY_PATTERN = /(pwd|pass|pin|key|secret|token|psk|community)/;

/**
 * Words that contain a sensitive fragment but are not secrets ("mapping" contains "pin",
 * "bypass" contains "pass", "keyword" contains "key"). They are removed before the pattern
 * test so that ordinary configuration fields stay readable.
 */
const BENIGN_KEY_FRAGMENTS =
    /(ping|passive|bypass|passthrough|passpoint|compass|keyword|keyid|keyname|keytype|keyindex|publickey|searchkey|sortkey|monkey|hotkey|keepalive)/g;

/**
 * Check if a key name indicates sensitive data.
 */
export function isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    if (SENSITIVE_KEY_SUBSTRINGS.some((substring) => normalized.includes(substring))) return true;
    return SENSITIVE_KEY_PATTERN.test(normalized.replace(BENIGN_KEY_FRAGMENTS, ''));
}

/**
 * Collections whose entries carry a non-secret `key`: the log/audit notification type identifier
 * (LogNotificationOpenApiVO, LogNotificationEditOpenApi[V2]VO, AuditLogNotification*OpenApiVO in
 * docs/openapi/10-log.json). Compared lower-case.
 */
const NON_SECRET_KEY_PARENTS = new Set(['lognotifications', 'alertnotifications', 'eventnotifications', 'auditlognotifications']);

/**
 * A bare `key` is an event-type identifier (not a secret) inside notification collections and in
 * event/alert log entries (EventLogOpenApiVO / AlertLogOpenApiVO: `id`, `key`, `module`, `content`,
 * `time`). Everywhere else (for example `OswVrrpOpenApiVO.key`, a VRRP authentication key) it stays masked.
 */
function isEventTypeKey(parentKey: string | undefined, siblings: Record<string, unknown> | undefined): boolean {
    if (parentKey !== undefined && NON_SECRET_KEY_PARENTS.has(parentKey.toLowerCase())) return true;
    return siblings !== undefined && 'module' in siblings && 'content' in siblings && 'time' in siblings;
}

/**
 * Field-aware variant of {@link isSensitiveKey}: `parentKey` is the name of the property that holds
 * the object (or the array of objects) and `siblings` is the object itself. Use this from every
 * recursive redactor so that the scoping rules stay identical across log and result layers.
 */
export function isSensitiveField(key: string, parentKey?: string, siblings?: Record<string, unknown>): boolean {
    if (key.toLowerCase() === 'key' && isEventTypeKey(parentKey, siblings)) return false;
    return isSensitiveKey(key);
}

/**
 * Heuristic for free-form strings that look like a credential/token even when the
 * surrounding key name gives no hint (e.g. a bare token in an array).
 */
export function isLikelySensitiveString(value: string): boolean {
    return value.length > 16 && /[A-Za-z0-9+/=._-]{16,}/.test(value);
}

/**
 * Mask a sensitive value for logging.
 */
export function maskValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return '********';
    }

    if (Array.isArray(value)) {
        return value.map(() => '********');
    }

    if (typeof value === 'object' && value !== null) {
        return '[masked-object]';
    }

    return '********';
}

/** Redact named secrets in tool results without hiding ordinary identifiers. */
export function redactSecrets(value: unknown, parentKey?: string): unknown {
    if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, parentKey));
    if (value === null || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
        Object.entries(record).map(([key, entry]) => [key, isSensitiveField(key, parentKey, record) ? maskValue(entry) : redactSecrets(entry, key)])
    );
}

/**
 * Redact `key=value`, `key: value` and `"key":"value"` pairs whose key is sensitive inside a
 * free-text string such as an error message or a controller `msg`. Ordinary text is kept.
 */
export function redactSecretsInText(text: string): string {
    return text.replace(
        /("?)([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;&}\]]+)/g,
        (match, quote: string, key: string, separator: string) => (isSensitiveKey(key) ? `${quote}${key}${quote}${separator}"********"` : match)
    );
}

const MAC_IN_TEXT = /\b[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}\b/g;
const IPV4_IN_TEXT = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_IN_TEXT = /\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b|\b(?:[0-9A-Fa-f]{1,4}:){1,7}:(?:[0-9A-Fa-f]{1,4}\b)?/g;

/**
 * Replace client-identifying network addresses (MAC, IPv4, IPv6) in free text such as a request
 * URL with placeholders. Used for info-level logs, which may be retained longer than debug logs.
 */
export function scrubPersonalData(text: string): string {
    return text.replace(MAC_IN_TEXT, '[mac]').replace(IPV4_IN_TEXT, '[ip]').replace(IPV6_IN_TEXT, '[ip]');
}

/** Deep variant of {@link scrubPersonalData} for log field values (strings anywhere in the structure). */
export function scrubPersonalDataDeep(value: unknown): unknown {
    if (typeof value === 'string') return scrubPersonalData(value);
    if (Array.isArray(value)) return value.map(scrubPersonalDataDeep);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, scrubPersonalDataDeep(entry)]));
}
