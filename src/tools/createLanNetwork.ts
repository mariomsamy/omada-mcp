// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_NESTED_KEYS } from '../utils/openapiNestedKeys.js';
import { OPENAPI_BODY_KEYS, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: strictPayload(
        {
            name: z.string().min(1).max(128),
            purpose: z.union([z.literal(0), z.literal(1)]).describe('0: VLAN, 1: interface.'),
        },
        OPENAPI_BODY_KEYS.lanNetwork,
        OPENAPI_NESTED_KEYS.lanNetwork
    ).describe(
        'LAN network (v2 createLanNetworkV2/modifyLanNetworkV2) request body per the official Omada Open API schema; nested fields are validated by the controller.'
    ),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreateLanNetworkTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createLanNetwork',
        {
            description: 'Create a LAN network through the official Omada Open API with dry-run preview.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'createLanNetwork',
            ({ payload, siteId }, result, mode) => {
                const target = String(payload.name);
                return {
                    action: 'create-lan-network',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned LAN network creation for ${target}.` : `Requested LAN network creation for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: payload };
                }
                const applied = await client.createLanNetwork(payload, siteId, customHeaders);
                return applied;
            }
        )
    );
}
