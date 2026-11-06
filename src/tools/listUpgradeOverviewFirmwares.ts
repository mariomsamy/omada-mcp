import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { customHeadersSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { createPaginationSchema } from '../utils/pagination-schema.js';

const inputSchema = {
    ...createPaginationSchema(),
    channel: z
        .union([z.literal(0), z.literal(1), z.literal(2)])
        .optional()
        .describe('Firmware channel: 0 stable (default), 1 release candidate, 2 beta.'),
    customHeaders: customHeadersSchema,
};

export function registerListUpgradeOverviewFirmwaresTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'listUpgradeOverviewFirmwares',
        {
            description:
                'List the firmware pool in the upgrade overview: the latest firmware version the controller knows for each model, per channel.',
            inputSchema,
        },
        wrapToolHandler('listUpgradeOverviewFirmwares', async ({ page, pageSize, channel, customHeaders }) =>
            toToolResult(await client.listUpgradeOverviewFirmwares(page ?? 1, pageSize ?? 10, customHeaders, channel ?? 0))
        )
    );
}
