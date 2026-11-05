// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, requireExistingRecord, resourceIdSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    staticRoutingId: resourceIdSchema('staticRoutingId').describe('Static route ID to update.'),
    payload: strictPayload(
        {
            name: z.string().min(1).max(64),
            status: z.boolean(),
            destinations: z.array(z.string().min(1)).min(1),
            routeType: z.union([z.literal(0), z.literal(1)]).describe('0: next hop, 1: interface.'),
            metric: z.number().int().min(0).max(15),
        },
        OPENAPI_BODY_KEYS.staticRouting
    ).describe('Static routing request body per the official Omada Open API schema; nested fields are validated by the controller.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateRouteTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateRoute',
        {
            description:
                'Update an existing static route through the official Omada Open API. The Static route ID must exist (preflight) and the preview shows the current record.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateRoute',
            ({ siteId, staticRoutingId }, result, mode) => {
                const target = staticRoutingId;
                return {
                    action: 'update-static-route',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned static route update for ${target}.` : `Requested static route update for ${target}.`,
                    result,
                };
            },
            async ({ staticRoutingId, payload, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.listStaticRoutes(siteId, customHeaders), staticRoutingId, 'Static route', [
                    'id',
                ]);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyStaticRouting(staticRoutingId, payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
