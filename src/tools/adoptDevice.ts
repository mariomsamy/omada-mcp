// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    deviceMac: deviceMacSchema.describe('MAC address of the pending device to adopt.'),
    username: z.string().min(1).max(64).optional().describe('Device username when the device is not using default credentials.'),
    password: z.string().min(1).max(64).optional().describe('Device password when the device is not using default credentials. Never echoed.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerAdoptDeviceTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'adoptDevice',
        {
            description:
                'Start adopting a pending device through the official Omada Open API start-adopt route. Optional device credentials are sent only on apply and are never echoed.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'adoptDevice',
            ({ deviceMac, siteId }, result, mode) => {
                const target = deviceMac;
                return {
                    action: 'adopt-device',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned device adoption for ${target}.` : `Requested device adoption for ${target}.`,
                    result,
                };
            },
            async ({ deviceMac, username, password, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, deviceMac, credentialsProvided: username !== undefined || password !== undefined };
                }
                const applied = await client.adoptDevice(
                    deviceMac,
                    username !== undefined || password !== undefined ? { username, password } : undefined,
                    siteId,
                    customHeaders
                );
                return applied;
            }
        )
    );
}
