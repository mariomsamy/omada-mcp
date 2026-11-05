// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, objectPayloadSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: z
        .object({
            bandSteeringForMultiBand: objectPayloadSchema(
                'Band steering configuration (BandSteeringForMultiBandOpenApiVO).',
                OPENAPI_BODY_KEYS.bandSteering
            ),
        })
        .strict()
        .describe('Request body per the official Omada Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateBandSteeringTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateBandSteering',
        {
            description: 'Update the site band steering setting through the official Omada Open API. The preview reads the current setting first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateBandSteering',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'update-band-steering',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned band steering update for ${target}.` : `Requested band steering update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getBandSteeringSetting(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.updateBandSteeringSetting(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
