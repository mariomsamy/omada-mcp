// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { deviceMacSchema, siteInputSchema, wrapMutationToolHandler } from '../server/common.js';

const inputSchema = siteInputSchema.extend({
    switchMac: deviceMacSchema.describe('Switch MAC address.'),
    ports: z
        .array(z.number().int().min(1).max(512))
        .min(1)
        .max(64)
        .refine((ports) => new Set(ports).size === ports.length, 'Ports must be unique.')
        .describe('Explicit, unique switch port numbers to test. No wildcards.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerStartCableTestTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'startCableTest',
        {
            description:
                'Start a cable diagnostic test on explicit switch ports through the official Omada Open API. Testing can briefly interrupt link on the tested ports.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'startCableTest',
            ({ siteId, switchMac }, result, mode) => {
                const target = switchMac;
                return {
                    action: 'start-cable-test',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned cable test for ${target}.` : `Requested cable test for ${target}.`,
                    result,
                };
            },
            async ({ switchMac, ports, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, switchMac, ports };
                }
                const applied = await client.startCableTest(switchMac, ports, siteId, customHeaders);
                return applied;
            }
        )
    );
}
