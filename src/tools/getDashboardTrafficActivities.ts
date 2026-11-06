import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardTrafficActivitiesTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardTrafficActivities',
        {
            description:
                'Get traffic activity time-series data for a site, showing upload and download trends over time. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardTrafficActivities', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardTrafficActivities(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
