// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, toToolResult, wrapToolHandler } from '../server/common.js';

export function registerGetWlanExperienceIndexTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'getWlanExperienceIndex',
        {
            description:
                'Get the site WLAN experience index (before/after scores of recent WLAN optimization scans) through the official Omada Open API.',
            inputSchema: siteInputSchema.shape,
        },
        wrapToolHandler('getWlanExperienceIndex', async ({ siteId, customHeaders }) =>
            toToolResult(await client.getExperienceIndex(siteId, customHeaders))
        )
    );
}
