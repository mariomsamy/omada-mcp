// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { diffFields, OPENAPI_BODY_KEYS, objectPayloadSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: z
        .object({ mesh: objectPayloadSchema('Mesh settings (MeshOpenApiVO).', OPENAPI_BODY_KEYS.mesh) })
        .strict()
        .describe('Request body per the official Omada Open API schema.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerUpdateMeshTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'updateMesh',
        {
            description:
                'Update the site mesh (changing mesh settings can disconnect wirelessly uplinked APs) setting through the official Omada Open API. The preview reads the current setting first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'updateMesh',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'update-mesh',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned mesh update for ${target}.` : `Requested mesh update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getMeshSetting(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload, diff: diffFields(before, payload) };
                }
                const applied = await client.updateMeshSetting(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
