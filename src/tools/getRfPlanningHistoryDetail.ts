// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    historyId: resourceIdSchema('historyId').describe('Planning history ID from listRfPlanningHistory.'),
});

export function registerGetRfPlanningHistoryDetailTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getRfPlanningHistoryDetail',
        {
            description: 'Get the detail of one RF planning (WLAN optimization) history entry through the official Omada Open API.',
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('getRfPlanningHistoryDetail', async ({ historyId, siteId, customHeaders }) =>
            toToolResult(await client.getRfPlanningHistoryDetail(historyId, siteId, customHeaders))
        )
    );
}
