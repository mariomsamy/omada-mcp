import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { customHeadersSchema, toToolResult, wrapToolHandler } from '../server/common.js';
import { ONE_DAY_SECONDS, optionalTimeWindowShape, resolveTimeWindow } from '../utils/timeWindow.js';

export function registerGetTopThreatsTool(server: McpServer, client: OmadaClient): void {
    const inputSchema = z.object({
        ...optionalTimeWindowShape,
        customHeaders: customHeadersSchema,
    });

    server.registerTool(
        'getTopThreats',
        {
            description:
                'Get the top 5 threats from the global threat management view across all sites. Optional start/end (Unix seconds) select the time range; the default is the last 24 hours.',
            inputSchema: inputSchema.shape,
        },
        wrapToolHandler('getTopThreats', async ({ customHeaders, start, end }) =>
            toToolResult(await client.getTopThreats(customHeaders, resolveTimeWindow(start, end, ONE_DAY_SECONDS)))
        )
    );
}
