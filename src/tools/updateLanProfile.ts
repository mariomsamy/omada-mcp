// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { OPENAPI_NESTED_KEYS } from '../utils/openapiNestedKeys.js';
import { OPENAPI_BODY_KEYS, requireExistingRecord, resourceIdSchema, specNameSchema, strictPayload } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    profileId: resourceIdSchema('profileId').describe('LAN profile ID to update.'),
    payload: strictPayload(
        {
            name: specNameSchema,
            poe: z.union([z.literal(0), z.literal(1), z.literal(2)]).describe('0: on, 1: off, 2: do not modify.'),
            nativeNetworkId: resourceIdSchema('nativeNetworkId'),
        },
        OPENAPI_BODY_KEYS.lanProfile,
        OPENAPI_NESTED_KEYS.lanProfile
    ).describe('LAN profile request body per the official Omada Open API schema; nested fields are validated by the controller.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateLanProfileTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateLanProfile',
        {
            description:
                'Update an existing LAN (switch port) profile through the official Omada Open API. The LAN profile ID must exist (preflight) and the preview shows the current record.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateLanProfile',
            ({ profileId, siteId }, result, mode) => {
                const target = profileId;
                return {
                    action: 'update-lan-profile',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary:
                        mode === 'dry-run'
                            ? `Planned LAN (switch port) profile update for ${target}.`
                            : `Requested LAN (switch port) profile update for ${target}.`,
                    result,
                };
            },
            async ({ profileId, payload, siteId, customHeaders, dryRun }) => {
                const before = await requireExistingRecord(() => client.getLanProfileList(siteId, customHeaders), profileId, 'LAN profile', ['id']);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyLanProfile(profileId, payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
