// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { macAddressSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    clientMac: macAddressSchema.describe('Client MAC address.'),
    name: z
        .string()
        .min(1)
        .max(128)
        .regex(
            /^[^ +\-@=]$|^[^ +\-@=].{0,126}[^ ]$/,
            'Client name must be 1-128 characters, must not start with a space or + - @ = and must not end with a space.'
        )
        .describe('New client display name.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateClientTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateClient',
        {
            description:
                'Set the display name of a client through the official Omada Open API (updateClientName). Rate limits are managed by setClientRateLimit.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'updateClient',
            ({ clientMac, siteId }, result, mode) => {
                const target = clientMac;
                return {
                    action: 'update-client-name',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned client rename for ${target}.` : `Requested client rename for ${target}.`,
                    result,
                };
            },
            async ({ clientMac, name, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: { name } };
                }
                const applied = await client.updateClientName(clientMac, name, siteId, customHeaders);
                return applied;
            }
        )
    );
}
