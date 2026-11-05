// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    historyId: resourceIdSchema('historyId').describe('Planning history ID from listRfPlanningHistory.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeleteRfPlanningHistoryTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deleteRfPlanningHistory',
        {
            description: 'Delete an RF planning history entry through the official Omada Open API. The preview reads the entry first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deleteRfPlanningHistory',
            ({ historyId, siteId }, result, mode) => {
                const target = historyId;
                return {
                    action: 'delete-rf-planning-history',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned RF planning history deletion for ${target}.`
                            : `Requested RF planning history deletion for ${target}.`,
                    result,
                };
            },
            async ({ historyId, siteId, customHeaders, dryRun }) => {
                const before = await client.getRfPlanningHistoryDetail(historyId, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deleteRfPlanningHistory(historyId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
