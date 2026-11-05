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
export function redactSecrets(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactSecrets);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, isSensitiveKey(key) ? maskValue(entry) : redactSecrets(entry)]));
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
