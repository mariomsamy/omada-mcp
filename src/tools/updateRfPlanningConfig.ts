// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, objectPayloadSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: z
        .object({
            mode: z.union([z.literal(0), z.literal(1)]).describe('0: auto configuration, 1: custom configuration.'),
            customSetting: objectPayloadSchema(
                'Custom deploy settings (required by the controller when mode is 1).',
                OPENAPI_BODY_KEYS.rfPlanningCustomSetting
            ).optional(),
        })
        .strict()
        .describe('modifyRFPlanningDeployConfig request body.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateRfPlanningConfigTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateRfPlanningConfig',
        {
            description:
                'Modify the RF planning deploy configuration (auto or custom channel/width/band/power deployment) through the official Omada Open API. The preview reads the current RF planning configuration first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateRfPlanningConfig',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'update-rf-planning-config',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned RF planning config update for ${target}.`
                            : `Requested RF planning config update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getRadioFrequencyPlanningConfig(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.updateRfPlanningConfig(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
