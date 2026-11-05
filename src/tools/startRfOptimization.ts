// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    optimizationStrategy: z.union([z.literal(0), z.literal(1)]).describe('0: global optimization, 1: optimization adjustment.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerStartRfOptimizationTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'startRfOptimization',
        {
            description:
                'Start WLAN (RF planning) optimization for a site through the official Omada Open API. Optimization can change AP channels, widths and power and briefly disconnect clients.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'startRfOptimization',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'start-rf-optimization',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run' ? `Planned WLAN optimization start for ${target}.` : `Requested WLAN optimization start for ${target}.`,
                    result,
                };
            },
            async ({ optimizationStrategy, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: { optimizationStrategy } };
                }
                const applied = await client.startRfOptimization(optimizationStrategy, siteId, customHeaders);
                return applied;
            }
        )
    );
}
