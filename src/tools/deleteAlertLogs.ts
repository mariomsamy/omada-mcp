// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { assertBroadSelectionConfirmed, logScopeSchema, logSelectionSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    scope: logScopeSchema,
    selection: logSelectionSchema.describe('Which logs to delete within the time window.'),
    confirmBroadSelection: z.boolean().default(false).describe('Must be true to apply an exclude/all selection.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeleteAlertLogsTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deleteAlertLogs',
        {
            description:
                'Permanently delete alert logs (site or global scope) through the official Omada Open API. Broad selections (exclude/all) additionally require confirmBroadSelection.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deleteAlertLogs',
            ({ scope, selection, siteId }, result, mode) => {
                const target = `${scope}:${selection.selectType}`;
                return {
                    action: 'delete-alert-logs',
                    target,
                    siteId: scope === 'site' ? siteId : undefined,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned alert log deletion for ${target}.` : `Requested alert log deletion for ${target}.`,
                    result,
                };
            },
            async ({ scope, selection, confirmBroadSelection, siteId, customHeaders, dryRun }) => {
                assertBroadSelectionConfirmed(selection, confirmBroadSelection || dryRun);
                if (dryRun) {
                    return { accepted: true, dryRun: true, scope, selection, requiresConfirmation: selection.selectType !== 'include' };
                }
                const applied = await (scope === 'global'
                    ? client.deleteGlobalLogs('alerts', selection, customHeaders)
                    : client.deleteSiteLogs('alerts', selection, siteId, customHeaders));
                return applied;
            }
        )
    );
}
