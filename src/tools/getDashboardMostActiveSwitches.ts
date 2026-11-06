import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardMostActiveSwitchesTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardMostActiveSwitches',
        {
            description:
                'Get the most active switches in a site, sorted by traffic volume. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardMostActiveSwitches', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardMostActiveSwitches(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
