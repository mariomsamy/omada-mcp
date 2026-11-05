// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    poeScheduleId: resourceIdSchema('poeScheduleId').describe('PoE schedule ID.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeletePoeScheduleTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deletePoeSchedule',
        {
            description: 'Delete an existing site PoE schedule through the official Omada Open API. The schedule must exist (preflight).',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deletePoeSchedule',
            ({ poeScheduleId, siteId }, result, mode) => {
                const target = poeScheduleId;
                return {
                    action: 'delete-poe-schedule',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned PoE schedule deletion for ${target}.` : `Requested PoE schedule deletion for ${target}.`,
                    result,
                };
            },
            async ({ poeScheduleId, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.getPoeScheduleList(siteId, customHeaders), poeScheduleId, 'PoE schedule');
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deletePoeSchedule(poeScheduleId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
