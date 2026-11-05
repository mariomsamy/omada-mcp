// Ported from sibling MIT-licensed Omada MCP projects (see NOTICE.md); route re-verified against docs/openapi.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { OmadaClient } from '../omadaClient/index.js';
import { siteInputSchema, wrapMutationToolHandler } from '../server/common.js';
import { resourceIdSchema } from './portedToolShared.js';

const inputSchema = siteInputSchema.extend({
    payload: z
        .object({
            enable: z.boolean().describe('Whether IDS/IPS is enabled.'),
            ipsMode: z
                .union([z.literal(0), z.literal(1)])
                .optional()
                .describe('0: detect only, 1: detect and block.'),
            geoEnable: z.boolean().optional(),
            dpLevel: z.number().int().min(0).max(3).optional().describe('0: low, 1: medium, 2: high, 3: custom.'),
            customCategories: z.array(z.number().int().min(0)).max(256).optional(),
            timeRangeId: resourceIdSchema('timeRangeId').optional(),
        })
        .strict()
        .describe('modifyIpsConfig request body.'),
    dryRun: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), return the planned change without sending it to the controller. Set false to apply.'),
});

export function registerSetIpsSettingTool(server: McpServer, client: OmadaClient): void {
    server.registerTool(
        'setIpsSetting',
        {
            description:
                'Modify the site IDS/IPS configuration through the official Omada Open API (modifyIpsConfig). The preview reads the current IDS/IPS configuration first.',
            inputSchema: inputSchema.shape,
            annotations: {
                destructiveHint: true,
            },
        },
        wrapMutationToolHandler(
            'setIpsSetting',
            ({ siteId }, result, mode) => {
                const target = siteId ?? 'default-site';
                return {
                    action: 'set-ips-setting',
                    target,
                    siteId,
                    mode,
                    status: mode === 'dry-run' ? 'planned' : 'applied',
                    summary: mode === 'dry-run' ? `Planned IDS/IPS update for ${target}.` : `Requested IDS/IPS update for ${target}.`,
                    result,
                };
            },
            async ({ payload, siteId, customHeaders, dryRun }) => {
                const before = await client.getIpsConfig(siteId, customHeaders);
                if (dryRun) {
                    return { accepted: true, dryRun: true, before, plannedConfig: payload };
                }
                const applied = await client.modifyIpsConfig(payload, siteId, customHeaders);
                return { before, applied };
            }
        )
    );
}
