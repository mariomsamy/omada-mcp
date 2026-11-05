// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, objectPayloadSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: z
        .object({ roaming: objectPayloadSchema('Roaming settings (RoamingOpenApiVO).', OPENAPI_BODY_KEYS.roaming) })
        .strict()
        .describe('Request body per the official Omada Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateRoamingTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateRoaming',
        {
            description:
                'Update the site roaming (fast roaming / AI roaming) setting through the official Omada Open API. The preview reads the current setting first.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateRoaming',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'update-roaming',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned roaming update for ${target}.` : `Requested roaming update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getRoamingSetting(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.updateRoamingSetting(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
