import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { EnvironmentConfig, OmadaConnectionConfig } from '../config.js';
import { OmadaClient } from '../omadaClient/index.js';
import { registerAllTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { createServer } from './common.js';

export interface StreamTransportState {
    transport: StreamableHTTPServerTransport;
    server: ReturnType<typeof createServer>;
    connected: boolean;
    closed: boolean;
    lastAccessed: number;
}

type StreamSessionMap = Map<string, StreamTransportState>;

/** Upper bound on concurrent HTTP sessions; each one holds an MCP server and a controller login. */
export const MAX_STREAM_SESSIONS = 16;
/** Sessions idle for longer than this are closed before a new session is admitted. */
export const STREAM_SESSION_IDLE_MS = 30 * 60 * 1000;

function containsInitializeRequest(body: unknown): boolean {
    return Array.isArray(body) ? body.some((message) => isInitializeRequest(message)) : isInitializeRequest(body);
}

/** Close sessions idle for longer than {@link STREAM_SESSION_IDLE_MS}. */
export async function evictIdleStreamSessions(sessions: StreamSessionMap, now: number = Date.now()): Promise<number> {
    let evicted = 0;
    for (const [sessionId, state] of sessions.entries()) {
        if (now - state.lastAccessed > STREAM_SESSION_IDLE_MS) {
            sessions.delete(sessionId);
            await closeTransport(state, sessionId);
            evicted += 1;
            logger.info('Evicted idle Streamable HTTP session', { sessionId });
        }
    }
    return evicted;
}

interface StreamLifecycleHooks {
    onSessionInitialized?: (sessionId: string) => void;
    onSessionClosed?: (sessionId: string) => void;
}

function respondWithJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

async function connectSession(state: StreamTransportState): Promise<void> {
    if (state.connected || state.closed) {
        return;
    }

    if (typeof state.server.connect === 'function') {
        await state.server.connect(state.transport);
        state.connected = true;
    }
}

async function closeTransport(state: StreamTransportState, sessionId?: string): Promise<void> {
    if (state.closed) {
        return;
    }

    state.closed = true;
    state.connected = false;

    try {
        if (typeof state.server.close === 'function') {
            await state.server.close();
        }
    } catch (error) {
        logger.error('Failed to close Streamable HTTP server', { error, sessionId });
    }

    try {
        if (typeof state.transport.close === 'function') {
            await state.transport.close();
        }
    } catch (error) {
        logger.error('Failed to close Streamable HTTP transport', { error, sessionId });
    }
}

function getSessionIdFromHeaders(req: IncomingMessage): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (Array.isArray(header)) {
        return header[0];
    }
    return header;
}

/**
 * Creates a Streamable HTTP transport
 * This implements the MCP protocol version 2025-03-26
 */
export function createStreamTransport(client: OmadaClient, config: EnvironmentConfig, hooks?: StreamLifecycleHooks): StreamTransportState {
    const mcpServer = createServer();
    registerAllTools(mcpServer, client, config.toolCategories, config);

    logger.info('Starting Streamable HTTP transport; Mcp-Session-Id headers are optional in client-credentials mode');
    logger.warn('HTTP transport is running in explicitly unsafe mode. The supported production baseline remains stdio only.');

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        allowedOrigins: config.httpAllowedOrigins,
        enableDnsRebindingProtection: true,
        onsessioninitialized: (sessionId: string) => {
            logger.info('Session initialized', { sessionId });
            hooks?.onSessionInitialized?.(sessionId);
        },
        onsessionclosed: (sessionId: string) => {
            logger.info('Session closed', { sessionId });
            hooks?.onSessionClosed?.(sessionId);
        },
    });

    transport.onerror = (error: Error) => {
        logger.error('Streamable HTTP transport error', {
            error,
            message: error.message,
        });
    };

    return {
        transport,
        server: mcpServer,
        connected: false,
        closed: false,
        lastAccessed: Date.now(),
    };
}

/**
 * Handles incoming Streamable HTTP requests (GET, POST, DELETE) using persistent session state.
 * New sessions build an OmadaClient from environment-supplied credentials only; request headers
 * are never used as a credential source. Existing sessions reuse the client created at init time.
 */
export async function handleStreamRequest(
    config: EnvironmentConfig,
    omadaConfig: OmadaConnectionConfig,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown = undefined,
    sessions: StreamSessionMap
): Promise<void> {
    const originHeader = req.headers.origin;
    const hostHeader = req.headers.host;
    const headerSessionId = getSessionIdFromHeaders(req);

    logger.info('Streamable HTTP request received', {
        method: req.method,
        url: req.url,
        sessionId: headerSessionId ?? undefined,
        origin: originHeader ?? '(not set)',
        host: hostHeader ?? '(not set)',
    });

    let state: StreamTransportState | undefined = headerSessionId ? sessions.get(headerSessionId) : undefined;

    if (headerSessionId && !state) {
        logger.warn('Stream session not found', { sessionId: headerSessionId, method: req.method, url: req.url });
        respondWithJson(res, 404, { error: 'Stream session not found', jsonrpc: '2.0', id: null });
        return;
    }

    const isNewSession = !state;
    if (!state) {
        // Only an initialize request may create a session; anything else would build a server and a
        // controller client that is never registered or reused.
        if (req.method?.toUpperCase() !== 'POST' || !containsInitializeRequest(parsedBody)) {
            respondWithJson(res, 400, {
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required for non-initialize requests.' },
                id: null,
            });
            return;
        }
        await evictIdleStreamSessions(sessions);
        if (sessions.size >= MAX_STREAM_SESSIONS) {
            logger.warn('Stream session limit reached', { limit: MAX_STREAM_SESSIONS });
            respondWithJson(res, 503, { jsonrpc: '2.0', error: { code: -32000, message: 'Too many active sessions.' }, id: null });
            return;
        }
        const client = new OmadaClient(omadaConfig);

        let pendingState: StreamTransportState;
        const lifecycleHooks: StreamLifecycleHooks = {
            onSessionInitialized: (sessionId: string) => {
                sessions.set(sessionId, pendingState);
                logger.debug('Registered Streamable HTTP session', { sessionId });
            },
            onSessionClosed: (sessionId: string) => {
                sessions.delete(sessionId);
                void closeTransport(pendingState, sessionId);
            },
        };
        pendingState = createStreamTransport(client, config, lifecycleHooks);
        state = pendingState;
        await connectSession(state);
    }

    state.lastAccessed = Date.now();

    try {
        await state.transport.handleRequest(req, res, parsedBody);

        logger.debug('Streamable HTTP request handled', {
            method: req.method,
            sessionId: headerSessionId ?? (isNewSession ? '(new-session)' : undefined),
        });
    } catch (error) {
        logger.error('Failed to handle Streamable HTTP request', {
            error,
            method: req.method,
            url: req.url,
            origin: originHeader ?? '(not set)',
            host: hostHeader ?? '(not set)',
            allowedOrigins: config.httpAllowedOrigins,
        });
        throw error;
    }
}

export async function closeAllStreamSessions(sessions: StreamSessionMap): Promise<void> {
    for (const [sessionId, state] of sessions.entries()) {
        await closeTransport(state, sessionId);
        sessions.delete(sessionId);
        logger.info('Closed Streamable HTTP session', { sessionId });
    }
}
