import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { OmadaClient } from '../../src/omadaClient/index.js';
import { assertSafeSiteId } from '../../src/omadaClient/site.js';
import { deviceIdSchema, siteIdSchema, siteInputSchema } from '../../src/server/common.js';

const servers: Server[] = [];
afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.close(() => resolve());
                    server.closeAllConnections();
                })
        )
    );
});

/** Loopback stub controller that records every method and path it receives. */
async function stubController() {
    const calls: { method: string; path: string }[] = [];
    const server = createServer((req, res) => {
        const path = new URL(req.url ?? '/', 'http://stub.test').pathname;
        calls.push({ method: req.method ?? 'GET', path });
        res.setHeader('Content-Type', 'application/json');
        if (path === '/openapi/authorize/token') {
            res.end(JSON.stringify({ errorCode: 0, result: { accessToken: 'stub-token', expiresIn: 3600 } }));
            return;
        }
        res.end(JSON.stringify({ errorCode: 0, result: { data: [], totalRows: 0, currentPage: 1, currentSize: 0 } }));
    });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback address');
    const client = new OmadaClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        clientId: 'fixture-id',
        clientSecret: 'fixture-secret',
        omadacId: 'omadac',
        strictSsl: true,
    });
    return { calls, client, apiCalls: () => calls.filter((call) => call.path !== '/openapi/authorize/token') };
}

const TRAVERSAL_IDS = ['..', '.', 'a/b', '../logs', 'site?x=1', '%2e%2e', 'site#frag', 'a b', ''];

describe('site and path identifier safety', () => {
    it.each(TRAVERSAL_IDS)('rejects siteId %j in tool input schemas', (siteId) => {
        expect(siteIdSchema.safeParse(siteId).success).toBe(false);
        const parsed = z.object(siteInputSchema.shape).safeParse({ siteId });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(['siteId']);
    });

    it('accepts controller-generated site IDs', () => {
        expect(siteIdSchema.parse('5f9b1c2d3e4f5a6b7c8d9e0f')).toBe('5f9b1c2d3e4f5a6b7c8d9e0f');
        expect(siteIdSchema.parse('Default_site-1')).toBe('Default_site-1');
        expect(siteIdSchema.safeParse('x'.repeat(129)).success).toBe(false);
    });

    it.each(['..', '.', 'AA/BB', 'id?x'])('rejects path-like device identifier %j', (deviceId) => {
        expect(z.object(deviceIdSchema.shape).safeParse({ deviceId }).success).toBe(false);
    });

    it.each(['..', '.', 'a/b', 'x?y'])('assertSafeSiteId rejects %j', (siteId) => {
        expect(() => assertSafeSiteId(siteId)).toThrow('Invalid siteId');
    });

    it('never sends a request when siteId is ".." (site-scoped route cannot collapse to the global one)', async () => {
        const { client, apiCalls } = await stubController();
        await expect(
            client.deleteSiteLogs('alerts', { logs: [], selectType: 'all', startTime: 0, endTime: 1, filterModule: 'System' }, '..')
        ).rejects.toThrow('Invalid siteId');
        await expect(client.deleteLanNetwork('net1', '.')).rejects.toThrow('Invalid siteId');
        await expect(client.getLanNetworkList('..')).rejects.toThrow('Invalid siteId');
        await expect(client.getLanNetworkList('a/b')).rejects.toThrow('Invalid siteId');
        await expect(client.getLanNetworkList('x?y=1')).rejects.toThrow('Invalid siteId');
        expect(apiCalls()).toEqual([]);
    });

    it('refuses to build a path with a dot segment from any other identifier', async () => {
        const { client, apiCalls } = await stubController();
        await expect(client.deleteLanNetwork('..', 'site-1')).rejects.toThrow('"." or ".." segments');
        await expect(client.deleteLanNetwork('.', 'site-1')).rejects.toThrow('"." or ".." segments');
        expect(apiCalls()).toEqual([]);
    });

    it('keeps "/" and "?" inside a single encoded path segment', async () => {
        const { client, apiCalls } = await stubController();
        await client.deleteLanNetwork('a/b?c', 'site-1').catch(() => undefined);
        expect(apiCalls()).toEqual([{ method: 'DELETE', path: '/openapi/v1/omadac/sites/site-1/lan-networks/a%2Fb%3Fc' }]);
    });

    it('routes a valid site ID to the site-scoped path', async () => {
        const { client, apiCalls } = await stubController();
        await client.deleteSiteLogs('alerts', { logs: ['log-1'], selectType: 'include', startTime: 0, endTime: 1 }, 'site-1');
        expect(apiCalls()).toEqual([{ method: 'DELETE', path: '/openapi/v1/omadac/sites/site-1/logs/alerts/delete' }]);
    });
});
