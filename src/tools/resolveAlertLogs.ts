// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { assertBroadSelectionConfirmed, logSelectionSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    selection: logSelectionSchema.describe('Which alert logs to resolve within the time window.'),
    confirmBroadSelection: z.boolean().default(false).describe('Must be true to apply an exclude/all selection.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerResolveAlertLogsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'resolveAlertLogs',
        {
            description:
                'Mark site alert logs as resolved through the official Omada Open API. Broad selections (exclude/all) additionally require confirmBroadSelection.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'resolveAlertLogs',
            ({ selection, siteId }, result, mode) => {
                const target = selection.selectType;
                return {
                    action: 'resolve-alert-logs',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned alert log resolution for ${target}.` : `Requested alert log resolution for ${target}.`,
                    result,
                };
            },
            async ({ selection, confirmBroadSelection, siteId, customHeaders, dryRun }) => {
                assertBroadSelectionConfirmed(selection, confirmBroadSelection || dryRun);
                if (dryRun) {
                    return { accepted: true, dryRun: true, selection };
                }
                const applied = await client.resolveSiteAlerts(selection, siteId, customHeaders);
                return applied;
            }
        )
    );
}
