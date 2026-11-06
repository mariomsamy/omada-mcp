import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardMostActiveEapsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardMostActiveEaps',
        {
            description:
                'Get the most active access points (EAPs) in a site, sorted by traffic volume. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardMostActiveEaps', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardMostActiveEaps(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
