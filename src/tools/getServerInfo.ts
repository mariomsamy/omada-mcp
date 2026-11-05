// Ported from realtydev/omada-mcp (MIT, see NOTICE.md). Local-only: reports this MCP server build, never calls the controller.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import packageMetadata from '../../package.json' with { type: 'json' };

import type { OmadaClient } from '../omadaClient/index.js';
import { toToolResult, wrapToolHandler } from '../server/common.js';

const inputSchema = z.object({});

export function registerGetServerInfoTool(server: McpServer, _client: OmadaClient): void {
    server.registerTool(
        'getServerInfo',
        {
            description:
                'Report the package name and version of this running MCP server process and its Node.js runtime. Local only: no controller request is made. Use it after a reconnect to confirm which build is serving tools.',
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('getServerInfo', () =>
            Promise.resolve(toToolResult({ name: packageMetadata.name, version: packageMetadata.version, nodeVersion: process.version }))
        )
    );
}
