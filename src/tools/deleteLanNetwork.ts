// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    networkId: resourceIdSchema('networkId').describe('LAN network ID to delete.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeleteLanNetworkTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deleteLanNetwork',
        {
            description:
                'Delete an existing LAN network through the official Omada Open API. The LAN network ID must exist (preflight) and the preview shows the record that would be removed.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deleteLanNetwork',
            ({ networkId, siteId }, result, mode) => {
                const target = networkId;
                return {
                    action: 'delete-lan-network',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned LAN network deletion for ${target}.` : `Requested LAN network deletion for ${target}.`,
                    result,
                };
            },
            async ({ networkId, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.getLanNetworkList(siteId, customHeaders), networkId, 'LAN network', ['id']);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deleteLanNetwork(networkId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
