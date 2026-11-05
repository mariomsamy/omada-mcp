// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    gatewayMac: deviceMacSchema.describe('Gateway MAC address.'),
    portId: z.number().int().min(0).max(512).describe('WAN port ID from getGatewayWanStatus.'),
    connect: z.boolean().describe('true to connect (open) the WAN, false to disconnect (close) it.'),
    virtualWanId: resourceIdSchema('virtualWanId').optional().describe('Virtual WAN ID when operating a virtual WAN.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerSetGatewayWanConnectTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'setGatewayWanConnect',
        {
            description:
                'Connect or disconnect a gateway WAN port (or virtual WAN) through the official Omada Open API internet-state route. Disconnecting a WAN can take the site offline. The preview reads the current WAN status first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'setGatewayWanConnect',
            ({ gatewayMac, portId, siteId }, result, mode) => {
                const target = `${gatewayMac} port ${portId}`;
                return {
                    action: 'set-gateway-wan-connect',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned WAN connection change for ${target}.` : `Requested WAN connection change for ${target}.`,
                    result,
                };
            },
            async ({ gatewayMac, portId, connect, virtualWanId, siteId, customHeaders, dryRun }) => {
                const before = await client.getGatewayWanStatus(gatewayMac, siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: { portId, operation: connect ? 1 : 0, virtualWanId } };
                }
                const applied = await client.changeGatewayInternetState(
                    gatewayMac,
                    { portId, operation: connect ? 1 : 0, ...(virtualWanId ? { virtualWanId } : {}) },
                    siteId,
                    customHeaders
                );
                return { before, applied };
            }
        )
    );
}
