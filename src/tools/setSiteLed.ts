// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    enable: z.boolean().describe('Whether device LEDs are enabled site-wide.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerSetSiteLedTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'setSiteLed',
        {
            description:
                'Enable or disable the site-wide device LED setting through the official Omada Open API. The preview reads the current setting first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'setSiteLed',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'set-site-led',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned site LED update for ${target}.` : `Requested site LED update for ${target}.`,
                    result,
                };
            },
            async ({ enable, siteId, customHeaders, dryRun }) => {
                const before = await client.getLedSetting(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: { enable } };
                }
                const applied = await client.setSiteLedSetting(enable, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
