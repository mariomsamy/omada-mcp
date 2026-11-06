import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardTopCpuUsageTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardTopCpuUsage',
        {
            description:
                'Get the top devices by CPU usage for a site, useful for identifying overloaded devices. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardTopCpuUsage', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardTopCpuUsage(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
