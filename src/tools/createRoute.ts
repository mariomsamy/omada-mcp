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

export function registerCreateRouteTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createRoute',
        {
            description: 'Create a static route through the official Omada Open API with dry-run preview.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'createRoute',
            ({ payload, siteId }, result, mode) => {
                const target = String(payload.name);
                return {
                    action: 'create-static-route',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned static route creation for ${target}.` : `Requested static route creation for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: payload };
                }
                const applied = await client.createStaticRouting(payload, siteId, customHeaders);
                return applied;
            }
        )
    );
}
