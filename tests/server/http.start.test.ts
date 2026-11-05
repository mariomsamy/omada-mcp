import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvironmentConfig } from '../../src/config.js';

type ProcessOnArgs = Parameters<typeof process.on>;

const httpModule = vi.hoisted(() => {
    const eventHandlers = new Map<string, (...args: unknown[]) => void>();
    const server = {
        listen: vi.fn((port: number, host: string, callback: () => void) => {
            callback();
        }),
        close: vi.fn((callback?: () => void) => {
            callback?.();
        }),
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
            eventHandlers.set(event, callback);
            return server;
        }),
    };
    const emit = (event: string, ...args: unknown[]) => {
        eventHandlers.get(event)?.(...args);
    };
    let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
    return {
        server,
        emit,
        setHandler(fn: (req: unknown, res: unknown) => Promise<void>) {
            handler = fn;
        },
        getHandler() {
            return handler;
        },
        createServer: vi.fn((fn: (req: unknown, res: unknown) => Promise<void>) => {
            handler = fn;
            return server;
        }),
    };
});

const loggerModule = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

const ngrokModule = vi.hoisted(() => ({
    forward: vi.fn(async () => ({ url: () => 'https://example.ngrok.dev' })),
}));

const streamModule = vi.hoisted(() => {
    return {
        handleStreamRequest: vi.fn(async () => undefined),
        closeAllStreamSessions: vi.fn(async () => undefined),
    };
});

vi.mock('node:http', () => ({ default: { createServer: httpModule.createServer }, createServer: httpModule.createServer }));
vi.mock('@ngrok/ngrok', () => ({ default: ngrokModule, ...ngrokModule }));
vi.mock('../../src/server/stream.js', () => ({
    handleStreamRequest: streamModule.handleStreamRequest,
    closeAllStreamSessions: streamModule.closeAllStreamSessions,
}));
vi.mock('../../src/utils/logger.js', () => ({ logger: loggerModule }));

const TEST_TOKEN = 'test-bearer-token-0123456789abcdef0123456789';

class MockRequest extends EventEmitter {
    method?: string;
    url?: string;
    headers: Record<string, string | string[]>;

    constructor(init: { method?: string; url?: string; headers?: Record<string, string | string[]> }) {
        super();
        this.method = init.method;
        this.url = init.url;
        this.headers = { host: 'localhost:3000', authorization: `Bearer ${TEST_TOKEN}`, ...(init.headers ?? {}) };
    }

    send(body?: string) {
        queueMicrotask(() => {
            if (body) {
                this.emit('data', body);
            }
            this.emit('end');
        });
    }
}

class MockResponse {
    statusCode?: number;
    headers?: Record<string, number | string>;
    body?: string;
    headersSent = false;
    readonly finished: Promise<void>;
    private resolveFinished?: () => void;

    constructor() {
        this.finished = new Promise((resolve) => {
            this.resolveFinished = resolve;
        });
    }

    writeHead(status: number, headers: Record<string, number | string>) {
        this.statusCode = status;
        this.headers = headers;
        this.headersSent = true;
    }

    end(body?: string) {
        this.body = body;
        this.resolveFinished?.();
    }
}

const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

const baseConfig: EnvironmentConfig = {
    capabilityProfile: 'safe-read',
    baseUrl: 'https://controller.local',
    clientId: 'client-id',
    clientSecret: 'secret',
    omadacId: 'omadac',
    strictSsl: true,
    requestTimeout: 5000,
    logLevel: 'info',
    logFormat: 'plain',
    useHttp: true,
    unsafeEnableHttp: true,
    httpTransport: 'stream',
    httpEnableHealthcheck: true,
    httpAllowCors: true,
    httpNgrokEnabled: false,
    httpBearerToken: TEST_TOKEN,
};

describe('startHttpServer', () => {
    let processOnSpy: ReturnType<typeof vi.spyOn>;
    const getSignalHandler = (signal: ProcessOnArgs[0]) => {
        const calls = processOnSpy.mock.calls as ProcessOnArgs[];
        const match = calls.find(([registered]) => registered === signal);
        return match?.[1] as (() => void) | undefined;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    });

    afterEach(() => {
        processOnSpy.mockRestore();
    });

    it('handles health check and stream transport requests', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');
        await startHttpServer(baseConfig);
        const handler = httpModule.getHandler();
        expect(handler).toBeDefined();

        const healthReq = new MockRequest({ method: 'GET', url: '/healthz' });
        const healthRes = new MockResponse();
        handler!(healthReq as never, healthRes as never);
        healthReq.send();
        await healthRes.finished;
        expect(healthRes.statusCode).toBe(200);

        const streamReq = new MockRequest({ method: 'POST', url: '/mcp' });
        const streamRes = new MockResponse();
        handler!(streamReq as never, streamRes as never);
        streamReq.send('{"jsonrpc":"2.0"}');
        await flushTasks();
        expect(streamModule.handleStreamRequest).toHaveBeenCalled();
        const streamCallArgs = streamModule.handleStreamRequest.mock.calls[0] as unknown[];
        const sessionMapArg = streamCallArgs[5];
        expect(sessionMapArg).toBeInstanceOf(Map);
    });

    it('handles invalid URLs and not found paths', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');
        await startHttpServer(baseConfig);
        const handler = httpModule.getHandler();
        expect(handler).toBeDefined();

        const invalidReq = new MockRequest({ method: 'GET', url: undefined } as never);
        const invalidRes = new MockResponse();
        handler!(invalidReq as never, invalidRes as never);
        await invalidRes.finished;
        expect(invalidRes.statusCode).toBe(400);

        const notFoundReq = new MockRequest({ method: 'GET', url: '/unknown' });
        const notFoundRes = new MockResponse();
        handler!(notFoundReq as never, notFoundRes as never);
        notFoundReq.send();
        await notFoundRes.finished;
        expect(notFoundRes.statusCode).toBe(404);
    });

    it('warns that ngrok is ignored in the safe baseline', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');
        await startHttpServer({ ...baseConfig, httpNgrokEnabled: true });
        expect(loggerModule.warn).toHaveBeenCalledWith(
            'MCP_HTTP_NGROK_ENABLED is ignored in the safe baseline. Public tunnel support is intentionally disabled.'
        );
    });

    it('handles handler failures and client errors gracefully', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');
        streamModule.handleStreamRequest.mockRejectedValueOnce(new Error('connect-fail'));
        await startHttpServer(baseConfig);
        const handler = httpModule.getHandler();
        expect(handler).toBeDefined();

        const failingReq = new MockRequest({ method: 'POST', url: '/mcp' });
        const failingRes = new MockResponse();
        handler!(failingReq as never, failingRes as never);
        failingReq.send('{}');
        await failingRes.finished;
        expect(failingRes.statusCode).toBe(500);

        const socket = { end: vi.fn() };
        httpModule.emit('clientError', new Error('bad-request'), socket);
        expect(socket.end).toHaveBeenCalledWith('HTTP/1.1 400 Bad Request\r\n\r\n');
    });

    it('does not establish ngrok tunnels even when legacy settings are present', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');
        await startHttpServer({
            ...baseConfig,
            httpNgrokEnabled: true,
            httpNgrokAuthToken: 'token-123',
            httpBindAddr: '0.0.0.0',
        });

        expect(ngrokModule.forward).not.toHaveBeenCalled();
        const listeningCall = loggerModule.info.mock.calls.find((call) => call[0] === 'HTTP server listening');
        expect(listeningCall?.[1]).toEqual(expect.objectContaining({ endpoint: expect.stringContaining('http://localhost:3000') }));
    });

    it('closes stream sessions on shutdown signals', async () => {
        const { startHttpServer } = await import('../../src/server/http.js');

        await startHttpServer(baseConfig);
        const handler = httpModule.getHandler();
        expect(handler).toBeDefined();

        const streamReq = new MockRequest({ method: 'POST', url: '/mcp' });
        const streamRes = new MockResponse();
        handler!(streamReq as never, streamRes as never);
        streamReq.send('{"jsonrpc":"2.0"}');
        await flushTasks();

        getSignalHandler('SIGTERM')?.();
        await flushTasks();
        await flushTasks();

        expect(httpModule.server.close).toHaveBeenCalled();
        expect(streamModule.closeAllStreamSessions).toHaveBeenCalled();
    });

    describe('request guards (lab-only transport)', () => {
        const send = async (init: { method?: string; url?: string; headers?: Record<string, string> }, body?: string) => {
            const { startHttpServer } = await import('../../src/server/http.js');
            await startHttpServer(baseConfig);
            const handler = httpModule.getHandler();
            const req = new MockRequest({ method: 'POST', url: '/mcp', ...init });
            const res = new MockResponse();
            handler!(req as never, res as never);
            req.send(body);
            await res.finished;
            return res;
        };

        it('rejects requests without a bearer token before reading the body', async () => {
            const res = await send({ headers: { authorization: '' } }, '{"jsonrpc":"2.0"}');
            expect(res.statusCode).toBe(401);
            expect(res.headers).toMatchObject({ 'WWW-Authenticate': 'Bearer' });
            expect(streamModule.handleStreamRequest).not.toHaveBeenCalled();
        });

        it('rejects a wrong bearer token, including one sharing the expected prefix', async () => {
            expect((await send({ headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
            expect((await send({ headers: { authorization: `Bearer ${TEST_TOKEN}x` } })).statusCode).toBe(401);
            expect((await send({ headers: { authorization: TEST_TOKEN } })).statusCode).toBe(401);
            expect(streamModule.handleStreamRequest).not.toHaveBeenCalled();
        });

        it('rejects Host headers outside the loopback allowlist (DNS rebinding)', async () => {
            const res = await send({ headers: { host: 'attacker.example:3000' } });
            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body ?? '{}')).toEqual({ error: 'Host not allowed.' });
            expect(streamModule.handleStreamRequest).not.toHaveBeenCalled();
        });

        it('rejects a disallowed Origin even with a valid token', async () => {
            const res = await send({ headers: { origin: 'https://evil.example' } });
            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body ?? '{}')).toEqual({ error: 'Origin not allowed.' });
        });

        it('accepts a loopback Origin with a valid token', async () => {
            const { startHttpServer } = await import('../../src/server/http.js');
            await startHttpServer(baseConfig);
            const handler = httpModule.getHandler();
            const req = new MockRequest({ method: 'POST', url: '/mcp', headers: { origin: 'http://localhost:3000' } });
            handler!(req as never, new MockResponse() as never);
            req.send('{"jsonrpc":"2.0"}');
            await flushTasks();
            expect(streamModule.handleStreamRequest).toHaveBeenCalled();
        });

        it('returns 413 for a declared Content-Length above the cap', async () => {
            const { MAX_HTTP_BODY_BYTES } = await import('../../src/server/http.js');
            const res = await send({ headers: { 'content-length': String(MAX_HTTP_BODY_BYTES + 1) } });
            expect(res.statusCode).toBe(413);
            expect(streamModule.handleStreamRequest).not.toHaveBeenCalled();
        });

        it('returns 413 when a streamed body exceeds the cap without a Content-Length', async () => {
            const { MAX_HTTP_BODY_BYTES } = await import('../../src/server/http.js');
            const res = await send({}, 'x'.repeat(MAX_HTTP_BODY_BYTES + 1));
            expect(res.statusCode).toBe(413);
            expect(streamModule.handleStreamRequest).not.toHaveBeenCalled();
        });

        it('keeps the health check reachable without a token but still checks Host', async () => {
            expect((await send({ method: 'GET', url: '/healthz', headers: { authorization: '' } })).statusCode).toBe(200);
            expect((await send({ method: 'GET', url: '/healthz', headers: { host: 'evil.example:3000' } })).statusCode).toBe(403);
        });
    });
});
