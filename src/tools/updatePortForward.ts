// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_NESTED_KEYS } from '../utils/openapiNestedKeys.js';
import { OPENAPI_BODY_KEYS, requireExistingRecord, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    portForwardingId: resourceIdSchema('portForwardingId').describe('Port forwarding rule ID to update.'),
    payload: strictPayload(
        {
            name: z.string().min(1).max(64),
            status: z.boolean(),
            forwardIp: z.ipv4(),
            dMZ: z.boolean().describe('DMZ opens all ports to forwardIp; keep false unless intended.'),
        },
        OPENAPI_BODY_KEYS.portForwarding,
        OPENAPI_NESTED_KEYS.portForwarding
    ).describe('Port forwarding request body per the official Omada Open API schema; nested fields are validated by the controller.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdatePortForwardTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updatePortForward',
        {
            description:
                'Update an existing NAT port forwarding rule through the official Omada Open API. The Port forwarding rule ID must exist (preflight) and the preview shows the current record.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updatePortForward',
            ({ portForwardingId, siteId }, result, mode) => {
                const target = portForwardingId;
                return {
                    action: 'update-port-forward',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned NAT port forwarding rule update for ${target}.`
                            : `Requested NAT port forwarding rule update for ${target}.`,
                    result,
                };
            },
            async ({ portForwardingId, payload, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(
                    () => client.listPortForwardingRules(siteId, customHeaders),
                    portForwardingId,
                    'Port forwarding rule',
                    ['id']
                );
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyPortForwarding(portForwardingId, payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
