import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_HOUR_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetDashboardWifiSummaryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getDashboardWifiSummary',
        {
            description:
                'Get WiFi summary for a site dashboard: total APs, connected AP count, wireless client count, channel utilization per band (2.4GHz/5GHz), and SSID count. Optional start/end (Unix seconds) select the time range; the default is the last hour.',
            inputSchema: siteInputSchema.extend(optionalTimeWindowShape).shape,
        },
        wrapToolHandler('getDashboardWifiSummary', async ({ siteId, customHeaders, start, end }) =>
            toToolResult(await client.getDashboardWifiSummary(siteId, customHeaders, resolveTimeWindow(start, end, ONE_HOUR_SECONDS)))
        )
    );
}
