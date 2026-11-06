import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardTopMemoryUsageTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardTopMemoryUsage',
        {
            description:
                'Get the top devices by memory usage for a site, useful for identifying memory-constrained devices. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardTopMemoryUsage', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardTopMemoryUsage(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
