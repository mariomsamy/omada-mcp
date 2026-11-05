// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';

export function registerListRebootSchedulesTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'listRebootSchedules',
        {
            description: 'List the site reboot schedules (sites/{siteId}/reboot-schedules) through the official Omada Open API.',
            inputSchema: siteInputSchema.shape,
        },
        wrapToolHandler('listRebootSchedules', async ({ siteId, customHeaders }) =>
            toToolResult(await client.listSiteRebootSchedules(siteId, customHeaders))
        )
    );
}
