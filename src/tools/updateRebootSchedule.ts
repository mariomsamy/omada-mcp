// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { rebootScheduleSchema, requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    scheduleId: resourceIdSchema('scheduleId').describe('reboot schedule ID.'),
    schedule: rebootScheduleSchema.describe('Full reboot schedule definition.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateRebootScheduleTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateRebootSchedule',
        {
            description:
                'Replace an existing site reboot schedule through the official Omada Open API (PUT; send the full schedule). The schedule must exist (preflight).',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateRebootSchedule',
            ({ scheduleId, siteId }, result, mode) => {
                const target = scheduleId;
                return {
                    action: 'update-reboot-schedule',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned reboot schedule update for ${target}.` : `Requested reboot schedule update for ${target}.`,
                    result,
                };
            },
            async ({ scheduleId, schedule, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(
                    () => client.listSiteRebootSchedules(siteId, customHeaders),
                    scheduleId,
                    'Reboot schedule'
                );
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: schedule };
                }
                const applied = await client.modifyRebootSchedule(scheduleId, schedule, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
