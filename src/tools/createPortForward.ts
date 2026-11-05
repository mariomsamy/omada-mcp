// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: strictPayload(
        {
            name: z.string().min(1).max(64),
            status: z.boolean(),
            forwardIp: z.string().ip({ version: 'v4' }),
            dMZ: z.boolean().describe('DMZ opens all ports to forwardIp; keep false unless intended.'),
        },
        OPENAPI_BODY_KEYS.portForwarding
    ).describe('Port forwarding request body per the official Omada Open API schema; nested fields are validated by the controller.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreatePortForwardTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createPortForward',
        {
            description: 'Create a NAT port forwarding rule through the official Omada Open API with dry-run preview.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'createPortForward',
            ({ payload, siteId }, result, mode) => {
                const target = String(payload.name);
                return {
                    action: 'create-port-forward',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned NAT port forwarding rule creation for ${target}.`
                            : `Requested NAT port forwarding rule creation for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: payload };
                }
                const applied = await client.createPortForwarding(payload, siteId, customHeaders);
                return applied;
            }
        )
    );
}
