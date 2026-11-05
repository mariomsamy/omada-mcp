// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { poeScheduleSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    schedule: poeScheduleSchema.describe('PoE schedule definition per the official Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreatePoeScheduleTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createPoeSchedule',
        {
            description: 'Create a site PoE schedule through the official Omada Open API. The schedule powers PoE ports off outside the time range.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'createPoeSchedule',
            ({ schedule, siteId }, result, mode) => {
                const target = schedule.name;
                return {
                    action: 'create-poe-schedule',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned PoE schedule creation for ${target}.` : `Requested PoE schedule creation for ${target}.`,
                    result,
                };
            },
            async ({ schedule, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: schedule };
                }
                const applied = await client.createPoeSchedule(schedule, siteId, customHeaders);
                return applied;
            }
        )
    );
}
