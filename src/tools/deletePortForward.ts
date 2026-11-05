// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    portForwardingId: resourceIdSchema('portForwardingId').describe('Port forwarding rule ID to delete.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeletePortForwardTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deletePortForward',
        {
            description:
                'Delete an existing NAT port forwarding rule through the official Omada Open API. The Port forwarding rule ID must exist (preflight) and the preview shows the record that would be removed.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deletePortForward',
            ({ portForwardingId, siteId }, result, mode) => {
                const target = portForwardingId;
                return {
                    action: 'delete-port-forward',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned NAT port forwarding rule deletion for ${target}.`
                            : `Requested NAT port forwarding rule deletion for ${target}.`,
                    result,
                };
            },
            async ({ portForwardingId, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(
                    () => client.listPortForwardingRules(siteId, customHeaders),
                    portForwardingId,
                    'Port forwarding rule',
                    ['id']
                );
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deletePortForwarding(portForwardingId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
