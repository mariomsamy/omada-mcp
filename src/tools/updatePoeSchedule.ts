// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { diffFields, poeScheduleSchema, requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    poeScheduleId: resourceIdSchema('poeScheduleId').describe('PoE schedule ID.'),
    schedule: poeScheduleSchema.describe('Full PoE schedule definition.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdatePoeScheduleTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updatePoeSchedule',
        {
            description:
                'Replace an existing site PoE schedule through the official Omada Open API (PUT; send the full schedule). The schedule must exist (preflight).',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updatePoeSchedule',
            ({ poeScheduleId, siteId }, result, mode) => {
                const target = poeScheduleId;
                return {
                    action: 'update-poe-schedule',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned PoE schedule update for ${target}.` : `Requested PoE schedule update for ${target}.`,
                    result,
                };
            },
            async ({ poeScheduleId, schedule, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.getPoeScheduleList(siteId, customHeaders), poeScheduleId, 'PoE schedule');
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: schedule, diff: diffFields(before, schedule) };
                }
                const applied = await client.modifyPoeSchedule(poeScheduleId, schedule, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
