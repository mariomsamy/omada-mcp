import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import type { OmadaClient } from '../../src/omadaClient/index.js';
import { registerGetServerInfoTool } from '../../src/tools/getServerInfo.js';

describe('tools/getServerInfo', () => {
    it('reports the local package version without calling the controller', async () => {
        let handler: ((args: unknown, extra: { sessionId?: string }) => Promise<CallToolResult>) | undefined;
        const server = {
            registerTool: vi.fn((_name, _config, registered) => {
                handler = registered;
            }),
        } as unknown as McpServer;
        const client = new Proxy({}, { get: () => vi.fn() }) as unknown as OmadaClient;
        registerGetServerInfoTool(server, client);

        expect(server.registerTool).toHaveBeenCalledWith('getServerInfo', expect.any(Object), expect.any(Function));
        const result = await handler?.({}, { sessionId: 's1' });
        expect(result?.structuredContent).toEqual({ name: packageMetadata.name, version: packageMetadata.version, nodeVersion: process.version });
    });
});
