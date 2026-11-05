import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import type { EnvironmentConfig, OmadaConnectionConfig } from '../config.js';
import { normalizePath, resolvePort } from '../utils/config-validations.js';
import { logger } from '../utils/logger.js';
import { isLikelySensitiveString, isSensitiveField, isSensitiveKey, maskValue } from '../utils/redact.js';
import type { StreamTransportState } from './stream.js';
import { closeAllStreamSessions, handleStreamRequest } from './stream.js';

const DEFAULT_PORT = 3000;
const HEALTH_PATH = '/healthz';
/** Request bodies above this size are refused with 413 before they are buffered. */
export const MAX_HTTP_BODY_BYTES = 1024 * 1024;

/** Constant-time bearer token comparison (hashing first removes the length side channel). */
function bearerTokenMatches(header: string | string[] | undefined, expected: string): boolean {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !expected) return false;
    const match = /^Bearer\s+(.+)$/i.exec(value.trim());
    if (!match?.[1]) return false;
    const provided = createHash('sha256').update(match[1], 'utf8').digest();
    const wanted = createHash('sha256').update(expected, 'utf8').digest();
    return timingSafeEqual(provided, wanted);
}

/** Host header values accepted for the loopback-only lab transport (DNS-rebinding defence). */
function allowedHostHeaders(port: number, bindHost: string): Set<string> {
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
    if (bindHost !== '0.0.0.0' && bindHost !== '::') hosts.add(bindHost.includes(':') ? `[${bindHost}]:${port}` : `${bindHost}:${port}`);
    return hosts;
}

function originAllowed(origin: string, allowedOrigins: readonly string[] | undefined): boolean {
    const allowed = allowedOrigins ?? ['127.0.0.1', 'localhost'];
    if (allowed.includes(origin)) return true;
    try {
        const parsed = new URL(origin);
        return allowed.includes(parsed.hostname) || allowed.includes(parsed.hostname.replace(/^\[|\]$/g, ''));
    } catch {
        return false;
    }
}

/**
 * Pre-body request guards for the lab-only HTTP transport: Host allowlist, Origin allowlist,
 * bearer token (constant time) and declared body size. Returns a rejection or undefined.
 */
export function checkHttpRequestGuards(
    req: IncomingMessage,
    options: { port: number; bindHost: string; bearerToken?: string; allowedOrigins?: readonly string[]; requireAuth?: boolean }
): { status: number; error: string } | undefined {
    const hostHeader = req.headers.host?.toLowerCase();
    if (!hostHeader || !allowedHostHeaders(options.port, options.bindHost).has(hostHeader)) {
        return { status: 403, error: 'Host not allowed.' };
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !originAllowed(origin, options.allowedOrigins)) {
        return { status: 403, error: 'Origin not allowed.' };
    }
    if (options.requireAuth !== false && !bearerTokenMatches(req.headers.authorization, options.bearerToken ?? '')) {
        return { status: 401, error: 'Unauthorized.' };
    }
    const declaredLength = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTTP_BODY_BYTES) {
        return { status: 413, error: 'Request body too large.' };
    }
    return undefined;
}

/** Read a request body, refusing (undefined) once it exceeds {@link MAX_HTTP_BODY_BYTES}. */
function readBodyWithLimit(req: IncomingMessage): Promise<Buffer | undefined> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let exceeded = false;
        req.on('data', (chunk: Buffer | string) => {
            if (exceeded) return;
            const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
            size += bufferChunk.length;
            if (size > MAX_HTTP_BODY_BYTES) {
                exceeded = true;
                chunks.length = 0;
                resolve(undefined);
                return;
            }
            chunks.push(bufferChunk);
        });
        req.on('end', () => {
            if (!exceeded) resolve(Buffer.concat(chunks));
        });
        req.on('error', () => {
            if (!exceeded) resolve(Buffer.concat(chunks));
        });
    });
}

type ShutdownHandler = () => Promise<void>;

function getRequestUrl(req: IncomingMessage, fallbackPort: number): URL | undefined {
    if (!req.url) {
        return undefined;
    }

    const host = req.headers.host ?? `localhost:${fallbackPort}`;
    try {
        return new URL(req.url, `http://${host}`);
    } catch {
        return undefined;
    }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        ...extraHeaders,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) {
            continue;
        }

        if (Array.isArray(value)) {
            sanitized[key] = value.map((entry) => sanitizeHeaderValue(key, entry));
        } else {
            sanitized[key] = sanitizeHeaderValue(key, value);
        }
    }

    return sanitized;
}

function sanitizeHeaderValue(key: string, value: string): string {
    const sanitized = isSensitiveKey(key) ? maskValue(value) : value;
    return typeof sanitized === 'string' ? sanitized : String(sanitized);
}

function sanitizePayload(payload: unknown, parentKey?: string): unknown {
    if (payload === null || payload === undefined) {
        return payload;
    }

    if (typeof payload === 'string') {
        return isLikelySensitiveString(payload) ? maskValue(payload) : payload;
    }

    if (Array.isArray(payload)) {
        return payload.map((entry) => sanitizePayload(entry, parentKey));
    }

    if (typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            sanitized[key] = isSensitiveField(key, parentKey, record) ? maskValue(value) : sanitizePayload(value, key);
        }
        return sanitized;
    }

    return payload;
}

async function createShutdownHandler(signal: NodeJS.Signals, closeHttp: () => Promise<void>, closeSessions: () => Promise<void>): Promise<void> {
    logger.warn('Received shutdown signal', { signal });

    try {
        await closeSessions();
    } catch (error) {
        logger.error('Error closing MCP sessions', { error });
    }

    try {
        await closeHttp();
    } catch (error) {
        logger.error('Error closing HTTP server', { error });
    }
}

/**
 * Starts the HTTP server with the Streamable HTTP transport.
 * Omada credentials come exclusively from environment variables; they are never
 * accepted as request headers or tool arguments (see the security model in CLAUDE.md).
 */
export async function startHttpServer(config: EnvironmentConfig): Promise<void> {
    const transport = config.httpTransport;
    logger.info('Starting HTTP server', { transport });
    logger.warn('HTTP transport is unsupported for the safe baseline and should only be used in isolated lab environments.');

    const omadaConfig: OmadaConnectionConfig = {
        baseUrl: config.baseUrl,
        clientId: config.clientId as string,
        clientSecret: config.clientSecret as string,
        omadacId: config.omadacId as string,
        siteId: config.siteId,
        strictSsl: config.strictSsl,
        caFile: config.caFile,
        requestTimeout: config.requestTimeout,
    };

    const port = resolvePort(config.httpPort, DEFAULT_PORT);
    const host = config.httpBindAddr ?? '127.0.0.1';
    const endpointPath = normalizePath(config.httpPath ?? '/mcp');

    const streamSessions = new Map<string, StreamTransportState>();

    const httpServer = http.createServer((req, res) => {
        void (async () => {
            const url = getRequestUrl(req, port);
            if (!url) {
                logger.warn('HTTP request rejected', {
                    reason: 'invalid-url',
                    method: req.method,
                    url: req.url,
                });
                sendJson(res, 400, { error: 'Invalid request URL.' });
                return;
            }

            logger.debug('HTTP request headers', {
                method: req.method,
                path: url.pathname,
                headers: sanitizeHeaders(req.headers),
            });

            logger.info('HTTP request received', {
                method: req.method,
                path: url.pathname,
                query: url.search,
                sessionId: req.headers['mcp-session-id'] ?? undefined,
            });

            // Health check endpoint (no credentials, no body); still subject to the Host allowlist.
            const isHealthcheck = config.httpEnableHealthcheck && url.pathname === (config.httpHealthcheckPath ?? HEALTH_PATH);
            const rejection = checkHttpRequestGuards(req, {
                port,
                bindHost: host,
                bearerToken: config.httpBearerToken,
                allowedOrigins: config.httpAllowedOrigins,
                requireAuth: !isHealthcheck,
            });
            if (rejection) {
                logger.warn('HTTP request rejected', { reason: rejection.error, method: req.method, path: url.pathname });
                sendJson(res, rejection.status, { error: rejection.error }, rejection.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});
                req.resume?.();
                return;
            }

            if (isHealthcheck) {
                logger.debug('Health check request served');
                sendJson(res, 200, { status: 'ok' });
                return;
            }

            const shouldCaptureBody = (req.method ?? 'GET').toUpperCase() !== 'GET';
            let body: Buffer | undefined = Buffer.alloc(0);
            if (shouldCaptureBody) {
                body = await readBodyWithLimit(req);
                if (body === undefined) {
                    logger.warn('HTTP request rejected', { reason: 'body-too-large', method: req.method, path: url.pathname });
                    sendJson(res, 413, { error: 'Request body too large.' });
                    return;
                }
            }

            let parsedBody: unknown = null;
            if (shouldCaptureBody && body.length > 0) {
                const rawBody = body.toString('utf8');
                if (rawBody.length > 0) {
                    try {
                        parsedBody = JSON.parse(rawBody);
                    } catch {
                        parsedBody = rawBody;
                    }

                    logger.debug('HTTP request body', {
                        method: req.method,
                        path: url.pathname,
                        length: rawBody.length,
                        body: sanitizePayload(parsedBody),
                    });
                }
            }

            try {
                // Streamable HTTP Transport handling
                if (url.pathname === endpointPath) {
                    await handleStreamRequest(config, omadaConfig, req, res, parsedBody, streamSessions);
                } else {
                    sendJson(res, 404, { error: 'Not Found' });
                }

                logger.info('MCP request handled successfully', {
                    path: url.pathname,
                    method: req.method,
                });
            } catch (error) {
                logger.error('Failed to handle MCP HTTP request', { error });
                if (!res.headersSent) {
                    sendJson(res, 500, {
                        jsonrpc: '2.0',
                        error: { code: -32000, message: 'Internal server error' },
                        id: null,
                    });
                } else {
                    res.end();
                }
            }
        })();
    });

    httpServer.on('clientError', (error, socket) => {
        logger.error('HTTP client error', { error });
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    await new Promise<void>((resolve) => {
        httpServer.listen(port, host, () => {
            const displayHost = host === '0.0.0.0' ? 'localhost' : host;
            logger.info('HTTP server listening', {
                endpoint: `http://${displayHost}:${port}${endpointPath}`,
                transport,
            });
            if (config.httpEnableHealthcheck) {
                logger.info('HTTP health check available', {
                    endpoint: `http://${displayHost}:${port}${config.httpHealthcheckPath ?? HEALTH_PATH}`,
                });
            }
            logger.info('HTTP server ready');
            resolve();
        });
    });

    if (config.httpNgrokEnabled) {
        logger.warn('MCP_HTTP_NGROK_ENABLED is ignored in the safe baseline. Public tunnel support is intentionally disabled.');
    }

    let shuttingDown: boolean = false;
    const closeHttp: ShutdownHandler = () =>
        new Promise((resolve) => {
            httpServer.close(() => resolve());
        });
    const closeSessions: ShutdownHandler = async () => {
        await closeAllStreamSessions(streamSessions);
    };

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            if (!shuttingDown) {
                shuttingDown = true;
                void createShutdownHandler(signal, closeHttp, closeSessions);
            }
        });
    }
}

export {
    createShutdownHandler,
    getRequestUrl,
    isLikelySensitiveString,
    isSensitiveKey,
    maskValue,
    sanitizeHeaders,
    sanitizeHeaderValue,
    sanitizePayload,
    sendJson,
};
