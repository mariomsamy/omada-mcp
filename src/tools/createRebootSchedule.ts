// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { rebootScheduleSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    schedule: rebootScheduleSchema.describe('reboot schedule definition per the official Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreateRebootScheduleTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createRebootSchedule',
        {
            description: 'Create a site reboot schedule through the official Omada Open API. The schedule schedules device reboots.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'createRebootSchedule',
            ({ schedule, siteId }, result, mode) => {
                const target = schedule.name;
                return {
                    action: 'create-reboot-schedule',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run' ? `Planned reboot schedule creation for ${target}.` : `Requested reboot schedule creation for ${target}.`,
                    result,
                };
            },
            async ({ schedule, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: schedule };
                }
                const applied = await client.createRebootSchedule(schedule, siteId, customHeaders);
                return applied;
            }
        )
    );
}
