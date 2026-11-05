// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    historyId: resourceIdSchema('historyId').describe('Planning history ID from listRfPlanningHistory.'),
    appliedConfig: z.union([z.literal(1), z.literal(2)]).describe('1: apply the recommended config, 2: restore the previous config.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerApplyRfPlanningHistoryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'applyRfPlanningHistory',
        {
            description:
                'Apply the recommended or previous configuration of an RF planning history entry through the official Omada Open API. This changes AP radio settings. The preview reads the history entry first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'applyRfPlanningHistory',
            ({ historyId, siteId }, result, mode) => {
                const target = historyId;
                return {
                    action: 'apply-rf-planning-history',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned RF planning apply for ${target}.` : `Requested RF planning apply for ${target}.`,
                    result,
                };
            },
            async ({ historyId, appliedConfig, siteId, customHeaders, dryRun }) => {
                const before = await client.getRfPlanningHistoryDetail(historyId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: { appliedConfig } };
                }
                const applied = await client.applyRfPlanningHistory(historyId, appliedConfig, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
