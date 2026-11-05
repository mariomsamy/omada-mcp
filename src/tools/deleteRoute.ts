// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { requireExistingRecord, resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    staticRoutingId: resourceIdSchema('staticRoutingId').describe('Static route ID to delete.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerDeleteRouteTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'deleteRoute',
        {
            description:
                'Delete an existing static route through the official Omada Open API. The Static route ID must exist (preflight) and the preview shows the record that would be removed.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'deleteRoute',
            ({ siteId, staticRoutingId }, result, mode) => {
                const target = staticRoutingId;
                return {
                    action: 'delete-static-route',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned static route deletion for ${target}.` : `Requested static route deletion for ${target}.`,
                    result,
                };
            },
            async ({ staticRoutingId, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.listStaticRoutes(siteId, customHeaders), staticRoutingId, 'Static route', [
                    'id',
                ]);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before };
                }
                const applied = await client.deleteStaticRouting(staticRoutingId, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
