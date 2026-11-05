// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { createPaginationSchema } from '../utils/pagination-schema.js';

const inputSchema = siteInputSchema.extend({
    ...createPaginationSchema(10),
});

export function registerListRfPlanningHistoryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'listRfPlanningHistory',
        {
            description: 'List RF planning (WLAN optimization) history entries for a site through the official Omada Open API.',
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('listRfPlanningHistory', async ({ page, pageSize, siteId, customHeaders }) =>
            toToolResult(await client.listRfPlanningHistory(page, pageSize, siteId, customHeaders))
        )
    );
}
