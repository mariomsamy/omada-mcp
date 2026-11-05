// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    switchMac: deviceMacSchema.describe('Switch MAC address.'),
    applyList: z
        .array(
            z
                .object({
                    id: resourceIdSchema('network id').describe('LAN network ID.'),
                    vlan: z.number().int().min(1).max(4094).describe('VLAN ID.'),
                    status: z.boolean().optional().describe('Enable status of the VLAN interface.'),
                })
                .strict()
        )
        .min(1)
        .max(256)
        .refine((list) => new Set(list.map((entry) => entry.id)).size === list.length, 'Network IDs must be unique.')
        .describe('Switch VLAN interfaces to apply.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerSetSwitchNetworksTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'setSwitchNetworks',
        {
            description:
                'Batch modify switch VLAN interfaces (network ID, VLAN and enable status) through the official Omada Open API. Changing management VLAN interfaces can cut off switch access.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'setSwitchNetworks',
            ({ siteId, switchMac }, result, mode) => {
                const target = switchMac;
                return {
                    action: 'set-switch-networks',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned switch VLAN interface update for ${target}.`
                            : `Requested switch VLAN interface update for ${target}.`,
                    result,
                };
            },
            async ({ switchMac, applyList, siteId, customHeaders, dryRun }) => {
                const before = await client.listSwitchNetworks(switchMac, 1, 1000, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: { applyList } };
                }
                const applied = await client.applySwitchNetworks(switchMac, applyList, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
