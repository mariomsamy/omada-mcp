// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_BODY_KEYS, resourceIdSchema, specNameSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: strictPayload(
        {
            name: specNameSchema,
            poe: z.union([z.literal(0), z.literal(1), z.literal(2)]).describe('0: on, 1: off, 2: do not modify.'),
            nativeNetworkId: resourceIdSchema('nativeNetworkId'),
        },
        OPENAPI_BODY_KEYS.lanProfile
    ).describe('LAN profile request body per the official Omada Open API schema; nested fields are validated by the controller.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerCreateLanProfileTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'createLanProfile',
        {
            description: 'Create a LAN (switch port) profile through the official Omada Open API with dry-run preview.',
            inputSchema: inputSchema.shape,
        },
        wrapMutationToolHandler(
            'createLanProfile',
            ({ payload, siteId }, result, mode) => {
                const target = String(payload.name);
                return {
                    action: 'create-lan-profile',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned LAN (switch port) profile creation for ${target}.`
                            : `Requested LAN (switch port) profile creation for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                if (dryRun) {
                    return { accepted: true, dryRun: true, plannedConfig: payload };
                }
                const applied = await client.createLanProfile(payload, siteId, customHeaders);
                return applied;
            }
        )
    );
}
