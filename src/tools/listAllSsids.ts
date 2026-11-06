import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';

export function registerListAllSsidsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'listAllSsids',
        {
            description:
                'List all wireless SSIDs across all WLAN groups in a site: SSID name, WLAN group, security mode (WPA2/WPA3), band steering, guest network flag, and enabled state.',
            inputSchema: siteInputSchema.extend({
                type: z
                    .union([z.literal(1), z.literal(2), z.literal(3)])
                    .default(3)
                    .describe('Device type filter: 1 = AP only, 2 = wireless router only, 3 = AP and wireless router (default).'),
            }).shape,
        },
        wrapToolHandler('listAllSsids', async ({ siteId, customHeaders, type }) =>
            toToolResult(await client.listAllSsids(siteId, customHeaders, type))
        )
    );
}
