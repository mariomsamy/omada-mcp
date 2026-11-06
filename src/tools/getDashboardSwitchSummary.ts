import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardSwitchSummaryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardSwitchSummary',
        {
            description:
                'Get switch summary for a site dashboard: total switch count, total ports, active ports, PoE budget used vs available, and aggregate bandwidth. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardSwitchSummary', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardSwitchSummary(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
