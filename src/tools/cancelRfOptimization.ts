// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCancelRfOptimizationTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'cancelRfOptimization',
        {
            description: 'Cancel a running WLAN (RF planning) optimization for a site through the official Omada Open API.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'cancelRfOptimization',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'cancel-rf-optimization',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned WLAN optimization cancellation for ${target}.`
                            : `Requested WLAN optimization cancellation for ${target}.`,
                    result,
                };
            },
            async ({ siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true };
                }
                const applied = await client.cancelRfOptimization(siteId, customHeaders);
                return applied;
            }
        )
    );
}
