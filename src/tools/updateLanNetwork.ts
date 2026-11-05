// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, requireExistingRecord, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    networkId: resourceIdSchema('networkId').describe('LAN network ID to update.'),
    payload: strictPayload(
        {
            name: z.string().min(1).max(128),
            purpose: z.union([z.literal(0), z.literal(1)]).describe('0: VLAN, 1: interface.'),
        },
        OPENAPI_BODY_KEYS.lanNetwork
    ).describe(
        'LAN network (v2 createLanNetworkV2/modifyLanNetworkV2) request body per the official Omada Open API schema; nested fields are validated by the controller.'
    ),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateLanNetworkTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateLanNetwork',
        {
            description:
                'Update an existing LAN network through the official Omada Open API. The LAN network ID must exist (preflight) and the preview shows the current record.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateLanNetwork',
            ({ networkId, siteId }, result, mode) => {
                const target = networkId;
                return {
                    action: 'update-lan-network',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned LAN network update for ${target}.` : `Requested LAN network update for ${target}.`,
                    result,
                };
            },
            async ({ networkId, payload, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.getLanNetworkList(siteId, customHeaders), networkId, 'LAN network', ['id']);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyLanNetwork(networkId, payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
